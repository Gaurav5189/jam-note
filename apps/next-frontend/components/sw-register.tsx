"use client";

import { useEffect } from "react";

/**
 * Registers the hand-written offline service worker (public/sw.js).
 *
 * Production only — `next dev` serves from loopback (which survives
 * internet outages), and a caching worker there would poison the dev loop
 * with stale chunks. `updateViaCache: "none"` keeps the worker script
 * itself outside the HTTP cache so deploys propagate immediately.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Registration failure is non-fatal — the app is online-first.
      });
  }, []);

  return null;
}
