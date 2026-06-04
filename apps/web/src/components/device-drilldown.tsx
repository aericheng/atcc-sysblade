"use client";

import { useEffect } from "react";
import { X, ArrowUpRight, Zap } from "lucide-react";
import { type Device, type LicRcEnvelope, STATUS_COLOR, STATUS_LABEL } from "@/lib/types";
import { backupRuntimeSeconds, peakPowerRetention, dcirGrowth } from "@/lib/aging";

interface Props {
  device: Device;
  licRcEnvelope: LicRcEnvelope;
  onClose: () => void;
}

/**
 * Per-device drilldown panel.
 *
 * Triggered from /dashboard Tier-3 table row click. Shows the device's
 * current SOH / RUL / thermal / op-events state, with explicit links to
 * /twin for proper conformal PI bands (which only exist for the 9 curated
 * walkthrough cells, not for the 1000-device synthetic fleet).
 *
 * Honest framing: we deliberately DO NOT synthesize a fake 90% PI for fleet
 * devices. fleet_devices.json carries point estimates only; the PI machinery
 * lives in /twin where we have per-cell PyBaMM trajectories to calibrate.
 */
export function DeviceDrilldown({ device, licRcEnvelope, onClose }: Props) {
  // Close on Escape key — keyboard accessibility.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const bbuYrs = device.rul_cycles / 50;
  const sohPct = device.soh_lfp * 100;
  const licPct = device.soh_lic * 100;

  // Thresholds for visual reference lines.
  const sohWarnPct = 85; // early_aging gate
  const rulWarnCycles = 800; // early_aging gate

  // The 80–110 % SOH range gives the bar enough headroom to show degradation
  // visually; bars fill from left, threshold marker drawn at 85 %.
  const sohBarRange = { min: 70, max: 100 };
  const sohBarPct = ((sohPct - sohBarRange.min) / (sohBarRange.max - sohBarRange.min)) * 100;
  const sohWarnBarPct = ((sohWarnPct - sohBarRange.min) / (sohBarRange.max - sohBarRange.min)) * 100;
  const licBarPct = ((licPct - sohBarRange.min) / (sohBarRange.max - sohBarRange.min)) * 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drilldown-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="simulated-watermark relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_40px_80px_-24px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
              {device.id}
            </div>
            <h2 id="drilldown-title" className="mt-1 truncate text-lg font-semibold sm:text-xl">
              {device.site}
            </h2>
            <div className="mt-0.5 text-xs text-muted">
              {device.location} · {device.lat.toFixed(2)}°, {device.lng.toFixed(2)}°
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
              style={{
                background: `${STATUS_COLOR[device.status]}20`,
                color: STATUS_COLOR[device.status],
              }}
            >
              {STATUS_LABEL[device.status]}
            </span>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-muted transition-colors hover:bg-surface/60 hover:text-foreground"
              aria-label="Close drilldown"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* SOH bars */}
        <section className="space-y-4 border-b border-border p-5">
          <h3 className="text-xs uppercase tracking-wider text-muted">State of Health</h3>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted">SOH (LFP main)</span>
              <span className="font-mono font-medium tabular-nums">{sohPct.toFixed(1)} %</span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-border">
              <div
                className="absolute h-full rounded-full"
                style={{
                  width: `${Math.max(0, Math.min(100, sohBarPct))}%`,
                  background: STATUS_COLOR[device.status],
                }}
              />
              {/* 85 % early_aging threshold marker */}
              <div
                className="absolute top-0 h-full w-px bg-warning"
                style={{ left: `${sohWarnBarPct}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="relative mt-1 flex justify-between text-[10px] text-muted">
              <span>{sohBarRange.min} %</span>
              <span
                className="absolute top-0"
                style={{ left: `calc(${sohWarnBarPct}% - 1.5rem)` }}
              >
                85 % gate
              </span>
              <span>{sohBarRange.max} %</span>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted">SOH (LIC supercap)</span>
              <span className="font-mono font-medium tabular-nums">{licPct.toFixed(1)} %</span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-border">
              <div
                className="absolute h-full rounded-full bg-accent/70"
                style={{ width: `${Math.max(0, Math.min(100, licBarPct))}%` }}
              />
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-muted">
            <span className="text-foreground">soh_lic</span> is datasheet-derived (LIC ≥ 100 k cycles
            per Eaton XLR / JM Energy specs). LIC public cycling data is too scarce for ML;
            BBU duty doesn&rsquo;t push LIC near its limits (whitepaper §6.2).
          </p>
        </section>

        {/* Backup capability at this device's current age — the customer's first
            question, so it leads. Derived client-side from soh_lfp via @/lib/aging
            (mirror of the Python DCIR-growth model). */}
        <section className="space-y-3 border-b border-border p-5">
          <h3 className="text-xs uppercase tracking-wider text-muted">
            If mains drops now — backup capability
          </h3>
          <p className="text-sm text-foreground leading-relaxed">
            This unit delivers{" "}
            <span className="font-semibold tabular-nums">
              {Math.round(peakPowerRetention(device.soh_lfp) * 100)}%
            </span>{" "}
            peak power for{" "}
            <span className="font-semibold tabular-nums">
              {Math.round(backupRuntimeSeconds(device.soh_lfp))} s
            </span>{" "}
            —{" "}
            <span className="font-semibold tabular-nums">
              {(backupRuntimeSeconds(device.soh_lfp) / 60).toFixed(1)}×
            </span>{" "}
            the 60-second graceful-shutdown commitment, at its current{" "}
            {Math.round(device.soh_lfp * 100)}% SOH.
          </p>
          <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
            <Metric
              label="Backup runtime @ rack peak"
              value={`${Math.round(backupRuntimeSeconds(device.soh_lfp))} s`}
            />
            <Metric
              label="… margin vs 60 s commitment"
              value={`${(backupRuntimeSeconds(device.soh_lfp) / 60).toFixed(1)}×`}
            />
            <Metric
              label="LFP peak-power capability"
              value={`${Math.round(peakPowerRetention(device.soh_lfp) * 100)} %`}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-muted">
            What a Data Center buyer asks first — deliverable power + runtime after aging, not just
            SOH/RUL. Runtime is energy-limited (∝&nbsp;SOH); peak-power capability dips with
            internal-resistance rise (+{Math.round(dcirGrowth(device.soh_lfp) * 100)}% here), but the
            millisecond peak is handled by the capacitor, so it doesn&rsquo;t gate the rack.
          </p>
        </section>

        {/* RUL */}
        <section className="space-y-3 border-b border-border p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-wider text-muted">RUL prediction</h3>
            <a
              href="/twin"
              className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
            >
              See conformal PI bands on /twin <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="font-mono text-2xl font-semibold tabular-nums">
              {device.rul_cycles.toLocaleString()}
            </span>
            <span className="text-xs text-muted">cycles</span>
            <span className="ml-auto text-xs text-muted">
              {bbuYrs >= 15 ? (
                <>
                  cycle-fade headroom{" "}
                  <span className="font-mono text-foreground">≫ 10 yr</span>{" "}
                  <span className="text-muted/70">(calendar-life binds first)</span>
                </>
              ) : (
                <>
                  ≈{" "}
                  <span className="font-mono text-foreground tabular-nums">
                    {bbuYrs.toFixed(1)}
                  </span>{" "}
                  yr <span className="text-muted/70">(cycle-fade only)</span>
                </>
              )}
            </span>
          </div>

          {device.rul_cycles < rulWarnCycles && (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              ⚠ RUL below 800-cycle gate · admission rule triggers Tier-3 replacement queue
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted">
            Point estimate from the same LSTM deployed on{" "}
            <span className="text-foreground">/twin</span> (one model, two views). The ≫&nbsp;10&nbsp;yr
            figure is cycle-fade headroom (cycles&nbsp;÷&nbsp;50&nbsp;cyc/yr); the real limit is{" "}
            <span className="text-foreground">calendar/storage life ~8–12&nbsp;yr</span> (proposal §G.3 /
            附件 C), so Tier-3 admission triggers almost entirely on{" "}
            <span className="text-foreground">SOH&nbsp;&lt;&nbsp;0.85</span>, with{" "}
            <code className="text-foreground">RUL&nbsp;&lt;&nbsp;800</code> as the fallback-path safety net.
          </p>
        </section>

        {/* Operational metrics */}
        <section className="grid grid-cols-2 gap-x-5 gap-y-4 border-b border-border p-5 sm:grid-cols-4">
          <Metric label="Age" value={`${device.age_months.toFixed(1)} mo`} />
          <Metric label="Transients (24 h)" value={device.transient_events_24h.toLocaleString()} />
          <Metric label="Temp LFP" value={`${device.temp_lfp_c.toFixed(1)} °C`} />
          <Metric label="Temp LIC" value={`${device.temp_lic_c.toFixed(1)} °C`} />
        </section>

        {/* LIC bank RC envelope — system-level reference, not per-device
            telemetry. Sourced from /twin hybrid scenario (closed-form RC
            model anchored to Eaton XLR datasheet). Shown here so a Tier-3
            queue reviewer can quickly confirm: even on this aging device,
            the rack's LIC bank still clears the UVLO under the demo
            transient waveform. */}
        <section className="space-y-3 border-b border-border p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted">
              <Zap className="h-3 w-3 text-primary" />
              LIC bank envelope · system-level RC
            </h3>
            <a
              href="/twin"
              className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
            >
              See v_lic(t) curve on /twin <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>

          {/* Headroom bar: from V_min_datasheet (38 V cutoff) on the left
              to V_nominal on the right. The fill shows where v_min sits
              within that band — the further right, the more headroom. */}
          {(() => {
            const lo = licRcEnvelope.v_min_datasheet;
            const hi = licRcEnvelope.v_nominal;
            const span = Math.max(1e-6, hi - lo);
            const vMinPct = ((licRcEnvelope.v_min - lo) / span) * 100;
            const fillColor = licRcEnvelope.passes_cutoff ? "#34d399" : "#f87171";
            const safeFillPct = Math.max(0, Math.min(100, vMinPct));
            return (
              <div>
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="text-muted">v_min observed</span>
                  <span className="font-mono font-medium tabular-nums">
                    {licRcEnvelope.v_min.toFixed(2)} V
                    <span className="ml-1 text-muted">/ {hi.toFixed(1)} V nominal</span>
                  </span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-border">
                  <div
                    className="absolute h-full rounded-full"
                    style={{ width: `${safeFillPct}%`, background: fillColor }}
                  />
                  {/* v_nominal marker at far right */}
                  <div
                    className="absolute top-0 h-full w-px bg-muted/70"
                    style={{ left: "100%" }}
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-muted">
                  <span>UVLO {lo.toFixed(0)} V</span>
                  <span>nominal {hi.toFixed(1)} V</span>
                </div>
              </div>
            );
          })()}

          {/* Four-up metric tiles for the actual numbers. */}
          <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
            <Metric
              label="Droop (worst-case)"
              value={`${licRcEnvelope.v_droop_v.toFixed(2)} V`}
            />
            <Metric
              label="Headroom to UVLO"
              value={`${licRcEnvelope.headroom_to_cutoff_v.toFixed(2)} V`}
            />
            <Metric
              label="Bank C"
              value={`${licRcEnvelope.c_f.toFixed(0)} F`}
            />
            <Metric
              label="Bank ESR"
              value={`${(licRcEnvelope.esr_ohm * 1000).toFixed(2)} mΩ`}
            />
          </div>

          {licRcEnvelope.passes_cutoff ? (
            <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-[11px] text-success">
              ✓ Passes Eaton XLR UVLO ({licRcEnvelope.v_min_datasheet.toFixed(0)} V) under the
              v2.2 §B.1 demo transient waveform — {licRcEnvelope.headroom_to_cutoff_v.toFixed(2)} V
              margin to cutoff.
            </div>
          ) : (
            <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] text-danger">
              ✗ LIC v_min falls below datasheet UVLO — production design fails for this waveform.
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted">
            <span className="font-medium text-warning">System-level reference</span>, not
            per-device telemetry — the LIC bank topology (Eaton XLR-48-166 × 2 parallel) is
            common to all rack-level Sysblade BBUs per v2.2 §E.1. Per-device LIC voltage
            telemetry lands with the FastAPI backend (W3+). Droop is ESR-dominated
            (~95 % at 926 A peak), so production scaling beyond 8 BBU/rack would mainly add
            parallel modules to drop ESR rather than additional capacitance.
          </p>
          <p className="text-[11px] leading-relaxed text-muted">
            <span className="font-medium text-warning">⚠ Current-rating gate not modelled:</span>{" "}
            the RC model verifies voltage envelope (v_min &gt; 38 V) but does NOT check the
            463 A per-module peak (926 A across 2 parallel) against the Eaton XLR-48-166
            datasheet&rsquo;s rated pulse current. Typical 48 V LIC modules at this size
            handle 500–1500 A briefly under 30 s, so the 100 ms pulse should be inside
            spec — but production must verify on Eaton&rsquo;s lot-specific datasheet
            before design freeze (see <code className="text-foreground">docs/citations_audit.md</code>).
          </p>
        </section>

        {/* Disclaimer footer */}
        <footer className="bg-surface/60 px-5 py-3 text-[11px] leading-relaxed text-muted">
          <span className="font-medium text-warning">Synthetic device.</span> Generated by a seeded
          RNG simulator (<span className="font-mono text-foreground">scripts/generate_twin_scenarios.py</span>);
          no production deployment. Fleet site names are fictional personas (TenantCo / ColoOp /
          DataCo / HyperscaleCo / CarrierHotel) — no real-brand commercial relationship is
          implied or claimed.
        </footer>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}
