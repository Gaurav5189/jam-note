"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { useWorkspace } from "@/context/workspace-context";
import { fetchApi } from "@/lib/api";
import { findNotePath } from "@/lib/workspace-tree";
import type { NoteListItem } from "@/lib/types";
import { OPEN_SEARCH_EVENT } from "@/components/header";

const DEBOUNCE_MS = 300;

export function SearchPalette() {
  const { tree } = useWorkspace();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteListItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searching, setSearching] = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against out-of-order responses when typing quickly.
  const requestSeq = useRef(0);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActiveIndex(0);
  }, []);

  const navigateTo = useCallback(
    (id: string) => {
      close();
      router.push(`/notes/${id}`);
    },
    [close, router]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onOpenEvent = () => setOpen(true);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpenEvent);
    };
  }, []);

  // Debounced search, cancelling stale requests. The empty-query state is
  // derived at render time (`query.trim() === ""` branch below), so this
  // effect only arms the timer for non-empty queries — no synchronous
  // setState inside the effect.
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      const seq = ++requestSeq.current;
      setSearching(true);
      try {
        const found = await fetchApi<NoteListItem[]>(
          `/api/notes/search?q=${encodeURIComponent(trimmed)}`
        );
        if (seq === requestSeq.current) {
          setResults(found);
          setActiveIndex(0);
        }
      } catch (err) {
        if (seq === requestSeq.current) setResults([]);
        console.error("Search failed:", err);
      } finally {
        if (seq === requestSeq.current) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query, open]);

  const parentPathLabel = (noteId: string): string | null => {
    const path = findNotePath(tree, noteId);
    if (!path || path.folders.length === 0) return null;
    return path.folders.map((f) => f.name).join(" › ");
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (results.length > 0) {
        setActiveIndex((prev) => (prev + 1) % results.length);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length > 0) {
        setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const selected = results[activeIndex];
      if (selected) navigateTo(selected.id);
    }
  };

  if (!open) return null;

  return (
    <div
      className="palette open"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Search notes"
    >
      <div className="pal-card" onClick={(e) => e.stopPropagation()}>
        <div className="pal-head">
          <span>INDEX — SEARCH</span>
          <span>ESC TO CLOSE</span>
        </div>

        <div style={{ position: "relative" }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes…"
            className="pal-input"
            aria-label="Search query"
          />
          {searching && <span className="pal-scan">SCANNING…</span>}
        </div>

        <ul className="pal-list">
          {query.trim() === "" ? (
            <li className="pal-empty">Type to filter workspace.</li>
          ) : results.length === 0 && !searching ? (
            <li className="pal-empty">No signal — no notes match.</li>
          ) : (
            results.map((note, index) => {
              const parentPath = parentPathLabel(note.id);
              return (
                <li key={note.id}>
                  <button
                    onClick={() => navigateTo(note.id)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`pal-item${index === activeIndex ? " is-active" : ""}`}
                  >
                    <FileText size={14} aria-hidden="true" />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="pal-title">{note.title}</span>
                      {parentPath && <span className="pal-path">{parentPath}</span>}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="pal-foot">
          <span>↑↓ NAVIGATE</span>
          <span>↵ OPEN</span>
          <span>ESC CLOSE</span>
        </div>
      </div>
    </div>
  );
}
