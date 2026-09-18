import Link from "next/link";
import { AuthProvider } from "@/context/auth-context";

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
      {/* Home button — shared across login + signup; positioned fixed so it
          floats above whatever card the page renders at any scroll position. */}
      <Link
        href="/"
        className="fixed left-5 top-5 z-50 flex items-center gap-2 rounded-sm border border-border-thin bg-background-panel/80 px-3 py-2 font-mono text-[12px] text-text-muted backdrop-blur-sm transition-all hover:border-accent-amber/50 hover:text-accent-amber group"
        aria-label="Back to home"
      >
        <span className="hidden sm:inline">← Jam Notes</span>
        <span className="sm:hidden">←</span>
      </Link>
      {children}
    </AuthProvider>
  );
}