import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * FastAPI route prefixes proxied by Next.js.
 *
 * This list is explicit rather than a catch-all `/api/:path*` on purpose:
 * rewrites are evaluated before *dynamic* routes, so a catch-all would
 * shadow `app/api/auth/[...all]/route.ts` and send BetterAuth traffic to
 * FastAPI. `/api/auth/*` is therefore deliberately absent — it is served
 * by the BetterAuth route handler, while every other `/api/*` request
 * still reaches FastAPI.
 *
 * Add a prefix here when FastAPI gains a new top-level router.
 */
const FASTAPI_PREFIXES = [
  "/api/account",
  "/api/folders",
  "/api/import",
  "/api/notes",
  "/api/search",
  "/api/workspace",
];

const nextConfig: NextConfig = {
  // Emit .map files for browser chunks in production. Browsers only fetch
  // them when DevTools is open, so runtime perf is unaffected — but
  // Lighthouse's `valid-source-maps` audit passes and production stack
  // traces become debuggable.
  productionBrowserSourceMaps: true,

  async rewrites() {
    return FASTAPI_PREFIXES.map((prefix) => ({
      // `:path*` matches zero or more segments, so both `/api/search`
      // and `/api/notes/<id>` are covered.
      source: `${prefix}/:path*`,
      destination: `${API_URL}${prefix}/:path*`,
    }));
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
