import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  // NOTE: cacheComponents/partialPrefetching intentionally OFF — they make
  // `export const dynamic = "force-dynamic"` a hard runtime 500 on routes,
  // and this app is auth-gated/dynamic everywhere anyway.
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
