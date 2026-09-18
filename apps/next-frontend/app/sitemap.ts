import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Public URLs only. Authenticated routes (/dashboard, /notes/*) are
// user-scoped and carry no SEO value; Phase 6 will append published-note
// URLs (pub/{username}/{slug}) here.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
