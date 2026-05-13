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
    label: "Initial purchase (8 × BBU ASP)",
    source: "v2.2 §G.3 Table 6, row 1",
    anchor:
      "Traditional NMC BBU ASP $720/unit reflects mid-2020s mid-tier rack BBU procurement pricing (directional industry baseline — verify against BloombergNEF / IDTechEx battery price surveys for specific deals). Sysblade target $1080/unit reflects the LFP+LIC hybrid + embedded Twin (cost engineering in v2.2 §E.2 BOM table).",
  },
  {
    key: "replacements",
    label: "Replacements over 10 years",
    source: "v2.2 §G.3 Table 6, row 2",
    anchor:
      "Traditional NMC 6-8 yr service life is a typical industry range for cycle-fade + calendar-life-bound BBU packs under data-center duty (directional — verify against Wood Mackenzie / IDTechEx data-center BBU publications for specific deals). 1.5× replacements in 10y at $1080 each; Sysblade LFP under BBU duty 10+ yr (Severson-fit decay + duty_factor 0.33, see /twin aging chart) → 1× replacement.",
  },
  {
    key: "transient",
    label: "Transient downtime cost",
    source: "v2.2 §G.3 Table 6, row 3",
    anchor:
      "Downtime cost from voltage-sag-induced restarts conservatively estimated using rack-level transient event cost ranges commonly cited by Uptime Institute outage analyses (directional — specific issue + page TBD by team). Traditional NMC sees ~6 sag-induced restarts/yr at 80 kW × 100 ms ≈ $4800/rack/10y; Sysblade LIC absorbs sub-1s events → ~75 % reduction to $1200/rack/10y (per §B.1 5.7× power-stress drop on LFP).",
  },
  {
    key: "ops",
    label: "Ops labour (predictive maintenance)",
    source: "v2.2 §G.3 Table 6, row 4",
    anchor:
      "Traditional BBU inspection labour estimated at ~50 h/rack/10y at ~$100/h ≈ $5000 — anchored to data-center ops cost ranges in ASHRAE TC 9.9 thermal guidelines + industry rack-ops benchmarks (directional — specific document + page TBD by team). Sysblade Twin-driven predictive ops cuts to ~20 h/rack/10y ≈ $2000 (RUL-triggered Tier-3 replacement vs scheduled inspection).",
  },
  {
    key: "hvdc",
    label: "HVDC transition retrofit",
    source: "v2.2 §G.3 Table 6, row 5",
    anchor:
      "48V→±400V HVDC retrofit estimated at ~$600/rack/yr × 8y ≈ $4800 for legacy NMC sets needing forklift swap during the industry transition (directional — Schneider/Vertiv/Eaton publish HVDC migration whitepapers in this category; specific document TBD by team). Sysblade ORV3-ready interface → drops to $1800/rack/10y residual integration cost (no chemistry rework needed).",
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
  if (years < 1) return `${(years * 12).toFixed(1)} mo`;
  if (years < 10) return `${years.toFixed(1)} yr`;
  // Over 10 years means the user's input combination puts payback past
  // the TCO horizon — practically un-recoverable for this scenario.
  return ">10 yr";
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
