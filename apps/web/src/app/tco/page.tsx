import { TcoClient } from "./tco-client";

export const metadata = {
  title: "TCO 計算器 · Sysblade",
  description:
    "從傳統 NMC BBU 切換至 Sysblade HyperBuffer 的 10 年總持有成本與 CO₂ 排放節省。",
};

export default function TcoPage() {
  return <TcoClient />;
}
