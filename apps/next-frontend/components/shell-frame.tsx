"use client";

import { useShell } from "@/context/shell-context";
import { Sidebar } from "@/components/sidebar";
import { PendingBar } from "@/components/desk/pending-bar";

/**
 * The sidebar + main stage grid. Owns the is-side-closed class so the
 * CSS grid columns animate smoothly (the runhead toggle drives it via
 * the shell context — see Header). The pending bar sits above
 * everything — slow networks must show that a pressed button works.
 */
export function ShellFrame({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useShell();

  return (
    <div className={`desk-shell${sidebarOpen ? "" : " is-side-closed"}`}>
      <PendingBar />
      <Sidebar />
      <main className="desk-main">{children}</main>
    </div>
  );
}
