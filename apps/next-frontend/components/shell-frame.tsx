"use client";

import { useShell } from "@/context/shell-context";
import { Sidebar } from "@/components/sidebar";

/**
 * The sidebar + main stage grid. Owns the is-side-closed class so the
 * CSS grid columns animate smoothly (the runhead toggle drives it via
 * the shell context — see Header).
 */
export function ShellFrame({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useShell();

  return (
    <div className={`desk-shell${sidebarOpen ? "" : " is-side-closed"}`}>
      <Sidebar />
      <main className="desk-main">{children}</main>
    </div>
  );
}
