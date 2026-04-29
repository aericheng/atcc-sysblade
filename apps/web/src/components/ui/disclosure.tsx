"use client";

import type React from "react";

/** Native <details>/<summary> dressed up to match the rest of the page so
 *  long methodology paragraphs can collapse by default and the headline
 *  numbers stay readable without scroll-fatigue. Pure HTML, no JS — toggling
 *  is browser-native, accessible, and keyboard-friendly out of the box. */
export function Disclosure({
  summary,
  defaultOpen = false,
  children,
  className = "",
}: {
  summary: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details open={defaultOpen} className={`group ${className}`.trim()}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground select-none">
        <svg
          className="h-2.5 w-2.5 transition-transform group-open:rotate-90 shrink-0"
          viewBox="0 0 8 8"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M2 1 L6 4 L2 7 Z" />
        </svg>
        <span>{summary}</span>
      </summary>
      <div className="mt-2 text-xs text-muted leading-relaxed">{children}</div>
    </details>
  );
}
