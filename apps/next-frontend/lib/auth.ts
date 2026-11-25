import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { APIError } from "better-auth/api";
import { jwt, username } from "better-auth/plugins";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";

import { db, mongoClient } from "./mongo";

/**
 * BetterAuth is the authentication authority for jam-note.
 *
 * It owns `/api/auth/*`, the credential store, sessions, and verification
 * tokens. FastAPI keeps ownership of notes, folders, search, imports, and
 * the `profiles` collection; it authenticates requests with the JWT issued
 * by the `jwt()` plugin below and verified against `/api/auth/jwks`.
 *
 * Schema notes:
 * - IDs stay MongoDB `ObjectId`s (`advanced.database.generateId: false`), so
 *   every `ObjectId(current_user.id)` tenant filter in FastAPI keeps working.
 * - BetterAuth uses its native collection names (`user`, `session`,
 *   `account`, `verification`, `jwks`). The legacy `users` and
 *   `user_sessions` collections are left untouched for rollback.
 * - Nested JSON is not expressible as `additionalFields`, so the app-specific
 *   `profile`/`settings` document lives in a FastAPI-owned `profiles`
 *   collection, seeded here on signup.
 */

// Mirrors fastapi_backend.auth.models — keep the two in sync.
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const DISPLAY_NAME_REGEX = /^[a-zA-Z0-9 ]+$/;
const EMOJI_REGEX =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F180}-\u{1F1FF}\u{2300}-\u{23FF}\u{1F200}-\u{1F2FF}\u{2702}-\u{27B0}\u{1F000}-\u{1F02F}\u{1F030}-\u{1F09F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F2FF}\u{1F650}-\u{1F67F}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}]/u;

const DEFAULT_SETTINGS = {
  theme: "dark-mono",
  editor_preferences: {
    default_layout: "document",
    font_family: "Inter",
    font_size: 14,
  },
};

function assertNoEmoji(value: string, label: string): void {
  if (EMOJI_REGEX.test(value)) {
    throw new APIError("BAD_REQUEST", {
      message: `${label} must not contain emoji characters`,
    });
  }
}

function assertDisplayName(value: string): void {
  assertNoEmoji(value, "Display name");
  if (!DISPLAY_NAME_REGEX.test(value)) {
    throw new APIError("BAD_REQUEST", {
      message: "Display name must contain only alphanumeric characters and spaces",
    });
  }
}

const trustedOrigins = [
  process.env.NEXT_PUBLIC_SITE_URL,
  process.env.BETTER_AUTH_URL,
].filter((origin): origin is string => Boolean(origin));

/**
 * Build the BetterAuth instance.
 *
 * Kept behind a function so construction — which runs the Mongo
 * adapter's index bootstrap — happens on the first request, not while
 * `next build` is collecting page data (build workers are torn down and
 * would interrupt the fire-and-forget index creation).
 */
function createAuth() {
  // A misconfigured database name would make BetterAuth write auth users to
  // a different database than FastAPI reads — signups would "succeed" and
  // then every API call would 404 the user. Fail loudly instead of falling
  // back to the default. (Deferred to request time so `next build` still
  // works without database configuration.)
  if (process.env.NODE_ENV === "production") {
    const required = [
      "MONGODB_URL",
      "DATABASE_NAME",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
    ];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(
        `BetterAuth is misconfigured — missing env: ${missing.join(", ")}. ` +
          "DATABASE_NAME must match the FastAPI backend's DATABASE_NAME.",
      );
    }
  }

  return betterAuth({
    database: mongodbAdapter(db, {
      client: mongoClient,
      // Transactions require a replica set (Atlas or a local rs). Local
      // standalone MongoDB — the common `docker run mongo` dev setup —
      // rejects them, so this is opt-in.
      transaction: process.env.MONGODB_TRANSACTIONS === "true",
    }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins,

    // Keep user IDs as MongoDB ObjectIds so FastAPI's ObjectId(user_id)
    // filters and every note/folder ownership check keep working unchanged.
    advanced: {
      database: {
        generateId: false,
      },
      // `useSecureCookies` is intentionally left unset: BetterAuth derives it
      // from `baseURL`/the request protocol, so HTTPS deployments get the
      // `__Secure-` cookie prefix while `next start` over http still works.
    },

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      // Existing users were hashed with bcrypt (pwdlib) — verify both the
      // migrated bcrypt hashes and new bcrypt hashes with the same scheme.
      password: {
        hash: async (password) => bcrypt.hash(password, 12),
        verify: async ({ hash, password }) => bcrypt.compare(password, hash),
      },
    },

    session: {
      // Matches the legacy jam_session lifetime (7 days).
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },

    user: {
      additionalFields: {
        // Server-managed; never accepted from the client.
        role: { type: "string", required: false, input: false },
      },
    },

    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const name = typeof user.name === "string" ? user.name.trim() : "";
            if (!name) {
              throw new APIError("BAD_REQUEST", {
                message: "Display name is required",
              });
            }
            assertDisplayName(name);
            return { data: { ...user, name } };
          },
          after: async (user) => {
            // Seed the FastAPI-owned profile document. `user_id` must be a
            // real ObjectId: FastAPI queries `profiles` with
            // `ObjectId(current_user.id)`, and a string here would silently
            // fall back to defaults.
            let userId: ObjectId;
            try {
              userId = new ObjectId(user.id);
            } catch {
              return;
            }
            const now = new Date();
            await db.collection("profiles").updateOne(
              { user_id: userId },
              {
                $setOnInsert: {
                  user_id: userId,
                  display_name: user.name ?? user.username ?? user.email,
                  avatar_url: user.image ?? null,
                  settings: DEFAULT_SETTINGS,
                  created_at: now,
                  updated_at: now,
                },
              },
              { upsert: true },
            );
          },
        },
        update: {
          before: async (user) => {
            if (typeof user.name === "string") {
              const name = user.name.trim();
              if (!name) {
                throw new APIError("BAD_REQUEST", {
                  message: "Display name can't be empty",
                });
              }
              assertDisplayName(name);
              return { data: { ...user, name } };
            }
            return { data: user };
          },
        },
      },
    },

    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        // Mirrors the legacy FastAPI limits.
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-in/username": { window: 60, max: 10 },
        "/sign-up/email": { window: 3600, max: 5 },
        "/change-password": { window: 3600, max: 3 },
      },
    },

    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 50,
        usernameValidator: (value) => USERNAME_REGEX.test(value),
        // Preserve exact-case usernames: migrated legacy accounts may
        // contain uppercase, and legacy login matched exactly. New
        // signups are constrained to lowercase by the client regex.
        usernameNormalization: false,
        displayUsernameNormalization: false,
      }),
      jwt({
        jwt: {
          // Must match the values FastAPI verifies. Defaults would be the
          // baseURL origin, but pinning makes the contract explicit.
          issuer: process.env.BETTER_AUTH_URL,
          audience: process.env.BETTER_AUTH_URL,
          expirationTime: "15m",
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let cachedAuth: Auth | null = null;

/** Request-time singleton accessor. */
export function getAuth(): Auth {
  if (cachedAuth === null) cachedAuth = createAuth();
  return cachedAuth;
}
