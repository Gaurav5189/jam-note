"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { useNotes } from "@/context/notes-context";
import { flattenTree } from "@/lib/note-tree";
import type { User } from "@/lib/types";
import { DESK_SIGNOUT_EVENT } from "@/components/desk/desk-chrome";

export const OPEN_SEARCH_EVENT = "jam:open-search";

const NOTE_URL_PREFIX = "/notes/";

export function Header({ user }: { user: User }) {
  const { tree } = useNotes();
  const pathname = usePathname();
  const statusRef = useRef<HTMLSpanElement>(null);

  const activeNoteId = pathname.startsWith(NOTE_URL_PREFIX)
    ? pathname.slice(NOTE_URL_PREFIX.length)
    : null;

  const count = flattenTree(tree).length;
  const openTitle = activeNoteId
    ? flattenTree(tree).find((n) => n.id === activeNoteId)?.title ?? null
    : null;

  const statusLine = `CHANNEL — MAIN · ${String(count).padStart(2, "0")} NOTE${count === 1 ? "" : "S"} FILED${
    openTitle ? ` · OPEN: ${openTitle.toUpperCase()}` : ""
  }`;

  // Replay the tick animation whenever the status text changes (new
  // note filed, opened, renamed…). The class name string stays stable
  // across these renders, so React never rewrites the attribute and
  // the imperative re-add survives.
  useEffect(() => {
    const el = statusRef.current;
    if (!el) return;
    el.classList.remove("tick");
    void el.offsetWidth;
    el.classList.add("tick");
  }, [statusLine]);

  const openSearch = () => {
    window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
  };

  const requestSignout = () => {
    window.dispatchEvent(new CustomEvent(DESK_SIGNOUT_EVENT));
  };

  const displayName = user.profile.display_name || user.username;

  return (
    <header className="runhead chrome">
      <div className="rh-l">
        <Link href="/dashboard" className="rh-brand">Jam Notes</Link>
      </div>

      <span className="rh-c" ref={statusRef}>{statusLine}</span>

      <div className="rh-r">
        <button onClick={openSearch} className="srch" type="button" aria-label="Search notes">
          <Search size={12} aria-hidden="true" />
          <span className="srch-label">SEARCH</span>
          <kbd>⌘K</kbd>
        </button>

        <div className="u-block">
          <span className="u-ava" aria-hidden="true">
            {displayName.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <span className="u-name">{displayName}</span>
            <br />
            <span className="u-mail">{user.email}</span>
          </span>
        </div>

        <button onClick={requestSignout} className="disconnect" type="button">
          DISCONNECT
        </button>
      </div>
    </header>
  );
}
