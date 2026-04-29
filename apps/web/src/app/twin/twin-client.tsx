"use client";

import { Fragment, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell as RCell,
  ComposedChart,
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

// Per-cycle feature definitions for the walkthrough chart. These mirror
// packages/battery-twin/data_loaders/severson_parser.py and must stay in
// sync with what scripts/export_lstm_onnx.py emits. `color` is used by the
// combined-trend chart so each line is identifiable in the legend.
const PER_CYCLE_FEATURES: Array<{
  key: string;
  label: string;
  unit: string;
  color: string;
}> = [
  { key: "cycle_norm",  label: "Cycle progress",     unit: "0–1",     color: "#94a3b8" }, // slate
  { key: "qd_max",      label: "Discharge capacity", unit: "Ah",      color: "#6366f1" }, // indigo
  { key: "qd_min",      label: "Min Qd",             unit: "Ah",      color: "#a78bfa" }, // violet
  { key: "v_mean",      label: "Mean voltage",       unit: "V",       color: "#22d3ee" }, // cyan
  { key: "v_std",       label: "Voltage swing",      unit: "V (std)", color: "#34d399" }, // emerald
  { key: "t_max",       label: "Peak temperature",   unit: "°C",      color: "#fbbf24" }, // amber
  { key: "duration_s",  label: "Cycle duration",     unit: "s",       color: "#f87171" }, // red
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
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight">Solving the GB200 millisecond transient.</h1>
        <p className="text-sm sm:text-base text-muted max-w-3xl leading-relaxed">
          We simulate one rack&rsquo;s worth of LFP cells under a real-world AI-training power profile — baseline
          80 kW with a &plusmn;30 % square pulse every 100 ms (the pattern Microsoft Azure documented in
          arXiv 2508.14318). Toggle below to see what happens when the LIC absorbs the high-frequency component.
        </p>
      </header>

      {/* Mode toggle */}
      <div className="flex flex-wrap rounded-lg border border-border bg-surface/50 p-1 max-w-full sm:inline-flex sm:w-auto">
        <ModeButton active={mode === "lfp"} onClick={() => setMode("lfp")} label="LFP only (baseline)" />
        <ModeButton active={mode === "hybrid"} onClick={() => setMode("hybrid")} label="LFP + LIC hybrid" />
      </div>

      {/* Main scenario card */}
      <Card>
        <CardHeader>
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
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
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
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

          {(() => {
            // Unified [min, max] across BOTH actual and predicted, with 8 % padding,
            // so X and Y use the same domain and the y=x diagonal is a true 45 °
            // reference line. Regression-to-mean shows up visually as 'short cells
            // sit above the diagonal, long cells sit below'.
            const all = modelValidation.predicted_vs_actual.flatMap((p) => [p.actual, p.predicted]);
            const lo = Math.min(...all);
            const hi = Math.max(...all);
            const pad = (hi - lo) * 0.08;
            const domain: [number, number] = [Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)];
          return (
          <ChartCard
            title={`Predicted vs actual cycle life · all ${modelValidation.metrics.n_train + modelValidation.metrics.n_test} cells`}
            subtitle={`Split ${modelValidation.metrics.split} · ${modelValidation.metrics.n_train} train · ${modelValidation.metrics.n_test} test`}
          >
            <ResponsiveContainer width="100%" height={360}>
              <ScatterChart margin={{ top: 12, right: 16, left: 12, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="actual"
                  name="actual"
                  domain={domain}
                  allowDataOverflow={false}
                  stroke=""
                  tickFormatter={(v) => `${v}`}
                  label={{ value: "Actual cycle life", position: "insideBottom", offset: -8, fill: "var(--muted)", fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="predicted"
                  name="predicted"
                  domain={domain}
                  allowDataOverflow={false}
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
                {/* Legend pinned to the top so it can't collide with the
                    'Actual cycle life' axis label at the bottom. */}
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={24}
                  wrapperStyle={{ fontSize: 11, color: "var(--muted)", paddingRight: 8 }}
                />
                {/* y = x diagonal — actual===predicted reference */}
                <Line
                  type="linear"
                  dataKey="actual"
                  data={[
                    { actual: domain[0], predicted: domain[0] },
                    { actual: domain[1], predicted: domain[1] },
                  ]}
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
              Dashed 45° line is the perfect-prediction reference. Both axes share the same domain
              so regression-to-mean reads directly off the chart: short-lived cells sit above the
              diagonal (model overshoots), long-lived cells sit below (model undershoots). Most of
              the test set (cyan) lands within ±20 % of actual; outliers at the extremes are why
              this first-pass model is above the &lt;10 % proposal target — the W3 plan extends
              features and adds NASA / CALCE cells to flatten this pattern.
            </p>
          </ChartCard>
          );
          })()}

          {/* Error pattern by cell lifetime — surfaces the systematic
              regression-to-mean behaviour the scatter only hints at. */}
          <ErrorByLifetimeBucket data={modelValidation.predicted_vs_actual} />

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
          ? "flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium shadow"
          : "flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-md text-sm text-muted hover:text-foreground transition"
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
// Error pattern by cell lifetime
// ---------------------------------------------------------------------------
// Bin all 138 cells by actual cycle life, then show:
//   - a bar (left axis) for cell count per bucket
//   - a line (right axis) for that bucket's MAPE
// The pattern surfaces regression-to-mean: typical-lifetime cells (700-1000)
// land at ~11 % MAPE; the extremes jump to 30 %+ because the model is
// pulled toward the training median. Without this chart the per-cell
// scatter plot above hints at the trend but doesn't quantify it.

type Bucket = {
  label: string;
  range: string;
  min: number;
  max: number;
  count: number;
  mape: number;
  meanErr: number;
  avgActual: number;
  avgPred: number;
};

// Short axis label first, full range second. Recharts doesn't honour '\n'
// inside a tick string and the long forms collided badly on mobile widths,
// so the axis carries only the one-word category and the range is shown
// in the chart subtitle + tooltip instead.
const BUCKET_DEFS: Array<{ label: string; range: string; min: number; max: number }> = [
  { label: "Short",     range: "<400",      min: 0,    max: 400 },
  { label: "Mid-low",   range: "400–700",   min: 400,  max: 700 },
  { label: "Typical",   range: "700–1000",  min: 700,  max: 1000 },
  { label: "Mid-high",  range: "1000–1300", min: 1000, max: 1300 },
  { label: "Long",      range: "≥1300",     min: 1300, max: Infinity },
];

function buildBuckets(
  rows: ModelValidation["predicted_vs_actual"],
): Bucket[] {
  return BUCKET_DEFS.map((b) => {
    const sub = rows.filter((r) => r.actual >= b.min && r.actual < b.max);
    const n = sub.length;
    if (n === 0) {
      return {
        label: b.label, range: b.range, min: b.min, max: b.max,
        count: 0, mape: 0, meanErr: 0, avgActual: 0, avgPred: 0,
      };
    }
    let sumAbs = 0;
    let sumSign = 0;
    let sumActual = 0;
    let sumPred = 0;
    for (const r of sub) {
      const e = (r.predicted - r.actual) / r.actual;
      sumAbs += Math.abs(e);
      sumSign += e;
      sumActual += r.actual;
      sumPred += r.predicted;
    }
    return {
      label: b.label,
      range: b.range,
      min: b.min,
      max: b.max,
      count: n,
      mape: (sumAbs / n) * 100,
      meanErr: (sumSign / n) * 100,
      avgActual: sumActual / n,
      avgPred: sumPred / n,
    };
  });
}

function ErrorByLifetimeBucket({
  data,
}: {
  data: ModelValidation["predicted_vs_actual"];
}) {
  const buckets = useMemo(() => buildBuckets(data), [data]);

  // Bar tinted darker red as MAPE climbs — gives the eye an immediate
  // 'this bucket is fine vs this bucket is the problem' read.
  const barColour = (mape: number): string => {
    if (mape < 13) return "rgba(99,102,241,0.75)";   // indigo (good)
    if (mape < 22) return "rgba(34,211,238,0.6)";    // cyan (mid)
    return "rgba(248,113,113,0.7)";                   // red (bad)
  };

  return (
    <ChartCard
      title="Error pattern by cell lifetime"
      subtitle="Buckets · <400 / 400–700 / 700–1000 / 1000–1300 / ≥1300 cycles"
    >
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={buckets} margin={{ top: 8, right: 32, left: 8, bottom: 32 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            stroke=""
            interval={0}
            tick={{ fontSize: 10 }}
          />
          <YAxis yAxisId="count" stroke="" label={{ value: "cells", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 10 }} />
          <YAxis
            yAxisId="mape"
            orientation="right"
            stroke=""
            tickFormatter={(v) => `${v.toFixed(0)}%`}
            label={{ value: "MAPE", angle: 90, position: "insideRight", fill: "var(--muted)", fontSize: 10 }}
            domain={[0, "auto"]}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const b = payload[0].payload as Bucket;
              if (b.count === 0) return null;
              return (
                <div className="rounded border border-border bg-background/95 backdrop-blur px-3 py-2 text-xs shadow-xl space-y-0.5">
                  <div className="font-medium text-foreground">
                    {b.label} <span className="text-muted text-[10px]">({b.range})</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 pt-1.5">
                    <span className="text-muted">cells</span>
                    <span className="text-right tabular-nums">{b.count}</span>
                    <span className="text-muted">avg actual</span>
                    <span className="text-right tabular-nums">{b.avgActual.toFixed(0)}</span>
                    <span className="text-muted">avg predicted</span>
                    <span className="text-right tabular-nums">{b.avgPred.toFixed(0)}</span>
                    <span className="text-muted">mean signed err</span>
                    <span className={`text-right tabular-nums ${b.meanErr > 0 ? "text-warning" : "text-accent"}`}>
                      {b.meanErr >= 0 ? "+" : ""}{b.meanErr.toFixed(1)}%
                    </span>
                    <span className="text-muted">MAPE</span>
                    <span className="text-right tabular-nums font-medium">{b.mape.toFixed(1)}%</span>
                  </div>
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
          <Bar yAxisId="count" dataKey="count" name="Cell count" radius={[4, 4, 0, 0]}>
            {buckets.map((b, i) => (
              <RCell key={i} fill={barColour(b.mape)} />
            ))}
          </Bar>
          <Line
            yAxisId="mape"
            type="monotone"
            dataKey="mape"
            name="MAPE %"
            stroke="var(--warning)"
            strokeWidth={2}
            dot={{ fill: "var(--warning)", r: 4 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-xs text-muted mt-2">
        Bars (left axis) show how many cells live in each lifetime bucket. The amber line (right
        axis) is the mean absolute percentage error within that bucket. Typical-lifetime cells
        (700–1000 cycles, near the training median) land at ~11 % MAPE; the short and long
        extremes jump to 30 %+ because the model regresses toward the training median when it
        sees an unusual cell. The W3 plan extends features and adds NASA + CALCE cells to the
        training set to flatten this curve.
      </p>
    </ChartCard>
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
        <div className="flex items-start lg:items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <Microscope className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <CardTitle>Inference walkthrough · what the model saw, cell by cell</CardTitle>
              <p className="text-sm text-muted mt-2 max-w-3xl leading-relaxed">
                Nine cells spanning the full cycle-life range — from early failures (~150 cycles)
                through typical mid-life cells (700–900) up to premium long-lived hero cells
                (1,900+). Pick any one and the chart below shows the actual per-cycle measurements
                the LSTM consumed for that cell over its first 100 cycles, alongside how many
                cycles the model predicted vs how many it actually lasted.
              </p>
            </div>
          </div>
          <select
            value={pickedId}
            onChange={(e) => setPickedId(e.target.value)}
            className="w-full lg:w-auto rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
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

        {/* INPUT — all 7 per-cycle features overlaid in one chart */}
        <div className="rounded-lg border border-border bg-background/30 p-5 space-y-3">
          <div>
            <h4 className="text-sm font-medium">Per-cycle measurements (cycles 2 → 100)</h4>
            <p className="text-xs text-muted leading-relaxed mt-1">
              All seven features the LSTM ingests, overlaid on one axis. Each line is normalised to
              its own min–max so you can compare relative trends; hover any cycle to see the
              actual physical value (Ah / V / °C / sec) for every feature at that point.
            </p>
          </div>
          <CombinedFeatureChart inputRaw={cell.input_raw} />
        </div>
      </CardBody>
    </Card>
  );
}

/** All seven per-cycle features overlaid on one chart, normalised to [0, 1]
 *  so they're visually comparable despite their wildly different units.
 *  The tooltip restores the raw physical value for every feature. */
function CombinedFeatureChart({ inputRaw }: { inputRaw: number[][] }) {
  // Per-feature min/max across the 99 cycles, used to map raw → [0, 1].
  const ranges = useMemo(() => {
    return PER_CYCLE_FEATURES.map((_, fi) => {
      let mn = Infinity;
      let mx = -Infinity;
      for (const row of inputRaw) {
        const v = row[fi];
        if (Number.isFinite(v)) {
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      }
      return { min: mn, max: mx };
    });
  }, [inputRaw]);

  const data = useMemo(() => {
    return inputRaw.map((row, i) => {
      const point: Record<string, number> = { cycle: i + 2 };
      PER_CYCLE_FEATURES.forEach((f, fi) => {
        const r = ranges[fi];
        const range = r.max - r.min;
        point[`${f.key}_norm`] = range === 0 ? 0.5 : (row[fi] - r.min) / range;
        point[`${f.key}_raw`] = row[fi];
      });
      return point;
    });
  }, [inputRaw, ranges]);

  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3));

  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="cycle" type="number" domain={[2, 100]} stroke="" />
          <YAxis stroke="" domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)} %`} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Record<string, number>;
              return (
                <div className="rounded border border-border bg-background/95 backdrop-blur px-3 py-2 text-xs shadow-xl space-y-1">
                  <div className="text-muted">cycle {p.cycle}</div>
                  <div className="grid grid-cols-[14px_1fr_auto_auto] gap-x-2 gap-y-0.5 items-center">
                    {PER_CYCLE_FEATURES.map((f) => (
                      <Fragment key={f.key}>
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: f.color }}
                        />
                        <span className="text-muted">{f.label}</span>
                        <span className="tabular-nums text-foreground">{fmt(p[`${f.key}_raw`])}</span>
                        <span className="text-muted text-[10px]">{f.unit}</span>
                      </Fragment>
                    ))}
                  </div>
                </div>
              );
            }}
          />
          {PER_CYCLE_FEATURES.map((f) => (
            <Line
              key={f.key}
              type="monotone"
              dataKey={`${f.key}_norm`}
              stroke={f.color}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              name={f.label}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Compact legend with min/max ranges underneath */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1.5 mt-3 text-xs">
        {PER_CYCLE_FEATURES.map((f, fi) => {
          const r = ranges[fi];
          return (
            <div key={f.key} className="flex items-center gap-2 min-w-0">
              <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: f.color }} />
              <span className="text-foreground truncate">{f.label}</span>
              <span className="text-muted text-[10px] tabular-nums ml-auto whitespace-nowrap">
                {fmt(r.min)}–{fmt(r.max)} {f.unit}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

