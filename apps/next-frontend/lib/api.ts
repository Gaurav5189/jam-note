import { beginPending, endPending } from "@/lib/pending-bar";

/**
 * The app's fetch wrapper. Every call tracks the top loading bar so a
 * pressed button visibly works on throttled networks — except quiet
 * background saves (editor/canvas autosave, tracked by their own save
 * chips), which pass `trackPending: false`.
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

  if (trackPending) beginPending();
  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });

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
 * Content-Disposition filename (RFC 5266 `filename*` UTF-8 name first,
 * ASCII fallback second), hands the blob to the browser via an object
 * URL + transient anchor click, and returns the saved filename.
 */
export async function downloadFile(
  endpoint: string,
  fallbackFilename: string
): Promise<string> {
  const url = endpoint.startsWith("/api") ? endpoint : `/api${endpoint}`;
  const response = await fetch(url, { credentials: "include" });

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
