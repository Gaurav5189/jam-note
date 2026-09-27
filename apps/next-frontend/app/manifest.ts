import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_TAGLINE, LANDING_DESCRIPTION } from "@/lib/site";

// PWA manifest (served at /manifest.webmanifest). The site already ships a
// service worker + installable icons in /public — this is the missing piece
// browsers check for install prompts, and it reinforces brand/SEO signals.
// Uses no request-time APIs so it prerenders at build time like robots/sitemap.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — ${SITE_TAGLINE}`,
    short_name: SITE_NAME,
    description: LANDING_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#f3efe6",
    theme_color: "#f3efe6",
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
