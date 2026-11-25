"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { clearAuthToken, fetchApi } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import type { User } from "@/lib/types";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  refreshUser: () => Promise<{ user: User | null; error: string | null }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const refreshUser = useCallback(async (): Promise<{
    user: User | null;
    error: string | null;
  }> => {
    try {
      setLoading(true);
      setError(null);
      const userData = await fetchApi<User>("/api/account/me");
      setUser(userData);
      return { user: userData, error: null };
    } catch (err) {
      // Surface the API's reason to the caller: a successful sign-in is not
      // enough if FastAPI rejects the resulting token (wrong AUTH_MODE,
      // issuer/audience mismatch, database mismatch). Swallowing this made
      // the login slip claim success and then bounce off /dashboard.
      const message =
        err instanceof Error ? err.message : "Failed to load session";
      setUser(null);
      setError(message);
      return { user: null, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authClient.signOut();
      clearAuthToken();
      setUser(null);
      router.push("/login");
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  }, [router]);

  // Rehydrate the session on mount. Every state update happens after the
  // fetch resolves (never synchronously inside the effect), and the
  // cancellation guard avoids setState after unmount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const userData = await fetchApi<User>("/api/account/me");
        if (!cancelled) setUser(userData);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
