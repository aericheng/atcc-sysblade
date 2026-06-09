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
              aria-label="關閉詳情面板"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* SOH bars */}
        <section className="space-y-4 border-b border-border p-5">
          <h3 className="text-xs uppercase tracking-wider text-muted">健康狀態</h3>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted">SOH（LFP 主電池）</span>
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
                85 % 閾值
              </span>
              <span>{sohBarRange.max} %</span>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted">SOH（LIC 超級電容）</span>
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
            <span className="text-foreground">soh_lic</span> 由資料表推導（依 Eaton XLR / JM Energy 規格,LIC ≥ 100 k cycles）。LIC 公開循環資料對 ML 而言過於稀少;
            BBU 工作負載不會將 LIC 推近其極限（whitepaper §6.2）。
          </p>
        </section>

        {/* Backup capability at this device's current age — the customer's first
            question, so it leads. Derived client-side from soh_lfp via @/lib/aging
            (mirror of the Python DCIR-growth model). */}
        <section className="space-y-3 border-b border-border p-5">
          <h3 className="text-xs uppercase tracking-wider text-muted">
            若市電此刻中斷 — 備援能力
          </h3>
          <p className="text-sm text-foreground leading-relaxed">
            本設備可提供{" "}
            <span className="font-semibold tabular-nums">
              {Math.round(peakPowerRetention(device.soh_lfp) * 100)}%
            </span>{" "}
            峰值功率,持續{" "}
            <span className="font-semibold tabular-nums">
              {Math.round(backupRuntimeSeconds(device.soh_lfp))} s
            </span>{" "}
            —{" "}
            <span className="font-semibold tabular-nums">
              {(backupRuntimeSeconds(device.soh_lfp) / 60).toFixed(1)}×
            </span>{" "}
            於 60 秒優雅關機承諾之上,在其目前的{" "}
            {Math.round(device.soh_lfp * 100)}% SOH 下達成。
          </p>
          <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
            <Metric
              label="機架峰值下的備援續航時間"
              value={`${Math.round(backupRuntimeSeconds(device.soh_lfp))} s`}
            />
            <Metric
              label="… 相對 60 s 承諾的餘量"
              value={`${(backupRuntimeSeconds(device.soh_lfp) / 60).toFixed(1)}×`}
            />
            <Metric
              label="LFP 峰值功率能力"
              value={`${Math.round(peakPowerRetention(device.soh_lfp) * 100)} %`}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-muted">
            這是資料中心採購方最先詢問的問題 — 老化後的可交付功率 + 續航時間,而不只是
            SOH/RUL。續航時間受能量限制(∝&nbsp;SOH);峰值功率能力會隨
            內阻上升而下降(此處 +{Math.round(dcirGrowth(device.soh_lfp) * 100)}%),但
            毫秒級峰值由電容器處理,因此不會成為機架的瓶頸。
          </p>
        </section>

        {/* RUL */}
        <section className="space-y-3 border-b border-border p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-wider text-muted">RUL 預測</h3>
            <a
              href="/twin"
              className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
            >
              於 /twin 查看 conformal PI 區間帶 <ArrowUpRight className="h-3 w-3" />
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
                  循環衰減餘量{" "}
                  <span className="font-mono text-foreground">≫ 10 yr</span>{" "}
                  <span className="text-muted/70">（日曆壽命先到限制）</span>
                </>
              ) : (
                <>
                  ≈{" "}
                  <span className="font-mono text-foreground tabular-nums">
                    {bbuYrs.toFixed(1)}
                  </span>{" "}
                  yr <span className="text-muted/70">（僅計循環衰減）</span>
                </>
              )}
            </span>
          </div>

          {device.rul_cycles < rulWarnCycles && (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              RUL 低於 800-cycle 閾值 · 納入規則觸發 Tier-3 汰換佇列
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted">
            點估計來自部署於{" "}
            <span className="text-foreground">/twin</span> 的同一個 LSTM(一個模型,兩種視角)。≫&nbsp;10&nbsp;yr
            這個數字是循環衰減餘量(cycles&nbsp;÷&nbsp;50&nbsp;cyc/yr);真正的限制是{" "}
            <span className="text-foreground">日曆/儲存壽命 ~8–12&nbsp;yr</span>(proposal §G.3 /
            附件 C),因此 Tier-3 納入幾乎完全由{" "}
            <span className="text-foreground">SOH&nbsp;&lt;&nbsp;0.85</span> 觸發,而{" "}
            <code className="text-foreground">RUL&nbsp;&lt;&nbsp;800</code> 作為 fallback-path 的安全網。
          </p>
        </section>

        {/* Operational metrics */}
        <section className="grid grid-cols-2 gap-x-5 gap-y-4 border-b border-border p-5 sm:grid-cols-4">
          <Metric label="使用時間" value={`${device.age_months.toFixed(1)} mo`} />
          <Metric label="瞬變事件（24 h）" value={device.transient_events_24h.toLocaleString()} />
          <Metric label="LFP 溫度" value={`${device.temp_lfp_c.toFixed(1)} °C`} />
          <Metric label="LIC 溫度" value={`${device.temp_lic_c.toFixed(1)} °C`} />
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
              LIC 電容組包絡 · 系統層級 RC
            </h3>
            <a
              href="/twin"
              className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
            >
              於 /twin 查看 v_lic(t) 曲線 <ArrowUpRight className="h-3 w-3" />
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
                  <span className="text-muted">v_min 觀測值</span>
                  <span className="font-mono font-medium tabular-nums">
                    {licRcEnvelope.v_min.toFixed(2)} V
                    <span className="ml-1 text-muted">/ {hi.toFixed(1)} V 額定</span>
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
                  <span>額定 {hi.toFixed(1)} V</span>
                </div>
              </div>
            );
          })()}

          {/* Four-up metric tiles for the actual numbers. */}
          <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
            <Metric
              label="壓降（最壞情況）"
              value={`${licRcEnvelope.v_droop_v.toFixed(2)} V`}
            />
            <Metric
              label="至 UVLO 的餘量"
              value={`${licRcEnvelope.headroom_to_cutoff_v.toFixed(2)} V`}
            />
            <Metric
              label="電容組 C"
              value={`${licRcEnvelope.c_f.toFixed(0)} F`}
            />
            <Metric
              label="電容組 ESR"
              value={`${(licRcEnvelope.esr_ohm * 1000).toFixed(2)} mΩ`}
            />
          </div>

          {licRcEnvelope.passes_cutoff ? (
            <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-[11px] text-success">
              在 v2.2 §B.1 展示瞬態波形下通過 Eaton XLR UVLO（{licRcEnvelope.v_min_datasheet.toFixed(0)} V）
              — 至截止點尚有 {licRcEnvelope.headroom_to_cutoff_v.toFixed(2)} V
              餘量。
            </div>
          ) : (
            <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] text-danger">
              LIC v_min 低於資料表 UVLO — 量產設計在此波形下不通過。
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted">
            <span className="font-medium text-warning">系統層級參考值</span>,而非
            單一設備遙測 — LIC 電容組拓樸（Eaton XLR-48-166 × 2 並聯）依 v2.2 §E.1
            為所有機架層級 Sysblade BBU 所共用。單一設備的 LIC 電壓
            遙測將隨 FastAPI 後端（W3+）一併推出。壓降由 ESR 主導
            (926 A 峰值下約 95 %),因此超過 8 BBU/rack 的量產擴充主要會增加
            並聯模組以降低 ESR,而非增加電容。
          </p>
          <p className="text-[11px] leading-relaxed text-muted">
            <span className="font-medium text-warning">電流額定閾值尚未建模:</span>{" "}
            RC 模型驗證電壓包絡（v_min &gt; 38 V),但並未針對 Eaton XLR-48-166
            資料表的額定脈衝電流,檢查每模組 463 A 峰值(2 並聯共 926 A)。
            此尺寸的典型 48 V LIC 模組可在 30 s 內短暫
            承受 500–1500 A,因此 100 ms 脈衝應在
            規格範圍內 — 但量產前須在 Eaton 特定批次的資料表上
            完成驗證,再進行設計凍結（見 <code className="text-foreground">docs/citations_audit.md</code>)。
          </p>
        </section>

        {/* Disclaimer footer */}
        <footer className="bg-surface/60 px-5 py-3 text-[11px] leading-relaxed text-muted">
          <span className="font-medium text-warning">合成設備。</span>由帶種子的
          RNG 模擬器(<span className="font-mono text-foreground">scripts/generate_twin_scenarios.py</span>)產生;
          並非量產部署。機隊站點名稱為虛構角色（TenantCo / ColoOp /
          DataCo / HyperscaleCo / CarrierHotel）— 未暗示或宣稱與任何真實品牌
          存在商業關係。
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
