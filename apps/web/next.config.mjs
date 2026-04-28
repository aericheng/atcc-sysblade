/** @type {import('next').NextConfig} */
// Static export for GitHub Pages.
//
// PAGES_BASE_PATH is exported by the deploy workflow ("/atcc-sysblade").
// In local dev it's undefined, so basePath is empty and everything works
// from "/".
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig = {
  output: "export",
  basePath,
  // GitHub Pages serves only static files — Next.js image optimisation needs
  // a server, so we disable it.
  images: { unoptimized: true },
  // Pages 404 on no-trailing-slash routes; this matches both Pages and Vercel.
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
