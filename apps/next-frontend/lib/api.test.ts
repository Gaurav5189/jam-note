import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAuthToken, fetchApi, getAuthToken } from "./api";

function tokenWithExpiry(expSecondsFromNow: number): string {
  const payload = btoa(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow }),
  );
  return `header.${payload}.signature`;
}

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: "",
    json: async () => body,
  } as unknown as Response;
}

describe("getAuthToken", () => {
  beforeEach(() => {
    // getAuthToken is a no-op outside the browser.
    (globalThis as unknown as { document: unknown }).document = {};
    clearAuthToken();
  });

  afterEach(() => {
    clearAuthToken();
    delete (globalThis as unknown as { document?: unknown }).document;
    vi.restoreAllMocks();
  });

  it("fetches once and reuses the cached token", async () => {
    const token = tokenWithExpiry(900);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ token }));

    await expect(getAuthToken()).resolves.toBe(token);
    await expect(getAuthToken()).resolves.toBe(token);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes a token that is already expired", async () => {
    const expired = tokenWithExpiry(-60);
    const fresh = tokenWithExpiry(900);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ token: expired }))
      .mockResolvedValueOnce(jsonResponse({ token: fresh }));

    await expect(getAuthToken()).resolves.toBe(expired);
    await expect(getAuthToken()).resolves.toBe(fresh);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when there is no session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ message: "Unauthorized" }, { ok: false, status: 401 }),
    );

    await expect(getAuthToken()).resolves.toBeNull();
  });
});

describe("fetchApi", () => {
  beforeEach(() => {
    (globalThis as unknown as { document: unknown }).document = {};
    clearAuthToken();
  });

  afterEach(() => {
    clearAuthToken();
    delete (globalThis as unknown as { document?: unknown }).document;
    vi.restoreAllMocks();
  });

  it("attaches the Bearer token to FastAPI calls", async () => {
    const token = tokenWithExpiry(900);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ token }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await fetchApi<{ ok: boolean }>("/api/account/me");

    const [, requestInit] = fetchMock.mock.calls[1];
    const headers = requestInit?.headers as Headers;
    expect(headers.get("Authorization")).toBe(`Bearer ${token}`);
  });

  it("refreshes once and retries after a 401", async () => {
    const stale = tokenWithExpiry(900);
    const fresh = tokenWithExpiry(900);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      // initial token fetch
      .mockResolvedValueOnce(jsonResponse({ token: stale }))
      // API rejects the stale token
      .mockResolvedValueOnce(jsonResponse({ detail: "expired" }, { ok: false, status: 401 }))
      // forced refresh
      .mockResolvedValueOnce(jsonResponse({ token: fresh }))
      // retry succeeds
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(fetchApi<{ ok: boolean }>("/api/account/me")).resolves.toEqual({
      ok: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [, retryInit] = fetchMock.mock.calls[3];
    const retryHeaders = retryInit?.headers as Headers;
    expect(retryHeaders.get("Authorization")).toBe(`Bearer ${fresh}`);
  });
});