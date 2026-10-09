import type { Metadata } from "next";
import "./globals.css";
import { SiteChrome } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: "Sysblade HyperBuffer — AI 機架混合式 BBU + 電池數位孿生",
  description:
    "LFP + LIC 混合式能量緩衝,內嵌電池數位孿生。針對北美 AI 資料中心 GB200/GB300 機櫃功率擺盪與斷電峰值的電容分流設計（模擬）。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased min-h-screen">
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
