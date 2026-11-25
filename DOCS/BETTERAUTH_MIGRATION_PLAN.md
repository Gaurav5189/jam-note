# ADR-0001 — Adopting BetterAuth in jam-note

- **Status:** Implemented (Phases 0–6); Phase 7 cutover/bake pending deployment
- **Date:** 2026-11-25
- **Deciders:** Project owner
- **Scope:** `apps/next-frontend`, `apps/fastapi-backend`, MongoDB schema, deployment
- **Supersedes:** none
- **Related:** `DOCS/ARCHITECTURE.md` §1/§2A/§3/§5, `DOCS/PHASES.md` Phase 1, `DOCS/RULES.md` §4

---

## 1. Context

`jam-note` currently runs a complete, tested, Python-owned auth stack:

- FastAPI issues an HS256 JWT in an HttpOnly `jam_session` cookie.
- `user_sessions` stores a revocable `jti` per login.
- bcrypt hashes live in `users.password_hash` (`pwdlib`).
- Double-submit CSRF (`csrf_token` cookie + `X-CSRF-Token`) guards every mutation.
- Per-IP/per-user in-memory rate limits cover login, signup, and password rotation.
- Password rotation proves the current password; username/display-name/emoji validation is server-side.
- 192 backend tests exist; ~758 lines cover auth and security.

BetterAuth is a **TypeScript/Node** library. It cannot run inside FastAPI. Adopting it means moving the auth *authority* into the Next.js server layer and making FastAPI a **consumer** of BetterAuth sessions. That is an architecture change, not a dependency swap.

### Why consider it at all

The PRD asks for "password recovery" and "session management". BetterAuth provides, out of the box:

- email/password + username sign-in
- email verification and password reset
- social/OAuth providers
- 2FA, passkeys, organizations, admin plugin
- session listing/revocation
- origin/CSRF protection and rate limiting

The current stack already covers everything except **password recovery** and **social/2FA/passkeys**. So the decision is: *do we want BetterAuth's feature set enough to pay the migration cost?*

---

## 2. Decision

**Adopt BetterAuth as the authentication authority in `apps/next-frontend`, keep FastAPI as the application/API authority, and connect them with BetterAuth's JWT plugin + JWKS verification.**

Key constraints:

1. **BetterAuth owns** `/api/auth/*`, credentials, sessions, accounts, verification tokens.
2. **FastAPI owns** notes, folders, search, import/export, profiles, and the outbox.
3. **FastAPI accepts only `Authorization: Bearer <BetterAuth JWT>`** in `betterauth` mode. It stops reading the `jam_session` cookie.
4. **User IDs remain MongoDB `ObjectId`** so the 28 `ObjectId(user_id)` call sites and every tenant filter keep working unchanged.
5. **A `profiles` collection owned by FastAPI** holds `display_name`/`avatar_url`/`settings`, because BetterAuth's `additionalFields` do not support nested JSON documents.
6. **Legacy mode stays available behind `AUTH_MODE=legacy`** for one release so rollback is an env change, not a code revert.

Non-goals for this migration:

- No real-time/multi-user auth work.
- No organization/team model (the app is single-tenant per user today).
- No social login or 2FA in the first cutover (they become available after, as plugins).
- No change to note/folder ownership semantics.

---

## 3. Target architecture

```text
Browser
  │
  ├─ /api/auth/*  ──────────────► Next.js route handler
  │                                  └─ BetterAuth ──► MongoDB
  │                                       (user, session, account,
  │                                        verification, jwks)
  │
  └─ /api/notes/*, /api/folders/*,
     /api/workspace, /api/search,
     /api/import/*, /api/export/* ─► Next.js rewrite ─► FastAPI
                                                          │
                                          verifies Bearer JWT via JWKS
                                                          │
                                                          └─► MongoDB
                                                              (notes, folders,
                                                               profiles,
                                                               event_outbox)

Server Components ─► auth.api.getToken(headers) ─► FastAPI (Bearer)
```

Why the JWT plugin instead of sharing the session collection:

- BetterAuth's session cookie is an implementation detail (signed, rotated, cached).
- The JWT plugin is the documented path for "services that can't use the session".
- FastAPI does not need a Mongo round-trip per request for session lookup.
- JWKS verification is stateless and cacheable.

---

## 4. Data model

### 4.1 BetterAuth collections (native schema)

Use BetterAuth's default collection names to avoid fighting its schema. Keep IDs as `ObjectId`.

| Collection | Purpose | Key fields |
|---|---|---|
| `user` | identity | `_id: ObjectId`, `name`, `email` (unique), `emailVerified`, `image`, `username` (unique), `displayUsername`, `createdAt`, `updatedAt` |
| `session` | active sessions | `_id`, `userId: ObjectId`, `token` (unique), `expiresAt`, `ipAddress`, `userAgent`, `createdAt`, `updatedAt` |
| `account` | credentials/OAuth | `_id`, `userId: ObjectId`, `providerId: "credential"`, `accountId`, `password`, timestamps |
| `verification` | email verify/reset | `_id`, `identifier`, `value`, `expiresAt`, timestamps |
| `jwks` | JWT signing keys | managed by the JWT plugin |

