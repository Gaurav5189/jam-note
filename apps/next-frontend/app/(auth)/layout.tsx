import { AuthProvider } from "@/context/auth-context";

// Session context is scoped to the unauthenticated auth flows (login,
// signup). The authenticated `(app)` shell uses server-fetched user/tree
// props instead, so it never pays for a redundant client-side `/api/auth/me`.
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AuthProvider>{children}</AuthProvider>;
}