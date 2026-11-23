"use client";
import { usePathname } from "next/navigation";

/**
 * Page language. "/" and the app pages (/twin, /dashboard, /tour, /tco) are zh; the same pages under
 * "/en/" are en. The language is read from the URL, so client components need no prop threading:
 * call useT() and pick each string with t(zh, en). Static export pre-renders each route with its own
 * pathname, so the English HTML is English before any JS runs.
 *
 * Only display text goes through t(). Logic tokens (DeviceStatus values, mode keys, JSON keys) stay
 * as they are in both languages.
 */
export type Lang = "zh" | "en";

export function langOf(pathname: string | null | undefined): Lang {
  return pathname && /^\/en(\/|$)/.test(pathname) ? "en" : "zh";
}

/** The other language's URL for the same page ("/twin/" <-> "/en/twin/"). */
export function switchPath(pathname: string, to: Lang): string {
  const bare = pathname.replace(/^\/en(?=\/|$)/, "") || "/";
  const withSlash = bare.endsWith("/") ? bare : bare + "/";
  return to === "en" ? (withSlash === "/" ? "/en/" : "/en" + withSlash) : withSlash;
}

export function useLang(): Lang {
  return langOf(usePathname());
}

export function useT() {
  const lang = useLang();
  return {
    lang,
    /** Pick the string (or node) for the current language. */
    t: <T>(zh: T, en: T): T => (lang === "en" ? en : zh),
    /** Prefix an in-site path with /en/ on English pages ("/twin" -> "/en/twin/"). */
    href: (path: string): string => (lang === "en" ? switchPath(path, "en") : path),
    /** Locale for toLocaleString / Intl. */
    locale: lang === "en" ? "en-US" : "zh-TW",
  };
}
