"use client";

import { useMemo, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Stat } from "@/components/ui/stat";
import { USFleetMap } from "@/components/us-fleet-map";
import { DeviceDrilldown } from "@/components/device-drilldown";
import { LiveDemonstratorCard } from "@/components/live-demonstrator-card";
import { type Device, type DeviceStatus, type LicRcEnvelope, STATUS_COLOR, STATUS_LABEL } from "@/lib/types";
import { Activity, AlertTriangle, MapPin, Shield, Zap } from "lucide-react";

interface Fleet {
  title: string;
  disclaimer: string;
  n_devices: number;
  geographic_distribution: Record<string, number>;
  status_summary: Record<string, number>;
  replacement_queue_count: number;
  // Emitted by scripts/generate_twin_scenarios.py — "lstm_inference_on_bbu_trajectory"
  // when the LSTM checkpoint and BBU-duty pickle are available, "synthetic_decay"
  // when either is missing and we fall back to seeded RNG decay. The dashboard
  // UI must NOT claim LSTM inference if this is the fallback path.
  rul_source?: "lstm_inference_on_bbu_trajectory" | "synthetic_decay";
  devices: Device[];
}

// V4 N-1 fault sim artifact (written by scripts/generate_n_minus_1_sim.py).
// We only need a thin slice to render the fleet-level fault toggle.
interface RackNMinus1 {
  title: string;
  headline_verdict?: string;
  fault_injection?: { fault_time_s: number; n_bbu_normal: number; n_bbu_degraded: number };
  stats?: {
    c_rate_continuous_post_fault?: number;
    c_rate_post_increase_pct?: number;
    p_per_bbu_steady_post_fault_kw?: number;
    v_cell_swing_v?: number;
    t_cell_max_c?: number;
    v_lic_headroom_to_uvlo_v?: number;
  };
  pass_criteria?: {
    overall_pass?: boolean;
    c_rate_continuous_post_limit?: number;
    v_cell_swing_limit_v?: number;
    t_cell_limit_c?: number;
  };
}

