"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Search } from "lucide-react";
import { useNotes } from "@/context/notes-context";
import { fetchApi } from "@/lib/api";
import { findNotePath } from "@/lib/note-tree";
import type { NoteListItem } from "@/lib/types";
import { OPEN_SEARCH_EVENT } from "@/components/header";

const DEBOUNCE_MS = 300;

export function SearchPalette() {
  const { tree } = useNotes();
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
    if (!path || path.length < 2) return null;
    return path
      .slice(0, -1)
      .map((node) => node.title)
      .join(" › ");
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
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-[15vh]"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Search notes"
    >
      <div
        className="w-full max-w-lg bg-background-panel border border-border-thin rounded-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-thin">
          <Search size={15} className="text-accent-neon shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes…"
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none font-mono"
            aria-label="Search query"
          />
          {searching && (
            <span className="text-[10px] font-mono text-text-muted uppercase">Scanning…</span>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {query.trim() === "" ? (
            <p className="px-4 py-6 text-xs font-mono text-text-muted text-center uppercase tracking-widest">
              Type to filter workspace
            </p>
          ) : results.length === 0 && !searching ? (
            <p className="px-4 py-6 text-xs font-mono text-text-muted text-center uppercase tracking-widest">
              No signal — no notes match
            </p>
          ) : (
            results.map((note, index) => {
              const parentPath = parentPathLabel(note.id);
              return (
                <button
                  key={note.id}
                  onClick={() => navigateTo(note.id)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    index === activeIndex ? "bg-background-steel" : ""
                  }`}
                >
                  {note.emoji_icon ? (
                    <span className="text-sm shrink-0">{note.emoji_icon}</span>
                  ) : (
                    <FileText size={14} className="text-text-muted shrink-0" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm truncate ${
                        index === activeIndex ? "text-accent-neon" : "text-text-primary"
                      }`}
                    >
                      {note.title}
                    </span>
                    {parentPath && (
                      <span className="block text-[10px] font-mono text-text-muted truncate">
                        {parentPath}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-border-thin text-[10px] font-mono text-text-muted uppercase">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
