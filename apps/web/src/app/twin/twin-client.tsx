"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Activity, Cpu, FlaskConical, Microscope } from "lucide-react";

// Per-cycle feature definitions for the walkthrough small-multiples chart.
// These mirror packages/battery-twin/data_loaders/severson_parser.py and
// must stay in sync with what scripts/export_lstm_onnx.py emits.
const PER_CYCLE_FEATURES: Array<{ key: string; label: string; unit: string; description: string }> = [
  { key: "cycle_norm", label: "Cycle progress", unit: "0–1", description: "Linear position in the 100-cycle window" },
  { key: "qd_max", label: "Discharge capacity", unit: "Ah", description: "Peak discharge capacity in the cycle" },
  { key: "qd_min", label: "Min Qd", unit: "Ah", description: "Minimum capacity sample (baseline)" },
  { key: "v_mean", label: "Mean voltage", unit: "V", description: "Average voltage during the cycle" },
  { key: "v_std", label: "Voltage swing", unit: "V (std)", description: "Std-dev of voltage in the cycle" },
  { key: "t_max", label: "Peak temperature", unit: "°C", description: "Hottest point in the cycle" },
  { key: "duration_s", label: "Cycle duration", unit: "s", description: "Total wall-clock time of the cycle" },
];

interface Scenario {
  title: string;
  description: string;
  duration_s?: number;
  rack_power_kw?: number;
  transient_amplitude?: number;
  transient_period_s?: number;
  split_filter_tau_s?: number;
  series: Record<string, number[]>;
  stats: {
    v_cell_min?: number;
    v_cell_max?: number;
    v_cell_swing?: number;
    v_cell_pp_stable?: number;
    p_lfp_std_kw?: number;
    lic_peak_kw?: number;
    lic_peak_excursion_kj?: number;
    lic_throughput_kj?: number;
    lic_energy_kj_capacity?: number;
    lic_headroom_ratio?: number;
    [k: string]: number | null | undefined;
  };
  _meta?: Record<string, string>;
}

interface AgingScenario {
  title: string;
  description: string;
  series: { cycle: number[]; soh_full_cycling: number[]; soh_bbu_duty: number[] };
  stats: Record<string, number | null>;
}

interface ModelValidation {
  title: string;
  description: string;
  model: {
    architecture: string;
    n_parameters: number;
    input_shape: number[];
    feature_names: string[];
    onnx_size_kb: number;
    onnx_torch_max_diff: number;
  };
  metrics: {
    n_train: number;
    n_test: number;
    train_mape_pct: number;
    test_mape_pct: number;
    test_rmse_cycles: number;
    test_r2: number;
    split: string;
  };
  latency: {
    device: string;
    samples: number;
    p50_ms: number;
    p99_ms: number;
    target_ms: number;
    passes_target: boolean;
  };
  predicted_vs_actual: Array<{
    cell_id: string;
    batch: string;
    actual: number;
    predicted: number;
    split: "train" | "test";
  }>;
  walkthroughs?: Array<{
    cell_id: string;
    batch: string;
    label: string;
    actual: number;
    predicted: number;
    input_raw: number[][];        // (99, 7) features in original physical units
    hidden_activation: number[];  // (99,) mean |tanh activation| across 64 dims
    cumulative_pred: number[];    // (99,)
  }>;
}

