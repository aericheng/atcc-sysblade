import { TourClient } from "./tour-client";
import { loadScenario } from "@/lib/load-scenario";

export const metadata = {
  title: "導覽 · Sysblade HyperBuffer",
  description:
    "Sysblade HyperBuffer 的 10 段式捲動敘事導覽 — LFP+LIC 混合拓樸、V1-V6 孿生驗證鏈、RUL 預測,以及客戶 TCO。請按播放或捲動。",
};

export default async function TourPage() {
  const [rackGraceful, rackNMinus1] = await Promise.all([
    loadScenario("rack_60s_graceful"),
    loadScenario("rack_n_minus_1"),
  ]);
  return <TourClient rackGraceful={rackGraceful} rackNMinus1={rackNMinus1} />;
}
