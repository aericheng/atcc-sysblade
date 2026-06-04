/**
 * Aged-state power-capability model (client-side mirror).
 *
 * This is the TypeScript mirror of the DCIR-growth model in
 * `scripts/generate_twin_scenarios.py` (`_dcir_growth` / `_peak_power_retention`,
 * EOL_SOH / DCIR_GROWTH_AT_EOL). It exists so the /dashboard per-device drilldown
 * can surface a device's *deliverable power + backup runtime at its current SOH*
 * — the customer KPI the mentor flagged on 2026-06-04 (not just SOH/RUL).
 *
 * Single source of truth for the fleet's SOH numbers is still the JSON
 * (fleet_devices.json:soh_lfp); this file only derives a display column from it,
 * the same way the drilldown already derives bbuYrs = rul_cycles / 50.
 *
 * KEEP IN SYNC with generate_twin_scenarios.py: EOL_SOH, DCIR_GROWTH_AT_EOL.
 */

export const EOL_SOH = 0.8;
export const DCIR_GROWTH_AT_EOL = 0.5; // +50% DCIR at 80% SOH (LFP literature-typical)
export const BACKUP_RUNTIME_S_BOL_PEAK = 600; // 20 kWh ÷ 120 kW rack peak (BoL)
export const BACKUP_COMMITMENT_S = 60; // §2.1.1 graceful-shutdown commitment

/** Fractional internal-resistance rise at a given SOH (0 at BoL = 1.0). */
export function dcirGrowth(soh: number): number {
  return (DCIR_GROWTH_AT_EOL * (1 - soh)) / (1 - EOL_SOH);
}

/** Deliverable peak-power retention vs BoL (DCIR-limited at the voltage floor). */
export function peakPowerRetention(soh: number): number {
  return 1 / (1 + dcirGrowth(soh));
}

/** Energy-limited backup runtime (s) at rack peak power — capacity ∝ SOH. */
export function backupRuntimeSeconds(soh: number): number {
  return BACKUP_RUNTIME_S_BOL_PEAK * soh;
}

// ---------------------------------------------------------------------------
// Calendar / storage fade model — client mirror of generate_twin_scenarios.py
// (_soh_calendar / _cal_life_years_at_80 / _cal_temp_factor / _cal_soc_factor).
// Lets the /twin calendar widget recompute life live as the user drags the
// temperature / SOC sliders. Naumann-2018 √t form, Arrhenius T × monotone SOC,
// absolute scale back-calibrated so DC-float conditions hit 80 % SOH at 10 yr
// (inside v2.2 附件 C 8–12 yr). KEEP IN SYNC with the Python constants.
// ---------------------------------------------------------------------------
export const CAL_T_REF_K = 298.15; // 25 °C reference
export const CAL_EA_OVER_R_K = 6976; // Ea/R ≈ 6976 K (Ea ≈ 58 kJ/mol), literature range
export const CAL_SOC_REF = 0.5; // SOC at which the SOC factor normalises to 1.0
export const CAL_FLOAT_SOC = 0.9; // DC-backup float SOC
export const CAL_FLOAT_T_K = 303.15; // ~30 °C float temperature
export const CAL_LIFE_YEARS_AT_80 = 10; // calibration target (inside 附件 C 8–12 yr)
export const CAL_SOH_FLOOR = 0.3;

const cTempFactor = (tK: number) => Math.exp(-CAL_EA_OVER_R_K * (1 / tK - 1 / CAL_T_REF_K));
const cSocFactor = (soc: number) => (0.4 + 1.2 * soc) / (0.4 + 1.2 * CAL_SOC_REF);
const cKRef = () =>
  ((1 - 0.8) / Math.sqrt(CAL_LIFE_YEARS_AT_80)) /
  (cTempFactor(CAL_FLOAT_T_K) * cSocFactor(CAL_FLOAT_SOC));

/** Calendar/storage SOH after `years` at storage temperature `tC` (°C) and `soc` (0–1). */
export function calendarSoh(years: number, tC: number, soc: number): number {
  const k = cKRef() * cTempFactor(tC + 273.15) * cSocFactor(soc);
  return Math.min(1, Math.max(CAL_SOH_FLOOR, 1 - k * Math.sqrt(Math.max(years, 0))));
}

/** Calendar life (years to 80 % SOH) at storage temperature `tC` (°C) and `soc` (0–1). */
export function calendarLifeYears(tC: number, soc: number): number {
  const k = cKRef() * cTempFactor(tC + 273.15) * cSocFactor(soc);
  return k > 0 ? (0.2 / k) ** 2 : Infinity;
}
