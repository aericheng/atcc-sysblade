import DashboardPage from "@/app/dashboard/page";

// Same page as /dashboard (same build-time scenario reads); the client picks English copy from the /en/ URL.
export const metadata = {
  title: "Fleet dashboard · Sysblade",
  description:
    "A synthetic Sysblade fleet of 1000 devices: monitoring, proactive maintenance and predictive operations. Simulated data.",
};

export default DashboardPage;
