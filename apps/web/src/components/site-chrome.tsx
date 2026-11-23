"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { langOf } from "@/lib/i18n";

/**
 * Shared header / container / footer for the app pages (/twin, /dashboard, /tour, /tco, and their
 * English versions under /en/). The home page ("/", and its English version "/en/") is a full-bleed
 * scroll story with its own nav and footer, so it renders bare.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const en = langOf(pathname) === "en";

  // The root layout is shared and declares zh-Hant; English pages override it while mounted.
  useEffect(() => {
    if (!en) return;
    const html = document.documentElement;
    const prev = html.lang;
    html.lang = "en";
    return () => {
      html.lang = prev;
    };
  }, [en]);

  if (pathname === "/" || pathname === "/en" || pathname === "/en/") return <>{children}</>;
  return (
    <>
      <SiteNav />
      <main lang={en ? "en" : undefined} className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-10">
        {children}
      </main>
      <footer
        lang={en ? "en" : undefined}
        className="mx-auto max-w-7xl px-4 sm:px-6 py-10 text-xs text-muted border-t border-border mt-20"
      >
        {en ? (
          <p>
            Sysblade HyperBuffer™ is a concept for the 23rd ATCC competition (topic C13 · Sysgration). Demo data
            comes from PyBaMM DFN simulation (Prada2013 LFP) and an analytic aging model calibrated to Severson.
            Deployments and customer logos are illustrative only; physics and fleet numbers are simulated or
            estimated (with re-runnable scripts); ML metrics are computed on the public Severson 2019 measured
            data and synthetic duty cycles.
          </p>
        ) : (
          <p>
            Sysblade HyperBuffer™ 為 ATCC 第 23 屆競賽概念(議題 C13 · Sysgration)。展示資料由 PyBaMM
            DFN 模擬(Prada2013 LFP)與解析式 Severson 校準老化模型產生。實際部署與客戶標誌僅供示意;
            物理與機隊數字為模擬或試算(附可重跑腳本);ML 指標以公開 Severson 2019 實測資料與合成工況計算。
          </p>
        )}
      </footer>
    </>
  );
}
