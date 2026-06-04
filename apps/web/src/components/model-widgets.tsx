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
        試試看 — 日曆壽命 vs 儲存條件
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-center">
        <div className="space-y-3">
          <Slider
            label="儲存溫度"
            value={tempC}
            min={20}
            max={45}
            step={1}
            onChange={setTempC}
            display={`${tempC} °C`}
          />
          <Slider
            label="充電狀態（浮充水位）"
            value={soc}
            min={0.4}
            max={1.0}
            step={0.05}
            onChange={setSoc}
            display={`${Math.round(soc * 100)} %`}
          />
        </div>
        <div className="text-center sm:text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted">日曆壽命 → 80% SOH</div>
          <div
            className="text-3xl sm:text-4xl font-semibold tabular-nums"
            style={{ color: lifeTone(life) }}
          >
            {life >= 100 ? "100+" : life.toFixed(1)} <span className="text-base">年</span>
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" style={{ height: 80 }} preserveAspectRatio="none">
        <line x1={0} y1={gateY} x2={W} y2={gateY} stroke="var(--warning)" strokeDasharray="4 3" strokeWidth={1} opacity={0.7} />
        <polyline points={pts} fill="none" stroke={lifeTone(life)} strokeWidth={2} />
        {lifeX < W && <line x1={lifeX} y1={0} x2={lifeX} y2={H} stroke="var(--muted)" strokeDasharray="2 2" strokeWidth={1} opacity={0.6} />}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>0 年</span>
        <span className="text-warning">80% SOH 門檻</span>
        <span>{YEARS} 年</span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        儲存溫度越高、電量越滿，壽命越短（Arrhenius × SOC、Naumann √t 形式;絕對尺度
        校準至提案的 8–12 年 LFP 浮充壽命）。DC 備援長期處於接近滿電狀態，
        因此日曆老化 — 而非循環 — 才是綁定限制。
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
        試試看 — 任何老化階段下的備援能力
      </div>
      <Slider
        label="電池組健康狀態（全新 → 壽命末期）"
        value={soh}
        min={0.7}
        max={1.0}
        step={0.01}
        onChange={setSoh}
        display={`${Math.round(soh * 100)} % SOH`}
      />
      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">備援續航時間</div>
          <div className="text-2xl font-semibold tabular-nums text-foreground">{Math.round(runtime)} s</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">vs 60 s 承諾值</div>
          <div
            className="text-2xl font-semibold tabular-nums"
            style={{ color: margin >= 1 ? "var(--success)" : "var(--danger)" }}
          >
            {margin.toFixed(1)}×
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">峰值功率能力</div>
          <div className="text-2xl font-semibold tabular-nums text-foreground">{Math.round(peakRet * 100)} %</div>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        續航時間隨容量等比變化（∝ SOH），即使在壽命末期仍遠高於 60 s 承諾值。
        峰值功率能力會隨內阻上升而下降（在此 SOH 下 +{Math.round(dcir * 100)}%）
        — 但毫秒級的峰值由電容承擔，因此這並不會限制
        機架。
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
        試試看 — 機架熱梯度決定最弱電芯
      </div>
      <Slider
        label={`熱通道出風口溫度（進風口固定 ${inletC} °C）`}
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
          <span className="absolute -top-4 right-0 text-[10px] text-warning">80% 門檻</span>
        </div>
        {cells.map((c) => {
          const h = ((c.soh - 0.55) / (0.85 - 0.55)) * 100;
          const isWeak = c.idx === weakest.idx;
          const hotFrac = (c.t - inletC) / Math.max(1e-6, outletC - inletC);
          return (
            <div
              key={c.idx}
              className="relative flex-1 self-stretch flex flex-col items-center justify-end"
              title={`電芯 ${c.idx} · ${c.t.toFixed(1)} °C · SOH@7年 ${(c.soh * 100).toFixed(1)}%`}
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
          <div className="text-[10px] uppercase tracking-wider text-muted">最弱電芯 SOH @ 7 年</div>
          <div className="text-xl font-semibold tabular-nums text-danger">
            {(weakest.soh * 100).toFixed(0)} %
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">冷端壽命</div>
          <div className="text-xl font-semibold tabular-nums text-foreground">{lifeCold.toFixed(1)} 年</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">熱端壽命</div>
          <div className="text-xl font-semibold tabular-nums text-danger">{lifeHot.toFixed(1)} 年</div>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        串聯電芯共用同一電流，因此整串受限於最弱的成員 — 而最熱的
        電芯老化最快。管理熱的<em>均勻性</em>（而不只是平均溫度），才是
        保護整串壽命的關鍵。
      </p>
    </div>
  );
}