### 4.2 FastAPI-owned collection

| Collection | Purpose | Key fields |
|---|---|---|
| `profiles` | app-specific profile | `_id: ObjectId` (= user id), `user_id: ObjectId` (unique), `display_name`, `avatar_url`, `settings` (theme/editor prefs), `created_at`, `updated_at` |

### 4.3 Retired collections (kept for rollback)

- `users` — old auth records; left untouched until the bake period ends.
- `user_sessions` — old JWT `jti` sessions; invalidated at cutover.

### 4.4 Field mapping (FastAPI `UserOut`)

| `UserOut` field | Source |
|---|---|
| `id` | `user._id` |
| `email` | `user.email` |
| `username` | `user.username` (fallback `displayUsername`) |
| `profile.display_name` | `user.name` (fallback `profiles.display_name`) |
| `profile.avatar_url` | `user.image` (fallback `profiles.avatar_url`) |
| `settings` | `profiles.settings` (default `UserSettings()` if absent) |
| `created_at` | `user.createdAt` (fallback `user.created_at`) |
| `updated_at` | `user.updatedAt` (fallback `user.updated_at`) |

`UserOut.from_auth(user_doc, profile_doc)` becomes the single adapter; `UserOut.from_mongo` stays for tests/legacy mode.

---

## 5. Configuration

### 5.1 Frontend env (`apps/next-frontend/.env.local`)

```bash
MONGODB_URL="mongodb://localhost:27017"
DATABASE_NAME="jam_note"
BETTER_AUTH_SECRET="<openssl rand -hex 32>"
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:8000"
```

Production notes:

- `BETTER_AUTH_URL` must be the **public origin** of the Next.js app (e.g. `https://app.example.com`), not `localhost`.
- `BETTER_AUTH_SECRET` must be unique per environment and at least 32 chars.
- `MONGODB_URL` is the same cluster FastAPI uses. The Next.js server becomes a second database client.
- If the frontend is serverless/scale-to-zero, cache the `MongoClient` on `globalThis` to avoid connection storms.

### 5.2 Backend env (`apps/fastapi-backend/.env`)

```bash
AUTH_MODE="legacy"                                  # "legacy" | "betterauth"
BETTER_AUTH_JWKS_URL="http://localhost:3000/api/auth/jwks"
BETTER_AUTH_ISSUER="http://localhost:3000"
BETTER_AUTH_AUDIENCE="http://localhost:3000"
```

`AUTH_MODE` defaults to `legacy` so the backend can ship before the frontend cutover.

---

## 6. Phase plan

Each phase is independently shippable and reversible.

### Phase 0 — Branch and baseline (0.5 day)

**Goal:** a clean baseline and a staging copy of MongoDB.

- Create `feat/betterauth-migration`.
- Run `uv run pytest` and `pnpm lint && pnpm test && pnpm build`; record green baselines.
- Snapshot the dev database (or use a disposable copy) — the migration script will need a rehearsal.
- Confirm the Next.js runtime target (long-running server vs. serverless) because it changes Mongo pooling and rate-limit strategy.

**Acceptance:** baseline commands green; staging DB available.

---

### Phase 1 — Scaffold BetterAuth in Next.js (1 day)

**New files**

| File | Purpose |
|---|---|
| `apps/next-frontend/lib/auth.ts` | BetterAuth server instance (Mongo adapter, username + JWT plugins, bcrypt verify, hooks) |
| `apps/next-frontend/lib/auth-client.ts` | Browser client (`createAuthClient` + `usernameClient` + `jwtClient`) |
| `apps/next-frontend/app/api/auth/[...all]/route.ts` | `toNextJsHandler(auth)` |
| `apps/next-frontend/lib/mongo.ts` | Module-scoped/global `MongoClient` + `db` for BetterAuth |

**Sketch — `lib/mongo.ts`**

```ts
import { MongoClient, type Db } from "mongodb";

const globalForMongo = globalThis as unknown as {
  _jamMongoClient?: MongoClient;
};

function createClient() {
  return new MongoClient(process.env.MONGODB_URL!, {
    serverSelectionTimeoutMS: 15_000,
  });
}

export const mongoClient =
  globalForMongo._jamMongoClient ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForMongo._jamMongoClient = mongoClient;
}

export const db: Db = mongoClient.db(
  process.env.DATABASE_NAME ?? "jam_note",
);
```

**Sketch — `lib/auth.ts`**

```ts
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { jwt, username } from "better-auth/plugins";
import bcrypt from "bcryptjs";

import { db, mongoClient } from "./mongo";

export const auth = betterAuth({
  database: mongodbAdapter(db, { client: mongoClient }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [process.env.NEXT_PUBLIC_SITE_URL!],

  // Keep IDs as Mongo ObjectIds so FastAPI's ObjectId(user_id)
  // filters and all note/folder ownership checks keep working.
  advanced: {
    database: {
      generateId: false,
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // Existing users were hashed with bcrypt (pwdlib) — verify both
    // the migrated bcrypt hashes and new bcrypt hashes.
    password: {
      hash: async (password) => bcrypt.hash(password, 12),
      verify: async ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },

  user: {
    additionalFields: {
      // Server-managed; never accepted from the client.
      role: { type: "string", required: false, input: false },
    },
  },

  plugins: [username(), jwt()],
});
```

