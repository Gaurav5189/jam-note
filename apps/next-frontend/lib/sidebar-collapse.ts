import { useSyncExternalStore } from "react";

/**
 * Sidebar folder collapse state — persisted to localStorage so a
 * refresh (or a return visit) keeps exactly the folders the user left
 * open, open; the rest stay collapsed (user decision, VS Code-style).
 *
 * useSyncExternalStore handles the SSR/hydration seam cleanly: the
 * server snapshot says "all expanded", and the persisted set swaps in
 * right after hydration if the browser says otherwise.
 *
 * Writes: `updateCollapsed` only touches the in-memory cache + notifies
 * (safe to call during render — same semantics as the previous
 * render-phase setCollapsed); the Sidebar persists every change via an
 * effect, so render itself stays free of localStorage I/O.
 */

const STORAGE_KEY = "jam.sidebar.collapsed.v1";
const EMPTY: ReadonlySet<string> = new Set();

const listeners = new Set<() => void>();
let cache: ReadonlySet<string> | null = null;

function load(): ReadonlySet<string> {
  if (cache) return cache;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        cache = new Set(parsed.filter((id): id is string => typeof id === "string"));
      }
    }
  } catch {
    // Corrupted or storage unavailable — fail open (all expanded).
  }
  cache ??= EMPTY;
  return cache;
}

/** Write the current set to localStorage (called from an effect). */
export function persistCollapsed(set: ReadonlySet<string>): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Quota/private-mode failures must never break the session UI.
  }
}

/** Swap in a new collapsed set and re-render subscribers. */
export function updateCollapsed(next: ReadonlySet<string>): void {
  cache = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ReadonlySet<string> {
  return load();
}

function getServerSnapshot(): ReadonlySet<string> {
  return EMPTY;
}

export function useSidebarCollapsed(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
