import type { Config } from "tailwindcss";

/**
 * The theme tokens are hex / rgba CSS variables. Tailwind cannot inject an
 * alpha channel into a bare `var(--x)` color, so `/opacity` modifiers
 * (bg-surface/80, bg-primary/15, …) used to silently compile to *nothing* —
 * leaving every translucent surface transparent (a big reason the UI read as
 * flat). Wrapping each token in `color-mix(... <alpha-value> ...)` makes the
 * `<alpha-value>` placeholder resolve to the modifier (defaulting to 1, i.e.
 * the full colour, when no modifier is given), so all opacity utilities now
 * work site-wide while the raw `var(--x)` usages elsewhere stay intact.
 */
const alpha = (v: string) =>
  `color-mix(in srgb, var(${v}) calc(<alpha-value> * 100%), transparent)`;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: alpha("--background"),
        foreground: alpha("--foreground"),
        surface: alpha("--surface"),
        border: alpha("--border"),
        muted: alpha("--muted"),
        primary: {
          DEFAULT: alpha("--primary"),
          foreground: alpha("--primary-foreground"),
        },
        accent: {
          DEFAULT: alpha("--accent"),
          foreground: alpha("--accent-foreground"),
        },
        success: alpha("--success"),
        warning: alpha("--warning"),
        danger: alpha("--danger"),
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular"],
      },
    },
  },
  plugins: [],
};
export default config;
