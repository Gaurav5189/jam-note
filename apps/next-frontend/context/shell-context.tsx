"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

// Desk chrome state — currently just the sidebar open/close toggle.
// Kept separate from workspace data so the workspace context stays pure.

const STORAGE_KEY = "jamnote:sidebar-open";

interface ShellContextType {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

const ShellContext = createContext<ShellContextType | undefined>(undefined);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Restore the persisted preference after mount via a scheduled
  // callback (never a synchronous setState in the effect body — and
  // SSR renders "open" deterministically, so hydration can't drift).
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored !== null) setSidebarOpen(stored === "1");
      } catch {
        // Private mode / storage disabled — keep the default.
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Storage write failures must not break the toggle.
      }
      return next;
    });
  }, []);

  return (
    <ShellContext.Provider value={{ sidebarOpen, toggleSidebar }}>
      {children}
    </ShellContext.Provider>
  );
}

export function useShell() {
  const context = useContext(ShellContext);
  if (context === undefined) {
    throw new Error("useShell must be used within a ShellProvider");
  }
  return context;
}
