/**
 * TCO model from Sysblade HyperBuffer Proposal v2.2 §G.3.
 *
 * Per-rack 10-year cost (USD) for a 100 kW-class rack with 8 BBUs.
 *
 * Each line below is sourced from the proposal's Table §G.3 (and the
 * external anchors documented in the TCO_LINE_ITEM_SOURCES catalogue
 * below — the UI surfaces those references in a collapsible "Sources &
 * assumptions" panel so a business mentor can audit each number end-to-
 * end without flipping back to the PDF):
 *   initial_purchase   8 × ASP per BBU
 *   replacements       1.5× cost over 10y for traditional NMC, 1.0× for Sysblade LFP
 *   transient_loss     downtime cost from voltage-sag-induced restarts
 *   ops_labor          maintenance hours, reduced by predictive ops
 *   hvdc_transition    cost to retrofit during 48V → ±400V transition
 *
 * The user can scale by rack count, electricity price (PUE-adjusted), and
 * grid carbon intensity to get total cost + CO2 deltas.
 */

/**
 * Per-line-item source catalogue. Surfaced by the /tco page's "Sources &
 * assumptions" panel so each Sysblade-vs-Traditional delta is auditable.
 * `key` matches the field name on `RackCosts`; `anchor` explains the
 * specific assumption with directional industry context.
 *
 * IMPORTANT — citation discipline:
 * The numeric anchors below are pinned to v2.2 §G.3 Table 6 (the
 * canonical source for this proposal). External industry references
 * (BNEF, Wood Mackenzie, Uptime Institute, ASHRAE, Schneider HVDC)
 * are named to indicate the *category* of organisation that publishes
 * in each area, NOT as verified citations to specific documents. The
 * team must replace these with concrete report IDs + page numbers
 * before any production sales conversation. Business mentors who
 * pattern-match real org names but find numbers don't match a specific
 * issue is a self-inflicted credibility hit; this catalogue is honest
 * about its directional nature.
 */
export const TCO_LINE_ITEM_SOURCES: Array<{
  key: keyof Omit<RackCosts, "total">;
  label: string;
  source: string;
  anchor: string;
}> = [
  {
    key: "initial",
    label: "初期採購（8 × BBU ASP）",
    source: "v2.2 §G.3 Table 6, row 1",
    anchor:
      "傳統 NMC BBU 的 ASP $720/unit 反映 2020 年代中期中階機架 BBU 的採購價格（方向性產業基準 — 具體交易請對照 BloombergNEF / IDTechEx 電池價格調查驗證）。Sysblade 目標 $1080/unit 反映 LFP+LIC 混合 + 嵌入式 Twin（成本工程見 v2.2 §E.2 BOM 表）。",
  },
  {
    key: "replacements",
    label: "10 年內的更換成本",
    source: "v2.2 §G.3 Table 6, row 2",
    anchor:
      "傳統 NMC 6-8 yr 服務壽命,是資料中心工況下、受循環衰退 + 日曆壽命限制的 BBU 電池組的典型產業區間（方向性 — 具體交易請對照 Wood Mackenzie / IDTechEx 資料中心 BBU 出版品驗證）。10y 內更換 1.5× 每個 $1080；Sysblade LFP 在 BBU 工況下 10+ yr（Severson-fit 衰退 + duty_factor 0.33,見 /twin 老化圖）→ 更換 1×。",
  },
  {
    key: "transient",
    label: "瞬變停機成本",
    source: "v2.2 §G.3 Table 6, row 3",
    anchor:
      "電壓驟降導致重啟的停機成本,保守採用 Uptime Institute 停電分析常引用的機架級瞬變事件成本區間估算（方向性 — 具體期數 + 頁碼由團隊待補）。傳統 NMC 在 80 kW × 100 ms 下約每年 ~6 次驟降重啟 ≈ $4800/rack/10y；Sysblade LIC 吸收次秒級事件 → 降低約 ~75 % 至 $1200/rack/10y（依 §B.1 LFP 功率應力下降 5.7×）。",
  },
  {
    key: "ops",
    label: "維運人力（預測性維護）",
    source: "v2.2 §G.3 Table 6, row 4",
    anchor:
      "傳統 BBU 巡檢人力估計約 ~50 h/rack/10y、約 ~$100/h ≈ $5000 — 對標 ASHRAE TC 9.9 熱導則 + 產業機架維運基準的資料中心維運成本區間（方向性 — 具體文件 + 頁碼由團隊待補）。Sysblade Twin 驅動的預測性維運降至 ~20 h/rack/10y ≈ $2000（RUL 觸發的 Tier-3 更換,取代排程巡檢）。",
  },
  {
    key: "hvdc",
    label: "HVDC 轉換改裝",
    source: "v2.2 §G.3 Table 6, row 5",
    anchor:
      "48V→±400V HVDC 改裝估計約 ~$600/rack/yr × 8y ≈ $4800,適用於產業轉換期間需整批汰換的舊款 NMC 套組（方向性 — Schneider/Vertiv/Eaton 在此類別發表 HVDC 遷移白皮書；具體文件由團隊待補）。Sysblade ORV3-ready 介面 → 降至 $1800/rack/10y 殘餘整合成本（無需化學體系重工）。",
  },
];