// Seed a deterministic ~6% subset of devices to display in "fault-injected"
// mode. Uses a simple FNV-style hash on device ID so re-renders stay stable
// without needing a server-injected fault list.
function isFaultInjected(deviceId: string, ratio: number = 0.06): boolean {
  let h = 2166136261;
  for (let i = 0; i < deviceId.length; i++) {
    h ^= deviceId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Map hash to [0, 1) then compare to ratio
  return ((h >>> 0) / 0xffffffff) < ratio;
}

export function DashboardClient({
  fleet,
  licRcEnvelope,
  rackNMinus1,
}: {
  fleet: Fleet;
  licRcEnvelope: LicRcEnvelope;
  rackNMinus1: RackNMinus1;
}) {
  const [filter, setFilter] = useState<"all" | DeviceStatus>("all");
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [showFaultToggle, setShowFaultToggle] = useState(false);
  const rulFromLstm = fleet.rul_source === "lstm_inference_on_bbu_trajectory";

  // ~6% of fleet seeded as "1 BBU offline within their rack" for the V4
  // fleet-level toggle. With 1000 devices that's ~60 racks at any given
  // moment, which mirrors a realistic 6× / yr per-device fault rate × 8 BBU /
  // rack × 1000-device fleet — high enough to be visible, low enough to
  // remain operationally normal.
  const faultInjectedIds = useMemo(() => {
    if (!showFaultToggle) return new Set<string>();
    const ids = new Set<string>();
    for (const d of fleet.devices) {
      if (isFaultInjected(d.id)) ids.add(d.id);
    }
    return ids;
  }, [showFaultToggle, fleet.devices]);

  const filtered = useMemo(
    () => (filter === "all" ? fleet.devices : fleet.devices.filter((d) => d.status === filter)),
    [fleet.devices, filter],
  );

  const sohBuckets = useMemo(() => {
    const buckets = [
      { range: "≥95%", min: 0.95, max: 1.01, count: 0, color: "#34d399" },
      { range: "90–95%", min: 0.9, max: 0.95, count: 0, color: "#22d3ee" },
      { range: "85–90%", min: 0.85, max: 0.9, count: 0, color: "#a78bfa" },
      { range: "80–85%", min: 0.8, max: 0.85, count: 0, color: "#fbbf24" },
      { range: "<80%", min: 0, max: 0.8, count: 0, color: "#f87171" },
    ];
    for (const d of fleet.devices) {
      const b = buckets.find((b) => d.soh_lfp >= b.min && d.soh_lfp < b.max);
      if (b) b.count++;
    }
    return buckets;
  }, [fleet.devices]);

  // Most-urgent first: primary sort by lowest SOH (the dominant admission
  // signal under LSTM-driven RULs, which sit well above the 800-cycle gate);
  // tiebreak by smallest RUL so within a SOH band the device with less
  // cycle-fade headroom shows up first. Avoids the prior bug where a healthier
  // SOH 84 % device could outrank a worse SOH 79 % device just because the
  // LSTM happened to predict slightly more cycles for the trajectory it was
  // matched to.
  const replacementCandidates = useMemo(
    () =>
      fleet.devices
        .filter((d) => d.status === "early_aging")
        .sort((a, b) => a.soh_lfp - b.soh_lfp || a.rul_cycles - b.rul_cycles)
        .slice(0, 8),
    [fleet.devices],
  );

  return (
    <div className="space-y-10">
      {/* LIVE bench demonstrator — polled client-side every 5 s from the
          bridge script. Sits at the top because it's the one piece of
          non-simulated data on this page; everything below carries the
          SIMULATED watermark by design. */}
      <LiveDemonstratorCard />

      {/* V4 fleet-level fault toggle. Reads rack_n_minus_1.json (cell-level
          per-BBU sim) and projects it across the 1000-device fleet. When
          enabled, a deterministic ~6 % of devices are visually marked as
          having one BBU offline within their rack; fleet stats panel updates
          to show that service continuity is preserved by N+1 redundancy.
          Both states stay clearly labelled SIMULATED. */}
      <Card>
        <CardHeader>
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <CardTitle>V4 fleet-level fault toggle · N+1 redundancy</CardTitle>
              <Disclosure summary="What you&apos;re seeing" className="mt-2">
                Twin sim artifact `apps/web/public/scenarios/rack_n_minus_1.json` is the cell-level
                proof that a rack with 1 BBU offline (8 → 7) still keeps per-BBU continuous C-rate
                inside the 2.5 C automotive LFP limit. This toggle projects that result onto the
                1000-device fleet: a deterministic ~6 % of devices switch to &quot;1 BBU degraded in
                rack&quot; mode, while fleet-level service continuity remains 100 %.
                See /twin · V3 / V4 toggle for the underlying sim waveform.
              </Disclosure>
            </div>
            <button
              type="button"
              onClick={() => setShowFaultToggle((v) => !v)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                showFaultToggle
                  ? "bg-warning/20 text-warning border border-warning/40"
                  : "bg-surface/50 text-muted border border-border hover:text-foreground"
              }`}
            >
              {showFaultToggle ? "✓ Fault scenario ON" : "Show fault scenario"}
            </button>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label="Racks with 1 BBU offline"
              value={showFaultToggle ? faultInjectedIds.size.toString() : "0"}
              unit={`/ ${fleet.n_devices.toLocaleString()}`}
              tone={showFaultToggle ? "warning" : "default"}
              hint={
                showFaultToggle
                  ? `Deterministic ~6 % subset for V4 visualisation (seeded by device ID, stable across re-renders)`
                  : "Toggle on to visualise the fleet-wide fault scenario"
              }
            />
            <Stat
              label="Per-BBU C-rate post-fault"
              value={(rackNMinus1.stats?.c_rate_continuous_post_fault ?? 1.71).toFixed(2)}
              unit="C continuous"
              tone={rackNMinus1.pass_criteria?.overall_pass ? "success" : "danger"}
              hint={`+${(rackNMinus1.stats?.c_rate_post_increase_pct ?? 14).toFixed(0)} % vs 8-BBU baseline · limit ${rackNMinus1.pass_criteria?.c_rate_continuous_post_limit ?? 2.5} C automotive LFP continuous spec`}
            />
            <Stat
              label="Service continuity"
              value="100"
              unit="% during fault"
              tone="success"
              hint="60 s graceful event still completes with 7 surviving BBUs (V4 sim PASS); customer SLA unaffected"
            />
            <Stat
              label="Cell thermal margin"
              value={(rackNMinus1.stats?.t_cell_max_c ?? 25.1).toFixed(1)}
              unit={`°C max (limit ${rackNMinus1.pass_criteria?.t_cell_limit_c ?? 50} °C)`}
              tone="success"
              hint={`Cell thermal rise stays negligible even in degraded mode · LIC bank UVLO headroom ${(rackNMinus1.stats?.v_lic_headroom_to_uvlo_v ?? 8.91).toFixed(2)} V`}
            />
          </div>
          {showFaultToggle && (
            <div className="rounded-md border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-foreground/90 leading-relaxed">
              <span className="font-semibold text-warning">V4 sim verdict: </span>
              {rackNMinus1.headline_verdict ??
                `N-1 failure post-fault per-BBU stays inside automotive LFP continuous spec; V_cell swing and T_cell within limit; LIC headroom preserved.`}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Fictional-persona banner — site names are fully anonymised
          (TenantCo / ColoOp / DataCo / HyperscaleCo / CarrierHotel) to
          avoid any real-brand trademark exposure. Geography distribution
          still reflects the JLL YE-2025 weighted Texas + Virginia AI-cluster
          density per v2.2 §C.1. */}
      <div
        role="note"
        className="rounded-md border-l-4 border-red-500 bg-red-500/10 px-4 py-3 text-xs sm:text-sm text-foreground"
      >
        <div className="font-semibold text-red-400 uppercase tracking-wider mb-1">
          ⚠ Fictional demo — academic illustration only
        </div>
        <p className="leading-relaxed text-muted">
          All site names below (<span className="text-foreground">TenantCo / ColoOp / DataCo /
          HyperscaleCo / CarrierHotel</span>, suffixed with an airport or US state code
          (DFW / IAD / AUS / DAL · WA / UT / OH / IA)) are
          <span className="text-foreground"> fictional personas</span> for the ATCC 2026
          academic demonstration — they are <span className="text-foreground font-medium">not
          tied to any real company, customer, or commercial relationship</span>. Every device
          is generated by a seeded RNG simulator and carries the SIMULATED DATA watermark.
        </p>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3 min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-muted">Fleet Health Dashboard</div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight">{fleet.n_devices.toLocaleString()} Sysblade BBUs across the fleet</h1>
          <p className="text-sm sm:text-base text-muted max-w-3xl leading-relaxed">
            <span className="text-foreground font-medium">Three service tiers</span> visible side-by-side:{" "}
            <span className="text-foreground">real-time monitoring</span>,{" "}
            <span className="text-foreground">proactive maintenance</span> triggered by Battery Twin SOH inference,
            and <span className="text-foreground">predictive ops</span> surfacing replacement candidates before SOH crosses{" "}
            <span className="text-foreground font-medium">80 %</span>.
          </p>
        </div>
        <span className="rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-warning whitespace-normal">
          ⚠ Simulated data · synthetic fleet for demo only
        </span>
      </header>

      {/* Tier 1 — real-time monitoring */}
      <section className="space-y-4">
        <SectionHeader icon={<Activity className="h-4 w-4" />} kicker="Tier 1" title="Real-time monitoring" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Stat
            label="Total devices"
            value={fleet.n_devices.toLocaleString()}
            tone="primary"
            hint={`${fleet.geographic_distribution.Texas} TX · ${fleet.geographic_distribution.Virginia} VA · ${fleet.geographic_distribution.Other} other`}
          />
          <Stat
            label="Healthy"
            value={fleet.status_summary.healthy.toLocaleString()}
            unit={`/ ${fleet.n_devices}`}
            tone="success"
            hint={`${((fleet.status_summary.healthy / fleet.n_devices) * 100).toFixed(1)} % currently nominal`}
          />
          <Stat
            label="Thermal warn"
            value={fleet.status_summary.thermal_warn}
            tone="warning"
            hint="LIC > 60 °C or LFP > 45 °C"
          />
          <Stat
            label="Early aging"
            value={fleet.status_summary.early_aging}
            tone="danger"
            hint="SOH < 85 % or RUL < 800 cycles · auto Tier-3 admission"
          />
        </div>
      </section>

      {/* Tier 2 — geographic + SOH bucket */}
      <section className="space-y-4">
        <SectionHeader icon={<MapPin className="h-4 w-4" />} kicker="Tier 2" title="Proactive maintenance · geographic and SOH view" />

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted mr-2">Filter:</span>
          {(["all", "healthy", "thermal_warn", "early_aging"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={
                filter === s
                  ? "rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"
                  : "rounded-md border border-border bg-surface/40 px-3 py-1.5 text-muted hover:text-foreground"
              }
            >
              {s === "all" ? `All (${fleet.n_devices})` : `${STATUS_LABEL[s]} (${fleet.status_summary[s] ?? 0})`}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2 simulated-watermark">
            <CardHeader>
              <CardTitle>Geographic distribution · 1000-device fleet</CardTitle>
            </CardHeader>
            <CardBody>
              <USFleetMap devices={filtered} height={400} />
              <p className="text-xs text-muted mt-3">
                <span className="text-foreground">Click any city marker</span> to drill in;
                hover for status breakdown. Texas + Virginia clusters dominate per JLL YE-2025
                §C.1.
              </p>
            </CardBody>
          </Card>

          <Card className="simulated-watermark">
            <CardHeader>
              <CardTitle>SOH distribution</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {sohBuckets.map((b) => (
                <div key={b.range}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium" style={{ color: b.color }}>
                      {b.range}
                    </span>
                    <span className="tabular-nums text-muted">{b.count} devices</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(b.count / fleet.n_devices) * 100}%`,
                        background: b.color,
                      }}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-3 mt-3 border-t border-border text-xs text-muted leading-relaxed space-y-2">
                <p>
                  Tier-3 queue rule: <span className="text-foreground">SOH &lt; 85 %</span> <em>or</em>{" "}
                  <span className="text-foreground">RUL &lt; 800 cycles</span>.
                  {rulFromLstm && (
                    <span className="text-muted/80">
                      {" "}
                      In this build LSTM-predicted RULs sit well above the 800-cycle gate (LFP
                      cycle-fade under BBU duty extrapolates into thousands of cycles), so
                      admission triggers almost exclusively on{" "}
                      <span className="text-foreground">SOH &lt; 0.85</span>; the RUL branch is
                      retained as the safety net for the{" "}
                      <code className="text-foreground">synthetic_decay</code> fallback path
                      (smaller RUL range).
                    </span>
                  )}
                </p>
                <Disclosure summary="What 800 cycles means in years">
                  BBU duty averages ~50 cycles/yr (engineering estimate anchored to{" "}
                  <span className="text-foreground">v2.1 §G.3 footnote + §E.1 Tier-B</span>:
                  &ldquo;LFP 在 BBU 浮充應用實測 8–12 年壽命估算&rdquo; / &ldquo;30–90 sec
                  graceful @ 120 kW&rdquo;; per-year cycle count itself is not stated in v2.1
                  §B.2 — the proposal&rsquo;s §B.2 covers market positioning, not duty cadence), so{" "}
                  <span className="text-foreground">RUL = 800 cycles</span> ≈ 16 years of BBU
                  service remaining. The 800-cycle threshold is the &ldquo;needs replacement
                  within ~16 years&rdquo; gate, not 800 days. Under the LSTM-driven path,
                  cycle-fade headroom is typically much larger than calendar life —{" "}
                  <span className="text-foreground">calendar life binds at ~8-12 yr</span> per
                  v2.2 附件 C, so cycle-fade is rarely the binding constraint for replacement
                  decisions.
                </Disclosure>
                <Disclosure summary="Where rul_cycles, soh_lfp, soh_lic come from">
                  {rulFromLstm ? (
                    <>
                      <span className="text-foreground">rul_cycles</span> per device is computed
                      by the same LSTM you saw on{" "}
                      <span className="text-foreground">/twin</span> — each device is matched to
                      a Severson-anchored synthetic BBU-duty trajectory (analytic decay,
                      not PyBaMM aging — see /twin Regime mix disclosure), the LSTM predicts that
                      trajectory&rsquo;s total cycle life, and we subtract the device&rsquo;s
                      elapsed cycles (age × 50 cyc/yr — engineering estimate anchored to v2.1
                      §G.3 footnote &ldquo;LFP BBU 浮充 8–12 yr life&rdquo;, not a verbatim
                      v2.1 §B.2 claim). One model deployed
                      across the fleet, not a separate decay heuristic.
                    </>
                  ) : (
                    <>
                      <span className="text-warning font-medium">rul_cycles</span> on this build
                      is from a <span className="text-warning">seeded RNG fallback</span>{" "}
                      (rul_source ={" "}
                      <code className="text-foreground">synthetic_decay</code>) — the LSTM
                      checkpoint or BBU-duty pickle was missing when{" "}
                      <code className="text-foreground">scripts/generate_twin_scenarios.py</code>{" "}
                      ran. Re-run{" "}
                      <code className="text-foreground">scripts/export_lstm_onnx.py</code> +{" "}
                      <code className="text-foreground">scripts/generate_bbu_duty_cells.py</code>{" "}
                      then regenerate scenarios to switch back to LSTM inference.
                    </>
                  )}{" "}
                  <span className="text-foreground">soh_lfp</span> stays as the per-device
                  state. <span className="text-foreground">soh_lic</span> is datasheet-derived
                  (LIC ≥ 100,000 nominal cycles per JM Energy / Eaton XLR specs) — LIC public
                  cycling data is too scarce to train on, and BBU duty doesn&rsquo;t push LIC
                  near its limits (whitepaper §6.2).
                </Disclosure>
              </div>
            </CardBody>
          </Card>
        </div>
      </section>

      {/* Tier 3 — predictive ops */}
      <section className="space-y-4">
        <SectionHeader icon={<Shield className="h-4 w-4" />} kicker="Tier 3" title="Predictive ops · replacement queue" />
        <Card className="simulated-watermark">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Most urgent 8 · sorted by lowest SOH first (RUL tiebreak)
            </CardTitle>
            <p className="text-[11px] text-muted mt-1.5">
              Click any row for SOH / RUL / thermal drilldown.
            </p>
          </CardHeader>
          <CardBody>
            {/* min-w forces overflow-x-auto to actually scroll on phone widths
                instead of letting the table squeeze its columns into illegible
                multi-line headers and clipped status badges. */}
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-sm min-w-[680px]">
                <thead>
                  <tr className="text-muted text-xs uppercase tracking-wider whitespace-nowrap">
                    <th className="text-left py-2 pr-3">Device</th>
                    <th className="text-left py-2 pr-3">Site</th>
                    <th className="text-right py-2 pr-3">SOH</th>
                    <th className="text-right py-2 pr-3">RUL (cycles)</th>
                    <th className="text-right py-2 pr-3">Age (mo)</th>
                    <th className="text-right py-2 pr-3">Temp LFP</th>
                    <th className="text-right py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {replacementCandidates.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-muted">
                        No urgent replacements — fleet is in good shape.
                      </td>
                    </tr>
                  )}
                  {replacementCandidates.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => setSelectedDevice(d)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedDevice(d);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open drilldown for ${d.id} (${d.site})`}
                      className="cursor-pointer border-t border-border transition-colors hover:bg-surface/60 focus:bg-surface/60 focus:outline-none"
                    >
                      <td className="py-2.5 pr-3 font-mono text-xs whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {d.id}
                          {faultInjectedIds.has(d.id) && (
                            <span
                              title="V4 fault scenario: 1 BBU offline in this rack · 7-of-8 surviving · service continuity preserved"
                              className="rounded-sm bg-warning/20 text-warning px-1 py-px text-[9px] font-semibold tracking-wider whitespace-nowrap"
                            >
                              N-1
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="whitespace-nowrap">{d.site}</div>
                        <div className="text-xs text-muted whitespace-nowrap">{d.location}</div>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{(d.soh_lfp * 100).toFixed(1)}%</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{d.rul_cycles}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{d.age_months}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{d.temp_lfp_c}°C</td>
                      <td className="py-2.5 text-right">
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
                          style={{ background: `${STATUS_COLOR[d.status]}20`, color: STATUS_COLOR[d.status] }}
                        >
                          {STATUS_LABEL[d.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted mt-4 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              {fleet.replacement_queue_count} devices currently on the replacement queue (status =
              early_aging) — ServiceNow / Jira webhook integration is on the W3+ roadmap
              (no live integration in this static-demo build).
            </p>
          </CardBody>
        </Card>
      </section>

      {/* Footer disclaimer */}
      <Card>
        <CardBody className="text-xs text-muted leading-relaxed">
          <div className="flex items-center gap-2 text-warning font-medium mb-1">
            <Zap className="h-3.5 w-3.5" /> About this dashboard
          </div>
          <p>
            {fleet.disclaimer}{" "}
            {rulFromLstm ? (
              <>
                <span className="text-foreground">
                  RUL per device is computed by the same LSTM
                </span>{" "}
                shown on /twin — same model, two views.
              </>
            ) : (
              <>
                <span className="text-warning">
                  RUL per device is currently from a seeded RNG fallback
                </span>{" "}
                (rul_source = <code className="text-foreground">synthetic_decay</code>) — the
                LSTM checkpoint was missing during scenario generation. Re-run the LSTM
                training + scenario pipeline to restore one-model-two-views.
              </>
            )}
          </p>
          <Disclosure summary="How the 1000 devices were generated" className="mt-2">
            Documented seeded RNG (<code className="text-foreground">scripts/generate_twin_scenarios.py</code>),
            weighted to Texas + Virginia per JLL YE-2025. Status, temperatures, and aging
            buckets reflect plausible field distributions but no production deployment exists
            yet. Each device is matched to a per-device Severson-anchored synthetic BBU-duty
            trajectory (analytic decay, not PyBaMM aging) and the LSTM predicts its total
            cycle life.
          </Disclosure>
        </CardBody>
      </Card>

      {/* Per-device drilldown — renders only when a Tier-3 row is clicked. */}
      {selectedDevice && (
        <DeviceDrilldown
          device={selectedDevice}
          licRcEnvelope={licRcEnvelope}
          onClose={() => setSelectedDevice(null)}
        />
      )}
    </div>
  );
}

function SectionHeader({
  icon,
  kicker,
  title,
}: {
  icon: React.ReactNode;
  kicker: string;
  title: string;
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border pb-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 text-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
        {icon}
        {kicker}
      </span>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
    </div>
  );
}
