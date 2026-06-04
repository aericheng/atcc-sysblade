"use client";

/**
 * Interactive model widgets for /twin.
 *
 * These turn the (closed-form) aging / power models into live "drag a slider,
 * watch the model respond" widgets. All math runs client-side via @/lib/aging
 * (mirror of scripts/generate_twin_scenarios.py), so this stays inside the
 * static-export architecture — no server, no PyBaMM in the browser.
 *
 * Kept dependency-light on purpose: live curves are hand-rendered SVG sparklines
 * (not Recharts) so dragging a slider re-renders smoothly without chart-library
 * animation churn.
 */

import { useId, useState } from "react";
import {
  calendarSoh,
  calendarLifeYears,
  peakPowerRetention,
  backupRuntimeSeconds,
  dcirGrowth,
  BACKUP_COMMITMENT_S,
} from "@/lib/aging";

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
}) {
  const id = useId();
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <label htmlFor={id} className="text-muted">
          {label}
        </label>
        <span className="font-mono font-medium tabular-nums text-foreground">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full cursor-pointer"
        style={{ accentColor: "var(--primary)" }}
      />
    </div>
  );
}

/** Tone for a "years to 80% SOH" figure: short life = danger, long = success. */
function lifeTone(yr: number): string {
  if (yr < 6) return "var(--danger)";
  if (yr < 12) return "var(--warning)";
  return "var(--success)";
}

/**
 * Calendar-life widget: drag storage temperature + SOC, watch calendar life
 * (years to 80% SOH) and the fade curve update live. Demonstrates the mentor's
 * point that hotter + fuller storage shortens calendar life.
 */
export function CalendarWidget() {
  const [tempC, setTempC] = useState(30);
  const [soc, setSoc] = useState(0.9);
  const life = calendarLifeYears(tempC, soc);

  // SVG sparkline of SOH vs years (0..20 yr).
  const W = 320;
  const H = 80;
  const YEARS = 20;
  const yToY = (soh: number) => H - ((soh - 0.55) / (1.0 - 0.55)) * H; // 55%..100% → H..0
  const pts = Array.from({ length: 41 }, (_, i) => {
    const yr = (i / 40) * YEARS;
    const x = (yr / YEARS) * W;
    return `${x.toFixed(1)},${yToY(calendarSoh(yr, tempC, soc)).toFixed(1)}`;
  }).join(" ");
  const gateY = yToY(0.8);
  const lifeX = Math.min(W, (life / YEARS) * W);

  return (
    <div className="rounded-lg border border-border bg-background/40 p-4">
      <div className="mb-3 text-sm font-medium text-foreground">
        Try it — calendar life vs storage conditions
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-center">
        <div className="space-y-3">
          <Slider
            label="Storage temperature"
            value={tempC}
            min={20}
            max={45}
            step={1}
            onChange={setTempC}
            display={`${tempC} °C`}
          />
          <Slider
            label="State of charge (float level)"
            value={soc}
            min={0.4}
            max={1.0}
            step={0.05}
            onChange={setSoc}
            display={`${Math.round(soc * 100)} %`}
          />
        </div>
        <div className="text-center sm:text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted">Calendar life → 80% SOH</div>
          <div
            className="text-3xl sm:text-4xl font-semibold tabular-nums"
            style={{ color: lifeTone(life) }}
          >
            {life >= 100 ? "100+" : life.toFixed(1)} <span className="text-base">yr</span>
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" style={{ height: 80 }} preserveAspectRatio="none">
        <line x1={0} y1={gateY} x2={W} y2={gateY} stroke="var(--warning)" strokeDasharray="4 3" strokeWidth={1} opacity={0.7} />
        <polyline points={pts} fill="none" stroke={lifeTone(life)} strokeWidth={2} />
        {lifeX < W && <line x1={lifeX} y1={0} x2={lifeX} y2={H} stroke="var(--muted)" strokeDasharray="2 2" strokeWidth={1} opacity={0.6} />}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>0 yr</span>
        <span className="text-warning">80% SOH gate</span>
        <span>{YEARS} yr</span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Hotter and fuller storage shortens life (Arrhenius × SOC, Naumann √t form; absolute scale
        calibrated to the proposal&rsquo;s 8–12 yr LFP float life). DC backup sits near full charge,
        so calendar — not cycling — is the binding limit.
      </p>
    </div>
  );
}

/**
 * Aged-power widget: drag the pack's SOH and watch deliverable backup runtime,
 * margin vs the 60 s commitment, and LFP peak-power capability update live.
 */
