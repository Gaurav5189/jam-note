"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useShell } from "@/context/shell-context";
import { Sidebar } from "@/components/sidebar";
import { PendingBar } from "@/components/desk/pending-bar";
import { useMediaQuery } from "@/lib/use-media-query";

/** Mobile breakpoint — strictly <768px (make/design.md §3). */
const MOBILE_QUERY = "(max-width: 767px)";

/**
 * The sidebar + main stage grid. Owns the is-side-closed class so the
 * CSS grid columns animate smoothly (the runhead toggle drives it via
 * the shell context — see Header). The pending bar sits above
 * everything — slow networks must show that a pressed button works.
 *
 * On mobile (<768px) the sidebar is a slide-in drawer (design.md §5):
 * the is-mobile-nav-open class slides it in over a backdrop that
 * dismisses on tap. Desktop keeps the plain grid — the drawer classes
 * only ever apply inside the mobile media block in desk.css.
 */
export function ShellFrame({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, mobileNavOpen, closeMobileNav } = useShell();
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const pathname = usePathname();

  // Auto-close the drawer on navigation (design.md §5). The ref guard
  // makes the effect react to real path changes only — opening the
  // drawer itself never re-runs it. closeMobileNav is idempotent, so
  // desktop-width navigations firing it are a harmless no-op.
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;
    const id = setTimeout(closeMobileNav, 0);
    return () => clearTimeout(id);
  }, [pathname, closeMobileNav]);

  return (
    <div
      className={`desk-shell${sidebarOpen ? "" : " is-side-closed"}${
        mobileNavOpen ? " is-mobile-nav-open" : ""
      }`}
    >
      <PendingBar />
      {isMobile && (
        <div className="side-backdrop" aria-hidden="true" onClick={closeMobileNav} />
      )}
      <Sidebar />
      <main className="desk-main">{children}</main>
    </div>
  );
}
