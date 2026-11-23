/**
 * English form of rack_n_minus_1.json's headline_verdict, rebuilt from the same JSON's numbers.
 * The JSON string is mixed zh/en (scripts/generate_n_minus_1_sim.py writes it) and the JSON is not
 * hand-edited (two-sink SHA gate), so the /en/ pages compose it here with the generator's number
 * formats. Returns null when a field is missing; callers then show the JSON string as is.
 */
type NMinus1Like = {
  stats?: Record<string, unknown>;
  pass_criteria?: Record<string, unknown>;
};

export function nMinus1VerdictEn(d: NMinus1Like | null | undefined): string | null {
  const s = d?.stats ?? {};
  const p = d?.pass_criteria ?? {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const cRate = num(s.c_rate_continuous_post_fault);
  const swing = num(s.v_cell_swing_v);
  const tMax = num(s.t_cell_max_c);
  const headroom = num(s.v_lic_headroom_to_uvlo_v);
  const cLimit = num(p.c_rate_continuous_post_limit);
  const swingLimit = num(p.v_cell_swing_limit_v);
  const tLimit = num(p.t_cell_limit_c);
  if ([cRate, swing, tMax, headroom, cLimit, swingLimit, tLimit].some((v) => v === null)) return null;
  const pass = p.overall_pass === true;
  return (
    `V4 ${pass ? "PASS" : "FAIL"} — after the N-1 failure each BBU runs at ${cRate!.toFixed(2)}C continuous, ` +
    `within the ${String(cLimit)}C continuous limit; V_cell swing ${(swing! * 1000).toFixed(0)} mV < ` +
    `${(swingLimit! * 1000).toFixed(0)} mV; T_cell max ${tMax!.toFixed(1)}°C < ${tLimit!.toFixed(1)}°C; ` +
    `LIC headroom ${headroom!.toFixed(2)}V > 0`
  );
}