> **Verify before coding:** exact option names (`emailAndPassword.password.hash/verify`, `advanced.database.generateId`) against the installed `better-auth@1.7.x` types. BetterAuth had security releases in June and November 2026 — pin the version and read the changelog.

**Sketch — `app/api/auth/[...all]/route.ts`**

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

**Package changes**

```bash
cd apps/next-frontend
pnpm add better-auth@1.7.27 @better-auth/mongo-adapter mongodb bcryptjs
pnpm add -D @types/bcryptjs   # if needed
```

**Important:** editing this plan's original assumption — a filesystem route
handler does **not** automatically win over the `/api/:path*` rewrite. Next.js
applies `afterFiles` rewrites before *dynamic* routes, and
`app/api/auth/[...all]/route.ts` is dynamic. The first implementation attempt
proxied `/api/auth/sign-up/email` to FastAPI and failed with `ECONNREFUSED`.
`next.config.ts` now lists the FastAPI prefixes explicitly
(`/api/account`, `/api/folders`, `/api/import`, `/api/notes`, `/api/search`,
`/api/workspace`) so `/api/auth/*` always reaches BetterAuth. Add a prefix
there whenever FastAPI gains a new top-level router.

**Acceptance**

- `POST /api/auth/sign-up/email` creates `user`, `account`, `session` docs in a staging DB.
- `POST /api/auth/sign-in/email` returns a session cookie.
- `GET /api/auth/jwks` returns a key set.
- `GET /api/auth/token` returns a JWT for a logged-in session.
- `pnpm build` passes.

---

### Phase 2 — FastAPI JWT verification (1 day)

**Dependencies**

```bash
cd apps/fastapi-backend
uv add "pyjwt[crypto]>=2.14.0"
```

(`pyjwt` is already present; the `[crypto]` extra is required for EdDSA/JWKS.)

**`config.py` additions**

```python
auth_mode: Literal["legacy", "betterauth"] = "legacy"
better_auth_jwks_url: str = "http://localhost:3000/api/auth/jwks"
better_auth_issuer: str = "http://localhost:3000"
better_auth_audience: str = "http://localhost:3000"
```

**`auth/dependencies.py`**

```python
_jwks_client: PyJWKClient | None = None

def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(
            settings.better_auth_jwks_url,
            cache_keys=True,
        )
    return _jwks_client

async def _get_better_auth_user(request, db) -> UserOut:
    token = _bearer_token(request)          # Authorization: Bearer ...
    signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
    payload = pyjwt.decode(
        token,
        signing_key.key,
        algorithms=["EdDSA"],               # pin — no algorithm confusion
        issuer=settings.better_auth_issuer,
        audience=settings.better_auth_audience,
        options={"require": ["sub", "exp", "iat"]},
    )
    user_id = ObjectId(payload["sub"])
    user_doc = await db.user.find_one({"_id": user_id})
    if not user_doc:
        raise HTTPException(401, "User not found")
    profile_doc = await db.profiles.find_one({"_id": user_id})
    return UserOut.from_auth(user_doc, profile_doc)

async def get_current_user(request, db) -> UserOut:
    if settings.auth_mode == "betterauth":
        return await _get_better_auth_user(request, db)
    # existing legacy path (cookie + jti session check) stays unchanged
    ...
```

**`auth/models.py`**

Add `UserOut.from_auth(user_doc, profile_doc)` per §4.4. Keep `from_mongo` for legacy/tests.

**`auth/csrf.py`**

```python
def verify_csrf_token(request, ...):
    if settings.auth_mode == "betterauth":
        # Bearer auth is not ambient; CSRF does not apply.
        # Reject the legacy cookie outright so a browser cannot
        # accidentally authenticate FastAPI with it.
        return
    ...
```

Also ensure the legacy cookie is **not** accepted in `betterauth` mode (the `_get_better_auth_user` path only reads the header).

**`database.py`**

- Keep `users.email`/`users.username` indexes for rollback.
- Add `profiles.user_id` unique index.
- Add `profiles` TTL? No.
- Do **not** create BetterAuth indexes here; the Mongo adapter creates them.

**Tests**

- Unit-test `_get_better_auth_user` with a locally generated Ed25519 key and a patched JWKS client.
- Cases: valid token, expired token, wrong issuer/audience, `alg: HS256` token, unknown `sub`, non-ObjectId `sub`, missing header.
- Keep the legacy tests behind `AUTH_MODE=legacy`.

**Acceptance**

- `GET /api/workspace` succeeds with a BetterAuth JWT and fails without one.
- A valid `jam_session` cookie alone returns 401 in `betterauth` mode.
- `uv run pytest` green.

