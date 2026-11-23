"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { GlossaryPanel } from "@/components/ui/plain";
import { Stat } from "@/components/ui/stat";
import {
  computeTco,
  formatPayback,
  formatTons,
  formatUsd,
  TCO_LINE_ITEM_SOURCES,
  type TcoInputs,
} from "@/lib/tco";
import { useT } from "@/lib/i18n";
import { ArrowRight, BookOpen, Leaf } from "lucide-react";

const PRESETS: Record<string, TcoInputs> = {
  "Mid-tier (50 racks · Texas)": {
    racks: 50,
    electricityPriceUsdPerKwh: 0.085,
    pue: 1.4,
    gridCarbonKgPerKwh: 0.41, // ERCOT 2024 average
  },
  "Hyperscale (500 racks · Virginia)": {
    racks: 500,
    electricityPriceUsdPerKwh: 0.105,
    pue: 1.35,
    gridCarbonKgPerKwh: 0.36, // PJM 2024 average
  },
  "Edge AI (10 racks · Pacific NW)": {
    racks: 10,
    electricityPriceUsdPerKwh: 0.07,
    pue: 1.3,
    gridCarbonKgPerKwh: 0.12, // BPA / hydro
  },
};

const DEFAULT_PRESET = "Mid-tier (50 racks · Texas)";

// The cost-breakdown chart is intentionally rendered as plain HTML / CSS
// rather than recharts. recharts 3.x's internal Redux store dispatches
// state updates during render in response to prop churn, which manifests
// as a "Maximum update depth" infinite loop the moment the user drags any
// of the four sliders. ResponsiveContainer + ResizeObserver workarounds
// (commits 11d2073 and 9204809) reduced but did not eliminate the loop;
// dropping recharts entirely on this page is the only stable fix. The
// table below the chart still surfaces the exact dollar values, so the
// chart only needs to communicate "visual proportion".
type BreakdownRow = {
  item: string;
  itemEn: string;
  short: string;
  shortEn: string;
  traditional: number;
  sysblade: number;
};

function BreakdownBars({ rows, isNarrow }: { rows: BreakdownRow[]; isNarrow: boolean }) {
  const { t, locale } = useT();
  const max = Math.max(1, ...rows.flatMap((r) => [r.traditional, r.sysblade]));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pb-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-sm" style={{ background: "rgba(251,191,36,0.85)" }} />
          {t("傳統 NMC BBU", "Traditional NMC BBU")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-sm" style={{ background: "rgba(99,102,241,0.9)" }} />
          Sysblade HyperBuffer
        </span>
        <span className="ml-auto">{t("每組上下兩條：上=傳統、下=Sysblade，越短越省。", "Two bars per group: top = traditional, bottom = Sysblade; shorter is cheaper.")}</span>
      </div>
      {rows.map((row) => {
        const tw = (row.traditional / max) * 100;
        const sw = (row.sysblade / max) * 100;
        const labelText = isNarrow ? t(row.short, row.shortEn) : t(row.item, row.itemEn);
        return (
          <div
            key={row.item}
            className="grid grid-cols-[80px_1fr_auto] sm:grid-cols-[140px_1fr_auto] items-center gap-3"
          >
            <div className="text-xs text-muted truncate">{labelText}</div>
            <div className="space-y-1.5 min-w-0">
              <div
                className="relative h-2.5 w-full rounded bg-surface/40"
                title={`${t("傳統 NMC BBU", "Traditional NMC BBU")} · $${row.traditional.toLocaleString(locale)}`}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded"
                  style={{ width: `${tw}%`, background: "rgba(251,191,36,0.85)" }}
                />
              </div>
              <div
                className="relative h-2.5 w-full rounded bg-surface/40"
                title={`Sysblade HyperBuffer · $${row.sysblade.toLocaleString(locale)}`}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded"
                  style={{ width: `${sw}%`, background: "rgba(99,102,241,0.9)" }}
                />
              </div>
            </div>
            <div className="text-right tabular-nums text-xs sm:text-sm whitespace-nowrap">
              <div className="text-warning">${row.traditional.toLocaleString(locale)}</div>
              <div className="text-primary">${row.sysblade.toLocaleString(locale)}</div>
            </div>
          </div>
        );
      })}
      <div className="pt-3 mt-2 border-t border-border text-xs text-muted">
        {t("長條寬度以最大的成本項目為基準正規化。", "Bar widths are normalised to the largest cost item.")}
      </div>
    </div>
  );
}