export interface TcoInputs {
  racks: number;
  electricityPriceUsdPerKwh: number;
  pue: number;
  gridCarbonKgPerKwh: number;
}

export interface RackCosts {
  initial: number;
  replacements: number;
  transient: number;
  ops: number;
  hvdc: number;
  total: number;
}

const TRADITIONAL_PER_RACK: RackCosts = {
  initial: 5760,
  replacements: 8640,
  transient: 4800,
  ops: 5000,
  hvdc: 4800,
  total: 29000,
};

const SYSBLADE_PER_RACK: RackCosts = {
  initial: 8640, // higher ASP
  replacements: 5760, // 1× over 10y instead of 1.5×
  transient: 1200, // LIC absorbs ms-scale events
  ops: 2000, // predictive ops
  hvdc: 1800, // ORV3 + HVDC-ready interface
  total: 19400,
};

// BBU-side direct energy overhead (round-trip + idle losses), per rack/year.
// Order-of-magnitude estimate used for CO2 comparison only. The cooling
// overhead is added downstream by multiplying by PUE in `computeTco` —
// i.e. these constants are BBU-only, NOT BBU + cooling, so multiplying
// the result by `inputs.pue` correctly compounds the cooling factor.
const TRADITIONAL_KWH_PER_RACK_YEAR = 2400; // BBU-only direct loss (NMC, 8 BBUs)
const SYSBLADE_KWH_PER_RACK_YEAR = 1700; // BBU-only direct loss (higher round-trip + thermal efficiency)

export interface TcoResult {
  perRack: { traditional: RackCosts; sysblade: RackCosts; saving: number; savingPct: number };
  fleet: {
    traditionalUsd: number;
    sysbladeUsd: number;
    savingUsd: number;
    savingPct: number;
    co2SavedKg: number;
    paybackYears: number;
  };
}

// Sentinel returned when payback is mathematically undefined (savings <= 0
// or rack count = 0). UI must check for this and render "N/A" instead of
// the raw number — otherwise the user sees a 999-year payback that looks
// like a real value and breaks trust.
export const PAYBACK_UNDEFINED = Number.POSITIVE_INFINITY;

