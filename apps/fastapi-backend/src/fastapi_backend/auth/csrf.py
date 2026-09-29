"""CSRF protection using double-submit cookie pattern.

The CSRF token is:
- Generated on login/signup and stored in a separate cookie (not HttpOnly so JS can read it)
- Required as a header (X-CSRF-Token) on all state-changing requests
- Compared to the cookie value — if missing or mismatched, reject the request

This protects against CSRF for cookie-based auth where SameSite=Lax is not
sufficient (e.g., cross-site top-level GET navigations that trigger POSTs,
or older browsers without SameSite support).
"""

import secrets
from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, Request, Response, status

from fastapi_backend.config import settings

# Cookie name for the CSRF token (readable by JS, not HttpOnly)
CSRF_COOKIE_NAME = "csrf_token"
# Header name the client must send on state-changing requests
CSRF_HEADER_NAME = "X-CSRF-Token"


def generate_csrf_token() -> str:
    """Generate a cryptographically secure CSRF token."""
    return secrets.token_urlsafe(32)


def set_csrf_cookie(response: Response) -> str:
    """Set the CSRF token cookie on the response; returns the token."""
    token = generate_csrf_token()
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=token,
        httponly=False,  # Must be readable by JavaScript for double-submit
        secure=settings.environment == "production",
        samesite="lax",
        max_age=settings.jwt_expire_minutes * 60,
    )
    return token


def verify_csrf_token(
    request: Request,
    csrf_cookie: str | None = Cookie(default=None, alias=CSRF_COOKIE_NAME),
    csrf_header: str | None = Header(default=None, alias=CSRF_HEADER_NAME),
) -> None:
    """
    Verify the CSRF token from cookie matches the header.

    For cookie-based auth endpoints that mutate state, this dependency
    should be added. Safe methods (GET, HEAD, OPTIONS, TRACE) are exempt.
    """
    # Skip CSRF check for safe methods
    if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
        return

    # All unsafe methods (POST, PUT, PATCH, DELETE) require the token.
    if not csrf_cookie or not csrf_header:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token missing",
        )

    if not secrets.compare_digest(csrf_cookie, csrf_header):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid CSRF token",
        )


def verify_origin(request: Request) -> None:
    """Reject cross-site browser requests by Origin header.

    Used on endpoints that cannot use the double-submit pattern
    (login/signup — no session exists yet). Modern browsers always
    send Origin on cross-site form posts and fetches, so a mismatched
    Origin blocks real-world CSRF; a missing Origin (curl, tests,
    same-origin GET navigations) is allowed and remains covered by
    SameSite=Lax.
    """
    origin = request.headers.get("Origin")
    if origin is None:
        return
    if origin not in settings.cors_origins:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-origin request rejected",
        )


# Dependency for endpoints that need CSRF protection
CSRFDep = Annotated[None, Depends(verify_csrf_token)]
# Dependency for unauthenticated auth endpoints (login/signup)
OriginDep = Annotated[None, Depends(verify_origin)]