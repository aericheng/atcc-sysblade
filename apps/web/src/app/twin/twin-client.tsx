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
import { PlainInline, GlossaryPanel } from "@/components/ui/plain";
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
  { key: "cycle_norm",  label: "循環進度",     unit: "0–1",     color: "#94a3b8" }, // slate
  { key: "qd_max",      label: "放電容量", unit: "Ah",      color: "#6366f1" }, // indigo
  { key: "qd_range",    label: "Qd 範圍",           unit: "Ah",      color: "#a78bfa" }, // violet
  { key: "v_mean",      label: "平均電壓",       unit: "V",       color: "#22d3ee" }, // cyan
  { key: "v_std",       label: "電壓波動",      unit: "V (std)", color: "#34d399" }, // emerald
  { key: "t_max",       label: "峰值溫度",   unit: "°C",      color: "#fbbf24" }, // amber
  { key: "duration_s",  label: "循環時長",     unit: "s",       color: "#f87171" }, // red
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
      <ChartCard
        title="電芯電壓（V）"
        subtitle="ms 級解析度 PyBaMM DFN 求解 · Prada2013 LFP"
        plain="線越平越好 — 綠色（混合）比黃色（純電池）穩得多。"
      >
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={sweptData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <ReferenceArea
              x1={4} x2={6} fill="rgba(99,102,241,0.06)" stroke="none"
              label={{ value: "穩態視窗", position: "insideTopLeft", fill: "var(--muted)", fontSize: 10 }}
            />
            <XAxis dataKey="t" type="number" domain={xDomain} tickFormatter={(v) => `${v} 秒`} stroke="" allowDataOverflow />
            <YAxis
              domain={[3.05, 3.5]} stroke="" tickFormatter={(v) => v.toFixed(2)}
              label={{ value: "電芯電壓 (V)", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 11 }}
            />
            <Tooltip content={<DarkTooltip />} />
            <Line
              type="monotone"
              dataKey="v"
              stroke={mode === "hybrid" ? "var(--success)" : "var(--warning)"}
              strokeWidth={1.2}
              dot={false}
              name="電芯電壓"
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
          <span className="text-foreground font-medium">標示區間 [4 s, 6 s]</span> = 穩態視窗。游標懸停以暫停掃描並讀取數值。
        </p>
      </ChartCard>

      <ChartCard
        title={mode === "hybrid" ? "功率分流：總功率 → LIC + LFP" : "功率：完整曲線經由 LFP"}
        subtitle={mode === "hybrid" ? "低通濾波器 τ = 0.5 s · 截止 ≈ 0.32 Hz · 更高頻成分皆導向 LIC" : "無濾波 — 單級路徑"}
        plain={
          mode === "hybrid"
            ? "快於 0.5 秒的變化給電容，慢的給電池。"
            : "沒有分流 — 電池硬吃每一次跳動。"
        }
      >
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={sweptData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" type="number" domain={xDomain} tickFormatter={(v) => `${v} 秒`} stroke="" allowDataOverflow />
            <YAxis stroke="" tickFormatter={(v) => `${v} kW`} />
            <Tooltip content={<DarkTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
            <Line
              type="linear"
              dataKey="p_total"
              stroke="var(--muted)"
              strokeWidth={0.8}
              dot={false}
              name="機架總功率"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="p_lfp"
              stroke="var(--primary)"
              strokeWidth={1.6}
              dot={false}
              name={mode === "hybrid" ? "電池承受的功率（已平滑）" : "電池承受的功率（完整）"}
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
          title="LIC 電容組電壓（閉合解形式 RC 模型）"
          subtitle={`Eaton XLR 48 V × 2 並聯 · C = ${(licCF ?? 0).toFixed(0)} F · ESR = ${((licESR ?? 0) * 1000).toFixed(2)} mΩ · 觀測 v_min ${(licVMin ?? 0).toFixed(2)} V · ${licPassesCutoff ? "通過" : "未通過"} UVLO @ ${licCutoffV.toFixed(0)} V`}
          plain="綠線離紅色保護線越遠越安全 — 餘裕充足。"
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={sweptData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="t" type="number" domain={xDomain} tickFormatter={(v) => `${v} 秒`} stroke="" allowDataOverflow />
              <YAxis
                domain={[licCutoffV - 1, licNominalV + 1.5]}
                stroke=""
                tickFormatter={(v) => v.toFixed(0)}
                label={{ value: "電容組電壓 (V)", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 11 }}
              />
              <Tooltip content={<DarkTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
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
                  value: `保護門檻 ${licCutoffV.toFixed(0)} V（UVLO）`,
                  position: "insideTopRight",
                  fill: "var(--danger)",
                  fontSize: 11,
                }}
                ifOverflow="extendDomain"
              />
              <ReferenceLine
                y={licNominalV}
                stroke="var(--muted)"
                strokeDasharray="2 4"
                strokeWidth={0.8}
                label={{
                  value: `額定 ${licNominalV.toFixed(1)} V`,
                  position: "insideTopRight",
                  fill: "var(--muted)",
                  fontSize: 11,
                }}
              />
              <Line
                type="monotone"
                dataKey="v_lic"
                stroke="var(--success)"
                strokeWidth={1.6}
                dot={false}
                name="電容組電壓"
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
            從最壞情況壓降到 Eaton XLR UVLO 之間有{" "}
            <span className="text-success font-medium">{(licHeadroomV ?? 0).toFixed(2)} V 餘量</span>。壓降{" "}
            <span className="text-foreground">由 ESR 主導</span>：{" "}
            {(((licPeakKw ?? 0) * 1000) / (licNominalV ?? 51.3)).toFixed(0)} A 峰值 ×{" "}
            {((licESR ?? 0) * 1000).toFixed(2)} mΩ ≈ {(licDroopV ?? 0).toFixed(2)} V，
            而累積電荷項（∫i·dt / C）在峰值能量偏移時貢獻剩餘的約 0.78 V。量產階段會與
            Eaton 在迴路中驗證 ESR(SOC) + bulk-C(V) 曲線。
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
    <div className="space-y-12 reveal-stagger">
      <header className="relative space-y-3">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-6 left-0 -z-10 h-44 w-44 rounded-full bg-primary/15 blur-[100px]"
        />
        <div className="text-xs uppercase tracking-[0.22em] text-primary font-medium">電池數位孿生 · PyBaMM DFN (LFP) + 一階 LIC 等效模型</div>
        <div className="accent-rule bg-primary mt-3 mb-1" />
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-[1.1]">
          解決 <span className="gradient-text">GB200 毫秒級瞬變</span>。
        </h1>
        <p className="text-sm sm:text-base text-muted max-w-3xl leading-relaxed">
          電池的<span className="text-foreground font-medium">數位孿生</span>：物理模型重現真實電池行為，
          已對齊公開實測與原廠規格書。切換按鈕，看<span className="text-success font-medium">電容分流讓電池輕鬆多少</span>。
        </p>
        <p className="text-xs text-muted max-w-3xl leading-relaxed">
          方法：PyBaMM DFN 求解 LFP 電芯 · LIC 側以 R<sub>esr</sub> × C<sub>bulk</sub> 等效模型表示（資料表為基準，非電化學模型）
          · 情境：單一機架、80 kW 基準、每 100 ms ±30 % 方波脈衝
        </p>
      </header>

      {/* Plain-language glossary for this page's recurring terms. */}
      <GlossaryPanel
        termKeys={[
          "digital_twin", "pybamm_dfn", "lfp", "lic", "transient", "c_rate", "uvlo", "graceful",
          "n_redundancy", "soh", "rul", "calendar_aging", "severson", "lstm", "mape", "onnx_int8",
        ]}
      />

      {/* Mode toggle */}
      <div className="flex flex-wrap rounded-lg border border-border bg-surface/50 p-1 max-w-full sm:inline-flex sm:w-auto">
        <ModeButton active={mode === "lfp"} onClick={() => setMode("lfp")} label="僅 LFP（基準）" />
        <ModeButton active={mode === "hybrid"} onClick={() => setMode("hybrid")} label="LFP + LIC 混合" />
      </div>

      {/* Main scenario card */}
      <Card>
        <CardHeader>
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <CardTitle>{mode === "hybrid" ? "混合 · 功率分流 + 電芯響應" : "基準 · 純 LFP 電芯響應"}</CardTitle>
              <Disclosure summary="您看到的是什麼" className="mt-2">
                {mode === "hybrid"
                  ? "DC-DC 控制律將 LPF 截止頻率(≈0.32 Hz,τ=0.5 s)以上的高頻成分導入鋰離子電容;LFP 電池組只承受平滑後的平均功率,電芯電壓維持在平台區、電極應力下降,預期循環壽命延長 ~25 %(提案 §A;此 25 % 主要來自 BBU 低負載排程 §G.3 duty_factor 0.33)。模型範圍:PyBaMM DFN 僅求解 LFP 電芯,LIC 以一階 R_esr × C_bulk 等效模型表示,量產時以 Eaton XLR 資料表曲線驗證。"
                  : "基準情境:傳統純電池 BBU 承受完整的 ±30 % 功率波動,LFP 電芯電壓追隨每個脈衝,使化學體系承受應力並增加局部發熱。"}
              </Disclosure>
              <PlainInline className="mt-2">
                快的波動給電容、慢的平均給電池 — 電池只承受平滑後的功率。
              </PlainInline>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                mode === "hybrid" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
              }`}
            >
              {mode === "hybrid" ? "含 LIC" : "不含 LIC"}
            </span>
          </div>
        </CardHeader>
        <CardBody className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label="電芯電壓峰對峰值（穩態）"
              value={
                mode === "hybrid" ? (stableHybrid * 1000).toFixed(1) : (stableLfp * 1000).toFixed(1)
              }
              unit="mV"
              tone={mode === "hybrid" ? "success" : "warning"}
              hint={mode === "hybrid" ? `較基準低 ${reduction.toFixed(1)}×` : "電芯追隨每一個瞬態脈衝"}
            />
            <Stat
              label="功率標準差 → LFP"
              value={mode === "hybrid" ? pStdHybrid.toFixed(1) : pStdLfp.toFixed(1)}
              unit="kW"
              tone={mode === "hybrid" ? "success" : "warning"}
              hint={mode === "hybrid" ? `電流平滑 ${pReduction.toFixed(1)}×` : "完整 ±30 % 波動皆經過電芯"}
            />
            <Stat
              label="LIC 峰值能量偏移"
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
                  ? `∫p_lic·dt 運行最大值 · 相對於額定 LIC 容量有 ${(hybrid.stats.lic_headroom_ratio ?? 0).toFixed(0)}× 餘量`
                  : "基準情況下未啟用"
              }
            />
            <Stat
              label="LIC 電壓壓降（RC 模型）"
              value={
                mode === "hybrid"
                  ? (hybrid.stats.lic_v_droop_v ?? 0).toFixed(2)
                  : "—"
              }
              unit={mode === "hybrid" ? "V（相對額定）" : ""}
              tone={
                mode === "hybrid"
                  ? (hybrid.stats.lic_passes_cutoff ? "success" : "danger")
                  : "default"
              }
              hint={
                mode === "hybrid"
                  ? `閉合解形式 RC · C ${(hybrid.stats.lic_c_f ?? 0).toFixed(0)} F · ESR ${((hybrid.stats.lic_esr_ohm ?? 0) * 1000).toFixed(2)} mΩ · v_min ${(hybrid.stats.lic_v_min ?? 0).toFixed(2)} V（距 Eaton XLR ${(hybrid.stats.lic_v_min_datasheet ?? 0).toFixed(0)} V 截止有 ${(hybrid.stats.lic_headroom_to_cutoff_v ?? 0).toFixed(1)} V）`
                  : "基準情況下未啟用"
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
              <CardTitle>市電中斷 · 機架尺度 60 s 平緩降載</CardTitle>
              <Disclosure summary="您看到的是什麼" className="mt-2">
                {"以模擬資料對應 whitepaper §2.1.1 動態降載敘事。階段 A(0–0.5 s):LIC 主導的峰值保持,每 BBU 6 C 脈衝(在車規 LFP 資料表 5–10 C 脈衝規格內);階段 B(0.5–2.0 s):隨 GPU 降頻,從 120 kW 線性降至 30 kW;階段 C(2.0–60 s):30 kW 連續 = 每 BBU 1.5 C(在 1–3 C 連續規格內)。GPU power-cap 收斂時間為工程佔位值,量產前須於 GB200 / Bluefield BMC 實機量測(HANDOVER §6 待解問題)。"}
              </Disclosure>
              <PlainInline className="mt-2">
                突然斷電：電容扛第一秒尖峰，電池撐滿 60 秒 — 存檔完成再關機。
              </PlainInline>
            </div>
            <span className="shrink-0 rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-medium">
              模擬 · 以物理為基準
            </span>
          </div>
        </CardHeader>
        <CardBody className="space-y-6">
          {mainsFail.aged && (
            <div>
              <div className="text-sm font-medium text-foreground mb-1">
                若市電中斷，機架能維持供電多久 — 現在以及歷經數年老化之後？
              </div>
              <p className="text-xs text-muted mb-3">
                這是資料中心採購方最先問的唯一問題。拖動電池組的健康狀態 —
                備援續航時間直到壽命末期都遠高於 60 秒優雅關機承諾。
              </p>
              <AgedPowerWidget />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label="已用能量 vs 機架容量"
              value={((mainsFail.stats.dod_pct as number) ?? 0).toFixed(2)}
              unit={`% / ${(((mainsFail.stats.energy_capacity_kj as number) ?? 0) / 3600).toFixed(0)} kWh`}
              tone="success"
              hint={`已輸出 ${((mainsFail.stats.energy_delivered_kj as number) ?? 0).toFixed(0)} kJ · 相對於每機架 20 kWh LFP 容量有 ${((mainsFail.stats.energy_headroom_ratio as number) ?? 0).toFixed(0)}× 餘量`}
            />
            <Stat
              label="每 BBU C-rate"
              value={`${((mainsFail.stats.peak_c_rate_per_bbu as number) ?? 0).toFixed(0)} / ${((mainsFail.stats.continuous_c_rate_per_bbu as number) ?? 0).toFixed(1)}`}
              unit="C 峰值 / 連續"
              tone="primary"
              hint={`${((mainsFail.stats.p_peak_per_bbu_kw as number) ?? 0).toFixed(0)} kW × ${(mainsFail.stages?.peak_hold_s ?? 0.5).toFixed(1)} s 脈衝（在車規 LFP 5-10 C 脈衝規格內）· ${((mainsFail.stats.p_continuous_per_bbu_kw as number) ?? 0).toFixed(2)} kW 連續（在 1-3 C 連續規格內）`}
            />
            <Stat
              label="LIC 壓降 @ t = 0"
              value={((mainsFail.stats.lic_v_droop_v as number) ?? 0).toFixed(2)}
              unit="V（相對額定）"
              tone={mainsFail.stats.lic_passes_cutoff ? "success" : "danger"}
              hint={`v_min ${((mainsFail.stats.lic_v_min as number) ?? 0).toFixed(2)} V · 距 Eaton XLR ${((mainsFail.stats.lic_v_min_datasheet as number) ?? 0).toFixed(0)} V 截止有 ${((mainsFail.stats.lic_headroom_to_cutoff_v as number) ?? 0).toFixed(1)} V 餘量（2× XLR-48-166 並聯）`}
            />
            <Stat
              label="LFP 電芯電壓波動"
              value={(((mainsFail.stats.v_cell_swing as number) ?? 0) * 1000).toFixed(0)}
              unit="mV 峰對峰值"
              tone="default"
              hint={`v_min ${((mainsFail.stats.v_cell_min as number) ?? 0).toFixed(3)} V → v_max ${((mainsFail.stats.v_cell_max as number) ?? 0).toFixed(3)} V · LFP 在整個 60 s 降載過程中維持在平台區`}
            />
          </div>

          {mainsFail.aged && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
              <div className="text-sm font-medium text-foreground mb-1">
                全新 vs 壽命末期備援的詳細比較
              </div>
              <p className="text-xs text-muted mb-3">
                上方四項數據是<span className="text-foreground">全新</span>電池組。
                客戶真正關心的是第 7 年 / EOL：當市電在歷經數年老化後中斷，
                還剩多少功率與續航？以 DCIR 成長（在{" "}
                {Math.round((mainsFail.aged.aged_soh ?? 0.8) * 100)}% SOH 時 +
                {Math.round((mainsFail.aged.dcir_growth ?? 0.5) * 100)}%）+ 容量衰減建模。
              </p>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse w-full max-w-lg">
                  <thead>
                    <tr className="text-muted">
                      <th className="px-2 py-1 text-left font-medium">指標</th>
                      <th className="px-2 py-1 text-right font-medium">BoL（全新）</th>
                      <th className="px-2 py-1 text-right font-medium">{mainsFail.aged.aged_label}</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums text-foreground">
                    <tr className="border-t border-border/40">
                      <td className="px-2 py-1 text-left">機架峰值時的備援續航時間</td>
                      <td className="px-2 py-1 text-right">
                        {Math.round(mainsFail.aged.backup_runtime_s_bol_peakbasis)} s
                      </td>
                      <td className="px-2 py-1 text-right text-warning">
                        {Math.round(mainsFail.aged.backup_runtime_s_eol_peakbasis)} s
                      </td>
                    </tr>
                    <tr className="border-t border-border/40">
                      <td className="px-2 py-1 text-left">… 相對 60 s 承諾的餘量</td>
                      <td className="px-2 py-1 text-right">
                        {(mainsFail.aged.backup_runtime_s_bol_peakbasis / 60).toFixed(0)}×
                      </td>
                      <td className="px-2 py-1 text-right">
                        {(mainsFail.aged.runtime_margin_vs_commitment_eol ?? 8).toFixed(0)}×
                      </td>
                    </tr>
                    <tr className="border-t border-border/40">
                      <td className="px-2 py-1 text-left">LFP 峰值功率能力</td>
                      <td className="px-2 py-1 text-right">100%</td>
                      <td className="px-2 py-1 text-right text-warning">
                        {Math.round((mainsFail.aged.peak_power_retention ?? 0.667) * 100)}%
                      </td>
                    </tr>
                    <tr className="border-t border-border/40">
                      <td className="px-2 py-1 text-left">連續供電維持（1.5 C）</td>
                      <td className="px-2 py-1 text-right">維持</td>
                      <td className="px-2 py-1 text-right">維持</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] leading-relaxed text-muted mt-2">{mainsFail.aged.model?.note}</p>
            </div>
          )}

          <ChartCard
            title="機架功率分流 · 0-60 s"
            subtitle={`Stage A 0-${(mainsFail.stages?.peak_hold_s ?? 0.5).toFixed(1)} s 峰值保持 · Stage B 於 ${(mainsFail.stages?.ramp_s ?? 1.5).toFixed(1)} s 內線性降載 ${(mainsFail.stages?.peak_kw ?? 120).toFixed(0)} → ${(mainsFail.stages?.continuous_kw ?? 30).toFixed(0)} kW · Stage C ${(mainsFail.stages?.continuous_kw ?? 30).toFixed(0)} kW 連續`}
            plain="藍色（電容）扛開頭尖峰，綠色（電池）接手長尾。"
          >
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rampPowerData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={[0, 60]} stroke="" tickFormatter={(v) => `${v.toFixed(0)} 秒`} />
                <YAxis stroke="" tickFormatter={(v) => `${v} kW`} />
                <Tooltip content={<DarkTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
                <Line type="monotone" dataKey="p_total" stroke="var(--warning)" strokeWidth={1.6} dot={false} name="機架總功率" isAnimationActive={false} />
                <Line type="monotone" dataKey="p_lfp" stroke="var(--success)" strokeWidth={1.6} dot={false} name="LFP 電池組" isAnimationActive={false} />
                <Line type="monotone" dataKey="p_lic" stroke="var(--primary)" strokeWidth={1.4} dot={false} name="LIC 電容組" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="LIC 電容組電壓包絡 · 閉合解形式 RC"
            subtitle={`2× Eaton XLR-48-166 並聯 · v_nominal 51.3 V · 資料表截止 ${((mainsFail.stats.lic_v_min_datasheet as number) ?? 38).toFixed(0)} V`}
            plain="全程遠離紅色保護線 — 餘裕充足。"
          >
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={rampLicData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={[0, 60]} stroke="" tickFormatter={(v) => `${v.toFixed(0)} 秒`} />
                <YAxis domain={[35, 55]} stroke="" tickFormatter={(v) => `${v} V`} />
                <Tooltip content={<DarkTooltip />} />
                <ReferenceLine
                  y={(mainsFail.stats.lic_v_min_datasheet as number) ?? 38}
                  stroke="var(--danger)"
                  strokeDasharray="4 4"
                  label={{
                    value: `保護門檻 ${((mainsFail.stats.lic_v_min_datasheet as number) ?? 38).toFixed(0)} V（UVLO）`,
                    position: "insideTopRight",
                    fill: "var(--danger)",
                    fontSize: 11,
                  }}
                />
                <Line type="monotone" dataKey="v_lic" stroke="var(--primary)" strokeWidth={1.8} dot={false} name="電容組電壓" isAnimationActive={false} />
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
              <CardTitle>機架尺度 60s 平緩降載 · 正常 vs N-1 故障注入</CardTitle>
              <Disclosure summary="您看到的是什麼" className="mt-2">
                {rackMode === "n-1"
                  ? "V4 故障注入模擬:60 s graceful 事件中於 t=15.0 s 強制 1 台 BBU 離線,由剩餘 7 台分擔原本 8 台的負載。故障後每 BBU 連續 C-rate 由 1.50 C 升至 1.71 C(車規 LFP 連續安全上限 2.5 C → PASS)。整 rack N-1 容錯在實體上極難重現,孿生層只需調整 n_bbu_arr 即可直接驗證。"
                  : "V3 整 rack 60 s graceful 整合模擬:8 BBU 並聯 + LIC bank(2× Eaton XLR-48-166 並聯)+ 一階互補濾波器 τ=0.5 s + GPU power-cap 三段降載(峰值保持 0.5 s / 線性降載 1.5 s / 連續 58 s)+ 集總電芯熱模型。每 BBU 峰值 6.0 C 脈衝 < 2 s、連續 1.50 C,皆在車規 LFP 資料表允許區內。"}
              </Disclosure>
              <PlainInline className="mt-2">
                故意弄壞 1 台：剩 7 台照樣完成 60 秒任務，出力仍在上限內。
              </PlainInline>
            </div>
            <span className="shrink-0 rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-medium">
              V3 / V4 · 孿生驗證 · 模擬資料
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
              V3 · 正常（8 BBU 對稱）
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
              V4 · N-1 故障 @ t={activeRack.fault_injection?.fault_time_s ?? 15}s（7 BBU）
            </button>
          </div>

          {/* Stats grid — same layout for both modes, V4 stats fall back when not present */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label={rackMode === "n-1" ? "故障後每 BBU C-rate" : "每 BBU C-rate"}
              value={
                rackMode === "n-1"
                  ? ((activeRack.stats.c_rate_continuous_post_fault as number | undefined) ?? 0).toFixed(2)
                  : ((activeRack.stats.continuous_c_rate_per_bbu as number | undefined) ?? 0).toFixed(2)
              }
              unit="C 連續"
              tone={
                rackMode === "n-1"
                  ? activeRack.pass_criteria?.pass_c_rate
                    ? "success"
                    : "danger"
                  : "primary"
              }
              hint={
                rackMode === "n-1"
                  ? `相對 8-BBU 基準 +${((activeRack.stats.c_rate_post_increase_pct as number | undefined) ?? 0).toFixed(0)}% · 上限 ${activeRack.pass_criteria?.c_rate_continuous_post_limit ?? 2.5}C 車規 LFP 連續規格`
                  : `${((activeRack.stats.p_continuous_per_bbu_kw as number | undefined) ?? 0).toFixed(2)} kW × 58 s 連續（在 1-3 C 車規 LFP 規格內）`
              }
            />
            <Stat
              label="T_cell 相對環境溫升"
              value={((activeRack.stats.t_cell_rise_c as number | undefined) ?? 0).toFixed(2)}
              unit={`K（最高 ${((activeRack.stats.t_cell_max_c as number | undefined) ?? 25).toFixed(1)} °C）`}
              tone={activeRack.thermal_model?.passes_thermal_limit ? "success" : "danger"}
              hint={`集總電芯熱模型 · 環境 ${activeRack.thermal_model?.t_ambient_c ?? 25} °C · 警告 ${activeRack.thermal_model?.t_warning_c ?? 50} °C · whitepaper §6.1`}
            />
            <Stat
              label="LFP 電芯電壓波動"
              value={(((activeRack.stats.v_cell_swing_v as number | undefined) ?? 0) * 1000).toFixed(0)}
              unit="mV 峰對峰值"
              tone={
                rackMode === "n-1"
                  ? activeRack.pass_criteria?.pass_v_swing
                    ? "success"
                    : "danger"
                  : "default"
              }
              hint={
                rackMode === "n-1"
                  ? `上限 ${(((activeRack.pass_criteria?.v_cell_swing_limit_v as number | undefined) ?? 0.5) * 1000).toFixed(0)} mV（降級模式採 2× V3 預算）`
                  : "LFP 在整個 60 s 降載過程中維持在平台區"
              }
            />
            <Stat
              label="LIC 壓降"
              value={((activeRack.stats.v_lic_droop_v as number | undefined) ?? 0).toFixed(2)}
              unit="V（相對額定）"
              tone={activeRack.pass_criteria?.pass_lic_headroom !== false ? "success" : "danger"}
              hint={`v_min ${((activeRack.stats.v_lic_min as number | undefined) ?? 0).toFixed(2)} V · 距 UVLO 38 V 有 ${((activeRack.stats.v_lic_headroom_to_uvlo_v as number | undefined) ?? 0).toFixed(2)} V 餘量 · LIC 電容組不受 BBU 損失影響`}
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
                {activeRack.pass_criteria.overall_pass ? "N-1 冗餘通過" : "N-1 冗餘未通過"}
              </span>
              {" — "}
              {activeRack.headline_verdict}
            </div>
          )}

          <ChartCard
            title={
              rackMode === "n-1"
                ? `機架功率分流 · 於 t=${activeRack.fault_injection?.fault_time_s ?? 15}s 注入故障`
                : "機架功率分流 · 0–60 s（正常 8 BBU 對稱）"
            }
            subtitle={`Stage A ${(activeRack.stages?.peak_hold_s ?? 0.5).toFixed(1)} s 峰值保持 · Stage B 線性降載 ${(activeRack.stages?.peak_kw ?? 120).toFixed(0)} → ${(activeRack.stages?.continuous_kw ?? 30).toFixed(0)} kW · Stage C ${(activeRack.stages?.continuous_kw ?? 30).toFixed(0)} kW 連續`}
            plain={
              rackMode === "n-1"
                ? "紅線處一台故障 — 曲線幾乎不動。"
                : "電容接尖峰、電池接長尾。"
            }
          >
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={rackPowerData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={[0, 60]} stroke="" tickFormatter={(v) => `${v.toFixed(0)} 秒`} />
                <YAxis stroke="" tickFormatter={(v) => `${v} kW`} />
                <Tooltip content={<DarkTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
                {rackMode === "n-1" && activeRack.fault_injection && (
                  <ReferenceLine
                    x={activeRack.fault_injection.fault_time_s}
                    stroke="var(--danger)"
                    strokeDasharray="4 4"
                    label={{
                      value: `1 台故障（${activeRack.fault_injection.n_bbu_normal} → ${activeRack.fault_injection.n_bbu_degraded} 台）`,
                      position: "insideTopRight",
                      fill: "var(--danger)",
                      fontSize: 11,
                    }}
                  />
                )}
                <Line type="monotone" dataKey="p_total" stroke="var(--warning)" strokeWidth={1.6} dot={false} name="機架總功率" isAnimationActive={false} />
                <Line type="monotone" dataKey="p_lfp" stroke="var(--success)" strokeWidth={1.6} dot={false} name="LFP 電池組" isAnimationActive={false} />
                <Line type="monotone" dataKey="p_lic" stroke="var(--primary)" strokeWidth={1.4} dot={false} name="LIC 電容組" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="每 BBU LFP 功率"
            subtitle={
              rackMode === "n-1"
                ? `存活的 BBU 在 t=${activeRack.fault_injection?.fault_time_s ?? 15}s 之後分擔機架負載；階躍上升反映負載重分配`
                : "8-BBU 對稱負載 — 所有 BBU 承受相同的縮放電流"
            }
            plain={
              rackMode === "n-1"
                ? "故障後每台多扛約 14 % — 仍在安全區。"
                : "八台平分 — 每台都很輕鬆。"
            }
          >
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={rackPerBbuData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" domain={[0, 60]} stroke="" tickFormatter={(v) => `${v.toFixed(0)} 秒`} />
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
                  name="每台 BBU 功率"
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {rackThermalData.length > 0 && (
            <ChartCard
              title="電芯熱軌跡 · 集總熱容 + 對流冷卻"
              subtitle={`I²·R_int 加熱 vs h·A·ΔT 冷卻 · 電芯 C_th 70 J/K · R_int 8 mΩ · 環境 ${activeRack.thermal_model?.t_ambient_c ?? 25} °C`}
              plain="溫升不到 1 度 — 離警告線很遠。"
            >
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={rackThermalData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="t" type="number" domain={[0, 60]} stroke="" tickFormatter={(v) => `${v.toFixed(0)} 秒`} />
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
                      value: `警告線 ${activeRack.thermal_model?.t_warning_c ?? 50} °C`,
                      position: "insideTopRight",
                      fill: "var(--danger)",
                      fontSize: 11,
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
          <CardTitle>BBU 工作模式下的健康狀態</CardTitle>
          <Disclosure summary="為何 BBU 曲線高於 Severson 1C/1C" className="mt-2">
            {"容量衰減曲線校準至 Severson 2019 LFP 平均行為。BBU duty 採 0.33 有效循環因子:日曆循環 N 對應 N × 0.33 等效滿循環,因此 80 % SOH 的日曆年齡遠晚於等效 1C/1C 實驗。循環衰減並非 DC 備援工況的約束條件 — 電池組多半在高 SOC 閒置,由日曆/儲存衰減主導。soh_calendar 疊加 Naumann-2018 √t 日曆模型(Arrhenius T × 單調 SOC),校準至 80 % SOH 落在 ~10 yr(對應 v2.2 附件 C 的 8–12 yr LFP 浮充壽命);soh_binding = min(循環, 日曆) 即客戶實際所見。"}
          </Disclosure>
          <PlainInline className="mt-2">
            備援模式下電池老得很慢 — 真正的壽命上限是日曆老化，約 10 年。
          </PlainInline>
        </CardHeader>
        <CardBody className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Stat
              label="SOH @ 2,400 BBU 循環"
              value={`${(((aging.stats["soh_at_2400_bbu_cycles"] as number) ?? 0) * 100).toFixed(1)}`}
              unit="%"
              tone="success"
              hint="高於 80 % 業界汰換閾值"
            />
            <Stat
              label="跌破 80 % SOH 的循環數"
              value={Math.round((aging.stats["cycle_at_80pct_soh_bbu"] as number) ?? 0)}
              unit="循環"
              tone="primary"
              hint="僅以循環衰減計算可達約 67 年 — 但日曆 / 儲存衰減會先成為瓶頸（下方紅色虛線曲線）。拖動互動式日曆模型，觀察熱與充電水平如何改變它。"
            />
            <Stat
              label="拐點（全循環參考）"
              value={Math.round((aging.stats["knee_cycle"] as number) ?? 0)}
              unit="循環"
              hint="Severson 2019 校準點"
            />
          </div>
          <ChartCard
            title="容量衰減 · 3,000 循環視野"
            plain="綠線（實際工況）老得慢 — 真正的上限是紅線：日曆老化約 10 年。"
          >
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={agingData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="cycle" type="number" stroke="" tickFormatter={(v) => `${v}`} />
                <YAxis domain={[0.45, 1.0]} stroke="" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                <Tooltip content={<DarkTooltip percent />} />
                <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
                <Line
                  type="monotone"
                  dataKey="soh_full"
                  stroke="var(--warning)"
                  strokeWidth={1.4}
                  dot={false}
                  name="完整 1C/1C 循環（Severson 參考）"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="soh_bbu"
                  stroke="var(--success)"
                  strokeWidth={1.8}
                  dot={false}
                  name="BBU 浮充工作模式循環衰減（提案 §G.3）"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="soh_calendar"
                  stroke="var(--danger)"
                  strokeWidth={1.8}
                  strokeDasharray="5 3"
                  dot={false}
                  name="浮充 SOC 下的日曆 / 儲存衰減（年 = 循環 ÷ 50）"
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          {calendarSensitivity.length > 0 && (
            <Disclosure summary="日曆 vs 循環 — 究竟哪個限制先成為瓶頸" className="mt-1">
              <CalendarWidget />
              <p className="mt-4 mb-3">
                BBU 浮充工作模式下的循環衰減在約{" "}
                {Math.round((aging.stats["cycle_life_years_at_80"] as number) ?? 0)}&nbsp;年跌破 80&nbsp;% SOH。
                但備援電池組大多在高 SOC 下閒置，此時{" "}
                <span className="text-foreground">日曆 / 儲存衰減占主導</span> —
                紅色虛線曲線即為 DC 浮充條件下的 Naumann-2018 √t 日曆模型（Arrhenius&nbsp;T ×
                單調&nbsp;SOC），經校準使 80&nbsp;% SOH 落在{" "}
                <span className="text-foreground">
                  {(aging.stats["calendar_life_years_at_80"] as number) ?? 0}&nbsp;年
                </span>{" "}
                — 在 v2.2 附件&nbsp;C 所引用的 8–12&nbsp;年 LFP 浮充壽命範圍內。因此{" "}
                <span className="text-foreground">
                  瓶頸壽命 = min(cycle, calendar) = calendar ≈
                  {" "}
                  {(aging.stats["binding_life_years_at_80"] as number) ?? 0}&nbsp;年
                </span>
                。絕對尺度以附件&nbsp;C 為基準；Naumann 形式 + 文獻範圍的
                Ea（≈58&nbsp;kJ/mol）僅提供 T/SOC 敏感度斜率，而非主要的壽命數字。
              </p>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse">
                  <thead>
                    <tr className="text-muted">
                      <th className="px-2 py-1 text-left font-medium">日曆壽命（至 80% SOH 的年數）</th>
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
                          SOC {Math.round(soc * 100)}%{soc === 0.9 ? "（浮充）" : ""}
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
              <CardTitle>電芯間不平衡與熱老化 · {pi.string.n_series}S 串列</CardTitle>
              <Disclosure summary="為何單一代表性電芯不足以說明全貌" className="mt-2">
                {"對單一電芯老化模型無法表達的電池組層級效應做一階篩選(業師 2026-06-04):(1) 15S 串列中電芯間容量/電阻/SOC 分散 — 最弱電芯限制串列可用容量、最熱電芯限制串列壽命;(2) 機架 inlet→outlet 熱梯度驅動 Arrhenius 局部加速日曆老化;(3) 業師建議的 2 電芯+電容 A/B 拓樸對比。此為界定 EVT 範圍的篩選研究,非完整電化學;單一代表電芯 DFN 仍是主要老化引擎。"}
              </Disclosure>
              <PlainInline className="mt-2">
                整串電池的壽命由最弱、最熱的那顆決定 — 本節就在檢驗它。
              </PlainInline>
            </div>
            <span className="shrink-0 rounded-full bg-warning/15 text-warning px-3 py-1 text-xs font-medium">
              可靠度 · 篩選
            </span>
          </div>
        </CardHeader>
        <CardBody className="space-y-6">
          {/* (1) per-cell SOH @ 7 yr — the weakest cell drags the string */}
          <div>
            <div className="mb-2 text-xs text-muted">
              {pi.string.n_series}S 串列中各電芯經 7 年後的 SOH（機架入風口→出風口
              梯度 {pi.thermal_gradient.t_inlet_c}→{pi.thermal_gradient.t_outlet_c} °C）。{" "}
              <span className="text-danger">最熱 / 最弱的電芯</span>會拖累整個串列。
            </div>
            <div className="relative flex items-end gap-1 h-36 border-b border-border/40">
              {/* 80 % replacement gate line */}
              <div
                className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-warning/60"
                style={{ bottom: `${((0.8 - 0.55) / (0.85 - 0.55)) * 100}%` }}
              >
                <span className="absolute -top-4 right-0 text-[10px] text-warning">80% 門檻</span>
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
                    title={`電芯 ${c.idx} · ${c.temp_c}°C · SOH@7yr ${(c.soh_at_7yr * 100).toFixed(1)}% · 日曆壽命 ${c.calendar_life_yr} yr`}
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
              <span>電芯 0 · {pi.thermal_gradient.t_inlet_c}°C（冷入風口）</span>
              <span>
                電芯 {pi.string.n_series - 1} · {pi.thermal_gradient.t_outlet_c}°C（熱出風口）
              </span>
            </div>
          </div>

          {/* string + thermal stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label="串列 SOH @ 7 年（最弱）"
              value={(pi.string.string_soh_at_7yr * 100).toFixed(1)}
              unit="%"
              tone="danger"
              hint={`vs ${(pi.string.mean_soh_at_7yr * 100).toFixed(1)}% 平均 — 最弱的電芯決定整個串列`}
            />
            <Stat
              label="不平衡容量損失"
              value={pi.string.imbalance_penalty_pct.toFixed(1)}
              unit="%"
              tone="warning"
              hint={`主動平衡可回復 +${pi.string.balance_recovery_pct.toFixed(1)}% 可用容量（JK-BMS 8S 主動平衡）`}
            />
            <Stat
              label="熱端日曆壽命"
              value={pi.thermal_gradient.calendar_life_hot_yr.toFixed(1)}
              unit="yr"
              tone="danger"
              hint={`vs 冷端 ${pi.thermal_gradient.calendar_life_cold_yr.toFixed(1)} 年 — 由 ${(pi.thermal_gradient.t_outlet_c - pi.thermal_gradient.t_inlet_c).toFixed(0)}°C 梯度造成 ${pi.thermal_gradient.life_spread_pct.toFixed(0)}% 的差距`}
            />
            <Stat
              label="最弱電芯"
              value={`#${pi.string.weakest_idx}`}
              tone="default"
              hint="串列電芯共用電流 → 整個串列的容量受此電芯限制"
            />
          </div>

          <PackThermalWidget nSeries={pi.string.n_series} />

          {/* 2-cell + capacitor arrangement study */}
          <div className="rounded-lg border border-border bg-surface/40 p-4">
            <div className="text-sm font-medium text-foreground mb-1">
              2 電芯 + 電容排列 — 平衡研究
            </div>
            <p className="text-xs text-muted mb-3">
              兩顆電芯（弱 = {pi.topology_ab.weak_cell_r_factor}× R）+ 兩顆電容、兩種排列方式，
              在 {pi.topology_ab.transient_a} A 瞬變下對弱電芯的保護效果對比：
            </p>
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse w-full max-w-2xl">
                <thead>
                  <tr className="text-muted">
                    <th className="px-2 py-1 text-left font-medium">拓樸</th>
                    <th className="px-2 py-1 text-right font-medium">弱電芯瞬變</th>
                    <th className="px-2 py-1 text-right font-medium">強電芯瞬變</th>
                    <th className="px-2 py-1 text-right font-medium">是否自平衡？</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums text-foreground">
                  <tr className="border-t border-border/40">
                    <td className="px-2 py-1 text-left">先並後串（每電芯獨立電容）</td>
                    <td className="px-2 py-1 text-right text-success">
                      {pi.topology_ab.parallel_then_series.weak_cell_transient_a.toFixed(2)} A
                    </td>
                    <td className="px-2 py-1 text-right">
                      {pi.topology_ab.parallel_then_series.strong_cell_transient_a.toFixed(2)} A
                    </td>
                    <td className="px-2 py-1 text-right text-success">是</td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="px-2 py-1 text-left">先串後並（共用電容）</td>
                    <td className="px-2 py-1 text-right">
                      {pi.topology_ab.series_then_parallel.weak_cell_transient_a.toFixed(2)} A
                    </td>
                    <td className="px-2 py-1 text-right">
                      {pi.topology_ab.series_then_parallel.strong_cell_transient_a.toFixed(2)} A
                    </td>
                    <td className="px-2 py-1 text-right text-muted">否</td>
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
              <CardTitle>模型驗證 · 在 Severson + PyBaMM BBU 工作模式上訓練的 LSTM</CardTitle>
              <Disclosure summary="關於此模型" className="mt-2">
                {"PyTorch 2 層 LSTM(hidden=64),以 188 顆 LFP 電芯的逐循環摘要特徵訓練(138 顆 Severson 2019 batch 1+2+3 + 50 顆 Severson 錨定的合成 BBU-duty 電芯;解析式衰減 + 各電芯雜訊,非 PyBaMM 老化 — 合成電芯與其標籤共用衰減函數,僅作為工況擴增,見 whitepaper §3.3.5/§3.3.8)。匯出為 ONNX 並於 onnxruntime CPU 上量測,作為 STM32N6 NPU 部署路徑的代理基準。"}
              </Disclosure>
              <PlainInline className="mt-2">
                AI 以上百顆電芯的公開實測訓練 — 準與不準的情境都如實標示。
              </PlainInline>
            </div>
            <span className="shrink-0 rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-medium">
              W2 重現
            </span>
          </div>
        </CardHeader>
        <CardBody className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Stat
              label="LSTM 測試 MAPE（實測）"
              value={modelValidation.metrics.test_mape_pct.toFixed(1)}
              unit="%"
              tone="primary"
              hint={`橫跨 Severson + BBU 工況的 ${modelValidation.metrics.n_test} 顆保留電芯 · LSTM 以單一工況的精準度換取跨工況的誠實度（僅 Severson 的 13 特徵 bagged-GBT 達成 8.4 % 對齊論文的基準,見 whitepaper §3.3.3）。v2.2 §B <10 % 承諾由 bagged-GBT 集成路徑達成；此 LSTM 區塊為部署的機隊推論引擎。`}
            />
            <Stat
              label="ONNX 延遲 · 筆電 CPU"
              value={modelValidation.latency.p99_ms.toFixed(2)}
              unit="ms (p99)"
              tone="success"
              hint={`筆電 CPU 上 FP32 p50 ${modelValidation.latency.p50_ms.toFixed(2)} ms / p99 ${modelValidation.latency.p99_ms.toFixed(2)} ms · INT8 實測 p50 0.23 ms / p99 0.40 ms（3.49× ONNX 壓縮,ΔMAPE +0.10 pp）· STM32N6 NPU 估計 ≤5 ms（ST X-CUBE-AI 規格）· 皆遠低於 50 ms 目標`}
            />
            <Stat
              label="ONNX 大小"
              value={modelValidation.model.onnx_size_kb.toFixed(1)}
              unit="KiB"
              tone="default"
              hint={`FP32 計算圖；權重總計 219 KiB FP32 → 63 KiB INT8（實測）· 可放入 STM32N6 1.6 MB ML FLASH · 與 PyTorch 數值誤差在 ${modelValidation.model.onnx_torch_max_diff.toExponential(1)} 以內`}
            />
            <Stat
              label="測試 R²"
              value={modelValidation.metrics.test_r2.toFixed(3)}
              tone="default"
              hint={`訓練 MAPE ${modelValidation.metrics.train_mape_pct.toFixed(1)} % · ${modelValidation.metrics.n_train} 顆電芯`}
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
                <span className="text-foreground font-medium">90 % PI 中位寬度 · </span>
                <span className="text-warning tabular-nums">
                  {Math.round(modelValidation.uncertainty.raw_median_pi_width_cycles).toLocaleString()}
                </span>{" "}
                →{" "}
                <span className="text-success tabular-nums">
                  {Math.round(modelValidation.uncertainty.conformal_median_pi_width_cycles).toLocaleString()} cycles
                </span>{" "}
                <span className="text-foreground">
                  （收窄 {(
                    (1 -
                      modelValidation.uncertainty.conformal_median_pi_width_cycles /
                        modelValidation.uncertainty.raw_median_pi_width_cycles) *
                    100
                  ).toFixed(0)}
                  %）
                </span>
                <Disclosure summary="如何做到（split conformal 校準）" className="mt-1.5">
                  MC Dropout {modelValidation.uncertainty.n_samples} 個樣本 + split conformal,
                  q ={" "}
                  <span className="text-foreground tabular-nums">
                    {modelValidation.uncertainty.conformal_q_factor.toFixed(2)}
                  </span>
                  ,保留校準集 ={" "}
                  {modelValidation.uncertainty.conformal_n_calibration} 顆電芯,涵蓋率維持在{" "}
                  {((modelValidation.uncertainty.conformal_test_coverage_90pct ?? modelValidation.uncertainty.test_coverage_90pct) * 100).toFixed(0)}
                  %。Whitepaper §3.3.7。
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
            title={`預測 vs 實際循環壽命 · 全部 ${modelValidation.predicted_vs_actual.length} 顆電芯`}
            subtitle={`切分 ${modelValidation.metrics.split} · ${modelValidation.metrics.n_train} 訓練 · ${modelValidation.uncertainty?.conformal_n_calibration ?? 0} 校準 · ${modelValidation.metrics.n_test} 測試`}
            plain="點越貼近對角線，預測越準 — 中間空白是模型沒看過的區間。"
          >
            <ResponsiveContainer width="100%" height={360}>
              <ScatterChart margin={{ top: 12, right: 16, left: 12, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="actual"
                  name="實際"
                  domain={domain}
                  allowDataOverflow={false}
                  stroke=""
                  tickFormatter={(v) => `${v}`}
                  label={{ value: "實際循環壽命", position: "insideBottom", offset: -8, fill: "var(--muted)", fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="predicted"
                  name="預測"
                  domain={domain}
                  allowDataOverflow={false}
                  stroke=""
                  tickFormatter={(v) => `${v}`}
                  label={{ value: "預測循環壽命", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 11 }}
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
                          <span className="text-muted">實際</span>
                          <span className="text-right tabular-nums">{d.actual}</span>
                          <span className="text-muted">預測</span>
                          <span className="text-right tabular-nums">{d.predicted}</span>
                          <span className="text-muted">誤差</span>
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
                  name="Severson · 訓練"
                  data={modelValidation.predicted_vs_actual.filter(
                    (p) => p.batch !== "bbu" && p.split === "train",
                  )}
                  fill="rgba(99,102,241,0.45)"
                />
                <Scatter
                  name="Severson · 測試"
                  data={modelValidation.predicted_vs_actual.filter(
                    (p) => p.batch !== "bbu" && p.split === "test",
                  )}
                  fill="rgba(34,211,238,0.95)"
                />
                <Scatter
                  name="PyBaMM BBU · 訓練"
                  data={modelValidation.predicted_vs_actual.filter(
                    (p) => p.batch === "bbu" && p.split === "train",
                  )}
                  fill="rgba(251,191,36,0.55)"
                />
                <Scatter
                  name="PyBaMM BBU · 測試"
                  data={modelValidation.predicted_vs_actual.filter(
                    (p) => p.batch === "bbu" && p.split === "test",
                  )}
                  fill="rgba(249,115,22,0.95)"
                />
              </ScatterChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted mt-2">
              冷藍色 = <span className="text-foreground font-medium">Severson 2019 電芯</span>（100–2,000 循環）；
              暖琥珀色 = <span className="text-foreground font-medium">PyBaMM BBU 工作模式電芯</span>（5,000–13,000 循環）。
              兩者之間的 <span className="text-warning font-medium">2,000–4,000 空白</span>就是{" "}
              <span className="text-warning font-medium">工況落差</span>。
            </p>
            <Disclosure summary="關於工況落差與跨化學體系測試的更多說明" className="mt-2">
              實驗室快充與溫和浮充工作模式都無法產生 2,000–4,000 範圍內的電芯,
              因此要填補中段需要中等應力的合成電芯。
              跨化學體系遷移（NASA NMC、CALCE LCO）已測試並排除（whitepaper §B）；
              答案是增加 LFP 涵蓋範圍,而非增加化學體系。下方逐顆檢視中的 90 % 預測區間 —
              MC Dropout 經 split conformal 後處理,相較原始取樣器收窄 44 % 同時維持涵蓋率 ≥90 % —
              逐顆電芯量化跨越落差區的不確定性。
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
            <Disclosure summary={<>架構 · <span className="text-foreground">{modelValidation.model.n_parameters.toLocaleString()} 個參數</span></>}>
              {modelValidation.model.architecture} · 輸入 {JSON.stringify(modelValidation.model.input_shape)}{" "}
              （循環 2–100 × 7 個特徵：{" "}
              <code className="text-foreground">{modelValidation.model.feature_names.join(", ")}</code>）。
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
          <CardTitle>方法 · 您實際看到的是什麼</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm leading-relaxed">
          <Method
            icon={<FlaskConical className="h-4 w-4" />}
            title="物理"
            tagline={
              <>
                <span className="text-foreground font-medium">Doyle-Fuller-Newman PDE</span>,{" "}
                PyBaMM 26.4.1, <span className="text-foreground">Prada 2013 LFP</span>。
              </>
            }
            details="每機架 8 顆 BBU 並聯,將 120 kW 峰值分攤為每 BBU 15 kW（每電芯 6C）。電池組層級的功率映射到一顆代表性電芯,使機架峰值電流對應到（較小的）Prada 電芯上約 6C — 在不重建完整電池組的情況下符合 2.5 kWh / 48 V / 15S 的 BBU 規格。常見陷阱：把單顆 BBU 的 2.5 kWh 除以機架的 120 kW 會得到誤導性的 48C；正確算法是 20 kWh（8 × 2.5）÷ 120 kW = 理論上 600 s,對應 60 s 優雅關機規格。"
          />
          <Method
            icon={<Activity className="h-4 w-4" />}
            title="混合分流"
            tagline={
              <>
                一階 LIC 等效模型 + LPF,{" "}
                <span className="text-foreground font-medium">τ = 0.5 s</span>,截止 ≈ 0.32 Hz。
              </>
            }
            details="LIC 側以其 R_esr × C_bulk 主導時間常數表示（Eaton XLR 48 V / 166 F · ~5 mΩ ESR → τ ≈ 0.83 s）；展示刻意採用較緊的控制律設定點 τ = 0.5 s,使 DC-DC 比被動耦合推送更多高頻成分到 LIC。高於截止的成分導向 LIC,緩慢殘量導向 LFP。10 Hz GB200 脈衝遠高於截止；30–90 s 優雅關機事件遠低於截止。此處未建模 LIC 偽電容、電極動力學與自放電 — 量產階段使用 Eaton 資料表的 ESR(SOC) + bulk-C(V) 曲線或迴路內量測。"
          />
          <Method
            icon={<Cpu className="h-4 w-4" />}
            title="老化"
            tagline={
              <>
                <span className="text-foreground font-medium">以 Severson 2019 校準</span>的解析式 SOH 擬合。
              </>
            }
            details="在 3,000 循環上執行真正的 DFN 在運算上不可行,因此我們採用解析式擬合。0.33 的 BBU 工作模式係數反映浮充運作搭配罕見的深度事件 — 在提案 §G.3 中明確說明。"
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
  plain,
  children,
}: {
  title: string;
  subtitle?: string;
  plain?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/30 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h4 className="text-sm font-medium">{title}</h4>
        {subtitle && <span className="text-xs text-muted">{subtitle}</span>}
      </div>
      {plain && <p className="text-xs text-accent mb-2 leading-relaxed">{plain}</p>}
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
  { label: "短",       range: "<400",      min: 0,    max: 400 },
  { label: "中低",      range: "400–700",   min: 400,  max: 700 },
  { label: "典型",      range: "700–1000",  min: 700,  max: 1000 },
  { label: "中高",      range: "1000–1300", min: 1000, max: 1300 },
  { label: "長",       range: "≥1300",     min: 1300, max: Infinity },
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
      title="依電芯壽命分組的誤差模式"
      subtitle="分組 · <400 / 400–700 / 700–1000 / 1000–1300 / ≥1300 循環"
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
          <YAxis yAxisId="count" stroke="" label={{ value: "電芯", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 10 }} />
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
                    <span className="text-muted">電芯數</span>
                    <span className="text-right tabular-nums">{b.count}</span>
                    <span className="text-muted">平均實際</span>
                    <span className="text-right tabular-nums">{b.avgActual.toFixed(0)}</span>
                    <span className="text-muted">平均預測</span>
                    <span className="text-right tabular-nums">{b.avgPred.toFixed(0)}</span>
                    <span className="text-muted">平均帶號誤差</span>
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
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
          <Bar yAxisId="count" dataKey="count" name="電芯數" radius={[4, 4, 0, 0]}>
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
        長條 = 電芯數,琥珀色線 = 各分組內的 MAPE。{" "}
        <span className="text-warning font-medium">短壽命分組</span>的{" "}
        <span className="text-warning font-medium">MAPE 最大</span>,因為 Severson 僅有少數幾顆{" "}
        <span className="text-foreground font-medium">早期失效電芯</span>。
      </p>
      <Disclosure summary={`為何 LSTM MAPE 約為 ~${overallMapePct.toFixed(0)} % 以及 PIs 如何處理它`} className="mt-2">
        長壽命分組現在由 50 顆以 Severson 為基準、循環壽命 5,000–13,000 的合成 BBU 工作模式電芯主導 —
        加入它們拓寬了模型的工況涵蓋範圍,使其能描述實際的 BBU 運作點,
        但將整體測試 MAPE 從僅 Severson 的 ~16 % 提升到 {overallMapePct.toFixed(1)} %（whitepaper §3.3.7 / §3.3.8）。
        短壽命分組是最明顯的資料缺口（Severson 早期失效電芯稀少）。
        跨化學體系遷移（NASA NMC、CALCE LCO）已測試並排除
        （§3.3.5 / 附錄 B）；答案是增加 LFP 早期失效資料,而非增加化學體系。上方逐顆檢視為每顆電芯回報 90 % 預測區間 —
        MC Dropout 經 split conformal 後處理（q_factor{" "}
        {conformalQFactor != null ? conformalQFactor.toFixed(2) : "0.56"}{" "}
        於 {conformalNCalibration ?? 37} 顆電芯的校準集,§3.3.7）,相較原始收窄 44 %
        同時維持涵蓋率 ≥90 %。
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
  healthy: "主要族群",
  warning: "觀察名單",
  early_aging: "Tier-3 佇列",
  critical: "提前失效",
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
              <CardTitle>推論逐步檢視 · 模型逐顆電芯看到了什麼</CardTitle>
              <p className="text-sm text-muted mt-2 max-w-3xl leading-relaxed">
                橫跨 <span className="text-foreground font-medium">四種預測狀態</span>的{" "}
                <span className="text-foreground font-medium">{walkthroughs.length} 顆電芯</span>{" "}
                （healthy / warning / early_aging / critical），各自帶有一個{" "}
                <span className="text-success font-medium">90 % conformal 收窄後 PI</span>。
              </p>
              <Disclosure summary="分組與 PIs 如何運作" className="mt-2">
                /dashboard 依設備當前的物理狀態（SOH / RUL / 溫度）將線上設備分為
                三個分組；逐步檢視則依<em>預測</em>循環壽命將訓練電芯分組 —
                這也是為何 <span className="text-foreground">critical</span> 出現在
                此處卻不出現在 /dashboard 的原因。每筆預測透過 Monte Carlo Dropout（100 次啟用 dropout 的前向傳遞）
                並經 split conformal 後處理,帶有 90 % 預測區間 — 像 <em>critical</em> 這類尾端電芯的寬 PI 是
                模型誠實回報其在該處訓練訊號有限,而 healthy 電芯的窄 PI 則反映實際的信心度。
              </Disclosure>
              <Disclosure summary="工況混合 · Severson b1–3 vs 以 Severson 為基準的合成 bbu_* 電芯" className="mt-1">
                <span className="text-foreground">Severson 快充電芯</span>（b1/b2/b3 ID,
                3.6C–8C,實驗室應力壽命 100–2,000 循環）與{" "}
                <span className="text-foreground">以 Severson 為基準的合成 BBU 工作模式電芯</span>{" "}
                （bbu_* ID,~0.05C 浮充,~50 循環/年 → 5,000–13,000 循環壽命）。{" "}
                <span className="text-warning">
                  合成電芯使用解析式 Severson 擬合 SOH 曲線 + 各電芯雜訊,
                  而非 PyBaMM 老化（完整 PyBaMM 100 顆電芯 × 10k 循環在運算上
                  不可行）。它們僅作為<em>工況擴增</em> — 量產證據建立在真實的 Severson 電芯上。
                </span>{" "}
                LSTM 在兩種工況上訓練（共 188 顆電芯）,使其能描述
                實際的 BBU 運作點 — 挑選一顆 `bbu_*` 電芯,觀察模型在您客戶電池組將實際運作的
                工況上會如何預測。Whitepaper
                §3.3.5 涵蓋校準方法論。
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
          <Stat label="電芯 ID" value={cell.cell_id} hint={`batch ${cell.batch}`} />
          <Stat
            label="機隊狀態"
            value={STATUS_LABEL[cell.fleet_status]}
            tone={STATUS_TONE[cell.fleet_status]}
            hint={`${cell.fleet_status} · 約佔 LSTM 訓練電芯分布的 ~${cell.fleet_pct.toFixed(0)}%`}
          />
          <Stat
            label="實際循環壽命"
            value={cell.actual.toLocaleString()}
            unit="循環"
            tone="default"
          />
          <Stat
            label="預測（中位數）"
            value={cell.pi_median.toLocaleString()}
            unit="循環"
            tone="primary"
            hint={`90% PI [${cell.pi_lower.toLocaleString()}–${cell.pi_upper.toLocaleString()}] · MC Dropout 100 個樣本 + split conformal`}
          />
          <Stat
            label="誤差"
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
                ? `實際值 ${cell.actual.toLocaleString()} 落在 conformal 90 % PI 之內 — 此電芯的校準涵蓋率成立。`
                : `實際值 ${cell.actual.toLocaleString()} 落在 conformal 90 % PI 之外 — 罕見（≤10 %）的未命中；若為反覆出現的尾端電芯模式,可放寬 α 或擴充校準集。`
            }
          />
        </div>

        {/* INPUT — all 7 per-cycle features overlaid in one chart */}
        <div className="rounded-lg border border-border bg-background/30 p-5 space-y-3">
          <div>
            <h4 className="text-sm font-medium">每循環量測（循環 2 → 100）</h4>
            <p className="text-xs text-muted leading-relaxed mt-1">
              <span className="text-foreground font-medium">全部七項 LSTM 輸入特徵</span>,逐條正規化至{" "}
              <span className="text-foreground font-medium">[0, 1]</span>。游標懸停以查看原始數值。
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
                  <div className="text-muted">循環 {p.cycle}</div>
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
          <span>{noneVisible ? "全部已隱藏 — 點按任一列即可重新加回" : "點按任一列即可切換該線條"}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={showAll}
              disabled={hidden.size === 0}
              className="text-primary hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-default"
            >
              全部顯示
            </button>
            <span className="text-muted/60">·</span>
            <button
              type="button"
              onClick={hideAll}
              disabled={noneVisible}
              className="text-muted hover:text-foreground disabled:opacity-40 disabled:cursor-default"
            >
              全部隱藏
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

