import { TourClient } from "./tour-client";

export const metadata = {
  title: "Tour · Sysblade HyperBuffer",
  description:
    "10-section scrollytelling walkthrough of Sysblade HyperBuffer — LFP+LIC hybrid topology, V1-V6 twin validation chains, RUL prediction, and customer TCO. Press play or scroll.",
};

async function loadScenario(name: string) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const file = path.join(process.cwd(), "public", "scenarios", `${name}.json`);
  return JSON.parse(await fs.readFile(file, "utf-8"));
}

export default async function TourPage() {
  const [rackGraceful, rackNMinus1] = await Promise.all([
    loadScenario("rack_60s_graceful"),
    loadScenario("rack_n_minus_1"),
  ]);
  return <TourClient rackGraceful={rackGraceful} rackNMinus1={rackNMinus1} />;
}
