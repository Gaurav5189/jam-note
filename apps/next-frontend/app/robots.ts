import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pub/"],
        // Protected/user-scoped surfaces carry no SEO value and must never be
        // crawled: the API proxy path, the workspace, and the utility pages
        // (auth screens and the offline fallback are thin/noindex pages).
        disallow: [
          "/api/",
          "/dashboard",
          "/notes/",
          "/profile",
          "/login",
          "/signup",
          "/offline",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
