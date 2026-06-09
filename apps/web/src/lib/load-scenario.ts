/**
 * Build-time scenario loader, shared by the Server Components in
 * `app/<route>/page.tsx`. `next.config.mjs` sets `output: "export"`, so this
 * runs during `next build` and never in the browser. Node imports are kept
 * dynamic and this module must NOT be imported into a `"use client"` file —
 * keep file I/O in `page.tsx`, interactive logic in the sibling `*-client.tsx`.
 */
export async function loadScenario(name: string) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const file = path.join(process.cwd(), "public", "scenarios", `${name}.json`);
  return JSON.parse(await fs.readFile(file, "utf-8"));
}
