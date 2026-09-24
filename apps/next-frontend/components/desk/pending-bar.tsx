"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { beginNavPending, endNavPending, usePending } from "@/lib/pending-bar";

/**
 * The top loading bar — visible whenever a tracked request is in
 * flight (any button-press that talks to the API) OR an in-app
 * navigation is pending (dashboard → note, → profile, ← dashboard…).
 *
 * Next's App Router exposes no global transition events, so navigations
 * are armed here in the capture phase on same-app anchor clicks; the
 * pathname effect below ends the segment the moment the URL settles.
 * `router.push` call sites arm it explicitly (they have no anchor).
 * Gold sweep on ink, desk theme; reduced motion gets a static segment.
 */
export function PendingBar() {
  const pending = usePending();
  const pathname = usePathname();

  // Navigation settled — release the bar. Also a no-op cleanup on the
  // 15s safety timeout inside the store.
  useEffect(() => {
    endNavPending();
  }, [pathname]);

  // Arm on same-app anchor clicks. Capture phase so we see the click
  // before any handler can stopPropagation it.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      if (anchor.hasAttribute("download") || anchor.target === "_blank") return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//")) return;
      // Same-path clicks never settle the pathname — never arm for them.
      const targetPath = href.split(/[?#]/)[0] || "/";
      if (targetPath === window.location.pathname) return;
      beginNavPending();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <div
      className={`pend-bar${pending ? " is-on" : ""}`}
      role="status"
      aria-label={pending ? "Working" : undefined}
    />
  );
}
