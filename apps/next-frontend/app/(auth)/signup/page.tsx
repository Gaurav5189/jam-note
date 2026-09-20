import type { Metadata, Viewport } from "next";
import { AuthSlips } from "@/components/auth/auth-slips";

export const metadata: Metadata = {
  title: "Jam Notes — Create Workspace",
  description: "Create your workspace. Write fast. Think in space.",
};

export const viewport: Viewport = { themeColor: "#151310" };

export default function SignupPage() {
  return <AuthSlips initialForm="signup" />;
}
