"use client";

import { useMemo, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { USFleetMap } from "@/components/us-fleet-map";
import { Activity, AlertTriangle, MapPin, Shield, Zap } from "lucide-react";

interface Device {
  id: string;
  site: string;
  location: string;
  lat: number;
  lng: number;
  soh_lfp: number;
  soh_lic: number;
  rul_cycles: number;
  age_months: number;
  transient_events_24h: number;
  temp_lfp_c: number;
  temp_lic_c: number;
  status: "healthy" | "thermal_warn" | "early_aging";
}

interface Fleet {
  title: string;
  disclaimer: string;
  n_devices: number;
  geographic_distribution: Record<string, number>;
  status_summary: Record<string, number>;
  soh_buckets: Record<string, number>;
  needs_replacement_in_6mo: number;
  devices: Device[];
}

const STATUS_COLOR: Record<Device["status"], string> = {
  healthy: "#34d399",
  thermal_warn: "#fbbf24",
  early_aging: "#f87171",
};

const STATUS_LABEL: Record<Device["status"], string> = {
  healthy: "Healthy",
  thermal_warn: "Thermal warning",
  early_aging: "Early aging",
};

export function DashboardClient({ fleet }: { fleet: Fleet }) {
  const [filter, setFilter] = useState<"all" | Device["status"]>("all");

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

  // Most-urgent first: smallest RUL at the top, so row 1 is the device that
  // needs replacing soonest. Aligned with the Tier-1 status logic — anything
  // already flagged early_aging (SOH < 0.85 OR rul < 800) is on the queue.
  const replacementCandidates = useMemo(
    () =>
      fleet.devices
        .filter((d) => d.status === "early_aging")
        .sort((a, b) => a.rul_cycles - b.rul_cycles)
        .slice(0, 8),
    [fleet.devices],
  );

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.2em] text-muted">Fleet Health Dashboard</div>
          <h1 className="text-4xl font-semibold tracking-tight">{fleet.n_devices.toLocaleString()} Sysblade BBUs across the fleet</h1>
          <p className="text-muted max-w-3xl leading-relaxed">
            Three service tiers visible side-by-side: real-time monitoring, proactive maintenance triggered by Battery
            Twin SOH inference, and predictive ops surfacing replacement candidates before SOH crosses 80 %.
          </p>
        </div>
        <span className="rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-warning">
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
            hint={`${((fleet.status_summary.healthy / fleet.n_devices) * 100).toFixed(1)} % uptime`}
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
            hint="SOH dropping faster than RUL model expects"
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
                State outlines from <code className="text-foreground">us-atlas</code> (US Census 2017, 1:10M).
                Texas + Virginia clusters dominate, matching JLL Year-End 2025 site weighting (§C.1). Hover any
                marker for device-level telemetry.
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
              <div className="pt-3 mt-3 border-t border-border text-xs text-muted leading-relaxed">
                Buckets driven by Battery Twin SOH inference. Anything <span className="text-foreground">&lt; 85 %</span> goes
                into the Tier 3 replacement queue.
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
              Most urgent 8 · sorted by lowest RUL first
            </CardTitle>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted text-xs uppercase tracking-wider">
                    <th className="text-left py-2">Device</th>
                    <th className="text-left py-2">Site</th>
                    <th className="text-right py-2">SOH</th>
                    <th className="text-right py-2">RUL (cycles)</th>
                    <th className="text-right py-2">Age (mo)</th>
                    <th className="text-right py-2">Temp LFP</th>
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
                    <tr key={d.id} className="border-t border-border">
                      <td className="py-2.5 font-mono text-xs">{d.id}</td>
                      <td className="py-2.5">
                        <div>{d.site}</div>
                        <div className="text-xs text-muted">{d.location}</div>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{(d.soh_lfp * 100).toFixed(1)}%</td>
                      <td className="py-2.5 text-right tabular-nums">{d.rul_cycles}</td>
                      <td className="py-2.5 text-right tabular-nums">{d.age_months}</td>
                      <td className="py-2.5 text-right tabular-nums">{d.temp_lfp_c}°C</td>
                      <td className="py-2.5 text-right">
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-medium"
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
              {fleet.needs_replacement_in_6mo} devices flagged for replacement within 6 months — automatically
              registered into the customer&rsquo;s ServiceNow / Jira pipeline via webhook.
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
          {fleet.disclaimer} The 1000 devices are generated with a documented seeded RNG (see{" "}
          <code className="text-foreground">scripts/generate_twin_scenarios.py</code>) and weighted to Texas + Virginia
          per JLL YE-2025. Status, temperatures, and aging buckets reflect plausible field distributions but no
          production deployment exists yet.
        </CardBody>
      </Card>
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
