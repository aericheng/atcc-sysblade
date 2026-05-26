import { TwinClient } from "./twin-client";

export const metadata = {
  title: "Battery Digital Twin · Sysblade",
  description:
    "PyBaMM DFN simulation of LFP cell response to GB200 millisecond-scale power transients, with and without LIC hybrid buffer.",
};

async function loadScenario(name: string) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const file = path.join(process.cwd(), "public", "scenarios", `${name}.json`);
  const buf = await fs.readFile(file, "utf-8");
  return JSON.parse(buf);
}

export default async function TwinPage() {
  const [
    lfpOnly,
    hybrid,
    mainsFail,
    rackGraceful,
    rackNMinus1,
    aging,
    modelValidation,
  ] = await Promise.all([
    loadScenario("transient_lfp_only"),
    loadScenario("transient_hybrid"),
    loadScenario("mains_fail_profile"),
    loadScenario("rack_60s_graceful"),
    loadScenario("rack_n_minus_1"),
    loadScenario("aging_lfp"),
    loadScenario("model_validation"),
  ]);
  return (
    <TwinClient
      lfpOnly={lfpOnly}
      hybrid={hybrid}
      mainsFail={mainsFail}
      rackGraceful={rackGraceful}
      rackNMinus1={rackNMinus1}
      aging={aging}
      modelValidation={modelValidation}
    />
  );
}
