import { DashboardClient } from "./dashboard-client";

export const metadata = {
  title: "Fleet Dashboard · Sysblade",
  description:
    "1000-device synthetic Sysblade fleet — real-time monitoring, proactive maintenance, predictive ops.",
};

async function loadJson(name: string) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const file = path.join(process.cwd(), "public", "scenarios", `${name}.json`);
  return JSON.parse(await fs.readFile(file, "utf-8"));
}

// Extract the LIC RC envelope from the hybrid transient scenario so the
// per-device drilldown can show fleet-wide LIC headroom without polluting
// fleet_devices.json with the same numbers on every row. The envelope is
// a system-level reference (one LIC bank topology serves the whole fleet
// per v2.2 §E.1) — production telemetry will give per-device readings
// later; for the demo the envelope is constant.
function extractLicRcEnvelope(transientHybrid: {
  stats: Record<string, number | boolean | undefined>;
}) {
  const s = transientHybrid.stats;
  return {
    v_nominal: s.lic_v_nominal as number,
    v_min: s.lic_v_min as number,
    v_max: s.lic_v_max as number,
    v_droop_v: s.lic_v_droop_v as number,
    v_min_datasheet: s.lic_v_min_datasheet as number,
    headroom_to_cutoff_v: s.lic_headroom_to_cutoff_v as number,
    passes_cutoff: Boolean(s.lic_passes_cutoff),
    c_f: s.lic_c_f as number,
    esr_ohm: s.lic_esr_ohm as number,
  };
}

export default async function DashboardPage() {
  const [fleet, transientHybrid, rackNMinus1] = await Promise.all([
    loadJson("fleet_devices"),
    loadJson("transient_hybrid"),
    loadJson("rack_n_minus_1"),
  ]);
  const licRcEnvelope = extractLicRcEnvelope(transientHybrid);
  return (
    <DashboardClient
      fleet={fleet}
      licRcEnvelope={licRcEnvelope}
      rackNMinus1={rackNMinus1}
    />
  );
}
