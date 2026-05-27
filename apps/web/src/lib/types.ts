/**
 * Shared types used by /dashboard and the components it composes.
 *
 * Keep this file as the single source of truth. If you find yourself
 * redeclaring `Device` somewhere else, import from here instead.
 */

export type DeviceStatus = "healthy" | "thermal_warn" | "early_aging";

export interface Device {
  id: string;
  site: string;
  location: string;
  lat: number;
  lng: number;
  soh_lfp: number;
  soh_lic: number;
  rul_cycles: number;
  age_months: number;
  transient_events_24h: number;
  temp_lfp_c: number;
  temp_lic_c: number;
  status: DeviceStatus;
}

export const STATUS_COLOR: Record<DeviceStatus, string> = {
  healthy: "#34d399",
  thermal_warn: "#fbbf24",
  early_aging: "#f87171",
};

export const STATUS_LABEL: Record<DeviceStatus, string> = {
  healthy: "Healthy",
  thermal_warn: "Thermal warning",
  early_aging: "Early aging",
};

/**
 * LIC bank RC envelope — system-level reference derived from the PyBaMM
 * hybrid transient scenario (closed-form RC: v_lic = V_nominal − Q/C − i × ESR,
 * Eaton XLR-48-166 × 2 parallel anchor). Used by /dashboard's per-device
 * drilldown to surface fleet-wide LIC headroom-to-UVLO under the demo
 * waveform. Production telemetry will replace this with per-device
 * readings once the FastAPI backend lands (v2.2 §F.3 W3+).
 *
 * Values are in volts unless otherwise noted; capacitance in farads, ESR
 * in ohms. `passes_cutoff` is the hard-invariant check the cross-check
 * gate (`scripts/check_whitepaper_numbers.py`) asserts at regen time.
 */
export interface LicRcEnvelope {
  v_nominal: number;
  v_min: number;
  v_max: number;
  v_droop_v: number;
  v_min_datasheet: number;
  headroom_to_cutoff_v: number;
  passes_cutoff: boolean;
  c_f: number;
  esr_ohm: number;
}

