import { TourClient } from "./tour-client";
import { loadScenario } from "@/lib/load-scenario";

export const metadata = {
  title: "導覽 · Sysblade HyperBuffer",
  description:
    "Sysblade HyperBuffer 的捲動敘事導覽 — LFP+LIC 混合拓樸、孿生驗證鏈(模擬)、RUL 預測與老化後備援續航。請按播放或捲動。",
};

export default async function TourPage() {
  const [rackGraceful, rackNMinus1] = await Promise.all([
    loadScenario("rack_60s_graceful"),
    loadScenario("rack_n_minus_1"),
  ]);
  return <TourClient rackGraceful={rackGraceful} rackNMinus1={rackNMinus1} />;
}