export function AgedPowerWidget() {
  const [soh, setSoh] = useState(0.8);
  const runtime = backupRuntimeSeconds(soh);
  const margin = runtime / BACKUP_COMMITMENT_S;
  const peakRet = peakPowerRetention(soh);
  const dcir = dcirGrowth(soh);

  return (
    <div className="rounded-lg border border-border bg-background/40 p-4">
      <div className="mb-3 text-sm font-medium text-foreground">
        Try it — backup capability at any age
      </div>
      <Slider
        label="Pack State of Health (new → end of life)"
        value={soh}
        min={0.7}
        max={1.0}
        step={0.01}
        onChange={setSoh}
        display={`${Math.round(soh * 100)} % SOH`}
      />
      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">Backup runtime</div>
          <div className="text-2xl font-semibold tabular-nums text-foreground">{Math.round(runtime)} s</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">vs 60 s commitment</div>
          <div
            className="text-2xl font-semibold tabular-nums"
            style={{ color: margin >= 1 ? "var(--success)" : "var(--danger)" }}
          >
            {margin.toFixed(1)}×
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">Peak-power capability</div>
          <div className="text-2xl font-semibold tabular-nums text-foreground">{Math.round(peakRet * 100)} %</div>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Runtime scales with capacity (∝ SOH) and stays well above the 60 s commitment even at
        end-of-life. Peak-power capability dips with internal-resistance rise (+{Math.round(dcir * 100)}%
        at this SOH) — but the millisecond peak is handled by the capacitor, so this doesn&rsquo;t gate
        the rack.
      </p>
    </div>
  );
}

/**
 * Pack thermal-gradient widget: drag the rack inlet→outlet temperature gradient
 * and watch the per-cell SOH-after-7-years bars and the weakest cell update live.
 */
export function PackThermalWidget({ nSeries = 15, inletC = 28 }: { nSeries?: number; inletC?: number }) {
  const [outletC, setOutletC] = useState(40);
  const cells = Array.from({ length: nSeries }, (_, i) => {
    const t = inletC + ((outletC - inletC) * i) / (nSeries - 1);
    return { idx: i, t, soh: calendarSoh(7, t, 0.9) };
  });
  const weakest = cells.reduce((a, b) => (b.soh < a.soh ? b : a), cells[0]);
  const lifeCold = calendarLifeYears(inletC, 0.9);
  const lifeHot = calendarLifeYears(outletC, 0.9);

  return (
    <div className="rounded-lg border border-border bg-background/40 p-4">
      <div className="mb-3 text-sm font-medium text-foreground">
        Try it — rack thermal gradient drives the weakest cell
      </div>
      <Slider
        label={`Hot-aisle outlet temperature (inlet fixed ${inletC} °C)`}
        value={outletC}
        min={inletC}
        max={50}
        step={1}
        onChange={setOutletC}
        display={`${outletC} °C  ·  Δ${(outletC - inletC).toFixed(0)} °C`}
      />
      <div className="mt-3 relative flex items-end gap-1 h-28 border-b border-border/40">
        <div
          className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-warning/60"
          style={{ bottom: `${((0.8 - 0.55) / (0.85 - 0.55)) * 100}%` }}
        >
          <span className="absolute -top-4 right-0 text-[10px] text-warning">80% gate</span>
        </div>
        {cells.map((c) => {
          const h = ((c.soh - 0.55) / (0.85 - 0.55)) * 100;
          const isWeak = c.idx === weakest.idx;
          const hotFrac = (c.t - inletC) / Math.max(1e-6, outletC - inletC);
          return (
            <div
              key={c.idx}
              className="relative flex-1 self-stretch flex flex-col items-center justify-end"
              title={`cell ${c.idx} · ${c.t.toFixed(1)} °C · SOH@7yr ${(c.soh * 100).toFixed(1)}%`}
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
      <div className="mt-2 grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">Weakest cell SOH @ 7 yr</div>
          <div className="text-xl font-semibold tabular-nums text-danger">
            {(weakest.soh * 100).toFixed(0)} %
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">Cold-end life</div>
          <div className="text-xl font-semibold tabular-nums text-foreground">{lifeCold.toFixed(1)} yr</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">Hot-end life</div>
          <div className="text-xl font-semibold tabular-nums text-danger">{lifeHot.toFixed(1)} yr</div>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Series cells share current, so the string is limited by its weakest member — and the hottest
        cell ages fastest. Managing thermal <em>uniformity</em> (not just average temperature) is what
        protects string life.
      </p>
    </div>
  );
}
