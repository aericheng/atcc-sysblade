"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";

const links = [
  { href: "/", label: "Home" },
  { href: "/twin", label: "Battery Twin" },
  { href: "/tco", label: "TCO Calculator" },
  { href: "/dashboard", label: "Fleet Dashboard" },
];

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile menu on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 flex items-center gap-4 md:gap-8">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-block h-5 w-5 rounded bg-gradient-to-br from-primary to-accent" />
          <span>Sysblade</span>
          <span className="hidden sm:inline text-muted text-sm font-normal">HyperBuffer</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 text-sm">
          {links.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "px-3 py-1.5 rounded-md transition-colors",
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted hover:text-foreground hover:bg-surface",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted">
          <span className="hidden lg:inline">ATCC C13 · v2.2</span>
          <span className="rounded-full bg-warning/20 text-warning px-2 py-0.5 text-[10px] font-semibold tracking-wider">
            DEMO
          </span>
          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
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
            {links.map((l) => {
              const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={cn(
                      "block px-3 py-3 rounded-md text-sm transition-colors",
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-muted hover:text-foreground hover:bg-surface",
                    )}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </header>
  );
}
