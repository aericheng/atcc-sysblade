import { TcoClient } from "./tco-client";

export const metadata = {
  title: "TCO Calculator · Sysblade",
  description:
    "10-year total cost of ownership and CO₂ savings for switching from a traditional NMC BBU to Sysblade HyperBuffer.",
};

export default function TcoPage() {
  return <TcoClient />;
}
