import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE_URL } from "@/lib/site";
import { ServiceWorkerRegister } from "@/components/sw-register";

export const metadata: Metadata = {
  // Resolves relative metadata URLs (canonical, OG image) for every route.
  metadataBase: new URL(SITE_URL),
  title: "Jam Notes",
  description: "Tactile, ultra-fast note-taking for creators.",
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
