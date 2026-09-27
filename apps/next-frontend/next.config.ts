import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit .map files for browser chunks in production. Browsers only fetch
  // them when DevTools is open, so runtime perf is unaffected — but
  // Lighthouse's `valid-source-maps` audit passes and production stack
  // traces become debuggable.
  productionBrowserSourceMaps: true,

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/:path*`,
      },
    ];
  },

  async headers() {
    return [
      {
        // The service worker script must always be revalidated so deploys
        // propagate (browsers otherwise pin the worker per HTTP cache
        // semantics, up to 24 hours).
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
