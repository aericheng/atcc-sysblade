import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Noto_Sans_TC } from "next/font/google";
import { HomeClient } from "@/components/home/home-client";

// Self-hosted at build time by next/font: the page makes no request to Google at runtime.
// adjustFontFallback: false keeps the prototype's fallback chain (Inter -> Noto Sans TC, JetBrains Mono -> Consolas):
// glyphs Google's subsets lack (e.g. U+2192 →) must not fall into a size-adjusted Arial.
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
// CJK: Google serves ~100 unicode-range slices per weight; preload none, the browser fetches the slices it needs.
const notoTC = Noto_Sans_TC({
  weight: ["400", "500", "700", "900"],
  variable: "--hf-zh",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Sysblade HyperBuffer",
  description: "AI 機房備援電源：LFP 電池＋LIC 電容混合儲能，搭配數位孿生預測壽命。",
};

export default function HomePage() {
  return (
    <HomeClient
      fontClassName={`${inter.variable} ${mono.variable} ${notoTC.variable}`}
      monoFamily={mono.style.fontFamily}
      zhFamily={notoTC.style.fontFamily}
    />
  );
}