---

### Phase 3 — Re-home profile routes and retire custom auth endpoints (1 day)

FastAPI's `/api/auth/*` is shadowed by the BetterAuth route handler. Move the app-specific surface to `/api/account/*`.

| Old | New | Implementation |
|---|---|---|
| `GET /api/auth/me` | `GET /api/account/me` | FastAPI, JWT-authenticated, returns `UserOut` |
| `PATCH /api/auth/me` | — | `authClient.updateUser({ name })` (BetterAuth owns `user.name`) |
| `PUT /api/auth/password` | — | `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })` |
| `POST /api/auth/logout` | — | `authClient.signOut()` |
| `GET /api/auth/csrf` | — | delete (BetterAuth handles origin checks) |

**New file:** `apps/fastapi-backend/src/fastapi_backend/account/router.py`

```python
router = APIRouter(prefix="/account", tags=["account"])

@router.get("/me")
async def get_me(current_user: CurrentUserDep) -> UserOut:
    return current_user
```

Register it in `main.py`:

```python
from fastapi_backend.account.router import router as account_router
app.include_router(account_router, prefix="/api")
```

**Delete or unmount** the legacy `auth/router.py` only after the bake period. During the transition, keep it importable but not mounted, or mount it under `/api/legacy-auth` behind `AUTH_MODE=legacy`.

**Profile page changes** (`components/profile/profile-console.tsx`):

- Display name: `await authClient.updateUser({ name: value }); await refreshUser();`
- Password: `await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });`
- Error mapping: BetterAuth returns `{ error: { message, code, status } }`; map to the existing status line/toast.

**Acceptance**

- Profile display-name edit persists to `user.name` and re-renders.
- Password rotation verifies the old password, changes the hash, and revokes other sessions.
- No frontend call to `/api/auth/me`, `/api/auth/password`, `/api/auth/logout`, or `/api/auth/csrf` remains.

---

### Phase 4 — Frontend session plumbing (1 day)

**`lib/api.ts`**

- Remove the CSRF token logic (`getCsrfToken`, `refreshCsrfToken`, `X-CSRF-Token` retry).
- Add a token cache:

```ts
let cached: { token: string; expiresAt: number } | null = null;

async function getAuthToken(force = false): Promise<string | null> {
  if (!force && cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.token;
  }
  const res = await fetch("/api/auth/token", { credentials: "include" });
  if (!res.ok) return null;
  const { token } = (await res.json()) as { token: string };
  const payload = JSON.parse(atob(token.split(".")[1]));
  cached = { token, expiresAt: payload.exp * 1000 };
  return token;
}
```

- Attach `Authorization: Bearer <token>` to every FastAPI call.
- On 401, force-refresh once and retry.
- On logout, clear `cached`.

**`lib/server-api.ts`**

- Replace the cookie-forwarding logic with a BetterAuth server-side token:

```ts
import { headers } from "next/headers";
import { auth } from "./auth";

const { token } = await auth.api.getToken({ headers: await headers() });
// call FastAPI with Authorization: Bearer <token>
```

> Verify the exact server API method name (`getToken`) in the installed version. If unavailable, call the Next.js `/api/auth/token` route with the forwarded cookie.

**`lib/server-user.ts`**

- Point at `/api/account/me` instead of `/api/auth/me`.

**`context/auth-context.tsx`**

- Replace `fetchApi("/api/auth/me")` with `/api/account/me`.
- Replace `fetchApi("/api/auth/logout", { method: "POST" })` with `authClient.signOut()`.
- Keep `refreshUser` semantics.

**`components/auth/auth-slips.tsx`**

- Login:
  - If the identifier contains `@`: `authClient.signIn.email({ email, password })`.
  - Else: `authClient.signIn.username({ username, password })`.
- Signup: `authClient.signUp.email({ email, password, name, username })`.
- Map BetterAuth errors to the existing field errors/toasts.
- Keep the current client-side validation (username regex, emoji ban, password length) for UX; the server must still enforce it (see Phase 5).

**`proxy.ts`**

```ts
import { getSessionCookie } from "better-auth/cookies";

const session = getSessionCookie(request);
```

- Keep the presence-only optimistic guard; the `(app)` layout still verifies server-side via `/api/account/me`.
- Keep the public-route and auth-page redirect logic unchanged.

**`components/desk/desk-chrome.tsx`**

- Replace the logout `fetchApi` with `authClient.signOut()`.

**Acceptance**

- Login, signup, logout, and protected-route redirects work end-to-end.
- A hard refresh rehydrates the session.
- Server Components fetch user/workspace without a client round-trip.
- `pnpm lint && pnpm test && pnpm build` green.

---

### Phase 5 — Security parity and server-side validation (1 day)

BetterAuth replaces the mechanics, but the **behavior** must match.

