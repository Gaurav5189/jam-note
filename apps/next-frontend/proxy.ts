import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const token = request.cookies.get("jam_session")?.value;
  const pathname = request.nextUrl.pathname;
  const isAuthPage = pathname === "/login" || pathname === "/signup";
  const isLanding = pathname === "/";
  // Public, unauthenticated surfaces: the Phase 5 marketing landing, the
  // Phase 6 publishing hub routes, and the offline fallback page (the
  // service worker precaches it at install time — it must 200 for both
  // signed-in and signed-out states, never a redirect).
  const isPublicPage =
    isLanding || pathname.startsWith("/pub/") || pathname === "/offline";

  // Allow API routes to be handled by FastAPI backend via rewrites
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Logged-in users skip marketing and auth surfaces entirely — they go
  // straight into the workspace (no landing flash on "/" or login pages).
  if (token && (isLanding || isAuthPage)) {
    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  // Redirect to login if accessing a protected route without a token.
  // This guard only checks presence; the (app) layout re-verifies the
  // session server-side and redirects stale cookies to /login itself.
  if (!token && !isAuthPage && !isPublicPage) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - robots.txt / sitemap.xml (SEO routes must stay crawlable, no session)
     * - opengraph-image (generated OG image route, incl. hashed variants)
     * - sw.js (the service worker must be fetchable by the browser itself,
     *   regardless of session state)
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|opengraph-image|sw.js).*)",
  ],
};
