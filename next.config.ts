import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Every route here is a per-request authenticated page (auth check + owner-scoped
  // data), so there is nothing worth statically prerendering — disable Cache
  // Components instead of threading Suspense boundaries through pages that are
  // dynamic by design.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
