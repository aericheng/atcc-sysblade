import type { ReactNode } from "react";
import { Disclosure } from "@/components/ui/disclosure";
import { glossaryEntries, type GlossaryKey } from "@/lib/glossary";

/* Plain-language guide primitives.
 *
 * Deliberately no "use client" and no hooks — like ui/section.tsx these render
 * in both Server Components (page.tsx) and client components. GlossaryPanel
 * composes the client Disclosure (native <details>, no-JS-safe), the same
 * pattern app/page.tsx already uses.
 *
 * Single-track copy: the accessible explanation IS the primary description
 * (professional register, technical anchors kept inline); there is no parallel
 * "白話" badge layer. Term definitions live in lib/glossary.ts. */

/** Accent-colored lead-in sentence for card headers / chart tops / slides. */
export function PlainInline({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-sm text-accent leading-relaxed ${className}`}>
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
      <Disclosure summary={`名詞解釋 · 本頁 ${entries.length} 個關鍵術語`}>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-2">
          {entries.map((e) => (
            <div key={e.key}>
              <dt className="text-foreground font-medium">{e.term}</dt>
              <dd className="mt-0.5 leading-relaxed">
                {e.plain}
                {e.analogy && (
                  <span className="block mt-0.5 opacity-80">
                    類比：{e.analogy}
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
