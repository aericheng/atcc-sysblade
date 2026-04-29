import type { Metadata } from "next";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: "Sysblade HyperBuffer — AI-rack hybrid BBU + Digital Twin",
  description:
    "LFP + LIC hybrid energy buffer with embedded battery digital twin. Solving GB200/GB300 millisecond-scale power transients for North-American AI data centers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <SiteNav />
        <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-10">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 sm:px-6 py-10 text-xs text-muted border-t border-border mt-20">
          <p>
            Sysblade HyperBuffer™ is an ATCC 23rd-edition competition concept (議題 C13 · Sysgration). Demo data is generated from PyBaMM
            DFN simulation (Prada2013 LFP) and analytic Severson-calibrated aging models. Production deployment, customer logos, and
            performance numbers are illustrative.
          </p>
        </footer>
      </body>
    </html>
  );
}
