import TwinPage from "@/app/twin/page";

// Same page as /twin (same build-time scenario reads); the client picks English copy from the /en/ URL.
export const metadata = {
  title: "Battery digital twin · Sysblade",
  description:
    "PyBaMM DFN simulation of an LFP cell under GB200 rack power swings and outage peaks, with and without the hybrid LIC buffer.",
};

export default TwinPage;
