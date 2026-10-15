import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Noto_Sans_TC } from "next/font/google";
import { HomeClient } from "@/components/home/home-client";

// Same font setup as app/page.tsx (self-hosted by next/font at build time; see the notes there).
// Noto Sans TC stays loaded: the language switch reads "中文", and the canvas labels share FONT.zh.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--hf-inter",
  display: "swap",
  adjustFontFallback: false,
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--hf-mono",
  display: "swap",
  adjustFontFallback: false,
});
const notoTC = Noto_Sans_TC({
  weight: ["400", "500", "700", "900"],
  variable: "--hf-zh",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Sysblade HyperBuffer",
  description:
    "Backup power for AI data centers: hybrid LFP battery + LIC (lithium-ion capacitor) storage, with a digital twin that predicts remaining useful life. Simulated results.",
};

export default function HomePageEn() {
  return (
    <HomeClient
      lang="en"
      fontClassName={`${inter.variable} ${mono.variable} ${notoTC.variable}`}
      monoFamily={mono.style.fontFamily}
      zhFamily={notoTC.style.fontFamily}
    />
  );
}
