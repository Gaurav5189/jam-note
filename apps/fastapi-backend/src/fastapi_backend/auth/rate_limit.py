"""Rate limiting for auth endpoints.

Per-IP rate limits to prevent brute force and credential stuffing on
unauthenticated endpoints (login, signup). Per-user limits for sensitive
authenticated operations (password rotation). Uses in-memory storage
(single-server deployment). For multi-instance, replace with Redis or a
MongoDB TTL-based counter.
"""

import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status


@dataclass
class RateLimitConfig:
    """Configuration for a rate limit bucket."""
    max_requests: int
    window_seconds: float
    # Per-user limits (keyed by user id or "anon" for unauthenticated)
    per_user: dict[str, deque[float]] = field(default_factory=lambda: defaultdict(deque))
    # Per-IP limits (keyed by client IP)
    per_ip: dict[str, deque[float]] = field(default_factory=lambda: defaultdict(deque))


# Rate limit configurations
RATE_LIMITS = {
    "login": RateLimitConfig(
        max_requests=10,
        window_seconds=60.0,  # 10 per minute per IP
    ),
    "signup": RateLimitConfig(
        max_requests=5,
        window_seconds=3600.0,  # 5 per hour per IP
    ),
    "password": RateLimitConfig(
        max_requests=3,
        window_seconds=3600.0,  # 3 per hour per user
    ),
}


def get_client_ip(request: Request) -> str:
    """Extract client IP from request, respecting proxy headers."""
    # Check X-Forwarded-For (set by reverse proxy)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # Take the first IP (client's original IP)
        return forwarded.split(",")[0].strip()
    # Check X-Real-IP (nginx)
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    # Fallback to direct client
    return request.client.host if request.client else "unknown"


def _consume_slot(
    config: RateLimitConfig,
    key: str,
    bucket: dict[str, deque[float]],
) -> None:
    """Check and consume a rate limit slot for the given key."""
    now = time.monotonic()
    window = bucket[key]

    # Remove expired entries
    while window and now - window[0] > config.window_seconds:
        window.popleft()

    if len(window) >= config.max_requests:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again later.",
        )

    window.append(now)


# --- FastAPI dependencies (unauthenticated, per-IP) ---


async def rate_limit_login(request: Request) -> None:
    """Rate limit for login endpoint: 10 attempts per minute per IP."""
    config = RATE_LIMITS["login"]
    ip = get_client_ip(request)
    _consume_slot(config, ip, config.per_ip)


async def rate_limit_signup(request: Request) -> None:
    """Rate limit for signup endpoint: 5 signups per hour per IP."""
    config = RATE_LIMITS["signup"]
    ip = get_client_ip(request)
    _consume_slot(config, ip, config.per_ip)


# --- In-body checks (authenticated, per-user) ---


def rate_limit_password_check(user_id: str) -> None:
    """Rate limit for password rotation: 3 attempts per hour per user.

    Runs inside the endpoint body (not as a dependency) because it
    needs the authenticated user id, which dependencies declared with
    defaults cannot access.
    """
    config = RATE_LIMITS["password"]
    _consume_slot(config, user_id, config.per_user)


# --- Dependency aliases (Annotated style, no defaults) ---


RateLimitLoginDep = Annotated[None, Depends(rate_limit_login)]
RateLimitSignupDep = Annotated[None, Depends(rate_limit_signup)]