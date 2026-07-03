import type { ReactNode } from "react";
import { Disclosure } from "@/components/ui/disclosure";
import { glossaryEntries, type GlossaryKey } from "@/lib/glossary";

/* Plain-language ("白話") guide layer primitives.
 *
 * Deliberately no "use client" and no hooks — like ui/section.tsx these render
 * in both Server Components (page.tsx) and client components. GlossaryPanel
 * composes the client Disclosure (native <details>, no-JS-safe), the same
 * pattern app/page.tsx already uses.
 *
 * These components only ever ADD an explanatory layer next to technical copy;
 * they never replace it. Copy lives in lib/glossary.ts or at the call site. */

/** Visible section-level plain-language callout. Never hidden behind JS. */
export function PlainNote({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border tint-accent px-4 py-3 text-sm leading-relaxed text-foreground/90 ${className}`}
    >
      <span className="mr-2 inline-flex translate-y-[-1px] items-center rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-px text-[10px] font-semibold tracking-wider text-accent">
        白話
      </span>
      {children}
    </div>
  );
}

/** Lighter one-line variant for dense contexts (tour slides, card headers). */
export function PlainInline({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-sm text-accent leading-relaxed ${className}`}>
      <span className="font-semibold">白話 · </span>
      {children}
    </p>
  );
}

/** Per-page glossary, collapsed by default via native <details> (no-JS safe).
 *  Pass only the term keys relevant to the current page. */
export function GlossaryPanel({
  termKeys,
  className = "",
}: {
  termKeys: GlossaryKey[];
  className?: string;
}) {
  const entries = glossaryEntries(termKeys);
  return (
    <div
      className={`rounded-lg border border-border bg-surface/40 px-4 py-3 ${className}`}
    >
      <Disclosure
        summary={`名詞解釋 · 這一頁的 ${entries.length} 個關鍵詞，用白話說`}
      >
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-2">
          {entries.map((e) => (
            <div key={e.key}>
              <dt className="text-foreground font-medium">{e.term}</dt>
              <dd className="mt-0.5 leading-relaxed">
                {e.plain}
                {e.analogy && (
                  <span className="block mt-0.5 opacity-80">
                    打個比方：{e.analogy}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </Disclosure>
    </div>
  );
}
