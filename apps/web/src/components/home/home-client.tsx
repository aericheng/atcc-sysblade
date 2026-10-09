"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HOME_HTML } from "./home-markup";
import { initHome } from "./home-runtime";
import "./home.css";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const MARKUP = HOME_HTML.split("{{BASE}}").join(BASE);

/**
 * Scroll-story home page. The markup is the approved prototype's HTML (static, rendered at build
 * time so the page reads fine without JS); all behaviour lives in home-runtime.js, which reads the
 * scenario JSONs from /scenarios/ and returns a dispose() that releases every listener, rAF loop,
 * observer and ScrollTrigger when the page unmounts (client-side navigation, dev StrictMode).
 */
export function HomeClient({
  fontClassName,
  monoFamily,
  zhFamily,
}: {
  fontClassName: string;
  monoFamily: string;
  zhFamily: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    gsap.registerPlugin(ScrollTrigger);
    const dispose = initHome(el, { gsap, ScrollTrigger, base: BASE, fonts: { mono: monoFamily, zh: zhFamily } });
    return () => {
      dispose();
      // StrictMode re-mount: hand the next init a pristine DOM (no stale element listeners / built SVG).
      el.className = `sb-home ${fontClassName}`;
      el.removeAttribute("style");
      el.innerHTML = MARKUP;
    };
  }, [fontClassName, monoFamily, zhFamily]);

  return (
    <div
      ref={ref}
      className={`sb-home ${fontClassName}`}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: MARKUP }}
    />
  );
}
