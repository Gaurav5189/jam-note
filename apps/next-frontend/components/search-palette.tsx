"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { useWorkspace } from "@/context/workspace-context";
import { fetchApi } from "@/lib/api";
import { findNotePath } from "@/lib/workspace-tree";
import { beginNavPending } from "@/lib/pending-bar";
import { OPEN_SEARCH_EVENT } from "@/components/header";
import { parseHighlightSegments, type SearchResponse, type SearchResultItem } from "@/lib/search";

const DEBOUNCE_MS = 250;

function HighlightedSnippet({ text }: { text: string }) {
  const segments = useMemo(() => parseHighlightSegments(text), [text]);
  return (
    <>
      {segments.map((seg, idx) =>
        seg.highlighted ? (
          <mark key={idx} className="pal-mark">
            {seg.text}
          </mark>
        ) : (
          <span key={idx}>{seg.text}</span>
        )
      )}
    </>
  );
}

export function SearchPalette() {
  const { tree } = useWorkspace();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isMagic, setIsMagic] = useState(true);
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
    setIsMagic(true);
  }, []);

  const navigateTo = useCallback(
    (noteId: string, blockId: string | null) => {
      close();
      beginNavPending();
      if (blockId) {
        router.push(`/notes/${noteId}#block-${blockId}`);
      } else {
        router.push(`/notes/${noteId}`);
      }
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

  // Debounced search, cancelling stale requests.
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      const seq = ++requestSeq.current;
      setSearching(true);
      try {
        const response = await fetchApi<SearchResponse>(
          `/api/search?q=${encodeURIComponent(trimmed)}`
        );
        if (seq === requestSeq.current) {
          setResults(response.results);
          setIsMagic(response.magic);
          setActiveIndex(0);
        }
      } catch (err) {
        if (seq === requestSeq.current) {
          setResults([]);
          setIsMagic(false);
        }
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
      if (selected) navigateTo(selected.note_id, selected.block_id);
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
          <div className="pal-head-left">
            <span>INDEX — SEARCH</span>
            {!isMagic && (
              <span className="pal-offline-chip" role="status">
                MAGIC SEARCH OFFLINE
              </span>
            )}
          </div>
          <span>ESC TO CLOSE</span>
        </div>

        <div style={{ position: "relative" }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes and block content…"
            className="pal-input"
            aria-label="Search query"
          />
          {searching && <span className="pal-scan">SCANNING…</span>}
        </div>

        <ul className="pal-list">
          {query.trim() === "" ? (
            <li className="pal-empty">Type to search notes and content.</li>
          ) : results.length === 0 && !searching ? (
            <li className="pal-empty">No signal — no notes match.</li>
          ) : (
            results.map((result, index) => {
              const isBlockMatch = result.block_id !== null;
              const parentPath = parentPathLabel(result.note_id);

              return (
                <li key={`${result.note_id}:${result.block_id ?? "title"}:${result.rank}`}>
                  <button
                    onClick={() => navigateTo(result.note_id, result.block_id)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`pal-item${index === activeIndex ? " is-active" : ""}`}
                  >
                    <FileText size={14} aria-hidden="true" />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="pal-title">
                        {isBlockMatch ? (
                          result.note_title
                        ) : (
                          <HighlightedSnippet text={result.snippet || result.note_title} />
                        )}
                      </span>
                      {isBlockMatch ? (
                        <span className="pal-snippet">
                          <HighlightedSnippet text={result.snippet} />
                        </span>
                      ) : (
                        parentPath && <span className="pal-path">{parentPath}</span>
                      )}
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
