"use client";

import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { type LiveDemonstratorSnapshot, STATUS_COLOR, STATUS_LABEL } from "@/lib/types";
import { Activity, CircleAlert, CircleCheck, Radio } from "lucide-react";

/**
 * LIVE bench demonstrator card — polls /scenarios/live_demonstrator.json
 * every 5 s and renders the most recent telemetry snapshot. The poll runs
 * client-side only (the static build ships with `live=false` placeholder,
 * the lab laptop's bridge script overwrites the file when running).
 *
 * Refs: docs/BBU_IMPLEMENTATION_PLAN.md §5.4 (M4 critical path #4).
 */

const POLL_INTERVAL_MS = 5000;
const SNAPSHOT_URL = "/scenarios/live_demonstrator.json";

export function LiveDemonstratorCard() {
  const [snap, setSnap] = useState<LiveDemonstratorSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchOnce() {
      try {
        // Bust the cache — Vercel CDN otherwise serves the build-time
        // placeholder forever even when the bridge is updating it locally.
        // In production this URL is static, but during a local dry-run the
        // bridge is overwriting the file on disk between fetches.
        const res = await fetch(`${SNAPSHOT_URL}?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as LiveDemonstratorSnapshot;
        if (cancelled) return;
        setSnap(data);
        setLastFetched(Date.now());
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    }

    fetchOnce();
    const id = setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const live = Boolean(snap?.live && snap.device);
  const d = snap?.device ?? null;

  return (
    <Card
      className={
        live
          ? "border-emerald-500/40 shadow-[0_0_24px_rgba(52,211,153,0.18)]"
          : "border-border"
      }
      aria-live="polite"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          {live ? (
            <span className="relative inline-flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          ) : (
            <Radio className="h-4 w-4 text-muted" />
          )}
          <span>Live bench demonstrator</span>
          <span
            className={
              "ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider " +
              (live
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-muted/10 text-muted")
            }
          >
            {live ? "LIVE" : "Offline"}
          </span>
          {snap?._meta.mode && (
            <span className="ml-1 rounded-full bg-muted/10 px-2 py-0.5 text-[10px] font-mono text-muted">
              {snap._meta.mode}
            </span>
          )}
        </CardTitle>
        <p className="mt-1 text-[11px] text-muted">
          {live
            ? "Real-time telemetry from the ATCC C13 bench demonstrator — overlaid on the simulated 1000-device fleet below."
            : "No bridge connected. Run "}
          {!live && (
            <code className="text-foreground">
              python scripts/live_demonstrator_bridge.py --mock
            </code>
          )}
          {!live && " on the lab laptop to populate."}
        </p>
      </CardHeader>
      <CardBody>
        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <CircleAlert className="h-3.5 w-3.5" />
            <span>Polling error: {error} (retrying every {POLL_INTERVAL_MS / 1000}s)</span>
          </div>
        )}
        {!live || !d ? (
          <div className="flex items-center gap-3 py-2 text-sm text-muted">
            <Activity className="h-4 w-4 opacity-50" />
            Waiting for telemetry…
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
            <LiveStat label="Device" value={d.id} mono />
            <LiveStat
              label="Status"
              value={
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
                  style={{
                    background: `${STATUS_COLOR[d.status]}20`,
                    color: STATUS_COLOR[d.status],
                  }}
                >
                  {STATUS_LABEL[d.status]}
                </span>
              }
            />
            <LiveStat label="V_pack" value={`${d.v_pack_v.toFixed(2)} V`} mono />
            <LiveStat label="I_pack" value={`${d.i_pack_a.toFixed(1)} A`} mono />
            <LiveStat label="P_load" value={`${d.p_load_w.toFixed(0)} W`} mono />
            <LiveStat label="T_LFP" value={`${d.temp_lfp_c.toFixed(1)} °C`} mono />
            <LiveStat
              label="Hybrid"
              value={
                d.hybrid_mode ? (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CircleCheck className="h-3 w-3" /> on
                  </span>
                ) : (
                  <span className="text-muted">off</span>
                )
              }
            />
            <LiveStat
              label="SOH (LFP / LIC)"
              value={`${(d.soh_lfp * 100).toFixed(1)} / ${(d.soh_lic * 100).toFixed(1)}%`}
              mono
            />
            <LiveStat label="RUL" value={`${d.rul_cycles} cyc`} mono />
            <LiveStat label="T_LIC" value={`${d.temp_lic_c.toFixed(1)} °C`} mono />
            <LiveStat
              label="Updated"
              value={
                snap?._meta.generated_at
                  ? new Date(snap._meta.generated_at).toLocaleTimeString()
                  : "—"
              }
              mono
            />
            {snap?._meta.uptime_s !== undefined && (
              <LiveStat
                label="Bridge uptime"
                value={`${snap._meta.uptime_s.toFixed(0)}s`}
                mono
              />
            )}
            {lastFetched && (
              <LiveStat
                label="Last poll"
                value={`${Math.max(0, Math.round((Date.now() - lastFetched) / 1000))}s ago`}
                mono
              />
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function LiveStat({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={(mono ? "font-mono " : "") + "text-sm text-foreground truncate"}>
        {value}
      </div>
    </div>
  );
}
