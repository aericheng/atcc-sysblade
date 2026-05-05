/**
 * TCO model from Sysblade HyperBuffer Proposal v2.2 §G.3.
 *
 * Per-rack 10-year cost (USD) for a 100 kW-class rack with 8 BBUs.
 *
 * Each line below is sourced from the proposal's Table §G.3:
 *   initial_purchase   8 × ASP
 *   replacements       1.5× cost over 10y for traditional NMC, 1.0× for Sysblade LFP
 *   transient_loss     downtime cost from voltage-sag-induced restarts
 *   ops_labor          maintenance hours, reduced by predictive ops
 *   hvdc_transition    cost to retrofit during 48V → ±400V transition
 *
 * The user can scale by rack count, electricity price (PUE-adjusted), and
 * grid carbon intensity to get total cost + CO2 deltas.
 */

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

// Energy overhead from BBU + cooling, attributable to BBU losses, per rack/year.
// Order-of-magnitude estimate used for CO2 comparison only.
const TRADITIONAL_KWH_PER_RACK_YEAR = 2400; // ~5% loss on a 5.5 kW BBU draw, 8 BBUs
const SYSBLADE_KWH_PER_RACK_YEAR = 1700; // higher round-trip efficiency + thermal

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

  // 10-year CO2 delta from energy-overhead reduction
  const tradKwh10y = TRADITIONAL_KWH_PER_RACK_YEAR * racks * 10 * inputs.pue;
  const sysKwh10y = SYSBLADE_KWH_PER_RACK_YEAR * racks * 10 * inputs.pue;
  const co2 = (tradKwh10y - sysKwh10y) * inputs.gridCarbonKgPerKwh;

  // Simple payback: extra up-front capex / annual operating savings.
  // Every line in RackCosts is a 10-year total (see file header), so the
  // numerator is one-time delta capex and the denominator annualises ALL
  // recurring deltas by /10 — not just replacements.
  const extraCapex = (sys.initial - trad.initial) * racks;
  const tenYearOpDelta =
    (trad.transient + trad.ops + trad.replacements + trad.hvdc) -
    (sys.transient + sys.ops + sys.replacements + sys.hvdc);
  const annualOpSaving = (tenYearOpDelta / 10) * racks;
  const payback = annualOpSaving > 0 ? extraCapex / annualOpSaving : 999;

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
