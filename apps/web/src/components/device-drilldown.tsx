"use client";

import { useEffect } from "react";
import { X, ArrowUpRight } from "lucide-react";
import { type Device, STATUS_COLOR, STATUS_LABEL } from "@/lib/types";

interface Props {
  device: Device;
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
export function DeviceDrilldown({ device, onClose }: Props) {
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
            <div className="mt-1 flex justify-between text-[10px] text-muted">
              <span>{sohBarRange.min} %</span>
              <span style={{ position: "absolute", marginLeft: `${sohWarnBarPct - 4}%` }}>
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
                className="absolute h-full rounded-full bg-info/70"
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

        {/* RUL */}
        <section className="space-y-3 border-b border-border p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-wider text-muted">RUL prediction</h3>
            <a
              href="/twin"
              className="inline-flex items-center gap-1 text-[11px] text-info hover:underline"
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
              ≈ <span className="font-mono text-foreground tabular-nums">{bbuYrs.toFixed(1)}</span>{" "}
              BBU years remaining
            </span>
          </div>

          {device.rul_cycles < rulWarnCycles && (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              ⚠ RUL below 800-cycle gate · admission rule triggers Tier-3 replacement queue
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted">
            Point estimate from the same LSTM deployed on /twin (one model, two views;
            ΔMAPE +0.10 pp INT8). 90 % conformal PI bands are calibrated only on the 9
            walkthrough cells in /twin; per-device fleet PI bands would require
            per-device PyBaMM trajectories.
          </p>
        </section>

        {/* Operational metrics */}
        <section className="grid grid-cols-2 gap-x-5 gap-y-4 border-b border-border p-5 sm:grid-cols-4">
          <Metric label="Age" value={`${device.age_months.toFixed(1)} mo`} />
          <Metric label="Transients (24 h)" value={device.transient_events_24h.toLocaleString()} />
          <Metric label="Temp LFP" value={`${device.temp_lfp_c.toFixed(1)} °C`} />
          <Metric label="Temp LIC" value={`${device.temp_lic_c.toFixed(1)} °C`} />
        </section>

        {/* Disclaimer footer */}
        <footer className="bg-surface/60 px-5 py-3 text-[11px] leading-relaxed text-muted">
          <span className="font-medium text-warning">Synthetic device.</span> Generated by a seeded
          RNG simulator (<span className="font-mono text-foreground">scripts/generate_twin_scenarios.py</span>);
          no production deployment. Fleet site names use real cloud-provider brands as
          illustrative personas only — no commercial relationship is implied or claimed.
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
