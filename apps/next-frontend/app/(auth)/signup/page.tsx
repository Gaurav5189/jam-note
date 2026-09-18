"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { fetchApi } from "@/lib/api";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  const router = useRouter();
  const { refreshUser } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await fetchApi("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, username, password, display_name: displayName || undefined }),
      });
      await refreshUser();
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-base p-4">
      <div className="w-full max-w-md bg-background-panel border border-border-thin rounded-md p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-mono font-bold text-text-primary">Jam Notes</h1>
          <p className="text-text-muted mt-2 text-sm uppercase tracking-widest">provision workspace</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-950/30 border border-red-500/50 rounded-sm text-red-400 text-sm font-mono">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-text-muted mb-2 uppercase" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              className="w-full bg-background-steel border border-border-thin rounded-sm px-4 py-3 text-text-primary focus:outline-none focus:border-accent-neon transition-colors"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-text-muted mb-2 uppercase" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              required
              minLength={3}
              className="w-full bg-background-steel border border-border-thin rounded-sm px-4 py-3 text-text-primary focus:outline-none focus:border-accent-neon transition-colors"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-text-muted mb-2 uppercase" htmlFor="displayName">
              Display Name <span className="text-gray-600">(Optional)</span>
            </label>
            <input
              id="displayName"
              type="text"
              className="w-full bg-background-steel border border-border-thin rounded-sm px-4 py-3 text-text-primary focus:outline-none focus:border-accent-neon transition-colors"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
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
              minLength={8}
              className="w-full bg-background-steel border border-border-thin rounded-sm px-4 py-3 text-text-primary focus:outline-none focus:border-accent-neon transition-colors"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent-amber text-background-base font-bold py-3 rounded-sm hover:bg-opacity-90 transition-opacity uppercase tracking-wide disabled:opacity-50 mt-4"
          >
            {loading ? "Provisioning..." : "Create Workspace"}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-text-muted text-sm">
            Already have an account?{" "}
            <Link href="/login" className="text-accent-neon hover:underline">
              Access system
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