| Control | Current | BetterAuth configuration |
|---|---|---|
| Password length | 8–128 | `emailAndPassword.minPasswordLength/maxPasswordLength` |
| Username format | `^[a-zA-Z0-9_]+$`, 3–50 | `username({ usernameValidator, minUsernameLength: 3, maxUsernameLength: 50 })` |
| Display name | `^[a-zA-Z0-9 ]+$` | `databaseHooks.user.update.before` (or `user.name` validator) |
| Emoji ban | server-side | `databaseHooks.user.create/update.before` |
| Login rate limit | 10/min/IP | `rateLimit` custom rule for `/sign-in/*` |
| Signup rate limit | 5/hour/IP | `rateLimit` custom rule for `/sign-up/*` |
| Password rate limit | 3/hour/user | BetterAuth `changePassword` rate limit + `revokeOtherSessions` |
| Session revocation | `user_sessions` | BetterAuth session table + `revokeOtherSessions` |
| CSRF | double-submit | BetterAuth origin check + `trustedOrigins`; FastAPI Bearer-only |
| Cookie flags | HttpOnly, Secure in prod, Lax | BetterAuth defaults; verify `advanced.useSecureCookies` |

**Sketch — validation hooks**

```ts
const USERNAME_RE = /^[a-zA-Z0-9_]+$/;
const DISPLAY_NAME_RE = /^[a-zA-Z0-9 ]+$/;
const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}...]/u;

function assertClean(value: string, label: string) {
  if (EMOJI_RE.test(value)) throw new APIError("BAD_REQUEST", {
    message: `${label} must not contain emoji`,
  });
}

databaseHooks: {
  user: {
    create: {
      before: async (user) => {
        assertClean(user.name ?? "", "Display name");
        if (!DISPLAY_NAME_RE.test(user.name ?? "")) {
          throw new APIError("BAD_REQUEST", {
            message: "Display name must contain only alphanumeric characters and spaces",
          });
        }
        return { data: user };
      },
    },
    update: {
      before: async (user) => {
        if (user.name) {
          assertClean(user.name, "Display name");
          if (!DISPLAY_NAME_RE.test(user.name)) {
            throw new APIError("BAD_REQUEST", {
              message: "Display name must contain only alphanumeric characters and spaces",
            });
          }
        }
        return { data: user };
      },
    },
  },
},
```

**Rate-limit sketch**

```ts
rateLimit: {
  enabled: true,
  window: 60,
  max: 10,
  customRules: {
    "/sign-in/email": { window: 60, max: 10 },
    "/sign-in/username": { window: 60, max: 10 },
    "/sign-up/email": { window: 3600, max: 5 },
    "/change-password": { window: 3600, max: 3 },
  },
},
```

> BetterAuth's default rate limiter is in-memory. If the frontend runs multiple instances/serverless, add `secondaryStorage` (Redis) for real enforcement. The current FastAPI limiter has the same single-instance caveat, so this is not a regression — but document it.

**Acceptance**

- The security test matrix passes in `betterauth` mode.
- Emoji/username/display-name violations are rejected server-side (not just client-side).
- Rate limits trigger 429s in tests.
- Password change revokes other sessions.

---

### Phase 6 — User migration (0.5–1 day, optional)

Skip if the dev database is disposable (the project already wiped notes at the Phase 6 cutover). Otherwise:

**Script:** `apps/fastapi-backend/scripts/migrate_auth_to_betterauth.py`

For each `users` document:

1. Insert `user`:
   - `_id`: same `ObjectId`
   - `name`: `profile.display_name` or `username`
   - `email`, `emailVerified: true` (existing accounts were usable)
   - `image`: `profile.avatar_url`
   - `username`, `displayUsername`: existing `username`
   - `createdAt`/`updatedAt`: from `created_at`/`updated_at`
2. Insert `account`:
   - `userId`: same `ObjectId`
   - `providerId: "credential"`
   - `accountId`: `str(_id)`
   - `password`: existing `password_hash` (bcrypt — the `verify` hook handles it)
3. Insert `profiles`:
   - `_id` and `user_id`: same `ObjectId`
   - `display_name`, `avatar_url`, `settings`, timestamps
4. Leave `users`/`user_sessions` untouched for rollback.

**Idempotency:** upsert by `_id`; skip existing `user` docs unless `--force`.

**Sessions:** old `jam_session` cookies are invalid after cutover. Users log in again. Document this in the release notes.

**Verification:**

- Counts match (`users` == `user` == `account` == `profiles`).
- Every note/folder `user_id` still resolves to a `user._id`.
- A migrated user can log in with their old password.
- A migrated user's workspace renders unchanged.

**Rollback:** set `AUTH_MODE=legacy`; the old `users` collection is intact.

---

### Phase 7 — Cutover, bake, and cleanup (1–2 days)

**Cutover order**

1. Deploy the frontend with BetterAuth + the new auth pages, but keep `AUTH_MODE=legacy` on FastAPI.
   - BetterAuth is reachable, but the app still uses legacy auth.
   - Smoke-test signup/login/token/JWKS against staging.
2. Run the migration script (if keeping users). Verify counts.
3. Set `AUTH_MODE=betterauth` on FastAPI. Deploy.
4. Deploy the frontend auth changes (or flip the feature flag).
5. Smoke-test:
   - signup → dashboard
   - logout → login by email
   - login by username
   - create/rename/delete a note
   - profile display-name edit
   - password change → old password rejected
   - expired/invalid token → 401 → redirect to `/login`