export function TwinClient({
  lfpOnly,
  hybrid,
  aging,
  modelValidation,
}: {
  lfpOnly: Scenario;
  hybrid: Scenario;
  aging: AgingScenario;
  modelValidation: ModelValidation;
}) {
  const [mode, setMode] = useState<"lfp" | "hybrid">("hybrid");
  const active = mode === "hybrid" ? hybrid : lfpOnly;

  const chartData = useMemo(() => {
    const t = active.series.t;
    const v = active.series.v_cell;
    const p = active.series.p_total_kw;
    const pLfp = mode === "hybrid" ? active.series.p_lfp_kw : p;
    return t.map((time, i) => ({
      t: Number(time.toFixed(3)),
      v: Number(v[i].toFixed(4)),
      p_total: Number(p[i].toFixed(2)),
      p_lfp: Number(pLfp[i].toFixed(2)),
    }));
  }, [active, mode]);

  const agingData = useMemo(
    () =>
      aging.series.cycle.map((c, i) => ({
        cycle: Math.round(c),
        soh_full: Number(aging.series.soh_full_cycling[i].toFixed(4)),
        soh_bbu: Number(aging.series.soh_bbu_duty[i].toFixed(4)),
      })),
    [aging],
  );

  const stableLfp = lfpOnly.stats["v_cell_pp_stable"] as number;
  const stableHybrid = hybrid.stats["v_cell_pp_stable"] as number;
  const reduction = stableLfp / stableHybrid;
  const pStdLfp = lfpOnly.stats["p_lfp_std_kw"] as number;
  const pStdHybrid = hybrid.stats["p_lfp_std_kw"] as number;
  const pReduction = pStdLfp / pStdHybrid;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="text-xs uppercase tracking-[0.2em] text-muted">Battery Digital Twin · Live PyBaMM DFN</div>
        <h1 className="text-4xl font-semibold tracking-tight">Solving the GB200 millisecond transient.</h1>
        <p className="text-muted max-w-3xl leading-relaxed">
          We simulate one rack&rsquo;s worth of LFP cells under a real-world AI-training power profile — baseline
          80 kW with a &plusmn;30 % square pulse every 100 ms (the pattern Microsoft Azure documented in
          arXiv 2508.14318). Toggle below to see what happens when the LIC absorbs the high-frequency component.
        </p>
      </header>

      {/* Mode toggle */}
      <div className="inline-flex rounded-lg border border-border bg-surface/50 p-1">
        <ModeButton active={mode === "lfp"} onClick={() => setMode("lfp")} label="LFP only (baseline)" />
        <ModeButton active={mode === "hybrid"} onClick={() => setMode("hybrid")} label="LFP + LIC hybrid" />
      </div>

      {/* Main scenario card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>{mode === "hybrid" ? "Hybrid · Power split + cell response" : "Baseline · Pure LFP cell response"}</CardTitle>
              <p className="text-sm text-muted mt-2 max-w-3xl leading-relaxed">{active.description}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                mode === "hybrid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
              }`}
            >
              {mode === "hybrid" ? "WITH LIC" : "WITHOUT LIC"}
            </span>
          </div>
        </CardHeader>
        <CardBody className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Stat
              label="V cell peak-to-peak (steady state)"
              value={
                mode === "hybrid" ? (stableHybrid * 1000).toFixed(1) : (stableLfp * 1000).toFixed(1)
              }
              unit="mV"
              tone={mode === "hybrid" ? "success" : "warning"}
              hint={mode === "hybrid" ? `${reduction.toFixed(1)}× lower than baseline` : "Cell tracks every transient pulse"}
            />
            <Stat
              label="Power std → LFP"
              value={mode === "hybrid" ? pStdHybrid.toFixed(1) : pStdLfp.toFixed(1)}
              unit="kW"
              tone={mode === "hybrid" ? "success" : "warning"}
              hint={mode === "hybrid" ? `${pReduction.toFixed(1)}× smoother current` : "Full ±30 % swing through cell"}
            />
            <Stat
              label="LIC peak SoC excursion"
              value={
                mode === "hybrid"
                  ? `${(hybrid.stats.lic_peak_excursion_kj ?? 0).toFixed(2)}`
                  : "—"
              }
              unit={
                mode === "hybrid"
                  ? `/ ${(hybrid.stats.lic_energy_kj_capacity ?? 0).toFixed(0)} kJ`
                  : ""
              }
              tone={mode === "hybrid" ? "primary" : "default"}
              hint={
                mode === "hybrid"
                  ? `${(hybrid.stats.lic_headroom_ratio ?? 0).toFixed(0)}× headroom on the worst-case instantaneous excursion`
                  : "Not engaged in baseline"
              }
            />
          </div>

          <ChartCard title="Cell voltage (V)" subtitle="ms-resolution PyBaMM DFN solve · Prada2013 LFP">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <ReferenceArea x1={4} x2={6} fill="rgba(99,102,241,0.06)" stroke="none" />
                <XAxis dataKey="t" type="number" domain={[0, "auto"]} tickFormatter={(v) => `${v}s`} stroke="" />
                <YAxis domain={[3.05, 3.5]} stroke="" tickFormatter={(v) => v.toFixed(2)} />
                <Tooltip content={<DarkTooltip />} />
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={mode === "hybrid" ? "var(--success)" : "var(--warning)"}
                  strokeWidth={1.2}
                  dot={false}
                  name="V cell"
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted mt-2">
              Highlighted band [4 s, 6 s] = steady-state window after transient settles. Headline numbers above
              come from this region.
            </p>
          </ChartCard>

          <ChartCard
            title={mode === "hybrid" ? "Power split: total → LIC + LFP" : "Power: full profile through LFP"}
            subtitle={mode === "hybrid" ? "Low-pass filter τ = 0.5 s · cutoff ≈ 0.32 Hz · everything faster goes to LIC" : "No filtering — single-stage path"}
          >
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={[0, "auto"]} tickFormatter={(v) => `${v}s`} stroke="" />
                <YAxis stroke="" tickFormatter={(v) => `${v}`} />
                <Tooltip content={<DarkTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
                <Line
                  type="linear"
                  dataKey="p_total"
                  stroke="var(--muted)"
                  strokeWidth={0.8}
                  dot={false}
                  name="Total rack (kW)"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="p_lfp"
                  stroke="var(--primary)"
                  strokeWidth={1.6}
                  dot={false}
                  name={mode === "hybrid" ? "→ LFP (smoothed)" : "→ LFP (full)"}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </CardBody>
      </Card>

      {/* Aging */}
      <Card>
        <CardHeader>
          <CardTitle>State-of-Health under BBU duty</CardTitle>
          <p className="text-sm text-muted mt-2 max-w-3xl leading-relaxed">{aging.description}</p>
        </CardHeader>
        <CardBody className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Stat
              label="SOH @ 2,400 BBU cycles"
              value={`${(((aging.stats["soh_at_2400_bbu_cycles"] as number) ?? 0) * 100).toFixed(1)}`}
              unit="%"
              tone="success"
              hint="Above the 80 % industry replacement threshold"
            />
            <Stat
              label="80 % SOH crossed at"
              value={Math.round((aging.stats["cycle_at_80pct_soh_bbu"] as number) ?? 0)}
              unit="cycles"
              tone="primary"
              hint="≈ 8–12 year service life under realistic BBU duty"
            />
            <Stat
              label="Knee point (full-cycle reference)"
              value={Math.round((aging.stats["knee_cycle"] as number) ?? 0)}
              unit="cycles"
              hint="Severson 2019 calibration point"
            />
          </div>
          <ChartCard title="Capacity fade · 3,000-cycle horizon">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={agingData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="cycle" type="number" stroke="" tickFormatter={(v) => `${v}`} />
                <YAxis domain={[0.55, 1.0]} stroke="" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                <Tooltip content={<DarkTooltip percent />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
                <Line
                  type="monotone"
                  dataKey="soh_full"
                  stroke="var(--warning)"
                  strokeWidth={1.4}
                  dot={false}
                  name="Full 1C/1C cycling (Severson reference)"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="soh_bbu"
                  stroke="var(--success)"
                  strokeWidth={1.8}
                  dot={false}
                  name="BBU float duty (proposal §G.3)"
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </CardBody>
      </Card>

      {/* Model Validation — real LSTM trained on Severson 2019 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Model validation · LSTM trained on Severson 2019</CardTitle>
              <p className="text-sm text-muted mt-2 max-w-3xl leading-relaxed">{modelValidation.description}</p>
            </div>
            <span className="shrink-0 rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-medium">
              W2 reproduction
            </span>
          </div>
        </CardHeader>
        <CardBody className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Stat
              label="Test MAPE (measured)"
              value={modelValidation.metrics.test_mape_pct.toFixed(1)}
              unit="%"
              tone="primary"
              hint={`${modelValidation.metrics.n_test} held-out cells · target <10 % per proposal Appendix B`}
            />
            <Stat
              label="ONNX latency · laptop CPU"
              value={modelValidation.latency.p99_ms.toFixed(2)}
              unit="ms (p99)"
              tone="success"
              hint={`p50 ${modelValidation.latency.p50_ms.toFixed(2)} ms on Intel laptop CPU · STM32N6 NPU estimate ≈5 ms (ST X-CUBE-AI specs) · both well under 50 ms target`}
            />
            <Stat
              label="ONNX size"
              value={modelValidation.model.onnx_size_kb.toFixed(1)}
              unit="KiB"
              tone="default"
              hint={`Fits the STM32N6 Flash budget · numerical match to PyTorch within ${modelValidation.model.onnx_torch_max_diff.toExponential(1)}`}
            />
            <Stat
              label="Test R²"
              value={modelValidation.metrics.test_r2.toFixed(3)}
              tone="default"
              hint={`Train MAPE ${modelValidation.metrics.train_mape_pct.toFixed(1)} % · ${modelValidation.metrics.n_train} cells`}
            />
          </div>

          <ChartCard
            title={`Predicted vs actual cycle life · all ${modelValidation.metrics.n_train + modelValidation.metrics.n_test} cells`}
            subtitle={`Split ${modelValidation.metrics.split} · ${modelValidation.metrics.n_train} train · ${modelValidation.metrics.n_test} test`}
          >
            <ResponsiveContainer width="100%" height={320}>
              <ScatterChart margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="actual"
                  name="actual"
                  domain={["dataMin - 100", "dataMax + 100"]}
                  stroke=""
                  tickFormatter={(v) => `${v}`}
                  label={{ value: "Actual cycle life", position: "insideBottom", offset: -2, fill: "var(--muted)", fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="predicted"
                  name="predicted"
                  domain={["dataMin - 100", "dataMax + 100"]}
                  stroke=""
                  tickFormatter={(v) => `${v}`}
                  label={{ value: "Predicted cycle life", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 11 }}
                />
                <ZAxis range={[24, 24]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3", stroke: "var(--accent)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const raw = payload[0].payload as Partial<ModelValidation["predicted_vs_actual"][number]>;
                    // The y=x diagonal line shares this tooltip but only carries
                    // {actual, predicted}; suppress the tooltip on those points.
                    if (!raw.cell_id) return null;
                    const d = raw as ModelValidation["predicted_vs_actual"][number];
                    const err = ((d.predicted - d.actual) / d.actual) * 100;
                    return (
                      <div className="rounded border border-border bg-background/95 backdrop-blur px-3 py-2 text-xs shadow-xl space-y-0.5">
                        <div className="font-medium">{d.cell_id}</div>
                        <div className="text-muted">batch {d.batch} · {d.split}</div>
                        <div className="grid grid-cols-2 gap-x-3 pt-1">
                          <span className="text-muted">actual</span>
                          <span className="text-right tabular-nums">{d.actual}</span>
                          <span className="text-muted">predicted</span>
                          <span className="text-right tabular-nums">{d.predicted}</span>
                          <span className="text-muted">error</span>
                          <span className={`text-right tabular-nums ${Math.abs(err) > 20 ? "text-warning" : "text-success"}`}>
                            {err > 0 ? "+" : ""}{err.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
                {/* y = x diagonal — actual===predicted reference */}
                <Line
                  type="linear"
                  dataKey="actual"
                  data={(() => {
                    const lo = Math.min(...modelValidation.predicted_vs_actual.map((p) => Math.min(p.actual, p.predicted)));
                    const hi = Math.max(...modelValidation.predicted_vs_actual.map((p) => Math.max(p.actual, p.predicted)));
                    return [{ actual: lo, predicted: lo }, { actual: hi, predicted: hi }];
                  })()}
                  stroke="rgba(148,163,184,0.4)"
                  strokeDasharray="4 4"
                  dot={false}
                  legendType="none"
                  isAnimationActive={false}
                />
                <Scatter
                  name="train"
                  data={modelValidation.predicted_vs_actual.filter((p) => p.split === "train")}
                  fill="rgba(99,102,241,0.55)"
                />
                <Scatter
                  name="test (held-out)"
                  data={modelValidation.predicted_vs_actual.filter((p) => p.split === "test")}
                  fill="rgba(34,211,238,0.9)"
                />
              </ScatterChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted mt-2">
              Dashed diagonal is the perfect-prediction line. Test cells (cyan) are within ±20 % of actual for most
              cases; the ±20 % band is the Severson 2019 paper&rsquo;s reported variance baseline accuracy. Outliers
              (mostly batch 2 short-lived cells) are why this first-pass model lands above the &lt;10 % proposal
              target — the W3 plan extends features and increases training data to close the gap.
            </p>
          </ChartCard>

          <div className="rounded-md border border-border bg-background/30 p-4 text-xs text-muted leading-relaxed">
            <span className="text-foreground font-medium">Architecture · </span>
            {modelValidation.model.architecture} · {modelValidation.model.n_parameters.toLocaleString()} parameters ·
            input {JSON.stringify(modelValidation.model.input_shape)} (cycles 2–100 × 7 features:{" "}
            <code className="text-foreground">{modelValidation.model.feature_names.join(", ")}</code>).
          </div>
        </CardBody>
      </Card>

      {/* Inference walkthrough — pick a cell, see exactly what the LSTM did */}
      {modelValidation.walkthroughs && modelValidation.walkthroughs.length > 0 && (
        <InferenceWalkthrough walkthroughs={modelValidation.walkthroughs} />
      )}

      {/* Method panel */}
      <Card>
        <CardHeader>
          <CardTitle>Method · what you&rsquo;re actually looking at</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm leading-relaxed">
          <Method
            icon={<FlaskConical className="h-4 w-4" />}
            title="Physics"
            body="Doyle-Fuller-Newman PDE for an LFP cell, solved by PyBaMM 26.4.1 with the Prada 2013 parameter set. Pack-level power is mapped onto a representative cell so the rack-peak current corresponds to ~6C on the (smaller) Prada cell — matching the 2.5 kWh / 48 V / 15S BBU spec without rebuilding the full pack."
          />
          <Method
            icon={<Activity className="h-4 w-4" />}
            title="Hybrid split"
            body="A first-order low-pass filter (τ = 0.5 s, cutoff ≈ 0.32 Hz) approximates the DC-DC control law. Content above the cutoff goes to the LIC; the slow residual goes to the LFP. The 10 Hz GB200 pulse rate sits well above the cutoff (so it lands on the LIC, which has kHz-class bandwidth), while 30–90 s graceful-shutdown events sit well below the cutoff (so they land on the LFP). The two regimes separate cleanly."
          />
          <Method
            icon={<Cpu className="h-4 w-4" />}
            title="Aging"
            body="The 3,000-cycle SOH curve is a Severson 2019-calibrated analytic fit (running a real DFN over 3,000 cycles is computationally prohibitive). The 0.33 BBU-duty factor reflects float operation with rare deep events — explicit in the proposal §G.3 cost model."
          />
        </CardBody>
      </Card>
    </div>
  );
}

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? "px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium shadow"
          : "px-4 py-2 rounded-md text-sm text-muted hover:text-foreground transition"
      }
    >
      {label}
    </button>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/30 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h4 className="text-sm font-medium">{title}</h4>
        {subtitle && <span className="text-xs text-muted">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function DarkTooltip({
  active,
  payload,
  label,
  percent,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: number;
  percent?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-border bg-background/95 backdrop-blur px-3 py-2 text-xs shadow-xl">
      <div className="text-muted mb-1">{percent ? `Cycle ${label}` : `${label}s`}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 tabular-nums">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto font-medium">
            {percent ? `${(p.value * 100).toFixed(2)}%` : p.value.toFixed(3)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Method({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-foreground mb-2">
        <span className="text-primary">{icon}</span>
        <span className="font-medium">{title}</span>
      </div>
      <p className="text-muted">{body}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inference walkthrough — pick a cell, see the per-cycle measurements the
// LSTM ingested over its first 100 cycles. Earlier versions also showed
// hidden-state activation, cumulative prediction, and the dense-head
// breakdown; those were removed because the input charts alone already
// carry the demo's story (and adding more was noise for non-ML viewers).
// ---------------------------------------------------------------------------
type Walkthrough = NonNullable<ModelValidation["walkthroughs"]>[number];

function InferenceWalkthrough({ walkthroughs }: { walkthroughs: Walkthrough[] }) {
  const [pickedId, setPickedId] = useState<string>(walkthroughs[0].cell_id);
  const cell = walkthroughs.find((w) => w.cell_id === pickedId) ?? walkthroughs[0];

  const errorPct = ((cell.predicted - cell.actual) / cell.actual) * 100;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Microscope className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Inference walkthrough · what the model saw, cell by cell</CardTitle>
              <p className="text-sm text-muted mt-2 max-w-3xl leading-relaxed">
                Pick any of the {walkthroughs.length} cells below — each is curated to expose a
                different behaviour (longest-lived, early failure, best/worst prediction, etc.) —
                and the seven small charts show the actual per-cycle measurements the LSTM
                consumed for that cell over its first 100 cycles.
              </p>
            </div>
          </div>
          <select
            value={pickedId}
            onChange={(e) => setPickedId(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          >
            {walkthroughs.map((w) => (
              <option key={w.cell_id} value={w.cell_id}>
                {w.cell_id} · {w.label}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>

      <CardBody className="space-y-6">
        {/* Per-cell summary tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Cell ID" value={cell.cell_id} hint={`batch ${cell.batch}`} />
          <Stat
            label="Actual cycle life"
            value={cell.actual.toLocaleString()}
            unit="cycles"
            tone="default"
          />
          <Stat
            label="Predicted"
            value={cell.predicted.toLocaleString()}
            unit="cycles"
            tone="primary"
          />
          <Stat
            label="Error"
            value={`${errorPct >= 0 ? "+" : ""}${errorPct.toFixed(1)}`}
            unit="%"
            tone={Math.abs(errorPct) < 10 ? "success" : Math.abs(errorPct) < 25 ? "warning" : "danger"}
          />
        </div>

        {/* INPUT — 7 per-cycle features as small line charts */}
        <div className="rounded-lg border border-border bg-background/30 p-5 space-y-3">
          <div>
            <h4 className="text-sm font-medium">Per-cycle measurements (cycles 2 → 100)</h4>
            <p className="text-xs text-muted leading-relaxed mt-1">
              Each chart is one of the seven features the LSTM ingests, in its actual physical
              unit (Ah / V / °C / sec). Hover any line to see the value at a specific cycle.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {PER_CYCLE_FEATURES.map((f, fi) => {
              const series = cell.input_raw.map((row, i) => ({ cycle: i + 2, v: row[fi] }));
              return (
                <FeatureSparkline
                  key={f.key}
                  label={f.label}
                  unit={f.unit}
                  description={f.description}
                  data={series}
                />
              );
            })}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/** Small line chart for one per-cycle feature. Used in the inference
 *  walkthrough: 7 of these tile into a grid so the viewer can read the
 *  actual physical unit (Ah, V, °C, sec) for each cycle. */
function FeatureSparkline({
  label,
  unit,
  description,
  data,
}: {
  label: string;
  unit: string;
  description: string;
  data: Array<{ cycle: number; v: number }>;
}) {
  // Quick min/max so we can show the actual numeric range under the title
  // without reading every data point in the user's eyes.
  let mn = Infinity;
  let mx = -Infinity;
  for (const d of data) {
    if (Number.isFinite(d.v)) {
      if (d.v < mn) mn = d.v;
      if (d.v > mx) mx = d.v;
    }
  }
  const fmt = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(3));

  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="text-xs font-medium text-foreground">{label}</div>
        <div className="text-[10px] text-muted">{unit}</div>
      </div>
      <div className="text-[10px] text-muted mb-2 leading-tight">{description}</div>
      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <YAxis hide domain={["auto", "auto"]} />
          <XAxis dataKey="cycle" hide type="number" domain={[2, 100]} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as { cycle: number; v: number };
              return (
                <div className="rounded border border-border bg-background/95 backdrop-blur px-2 py-1 text-[11px] shadow-xl">
                  <div className="text-muted">cycle {d.cycle}</div>
                  <div className="font-medium tabular-nums">{fmt(d.v)} {unit}</div>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="v"
            stroke="var(--primary)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="text-[10px] text-muted mt-1 tabular-nums flex justify-between">
        <span>min {fmt(mn)}</span>
        <span>max {fmt(mx)}</span>
      </div>
    </div>
  );
}
