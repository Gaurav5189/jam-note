import { useSyncExternalStore } from "react";

/**
 * Global in-flight fetch counter for the top loading bar (user QOL on
 * throttled networks: a pressed button must visibly be working).
 *
 * Same store pattern as lib/sidebar-collapse: useSyncExternalStore for
 * the SSR/hydration seam (server = idle), mutations only from event
 * handlers and fetch plumbing — never from render.
 */

let count = 0;
const listeners = new Set<() => void>();

// Navigation segment: Next's App Router gives no global transition
// events, so the PendingBar component arms this on same-app anchor
// clicks (and router.push call sites arm it directly). The pathname
// effect ends it the moment the URL settles.
let navActive = false;
let navTimer: ReturnType<typeof setTimeout> | null = null;

/** Mark the start of an in-app navigation (link click / router.push). */
export function beginNavPending(): void {
  navActive = true;
  if (navTimer) clearTimeout(navTimer);
  // Safety: a navigation that never settles (blocked, cancelled) must
  // not leave the bar stuck on.
  navTimer = setTimeout(() => endNavPending(), 15_000);
  for (const listener of listeners) listener();
}

/** End the navigation segment — pathname settled, or safety timeout. */
export function endNavPending(): void {
  if (!navActive) return;
  navActive = false;
  if (navTimer) {
    clearTimeout(navTimer);
    navTimer = null;
  }
  for (const listener of listeners) listener();
}

/** Mark the start of a tracked request (idempotent per begin/end pair). */
export function beginPending(): void {
  count += 1;
  if (count === 1) {
    for (const listener of listeners) listener();
  }
}

/** Mark the end of a tracked request — paired with beginPending in a
 *  try/finally so failures always release the bar. */
export function endPending(): void {
  count = Math.max(0, count - 1);
  if (count === 0) {
    for (const listener of listeners) listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return count > 0 || navActive;
}

function getServerSnapshot(): boolean {
  return false;
}

export function usePending(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
