import { cache } from "react";

import { serverFetchApi } from "./server-api";
import type { User } from "./types";

/**
 * Request-scoped cached user fetch — the (app) layout and the profile
 * page both need the user, and React's cache() collapses them into a
 * single /api/auth/me call per render pass.
 */
export const getServerUser = cache(() => serverFetchApi<User>("/api/auth/me"));
