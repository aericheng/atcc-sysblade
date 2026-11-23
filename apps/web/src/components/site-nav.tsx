"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { langOf, switchPath } from "@/lib/i18n";

const links = [
  { href: "/", zh: "首頁", en: "Home" },
  { href: "/tour", zh: "導覽", en: "Tour" },
  { href: "/twin", zh: "電池數位孿生", en: "Digital twin" },
  // /tco is hidden from the nav (page and URL kept) — 2026-10 decision.
  { href: "/dashboard", zh: "機隊儀表板", en: "Fleet dashboard" },
];

export function SiteNav() {
  const pathname = usePathname() ?? "/";
  const lang = langOf(pathname);
  const en = lang === "en";
  // Path without the /en prefix, for the active-link test.
  const bare = pathname.replace(/^\/en(?=\/|$)/, "") || "/";
  const [open, setOpen] = useState(false);

  // Close the mobile menu on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) => (href === "/" ? bare === "/" : bare.startsWith(href));
  const to = (href: string) => (en ? switchPath(href, "en") : href);
  const other = switchPath(pathname, en ? "zh" : "en");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 flex items-center gap-4 md:gap-8">
        <Link href={to("/")} className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-block h-5 w-5 rounded bg-gradient-to-br from-primary to-accent" />
          <span>Sysblade</span>
          <span className="hidden sm:inline text-muted text-sm font-normal">HyperBuffer</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={to(l.href)}
              className={cn(
                "px-3 py-1.5 rounded-md transition-colors whitespace-nowrap",
                isActive(l.href)
                  ? "bg-primary/15 text-primary"
                  : "text-muted hover:text-foreground hover:bg-surface",
              )}
            >
              {en ? l.en : l.zh}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted">
          <span className="hidden lg:inline">ATCC C13 · v2.2</span>
          <span className="rounded-full bg-warning/20 text-warning px-2 py-0.5 text-[10px] font-semibold tracking-wider">
            {en ? "DEMO" : "展示"}
          </span>
          <Link
            href={other}
            hrefLang={en ? "zh-Hant" : "en"}
            lang={en ? "zh-Hant" : "en"}
            className="inline-flex items-center h-7 rounded-md border border-border px-2 text-[11px] font-semibold text-foreground hover:bg-surface"
          >
            {en ? "中文" : "EN"}
          </Link>
          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label={open ? (en ? "Close menu" : "關閉選單") : en ? "Open menu" : "開啟選單"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-md border border-border bg-surface/60 text-foreground"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown nav */}
      {open && (
        <nav className="md:hidden border-t border-border bg-background/95 backdrop-blur-xl">
          <ul className="mx-auto max-w-7xl px-4 py-2 flex flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={to(l.href)}
                  className={cn(
                    "block px-3 py-3 rounded-md text-sm transition-colors",
                    isActive(l.href)
                      ? "bg-primary/15 text-primary"
                      : "text-muted hover:text-foreground hover:bg-surface",
                  )}
                >
                  {en ? l.en : l.zh}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
