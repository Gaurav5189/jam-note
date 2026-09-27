// Canonical site origin for SEO routes (sitemap.ts, robots.ts, llms.txt) and
// absolute OpenGraph URLs. Set NEXT_PUBLIC_SITE_URL in production deployments
// (e.g. Amplify build env); the fallback keeps local builds self-consistent.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Central SEO identity. The landing page, metadata routes, and JSON-LD all
// read from here so copy stays in one place.
export const SITE_NAME = "Jam Notes";
export const SITE_TAGLINE = "Write fast. Think in space.";

// Keyword-optimized for the landing's differentiator (spatial canvas + speed):
// primary keywords front-loaded, brand last. Title ≈ 57 chars, description
// ≈ 158 chars — both within SERP truncation limits.
export const LANDING_TITLE =
  "Spatial Note-Taking with an Infinite Canvas — Jam Notes";
export const LANDING_DESCRIPTION =
  "A free, keyboard-first note app for developers: a slash-command block editor, an infinite spatial canvas, and one-click publishing. Write fast, think in space.";

// Identity (Organization schema, author metadata, og:see_also).
export const GITHUB_URL = "https://github.com/Gaurav5189/jam-note";
export const AUTHOR_NAME = "Gaurav5189";
export const AUTHOR_URL = "https://github.com/Gaurav5189";

// Search-engine verification codes (Google Search Console / Bing Webmaster).
// Meta tags render only when the env vars are set — no hardcoded secrets.
export const GSC_VERIFICATION = process.env.NEXT_PUBLIC_GSC_VERIFICATION;
export const BING_VERIFICATION = process.env.NEXT_PUBLIC_BING_VERIFICATION;

// Search keywords for the `keywords` meta tag (minor engines; Google ignores
// it, but it costs nothing and keeps topical signals in one place).
export const SITE_KEYWORDS = [
  "note taking app",
  "spatial notes",
  "infinite canvas notes",
  "visual note taking",
  "spatial canvas",
  "block editor",
  "keyboard-first notes",
  "markdown notes",
  "notion alternative",
  "free notes app",
];
