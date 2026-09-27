"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Menu, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useWorkspace } from "@/context/workspace-context";
import { useShell } from "@/context/shell-context";
import { flattenNotes } from "@/lib/workspace-tree";
import { useMediaQuery } from "@/lib/use-media-query";
import { OPEN_SEARCH_EVENT } from "@/lib/search";
import type { User } from "@/lib/types";
import { DESK_SIGNOUT_EVENT } from "@/components/desk/desk-chrome";

const NOTE_URL_PREFIX = "/notes/";
/** Mobile breakpoint — strictly <768px (make/design.md §3). */
const MOBILE_QUERY = "(max-width: 767px)";

export function Header({ user }: { user: User }) {
  const { tree } = useWorkspace();
  const { sidebarOpen, toggleSidebar, mobileNavOpen, openMobileNav } = useShell();
  const pathname = usePathname();
  const statusRef = useRef<HTMLSpanElement>(null);
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowBtnRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const activeNoteId = pathname.startsWith(NOTE_URL_PREFIX)
    ? pathname.slice(NOTE_URL_PREFIX.length)
    : null;
  const onProfile = pathname === "/profile";

  const allNotes = flattenNotes(tree);
  const count = allNotes.length;
  const openTitle = activeNoteId
    ? allNotes.find((n) => n.id === activeNoteId)?.title ?? null
    : null;

  const statusLine = `CHANNEL — MAIN · ${String(count).padStart(2, "0")} NOTE${count === 1 ? "" : "S"} FILED${
    openTitle ? ` · OPEN: ${openTitle.toUpperCase()}` : ""
  }`;

  // Replay the tick animation whenever the status text changes (new
  // note filed, opened, renamed…). The class name string stays stable
  // across these renders, so React never rewrites the attribute and
  // the imperative re-add survives. Mobile renders no status line —
  // the null-guard keeps the effect inert there.
  useEffect(() => {
    const el = statusRef.current;
    if (!el) return;
    el.classList.remove("tick");
    void el.offsetWidth;
    el.classList.add("tick");
  }, [statusLine]);

  // Mobile overflow sheet — dismiss on outside press or Escape.
  // Listeners live on the document, so setState here is event-driven,
  // never a synchronous call inside an effect body.
  useEffect(() => {
    if (!overflowOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (sheetRef.current?.contains(target)) return;
      if (overflowBtnRef.current?.contains(target)) return;
      setOverflowOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOverflowOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [overflowOpen]);

  const openSearch = () => {
    window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
  };

  const requestSignout = () => {
    setOverflowOpen(false);
    window.dispatchEvent(new CustomEvent(DESK_SIGNOUT_EVENT));
  };

  const displayName = user.profile.display_name || user.username;

  // ── Mobile runhead (design.md §4): one 56px row — hamburger left,
  // truncated page title center, single overflow trigger right. The
  // avatar stays the fly-to-profile landing point (data-desk-avatar).
  if (isMobile) {
    const pageTitle = onProfile
      ? "PROFILE"
      : activeNoteId
        ? (openTitle ?? "NOTE").toUpperCase()
        : "DASHBOARD";
    return (
      <header className="runhead chrome">
        <button
          onClick={openMobileNav}
          className="rh-burger"
          type="button"
          aria-label="Open workspace navigation"
          aria-expanded={mobileNavOpen}
          aria-controls="desk-side-drawer"
          title="Navigation"
        >
          <Menu size={16} />
        </button>
        {/* Back icon on sub-pages (notes + profile) — the mobile
            counterpart of the desktop "← DASHBOARD" link; hidden on
            the dashboard itself. */}
        {(onProfile || activeNoteId) && (
          <Link
            href="/dashboard"
            className="rh-back-btn"
            title="Back to dashboard"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={16} />
          </Link>
        )}
        <span className="rh-c rh-page">{pageTitle}</span>
        <button
          ref={overflowBtnRef}
          onClick={() => setOverflowOpen((open) => !open)}
          className="rh-more"
          type="button"
          aria-label="Search, account, and disconnect"
          aria-haspopup="menu"
          aria-expanded={overflowOpen}
          title="Search, account, disconnect"
          data-desk-avatar
        >
          <span className="rh-more-ava" aria-hidden="true">
            {displayName.slice(0, 1).toUpperCase()}
          </span>
        </button>
        {overflowOpen && (
          <div className="rh-sheet" role="menu" aria-label="Account menu" ref={sheetRef}>
            <button
              type="button"
              role="menuitem"
              className="rh-sheet-row"
              onClick={() => {
                setOverflowOpen(false);
                window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
              }}
            >
              MAGIC SEARCH
            </button>
            <Link
              role="menuitem"
              className="rh-sheet-row"
              href="/profile"
              onClick={() => setOverflowOpen(false)}
            >
              ACCOUNT
            </Link>
            <button
              type="button"
              role="menuitem"
              className="rh-sheet-row rh-sheet-danger"
              onClick={requestSignout}
            >
              DISCONNECT
            </button>
          </div>
        )}
      </header>
    );
  }

  return (
    <header className="runhead chrome">
      <div className="rh-l">
        <button
          onClick={toggleSidebar}
          className="rh-toggle"
          type="button"
          aria-label={sidebarOpen ? "Close workspace panel" : "Open workspace panel"}
          aria-expanded={sidebarOpen}
          title={sidebarOpen ? "Hide workspace panel" : "Show workspace panel"}
        >
          {sidebarOpen ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />}
        </button>
        <Link href="/dashboard" className="rh-brand">Jam Notes</Link>
        {onProfile && (
          <Link href="/dashboard" className="rh-back" title="Back to the workspace">
            &larr; DASHBOARD
          </Link>
        )}
      </div>

      <span className="rh-c" ref={statusRef}>
        {onProfile ? (
          <>
            CHANNEL — MAIN · <b>PROFILE</b>
          </>
        ) : (
          statusLine
        )}
      </span>

      <div className="rh-r">
        <button onClick={openSearch} className="srch" type="button" aria-label="Search notes">
          <Search size={12} aria-hidden="true" />
          <span className="srch-label">MAGIC SEARCH</span>
          <kbd>⌘K</kbd>
        </button>

        {/* Profile chip — the "clicking the avatar does nothing" fix
            (make/dashboard_profile/design.md §9). data-desk-avatar is
            the landing point for deskFly (trash → profile arcs). */}
        <Link href="/profile" className="u-block" title="Profile" data-desk-avatar>
          <span className="u-ava" aria-hidden="true">
            {displayName.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <span className="u-name">{displayName}</span>
            <br />
            <span className="u-mail">{user.email}</span>
          </span>
        </Link>

        <button onClick={requestSignout} className="disconnect" type="button">
          DISCONNECT
        </button>
      </div>
    </header>
  );
}
