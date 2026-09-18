"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { fetchApi } from "@/lib/api";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { refreshUser } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await fetchApi("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email_or_username: identifier, password }),
      });
      await refreshUser();
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-base p-4">
      <div className="w-full max-w-md bg-background-panel border border-border-thin rounded-md p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-mono font-bold text-text-primary">jam-note</h1>
          <p className="text-text-muted mt-2 text-sm uppercase tracking-widest">system access</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-950/30 border border-red-500/50 rounded-sm text-red-400 text-sm font-mono">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-mono text-text-muted mb-2 uppercase" htmlFor="identifier">
              Email or Username
            </label>
            <input
              id="identifier"
              type="text"
              required
              className="w-full bg-background-steel border border-border-thin rounded-sm px-4 py-3 text-text-primary focus:outline-none focus:border-accent-neon transition-colors"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-text-muted mb-2 uppercase" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              className="w-full bg-background-steel border border-border-thin rounded-sm px-4 py-3 text-text-primary focus:outline-none focus:border-accent-neon transition-colors"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent-neon text-background-base font-bold py-3 rounded-sm hover:bg-opacity-90 transition-opacity uppercase tracking-wide disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Initialize"}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-text-muted text-sm">
            {"Don't have an account? "}
            <Link href="/signup" className="text-accent-amber hover:underline">
              Create workspace
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
