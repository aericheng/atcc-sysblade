import type { Metadata } from "next";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: "Sysblade HyperBuffer — AI 機架混合式 BBU + 電池數位孿生",
  description:
    "LFP + LIC 混合式能量緩衝,內嵌電池數位孿生。為北美 AI 資料中心解決 GB200/GB300 毫秒級電源瞬變。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased min-h-screen">
        <SiteNav />
        <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-10">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 sm:px-6 py-10 text-xs text-muted border-t border-border mt-20">
          <p>
            Sysblade HyperBuffer™ 為 ATCC 第 23 屆競賽概念(議題 C13 · Sysgration)。展示資料由 PyBaMM
            DFN 模擬(Prada2013 LFP)與解析式 Severson 校準老化模型產生。實際部署、客戶標誌與
            效能數字僅供示意。
          </p>
        </footer>
      </body>
    </html>
  );
}
