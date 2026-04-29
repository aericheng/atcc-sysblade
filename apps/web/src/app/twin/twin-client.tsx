"use client";

import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell as RCell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
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
  { key: "qd_range",    label: "Qd range",           unit: "Ah",      color: "#a78bfa" }, // violet
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
    fleet_status: "healthy" | "warning" | "early_aging" | "critical";
    fleet_pct: number;            // % of /dashboard fleet in this status bucket
    actual: number;
    predicted: number;
    pi_median: number;            // 50th-percentile MC Dropout estimate (point pred)
    pi_lower: number;             // split-conformal-adaptive 90% PI lower (sharpened from raw MC Dropout p5 by q_factor on the calibration set)
    pi_upper: number;             // split-conformal-adaptive 90% PI upper (sharpened from raw MC Dropout p95 by q_factor on the calibration set)
    input_raw: number[][];        // (99, 7) features in original physical units
    hidden_activation: number[];  // (99,) mean |tanh activation| across 64 dims
    cumulative_pred: number[];    // (99,)
  }>;
  fleet_status_distribution_pct?: {
    healthy: number;
    warning: number;
    early_aging: number;
    critical: number;
  };
  uncertainty?: {
    // ``method`` describes the underlying epistemic sampler (MC Dropout). The
    // public-facing PI we render in walkthroughs is the conformal-sharpened
    // bound — backward-compat aliases below carry those numbers.
    method: string;
    n_samples: number;
    test_coverage_90pct: number;        // alias of conformal_test_coverage_90pct
    median_pi_width_cycles: number;     // alias of conformal_median_pi_width_cycles
    // Split-conformal-adaptive post-processing of the raw PI; populated by
    // scripts/export_lstm_onnx.py since commit f77eee1.
    raw_test_coverage_90pct?: number;
    raw_median_pi_width_cycles?: number;
    conformal_method?: string;
    conformal_alpha?: number;
    conformal_q_factor?: number;        // <1 means PIs sharpened, >1 means widened
    conformal_n_calibration?: number;
    conformal_test_coverage_90pct?: number;
    conformal_median_pi_width_cycles?: number;
  };
}

/** Looping left-to-right sweep used by the transient charts to give them
 *  an oscilloscope-like "wave traveling rightward" feel instead of a static
 *  snapshot. Returns a fraction in [0, 1]; rises linearly over `sweepMs`,
 *  holds at 1 for `pauseMs`, then loops. Throttled to ``fps`` so the chart
 *  re-renders ``fps`` times/sec instead of every animation frame. Pause via
 *  `paused` (e.g. on hover) to immediately show the full waveform. */
