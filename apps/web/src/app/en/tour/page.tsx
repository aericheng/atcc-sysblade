import TourPage from "@/app/tour/page";

// Same page as /tour (same build-time scenario reads); the client picks English copy from the /en/ URL.
export const metadata = {
  title: "Tour · Sysblade HyperBuffer",
  description:
    "A scroll-driven tour of Sysblade HyperBuffer: the LFP + LIC hybrid topology, the twin verification chain (simulated), RUL prediction and backup runtime after aging. Press play or scroll.",
};

export default TourPage;
