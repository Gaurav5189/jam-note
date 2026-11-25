import { beginPending, endPending } from "@/lib/pending-bar";

/**
 * BetterAuth issues short-lived JWTs (15 minutes) that FastAPI verifies
 * against `/api/auth/jwks`. The browser gets one from `/api/auth/token`
 * (authenticated by the HttpOnly BetterAuth session cookie) and this
 * module caches it until shortly before expiry.
 */
let cachedToken: { token: string; expiresAt: number } | null = null;

/** Refresh this many milliseconds before the token actually expires. */
const TOKEN_EXPIRY_SKEW_MS = 30_000;

function decodeExpiry(token: string): number {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "="));
    const parsed = JSON.parse(json) as { exp?: number };
    return typeof parsed.exp === "number" ? parsed.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Return a valid BetterAuth JWT, fetching a new one when the cache is
 * empty, expired, or `force` is set. Returns null when there is no
 * session (or the server can't be reached) — callers then send an
 * unauthenticated request and surface the 401 as usual.
 */
export async function getAuthToken(force = false): Promise<string | null> {
  if (typeof document === "undefined") return null;
  if (
    !force &&
    cachedToken &&
    cachedToken.expiresAt > Date.now() + TOKEN_EXPIRY_SKEW_MS
  ) {
    return cachedToken.token;
  }
  try {
    const response = await fetch("/api/auth/token", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) {
      cachedToken = null;
      return null;
    }
    const data = (await response.json()) as { token?: string };
    if (!data.token) {
      cachedToken = null;
      return null;
    }
    cachedToken = {
      token: data.token,
      expiresAt: decodeExpiry(data.token) || Date.now() + 60_000,
    };
    return data.token;
  } catch {
    cachedToken = null;
    return null;
  }
}

/** Drop the cached token — call after sign-in, sign-out, or a 401. */
export function clearAuthToken(): void {
  cachedToken = null;
}

/**
 * The app's fetch wrapper. Every call tracks the top loading bar so a
 * pressed button visibly works on throttled networks — except quiet
 * background saves (editor/canvas autosave, tracked by their own save
 * chips), which pass `trackPending: false`.
 *
 * Every request carries `Authorization: Bearer <BetterAuth JWT>`. A 401
 * means the token expired or the session ended: the token is refreshed
 * once and the request retried, then the error surfaces.
 */
export async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit,
  trackPending = true
): Promise<T> {
  const url = endpoint.startsWith("/api") ? endpoint : `/api${endpoint}`;

  const headers = new Headers(options?.headers);
  if (!headers.has("Content-Type") && !(options?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const token = await getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  if (trackPending) beginPending();
  try {
    let response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });

    // Expired/invalid token — force one refresh and retry.
    if (response.status === 401 && token) {
      const refreshed = await getAuthToken(true);
      if (refreshed) {
        headers.set("Authorization", `Bearer ${refreshed}`);
        response = await fetch(url, {
          ...options,
          headers,
          credentials: "include",
        });
      }
    }

    if (!response.ok) {
      let errorMessage = `API error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.detail) {
          errorMessage = typeof errorData.detail === "string" ? errorData.detail : JSON.stringify(errorData.detail);
        }
      } catch {
        // Ignored
      }
      throw new Error(errorMessage);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  } finally {
    if (trackPending) endPending();
  }
}

/**
 * Download a file endpoint (export routes) through the same-origin
 * browser proxy so the auth header rides along. Parses the
 * Content-Disposition filename (RFC 6266 `filename*` UTF-8 name first,
 * ASCII fallback second), hands the blob to the browser via an object
 * URL + transient anchor click, and returns the saved filename. The
 * top pending bar tracks the whole download — the note-bar EXPORT
 * button has no other busy state.
 */
export async function downloadFile(
  endpoint: string,
  fallbackFilename: string
): Promise<string> {
  const url = endpoint.startsWith("/api") ? endpoint : `/api${endpoint}`;
  const token = await getAuthToken();
  beginPending();
  try {
    const response = await fetch(url, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    return await _consumeDownloadResponse(response, fallbackFilename);
  } finally {
    endPending();
  }
}

async function _consumeDownloadResponse(
  response: Response,
  fallbackFilename: string
): Promise<string> {

  if (!response.ok) {
    let errorMessage = `Download failed: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.detail) {
        errorMessage =
          typeof errorData.detail === "string"
            ? errorData.detail
            : JSON.stringify(errorData.detail);
      }
    } catch {
      // Binary/error body without JSON detail — keep the status message.
    }
    throw new Error(errorMessage);
  }

  const disposition = response.headers.get("content-disposition") ?? "";
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const asciiMatch = /filename="([^"]+)"/i.exec(disposition);
  const filename = utf8Match
    ? decodeURIComponent(utf8Match[1])
    : asciiMatch
      ? asciiMatch[1]
      : fallbackFilename;

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoke after a tick — revoking synchronously can cancel the
  // download in some browsers.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return filename;
}
