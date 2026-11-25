import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth";

/**
 * BetterAuth's catch-all handler.
 *
 * A filesystem route handler does not automatically win over the
 * `/api/:path*` rewrite in `next.config.ts` (dynamic routes are matched
 * after `afterFiles` rewrites), so `next.config.ts` lists the FastAPI
 * prefixes explicitly and leaves `/api/auth/*` to this handler.
 *
 * The BetterAuth instance is built on first request rather than at module
 * import, so `next build` does not run the Mongo index bootstrap.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Handlers = ReturnType<typeof toNextJsHandler>;

let handlers: Handlers | null = null;

function getHandlers(): Handlers {
  if (handlers === null) handlers = toNextJsHandler(getAuth());
  return handlers;
}

export async function GET(request: Request): Promise<Response> {
  return getHandlers().GET(request);
}

export async function POST(request: Request): Promise<Response> {
  return getHandlers().POST(request);
}