6. Bake 1–2 weeks. Monitor:
   - 401 rate on `/api/*`
   - login/signup error rate
   - rate-limit 429s
   - JWKS fetch failures
   - Mongo connection counts

**Cleanup (after bake)**

- Delete `auth/router.py`, `auth/csrf.py`, `auth/rate_limit.py`, `auth/session_store.py` (or keep only what tests need).
- Remove `jam_session`/`csrf_token` references from `proxy.ts`, `lib/api.ts`, `lib/server-api.ts`, tests, and docs.
- Drop `users` and `user_sessions` (after a final backup).
- Remove `AUTH_MODE` and the legacy branch.
- Update `ARCHITECTURE.md`, `PHASES.md`, `RULES.md`, `INSTALLATION.md`, `README.md`.

---

## 7. File-by-file change map

### Frontend

| File | Change |
|---|---|
| `apps/next-frontend/package.json` | add `better-auth`, `@better-auth/mongo-adapter`, `mongodb`, `bcryptjs` |
| `apps/next-frontend/lib/auth.ts` | **new** BetterAuth server config |
| `apps/next-frontend/lib/auth-client.ts` | **new** browser client |
| `apps/next-frontend/lib/mongo.ts` | **new** cached `MongoClient` |
| `apps/next-frontend/app/api/auth/[...all]/route.ts` | **new** BetterAuth handler |
| `apps/next-frontend/lib/api.ts` | remove CSRF; add Bearer token cache + 401 retry |
| `apps/next-frontend/lib/server-api.ts` | use `auth.api.getToken` instead of forwarding `jam_session` |
| `apps/next-frontend/lib/server-user.ts` | `/api/auth/me` → `/api/account/me` |
| `apps/next-frontend/proxy.ts` | `jam_session` → `getSessionCookie` |
| `apps/next-frontend/context/auth-context.tsx` | `authClient` for session/logout |
| `apps/next-frontend/components/auth/auth-slips.tsx` | `authClient.signIn/signUp` |
| `apps/next-frontend/components/profile/profile-console.tsx` | `authClient.updateUser/changePassword` |
| `apps/next-frontend/components/desk/desk-chrome.tsx` | `authClient.signOut` |
| `apps/next-frontend/lib/types.ts` | no shape change; keep `User` contract |
| `apps/next-frontend/next.config.ts` | **changed** — replaces the `/api/:path*` catch-all with explicit FastAPI prefixes so BetterAuth's dynamic route handler is reachable |

### Backend

| File | Change |
|---|---|
| `apps/fastapi-backend/pyproject.toml` | `pyjwt[crypto]` |
| `apps/fastapi-backend/src/fastapi_backend/config.py` | `auth_mode`, JWKS/issuer/audience settings |
| `apps/fastapi-backend/src/fastapi_backend/auth/dependencies.py` | Bearer + JWKS verification branch |
| `apps/fastapi-backend/src/fastapi_backend/auth/models.py` | `UserOut.from_auth` |
| `apps/fastapi-backend/src/fastapi_backend/auth/csrf.py` | bypass in `betterauth` mode |
| `apps/fastapi-backend/src/fastapi_backend/auth/router.py` | unmount/retire after bake |
| `apps/fastapi-backend/src/fastapi_backend/auth/session_store.py` | retire after bake |
| `apps/fastapi-backend/src/fastapi_backend/auth/rate_limit.py` | retire after bake (BetterAuth owns auth limits) |
| `apps/fastapi-backend/src/fastapi_backend/account/router.py` | **new** `GET /api/account/me` |
| `apps/fastapi-backend/src/fastapi_backend/main.py` | mount `account_router`; conditionally mount legacy auth |
| `apps/fastapi-backend/src/fastapi_backend/database.py` | `profiles.user_id` unique index; keep old indexes during bake |
| `apps/fastapi-backend/scripts/migrate_auth_to_betterauth.py` | **new** optional migration |
| `apps/fastapi-backend/tests/conftest.py` | Bearer token fixture instead of CSRF injection |
| `apps/fastapi-backend/tests/test_auth_routes.py` | rewrite for BetterAuth mode |
| `apps/fastapi-backend/tests/test_auth_service.py` | keep legacy tests; add JWT verifier tests |
| `apps/fastapi-backend/tests/test_security.py` | split legacy/CSRF vs. Bearer/JWKS cases |

### Docs

| File | Change |
|---|---|
| `DOCS/ARCHITECTURE.md` | §1 stack, §2A users, §3 auth routes, §5 security |
| `DOCS/PHASES.md` | Phase 1 auth note; add a migration phase |
| `DOCS/RULES.md` | §4 indexes (`user` collection) |
| `INSTALLATION.md` | new env vars and local setup |
| `README.md` | auth stack summary |

---

## 8. Test plan

### Backend

