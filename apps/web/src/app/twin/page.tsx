import { TwinClient } from "./twin-client";
import { loadScenario } from "@/lib/load-scenario";

export const metadata = {
  title: "電池數位孿生 · Sysblade",
  description:
    "PyBaMM DFN 模擬 LFP 電芯對 GB200 毫秒級功率瞬變的響應,比較有無 LIC 混合緩衝的差異。",
};

export default async function TwinPage() {
  const [
    lfpOnly,
    hybrid,
    mainsFail,
    rackGraceful,
    rackNMinus1,
    aging,
    packImbalance,
    modelValidation,
  ] = await Promise.all([
    loadScenario("transient_lfp_only"),
    loadScenario("transient_hybrid"),
    loadScenario("mains_fail_profile"),
    loadScenario("rack_60s_graceful"),
    loadScenario("rack_n_minus_1"),
    loadScenario("aging_lfp"),
    loadScenario("pack_imbalance"),
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
      packImbalance={packImbalance}
      modelValidation={modelValidation}
    />
  );
}
