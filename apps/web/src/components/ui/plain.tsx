"use client";

import type { ReactNode } from "react";
import { Disclosure } from "@/components/ui/disclosure";
import { glossaryEntries, type GlossaryKey } from "@/lib/glossary";
import { useT } from "@/lib/i18n";

/* Plain-language guide primitives.
 *
 * Client module (GlossaryPanel picks its language via useT()); PlainInline is
 * still presentational and both can be rendered from Server Components. GlossaryPanel
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
  const { t } = useT();
  const entries = glossaryEntries(termKeys);
  return (
    <div
      className={`rounded-lg border border-border bg-surface/40 px-4 py-3 ${className}`}
    >
      <Disclosure summary={t(
          `名詞解釋 · 本頁 ${entries.length} 個關鍵術語`,
          `Glossary · ${entries.length} key terms on this page`,
        )}>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-2">
          {entries.map((e) => (
            <div key={e.key}>
              <dt className="text-foreground font-medium">{t(e.term, e.termEn)}</dt>
              <dd className="mt-0.5 leading-relaxed">
                {t(e.plain, e.plainEn)}
                {e.analogy && (
                  <span className="block mt-0.5 opacity-80">
                    {t("類比：", "Analogy: ")}
                    {t(e.analogy, e.analogyEn ?? e.analogy)}
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