export function computeTco(inputs: TcoInputs): TcoResult {
  const racks = Math.max(0, inputs.racks);

  const trad: RackCosts = { ...TRADITIONAL_PER_RACK };
  const sys: RackCosts = { ...SYSBLADE_PER_RACK };

  // Energy-related lines are sensitive to electricity price and PUE.
  // We fold the user's electricity price into transient + ops as a proxy:
  // transient losses ∝ price (downtime energy + restart penalties)
  // ops ∝ price * 0.3 (some ops cost is energy via cooling/test rigs)
  const priceFactor = inputs.electricityPriceUsdPerKwh / 0.1;
  const pueFactor = inputs.pue / 1.4;
  const k = priceFactor * pueFactor;
  trad.transient = Math.round(TRADITIONAL_PER_RACK.transient * k);
  sys.transient = Math.round(SYSBLADE_PER_RACK.transient * k);
  trad.ops = Math.round(TRADITIONAL_PER_RACK.ops * (1 + 0.3 * (k - 1)));
  sys.ops = Math.round(SYSBLADE_PER_RACK.ops * (1 + 0.3 * (k - 1)));

  trad.total = trad.initial + trad.replacements + trad.transient + trad.ops + trad.hvdc;
  sys.total = sys.initial + sys.replacements + sys.transient + sys.ops + sys.hvdc;

  const perRackSaving = trad.total - sys.total;
  const fleetTrad = trad.total * racks;
  const fleetSys = sys.total * racks;
  const fleetSaving = fleetTrad - fleetSys;

  // 10-year CO2 delta from energy-overhead reduction. Clamp at 0: under
  // extreme PUE / carbon-intensity combinations the user could conceivably
  // dial the model below the design assumption that Sysblade is more
  // efficient than traditional NMC; we don't want the UI to flash a
  // negative-CO2 number when the user is exploring edge cases.
  const tradKwh10y = TRADITIONAL_KWH_PER_RACK_YEAR * racks * 10 * inputs.pue;
  const sysKwh10y = SYSBLADE_KWH_PER_RACK_YEAR * racks * 10 * inputs.pue;
  const co2 = Math.max(0, (tradKwh10y - sysKwh10y) * inputs.gridCarbonKgPerKwh);

  // Simple payback: extra up-front capex / annual operating savings.
  // Every line in RackCosts is a 10-year total (see file header), so the
  // numerator is one-time delta capex and the denominator annualises ALL
  // recurring deltas by /10 — not just replacements.
  //
  // Returns PAYBACK_UNDEFINED (Infinity) in three degenerate cases the UI
  // must render as "N/A":
  //   1. racks == 0 → numerator and denominator both zero.
  //   2. annualOpSaving <= 0 → operating savings can never amortise capex.
  //   3. extraCapex < 0 → Sysblade is cheaper up-front, so payback is
  //      "immediate" / N/A by convention (we surface this separately).
  const extraCapex = (sys.initial - trad.initial) * racks;
  const tenYearOpDelta =
    (trad.transient + trad.ops + trad.replacements + trad.hvdc) -
    (sys.transient + sys.ops + sys.replacements + sys.hvdc);
  const annualOpSaving = (tenYearOpDelta / 10) * racks;
  let payback: number;
  if (racks === 0 || annualOpSaving <= 0 || extraCapex < 0) {
    payback = PAYBACK_UNDEFINED;
  } else {
    payback = extraCapex / annualOpSaving;
  }

  return {
    perRack: {
      traditional: trad,
      sysblade: sys,
      saving: perRackSaving,
      savingPct: perRackSaving / trad.total,
    },
    fleet: {
      traditionalUsd: fleetTrad,
      sysbladeUsd: fleetSys,
      savingUsd: fleetSaving,
      savingPct: fleetTrad ? fleetSaving / fleetTrad : 0,
      co2SavedKg: co2,
      paybackYears: payback,
    },
  };
}

/** Format paybackYears with N/A handling for the sentinel value. */
export function formatPayback(years: number): string {
  if (!Number.isFinite(years) || years <= 0) return "N/A";
  if (years < 1) return `${(years * 12).toFixed(1)} 月`;
  if (years < 10) return `${years.toFixed(1)} 年`;
  // Over 10 years means the user's input combination puts payback past
  // the TCO horizon — practically un-recoverable for this scenario.
  return ">10 年";
}

export function formatUsd(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

export function formatTons(kg: number): string {
  const t = kg / 1000;
  if (t >= 1_000) return `${(t / 1000).toFixed(1)} kt`;
  return `${t.toFixed(1)} t`;
}
