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
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