- **JWT verifier:** valid/expired/wrong-alg/wrong-issuer/wrong-audience/unknown-sub/non-ObjectId-sub.
- **Auth mode isolation:** a `jam_session` cookie alone → 401 in `betterauth` mode; a Bearer token alone → 200.
- **Tenant isolation:** a JWT for user A cannot read user B's notes/folders (existing tests, re-run with Bearer fixtures).
- **CSRF:** legacy mode still enforces double-submit; `betterauth` mode ignores it (and does not accept the cookie).
- **Profile:** `GET /api/account/me` composes `user` + `profiles` correctly; defaults apply when `profiles` is missing.
- **Migration script:** idempotent; counts match; old password works; note ownership preserved.
- **Rate limits:** 429 after the configured threshold (BetterAuth integration test or a focused unit test around the limiter config).

### Frontend

- **Token cache:** reuses a valid token; refreshes near expiry; retries once on 401.
- **Proxy:** redirects unauthenticated users; lets authenticated users through; public routes stay public.
- **Auth forms:** email login, username login, signup, error mapping.
- **Profile:** display-name edit and password change call the right client methods.
- **Build:** `pnpm lint && pnpm test && pnpm build`.

### Manual/E2E smoke

1. Sign up → land on `/dashboard`.
2. Create a note → refresh → content persists.
3. Logout → `/login` → log in by email.
4. Logout → log in by username.
5. Edit display name → refresh → persists.
6. Change password → logout → old password fails → new password works.
7. Open a protected route with no session → redirect to `/login`.
8. Expire/clear the JWT in devtools → next API call redirects to `/login`.

---

## 9. Risks and mitigations

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | BetterAuth generates string IDs, breaking `ObjectId(user_id)` | High | `advanced.database.generateId: false`; integration test that a signup produces a 24-hex `_id`; keep `ObjectId` casts |
| R2 | Nested `profile`/`settings` unsupported by `additionalFields` | High | Separate `profiles` collection + `UserOut.from_auth` adapter |
| R3 | `/api/auth/*` route handler shadows the FastAPI rewrite | High | Intentional; move app routes to `/api/account/*`; test that `/api/notes/*` still reaches FastAPI |
| R4 | JWT verification bugs (alg confusion, stale JWKS, clock skew) | High | Pin `EdDSA`; `iss`/`aud` checks; JWKS cache; small clock skew; 401-refresh path |
| R5 | CSRF regression on FastAPI mutations | Medium | Bearer-only FastAPI; reject the legacy cookie; keep CORS restricted; add a test that cookie-only mutations fail |
| R6 | Rate-limit regression | Medium | Configure BetterAuth `rateLimit`; test 429s; document the single-instance caveat |
| R7 | Serverless Mongo connection storms / cold starts | Medium | Global `MongoClient`; connection pool limits; monitor; consider a long-running frontend service |
| R8 | Existing users cannot log in | High | Migration script or explicit wipe; release note "log in again" |
| R9 | bcrypt/scrypt mismatch | High | Custom `verify` hook + migration copies the existing hash; test a migrated login |
| R10 | Email reset not deliverable | Medium | Only enable `sendResetPassword` once an email provider (Resend/SMTP) is configured |
| R11 | BetterAuth security advisories | Medium | Pin `1.7.27`; watch the security blog; upgrade deliberately |
| R12 | Two writers to MongoDB | Medium | Clear ownership: BetterAuth writes auth collections; FastAPI writes app collections; no shared writes |

---

## 10. Rollback

**Fast rollback (minutes):**

1. Set `AUTH_MODE=legacy` on FastAPI and redeploy.
2. Redeploy the previous frontend build (Railway keeps prior deployments), or revert the BetterAuth route handler + auth-page commits.
3. Users log in again (old `users`/`user_sessions` are intact).

**Why this works:** the migration never mutates the old `users` collection, and the legacy code path stays in the backend behind the flag. The only irreversible step is the cleanup phase — do that only after the bake period.

**Data rollback:** if the migration script wrote `user`/`account`/`profiles`, delete those collections. Old `users` is untouched.

---

## 11. Effort estimate

| Phase | Work | Estimate |
|---|---|---|
| 0 | Branch, baseline, staging DB | 0.5 day |
| 1 | BetterAuth scaffold + route handler | 1 day |
| 2 | FastAPI JWT verification + tests | 1 day |
| 3 | Re-home profile routes | 1 day |
| 4 | Frontend session plumbing | 1 day |
| 5 | Security parity (validation/rate limits) | 1 day |
| 6 | User migration (optional) | 0.5–1 day |
| 7 | Cutover, bake, cleanup | 1–2 days |
| **Total** | | **6–8 days** (5–6 without user migration) |

The earlier 3–5 day estimate assumed no user migration and no security-parity work. This plan is the production-grade estimate.

---

## 15. Implementation notes (what actually shipped)

Phases 0–6 are implemented on `feat/betterauth-migration`. Verified against a
real MongoDB + running Next.js dev server:

- Signup creates `user` + `account` + `session` + `profiles`; `user._id` is a
  24-hex ObjectId (`advanced.database.generateId: false`).
