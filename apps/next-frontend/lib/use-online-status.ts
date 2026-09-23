import { useSyncExternalStore } from "react";

/**
 * Live connectivity status (Phase 7 offline indicator).
 *
 * `navigator.onLine` + online/offline events via
 * useSyncExternalStore. SSR assumes online — the snapshot swaps after
 * hydration if the browser says otherwise.
 */

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

function getServerSnapshot(): boolean {
  return true;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
