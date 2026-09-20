import type { Metadata, Viewport } from "next";
import { AuthSlips } from "@/components/auth/auth-slips";

export const metadata: Metadata = {
  title: "Jam Notes — System Access",
  description: "System access. Write fast. Think in space.",
};

export const viewport: Viewport = { themeColor: "#151310" };

export default function LoginPage() {
  return <AuthSlips initialForm="login" />;
}