// Float-safe equality for slider-quantised values. All slider steps are
// powers of 10⁻³ or larger, so a 1e-6 epsilon is way below noise.
const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6;

function inputsMatchPreset(inputs: TcoInputs, p: TcoInputs): boolean {
  return (
    eq(inputs.racks, p.racks) &&
    eq(inputs.electricityPriceUsdPerKwh, p.electricityPriceUsdPerKwh) &&
    eq(inputs.pue, p.pue) &&
    eq(inputs.gridCarbonKgPerKwh, p.gridCarbonKgPerKwh)
  );
}

export function TcoClient() {
  const { t, lang, locale } = useT();
  // English headers are wider; give the number columns a gutter so they do not run together on phones.
  const numPad = lang === "en" ? "pl-1 max-[359px]:pl-0.5 sm:pl-3" : "";
  // Below 360 px the English cost table is set one size smaller so it fits without scrolling.
  const tightEn = lang === "en" ? "max-[359px]:text-xs" : "";
  const [inputs, setInputs] = useState<TcoInputs>(() => ({ ...PRESETS[DEFAULT_PRESET] }));
  const result = useMemo(() => computeTco(inputs), [inputs]);

  // Derive the preset selection from the current input values rather than
  // tracking it as separate state. Dragging a slider away from the named
  // preset shows "Custom"; dragging back to the preset's exact values
  // re-selects that preset automatically (the previous imperative
  // setPresetName('custom') made this a one-way trip).
  const presetName = useMemo<string>(() => {
    for (const [name, p] of Object.entries(PRESETS)) {
      if (inputsMatchPreset(inputs, p)) return name;
    }
    return "custom";
  }, [inputs]);

  // Recharts vertical-bar layout reserves a fixed pixel column for category
  // labels — at <640 px we shrink it (and shorten the labels) so the bars
  // themselves stay visible on a phone.
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const breakdown = useMemo<BreakdownRow[]>(() => {
    const tr = result.perRack.traditional;
    const s = result.perRack.sysblade;
    return [
      { item: "初始採購", itemEn: "Initial purchase", short: "採購", shortEn: "Purchase", traditional: tr.initial, sysblade: s.initial },
      { item: "更換", itemEn: "Replacement", short: "更換", shortEn: "Replace", traditional: tr.replacements, sysblade: s.replacements },
      { item: "瞬變損失", itemEn: "Transient loss", short: "瞬變", shortEn: "Transient", traditional: tr.transient, sysblade: s.transient },
      { item: "維運人力", itemEn: "Ops labor", short: "維運", shortEn: "Ops", traditional: tr.ops, sysblade: s.ops },
      { item: "HVDC 轉換", itemEn: "HVDC transition", short: "HVDC", shortEn: "HVDC", traditional: tr.hvdc, sysblade: s.hvdc },
    ];
  }, [result]);

  return (
    <div className="space-y-12 reveal-stagger">
      <div
        role="note"
        className="rounded-md border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-foreground/90 leading-relaxed"
      >
        <span className="font-semibold text-warning">{t("競賽期試算工具：", "Competition demo estimator: ")}</span>
        {t(
          "數字依您輸入的假設試算，非實際或保證節省；不屬於中技社說明書的主張。",
          "Figures are calculated from the assumptions you enter; they are not actual or guaranteed savings and are not claims made in the CTCI Foundation brief.",
        )}
      </div>
      <header className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-6 right-0 -z-10 h-48 w-48 rounded-full bg-accent/10 blur-[100px]"
        />
        <div className="text-xs uppercase tracking-[0.22em] text-accent font-medium">{t("TCO 計算器 · 10 年期間", "TCO calculator · 10-year horizon")}</div>
        <div className="accent-rule bg-accent mt-3 mb-4" />
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-[1.1] max-w-3xl text-balance">
          {t(<>瞬變缺口讓您<span className="gradient-text-accent">付出多少成本</span>？</>, <>What does the transient gap <span className="gradient-text-accent">cost you</span>?</>)}
        </h1>
        <p className="mt-4 text-sm sm:text-base text-muted max-w-3xl leading-relaxed">
          {t(
            <>
              「瞬變」= AI 伺服器的功率波動；它是否造成重啟與停機，本作品的模擬沒有證明，此處只當作您可調整的假設成本。
              本計算器把它連同採購、更換、人力算成 <span className="text-success font-medium">10 年總帳</span>（依您輸入的假設試算，非保證節省比例）。
              拉動滑桿，試算您的情境。
            </>,
            <>
              &ldquo;Transient&rdquo; = power swings in AI servers. Whether they cause restarts and downtime is not proven by this work&rsquo;s simulation, so here it is only an assumed cost you can adjust.
              This calculator adds it to purchase, replacement and labor to give a <span className="text-success font-medium">10-year total</span> (calculated from the assumptions you enter; not a guaranteed savings percentage).
              Drag the sliders to estimate your scenario.
            </>,
          )}
          <span className="block mt-2 text-xs">
            {t(
              "成本模型：提案 §G.3 · 參考基準 $0.10/kWh、PUE 1.4",
              "Cost model: proposal §G.3 · reference basis $0.10/kWh, PUE 1.4",
            )}
          </span>
        </p>
      </header>

      {/* Plain-language glossary for this page's recurring terms. */}
      <GlossaryPanel termKeys={["tco", "transient", "pue", "hvdc", "bbu", "lfp", "lic"]} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inputs */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{t("輸入參數", "Inputs")}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-5">
            <div>
              <label className="text-xs text-muted uppercase tracking-wider">{t("快速預設組", "Quick presets")}</label>
              <select
                value={presetName}
                onChange={(e) => {
                  // Selecting "Custom" is a no-op — the option only appears
                  // when the user has dragged a slider off-preset.
                  if (e.target.value === "custom") return;
                  setInputs({ ...PRESETS[e.target.value] });
                }}
                className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="custom" disabled hidden>{t("自訂", "Custom")}</option>
                {Object.keys(PRESETS).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>

            <NumberField
              label={t("機架數量", "Rack count")}
              value={inputs.racks}
              min={1}
              max={5000}
              step={1}
              onChange={(v) => setInputs((s) => ({ ...s, racks: v }))}
            />
            <NumberField
              label={t("電價 (USD / kWh)", "Electricity price (USD / kWh)")}
              value={inputs.electricityPriceUsdPerKwh}
              min={0.04}
              max={0.25}
              step={0.005}
              prefix="$"
              onChange={(v) => setInputs((s) => ({ ...s, electricityPriceUsdPerKwh: v }))}
            />
            <NumberField
              label="PUE"
              value={inputs.pue}
              min={1.05}
              max={2.0}
              step={0.05}
              onChange={(v) => setInputs((s) => ({ ...s, pue: v }))}
              hint={t("總用電 ÷ IT 設備用電,越接近 1 越省;冷卻用電越多,數字越高。", "Total power ÷ IT equipment power. The closer to 1, the better; the more power cooling uses, the higher the number.")}
            />
            <NumberField
              label={t("電網碳排 (kg CO₂ / kWh)", "Grid carbon intensity (kg CO₂ / kWh)")}
              value={inputs.gridCarbonKgPerKwh}
              min={0.05}
              max={0.8}
              step={0.01}
              hint={t("您所在電網每度電的碳排,用於估算 CO₂ 減量。", "Carbon emitted per kWh on your grid, used to estimate the CO₂ reduction.")}
              onChange={(v) => setInputs((s) => ({ ...s, gridCarbonKgPerKwh: v }))}
            />
          </CardBody>
        </Card>

        {/* Headline outputs */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label={t("機隊 10 年節省", "Fleet 10-year savings")}
              value={formatUsd(result.fleet.savingUsd)}
              tone="success"
              hint={t(`依目前輸入試算：較傳統 BBU 低 ${(result.fleet.savingPct * 100).toFixed(1)} %`, `Estimated from current inputs: ${(result.fleet.savingPct * 100).toFixed(1)} % lower than traditional BBU`)}
            />
            <Stat
              label={t("每機架節省", "Savings per rack")}
              value={formatUsd(result.perRack.saving)}
              tone="primary"
              hint={t(`依目前輸入試算：每機架 ${(result.perRack.savingPct * 100).toFixed(1)} %`, `Estimated from current inputs: ${(result.perRack.savingPct * 100).toFixed(1)} % per rack`)}
            />
            <Stat
              label={t("回收期", "Payback period")}
              value={formatPayback(result.fleet.paybackYears, lang)}
              tone={
                Number.isFinite(result.fleet.paybackYears) && result.fleet.paybackYears > 0
                  ? result.fleet.paybackYears < 3
                    ? "success"
                    : result.fleet.paybackYears < 7
                      ? "primary"
                      : "warning"
                  : "default"
              }
              hint={
                Number.isFinite(result.fleet.paybackYears) && result.fleet.paybackYears > 0
                  ? t(
                      "依目前輸入的假設試算：額外 CAPEX 由預測性維運 + 瞬變 + 更換頻率的差額攤回（非保證）",
                      "Estimated from current input assumptions: the extra CAPEX is recovered through the differences in predictive operations + transient + replacement frequency (not guaranteed)",
                    )
                  : inputs.racks === 0
                    ? t("請設定機架數量 > 0 以計算回收期", "Set the rack count above 0 to calculate payback")
                    : t("在此情境下營運節省 ≤ 0 — 詳見成本項目表了解原因", "Operating savings are ≤ 0 in this scenario; see the cost-item table for why")
              }
            />
            <Stat
              label={t("CO₂ 減量 · 10 年", "CO₂ reduction · 10 years")}
              value={formatTons(result.fleet.co2SavedKg)}
              tone="default"
              hint={
                <span className="inline-flex items-center gap-1">
                  {/* EPA average passenger vehicle ≈ 4.6 t CO₂/yr (10y → 46 t).
                      Dividing fleet 10-year savings by 46 t gives the
                      "passenger cars taken off the road for a year" headline. */}
                  <Leaf className="h-3 w-3" /> {t(`≈ 相當於 ${Math.max(0, result.fleet.co2SavedKg / 1000 / 4.6 / 10).toFixed(0)} 輛車 / 年`, `≈ equivalent to ${Math.max(0, result.fleet.co2SavedKg / 1000 / 4.6 / 10).toFixed(0)} cars per year`)}
                </span>
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("成本分解 · 每機架 · 10 年期間", "Cost breakdown · per rack · 10-year horizon")}</CardTitle>
            </CardHeader>
            <CardBody>
              <BreakdownBars rows={breakdown} isNarrow={isNarrow} />
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Per-rack table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("成本項目明細 · 單一機架 · USD", "Cost line items · single rack · USD")}</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="overflow-x-auto">
            <table className={`w-full text-sm ${tightEn}`}>
              <thead>
                <tr className={`text-muted text-xs uppercase tracking-wider ${lang === "en" ? "max-[359px]:tracking-normal" : ""}`}>
                  <th className="text-left py-2">{t("成本項目", "Cost item")}</th>
                  <th className={`text-right py-2 whitespace-nowrap ${numPad}`}>{t<React.ReactNode>("傳統", <><span className="sm:hidden">Legacy</span><span className="hidden sm:inline">Traditional</span></>)}</th>
                  <th className={`text-right py-2 whitespace-nowrap ${numPad}`}>Sysblade</th>
                  <th className={`text-right py-2 whitespace-nowrap ${numPad}`}>Δ</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((row) => {
                  const delta = row.sysblade - row.traditional;
                  return (
                    <tr key={row.item} className="border-t border-border">
                      <td className="py-2.5">{t(row.item, row.itemEn)}</td>
                      <td className={`py-2.5 text-right tabular-nums text-warning whitespace-nowrap ${numPad}`}>${row.traditional.toLocaleString(locale)}</td>
                      <td className={`py-2.5 text-right tabular-nums text-primary whitespace-nowrap ${numPad}`}>${row.sysblade.toLocaleString(locale)}</td>
                      <td
                        className={`py-2.5 text-right tabular-nums font-medium whitespace-nowrap ${numPad} ${
                          delta < 0 ? "text-success" : "text-danger"
                        }`}
                      >
                        {delta < 0 ? "−" : "+"}${Math.abs(delta).toLocaleString(locale)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-border font-semibold">
                  <td className="py-3">{t("總計", "Total")}</td>
                  <td className={`py-3 text-right tabular-nums text-warning whitespace-nowrap ${numPad}`}>
                    ${result.perRack.traditional.total.toLocaleString(locale)}
                  </td>
                  <td className={`py-3 text-right tabular-nums text-primary whitespace-nowrap ${numPad}`}>
                    ${result.perRack.sysblade.total.toLocaleString(locale)}
                  </td>
                  <td className={`py-3 text-right tabular-nums text-success whitespace-nowrap ${numPad}`}>
                    −${result.perRack.saving.toLocaleString(locale)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Sources & assumptions — per-line-item citation panel. Lets a
          business mentor audit each delta end-to-end without flipping
          back to the v2.2 PDF. Each entry corresponds 1:1 with the
          TCO_LINE_ITEM_SOURCES catalogue in `apps/web/src/lib/tco.ts`. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            {t("來源與假設", "Sources & assumptions")}
          </CardTitle>
          <p className="mt-1.5 text-[11px] text-muted">
            {t(
              <>
                每一條 TCO 項目都對應 <span className="text-foreground">v2.2 §G.3 Table 6</span>。
                展開下方可查看可稽核的逐項分解。
              </>,
              <>
                Every TCO line item maps to <span className="text-foreground">v2.2 §G.3 Table 6</span>.
                Expand below for an auditable line-by-line breakdown.
              </>,
            )}
          </p>
        </CardHeader>
        <CardBody>
          <Disclosure summary={t("顯示逐項來源與假設", "Show per-item sources and assumptions")}>
            <p className="mb-3 text-[11px] leading-relaxed text-muted">
              {t(
                <>「業界依據」為方向性的組織<em>類別</em>標示，非已驗證引用；正式銷售時將補上具體報告編號 + 頁碼。</>,
                <>The &ldquo;industry basis&rdquo; names the <em>category</em> of organisation directionally; these are not verified citations. Specific report IDs and page numbers will be added before any formal sales use.</>,
              )}
            </p>
            <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted text-[10px] uppercase tracking-wider">
                  <th className="text-left py-2 pr-3 whitespace-nowrap">{t("成本項目", "Cost item")}</th>
                  <th className="text-left py-2 pr-3 whitespace-nowrap">{t("v2.2 依據", "v2.2 basis")}</th>
                  <th className="text-left py-2">{t("為何是這個數字（方向性業界脈絡）", "Why this number (directional industry context)")}</th>
                </tr>
              </thead>
              <tbody>
                {TCO_LINE_ITEM_SOURCES.map((entry) => (
                  <tr key={entry.key} className="border-t border-border align-top">
                    <td className="py-2.5 pr-3 font-medium whitespace-nowrap">
                      {t(entry.label, entry.labelEn)}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap text-primary">
                      {entry.source}
                    </td>
                    <td className="py-2.5 leading-relaxed text-muted">{t(entry.anchor, entry.anchorEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Disclosure>
          <Disclosure summary={t("敏感度說明", "Sensitivity notes")} className="mt-4">
            {t(
            <ul className="ml-4 list-disc space-y-1 text-[11px] leading-relaxed text-muted">
              <li>
                <span className="text-foreground">電價與 PUE</span> 只會縮放
                <em>瞬變</em>與<em>維運</em>兩條項目（係數{" "}
                <code className="text-foreground">k = (price / 0.10) × (PUE / 1.4)</code>）；{" "}
                <em>初始採購</em>、<em>更換</em>與 <em>HVDC</em> 屬於
                與能源成本無關的固定成本假設。
              </li>
              <li>
                <span className="text-foreground">CO₂ 差值</span> 採用每機架/年的能源
                額外耗用估計值（傳統 2400 kWh → Sysblade 1700 kWh）× 電網碳排
                強度。並夾限於零，以避免在邊界輸入下顯示負的 CO₂ 節省。
              </li>
              <li>
                <span className="text-foreground">回收期</span> 將{" "}
                <em>所有</em>經常性差值（瞬變 + 維運 + 更換 + HVDC）以 10
                年攤平年化；分子為一次性的 CAPEX 溢價（Sysblade − 傳統初始）。
                當節省方向使回收期無法定義時（機架數 = 0、CAPEX 差值為負，或營運節省
                ≤ 0），會回傳 <code className="text-foreground">N/A</code>。
              </li>
              <li>
                <span className="text-foreground">所有數字皆為基準參考值</span>{" "}
                取自 v2.2 §G.3。實際成交時會以客戶專屬報價逐項取代；
                彈性模型讓您能對基準進行壓力測試，同時不失去
                對來源列的可追溯性。
              </li>
            </ul>,
<ul className="ml-4 list-disc space-y-1 text-[11px] leading-relaxed text-muted">
              <li>
                <span className="text-foreground">Electricity price and PUE</span> only scale the
                <em> transient</em> and <em>operations</em> lines (factor{" "}
                <code className="text-foreground">k = (price / 0.10) × (PUE / 1.4)</code>);{" "}
                <em>initial purchase</em>, <em>replacement</em> and <em>HVDC</em> are fixed cost
                assumptions unrelated to energy cost.
              </li>
              <li>
                <span className="text-foreground">The CO₂ difference</span> uses the estimated extra
                energy consumption per rack per year (traditional 2400 kWh → Sysblade 1700 kWh) ×
                grid carbon intensity. It is clamped at zero so that edge-case inputs never show a
                negative CO₂ saving.
              </li>
              <li>
                <span className="text-foreground">Payback</span> annualises{" "}
                <em>all</em> recurring differences (transient + operations + replacement + HVDC)
                over 10 years; the numerator is the one-time CAPEX premium (Sysblade − traditional
                initial). When the direction of savings leaves payback undefined (rack count = 0,
                negative CAPEX difference, or operating savings ≤ 0), it returns{" "}
                <code className="text-foreground">N/A</code>.
              </li>
              <li>
                <span className="text-foreground">All figures are baseline reference values</span>{" "}
                taken from v2.2 §G.3. In an actual deal they would be replaced line by line with
                customer-specific quotes; the flexible model lets you stress-test the baseline
                without losing traceability to the source rows.
              </li>
            </ul>,
            )}
          </Disclosure>
        </CardBody>
      </Card>

      {/* CTA */}
      <Card className="tint-accent glow-accent">
        <CardBody className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">{t("想要這份報告印上貴公司抬頭嗎？", "Want this report printed with your company letterhead?")}</h3>
            <p className="text-muted mt-1 text-sm">
              {t(
                "潛在客戶開發流程：留下您的電子郵件，我們將寄送一份 PDF，內含成本項目假設、FTO 參考資料，以及 針對您特定機架數量的報價。",
                "Lead-generation flow: leave your email and we will send a PDF containing the cost-item assumptions, FTO reference material, and a quote for your specific rack count.",
              )}
            </p>
          </div>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title={t("潛在客戶開發表單僅為 ATCC 展示用途的示意", "The lead-generation form is an illustration for the ATCC demo only")}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition cursor-not-allowed opacity-80"
          >
            {t("將報告寄到我的信箱", "Email me the report")} <ArrowRight className="h-4 w-4" />
          </button>
        </CardBody>
      </Card>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  prefix,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  prefix?: string;
  hint?: string;
}) {
  // Decimal places follow the slider step so the typed input shows the same
  // resolution as the slider snaps to (step=1 → 0, step=0.005 → 3, etc.).
  const decimals = step >= 1 ? 0 : Math.max(0, -Math.floor(Math.log10(step)));
  const formatNum = (n: number) =>
    decimals === 0 ? String(Math.round(n)) : n.toFixed(decimals);

  // The number input keeps a local string draft so the user can pass through
  // intermediate states like "" or "0." without us clobbering the parent
  // state. We only commit on blur or Enter; the slider stays at the
  // last-committed value while the user is typing.
  const [draft, setDraft] = useState<string>(() => formatNum(value));
  const userEditingRef = useRef(false);
  useEffect(() => {
    if (userEditingRef.current) return; // don't fight the user mid-type
    setDraft(formatNum(value));
    // formatNum closes over `decimals` which is derived from `step`; both
    // are stable across the input's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = () => {
    userEditingRef.current = false;
    const v = Number(draft);
    if (!Number.isFinite(v)) {
      setDraft(formatNum(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, v));
    if (clamped !== value) onChange(clamped);
    setDraft(formatNum(clamped));
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-xs text-muted uppercase tracking-wider">{label}</label>
        <div className="flex items-center gap-1 text-sm">
          {prefix && <span className="text-muted">{prefix}</span>}
          <input
            type="number"
            value={draft}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
              userEditingRef.current = true;
              setDraft(e.target.value);
            }}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commit();
                (e.currentTarget as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                userEditingRef.current = false;
                setDraft(formatNum(value));
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            className="w-20 rounded border border-border bg-background px-2 py-0.5 text-right tabular-nums font-medium focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-primary"
      />
      {hint && <p className="mt-1 text-xs text-muted leading-relaxed">{hint}</p>}
    </div>
  );
}
