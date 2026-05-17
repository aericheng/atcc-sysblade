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

/**
 * Bench demonstrator live telemetry snapshot — schema produced by
 * `scripts/live_demonstrator_bridge.py` and polled by /dashboard client-side
 * every 5 s. See docs/BBU_IMPLEMENTATION_PLAN.md §5.4 (M4 critical path).
 *
 * `live=false` is the placeholder the static build ships with — the
 * dashboard renders a "Waiting for telemetry" card in that state. When the
 * lab laptop runs the bridge it overwrites the file with `live=true` and
 * a populated `device` object.
 *
 * The `device` shape extends Device with live-only electrical extras
 * (v_pack_v, i_pack_a, p_load_w, hybrid_mode) that have no meaning for
 * the simulated 1000-device fleet.
 */
export interface LiveDeviceTelemetry extends Device {
  v_pack_v: number;
  i_pack_a: number;
  p_load_w: number;
  hybrid_mode: boolean;
}

export interface LiveDemonstratorSnapshot {
  _meta: {
    generated_at: string;
    generator: string;
    mode: "mock" | "bench" | "offline";
    uptime_s?: number;
  };
  live: boolean;
  device: LiveDeviceTelemetry | null;
}
