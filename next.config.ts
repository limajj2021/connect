import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Every route here is a per-request authenticated page (auth check + owner-scoped
  // data), so there is nothing worth statically prerendering — disable Cache
  // Components instead of threading Suspense boundaries through pages that are
  // dynamic by design.
  experimental: {
    // Keep visited pages in the browser's client cache for a minute so moving
    // back and forth between 人脈 / 紀錄 / 提醒 / 設定 doesn't re-run their
    // Supabase queries each time. Every mutation goes through a server action
    // that calls revalidatePath(), which purges this cache immediately, so
    // edits still show up right away.
    staleTimes: {
      dynamic: 60,
    },
    serverActions: {
      // LINE chat exports (F05) can run several MB for long-running conversations.
      bodySizeLimit: "15mb",
    },
  },
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
