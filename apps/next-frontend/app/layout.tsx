import type { Metadata, Viewport } from "next";
import "./globals.css";
import {
  SITE_URL,
  SITE_NAME,
  LANDING_DESCRIPTION,
  SITE_KEYWORDS,
  AUTHOR_NAME,
  AUTHOR_URL,
  GSC_VERIFICATION,
  BING_VERIFICATION,
} from "@/lib/site";
import { ServiceWorkerRegister } from "@/components/sw-register";

// Verification meta tags render only for the engines that were configured
// (building the object conditionally avoids emitting content="undefined").
const verification: Metadata["verification"] = {};
if (GSC_VERIFICATION) verification.google = GSC_VERIFICATION;
if (BING_VERIFICATION) verification.other = { "msvalidate.01": BING_VERIFICATION };

export const metadata: Metadata = {
  // Resolves relative metadata URLs (canonical, OG image) for every route.
  metadataBase: new URL(SITE_URL),
  title: `${SITE_NAME} — Write Fast, Think in Space`,
  description: LANDING_DESCRIPTION,
  applicationName: SITE_NAME,
  category: "productivity",
  keywords: SITE_KEYWORDS,
  authors: [{ name: AUTHOR_NAME, url: AUTHOR_URL }],
  creator: AUTHOR_NAME,
  publisher: AUTHOR_NAME,
  ...(Object.keys(verification).length > 0 ? { verification } : {}),
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
