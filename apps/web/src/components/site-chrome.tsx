"use client";
import { usePathname } from "next/navigation";
import { SiteNav } from "@/components/site-nav";

/**
 * Shared header / container / footer for the app pages (/twin, /dashboard, /tour, /tco).
 * The home page ("/") is a full-bleed scroll story with its own nav and footer, so it renders bare.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") return <>{children}</>;
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-10">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 sm:px-6 py-10 text-xs text-muted border-t border-border mt-20">
        <p>
          Sysblade HyperBuffer™ 為 ATCC 第 23 屆競賽概念(議題 C13 · Sysgration)。展示資料由 PyBaMM
          DFN 模擬(Prada2013 LFP)與解析式 Severson 校準老化模型產生。實際部署與客戶標誌僅供示意;
          物理與機隊數字為模擬或試算(附可重跑腳本);ML 指標以公開 Severson 2019 實測資料與合成工況計算。
        </p>
      </footer>
    </>
  );
}