- `GET /api/auth/jwks` serves an Ed25519 key; `GET /api/auth/token` returns a
  15-minute token with `sub` = ObjectId, `iss`/`aud` = `BETTER_AUTH_URL`.
- FastAPI in `AUTH_MODE=betterauth` returns the composed `UserOut` for a valid
  Bearer token, and 401 for: missing header, a valid `jam_session` cookie only,
  expired token, wrong `iss`/`aud`, `HS256` algorithm-confusion, unknown `sub`,
  non-ObjectId `sub`.
- Server-side validation matches legacy behaviour: emoji display names,
  invalid usernames, and short passwords all 400; the 6th signup in an hour
  returns 429.
- Migration script is idempotent and preserves bcrypt passwords: a migrated
  legacy user signs in with their old password, and their `profiles.settings`
  (`theme=light`, `canvas`, `Mono`, `16`) survives.
- `POST /update-user` updates `user.name`; `POST /change-password` rejects a
  wrong current password (`INVALID_PASSWORD`) and succeeds with
  `revokeOtherSessions: true`.
- `pnpm lint`, `pnpm test` (170), `pnpm build`, and `uv run pytest` (213:
  202 legacy + 11 BetterAuth) are green.

Deviations from the original plan, all deliberate:

1. **`next.config.ts` must change.** The plan assumed the route handler would
   win over the rewrite. It does not (dynamic routes are matched after
   `afterFiles` rewrites), so the rewrite is now an explicit prefix list.
2. **`transaction: false` by default.** The Mongo adapter defaults to
   transactions when a client is provided, which fails on standalone MongoDB.
   Opt in with `MONGODB_TRANSACTIONS=true` on Atlas/replica sets.
3. **`usernameNormalization: false`.** Preserves exact-case migrated usernames
   and legacy exact-match login. New signups are lowercase-constrained client
   side and `a-zA-Z0-9_` server side.
4. **Display-name update goes through BetterAuth** (`update-user`), not a
   FastAPI PATCH — FastAPI's `user` document isn't writable by the app.
5. **`profiles` is keyed by `user_id`** (unique) with no `_id` mirror; the
   signup hook upserts on an **ObjectId** `user_id` (matching FastAPI's
   `ObjectId(current_user.id)` lookup — a string here silently falls back to
   default settings).

Still pending (deployment work, not code):

- Set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `MONGODB_URL`,
  `DATABASE_NAME` on the frontend service; set `AUTH_MODE=betterauth`,
  `BETTER_AUTH_JWKS_URL`, `BETTER_AUTH_ISSUER`, `BETTER_AUTH_AUDIENCE` on the
  backend.
- Run `scripts/migrate_auth_to_betterauth.py` against the target database
  (rehearse with `--dry-run` first), then flip `AUTH_MODE`.
- Bake, then delete the legacy auth modules and `users`/`user_sessions`.

---

## 16. Open questions

1. **Existing users:** keep and migrate, or wipe? The docs say dev data is disposable; confirm before Phase 6.
2. **Email features:** do you want email verification/password reset at launch? If yes, choose an email provider (Resend, Postmark, SMTP) before Phase 5.
3. **Deployment shape:** is the Next.js app a long-running server or serverless/scale-to-zero? This decides Mongo pooling and whether to add Redis for rate limits.
4. **Social/2FA:** enable any providers now, or keep parity first?
5. **Profile ownership:** is `user.name` the canonical display name (recommended), or do you want `profiles.display_name` to remain authoritative? The plan assumes `user.name`.
6. **Acceptable bundle additions:** `mongodb`, `bcryptjs`, and `better-auth` are server-only; confirm they are acceptable in the frontend dependency tree.

---

## 17. Recommended default answers

- Keep and migrate existing users (safer; the script is cheap).
- Disable email verification at cutover; add password reset immediately after, once an email provider is chosen.
- Treat `user.name` as the display name; keep `profiles` for theme/editor settings.
- Add Redis-backed rate limiting only if the frontend runs multiple instances.
- Pin `better-auth@1.7.27` and schedule a dependency review each quarter.

---

## 18. Definition of done

- [ ] `AUTH_MODE=betterauth` in production; legacy path still deployable for one release.
- [ ] Signup, email login, username login, logout, refresh, and protected redirects work.
- [ ] FastAPI rejects cookie-only auth and accepts only valid BetterAuth JWTs.
- [ ] Notes/folders/import/search tenant isolation is unchanged (existing tests green with Bearer fixtures).
- [ ] Display-name edit and password change work through BetterAuth; password change revokes other sessions.
- [ ] Server-side username/display-name/emoji validation and rate limits match the old behavior.
- [ ] `uv run pytest`, `pnpm lint`, `pnpm test`, and `pnpm build` are green.
- [ ] Migration script verified on a staging copy (if used).
- [ ] `ARCHITECTURE.md`, `PHASES.md`, `RULES.md`, `INSTALLATION.md`, and `README.md` updated.
- [ ] Legacy auth code and collections removed after the bake period.
