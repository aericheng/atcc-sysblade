"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HOME_HTML } from "./home-markup";
import { HOME_HTML_EN } from "./home-markup-en";
import { initHome } from "./home-runtime";
import "./home.css";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const MARKUP = {
  zh: HOME_HTML.split("{{BASE}}").join(BASE),
  en: HOME_HTML_EN.split("{{BASE}}").join(BASE),
};

/**
 * Scroll-story home page. The markup is the approved prototype's HTML (static, rendered at build
 * time so the page reads fine without JS); all behaviour lives in home-runtime.js, which reads the
 * scenario JSONs from /scenarios/ and returns a dispose() that releases every listener, rAF loop,
 * observer and ScrollTrigger when the page unmounts (client-side navigation, dev StrictMode).
 * lang picks the markup and the runtime's UI copy ("/" is zh, "/en/" is en).
 */
export function HomeClient({
  fontClassName,
  monoFamily,
  zhFamily,
  lang = "zh",
}: {
  fontClassName: string;
  monoFamily: string;
  zhFamily: string;
  lang?: "zh" | "en";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const markup = MARKUP[lang];
  const rootClass = `sb-home${lang === "en" ? " sb-en" : ""} ${fontClassName}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The root layout is shared and declares zh-Hant; the English page overrides it while mounted.
    const html = document.documentElement;
    const prevLang = html.lang;
    html.lang = lang === "en" ? "en" : "zh-Hant";
    gsap.registerPlugin(ScrollTrigger);
    const dispose = initHome(el, { gsap, ScrollTrigger, base: BASE, fonts: { mono: monoFamily, zh: zhFamily }, lang });
    return () => {
      dispose();
      html.lang = prevLang;
      // StrictMode re-mount: hand the next init a pristine DOM (no stale element listeners / built SVG).
      el.className = rootClass;
      el.removeAttribute("style");
      el.innerHTML = markup;
    };
  }, [rootClass, markup, monoFamily, zhFamily, lang]);

  return (
    <div
      ref={ref}
      className={rootClass}
      lang={lang === "en" ? "en" : undefined}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
