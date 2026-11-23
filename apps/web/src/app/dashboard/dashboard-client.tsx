"use client";

import { useMemo, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { PlainInline, GlossaryPanel } from "@/components/ui/plain";
import { Stat } from "@/components/ui/stat";
import { USFleetMap } from "@/components/us-fleet-map";
import { DeviceDrilldown } from "@/components/device-drilldown";
import { type Device, type DeviceStatus, type LicRcEnvelope, STATUS_COLOR, STATUS_LABELS } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { nMinus1VerdictEn } from "@/lib/verdict";
import { Activity, AlertTriangle, MapPin, Shield, Zap } from "lucide-react";

interface Fleet {
  title: string;
  disclaimer: string;
  n_devices: number;
  geographic_distribution: Record<string, number>;
  status_summary: Record<string, number>;
  replacement_queue_count: number;
  // Emitted by scripts/generate_twin_scenarios.py — "tcn_inference_on_bbu_trajectory"
  // when the production TCN checkpoint (models/tcn_rul.fleet.pt, the same model
  // /twin's model_validation.json shows) and BBU-duty pickle are available,
  // "synthetic_decay" when either is missing and we fall back to seeded RNG
  // decay. The dashboard UI must NOT claim TCN inference on the fallback path.
  rul_source?: "tcn_inference_on_bbu_trajectory" | "synthetic_decay";
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
  const rulFromTcn = fleet.rul_source === "tcn_inference_on_bbu_trajectory";
  const { t, lang, locale } = useT();

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
  // signal under TCN-driven RULs, which sit well above the 800-cycle gate);
  // tiebreak by smallest RUL so within a SOH band the device with less
  // cycle-fade headroom shows up first. Avoids the prior bug where a healthier
  // SOH 84 % device could outrank a worse SOH 79 % device just because the
  // TCN happened to predict slightly more cycles for the trajectory it was
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
              <CardTitle>
                {t(
                  "單台 BBU 離線,剩 7 台仍完成 60 秒優雅關機(模擬)· N+1 冗餘",
                  "One BBU offline: the remaining 7 still complete the 60-second graceful shutdown (simulated) · N+1 redundancy",
                )}
              </CardTitle>
              <Disclosure
                summary={t("您看到的是什麼（故障注入模擬細節）", "What you are looking at (fault-injection simulation details)")}
                className="mt-2"
              >
                {t(
                  <>
                    數位孿生模擬產物 `apps/web/public/scenarios/rack_n_minus_1.json` 是電芯層級的
                    模擬結果:t = 15 s(負載已降到 30 kW 連續段)有 1 顆 BBU 離線(8 → 7)時,每顆 BBU 的連續 C-rate 仍維持在
                    2.5 C 車規 LFP 限值之內。自我稽核另測最壞情境:滿載 120 kW 不降載時再掉一台,LFP 最高 6.86C、超過 6C 設計點共約 59 秒;峰值當下掉一台時 LIC 吸收峰值、LFP 最高 5.54C,只有 LIC 同時失效才會到 6.86C(見首頁自我稽核、docs/audit/A2)。此切換把該結果投射到
                    1000 設備機隊上:確定性的約 6 % 設備切換為「機架內 1 顆 BBU 降級」
                    模式;依 V4 模擬,這些機架剩 7 台仍完成 60 秒優雅關機(V4 模擬 PASS,非實際營運數據)。
                    底層的模擬波形請見 /twin · V3 / V4 切換。
                  </>,
                  <>
                    The digital-twin simulation artifact `apps/web/public/scenarios/rack_n_minus_1.json` is a
                    cell-level simulation result: when 1 of 8 BBUs goes offline at t = 15 s (8 → 7; load already reduced to the
                    30 kW continuous segment), the continuous C-rate of each BBU stays within the 2.5 C
                    automotive-grade LFP limit. The self-audit also tested the worst case: losing one more unit at
                    full 120 kW without load shedding gives an LFP peak of 6.86C, above the 6C design point for
                    about 59 s in total; losing one at the instant of peak, the LIC absorbs the peak and the LFP
                    peaks at 5.54C, reaching 6.86C only if the LIC also fails (see the self-audit on the home page,
                    docs/audit/A2). This toggle projects that result onto the 1000-device fleet: a deterministic
                    ~6 % of devices switch to “1 BBU degraded within the rack” mode; per the V4 simulation, these
                    racks still complete the 60-second graceful shutdown with 7 units (V4 simulation PASS, not
                    real operating data). For the underlying simulated waveforms see the /twin · V3 / V4 toggle.
                  </>,
                )}
              </Disclosure>
              <PlainInline className="mt-2">
                {t(
                  "切換按鈕模擬故障 — 單台離線後剩 7 台仍完成 60 秒優雅關機(V4 模擬 PASS)。",
                  "The button simulates a fault: with one unit offline, the remaining 7 still complete the 60-second graceful shutdown (V4 simulation PASS).",
                )}
              </PlainInline>
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
              {showFaultToggle ? t("故障情境 ON", "Fault scenario ON") : t("顯示故障情境", "Show fault scenario")}
            </button>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label={t("1 顆 BBU 離線的機架", "Racks with 1 BBU offline")}
              value={showFaultToggle ? faultInjectedIds.size.toString() : "0"}
              unit={`/ ${fleet.n_devices.toLocaleString()}`}
              tone={showFaultToggle ? "warning" : "default"}
              hint={
                showFaultToggle
                  ? t(
                      `V4 視覺化用的確定性約 6 % 子集(以設備 ID 設種子,跨 re-render 穩定)`,
                      `Deterministic ~6 % subset for the V4 visualization (seeded by device ID, stable across re-renders)`,
                    )
                  : t("切換開啟以視覺化全機隊故障情境", "Toggle on to visualize the fleet-wide fault scenario")
              }
            />
            <Stat
              label={t("故障後每顆 BBU C-rate", "Per-BBU C-rate after fault")}
              value={(rackNMinus1.stats?.c_rate_continuous_post_fault ?? 1.71).toFixed(2)}
              unit={t("C 連續", "C continuous")}
              tone={rackNMinus1.pass_criteria?.overall_pass ? "success" : "danger"}
              hint={t(
                `+${(rackNMinus1.stats?.c_rate_post_increase_pct ?? 14).toFixed(0)} % vs 8-BBU 基準 · 限值 ${rackNMinus1.pass_criteria?.c_rate_continuous_post_limit ?? 2.5} C 車規 LFP 連續規格`,
                `+${(rackNMinus1.stats?.c_rate_post_increase_pct ?? 14).toFixed(0)} % vs 8-BBU baseline · limit ${rackNMinus1.pass_criteria?.c_rate_continuous_post_limit ?? 2.5} C automotive-grade LFP continuous rating`,
              )}
            />
            <Stat
              label={t("故障後存活 BBU", "Surviving BBUs after fault")}
              value={String(rackNMinus1.fault_injection?.n_bbu_degraded ?? 7)}
              unit={t(`/ ${rackNMinus1.fault_injection?.n_bbu_normal ?? 8} 台`, `/ ${rackNMinus1.fault_injection?.n_bbu_normal ?? 8} units`)}
              tone={rackNMinus1.pass_criteria?.overall_pass ? "success" : "danger"}
              hint={t(
                "60 s 優雅事件在 7 顆存活 BBU 下仍完整完成(V4 模擬 PASS)",
                "The 60 s graceful event still completes in full with 7 surviving BBUs (V4 simulation PASS)",
              )}
            />
            <Stat
              label={t("電芯熱餘量", "Cell thermal margin")}
              value={(rackNMinus1.stats?.t_cell_max_c ?? 25.1).toFixed(1)}
              unit={t(
                `°C 最大(限值 ${rackNMinus1.pass_criteria?.t_cell_limit_c ?? 50} °C)`,
                `°C max (limit ${rackNMinus1.pass_criteria?.t_cell_limit_c ?? 50} °C)`,
              )}
              tone="success"
              hint={t(
                `即使在降級模式電芯溫升仍可忽略${rackNMinus1.stats?.v_lic_headroom_to_uvlo_v != null ? ` · LIC 電容組 UVLO 餘量 ${rackNMinus1.stats.v_lic_headroom_to_uvlo_v.toFixed(2)} V` : ""}`,
                `Cell temperature rise stays negligible even in degraded mode${rackNMinus1.stats?.v_lic_headroom_to_uvlo_v != null ? ` · LIC bank UVLO margin ${rackNMinus1.stats.v_lic_headroom_to_uvlo_v.toFixed(2)} V` : ""}`,
              )}
            />
          </div>
          {showFaultToggle && (
            <div className="rounded-md border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-foreground/90 leading-relaxed">
              <span className="font-semibold text-warning">{t("故障情境判定: ", "Fault scenario verdict: ")}</span>
              {(rackNMinus1.headline_verdict && t(rackNMinus1.headline_verdict, nMinus1VerdictEn(rackNMinus1) ?? rackNMinus1.headline_verdict)) ??
                t(
                  `N-1 失效故障後每顆 BBU 仍維持在車規 LFP 連續規格之內;V_cell 波動與 T_cell 在限值內;LIC 餘量保留。`,
                  `After an N-1 failure each BBU stays within the automotive-grade LFP continuous rating; V_cell swing and T_cell are within limits; LIC margin is retained.`,
                )}
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
          {t("虛構展示 — 僅供學術說明", "Fictional demo — for academic illustration only")}
        </div>
        <p className="leading-relaxed text-muted">
          {t(
            <>
              所有站點名稱皆為<span className="text-foreground font-medium">虛構人物角色</span>，與任何真實公司、客戶或商業關係無關;
              每個設備皆由設種子的 RNG 模擬器生成，並帶有 SIMULATED DATA 浮水印。
            </>,
            <>
              All site names are <span className="text-foreground font-medium">fictional personas</span>, unrelated to any
              real company, customer or business relationship; every device is generated by a seeded RNG simulator and
              carries a SIMULATED DATA watermark.
            </>,
          )}
        </p>
        <Disclosure summary={t("虛構站點命名規則", "Fictional site naming rule")} className="mt-1.5">
          {t(
            <>
              站點名稱為 <span className="text-foreground">TenantCo / ColoOp / DataCo / HyperscaleCo / CarrierHotel</span>，
              後綴一個機場或美國州代碼(DFW / IAD / AUS / DAL · WA / UT / OH / IA),純供 ATCC 2026 學術展示。
            </>,
            <>
              Site names are <span className="text-foreground">TenantCo / ColoOp / DataCo / HyperscaleCo / CarrierHotel</span>,
              followed by an airport or US state code (DFW / IAD / AUS / DAL · WA / UT / OH / IA), used only for the
              ATCC 2026 academic demonstration.
            </>,
          )}
        </Disclosure>
      </div>

      <header className="relative flex flex-wrap items-start justify-between gap-4">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-6 left-0 -z-10 h-44 w-44 rounded-full bg-success/10 blur-[100px]"
        />
        <div className="space-y-3 min-w-0">
          <div className="text-xs uppercase tracking-[0.22em] text-success font-medium">{t("機隊健康儀表板", "Fleet health dashboard")}</div>
          <div className="accent-rule bg-success mt-3 mb-1" />
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-[1.1]">
            {t(
              <>
                全機隊 <span className="gradient-text">{fleet.n_devices.toLocaleString(locale)}</span> 顆 Sysblade BBU
              </>,
              <>
                All <span className="gradient-text">{fleet.n_devices.toLocaleString(locale)}</span> Sysblade BBUs in the fleet
              </>,
            )}
          </h1>
          <p className="text-sm sm:text-base text-muted max-w-3xl leading-relaxed">
            {t(
              <>
                設想中的客戶畫面（模擬資料）。<span className="text-foreground font-medium">三個服務等級</span>：
                <span className="text-foreground">即時監測</span>看現況、
                <span className="text-foreground">主動式維護</span>抓異常、
                <span className="text-foreground">預測性維運</span>排汰換。
              </>,
              <>
                A mock customer view (simulated data). <span className="text-foreground font-medium">Three service tiers</span>:{" "}
                <span className="text-foreground">real-time monitoring</span> shows current status,{" "}
                <span className="text-foreground">proactive maintenance</span> catches anomalies,{" "}
                <span className="text-foreground">predictive operations</span> schedules replacements.
              </>,
            )}
          </p>
        </div>
        <span className="rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-warning whitespace-normal">
          {t("模擬資料 · 僅供展示用的合成機隊", "SIMULATED DATA · synthetic fleet for demonstration only")}
        </span>
      </header>

      {/* Plain-language glossary for this page's recurring terms. */}
      <GlossaryPanel
        termKeys={[
          "bbu", "soh", "rul", "n_redundancy", "digital_twin", "tcn", "c_rate", "uvlo", "calendar_aging",
        ]}
      />

      {/* Tier 1 — real-time monitoring */}
      <section className="space-y-4">
        <SectionHeader icon={<Activity className="h-4 w-4" />} kicker="Tier 1" title={t("即時監測", "Real-time monitoring")} />
        <PlainInline>
          {t(
            "全機隊現況：健康、熱警示、早期老化各多少台。",
            "Fleet status now: how many units are healthy, thermal-warning and early-aging.",
          )}
        </PlainInline>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Stat
            label={t("設備總數", "Total devices")}
            value={fleet.n_devices.toLocaleString(locale)}
            tone="primary"
            hint={`${fleet.geographic_distribution.Texas} TX · ${fleet.geographic_distribution.Virginia} VA · ${fleet.geographic_distribution.Other} ${t("其他", "other")}`}
          />
          <Stat
            label={t("健康", "Healthy")}
            value={fleet.status_summary.healthy.toLocaleString(locale)}
            unit={`/ ${fleet.n_devices}`}
            tone="success"
            hint={`${((fleet.status_summary.healthy / fleet.n_devices) * 100).toFixed(1)} % ${t("目前為額定", "currently at rated condition")}`}
          />
          <Stat
            label={t("熱警告", "Thermal warning")}
            value={fleet.status_summary.thermal_warn}
            tone="warning"
            hint={t(
              "LIC > 60 °C 或 LFP > 45 °C(電容或電池溫度越過安全觀察線)",
              "LIC > 60 °C or LFP > 45 °C (capacitor or battery temperature past the safety watch line)",
            )}
          />
          <Stat
            label={t("早期老化", "Early aging")}
            value={fleet.status_summary.early_aging}
            tone="danger"
            hint={t(
              "SOH < 85 % 或 RUL < 800 cycles · 自動納入 Tier-3(健康度偏低或預測剩餘壽命不足,自動排入汰換佇列)",
              "SOH < 85 % or RUL < 800 cycles · automatically enters Tier-3 (low health or insufficient predicted remaining life; queued for replacement automatically)",
            )}
          />
        </div>
      </section>

      {/* Tier 2 — geographic + SOH bucket */}
      <section className="space-y-4">
        <SectionHeader icon={<MapPin className="h-4 w-4" />} kicker="Tier 2" title={t("主動式維護 · 地理與 SOH 視圖", "Proactive maintenance · geographic and SOH views")} accent="accent" />
        <PlainInline>
          {t("地圖＋健康度分層 — 問題發生前先知道看哪裡。", "Map plus health tiers: know where to look before problems occur.")}
        </PlainInline>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted mr-2">{t("篩選:", "Filter:")}</span>
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
              {s === "all"
                ? `${t("全部", "All")} (${fleet.n_devices})`
                : `${STATUS_LABELS[lang][s]} (${fleet.status_summary[s] ?? 0})`}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2 simulated-watermark">
            <CardHeader>
              <CardTitle>{t("地理分佈 · 1000 設備機隊", "Geographic distribution · 1000-device fleet")}</CardTitle>
            </CardHeader>
            <CardBody>
              <USFleetMap devices={filtered} height={400} />
              <p className="text-xs text-muted mt-3">
                {t(
                  <>
                    <span className="text-foreground">點擊任一城市標記</span>即可深入查看;
                    游標懸停可看狀態分項。依 JLL YE-2025 §C.1,Texas + Virginia
                    聚落為主。
                  </>,
                  <>
                    <span className="text-foreground">Click any city marker</span> to drill in; hover to see the
                    status breakdown. Per JLL YE-2025 §C.1, mainly Texas + Virginia clusters.
                  </>,
                )}
              </p>
            </CardBody>
          </Card>

          <Card className="simulated-watermark">
            <CardHeader>
              <CardTitle>{t("SOH 分佈", "SOH distribution")}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {sohBuckets.map((b) => (
                <div key={b.range}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium" style={{ color: b.color }}>
                      {b.range}
                    </span>
                    <span className="tabular-nums text-muted">{b.count} {t("台設備", "devices")}</span>
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
                  {t(
                    <>
                      Tier-3 佇列規則: <span className="text-foreground">SOH &lt; 85 %</span> <em>或</em>{" "}
                      <span className="text-foreground">RUL &lt; 800 cycles</span>。實務上納入幾乎完全由{" "}
                      <span className="text-foreground">SOH &lt; 0.85</span> 觸發(詳見下方說明)。
                    </>,
                    <>
                      Tier-3 queue rule: <span className="text-foreground">SOH &lt; 85 %</span> <em>or</em>{" "}
                      <span className="text-foreground">RUL &lt; 800 cycles</span>. In practice, admission is triggered
                      almost entirely by <span className="text-foreground">SOH &lt; 0.85</span> (see the notes below).
                    </>,
                  )}
                </p>
                <Disclosure summary={t("800 cycles 換算成幾年的意義", "What 800 cycles means in years")}>
                  {t(
                    <>
                      BBU duty 平均約 50 cycles/yr(工程估算,錨定於{" "}
                      <span className="text-foreground">v2.1 §G.3 footnote + §E.1 Tier-B</span>{" "}
                      的「LFP 在 BBU 浮充應用 8–12 年壽命」),因此{" "}
                      <span className="text-foreground">RUL = 800 cycles</span> ≈ 剩餘 16 年的 BBU
                      服務壽命。800-cycle 閾值是「約 16 年內需要汰換」的閘門,而非 800 天。在 TCN
                      驅動的路徑下,循環衰減餘量通常遠大於日曆壽命 —{" "}
                      <span className="text-foreground">日曆/儲存衰減約在 10 yr 形成約束</span>{" "}
                      (現已建模:於{" "}
                      <span className="text-foreground">/twin</span> 上的 Naumann √t 日曆曲線,校準至 v2.2 附件 C 的
                      8–12 yr LFP 浮充壽命),因此循環衰減在汰換決策上很少是約束性條件。
                    </>,
                    <>
                      BBU duty averages about 50 cycles/yr (engineering estimate, anchored to{" "}
                      <span className="text-foreground">v2.1 §G.3 footnote + §E.1 Tier-B</span>{" "}
                      “LFP has an 8–12 year life in BBU float service”), so{" "}
                      <span className="text-foreground">RUL = 800 cycles</span> ≈ 16 years of remaining BBU service
                      life. The 800-cycle threshold is a gate for “replacement needed within about 16 years”, not
                      800 days. On the TCN-driven path the cycle-fade margin is usually much larger than the calendar
                      life —{" "}
                      <span className="text-foreground">calendar/storage fade becomes the constraint at about 10 yr</span>{" "}
                      (now modelled: the Naumann √t calendar curve on{" "}
                      <span className="text-foreground">/twin</span>, calibrated to the 8–12 yr LFP float life in
                      v2.2 Appendix C), so cycle fade is rarely the binding condition in replacement decisions.
                    </>,
                  )}
                </Disclosure>
                <Disclosure summary={t("rul_cycles、soh_lfp、soh_lic 從何而來", "Where rul_cycles, soh_lfp and soh_lic come from")}>
                  {rulFromTcn
                    ? t(
                        <>
                          每個設備的 <span className="text-foreground">rul_cycles</span> 由您在{" "}
                          <span className="text-foreground">/twin</span> 上看到的同一個 TCN 計算 — 每個設備都比對到
                          一條 Severson 錨定的合成 BBU-duty 軌跡(解析式衰減,
                          非 PyBaMM 老化 — 見 /twin Regime mix 揭露),TCN 預測該
                          軌跡的總循環壽命,接著我們扣除該設備
                          已經歷的循環(age × 50 cyc/yr — 工程估算,錨定於 v2.1
                          §G.3 footnote「LFP BBU 浮充 8–12 yr life」,並非逐字引用
                          v2.1 §B.2 的主張)。整個機隊部署單一模型,
                          而非另一套衰減啟發式。
                        </>,
                        <>
                          Each device’s <span className="text-foreground">rul_cycles</span> is computed by the same TCN
                          you see on <span className="text-foreground">/twin</span> — each device is matched to a
                          Severson-anchored synthetic BBU-duty trajectory (analytic decay, not PyBaMM aging — see the
                          /twin Regime mix disclosure); the TCN predicts that trajectory’s total cycle life, and we then
                          subtract the cycles the device has already used (age × 50 cyc/yr — engineering estimate,
                          anchored to the v2.1 §G.3 footnote “LFP BBU float 8–12 yr life”, not a verbatim quote of the
                          v2.1 §B.2 claim). One model is deployed across the whole fleet, rather than a separate decay
                          heuristic.
                        </>,
                      )
                    : t(
                        <>
                          此 build 上的 <span className="text-warning font-medium">rul_cycles</span>
                          來自<span className="text-warning">設種子的 RNG 後備</span>{" "}
                          (rul_source ={" "}
                          <code className="text-foreground">synthetic_decay</code>) — 在{" "}
                          <code className="text-foreground">scripts/generate_twin_scenarios.py</code>{" "}
                          執行時,TCN checkpoint(models/tcn_rul.fleet.pt)或 BBU-duty pickle 缺失。請依序重新執行{" "}
                          <code className="text-foreground">scripts/generate_bbu_duty_cells.py</code> +{" "}
                          <code className="text-foreground">scripts/export_tcn_onnx.py</code>{" "}
                          然後重新生成情境,即可切換回 TCN 推論。
                        </>,
                        <>
                          On this build, <span className="text-warning font-medium">rul_cycles</span> comes from the{" "}
                          <span className="text-warning">seeded RNG fallback</span>{" "}
                          (rul_source ={" "}
                          <code className="text-foreground">synthetic_decay</code>) — when{" "}
                          <code className="text-foreground">scripts/generate_twin_scenarios.py</code>{" "}
                          ran, the TCN checkpoint (models/tcn_rul.fleet.pt) or the BBU-duty pickle was missing. Re-run{" "}
                          <code className="text-foreground">scripts/generate_bbu_duty_cells.py</code> +{" "}
                          <code className="text-foreground">scripts/export_tcn_onnx.py</code>{" "}
                          in that order, then regenerate the scenarios, to switch back to TCN inference.
                        </>,
                      )}{" "}
                  {t(
                    <>
                      <span className="text-foreground">soh_lfp</span> 維持為每個設備的
                      狀態。<span className="text-foreground">soh_lic</span> 則以規格假設推導
                      (假設 LIC ≥ 100,000 額定循環,依 ULTIMO 系列 LIC 廠商標稱壽命;屬廠商宣稱值、未經本專案驗證) — LIC 的公開
                      循環資料太稀少無法訓練,且 BBU duty 不會把 LIC
                      推近其限值(whitepaper §6.2)。
                    </>,
                    <>
                      <span className="text-foreground">soh_lfp</span> remains a per-device state.{" "}
                      <span className="text-foreground">soh_lic</span> is derived from a spec assumption (assuming
                      LIC ≥ 100,000 rated cycles, per the ULTIMO-series LIC vendor’s stated life; a vendor claim, not
                      validated by this project) — public LIC cycling data is too sparse to train on, and BBU duty
                      does not push the LIC near its limit (whitepaper §6.2).
                    </>,
                  )}
                </Disclosure>
              </div>
            </CardBody>
          </Card>
        </div>
      </section>

      {/* Tier 3 — predictive ops */}
      <section className="space-y-4">
        <SectionHeader icon={<Shield className="h-4 w-4" />} kicker="Tier 3" title={t("預測性維運 · 汰換佇列", "Predictive operations · replacement queue")} accent="warning" />
        <PlainInline>
          {t(
            "依 SOH 排出最該換的 8 台 — 照清單維運，不必逐台巡檢。",
            "The 8 units most in need of replacement, ranked by SOH — work from the list instead of inspecting every unit.",
          )}
        </PlainInline>
        <Card className="simulated-watermark">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t("最緊急的 8 台 · 先依最低 SOH 排序(RUL 為次序判定)", "The 8 most urgent · sorted by lowest SOH first (RUL as tiebreaker)")}
            </CardTitle>
            <p className="text-[11px] text-muted mt-1.5">
              {t("點擊任一列即可進行 SOH / RUL / 熱的深入檢視。", "Click any row for a SOH / RUL / thermal drill-down.")}
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
                    <th className="text-left py-2 pr-3">{t("設備", "Device")}</th>
                    <th className="text-left py-2 pr-3">{t("站點", "Site")}</th>
                    <th className="text-right py-2 pr-3">SOH</th>
                    <th className="text-right py-2 pr-3">RUL (cycles)</th>
                    <th className="text-right py-2 pr-3">{t("使用月數", "Age (months)")}</th>
                    <th className="text-right py-2 pr-3">{t("LFP 溫度", "LFP temp")}</th>
                    <th className="text-right py-2">{t("狀態", "Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {replacementCandidates.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-muted">
                        {t("無緊急汰換項目 — 機隊狀況良好。", "No urgent replacements — fleet in good condition.")}
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
                      aria-label={t(`開啟 ${d.id} (${d.site}) 的深入檢視`, `Open drill-down for ${d.id} (${d.site})`)}
                      className="cursor-pointer border-t border-border transition-colors hover:bg-surface/60 focus:bg-surface/60 focus:outline-none"
                    >
                      <td className="py-2.5 pr-3 font-mono text-xs whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {d.id}
                          {faultInjectedIds.has(d.id) && (
                            <span
                              title={t(
                                "V4 故障情境:此機架內 1 顆 BBU 離線 · 8 顆中 7 顆存活 · 仍完成 60 秒優雅關機(模擬)",
                                "V4 fault scenario: 1 BBU offline in this rack · 7 of 8 survive · still completes the 60-second graceful shutdown (simulated)",
                              )}
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
                          {STATUS_LABELS[lang][d.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted mt-4 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              {t(
                <>
                  目前有 {fleet.replacement_queue_count} 台設備在汰換佇列上(status =
                  early_aging) — ServiceNow / Jira webhook 整合列於 W3+ 藍圖
                  (此靜態展示 build 中無即時整合)。
                </>,
                <>
                  {fleet.replacement_queue_count} devices are currently in the replacement queue (status =
                  early_aging) — ServiceNow / Jira webhook integration is on the W3+ roadmap (no live integration
                  in this static demo build).
                </>,
              )}
            </p>
          </CardBody>
        </Card>
      </section>

      {/* Footer disclaimer */}
      <Card>
        <CardBody className="text-xs text-muted leading-relaxed">
          <div className="flex items-center gap-2 text-warning font-medium mb-1">
            <Zap className="h-3.5 w-3.5" /> {t("關於本儀表板", "About this dashboard")}
          </div>
          <p>
            {t("模擬資料,並非來自任何正式生產部署。", "Simulated data, not from any production deployment.")}{" "}
            {rulFromTcn ? (
              <>
                <span className="text-foreground">
                  {t("每個設備的 RUL 由 /twin 上呈現的同一個 TCN 計算", "Each device's RUL is computed by the same TCN shown on /twin")}
                </span>{" "}
                {t("— 同一模型,兩種視圖。", "— one model, two views.")}
              </>
            ) : (
              <>
                <span className="text-warning">
                  {t("每個設備的 RUL 目前來自設種子的 RNG 後備", "Each device's RUL currently comes from the seeded RNG fallback")}
                </span>{" "}
                {t(
                  <>
                    (rul_source = <code className="text-foreground">synthetic_decay</code>) — 在
                    情境生成期間 TCN checkpoint 缺失。請重新執行 TCN
                    訓練匯出(scripts/export_tcn_onnx.py)+ 情境管線以恢復「一模型兩視圖」。
                  </>,
                  <>
                    (rul_source = <code className="text-foreground">synthetic_decay</code>) — the TCN checkpoint was
                    missing during scenario generation. Re-run the TCN training export
                    (scripts/export_tcn_onnx.py) + the scenario pipeline to restore “one model, two views”.
                  </>,
                )}
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
        className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full ${chip} px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider`}
      >
        {icon}
        {kicker}
      </span>
      <h2 className="text-lg sm:text-xl font-semibold tracking-tight">{title}</h2>
    </div>
  );
}
