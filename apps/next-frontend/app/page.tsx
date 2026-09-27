import type { Metadata, Viewport } from "next";
import { Archivo, Newsreader, Space_Mono } from "next/font/google";
import "./landing.css";
import { LandingChrome } from "@/components/landing/landing-chrome";
import { LandingHeader } from "@/components/landing/landing-header";
import { HeroSection } from "@/components/landing/hero-section";
import { LandingModesSpecimen } from "@/components/landing/landing-modes-specimen";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { PricingSection } from "@/components/landing/pricing-section";
import { LandingFooter } from "@/components/landing/landing-footer";
import { SITE_URL, SITE_NAME, LANDING_TITLE, LANDING_DESCRIPTION, GITHUB_URL, AUTHOR_NAME, AUTHOR_URL } from "@/lib/site";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"], display: "block" });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"], display: "block" });
const spaceMono = Space_Mono({ variable: "--font-space-mono", subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], display: "block" });
const TITLE = LANDING_TITLE;
const DESCRIPTION = LANDING_DESCRIPTION;

export const metadata: Metadata = { title: TITLE, description: DESCRIPTION, alternates: { canonical: "/" }, openGraph: { type: "website", url: SITE_URL, siteName: SITE_NAME, title: TITLE, description: DESCRIPTION }, twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION } };
export const viewport: Viewport = { themeColor: "#f3efe6" };

// Linked-data graph for the landing: site → organization → product. The
// `@id` references let engines merge these with future per-route entities
// (e.g. published posts under /pub/*) into one knowledge graph.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/android-chrome-512x512.png`,
      founder: { "@type": "Person", name: AUTHOR_NAME, url: AUTHOR_URL },
      sameAs: [GITHUB_URL],
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: SITE_NAME,
      url: SITE_URL,
      description: DESCRIPTION,
      applicationCategory: "ProductivityApplication",
      operatingSystem: "Any",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      featureList: ["Block editor with slash commands", "Spatial Jam Canvas", "Crash-safe autosave", "Command palette search", "Folder & note workspace tree", "One-click self-publishing", "Markdown export & import"],
      author: { "@id": `${SITE_URL}/#organization` },
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export default function LandingPage() { return <div className={`landing ${archivo.variable} ${newsreader.variable} ${spaceMono.variable}`}><LandingChrome /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} /><LandingHeader /><main><HeroSection /><LandingModesSpecimen /><FeatureGrid /><PricingSection /></main><LandingFooter /></div>; }
