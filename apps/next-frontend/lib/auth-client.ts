"use client";

import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

/**
 * Browser-side BetterAuth client.
 *
 * `baseURL` is intentionally omitted: the client talks to the same origin
 * (`/api/auth/*`), which is served by `app/api/auth/[...all]/route.ts`.
 */
export const authClient = createAuthClient({
  plugins: [usernameClient()],
});

export const { signIn, signUp, signOut, useSession, updateUser, changePassword } =
  authClient;
