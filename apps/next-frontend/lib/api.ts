import { beginPending, endPending } from "@/lib/pending-bar";

/**
 * Get the CSRF token from the cookie. The cookie is not HttpOnly, so
 * JavaScript can read it. Returns null outside the browser (SSR/tests).
 */
function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie.split("; ");
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split("=");
    if (name === "csrf_token") return rest.join("=");
  }
  return null;
}

/** HTTP methods that mutate state and therefore require the CSRF header. */
function isStateChangingMethod(method?: string): boolean {
  const m = (method ?? "GET").toUpperCase();
  return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

/**
 * Fetch (or refresh) the CSRF token cookie. Sessions created before the
 * CSRF rollout have no token yet — this self-heals them.
 */
async function refreshCsrfToken(): Promise<string | null> {
  if (typeof document === "undefined") return null;
  try {
    const response = await fetch("/api/auth/csrf", { credentials: "include" });
    if (!response.ok) return null;
    const data: { csrf_token?: string } = await response.json();
    return data.csrf_token ?? getCsrfToken();
  } catch {
    return null;
  }
}

/**
 * The app's fetch wrapper. Every call tracks the top loading bar so a
 * pressed button visibly works on throttled networks — except quiet
 * background saves (editor/canvas autosave, tracked by their own save
 * chips), which pass `trackPending: false`.
 *
 * State-changing requests automatically carry the double-submit CSRF
 * token (X-CSRF-Token header mirroring the csrf_token cookie). If the
 * server rejects with "CSRF token missing" — e.g. an old session
 * predating the CSRF rollout — the token is refreshed once and the
 * request retried.
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

  // Attach the CSRF token on state-changing requests.
  if (isStateChangingMethod(options?.method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  }

  if (trackPending) beginPending();
  try {
    let response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });

    // Self-heal: a 403 "CSRF token missing" on an unsafe method means
    // the session cookie predates the CSRF rollout — mint a fresh
    // token and retry the request once.
    if (
      response.status === 403 &&
      isStateChangingMethod(options?.method) &&
      !headers.has("X-CSRF-Token")
    ) {
      const freshToken = await refreshCsrfToken();
      if (freshToken) {
        headers.set("X-CSRF-Token", freshToken);
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
 * browser proxy so the session cookie rides along. Parses the
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
  beginPending();
  try {
    const response = await fetch(url, { credentials: "include" });
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
