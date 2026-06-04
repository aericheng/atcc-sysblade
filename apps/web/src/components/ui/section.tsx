import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Bold-redesign layout primitives. Pure presentational (no hooks / no
 * "use client"), so they compose inside both Server Components (page.tsx) and
 * Client Components (the *-client.tsx pages). They give every page a shared
 * visual grammar — coloured kicker + accent rule + large gradient heading,
 * and a magazine-style alternating feature row — so the site stops reading as
 * one uniform dark stack.
 */

export type Accent = "primary" | "accent" | "success" | "warning" | "danger";

const ACCENT_TEXT: Record<Accent, string> = {
  primary: "text-primary",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};
const ACCENT_BG: Record<Accent, string> = {
  primary: "bg-primary",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/** Coloured kicker + accent rule + large heading + optional intro paragraph. */
export function SectionHeader({
  kicker,
  title,
  intro,
  icon,
  accent = "primary",
  align = "left",
  className = "",
}: {
  kicker?: string;
  title: ReactNode;
  intro?: ReactNode;
  icon?: ReactNode;
  accent?: Accent;
  align?: "left" | "center";
  className?: string;
}) {
  const centered = align === "center";
  return (
    <div className={`${centered ? "text-center mx-auto" : ""} max-w-3xl ${className}`}>
      {kicker && (
        <div
          className={`inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] ${ACCENT_TEXT[accent]} ${centered ? "justify-center" : ""}`}
        >
          {icon}
          {kicker}
        </div>
      )}
      <div className={`accent-rule ${ACCENT_BG[accent]} mt-3 mb-4 ${centered ? "mx-auto" : ""}`} />
      <h2 className="text-3xl sm:text-4xl md:text-[2.75rem] font-semibold tracking-tight leading-[1.12] text-balance">
        {title}
      </h2>
      {intro && (
        <p className="mt-4 text-muted leading-relaxed text-base sm:text-lg">{intro}</p>
      )}
    </div>
  );
}

/**
 * Magazine-style alternating feature row: copy on one side, a visual panel on
 * the other. `flip` swaps sides on desktop so successive rows zig-zag.
 */
export function FeatureRow({
  index,
  icon,
  title,
  body,
  cta,
  href,
  accent = "primary",
  visual,
  flip = false,
}: {
  index?: string;
  icon?: ReactNode;
  title: ReactNode;
  body: ReactNode;
  cta?: string;
  href?: string;
  accent?: Accent;
  visual?: ReactNode;
  flip?: boolean;
}) {
  const copy = (
    <div className="flex-1 space-y-4">
      {(index || icon) && (
        <div className="flex items-center gap-3">
          {index && (
            <span className={`font-mono text-sm tracking-widest ${ACCENT_TEXT[accent]}`}>{index}</span>
          )}
          {icon && <span className={ACCENT_TEXT[accent]}>{icon}</span>}
        </div>
      )}
      <h3 className="text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h3>
      <div className="text-muted leading-relaxed max-w-xl">{body}</div>
      {cta && href && (
        <Link
          href={href}
          className={`group inline-flex items-center gap-1.5 text-sm font-medium ${ACCENT_TEXT[accent]}`}
        >
          {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
  return (
    <div
      className={`flex flex-col gap-6 md:gap-12 md:items-center ${flip ? "md:flex-row-reverse" : "md:flex-row"}`}
    >
      {copy}
      {visual && <div className="w-full flex-1">{visual}</div>}
    </div>
  );
}
