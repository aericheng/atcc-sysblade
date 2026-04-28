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
