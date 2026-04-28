/** @type {import('next').NextConfig} */
//
// This app deploys as a fully static site (Next.js `output: "export"`).
// Both Vercel (current production) and GitHub Pages can serve the `out/`
// directory directly with no Node runtime in front.
//
// Implications:
// 1. Server Components in twin/page.tsx, dashboard/page.tsx use `fs.readFile`
//    to load scenario JSONs. With `output: "export"` these run AT BUILD TIME
//    only — never at request time. If you add `"use client"` to a page that
//    reads files, build will fail silently or the file content will be empty.
//    Keep file I/O in `page.tsx` (server) and pass results to a sibling
//    `*-client.tsx` (client).
// 2. No API routes, no middleware, no `revalidate` / ISR. Anything that needs
//    server runtime would require switching to `output: "standalone"` and
//    redeploying with a Node server.
// 3. Image optimisation needs a server, so it's disabled below.
//
// PAGES_BASE_PATH is set by the GitHub Pages workflow only. In local dev and
// on Vercel it's undefined, so basePath is empty and routes serve from "/".
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig = {
  output: "export",
  basePath,
  images: { unoptimized: true },
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
