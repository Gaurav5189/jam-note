import type { Metadata } from "next";
import { Archivo, Newsreader, Space_Mono } from "next/font/google";
import { AuthProvider } from "@/context/auth-context";
import "./auth.css";

// Same variable-font setup as the landing monograph. `display: "block"`
// keeps the kinetic slip titles from rising in a fallback font and then
// re-laying-out mid-jump.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"], display: "block" });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"], display: "block" });
const spaceMono = Space_Mono({ variable: "--font-space-mono", subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], display: "block" });

export const metadata: Metadata = {
  title: "Jam Notes",
  description: "System access. Write fast. Think in space.",
};

// Session context is scoped to the unauthenticated auth flows (login,
// signup). The authenticated `(app)` shell uses server-fetched user/tree
// props instead, so it never pays for a redundant client-side `/api/auth/me`.
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
      {/* The paper slip plate — black ground, print chrome, and the loose
          access slips. The runhead's left block (inside the page) is the
          home link; there is no separate floating back button. */}
      <div className={`auth ${archivo.variable} ${newsreader.variable} ${spaceMono.variable}`}>
        {children}
      </div>
    </AuthProvider>
  );
}
