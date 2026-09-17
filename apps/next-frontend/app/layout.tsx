import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "jam-note",
  description: "Tactile, ultra-fast note-taking for creators.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}