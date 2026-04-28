import { DashboardClient } from "./dashboard-client";

export const metadata = {
  title: "Fleet Dashboard · Sysblade",
  description:
    "1000-device synthetic Sysblade fleet — real-time monitoring, proactive maintenance, predictive ops.",
};

async function loadFleet() {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const file = path.join(process.cwd(), "public", "scenarios", "fleet_devices.json");
  return JSON.parse(await fs.readFile(file, "utf-8"));
}

export default async function DashboardPage() {
  const fleet = await loadFleet();
  return <DashboardClient fleet={fleet} />;
}
