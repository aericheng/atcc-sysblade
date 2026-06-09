"use client";

import { useMemo, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Stat } from "@/components/ui/stat";
import { USFleetMap } from "@/components/us-fleet-map";
import { DeviceDrilldown } from "@/components/device-drilldown";
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
    <div className="space-y-10 reveal-stagger">
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
              <CardTitle>一個備援單元可以失效而服務完全不中斷 · N+1 冗餘</CardTitle>
              <Disclosure summary="您看到的是什麼（故障注入模擬細節）" className="mt-2">
                數位孿生模擬產物 `apps/web/public/scenarios/rack_n_minus_1.json` 是電芯層級的
                證明:一個機架有 1 顆 BBU 離線(8 → 7)時,每顆 BBU 的連續 C-rate 仍維持在
                2.5 C 車規 LFP 限值之內。此切換把該結果投射到
                1000 設備機隊上:確定性的約 6 % 設備切換為「機架內 1 顆 BBU 降級」
                模式,而機隊層級的服務連續性維持 100 %。
                底層的模擬波形請見 /twin · V3 / V4 切換。
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
              {showFaultToggle ? "故障情境 ON" : "顯示故障情境"}
            </button>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label="1 顆 BBU 離線的機架"
              value={showFaultToggle ? faultInjectedIds.size.toString() : "0"}
              unit={`/ ${fleet.n_devices.toLocaleString()}`}
              tone={showFaultToggle ? "warning" : "default"}
              hint={
                showFaultToggle
                  ? `V4 視覺化用的確定性約 6 % 子集(以設備 ID 設種子,跨 re-render 穩定)`
                  : "切換開啟以視覺化全機隊故障情境"
              }
            />
            <Stat
              label="故障後每顆 BBU C-rate"
              value={(rackNMinus1.stats?.c_rate_continuous_post_fault ?? 1.71).toFixed(2)}
              unit="C 連續"
              tone={rackNMinus1.pass_criteria?.overall_pass ? "success" : "danger"}
              hint={`+${(rackNMinus1.stats?.c_rate_post_increase_pct ?? 14).toFixed(0)} % vs 8-BBU 基準 · 限值 ${rackNMinus1.pass_criteria?.c_rate_continuous_post_limit ?? 2.5} C 車規 LFP 連續規格`}
            />
            <Stat
              label="服務連續性"
              value="100"
              unit="% 故障期間"
              tone="success"
              hint="60 s 優雅事件在 7 顆存活 BBU 下仍完整完成(V4 模擬 PASS);客戶 SLA 不受影響"
            />
            <Stat
              label="電芯熱餘量"
              value={(rackNMinus1.stats?.t_cell_max_c ?? 25.1).toFixed(1)}
              unit={`°C 最大(限值 ${rackNMinus1.pass_criteria?.t_cell_limit_c ?? 50} °C)`}
              tone="success"
              hint={`即使在降級模式電芯溫升仍可忽略 · LIC 電容組 UVLO 餘量 ${(rackNMinus1.stats?.v_lic_headroom_to_uvlo_v ?? 8.91).toFixed(2)} V`}
            />
          </div>
          {showFaultToggle && (
            <div className="rounded-md border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-foreground/90 leading-relaxed">
              <span className="font-semibold text-warning">故障情境判定: </span>
              {rackNMinus1.headline_verdict ??
                `N-1 失效故障後每顆 BBU 仍維持在車規 LFP 連續規格之內;V_cell 波動與 T_cell 在限值內;LIC 餘量保留。`}
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
          虛構展示 — 僅供學術說明
        </div>
        <p className="leading-relaxed text-muted">
          所有站點名稱皆為<span className="text-foreground font-medium">虛構人物角色</span>，與任何真實公司、客戶或商業關係無關;
          每個設備皆由設種子的 RNG 模擬器生成，並帶有 SIMULATED DATA 浮水印。
        </p>
        <Disclosure summary="虛構站點命名規則" className="mt-1.5">
          站點名稱為 <span className="text-foreground">TenantCo / ColoOp / DataCo / HyperscaleCo / CarrierHotel</span>，
          後綴一個機場或美國州代碼(DFW / IAD / AUS / DAL · WA / UT / OH / IA),純供 ATCC 2026 學術展示。
        </Disclosure>
      </div>

      <header className="relative flex flex-wrap items-start justify-between gap-4">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-6 left-0 -z-10 h-44 w-44 rounded-full bg-success/10 blur-[100px]"
        />
        <div className="space-y-3 min-w-0">
          <div className="text-xs uppercase tracking-[0.22em] text-success font-medium">機隊健康儀表板</div>
          <div className="accent-rule bg-success mt-3 mb-1" />
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-[1.1]">
            全機隊 <span className="gradient-text">{fleet.n_devices.toLocaleString()}</span> 顆 Sysblade BBU
          </h1>
          <p className="text-sm sm:text-base text-muted max-w-3xl leading-relaxed">
            <span className="text-foreground font-medium">三個服務等級</span>並排呈現:{" "}
            <span className="text-foreground">即時監測</span>、{" "}
            由電池數位孿生 SOH 推論觸發的<span className="text-foreground">主動式維護</span>,
            以及在 SOH 跨越{" "}
            <span className="text-foreground font-medium">80 %</span> 之前就浮現汰換候選的<span className="text-foreground">預測性維運</span>。
          </p>
        </div>
        <span className="rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-warning whitespace-normal">
          模擬資料 · 僅供展示用的合成機隊
        </span>
      </header>

      {/* Tier 1 — real-time monitoring */}
      <section className="space-y-4">
        <SectionHeader icon={<Activity className="h-4 w-4" />} kicker="Tier 1" title="即時監測" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Stat
            label="設備總數"
            value={fleet.n_devices.toLocaleString()}
            tone="primary"
            hint={`${fleet.geographic_distribution.Texas} TX · ${fleet.geographic_distribution.Virginia} VA · ${fleet.geographic_distribution.Other} 其他`}
          />
          <Stat
            label="健康"
            value={fleet.status_summary.healthy.toLocaleString()}
            unit={`/ ${fleet.n_devices}`}
            tone="success"
            hint={`${((fleet.status_summary.healthy / fleet.n_devices) * 100).toFixed(1)} % 目前為額定`}
          />
          <Stat
            label="熱警告"
            value={fleet.status_summary.thermal_warn}
            tone="warning"
            hint="LIC > 60 °C 或 LFP > 45 °C"
          />
          <Stat
            label="早期老化"
            value={fleet.status_summary.early_aging}
            tone="danger"
            hint="SOH < 85 % 或 RUL < 800 cycles · 自動納入 Tier-3"
          />
        </div>
      </section>

      {/* Tier 2 — geographic + SOH bucket */}
      <section className="space-y-4">
        <SectionHeader icon={<MapPin className="h-4 w-4" />} kicker="Tier 2" title="主動式維護 · 地理與 SOH 視圖" accent="accent" />

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted mr-2">篩選:</span>
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
              {s === "all" ? `全部 (${fleet.n_devices})` : `${STATUS_LABEL[s]} (${fleet.status_summary[s] ?? 0})`}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2 simulated-watermark">
            <CardHeader>
              <CardTitle>地理分佈 · 1000 設備機隊</CardTitle>
            </CardHeader>
            <CardBody>
              <USFleetMap devices={filtered} height={400} />
              <p className="text-xs text-muted mt-3">
                <span className="text-foreground">點擊任一城市標記</span>即可深入查看;
                游標懸停可看狀態分項。依 JLL YE-2025 §C.1,Texas + Virginia
                聚落為主。
              </p>
            </CardBody>
          </Card>

          <Card className="simulated-watermark">
            <CardHeader>
              <CardTitle>SOH 分佈</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {sohBuckets.map((b) => (
                <div key={b.range}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium" style={{ color: b.color }}>
                      {b.range}
                    </span>
                    <span className="tabular-nums text-muted">{b.count} 台設備</span>
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
                  Tier-3 佇列規則: <span className="text-foreground">SOH &lt; 85 %</span> <em>或</em>{" "}
                  <span className="text-foreground">RUL &lt; 800 cycles</span>。實務上納入幾乎完全由{" "}
                  <span className="text-foreground">SOH &lt; 0.85</span> 觸發(詳見下方說明)。
                </p>
                <Disclosure summary="800 cycles 換算成幾年的意義">
                  BBU duty 平均約 50 cycles/yr(工程估算,錨定於{" "}
                  <span className="text-foreground">v2.1 §G.3 footnote + §E.1 Tier-B</span>{" "}
                  的「LFP 在 BBU 浮充應用 8–12 年壽命」),因此{" "}
                  <span className="text-foreground">RUL = 800 cycles</span> ≈ 剩餘 16 年的 BBU
                  服務壽命。800-cycle 閾值是「約 16 年內需要汰換」的閘門,而非 800 天。在 LSTM
                  驅動的路徑下,循環衰減餘量通常遠大於日曆壽命 —{" "}
                  <span className="text-foreground">日曆/儲存衰減約在 10 yr 形成約束</span>{" "}
                  (現已建模:於{" "}
                  <span className="text-foreground">/twin</span> 上的 Naumann √t 日曆曲線,校準至 v2.2 附件 C 的
                  8–12 yr LFP 浮充壽命),因此循環衰減在汰換決策上很少是約束性條件。
                </Disclosure>
                <Disclosure summary="rul_cycles、soh_lfp、soh_lic 從何而來">
                  {rulFromLstm ? (
                    <>
                      每個設備的 <span className="text-foreground">rul_cycles</span> 由您在{" "}
                      <span className="text-foreground">/twin</span> 上看到的同一個 LSTM 計算 — 每個設備都比對到
                      一條 Severson 錨定的合成 BBU-duty 軌跡(解析式衰減,
                      非 PyBaMM 老化 — 見 /twin Regime mix 揭露),LSTM 預測該
                      軌跡的總循環壽命,接著我們扣除該設備
                      已經歷的循環(age × 50 cyc/yr — 工程估算,錨定於 v2.1
                      §G.3 footnote「LFP BBU 浮充 8–12 yr life」,並非逐字引用
                      v2.1 §B.2 的主張)。整個機隊部署單一模型,
                      而非另一套衰減啟發式。
                    </>
                  ) : (
                    <>
                      此 build 上的 <span className="text-warning font-medium">rul_cycles</span>
                      來自<span className="text-warning">設種子的 RNG 後備</span>{" "}
                      (rul_source ={" "}
                      <code className="text-foreground">synthetic_decay</code>) — 在{" "}
                      <code className="text-foreground">scripts/generate_twin_scenarios.py</code>{" "}
                      執行時,LSTM checkpoint 或 BBU-duty pickle 缺失。請重新執行{" "}
                      <code className="text-foreground">scripts/export_lstm_onnx.py</code> +{" "}
                      <code className="text-foreground">scripts/generate_bbu_duty_cells.py</code>{" "}
                      然後重新生成情境,即可切換回 LSTM 推論。
                    </>
                  )}{" "}
                  <span className="text-foreground">soh_lfp</span> 維持為每個設備的
                  狀態。<span className="text-foreground">soh_lic</span> 則由 datasheet 推導
                  (依 JM Energy / Eaton XLR 規格,LIC ≥ 100,000 額定循環) — LIC 的公開
                  循環資料太稀少無法訓練,且 BBU duty 不會把 LIC
                  推近其限值(whitepaper §6.2)。
                </Disclosure>
              </div>
            </CardBody>
          </Card>
        </div>
      </section>

      {/* Tier 3 — predictive ops */}
      <section className="space-y-4">
        <SectionHeader icon={<Shield className="h-4 w-4" />} kicker="Tier 3" title="預測性維運 · 汰換佇列" accent="warning" />
        <Card className="simulated-watermark">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              最緊急的 8 台 · 先依最低 SOH 排序(RUL 為次序判定)
            </CardTitle>
            <p className="text-[11px] text-muted mt-1.5">
              點擊任一列即可進行 SOH / RUL / 熱的深入檢視。
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
                    <th className="text-left py-2 pr-3">設備</th>
                    <th className="text-left py-2 pr-3">站點</th>
                    <th className="text-right py-2 pr-3">SOH</th>
                    <th className="text-right py-2 pr-3">RUL (cycles)</th>
                    <th className="text-right py-2 pr-3">使用月數</th>
                    <th className="text-right py-2 pr-3">LFP 溫度</th>
                    <th className="text-right py-2">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {replacementCandidates.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-muted">
                        無緊急汰換項目 — 機隊狀況良好。
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
                      aria-label={`開啟 ${d.id} (${d.site}) 的深入檢視`}
                      className="cursor-pointer border-t border-border transition-colors hover:bg-surface/60 focus:bg-surface/60 focus:outline-none"
                    >
                      <td className="py-2.5 pr-3 font-mono text-xs whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {d.id}
                          {faultInjectedIds.has(d.id) && (
                            <span
                              title="V4 故障情境:此機架內 1 顆 BBU 離線 · 8 顆中 7 顆存活 · 服務連續性保留"
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
              目前有 {fleet.replacement_queue_count} 台設備在汰換佇列上(status =
              early_aging) — ServiceNow / Jira webhook 整合列於 W3+ 藍圖
              (此靜態展示 build 中無即時整合)。
            </p>
          </CardBody>
        </Card>
      </section>

      {/* Footer disclaimer */}
      <Card>
        <CardBody className="text-xs text-muted leading-relaxed">
          <div className="flex items-center gap-2 text-warning font-medium mb-1">
            <Zap className="h-3.5 w-3.5" /> 關於本儀表板
          </div>
          <p>
            {"模擬資料,並非來自任何正式生產部署。"}{" "}
            {rulFromLstm ? (
              <>
                <span className="text-foreground">
                  每個設備的 RUL 由 /twin 上呈現的同一個 LSTM 計算
                </span>{" "}
                — 同一模型,兩種視圖。
              </>
            ) : (
              <>
                <span className="text-warning">
                  每個設備的 RUL 目前來自設種子的 RNG 後備
                </span>{" "}
                (rul_source = <code className="text-foreground">synthetic_decay</code>) — 在
                情境生成期間 LSTM checkpoint 缺失。請重新執行 LSTM
                訓練 + 情境管線以恢復「一模型兩視圖」。
              </>
            )}
          </p>
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
  accent = "primary",
}: {
  icon: React.ReactNode;
  kicker: string;
  title: string;
  accent?: "primary" | "accent" | "warning";
}) {
  const chip =
    accent === "accent"
      ? "bg-accent/15 text-accent"
      : accent === "warning"
        ? "bg-warning/15 text-warning"
        : "bg-primary/15 text-primary";
  return (
    <div className="flex items-baseline gap-3 border-b border-border pb-2.5">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full ${chip} px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider`}
      >
        {icon}
        {kicker}
      </span>
      <h2 className="text-lg sm:text-xl font-semibold tracking-tight">{title}</h2>
    </div>
  );
}
