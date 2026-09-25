import { cookies } from "next/headers";

// Server Components cannot use the browser's same-origin `/api` rewrites —
// they talk to FastAPI directly and must forward the incoming session
// cookie manually.

export const SESSION_COOKIE_NAME = "jam_session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function serverFetchApi<T>(endpoint: string): Promise<T> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  const headers: Record<string, string> = {};
  if (session) {
    headers["Cookie"] = `${SESSION_COOKIE_NAME}=${session}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    headers,
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
