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
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Stat } from "@/components/ui/stat";
import { Activity, Cpu, FlaskConical, Microscope } from "lucide-react";
import { CalendarWidget, AgedPowerWidget, PackThermalWidget } from "@/components/model-widgets";

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
  // Mains-fail scenario only — three-stage ramp design parameters.
  stages?: {
    peak_hold_s: number;
    ramp_s: number;
    ramp_shape?: "linear" | "exponential";
    peak_kw: number;
    continuous_kw: number;
  };
  // Aged-state backup capability (mains-fail scenario only, mentor 2026-06-04).
  aged?: {
    aged_soh: number;
    aged_label: string;
    dcir_growth: number;
    energy_retention: number;
    peak_power_retention: number;
    backup_runtime_s_bol_peakbasis: number;
    backup_runtime_s_eol_peakbasis: number;
    runtime_margin_vs_commitment_eol: number;
    continuous_c_rate_at_eol: number;
    model?: {
      dcir_growth_at_eol?: number;
      eol_soh?: number;
      form?: string;
      reference?: string;
      note?: string;
    };
  };
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
    // LIC RC physics layer (Eaton XLR 48V × 2 parallel datasheet anchor)
    lic_v_nominal?: number;
    lic_v_min?: number;
    lic_v_max?: number;
    lic_v_droop_v?: number;
    lic_v_pp_v?: number;
    lic_v_min_datasheet?: number;
    lic_headroom_to_cutoff_v?: number;
    lic_passes_cutoff?: boolean | number;
    lic_c_f?: number;
    lic_esr_ohm?: number;
    [k: string]: number | boolean | null | undefined;
  };
  _meta?: Record<string, string>;
}

interface AgingScenario {
  title: string;
  description: string;
  series: {
    cycle: number[];
    soh_full_cycling: number[];
    soh_bbu_duty: number[];
    // Calendar/storage fade overlay (mentor 2026-06-04). Optional so the UI
    // still renders against an older aging_lfp.json that lacks these.
    years?: number[];
    soh_calendar?: number[];
    soh_binding?: number[];
  };
  stats: Record<string, number | null>;
}

// Calendar T×SOC sensitivity rows emitted in aging_lfp.json stats.
interface CalendarSensitivityRow {
  soc: number;
  temp_c: number;
  calendar_life_years_at_80: number;
}

// V7 pack-level imbalance scenario (pack_imbalance.json).
interface PackImbalanceCell {
  idx: number;
  capacity_rel: number;
  r_rel: number;
  soc0: number;
  temp_c: number;
  calendar_life_yr: number;
  soh_at_7yr: number;
}
interface TopologyArm {
  weak_cell_transient_a: number;
  strong_cell_transient_a: number;
  self_balancing: boolean;
  note: string;
}
interface PackImbalanceScenario {
  title: string;
  description: string;
  validation_chain?: string;
  string: {
    n_series: number;
    cells: PackImbalanceCell[];
    weakest_idx: number;
    hottest_idx: number;
    usable_capacity_unbalanced_rel: number;
    usable_capacity_balanced_rel: number;
    imbalance_penalty_pct: number;
    balance_recovery_pct: number;
    string_soh_at_7yr: number;
    mean_soh_at_7yr: number;
    note: string;
  };
  thermal_gradient: {
    t_inlet_c: number;
    t_outlet_c: number;
    calendar_life_cold_yr: number;
    calendar_life_hot_yr: number;
    life_spread_pct: number;
    note: string;
  };
  topology_ab: {
    weak_cell_r_factor: number;
    transient_a: number;
    parallel_then_series: TopologyArm;
    series_then_parallel: TopologyArm;
    weak_cell_transient_reduction_pct: number;
    verdict: string;
  };
}

// V3 (normal) + V4 (N-1 fault) rack-scale 60s sim with thermal model.
// V4 extends V3 with fault_injection + n_bbu_active + pass_criteria.
interface RackScenario {
  validation_chain?: string;
  title: string;
  description: string;
  duration_s?: number;
  stages?: { peak_hold_s: number; ramp_s: number; peak_kw: number; continuous_kw: number };
  topology?: Record<string, number | string | boolean>;
  thermal_model?: {
    t_warning_c?: number;
    t_max_simulated_c?: number;
    t_rise_above_ambient_c?: number;
    passes_thermal_limit?: boolean;
    t_ambient_c?: number;
  };
  fault_injection?: {
    fault_time_s: number;
    n_bbu_normal: number;
    n_bbu_degraded: number;
    fault_mode: string;
  };
  pass_criteria?: {
    c_rate_continuous_post_limit?: number;
    v_cell_swing_limit_v?: number;
    t_cell_limit_c?: number;
    pass_c_rate?: boolean;
    pass_v_swing?: boolean;
    pass_thermal?: boolean;
    pass_lic_headroom?: boolean;
    overall_pass?: boolean;
  };
  headline_verdict?: string;
  series: Record<string, number[]>;
  stats: {
    v_cell_min?: number;
    v_cell_max?: number;
    v_cell_swing_v?: number;
    v_lic_min?: number;
    v_lic_droop_v?: number;
    v_lic_headroom_to_uvlo_v?: number;
    energy_delivered_kj?: number;
    energy_capacity_kj?: number;
    dod_pct?: number;
    energy_headroom_ratio?: number;
    p_peak_per_bbu_kw?: number;
    p_continuous_per_bbu_kw?: number;
    peak_c_rate_per_bbu?: number;
    continuous_c_rate_per_bbu?: number;
    t_cell_max_c?: number;
    t_cell_rise_c?: number;
    // V4-only
    p_per_bbu_max_post_fault_kw?: number;
    p_per_bbu_steady_post_fault_kw?: number;
    c_rate_continuous_post_fault?: number;
    c_rate_post_increase_pct?: number;
    [k: string]: number | boolean | null | undefined;
  };
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
    fleet_pct: number;            // % of LSTM training-cell distribution in this status bucket (NOT the live /dashboard fleet, which uses 3 physical-state buckets)
    actual: number;
    predicted: number;
    pi_median: number;            // 50th-percentile MC Dropout estimate (point pred)
    pi_lower: number;             // split-conformal-adaptive 90% PI lower (sharpened from raw MC Dropout p5 by q_factor on the calibration set)
    pi_upper: number;             // split-conformal-adaptive 90% PI upper (sharpened from raw MC Dropout p95 by q_factor on the calibration set)
    input_raw: number[][];        // (99, 7) features in original physical units
  }>;
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
type ScopePoint = { t: number; v: number; p_total: number; p_lfp: number; v_lic?: number };