function useSweep(sweepMs: number, pauseMs: number, paused: boolean, fps: number = 16): number {
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number>(0);
  useEffect(() => {
    if (paused) return; // hold whatever the last value was; caller short-circuits to 1
    const period = 1000 / fps;
    const total = sweepMs + pauseMs;
    let raf = 0;
    let last = 0;
    if (startRef.current === 0) startRef.current = performance.now();
    const tick = (now: number) => {
      if (now - last >= period) {
        last = now;
        const t = (now - startRef.current) % total;
        setProgress(t < sweepMs ? t / sweepMs : 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sweepMs, pauseMs, paused, fps]);
  return paused ? 1 : progress;
}

/** Two scope-style charts (cell voltage, power split) animated as a
 *  left-to-right sweep. Isolated into its own component so the sweep's
 *  setProgress tick (~16 fps) doesn't re-render the rest of /twin —
 *  Scatter, bucket chart, walkthrough, aging chart, and Method panel
 *  stay stable while only this subtree updates. ``data`` is expected
 *  to be already-decimated (~400 points is plenty for visual fidelity
 *  at chart-pixel scales; 800 makes path generation needlessly expensive
 *  per frame). */
type ScopePoint = { t: number; v: number; p_total: number; p_lfp: number };

function ScopeCharts({
  data,
  mode,
  durationS,
}: {
  data: ScopePoint[];
  mode: "lfp" | "hybrid";
  durationS: number;
}) {
  const [paused, setPaused] = useState(false);
  const sweep = useSweep(4500, 1500, paused);
  // useDeferredValue lets React drop sweep updates if the main thread is
  // busy with a more urgent render. Animation may visibly skip a frame
  // under load, but the rest of the UI stays responsive.
  const deferredSweep = useDeferredValue(sweep);

  const sweptData = useMemo(() => {
    const cut = Math.max(2, Math.ceil(data.length * deferredSweep));
    return data.slice(0, cut);
  }, [data, deferredSweep]);

  const xDomain: [number, number] = [0, durationS];
  const leadingPoint = sweptData[sweptData.length - 1];
  const showLeadingDot = !paused && deferredSweep < 1 && leadingPoint != null;

  return (
    <div
      className="space-y-6"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <ChartCard title="Cell voltage (V)" subtitle="ms-resolution PyBaMM DFN solve · Prada2013 LFP">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={sweptData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <ReferenceArea x1={4} x2={6} fill="rgba(99,102,241,0.06)" stroke="none" />
            <XAxis dataKey="t" type="number" domain={xDomain} tickFormatter={(v) => `${v}s`} stroke="" allowDataOverflow />
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
            {showLeadingDot && (
              <ReferenceDot
                x={leadingPoint.t}
                y={leadingPoint.v}
                r={4}
                fill={mode === "hybrid" ? "var(--success)" : "var(--warning)"}
                stroke="white"
                strokeOpacity={0.6}
                strokeWidth={1}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted mt-2">
          Highlighted band [4 s, 6 s] = steady-state window after transient settles. Headline
          numbers above come from this region. Hover the chart to pause the sweep and read
          exact values.
        </p>
      </ChartCard>

      <ChartCard
        title={mode === "hybrid" ? "Power split: total → LIC + LFP" : "Power: full profile through LFP"}
        subtitle={mode === "hybrid" ? "Low-pass filter τ = 0.5 s · cutoff ≈ 0.32 Hz · everything faster goes to LIC" : "No filtering — single-stage path"}
      >
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={sweptData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" type="number" domain={xDomain} tickFormatter={(v) => `${v}s`} stroke="" allowDataOverflow />
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
            {showLeadingDot && (
              <ReferenceDot
                x={leadingPoint.t}
                y={leadingPoint.p_lfp}
                r={4}
                fill="var(--primary)"
                stroke="white"
                strokeOpacity={0.6}
                strokeWidth={1}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
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

  // Full-resolution chart data lives here only to feed the scope component;
  // the sweep state itself is owned inside <ScopeCharts> so its 16 fps
  // setProgress doesn't trigger a re-render of every other section on /twin
  // (Scatter, bucket chart, walkthrough, aging, Method panel).
  const scopeData: ScopePoint[] = useMemo(() => {
    const t = active.series.t;
    const v = active.series.v_cell;
    const p = active.series.p_total_kw;
    const pLfp = mode === "hybrid" ? active.series.p_lfp_kw : p;
    // Decimate to ≤400 points before passing to the scope. The Python
    // generator already wrote 800 points (40 Hz over a 10 s window) which
    // is 4× Nyquist for the 10 Hz transient — we can halve again with no
    // visible loss and gain ~2× faster path generation per sweep frame.
    const target = 400;
    const step = t.length > target ? Math.floor(t.length / target) : 1;
    const out: ScopePoint[] = [];
    for (let i = 0; i < t.length; i += step) {
      out.push({
        t: Number(t[i].toFixed(3)),
        v: Number(v[i].toFixed(4)),
        p_total: Number(p[i].toFixed(2)),
        p_lfp: Number(pLfp[i].toFixed(2)),
      });
    }
    // Always keep the final sample so the axis domain matches the data.
    const lastIdx = t.length - 1;
    if (out[out.length - 1]?.t !== Number(t[lastIdx].toFixed(3))) {
      out.push({
        t: Number(t[lastIdx].toFixed(3)),
        v: Number(v[lastIdx].toFixed(4)),
        p_total: Number(p[lastIdx].toFixed(2)),
        p_lfp: Number(pLfp[lastIdx].toFixed(2)),
      });
    }
    return out;
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

          <ScopeCharts data={scopeData} mode={mode} durationS={active.duration_s ?? 10} />
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
              hint="§B.2 50 cycles/yr → ≈ 67 yr cycle life · 10-yr design target met with margin (calendar life binds, not cycle-fade)"
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

      {/* Model Validation — real LSTM trained on Severson 2019 + 50 PyBaMM BBU-duty cells */}
      <Card>
        <CardHeader>
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <CardTitle>Model validation · LSTM trained on Severson + PyBaMM BBU-duty</CardTitle>
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

          {/* Conformal sharpening summary — shows the 44 % PI tightening
              from split-conformal post-processing without taking up a
              whole headline tile. Only renders when the JSON ships the
              new conformal_* keys (commit f77eee1 onwards). */}
          {modelValidation.uncertainty?.conformal_q_factor != null &&
            modelValidation.uncertainty?.raw_median_pi_width_cycles != null &&
            modelValidation.uncertainty?.conformal_median_pi_width_cycles != null && (
              <div className="rounded-md border border-border bg-background/30 px-4 py-2.5 text-xs leading-relaxed">
                <span className="text-foreground font-medium">90 % prediction interval · </span>
                MC Dropout {modelValidation.uncertainty.n_samples} samples + split conformal{" "}
                (q ={" "}
                <span className="text-foreground tabular-nums">
                  {modelValidation.uncertainty.conformal_q_factor.toFixed(2)}
                </span>
                , {modelValidation.uncertainty.conformal_n_calibration} held-out calibration
                cells). Median PI width{" "}
                <span className="text-warning tabular-nums">
                  {Math.round(modelValidation.uncertainty.raw_median_pi_width_cycles).toLocaleString()} cycles
                </span>{" "}
                →{" "}
                <span className="text-success tabular-nums">
                  {Math.round(modelValidation.uncertainty.conformal_median_pi_width_cycles).toLocaleString()} cycles
                </span>{" "}
                (
                {(
                  (1 -
                    modelValidation.uncertainty.conformal_median_pi_width_cycles /
                      modelValidation.uncertainty.raw_median_pi_width_cycles) *
                  100
                ).toFixed(0)}
                % sharper, coverage held{" "}
                {((modelValidation.uncertainty.conformal_test_coverage_90pct ?? modelValidation.uncertainty.test_coverage_90pct) * 100).toFixed(0)}
                %), whitepaper §3.3.7.
              </div>
            )}

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
                {/* Four series: regime (Severson lab fast-charge vs PyBaMM
                    BBU-duty) × split (train vs held-out test). Colour family
                    encodes regime, brightness encodes split — so the
                    "regime gap" between Severson lifetimes (≤2,000) and BBU
                    lifetimes (≥5,000) reads directly off the chart, while
                    held-out test points are still visible against train. */}
                <Scatter
                  name="Severson · train"
                  data={modelValidation.predicted_vs_actual.filter(
                    (p) => p.batch !== "bbu" && p.split === "train",
                  )}
                  fill="rgba(99,102,241,0.45)"
                />
                <Scatter
                  name="Severson · test"
                  data={modelValidation.predicted_vs_actual.filter(
                    (p) => p.batch !== "bbu" && p.split === "test",
                  )}
                  fill="rgba(34,211,238,0.95)"
                />
                <Scatter
                  name="PyBaMM BBU · train"
                  data={modelValidation.predicted_vs_actual.filter(
                    (p) => p.batch === "bbu" && p.split === "train",
                  )}
                  fill="rgba(251,191,36,0.55)"
                />
                <Scatter
                  name="PyBaMM BBU · test"
                  data={modelValidation.predicted_vs_actual.filter(
                    (p) => p.batch === "bbu" && p.split === "test",
                  )}
                  fill="rgba(249,115,22,0.95)"
                />
              </ScatterChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted mt-2">
              Dashed 45° line is the perfect-prediction reference. Cool blues are{" "}
              <span className="text-foreground">Severson 2019 fast-charge cells</span>{" "}
              (lab-stress lifetimes 100–2,000 cycles); warm ambers are{" "}
              <span className="text-foreground">PyBaMM-calibrated BBU-duty cells</span>{" "}
              (5,000–13,000 cycles). The 2,000–4,000 gap between the two clouds is the
              <span className="text-foreground"> regime gap</span> — neither lab fast-charge nor
              gentle float duty produces cells in that range, which is why the W3+ plan adds
              medium-stress synthetic cells to fill the middle. Cross-chemistry transfer
              (NASA NMC, CALCE LCO) was tested and ruled out (whitepaper §B); the answer is
              more LFP coverage, not more chemistries. The 90 % prediction intervals in the
              walkthrough below — MC Dropout post-processed by split conformal, sharpened 44 %
              vs the raw sampler while keeping coverage ≥90 % — quantify the uncertainty
              cell-by-cell across the gap.
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
// Bin every cell by actual cycle life, then show:
//   - a bar (left axis) for cell count per bucket
//   - a line (right axis) for that bucket's MAPE
// Story (post BBU-duty augmentation): the Long bucket is now dominated by
// PyBaMM BBU cells (5,000–13,000 cycle lifetimes) rather than the few
// Severson long cells, so adding BBU cells widened the model's regime
// coverage at the cost of pushing test MAPE up from ~16 % to ~22 %. The
// Short bucket (n≈4 cells) still shows the model's worst miss because
// Severson early failures are sparse — that tail is W3+ work.

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
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={buckets} margin={{ top: 8, right: 32, left: 8, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            stroke=""
            interval={0}
            height={56}
            tick={<RotatedTick />}
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
        axis) is the mean absolute percentage error within that bucket. The Long bucket is now
        dominated by 50 PyBaMM-calibrated BBU-duty cells with 5,000–13,000 cycle lifetimes —
        adding them widened the model&rsquo;s regime coverage so it can speak about the actual
        BBU operating point, but pushed test MAPE up from the Severson-only ~16 % to ~22 %
        (whitepaper §3.3.5 explains the trade-off). The Short bucket still has the largest
        MAPE because Severson holds only a handful of early-failure cells; that tail is the
        clearest W3+ data gap. Cross-chemistry transfer (NASA NMC, CALCE LCO) was tested and
        ruled out (whitepaper §B), so the answer is more LFP early-failure data, not more
        chemistries. The Inference Walkthrough above reports a 90 % prediction interval per
        cell — MC Dropout post-processed by split conformal calibration (q_factor 0.56 on a
        held-out 37-cell calibration set, whitepaper §3.3.7), sharpened 44 % vs the raw
        sampler while keeping coverage ≥90 %; the Short bucket still gets the widest PIs
        because the model honestly has thin training signal there.
      </p>
    </ChartCard>
  );
}

// Recharts can't tilt axis labels via the `tick` prop alone, so we render a
// rotated <text> ourselves. Used by the lifetime-bucket chart so 5 labels
// stop overlapping on phone widths.
function RotatedTick(props: { x?: number; y?: number; payload?: { value: string } }) {
  const { x = 0, y = 0, payload } = props;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={8}
        textAnchor="end"
        transform="rotate(-30)"
        fill="var(--muted)"
        fontSize={11}
      >
        {payload?.value}
      </text>
    </g>
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

// Fleet-status visual mapping. Mirrors the colour coding /dashboard uses
// for its status chips so a viewer who scrolled through the dashboard
// recognises the same palette here.
const STATUS_TONE: Record<Walkthrough["fleet_status"], "success" | "warning" | "danger" | "default"> = {
  healthy: "success",
  warning: "warning",
  early_aging: "warning",
  critical: "danger",
};
// Short English phrase for the Stat tile value; the underlying status
// (healthy / warning / ...) lives in the tile's `unit` slot.
const STATUS_LABEL: Record<Walkthrough["fleet_status"], string> = {
  healthy: "Main population",
  warning: "Watch list",
  early_aging: "Tier-3 queue",
  critical: "Premature failure",
};

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
                Nine cells span four LSTM prediction states — main population
                <span className="text-foreground"> healthy</span>, watch list
                <span className="text-foreground"> warning</span>, Tier-3 replacement queue
                <span className="text-foreground"> early_aging</span>, and outright failure
                <span className="text-foreground"> critical</span>. /dashboard groups live
                devices by current physical state (SOH / RUL / temp) into three buckets;
                the walkthrough buckets training cells by <em>predicted</em> cycle life —
                which is why <span className="text-foreground">critical</span> appears here
                but not on /dashboard. Each prediction carries a{" "}
                <span className="text-foreground">90% prediction interval</span> via Monte
                Carlo Dropout (100 forward passes with active dropout) — wide PIs for tail
                cells like critical are the model honestly reporting it has limited training
                signal there, narrow PIs for healthy cells reflect actual confidence.
              </p>
              <p className="text-xs text-warning/90 mt-2 max-w-3xl leading-relaxed">
                <span className="font-medium">Regime note:</span> the dropdown contains both
                <span className="text-foreground"> Severson fast-charge cells</span> (b1/b2/b3
                IDs, 3.6C–8C, lab-stress lifetimes 100–2,000 cycles) and{" "}
                <span className="text-foreground">PyBaMM-calibrated BBU-duty cells</span>
                {" "}(bbu_* IDs, ~0.05C float, ~50 cycles/yr → 5,000–13,000 cycle lifetimes).
                The LSTM is now trained on both regimes (188 cells total) so it can speak
                about the actual BBU operating point — pick a `bbu_*` cell to see what the
                model predicts on the regime your customer&rsquo;s pack will live in.
                Whitepaper §3.3.5 covers the calibration of the synthetic BBU cells.
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Cell ID" value={cell.cell_id} hint={`batch ${cell.batch}`} />
          <Stat
            label="Fleet status"
            value={STATUS_LABEL[cell.fleet_status]}
            tone={STATUS_TONE[cell.fleet_status]}
            hint={`${cell.fleet_status} · ~${cell.fleet_pct.toFixed(0)}% of LSTM training-cell distribution`}
          />
          <Stat
            label="Actual cycle life"
            value={cell.actual.toLocaleString()}
            unit="cycles"
            tone="default"
          />
          <Stat
            label="Predicted (median)"
            value={cell.pi_median.toLocaleString()}
            unit="cycles"
            tone="primary"
            hint={`90% PI [${cell.pi_lower.toLocaleString()}–${cell.pi_upper.toLocaleString()}] · MC Dropout 100 samples + split conformal`}
          />
          <Stat
            label="Error"
            value={`${errorPct >= 0 ? "+" : ""}${errorPct.toFixed(1)}`}
            unit="%"
            tone={
              cell.actual >= cell.pi_lower && cell.actual <= cell.pi_upper
                ? "success"
                : Math.abs(errorPct) < 25
                  ? "warning"
                  : "danger"
            }
            hint={
              cell.actual >= cell.pi_lower && cell.actual <= cell.pi_upper
                ? `Actual ${cell.actual.toLocaleString()} lies inside the conformal 90 % PI — calibrated coverage holds for this cell.`
                : `Actual ${cell.actual.toLocaleString()} falls outside the conformal 90 % PI — rare (≤10 %) miss; widen α or extend the calibration set if it's a recurring tail-cell pattern.`
            }
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
 *  Tooltip restores the raw physical value; legend buttons toggle each line
 *  on / off so the chart stays readable on phone widths where 7 overlaid
 *  traces would otherwise crowd into a coloured fog. */
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

  // Set of hidden feature keys; the user toggles via the legend buttons.
  // Default visible: everything. Hidden lines stay in the chart's data but
  // render with `hide` so axes / tooltip don't reshuffle on toggle.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const showAll = () => setHidden(new Set());
  const hideAll = () => setHidden(new Set(PER_CYCLE_FEATURES.map((f) => f.key)));
  const noneVisible = hidden.size === PER_CYCLE_FEATURES.length;

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
              const visibleFeatures = PER_CYCLE_FEATURES.filter((f) => !hidden.has(f.key));
              if (visibleFeatures.length === 0) return null;
              return (
                <div className="rounded border border-border bg-background/95 backdrop-blur px-3 py-2 text-xs shadow-xl space-y-1">
                  <div className="text-muted">cycle {p.cycle}</div>
                  <div className="grid grid-cols-[14px_1fr_auto_auto] gap-x-2 gap-y-0.5 items-center">
                    {visibleFeatures.map((f) => (
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
              hide={hidden.has(f.key)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Click-to-toggle legend — taps a feature to show / hide its line.
          Mobile stacks label and range vertically so neither truncates;
          desktop keeps them side-by-side for density. */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-muted mb-1.5">
          <span>{noneVisible ? "All hidden — tap a row to add it back" : "Tap any row to toggle that line"}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={showAll}
              disabled={hidden.size === 0}
              className="text-primary hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-default"
            >
              Show all
            </button>
            <span className="text-muted/60">·</span>
            <button
              type="button"
              onClick={hideAll}
              disabled={noneVisible}
              className="text-muted hover:text-foreground disabled:opacity-40 disabled:cursor-default"
            >
              Hide all
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1 text-xs">
          {PER_CYCLE_FEATURES.map((f, fi) => {
            const r = ranges[fi];
            const isHidden = hidden.has(f.key);
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => toggle(f.key)}
                aria-pressed={!isHidden}
                className={`flex sm:items-center items-start gap-2 min-w-0 rounded px-1.5 py-1 text-left transition-colors hover:bg-surface/60 sm:flex-row flex-col ${
                  isHidden ? "opacity-40" : ""
                }`}
              >
                <span className="flex items-center gap-2 min-w-0 sm:flex-initial flex-1 w-full">
                  <span
                    className="inline-block h-2 w-2 rounded-full shrink-0"
                    style={{ background: isHidden ? "transparent" : f.color, borderColor: f.color, borderWidth: 1, borderStyle: "solid" }}
                  />
                  <span className={`truncate ${isHidden ? "line-through text-muted" : "text-foreground"}`}>{f.label}</span>
                </span>
                <span className="text-muted text-[10px] tabular-nums whitespace-nowrap sm:ml-auto sm:pl-2 pl-4">
                  {fmt(r.min)}–{fmt(r.max)} {f.unit}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

