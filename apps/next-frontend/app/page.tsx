import type { Metadata, Viewport } from "next";
import { Archivo, Newsreader, Space_Mono } from "next/font/google";
import "./landing.css";
import { LandingChrome } from "@/components/landing/landing-chrome";
import { LandingHeader } from "@/components/landing/landing-header";
import { HeroSection } from "@/components/landing/hero-section";
import { FeatureShowcase } from "@/components/landing/feature-showcase";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { PricingSection } from "@/components/landing/pricing-section";
import { LandingFooter } from "@/components/landing/landing-footer";
import { SITE_URL } from "@/lib/site";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"] });
const spaceMono = Space_Mono({ variable: "--font-space-mono", subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"] });
const TITLE = "Jam Notes — write fast, think in space";
const DESCRIPTION = "A tactile, keyboard-first note system: a block editor, spatial canvas, and one-click publishing for drafts that are ready.";

export const metadata: Metadata = { title: TITLE, description: DESCRIPTION, alternates: { canonical: "/" }, openGraph: { type: "website", url: SITE_URL, siteName: "Jam Notes", title: TITLE, description: DESCRIPTION }, twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION } };
export const viewport: Viewport = { themeColor: "#f3efe6" };

const structuredData = { "@context": "https://schema.org", "@type": "WebApplication", name: "Jam Notes", url: SITE_URL, description: DESCRIPTION, applicationCategory: "ProductivityApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, featureList: ["Block editor with slash commands", "Spatial Jam Canvas", "Crash-safe autosave", "Command palette search", "Infinite note nesting", "Self-publishing"] };

export default function LandingPage() { return <div className={`landing ${archivo.variable} ${newsreader.variable} ${spaceMono.variable}`}><LandingChrome /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} /><LandingHeader /><main><HeroSection /><FeatureShowcase /><FeatureGrid /><PricingSection /></main><LandingFooter /></div>; }