function ScopeCharts({
  data,
  mode,
  durationS,
  licCutoffV,
  licNominalV,
  licVMin,
  licHeadroomV,
  licPassesCutoff,
  licCF,
  licESR,
  licPeakKw,
  licDroopV,
}: {
  data: ScopePoint[];
  mode: "lfp" | "hybrid";
  durationS: number;
  licCutoffV?: number;
  licNominalV?: number;
  licVMin?: number;
  licHeadroomV?: number;
  licPassesCutoff?: boolean;
  licCF?: number;
  licESR?: number;
  licPeakKw?: number;
  licDroopV?: number;
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
          <span className="text-foreground font-medium">Highlighted band [4 s, 6 s]</span> = steady-state window. Hover to pause sweep + read values.
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

      {/* LIC voltage trajectory — only rendered in hybrid mode (LFP-only
          baseline has no LIC engaged). Shows v_lic(t) from the closed-form
          RC model with a hard reference line at the Eaton XLR datasheet
          UVLO cutoff so the headroom is visually obvious. */}
      {mode === "hybrid" && licCutoffV != null && licNominalV != null && (
        <ChartCard
          title="LIC bank voltage (closed-form RC model)"
          subtitle={`Eaton XLR 48 V × 2 parallel · C = ${(licCF ?? 0).toFixed(0)} F · ESR = ${((licESR ?? 0) * 1000).toFixed(2)} mΩ · v_min observed ${(licVMin ?? 0).toFixed(2)} V · ${licPassesCutoff ? "✓ passes" : "✗ fails"} UVLO @ ${licCutoffV.toFixed(0)} V`}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={sweptData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="t" type="number" domain={xDomain} tickFormatter={(v) => `${v}s`} stroke="" allowDataOverflow />
              <YAxis
                domain={[licCutoffV - 1, licNominalV + 1.5]}
                stroke=""
                tickFormatter={(v) => v.toFixed(0)}
                label={{ value: "V_lic (V)", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 10 }}
              />
              <Tooltip content={<DarkTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
              {/* Eaton datasheet UVLO cutoff — dashed red, labelled. If
                  v_lic ever crosses this line the production design fails
                  for that waveform. The check_whitepaper_numbers.py gate
                  asserts v_min > cutoff at scenario regeneration time. */}
              <ReferenceLine
                y={licCutoffV}
                stroke="var(--danger)"
                strokeDasharray="6 4"
                strokeWidth={1.2}
                label={{
                  value: `Eaton XLR UVLO ${licCutoffV.toFixed(0)} V`,
                  position: "insideTopRight",
                  fill: "var(--danger)",
                  fontSize: 10,
                }}
                ifOverflow="extendDomain"
              />
              <ReferenceLine
                y={licNominalV}
                stroke="var(--muted)"
                strokeDasharray="2 4"
                strokeWidth={0.8}
                label={{
                  value: `nominal ${licNominalV.toFixed(1)} V`,
                  position: "insideTopRight",
                  fill: "var(--muted)",
                  fontSize: 10,
                }}
              />
              <Line
                type="monotone"
                dataKey="v_lic"
                stroke="var(--success)"
                strokeWidth={1.6}
                dot={false}
                name="V_lic (RC model)"
                isAnimationActive={false}
              />
              {showLeadingDot && leadingPoint.v_lic != null && (
                <ReferenceDot
                  x={leadingPoint.t}
                  y={leadingPoint.v_lic}
                  r={4}
                  fill="var(--success)"
                  stroke="white"
                  strokeOpacity={0.6}
                  strokeWidth={1}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted mt-2">
            <span className="text-success font-medium">{(licHeadroomV ?? 0).toFixed(2)} V headroom</span>{" "}
            from worst-case droop to Eaton XLR UVLO. Droop is{" "}
            <span className="text-foreground">ESR-dominated</span>:{" "}
            {(((licPeakKw ?? 0) * 1000) / (licNominalV ?? 51.3)).toFixed(0)} A peak ×{" "}
            {((licESR ?? 0) * 1000).toFixed(2)} mΩ ≈ {(licDroopV ?? 0).toFixed(2)} V,
            with the cumulative-charge term (∫i·dt / C) contributing the residual ~0.78 V at
            peak energy excursion. Production validates ESR(SOC) + bulk-C(V) curves in-the-loop
            with Eaton.
          </p>
        </ChartCard>
      )}
    </div>
  );
}

export function TwinClient({
  lfpOnly,
  hybrid,
  mainsFail,
  rackGraceful,
  rackNMinus1,
  aging,
  packImbalance,
  modelValidation,
}: {
  lfpOnly: Scenario;
  hybrid: Scenario;
  mainsFail: Scenario;
  rackGraceful: RackScenario;
  rackNMinus1: RackScenario;
  aging: AgingScenario;
  packImbalance: PackImbalanceScenario;
  modelValidation: ModelValidation;
}) {
  const [mode, setMode] = useState<"lfp" | "hybrid">("hybrid");
  // V3 (normal 8 BBU) vs V4 (N-1 fault) toggle for rack-scale section
  const [rackMode, setRackMode] = useState<"normal" | "n-1">("normal");
  const activeRack = rackMode === "n-1" ? rackNMinus1 : rackGraceful;
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
    // v_lic only exists for the hybrid scenario (the LFP-only baseline
    // has no LIC engaged). The chart-side conditional already gates
    // rendering on mode === "hybrid", but we still null-skip here.
    const vLic = mode === "hybrid" ? active.series.v_lic : undefined;
    // Decimate to ≤400 points before passing to the scope. The Python
    // generator already wrote 800 points (40 Hz over a 10 s window) which
    // is 4× Nyquist for the 10 Hz transient — we can halve again with no
    // visible loss and gain ~2× faster path generation per sweep frame.
    const target = 400;
    const step = t.length > target ? Math.floor(t.length / target) : 1;
    const out: ScopePoint[] = [];
    for (let i = 0; i < t.length; i += step) {
      const pt: ScopePoint = {
        t: Number(t[i].toFixed(3)),
        v: Number(v[i].toFixed(4)),
        p_total: Number(p[i].toFixed(2)),
        p_lfp: Number(pLfp[i].toFixed(2)),
      };
      if (vLic) pt.v_lic = Number(vLic[i].toFixed(3));
      out.push(pt);
    }
    // Always keep the final sample so the axis domain matches the data.
    const lastIdx = t.length - 1;
    if (out[out.length - 1]?.t !== Number(t[lastIdx].toFixed(3))) {
      const last: ScopePoint = {
        t: Number(t[lastIdx].toFixed(3)),
        v: Number(v[lastIdx].toFixed(4)),
        p_total: Number(p[lastIdx].toFixed(2)),
        p_lfp: Number(pLfp[lastIdx].toFixed(2)),
      };
      if (vLic) last.v_lic = Number(vLic[lastIdx].toFixed(3));
      out.push(last);
    }
    return out;
  }, [active, mode]);

  const agingData = useMemo(
    () =>
      aging.series.cycle.map((c, i) => ({
        cycle: Math.round(c),
        soh_full: Number(aging.series.soh_full_cycling[i].toFixed(4)),
        soh_bbu: Number(aging.series.soh_bbu_duty[i].toFixed(4)),
        // Calendar/storage fade plotted on the same cycle axis (years = cycle/50).
        soh_calendar:
          aging.series.soh_calendar != null
            ? Number(aging.series.soh_calendar[i].toFixed(4))
            : undefined,
      })),
    [aging],
  );

  // Calendar T×SOC sensitivity table (optional; present once aging_lfp.json
  // carries the calendar overlay). Shows the mentor's point: hotter + higher
  // SOC ⇒ shorter calendar life.
  const calendarSensitivity = useMemo(
    () =>
      (aging.stats["calendar_sensitivity"] as unknown as CalendarSensitivityRow[] | undefined) ??
      [],
    [aging],
  );

  // V7 pack-level imbalance scenario (mentor 2026-06-04).
  const pi = packImbalance;

  // Mains-fail 60s ramp data. Keep full resolution in [0, 3] s (where the
  // peak-hold + exponential decay + early settling all happen) and decimate
  // every 4 samples after, since Stage C just sits at the continuous level.
  const rampPowerData = useMemo(() => {
    const t = mainsFail.series.t;
    const pT = mainsFail.series.p_total_kw;
    const pL = mainsFail.series.p_lfp_kw;
    const pI = mainsFail.series.p_lic_kw;
    const out: Array<{ t: number; p_total: number; p_lfp: number; p_lic: number }> = [];
    for (let i = 0; i < t.length; i++) {
      if (t[i] > 3 && i % 4 !== 0 && i !== t.length - 1) continue;
      out.push({
        t: Number(t[i].toFixed(3)),
        p_total: Number(pT[i].toFixed(2)),
        p_lfp: Number(pL[i].toFixed(2)),
        p_lic: Number(pI[i].toFixed(2)),
      });
    }
    return out;
  }, [mainsFail]);

  const rampLicData = useMemo(() => {
    const t = mainsFail.series.t;
    const v = mainsFail.series.v_lic;
    const out: Array<{ t: number; v_lic: number }> = [];
    for (let i = 0; i < t.length; i++) {
      if (t[i] > 3 && i % 4 !== 0 && i !== t.length - 1) continue;
      out.push({ t: Number(t[i].toFixed(3)), v_lic: Number(v[i].toFixed(3)) });
    }
    return out;
  }, [mainsFail]);

  // V3/V4 rack-scale charts. Use the active scenario (normal vs N-1) and
  // decimate the same way as mains_fail above.
  const rackPowerData = useMemo(() => {
    const t = activeRack.series.t;
    const pT = activeRack.series.p_total_kw;
    const pL = activeRack.series.p_lfp_kw;
    const pI = activeRack.series.p_lic_kw;
    const out: Array<{ t: number; p_total: number; p_lfp: number; p_lic: number }> = [];
    for (let i = 0; i < t.length; i++) {
      if (t[i] > 3 && i % 4 !== 0 && i !== t.length - 1) continue;
      out.push({
        t: Number(t[i].toFixed(3)),
        p_total: Number(pT[i].toFixed(2)),
        p_lfp: Number(pL[i].toFixed(2)),
        p_lic: Number(pI[i].toFixed(2)),
      });
    }
    return out;
  }, [activeRack]);

  const rackThermalData = useMemo(() => {
    const t = activeRack.series.t;
    const T = activeRack.series.t_cell_c;
    if (!T) return [];
    const out: Array<{ t: number; t_cell: number }> = [];
    for (let i = 0; i < t.length; i++) {
      if (t[i] > 3 && i % 4 !== 0 && i !== t.length - 1) continue;
      out.push({ t: Number(t[i].toFixed(3)), t_cell: Number(T[i].toFixed(3)) });
    }
    return out;
  }, [activeRack]);

  // Per-BBU power (V4 only has explicit `p_lfp_per_bbu_kw`; for V3 we derive
  // it from p_lfp_kw / N_BBU_PER_RACK so the toggle stays comparable).
  const rackPerBbuData = useMemo(() => {
    const t = activeRack.series.t;
    const perBbu = activeRack.series.p_lfp_per_bbu_kw;
    const pLfp = activeRack.series.p_lfp_kw;
    const N_BBU = 8;
    const useDerived = !perBbu;
    const out: Array<{ t: number; p_per_bbu: number }> = [];
    for (let i = 0; i < t.length; i++) {
      if (t[i] > 3 && i % 4 !== 0 && i !== t.length - 1) continue;
      const v = useDerived ? pLfp[i] / N_BBU : perBbu[i];
      out.push({ t: Number(t[i].toFixed(3)), p_per_bbu: Number(v.toFixed(3)) });
    }
    return out;
  }, [activeRack]);

  const stableLfp = lfpOnly.stats["v_cell_pp_stable"] as number;
  const stableHybrid = hybrid.stats["v_cell_pp_stable"] as number;
  const reduction = stableLfp / stableHybrid;
  const pStdLfp = lfpOnly.stats["p_lfp_std_kw"] as number;
  const pStdHybrid = hybrid.stats["p_lfp_std_kw"] as number;
  const pReduction = pStdLfp / pStdHybrid;

  return (
    <div className="space-y-10 reveal-stagger">
      <header className="space-y-3">
        <div className="text-xs uppercase tracking-[0.2em] text-muted">Battery Digital Twin · PyBaMM DFN (LFP) + first-order LIC equivalent</div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight">Solving the GB200 millisecond transient.</h1>
        <p className="text-sm sm:text-base text-muted max-w-3xl leading-relaxed">
          PyBaMM DFN solves the <span className="text-foreground font-medium">LFP cell</span>;
          the <span className="text-foreground font-medium">LIC side</span> is represented by
          its R<sub>esr</sub> × C<sub>bulk</sub> equivalent (datasheet-anchored, not
          electrochemical). One rack, <span className="text-foreground font-medium">80 kW baseline</span>,{" "}
          <span className="text-foreground font-medium">±30 % square pulses every 100 ms</span>.
          Toggle below to see the <span className="text-success font-medium">LIC equivalent absorb the high-frequency residual</span>.
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
              <Disclosure summary="What you're seeing" className="mt-2">
                {active.description}
              </Disclosure>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
              label="LIC peak energy excursion"
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
                  ? `∫p_lic·dt running max · ${(hybrid.stats.lic_headroom_ratio ?? 0).toFixed(0)}× headroom vs nominal LIC capacity`
                  : "Not engaged in baseline"
              }
            />
            <Stat
              label="LIC voltage droop (RC model)"
              value={
                mode === "hybrid"
                  ? (hybrid.stats.lic_v_droop_v ?? 0).toFixed(2)
                  : "—"
              }
              unit={mode === "hybrid" ? "V from nominal" : ""}
              tone={
                mode === "hybrid"
                  ? (hybrid.stats.lic_passes_cutoff ? "success" : "danger")
                  : "default"
              }
              hint={
                mode === "hybrid"
                  ? `closed-form RC · C ${(hybrid.stats.lic_c_f ?? 0).toFixed(0)} F · ESR ${((hybrid.stats.lic_esr_ohm ?? 0) * 1000).toFixed(2)} mΩ · v_min ${(hybrid.stats.lic_v_min ?? 0).toFixed(2)} V (${(hybrid.stats.lic_headroom_to_cutoff_v ?? 0).toFixed(1)} V to Eaton XLR ${(hybrid.stats.lic_v_min_datasheet ?? 0).toFixed(0)} V cutoff)`
                  : "Not engaged in baseline"
              }
            />
          </div>

          <ScopeCharts
            data={scopeData}
            mode={mode}
            durationS={active.duration_s ?? 10}
            licCutoffV={hybrid.stats.lic_v_min_datasheet as number | undefined}
            licNominalV={hybrid.stats.lic_v_nominal as number | undefined}
            licVMin={hybrid.stats.lic_v_min as number | undefined}
            licHeadroomV={hybrid.stats.lic_headroom_to_cutoff_v as number | undefined}
            licPassesCutoff={Boolean(hybrid.stats.lic_passes_cutoff)}
            licCF={hybrid.stats.lic_c_f as number | undefined}
            licESR={hybrid.stats.lic_esr_ohm as number | undefined}
            licPeakKw={hybrid.stats.lic_peak_kw as number | undefined}
            licDroopV={hybrid.stats.lic_v_droop_v as number | undefined}
          />
        </CardBody>
      </Card>

      {/* Mains-fail graceful ramp — 60s rack-scale transient backing whitepaper §2.1.1 narrative */}
      <Card>
        <CardHeader>
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <CardTitle>Mains-fail · 60 s graceful ramp at rack scale</CardTitle>
              <Disclosure summary="What you&apos;re seeing" className="mt-2">
                {mainsFail.description}
              </Disclosure>
            </div>
            <span className="shrink-0 rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-medium">
              Simulated · physics-anchored
            </span>
          </div>
        </CardHeader>
        <CardBody className="space-y-6">
          {mainsFail.aged && (
            <div>
              <div className="text-sm font-medium text-foreground mb-1">
                If mains drops, how long does the rack ride through — now and after years of aging?
              </div>
              <p className="text-xs text-muted mb-3">
                The single question a Data Center buyer asks first. Drag the pack&rsquo;s health —
                backup runtime stays well above the 60-second graceful-shutdown commitment all the way
                to end-of-life.
              </p>
              <AgedPowerWidget />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label="Energy used vs rack capacity"
              value={((mainsFail.stats.dod_pct as number) ?? 0).toFixed(2)}
              unit={`% of ${(((mainsFail.stats.energy_capacity_kj as number) ?? 0) / 3600).toFixed(0)} kWh`}
              tone="success"
              hint={`${((mainsFail.stats.energy_delivered_kj as number) ?? 0).toFixed(0)} kJ delivered · ${((mainsFail.stats.energy_headroom_ratio as number) ?? 0).toFixed(0)}× headroom against the 20 kWh per-rack LFP capacity`}
            />
            <Stat
              label="Per-BBU C-rate"
              value={`${((mainsFail.stats.peak_c_rate_per_bbu as number) ?? 0).toFixed(0)} / ${((mainsFail.stats.continuous_c_rate_per_bbu as number) ?? 0).toFixed(1)}`}
              unit="C peak / cont."
              tone="primary"
              hint={`${((mainsFail.stats.p_peak_per_bbu_kw as number) ?? 0).toFixed(0)} kW × ${(mainsFail.stages?.peak_hold_s ?? 0.5).toFixed(1)} s pulse (inside automotive LFP 5-10 C pulse spec) · ${((mainsFail.stats.p_continuous_per_bbu_kw as number) ?? 0).toFixed(2)} kW continuous (inside 1-3 C continuous spec)`}
            />
            <Stat
              label="LIC droop @ t = 0"
              value={((mainsFail.stats.lic_v_droop_v as number) ?? 0).toFixed(2)}
              unit="V from nominal"
              tone={mainsFail.stats.lic_passes_cutoff ? "success" : "danger"}
              hint={`v_min ${((mainsFail.stats.lic_v_min as number) ?? 0).toFixed(2)} V · ${((mainsFail.stats.lic_headroom_to_cutoff_v as number) ?? 0).toFixed(1)} V headroom to Eaton XLR ${((mainsFail.stats.lic_v_min_datasheet as number) ?? 0).toFixed(0)} V cutoff (2× XLR-48-166 parallel)`}
            />
            <Stat
              label="LFP cell V swing"
              value={(((mainsFail.stats.v_cell_swing as number) ?? 0) * 1000).toFixed(0)}
              unit="mV peak-to-peak"
              tone="default"
              hint={`v_min ${((mainsFail.stats.v_cell_min as number) ?? 0).toFixed(3)} V → v_max ${((mainsFail.stats.v_cell_max as number) ?? 0).toFixed(3)} V · LFP stays in plateau across the full 60 s ramp`}
            />
          </div>

          {mainsFail.aged && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
              <div className="text-sm font-medium text-foreground mb-1">
                New vs end-of-life backup, in detail
              </div>
              <p className="text-xs text-muted mb-3">
                The four stats above are a <span className="text-foreground">fresh</span> pack. The
                customer&rsquo;s real question is year-7/EOL: when mains drops after years of aging,
                how much power and runtime remain? Modeled via DCIR growth (+
                {Math.round((mainsFail.aged.dcir_growth ?? 0.5) * 100)}% at{" "}
                {Math.round((mainsFail.aged.aged_soh ?? 0.8) * 100)}% SOH) + capacity fade.
              </p>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse w-full max-w-lg">
                  <thead>
                    <tr className="text-muted">
                      <th className="px-2 py-1 text-left font-medium">Metric</th>
                      <th className="px-2 py-1 text-right font-medium">BoL (new)</th>
                      <th className="px-2 py-1 text-right font-medium">{mainsFail.aged.aged_label}</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums text-foreground">
                    <tr className="border-t border-border/40">
                      <td className="px-2 py-1 text-left">Backup runtime @ rack peak</td>
                      <td className="px-2 py-1 text-right">
                        {Math.round(mainsFail.aged.backup_runtime_s_bol_peakbasis)} s
                      </td>
                      <td className="px-2 py-1 text-right text-warning">
                        {Math.round(mainsFail.aged.backup_runtime_s_eol_peakbasis)} s
                      </td>
                    </tr>
                    <tr className="border-t border-border/40">
                      <td className="px-2 py-1 text-left">… margin vs 60 s commitment</td>
                      <td className="px-2 py-1 text-right">
                        {(mainsFail.aged.backup_runtime_s_bol_peakbasis / 60).toFixed(0)}×
                      </td>
                      <td className="px-2 py-1 text-right">
                        {(mainsFail.aged.runtime_margin_vs_commitment_eol ?? 8).toFixed(0)}×
                      </td>
                    </tr>
                    <tr className="border-t border-border/40">
                      <td className="px-2 py-1 text-left">LFP peak-power capability</td>
                      <td className="px-2 py-1 text-right">100%</td>
                      <td className="px-2 py-1 text-right text-warning">
                        {Math.round((mainsFail.aged.peak_power_retention ?? 0.667) * 100)}%
                      </td>
                    </tr>
                    <tr className="border-t border-border/40">
                      <td className="px-2 py-1 text-left">Continuous survival (1.5 C)</td>
                      <td className="px-2 py-1 text-right">maintained</td>
                      <td className="px-2 py-1 text-right">maintained</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] leading-relaxed text-muted mt-2">{mainsFail.aged.model?.note}</p>
            </div>
          )}

          <ChartCard
            title="Rack power split · 0-60 s"
            subtitle={`Stage A 0-${(mainsFail.stages?.peak_hold_s ?? 0.5).toFixed(1)} s peak hold · Stage B linear ramp ${(mainsFail.stages?.peak_kw ?? 120).toFixed(0)} → ${(mainsFail.stages?.continuous_kw ?? 30).toFixed(0)} kW over ${(mainsFail.stages?.ramp_s ?? 1.5).toFixed(1)} s · Stage C ${(mainsFail.stages?.continuous_kw ?? 30).toFixed(0)} kW continuous`}
          >
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rampPowerData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={[0, 60]} stroke="" tickFormatter={(v) => `${v.toFixed(0)}s`} />
                <YAxis stroke="" tickFormatter={(v) => `${v} kW`} />
                <Tooltip content={<DarkTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
                <Line type="monotone" dataKey="p_total" stroke="var(--warning)" strokeWidth={1.6} dot={false} name="Rack total" isAnimationActive={false} />
                <Line type="monotone" dataKey="p_lfp" stroke="var(--success)" strokeWidth={1.6} dot={false} name="LFP pack" isAnimationActive={false} />
                <Line type="monotone" dataKey="p_lic" stroke="var(--primary)" strokeWidth={1.4} dot={false} name="LIC bank" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="LIC bank voltage envelope · closed-form RC"
            subtitle={`2× Eaton XLR-48-166 parallel · v_nominal 51.3 V · datasheet cutoff ${((mainsFail.stats.lic_v_min_datasheet as number) ?? 38).toFixed(0)} V`}
          >
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={rampLicData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={[0, 60]} stroke="" tickFormatter={(v) => `${v.toFixed(0)}s`} />
                <YAxis domain={[35, 55]} stroke="" tickFormatter={(v) => `${v} V`} />
                <Tooltip content={<DarkTooltip />} />
                <ReferenceLine
                  y={(mainsFail.stats.lic_v_min_datasheet as number) ?? 38}
                  stroke="var(--danger)"
                  strokeDasharray="4 4"
                  label={{
                    value: `Eaton XLR cutoff ${((mainsFail.stats.lic_v_min_datasheet as number) ?? 38).toFixed(0)} V`,
                    position: "insideTopRight",
                    fill: "var(--danger)",
                    fontSize: 10,
                  }}
                />
                <Line type="monotone" dataKey="v_lic" stroke="var(--primary)" strokeWidth={1.8} dot={false} name="v_lic" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </CardBody>
      </Card>

      {/* V3 (normal 8 BBU) + V4 (N-1 fault injection) rack-scale sim with thermal model */}
      <Card>
        <CardHeader>
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <CardTitle>Rack-scale 60s graceful · normal vs N-1 fault injection</CardTitle>
              <Disclosure summary="What you&apos;re seeing" className="mt-2">
                {activeRack.description}
              </Disclosure>
            </div>
            <span className="shrink-0 rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-medium">
              V3 / V4 · Twin validation · SIMULATED
            </span>
          </div>
        </CardHeader>
        <CardBody className="space-y-6">
          {/* V3 vs V4 toggle */}
          <div className="flex flex-wrap rounded-lg border border-border bg-surface/50 p-1 max-w-full sm:inline-flex sm:w-auto">
            <button
              type="button"
              className={`px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded transition-colors ${
                rackMode === "normal"
                  ? "bg-success/20 text-success"
                  : "text-muted hover:text-foreground"
              }`}
              onClick={() => setRackMode("normal")}
            >
              V3 · Normal (8 BBU symmetric)
            </button>
            <button
              type="button"
              className={`px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded transition-colors ${
                rackMode === "n-1"
                  ? "bg-warning/20 text-warning"
                  : "text-muted hover:text-foreground"
              }`}
              onClick={() => setRackMode("n-1")}
            >
              V4 · N-1 fault @ t={activeRack.fault_injection?.fault_time_s ?? 15}s (7 BBU)
            </button>
          </div>

          {/* Stats grid — same layout for both modes, V4 stats fall back when not present */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label={rackMode === "n-1" ? "Per-BBU C-rate post-fault" : "Per-BBU C-rate"}
              value={
                rackMode === "n-1"
                  ? ((activeRack.stats.c_rate_continuous_post_fault as number | undefined) ?? 0).toFixed(2)
                  : ((activeRack.stats.continuous_c_rate_per_bbu as number | undefined) ?? 0).toFixed(2)
              }
              unit="C continuous"
              tone={
                rackMode === "n-1"
                  ? activeRack.pass_criteria?.pass_c_rate
                    ? "success"
                    : "danger"
                  : "primary"
              }
              hint={
                rackMode === "n-1"
                  ? `+${((activeRack.stats.c_rate_post_increase_pct as number | undefined) ?? 0).toFixed(0)}% vs 8-BBU baseline · limit ${activeRack.pass_criteria?.c_rate_continuous_post_limit ?? 2.5}C automotive LFP continuous spec`
                  : `${((activeRack.stats.p_continuous_per_bbu_kw as number | undefined) ?? 0).toFixed(2)} kW × 58 s continuous (inside 1-3 C automotive LFP spec)`
              }
            />
            <Stat
              label="T_cell rise vs ambient"
              value={((activeRack.stats.t_cell_rise_c as number | undefined) ?? 0).toFixed(2)}
              unit={`K (max ${((activeRack.stats.t_cell_max_c as number | undefined) ?? 25).toFixed(1)} °C)`}
              tone={activeRack.thermal_model?.passes_thermal_limit ? "success" : "danger"}
              hint={`Lumped cell thermal model · ambient ${activeRack.thermal_model?.t_ambient_c ?? 25} °C · warning ${activeRack.thermal_model?.t_warning_c ?? 50} °C · whitepaper §6.1`}
            />
            <Stat
              label="LFP cell V swing"
              value={(((activeRack.stats.v_cell_swing_v as number | undefined) ?? 0) * 1000).toFixed(0)}
              unit="mV peak-to-peak"
              tone={
                rackMode === "n-1"
                  ? activeRack.pass_criteria?.pass_v_swing
                    ? "success"
                    : "danger"
                  : "default"
              }
              hint={
                rackMode === "n-1"
                  ? `Limit ${(((activeRack.pass_criteria?.v_cell_swing_limit_v as number | undefined) ?? 0.5) * 1000).toFixed(0)} mV (2× V3 budget for degraded mode)`
                  : "LFP stays in plateau across the full 60 s ramp"
              }
            />
            <Stat
              label="LIC droop"
              value={((activeRack.stats.v_lic_droop_v as number | undefined) ?? 0).toFixed(2)}
              unit="V from nominal"
              tone={activeRack.pass_criteria?.pass_lic_headroom !== false ? "success" : "danger"}
              hint={`v_min ${((activeRack.stats.v_lic_min as number | undefined) ?? 0).toFixed(2)} V · ${((activeRack.stats.v_lic_headroom_to_uvlo_v as number | undefined) ?? 0).toFixed(2)} V headroom to UVLO 38 V · LIC bank unaffected by BBU loss`}
            />
          </div>

          {/* Overall pass badge for V4 mode */}
          {rackMode === "n-1" && activeRack.pass_criteria && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                activeRack.pass_criteria.overall_pass
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-danger/40 bg-danger/10 text-danger"
              }`}
            >
              <span className="font-medium">
                {activeRack.pass_criteria.overall_pass ? "✓ N-1 redundancy PASS" : "✗ N-1 redundancy FAIL"}
              </span>
              {" — "}
              {activeRack.headline_verdict}
            </div>
          )}

          <ChartCard
            title={
              rackMode === "n-1"
                ? `Rack power split · fault injection at t=${activeRack.fault_injection?.fault_time_s ?? 15}s`
                : "Rack power split · 0–60 s (normal 8 BBU symmetric)"
            }
            subtitle={`Stage A ${(activeRack.stages?.peak_hold_s ?? 0.5).toFixed(1)} s peak hold · Stage B linear ramp ${(activeRack.stages?.peak_kw ?? 120).toFixed(0)} → ${(activeRack.stages?.continuous_kw ?? 30).toFixed(0)} kW · Stage C ${(activeRack.stages?.continuous_kw ?? 30).toFixed(0)} kW continuous`}
          >
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rackPowerData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={[0, 60]} stroke="" tickFormatter={(v) => `${v.toFixed(0)}s`} />
                <YAxis stroke="" tickFormatter={(v) => `${v} kW`} />
                <Tooltip content={<DarkTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
                {rackMode === "n-1" && activeRack.fault_injection && (
                  <ReferenceLine
                    x={activeRack.fault_injection.fault_time_s}
                    stroke="var(--danger)"
                    strokeDasharray="4 4"
                    label={{
                      value: `Fault injection (BBU ${activeRack.fault_injection.n_bbu_normal}→${activeRack.fault_injection.n_bbu_degraded})`,
                      position: "insideTopRight",
                      fill: "var(--danger)",
                      fontSize: 10,
                    }}
                  />
                )}
                <Line type="monotone" dataKey="p_total" stroke="var(--warning)" strokeWidth={1.6} dot={false} name="Rack total" isAnimationActive={false} />
                <Line type="monotone" dataKey="p_lfp" stroke="var(--success)" strokeWidth={1.6} dot={false} name="LFP pack" isAnimationActive={false} />
                <Line type="monotone" dataKey="p_lic" stroke="var(--primary)" strokeWidth={1.4} dot={false} name="LIC bank" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Per-BBU LFP power"
            subtitle={
              rackMode === "n-1"
                ? `Surviving BBUs share rack load after t=${activeRack.fault_injection?.fault_time_s ?? 15}s; step up reflects load redistribution`
                : "8-BBU symmetric load — all BBUs see identical scaled current"
            }
          >
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={rackPerBbuData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={[0, 60]} stroke="" tickFormatter={(v) => `${v.toFixed(0)}s`} />
                <YAxis stroke="" tickFormatter={(v) => `${v} kW`} />
                <Tooltip content={<DarkTooltip />} />
                {rackMode === "n-1" && activeRack.fault_injection && (
                  <ReferenceLine
                    x={activeRack.fault_injection.fault_time_s}
                    stroke="var(--danger)"
                    strokeDasharray="4 4"
                  />
                )}
                <Line
                  type="stepAfter"
                  dataKey="p_per_bbu"
                  stroke="var(--success)"
                  strokeWidth={1.8}
                  dot={false}
                  name="kW per BBU"
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {rackThermalData.length > 0 && (
            <ChartCard
              title="Cell thermal trace · lumped capacitance + convective cooling"
              subtitle={`I²·R_int heating vs h·A·ΔT cooling · cell C_th 70 J/K · R_int 8 mΩ · ambient ${activeRack.thermal_model?.t_ambient_c ?? 25} °C`}
            >
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={rackThermalData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="t" type="number" domain={[0, 60]} stroke="" tickFormatter={(v) => `${v.toFixed(0)}s`} />
                  <YAxis
                    domain={[
                      (activeRack.thermal_model?.t_ambient_c ?? 25) - 1,
                      Math.max(
                        (activeRack.thermal_model?.t_warning_c ?? 50) + 2,
                        (activeRack.thermal_model?.t_max_simulated_c ?? 30) + 2,
                      ),
                    ]}
                    stroke=""
                    tickFormatter={(v) => `${v.toFixed(1)} °C`}
                  />
                  <Tooltip content={<DarkTooltip />} />
                  <ReferenceLine
                    y={activeRack.thermal_model?.t_warning_c ?? 50}
                    stroke="var(--danger)"
                    strokeDasharray="4 4"
                    label={{
                      value: `Warning ${activeRack.thermal_model?.t_warning_c ?? 50} °C (whitepaper §6.1)`,
                      position: "insideTopRight",
                      fill: "var(--danger)",
                      fontSize: 10,
                    }}
                  />
                  <ReferenceLine
                    y={activeRack.thermal_model?.t_ambient_c ?? 25}
                    stroke="var(--muted)"
                    strokeDasharray="2 2"
                  />
                  {rackMode === "n-1" && activeRack.fault_injection && (
                    <ReferenceLine
                      x={activeRack.fault_injection.fault_time_s}
                      stroke="var(--danger)"
                      strokeDasharray="4 4"
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="t_cell"
                    stroke="var(--warning)"
                    strokeWidth={1.8}
                    dot={false}
                    name="T_cell"
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </CardBody>
      </Card>

      {/* Aging */}
      <Card>
        <CardHeader>
          <CardTitle>State-of-Health under BBU duty</CardTitle>
          <Disclosure summary="Why the BBU curve sits above Severson 1C/1C" className="mt-2">
            {aging.description}
          </Disclosure>
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
              hint="Cycle-fade alone would last ~67 yr — but calendar/storage fade binds first (red dashed curve below). Drag the interactive calendar model to see how heat and charge level change it."
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
                <YAxis domain={[0.45, 1.0]} stroke="" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
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
                  name="BBU float duty cycle-fade (proposal §G.3)"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="soh_calendar"
                  stroke="var(--danger)"
                  strokeWidth={1.8}
                  strokeDasharray="5 3"
                  dot={false}
                  name="Calendar/storage fade @ float SOC (years = cycle ÷ 50)"
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          {calendarSensitivity.length > 0 && (
            <Disclosure summary="Calendar vs cycle — which limit actually binds" className="mt-1">
              <CalendarWidget />
              <p className="mt-4 mb-3">
                Cycle-fade under BBU float duty crosses 80&nbsp;% SOH at ~
                {Math.round((aging.stats["cycle_life_years_at_80"] as number) ?? 0)}&nbsp;yr.
                But a backup pack sits mostly idle at high SOC, where{" "}
                <span className="text-foreground">calendar/storage fade dominates</span> —
                the red dashed curve is the Naumann-2018 √t calendar model (Arrhenius&nbsp;T ×
                monotone&nbsp;SOC) at DC-float conditions, calibrated so 80&nbsp;% SOH lands at{" "}
                <span className="text-foreground">
                  {(aging.stats["calendar_life_years_at_80"] as number) ?? 0}&nbsp;yr
                </span>{" "}
                — inside v2.2 附件&nbsp;C&rsquo;s cited 8–12&nbsp;yr LFP float life. So{" "}
                <span className="text-foreground">
                  binding life = min(cycle, calendar) = calendar ≈
                  {" "}
                  {(aging.stats["binding_life_years_at_80"] as number) ?? 0}&nbsp;yr
                </span>
                . Absolute scale is anchored to 附件&nbsp;C; the Naumann form + literature-range
                Ea (≈58&nbsp;kJ/mol) supply only the T/SOC sensitivity slope, not the headline life.
              </p>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse">
                  <thead>
                    <tr className="text-muted">
                      <th className="px-2 py-1 text-left font-medium">Calendar life (yr to 80% SOH)</th>
                      {[25, 30, 35].map((t) => (
                        <th key={t} className="px-2 py-1 text-right font-medium">
                          {t} °C
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[0.5, 0.7, 0.9].map((soc) => (
                      <tr key={soc} className="border-t border-border/40">
                        <td className="px-2 py-1 text-left">
                          SOC {Math.round(soc * 100)}%{soc === 0.9 ? " (float)" : ""}
                        </td>
                        {[25, 30, 35].map((t) => {
                          const row = calendarSensitivity.find(
                            (r) => r.soc === soc && Math.round(r.temp_c) === t,
                          );
                          return (
                            <td key={t} className="px-2 py-1 text-right tabular-nums text-foreground">
                              {row ? row.calendar_life_years_at_80.toFixed(1) : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Disclosure>
          )}
        </CardBody>
      </Card>

      {/* V7 Pack-level imbalance — mentor 2026-06-04: weakest cell drags string + thermal gradient + 2-cell/cap A/B */}
      <Card>
        <CardHeader>
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <CardTitle>Cell-to-cell imbalance &amp; thermal aging · {pi.string.n_series}S string</CardTitle>
              <Disclosure summary="Why a single representative cell isn't the whole story" className="mt-2">
                {pi.description}
              </Disclosure>
            </div>
            <span className="shrink-0 rounded-full bg-warning/15 text-warning px-3 py-1 text-xs font-medium">
              Reliability · screening
            </span>
          </div>
        </CardHeader>
        <CardBody className="space-y-6">
          {/* (1) per-cell SOH @ 7 yr — the weakest cell drags the string */}
          <div>
            <div className="mb-2 text-xs text-muted">
              Per-cell SOH after 7 yr across the {pi.string.n_series}S string (rack inlet→outlet
              gradient {pi.thermal_gradient.t_inlet_c}→{pi.thermal_gradient.t_outlet_c} °C). The{" "}
              <span className="text-danger">hottest / weakest cell</span> drags the whole series string.
            </div>
            <div className="relative flex items-end gap-1 h-36 border-b border-border/40">
              {/* 80 % replacement gate line */}
              <div
                className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-warning/60"
                style={{ bottom: `${((0.8 - 0.55) / (0.85 - 0.55)) * 100}%` }}
              >
                <span className="absolute -top-4 right-0 text-[10px] text-warning">80% gate</span>
              </div>
              {pi.string.cells.map((c) => {
                const h = ((c.soh_at_7yr - 0.55) / (0.85 - 0.55)) * 100;
                const isWeak = c.idx === pi.string.weakest_idx;
                const hotFrac =
                  (c.temp_c - pi.thermal_gradient.t_inlet_c) /
                  Math.max(1e-6, pi.thermal_gradient.t_outlet_c - pi.thermal_gradient.t_inlet_c);
                return (
                  <div
                    key={c.idx}
                    className="relative flex-1 self-stretch flex flex-col items-center justify-end"
                    title={`cell ${c.idx} · ${c.temp_c}°C · SOH@7yr ${(c.soh_at_7yr * 100).toFixed(1)}% · calendar life ${c.calendar_life_yr} yr`}
                  >
                    <div
                      className="w-full rounded-t"
                      style={{
                        height: `${Math.max(4, Math.min(100, h))}%`,
                        background: isWeak ? "var(--danger)" : "var(--success)",
                        opacity: isWeak ? 1 : 0.35 + 0.5 * (1 - hotFrac),
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted">
              <span>cell 0 · {pi.thermal_gradient.t_inlet_c}°C (cold inlet)</span>
              <span>
                cell {pi.string.n_series - 1} · {pi.thermal_gradient.t_outlet_c}°C (hot outlet)
              </span>
            </div>
          </div>

          {/* string + thermal stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label="String SOH @ 7 yr (weakest)"
              value={(pi.string.string_soh_at_7yr * 100).toFixed(1)}
              unit="%"
              tone="danger"
              hint={`vs ${(pi.string.mean_soh_at_7yr * 100).toFixed(1)}% mean — the weakest cell defines the string`}
            />
            <Stat
              label="Imbalance capacity penalty"
              value={pi.string.imbalance_penalty_pct.toFixed(1)}
              unit="%"
              tone="warning"
              hint={`active balancing recovers +${pi.string.balance_recovery_pct.toFixed(1)}% usable (JK-BMS 8S active-balance)`}
            />
            <Stat
              label="Hot-end calendar life"
              value={pi.thermal_gradient.calendar_life_hot_yr.toFixed(1)}
              unit="yr"
              tone="danger"
              hint={`vs ${pi.thermal_gradient.calendar_life_cold_yr.toFixed(1)} yr cold end — ${pi.thermal_gradient.life_spread_pct.toFixed(0)}% spread from the ${(pi.thermal_gradient.t_outlet_c - pi.thermal_gradient.t_inlet_c).toFixed(0)}°C gradient`}
            />
            <Stat
              label="Weakest cell"
              value={`#${pi.string.weakest_idx}`}
              tone="default"
              hint="series cells share current → the string is capacity-limited by this cell"
            />
          </div>

          <PackThermalWidget nSeries={pi.string.n_series} />

          {/* 2-cell + capacitor arrangement study */}
          <div className="rounded-lg border border-border bg-surface/40 p-4">
            <div className="text-sm font-medium text-foreground mb-1">
              2-cell + capacitor arrangement — a balancing study
            </div>
            <p className="text-xs text-muted mb-3">
              Two cells (weak = {pi.topology_ab.weak_cell_r_factor}× R) + two caps, two arrangements,
              under a {pi.topology_ab.transient_a} A transient. Which better protects the weak cell?
            </p>
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse w-full max-w-2xl">
                <thead>
                  <tr className="text-muted">
                    <th className="px-2 py-1 text-left font-medium">Topology</th>
                    <th className="px-2 py-1 text-right font-medium">Weak-cell transient</th>
                    <th className="px-2 py-1 text-right font-medium">Strong-cell transient</th>
                    <th className="px-2 py-1 text-right font-medium">Self-balancing?</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums text-foreground">
                  <tr className="border-t border-border/40">
                    <td className="px-2 py-1 text-left">Parallel→Series (per-cell cap)</td>
                    <td className="px-2 py-1 text-right text-success">
                      {pi.topology_ab.parallel_then_series.weak_cell_transient_a.toFixed(2)} A
                    </td>
                    <td className="px-2 py-1 text-right">
                      {pi.topology_ab.parallel_then_series.strong_cell_transient_a.toFixed(2)} A
                    </td>
                    <td className="px-2 py-1 text-right text-success">yes</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-2 py-1 text-left">Series→Parallel (shared cap)</td>
                    <td className="px-2 py-1 text-right">
                      {pi.topology_ab.series_then_parallel.weak_cell_transient_a.toFixed(2)} A
                    </td>
                    <td className="px-2 py-1 text-right">
                      {pi.topology_ab.series_then_parallel.strong_cell_transient_a.toFixed(2)} A
                    </td>
                    <td className="px-2 py-1 text-right text-muted">no</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] leading-relaxed text-muted mt-2">{pi.topology_ab.verdict}</p>
          </div>

          <p className="text-[11px] leading-relaxed text-muted">{pi.string.note}</p>
        </CardBody>
      </Card>

      {/* Model Validation — real LSTM trained on Severson 2019 + 50 PyBaMM BBU-duty cells */}
      <Card>
        <CardHeader>
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <CardTitle>Model validation · LSTM trained on Severson + PyBaMM BBU-duty</CardTitle>
              <Disclosure summary="About this model" className="mt-2">
                {modelValidation.description}
              </Disclosure>
            </div>
            <span className="shrink-0 rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-medium">
              W2 reproduction
            </span>
          </div>
        </CardHeader>
        <CardBody className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Stat
              label="LSTM Test MAPE (measured)"
              value={modelValidation.metrics.test_mape_pct.toFixed(1)}
              unit="%"
              tone="primary"
              hint={`${modelValidation.metrics.n_test} held-out cells across Severson + BBU regimes · LSTM trades single-regime sharpness for cross-regime honesty (Severson-only 13-feat bagged-GBT delivers 8.4 % paper-aligned baseline, see whitepaper §3.3.3). v2.2 §B <10 % commitment is met by the bagged-GBT ensemble path; this LSTM tile is the deployed fleet-inference engine.`}
            />
            <Stat
              label="ONNX latency · laptop CPU"
              value={modelValidation.latency.p99_ms.toFixed(2)}
              unit="ms (p99)"
              tone="success"
              hint={`FP32 p50 ${modelValidation.latency.p50_ms.toFixed(2)} ms / p99 ${modelValidation.latency.p99_ms.toFixed(2)} ms on laptop CPU · INT8 measured p50 0.23 ms / p99 0.40 ms (3.49× ONNX compression, ΔMAPE +0.10 pp) · STM32N6 NPU estimate ≤5 ms (ST X-CUBE-AI specs) · all well under 50 ms target`}
            />
            <Stat
              label="ONNX size"
              value={modelValidation.model.onnx_size_kb.toFixed(1)}
              unit="KiB"
              tone="default"
              hint={`FP32 graph; total weights 219 KiB FP32 → 63 KiB INT8 (measured) · fits STM32N6 1.6 MB ML FLASH · numerical match to PyTorch within ${modelValidation.model.onnx_torch_max_diff.toExponential(1)}`}
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
                <span className="text-foreground font-medium">90 % PI median width · </span>
                <span className="text-warning tabular-nums">
                  {Math.round(modelValidation.uncertainty.raw_median_pi_width_cycles).toLocaleString()}
                </span>{" "}
                →{" "}
                <span className="text-success tabular-nums">
                  {Math.round(modelValidation.uncertainty.conformal_median_pi_width_cycles).toLocaleString()} cycles
                </span>{" "}
                <span className="text-foreground">
                  ({(
                    (1 -
                      modelValidation.uncertainty.conformal_median_pi_width_cycles /
                        modelValidation.uncertainty.raw_median_pi_width_cycles) *
                    100
                  ).toFixed(0)}
                  % sharper)
                </span>
                <Disclosure summary="How (split conformal calibration)" className="mt-1.5">
                  MC Dropout {modelValidation.uncertainty.n_samples} samples + split conformal,
                  q ={" "}
                  <span className="text-foreground tabular-nums">
                    {modelValidation.uncertainty.conformal_q_factor.toFixed(2)}
                  </span>
                  , held-out calibration set ={" "}
                  {modelValidation.uncertainty.conformal_n_calibration} cells, coverage held{" "}
                  {((modelValidation.uncertainty.conformal_test_coverage_90pct ?? modelValidation.uncertainty.test_coverage_90pct) * 100).toFixed(0)}
                  %. Whitepaper §3.3.7.
                </Disclosure>
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
            title={`Predicted vs actual cycle life · all ${modelValidation.predicted_vs_actual.length} cells`}
            subtitle={`Split ${modelValidation.metrics.split} · ${modelValidation.metrics.n_train} train · ${modelValidation.uncertainty?.conformal_n_calibration ?? 0} calibration · ${modelValidation.metrics.n_test} test`}
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
              Cool blues = <span className="text-foreground font-medium">Severson 2019 cells</span> (100–2,000 cycles);
              warm ambers = <span className="text-foreground font-medium">PyBaMM BBU-duty cells</span> (5,000–13,000 cycles).
              The <span className="text-warning font-medium">2,000–4,000 gap</span> between them is the{" "}
              <span className="text-warning font-medium">regime gap</span>.
            </p>
            <Disclosure summary="More on the regime gap and cross-chemistry tests" className="mt-2">
              Neither lab fast-charge nor gentle float duty produces cells in the 2,000–4,000 range,
              so closing the middle would require medium-stress synthetic cells.
              Cross-chemistry transfer (NASA NMC, CALCE LCO) was tested and ruled out (whitepaper §B);
              the answer is more LFP coverage, not more chemistries. The 90 % prediction intervals
              in the walkthrough below — MC Dropout post-processed by split conformal, sharpened
              44 % vs the raw sampler while keeping coverage ≥90 % — quantify the uncertainty
              cell-by-cell across the gap.
            </Disclosure>
          </ChartCard>
          );
          })()}

          {/* Error pattern by cell lifetime — surfaces the systematic
              regression-to-mean behaviour the scatter only hints at. */}
          <ErrorByLifetimeBucket
            data={modelValidation.predicted_vs_actual}
            overallMapePct={modelValidation.metrics.test_mape_pct}
            conformalQFactor={modelValidation.uncertainty?.conformal_q_factor}
            conformalNCalibration={modelValidation.uncertainty?.conformal_n_calibration}
          />

          <div className="rounded-md border border-border bg-background/30 px-4 py-2.5">
            <Disclosure summary={<>Architecture · <span className="text-foreground">{modelValidation.model.n_parameters.toLocaleString()} parameters</span></>}>
              {modelValidation.model.architecture} · input {JSON.stringify(modelValidation.model.input_shape)}{" "}
              (cycles 2–100 × 7 features:{" "}
              <code className="text-foreground">{modelValidation.model.feature_names.join(", ")}</code>).
            </Disclosure>
          </div>
        </CardBody>
      </Card>

      {/* Inference walkthrough — pick a cell, see exactly what the LSTM did */}
      {modelValidation.walkthroughs && modelValidation.walkthroughs.length > 0 && (
        <InferenceWalkthrough walkthroughs={modelValidation.walkthroughs} />
      )}

      {/* Method panel — short tagline visible, full body collapsed */}
      <Card>
        <CardHeader>
          <CardTitle>Method · what you&rsquo;re actually looking at</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm leading-relaxed">
          <Method
            icon={<FlaskConical className="h-4 w-4" />}
            title="Physics"
            tagline={
              <>
                <span className="text-foreground font-medium">Doyle-Fuller-Newman PDE</span>,{" "}
                PyBaMM 26.4.1, <span className="text-foreground">Prada 2013 LFP</span>.
              </>
            }
            details="8 BBUs in parallel per rack split the 120 kW peak into 15 kW per BBU (6C per cell). Pack-level power is mapped onto a representative cell so the rack-peak current corresponds to ~6C on the (smaller) Prada cell — matching the 2.5 kWh / 48 V / 15S BBU spec without rebuilding the full pack. Common pitfall: dividing one BBU's 2.5 kWh by the rack's 120 kW gives a misleading 48C; the correct math is 20 kWh (8 × 2.5) ÷ 120 kW = 600 s theoretical for the 60 s graceful spec."
          />
          <Method
            icon={<Activity className="h-4 w-4" />}
            title="Hybrid split"
            tagline={
              <>
                First-order LIC equivalent + LPF,{" "}
                <span className="text-foreground font-medium">τ = 0.5 s</span>, cutoff ≈ 0.32 Hz.
              </>
            }
            details="The LIC side is represented by its R_esr × C_bulk dominant time constant (Eaton XLR 48 V / 166 F · ~5 mΩ ESR → τ ≈ 0.83 s); the demo uses τ = 0.5 s as a deliberately tighter control-law setpoint so the DC-DC pushes more high-frequency content onto the LIC than passive coupling would. Content above the cutoff goes to the LIC, the slow residual to the LFP. 10 Hz GB200 pulses sit well above the cutoff; 30–90 s graceful-shutdown events sit well below. LIC pseudo-capacitance, electrode kinetics, and self-discharge are NOT modelled here — production uses Eaton's datasheet ESR(SOC) + bulk-C(V) curves or in-the-loop measurement."
          />
          <Method
            icon={<Cpu className="h-4 w-4" />}
            title="Aging"
            tagline={
              <>
                <span className="text-foreground font-medium">Severson 2019-calibrated</span> analytic SOH fit.
              </>
            }
            details="Running a real DFN over 3,000 cycles is computationally prohibitive, so we use the analytic fit. The 0.33 BBU-duty factor reflects float operation with rare deep events — explicit in proposal §G.3."
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

function Method({
  icon,
  title,
  tagline,
  details,
}: {
  icon: React.ReactNode;
  title: string;
  tagline: React.ReactNode;
  details: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-foreground mb-2">
        <span className="text-primary">{icon}</span>
        <span className="font-medium">{title}</span>
      </div>
      <p className="text-sm text-muted leading-relaxed">{tagline}</p>
      <Disclosure summary="Why" className="mt-2">
        {details}
      </Disclosure>
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
// coverage at the cost of nudging overall test MAPE up to ~19 % from the
// Severson-only ~16 % baseline. The Short bucket (n≈4 cells) still shows
// the model's worst miss because Severson early failures are sparse.

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
  overallMapePct,
  conformalQFactor,
  conformalNCalibration,
}: {
  data: ModelValidation["predicted_vs_actual"];
  overallMapePct: number;
  conformalQFactor?: number;
  conformalNCalibration?: number;
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
        Bars = cell count, amber line = MAPE within each bucket. The{" "}
        <span className="text-warning font-medium">Short bucket</span> has the{" "}
        <span className="text-warning font-medium">largest MAPE</span> because Severson holds only a handful of{" "}
        <span className="text-foreground font-medium">early-failure cells</span>.
      </p>
      <Disclosure summary={`Why LSTM MAPE sits at ~${overallMapePct.toFixed(0)} % and how the PIs handle it`} className="mt-2">
        The Long bucket is now dominated by 50 Severson-anchored synthetic BBU-duty cells with 5,000–13,000
        cycle lifetimes — adding them widened the model&rsquo;s regime coverage so it can speak
        about the actual BBU operating point, but lifted overall test MAPE from the Severson-only
        ~16 % to {overallMapePct.toFixed(1)} % (whitepaper §3.3.7 / §3.3.8).
        The Short bucket is the clearest data gap (Severson early failures are sparse).
        Cross-chemistry transfer (NASA NMC, CALCE LCO) was tested and ruled out
        (§3.3.5 / 附錄 B); the answer is more LFP early-failure data, not more chemistries. The walkthrough above reports a 90 % prediction interval per cell —
        MC Dropout post-processed by split conformal (q_factor{" "}
        {conformalQFactor != null ? conformalQFactor.toFixed(2) : "0.56"}{" "}
        on a {conformalNCalibration ?? 37}-cell calibration set, §3.3.7), sharpened 44 % vs raw
        while keeping coverage ≥90 %.
      </Disclosure>
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
                <span className="text-foreground font-medium">{walkthroughs.length} cells</span> across{" "}
                <span className="text-foreground font-medium">four prediction states</span>{" "}
                (healthy / warning / early_aging / critical), each with a{" "}
                <span className="text-success font-medium">90 % conformal-sharpened PI</span>.
              </p>
              <Disclosure summary="How the buckets and PIs work" className="mt-2">
                /dashboard groups live devices by current physical state (SOH / RUL / temp) into
                three buckets; the walkthrough buckets training cells by <em>predicted</em> cycle
                life — which is why <span className="text-foreground">critical</span> appears
                here but not on /dashboard. Each prediction carries a 90 % prediction interval
                via Monte Carlo Dropout (100 forward passes with active dropout) post-processed
                by split conformal — wide PIs for tail cells like <em>critical</em> are the
                model honestly reporting it has limited training signal there, narrow PIs for
                healthy cells reflect actual confidence.
              </Disclosure>
              <Disclosure summary="Regime mix · Severson b1–3 vs Severson-anchored synthetic bbu_* cells" className="mt-1">
                <span className="text-foreground">Severson fast-charge cells</span> (b1/b2/b3 IDs,
                3.6C–8C, lab-stress lifetimes 100–2,000 cycles) and{" "}
                <span className="text-foreground">Severson-anchored synthetic BBU-duty cells</span>{" "}
                (bbu_* IDs, ~0.05C float, ~50 cycles/yr → 5,000–13,000 cycle lifetimes).{" "}
                <span className="text-warning">
                  Synthetic cells use an analytic Severson-fit SOH curve + per-cell noise,
                  NOT PyBaMM aging (full PyBaMM 100 cells × 10k cycles is computationally
                  prohibitive). They serve as <em>regime augmentation</em> only — production
                  evidence rests on real Severson cells.
                </span>{" "}
                The LSTM trains on both regimes (188 cells total) so it can speak about the
                actual BBU operating point — pick a `bbu_*` cell to see what the model
                predicts on the regime your customer&rsquo;s pack will live in. Whitepaper
                §3.3.5 covers the calibration methodology.
              </Disclosure>
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
              <span className="text-foreground font-medium">All seven LSTM input features</span>, normalised per-line to{" "}
              <span className="text-foreground font-medium">[0, 1]</span>. Hover for raw values.
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

