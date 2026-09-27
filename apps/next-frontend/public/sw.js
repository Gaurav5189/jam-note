/*
 * Jam Notes — offline service worker (public/sw.js).
 *
 * Closes the "offline refresh shows the browser's no-internet page" gap.
 * The app already queues offline edits (localStorage draft mirror +
 * flush-on-online autosave), but a full page reload while offline never
 * reached that logic: the document request itself failed at the network
 * level. This worker serves the app shell from cache so the reload lands
 * inside the app, where the existing offline affordances take over.
 *
 * Strategies (all same-origin, GET only):
 *  - HTML navigations: network-first (online refreshes stay fresh) →
 *    last-cached copy of that URL → precached /offline fallback page.
 *  - /_next/static/* (content-hashed, immutable): cache-first.
 *  - /api/* and everything else: never intercepted — offline API failures
 *    belong to the app's own queueing/retry logic, not to a cache.
 *
 * Bump VERSION to invalidate every cache on deploy.
 */

const VERSION = "v1";
const PAGES_CACHE = `jam-pages-${VERSION}`;
const ASSETS_CACHE = `jam-assets-${VERSION}`;
const OFFLINE_URL = "/offline";
const MAX_PAGE_ENTRIES = 40;
const MAX_ASSET_ENTRIES = 150;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await precacheOfflineFallback();
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== PAGES_CACHE && key !== ASSETS_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache the API — the offline chip / draft-mirror pipeline owns
  // API failure handling.
  if (url.pathname.startsWith("/api/")) return;

  // Full page loads (refresh, address bar, cross-site entry).
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Build output is content-hashed and immutable — safe to serve without
  // revalidation.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(handleStaticAsset(request));
  }

  // All other requests (RSC fetches, prefetches) stay network-only.
});

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    // `basic` = same-origin final response. Redirects surface as
    // opaqueredirect (status 0) and must pass through untouched; opaque
    // bodies are useless offline and are never cached.
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(PAGES_CACHE);
      await cache.put(request, response.clone());
      await trimCache(PAGES_CACHE, MAX_PAGE_ENTRIES);
    }
    return response;
  } catch {
    const cache = await caches.open(PAGES_CACHE);
    const cachedPage = await cache.match(request);
    if (cachedPage) return cachedPage;
    const fallback = await cache.match(OFFLINE_URL);
    return fallback ?? Response.error();
  }
}

async function handleStaticAsset(request) {
  const cache = await caches.open(ASSETS_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    await trimCache(ASSETS_CACHE, MAX_ASSET_ENTRIES);
  }
  return response;
}

/** Keep runtime caches bounded — oldest entries (insertion order) go first. */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const excess = keys.length - maxEntries;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

/**
 * Cache the offline fallback page AND the build assets it references, so
 * the fallback renders fully even if the first offline navigation ever
 * made hits a URL that was never visited.
 */
async function precacheOfflineFallback() {
  const cache = await caches.open(PAGES_CACHE);
  const response = await fetch(new Request(OFFLINE_URL, { cache: "reload" }));
  if (!response.ok || response.type !== "basic") return;
  await cache.put(OFFLINE_URL, response.clone());

  const html = await response.text();
  const assets = new Set();
  for (const match of html.matchAll(/\/_next\/static\/[^"'&\s]+/g)) {
    assets.add(match[0]);
  }
  if (assets.size === 0) return;

  const assetCache = await caches.open(ASSETS_CACHE);
  await Promise.all(
    [...assets].map((path) =>
      assetCache.add(new URL(path, self.location.origin)).catch(() => {})
    )
  );
}
