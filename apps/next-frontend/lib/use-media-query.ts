"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Live media-query subscription, hydration-safe.
 *
 * The store owns the value (useSyncExternalStore), so there is no
 * setState-in-effect dance and no ref writes during render. The
 * server snapshot is always `false`; React reconciles with the real
 * match synchronously after hydration, before paint — components can
 * branch layouts without hydration drift.
 *
 * Callers treat `false` as "desktop": SSR and the first frame render
 * the desktop tree, which is also the correct default for the mobile
 * drawer (closed until the hamburger opens it — make/design.md §5).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onStoreChange);
      return () => mql.removeEventListener("change", onStoreChange);
    },
    [query]
  );
  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query]
  );
  const getServerSnapshot = useCallback(() => false, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
