"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const links = [
  { href: "/", label: "Home" },
  { href: "/twin", label: "Battery Twin" },
  { href: "/tco", label: "TCO Calculator" },
  { href: "/dashboard", label: "Fleet Dashboard" },
];

export function SiteNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6 h-14 flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="inline-block h-5 w-5 rounded bg-gradient-to-br from-primary to-accent" />
          <span>Sysblade</span>
          <span className="text-muted text-sm font-normal">HyperBuffer</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
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
          <span className="hidden sm:inline">ATCC C13 · v2.1</span>
          <span className="rounded-full bg-warning/20 text-warning px-2 py-0.5 text-[10px] font-semibold tracking-wider">
            DEMO
          </span>
        </div>
      </div>
    </header>
  );
}
