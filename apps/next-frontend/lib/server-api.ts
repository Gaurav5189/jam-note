import { headers } from "next/headers";

import { getAuth } from "./auth";

// Server Components cannot use the browser's same-origin `/api` rewrites —
// they talk to FastAPI directly and must mint a BetterAuth JWT for the
// incoming request's session, then send it as a Bearer token.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Mint a short-lived JWT for the current request's session.
 *
 * `getToken` is the JWT plugin's server-side endpoint; it reads the
 * incoming cookie via the forwarded headers. No session (or an invalid
 * one) yields null, and the downstream FastAPI call returns 401.
 */
async function getServerAuthToken(): Promise<string | null> {
  try {
    const requestHeaders = await headers();
    const result = await getAuth().api.getToken({ headers: requestHeaders });
    return result?.token ?? null;
  } catch {
    return null;
  }
}

export async function serverFetchApi<T>(endpoint: string): Promise<T> {
  const token = await getServerAuthToken();

  const requestHeaders: Record<string, string> = {};
  if (token) {
    requestHeaders["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: requestHeaders,
    cache: "no-store",
  });

  if (!response.ok) {
    let errorMessage = `API error: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.detail) {
        errorMessage =
          typeof errorData.detail === "string"
            ? errorData.detail
            : JSON.stringify(errorData.detail);
      }
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new ApiError(response.status, errorMessage);
  }

  return response.json() as Promise<T>;
}
