// Canonical site origin for SEO routes (sitemap.ts, robots.ts) and absolute
// OpenGraph URLs. Set NEXT_PUBLIC_SITE_URL in production deployments; the
// fallback keeps local builds self-consistent.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
