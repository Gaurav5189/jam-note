import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { LandingHeader } from "@/components/landing/landing-header";
import { HeroSection } from "@/components/landing/hero-section";
import { FeatureShowcase } from "@/components/landing/feature-showcase";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { PricingSection } from "@/components/landing/pricing-section";
import { LandingFooter } from "@/components/landing/landing-footer";
import { SITE_URL } from "@/lib/site";

// Phase 5: unauthenticated visitors get this marketing surface at "/".
// Logged-in users are redirected to /dashboard by proxy.ts before any
// HTML is rendered — no marketing flash.
const TITLE = "jam-note — write fast, think in space";
const DESCRIPTION =
  "A tactile, keyboard-first note system: a block editor that keeps up with your hands, an infinite spatial canvas for non-linear thinking, and one-click self-publishing for the drafts that are ready.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "jam-note",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "jam-note",
  url: SITE_URL,
  description: DESCRIPTION,
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "Block editor with slash commands",
    "Spatial Jam Canvas",
    "Crash-safe autosave",
    "Command palette search",
    "Infinite note nesting",
    "Self-publishing",
  ],
};

export default function LandingPage() {
  return (
    <div className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen bg-landing-base font-landing-sans text-landing-text antialiased`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <LandingHeader />
      <main>
        <HeroSection />
        <FeatureShowcase />
        <FeatureGrid />
        <PricingSection />
      </main>
      <LandingFooter />
    </div>
  );
}
