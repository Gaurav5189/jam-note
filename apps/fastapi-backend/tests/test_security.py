"""Security hardening tests — CSRF, rate limiting, JWT pinning, config.

Covers the P0/P1 remediations from SECURITY_AUDIT_REPORT.md:

- CSRF double-submit cookie + header enforcement on all unsafe methods
- Origin check on unauthenticated auth endpoints (login/signup)
- Per-IP rate limits on login/signup; per-user limit on password rotation
- JWT decode pinned to HS256 (algorithm confusion rejected)
- Production config fails closed on missing/weak JWT_SECRET
- Security headers middleware (X-Frame-Options etc.; HSTS/CSP in prod)
"""

import jwt as pyjwt
import pytest
from httpx import ASGITransport, AsyncClient
from typing import AsyncGenerator
from pydantic import ValidationError

from fastapi_backend.config import KNOWN_WEAK_SECRETS, Settings
from fastapi_backend.main import app
from fastapi_backend.auth.csrf import CSRF_COOKIE_NAME, CSRF_HEADER_NAME
from fastapi_backend.database import get_db
from mongomock_motor import AsyncMongoMockClient
from motor.motor_asyncio import AsyncIOMotorDatabase


@pytest.fixture
def raw_mock_db() -> AsyncIOMotorDatabase:
    """Mock DB for the raw client (no CSRF auto-inject hook)."""
    client = AsyncMongoMockClient()
    return client["test_jam_note_security"]


@pytest.fixture
async def raw_client(raw_mock_db: AsyncIOMotorDatabase) -> AsyncGenerator[AsyncClient, None]:
    """Client WITHOUT the conftest CSRF auto-inject hook, with its own
    mock DB override. Tests that need to assert raw double-submit
    behaviour use this instead of the standard `client` fixture."""
    async def override_get_db() -> AsyncIOMotorDatabase:
        return raw_mock_db

    app.dependency_overrides[get_db] = override_get_db

    ac = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    async with ac:
        yield ac

    app.dependency_overrides.clear()


async def _signup_raw(ac: AsyncClient, email: str, username: str) -> dict:
    """Signup helper returning the parsed user JSON."""
    response = await ac.post(
        "/api/auth/signup",
        json={
            "email": email,
            "username": username,
            "password": "password123",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


# ---------------------------------------------------------------------------
# CSRF double-submit
# ---------------------------------------------------------------------------


async def test_csrf_missing_header_rejected(raw_client):
    """A state-changing request with no X-CSRF-Token header → 403,
    even with a valid session cookie."""
    await _signup_raw(raw_client, "csrf_missing@jamnote.dev", "csrf_missing")
    assert CSRF_COOKIE_NAME in raw_client.cookies

    response = await raw_client.post("/api/notes", json={"title": "Blocked"})
    assert response.status_code == 403
    assert "CSRF" in response.json()["detail"]


async def test_csrf_mismatched_header_rejected(raw_client):
    """Header present but not equal to the cookie → 403."""
    await _signup_raw(raw_client, "csrf_wrong@jamnote.dev", "csrf_wrong")

    response = await raw_client.post(
        "/api/notes",
        json={"title": "Blocked"},
        headers={CSRF_HEADER_NAME: "attacker-controlled-value"},
    )
    assert response.status_code == 403


async def test_csrf_matching_header_accepted(raw_client):
    """Cookie + matching header → request passes the CSRF gate."""
    await _signup_raw(raw_client, "csrf_ok@jamnote.dev", "csrf_ok")

    response = await raw_client.post(
        "/api/notes",
        json={"title": "Allowed"},
        headers={CSRF_HEADER_NAME: raw_client.cookies.get(CSRF_COOKIE_NAME)},
    )
    assert response.status_code == 201


async def test_csrf_safe_methods_exempt(raw_client):
    """GETs never require the CSRF token."""
    await _signup_raw(raw_client, "csrf_get@jamnote.dev", "csrf_get")

    response = await raw_client.get("/api/notes")
    assert response.status_code == 200


async def test_csrf_cookie_set_on_login_and_signup(raw_client):
    """Both login and signup issue the CSRF cookie alongside the session."""
    await _signup_raw(raw_client, "csrf_issue@jamnote.dev", "csrf_issue")
    assert CSRF_COOKIE_NAME in raw_client.cookies

    raw_client.cookies.clear()
    response = await raw_client.post(
        "/api/auth/login",
        json={"email_or_username": "csrf_issue@jamnote.dev", "password": "password123"},
    )
    assert response.status_code == 200
    assert CSRF_COOKIE_NAME in raw_client.cookies


async def test_csrf_endpoint_issues_token(raw_client):
    """GET /api/auth/csrf mints a token for pre-rollout sessions."""
    await _signup_raw(raw_client, "csrf_mint@jamnote.dev", "csrf_mint")
    raw_client.cookies.delete(CSRF_COOKIE_NAME)

    response = await raw_client.get("/api/auth/csrf")
    assert response.status_code == 200
    token = response.json()["csrf_token"]
    assert token
    # The new cookie self-heals the next mutation.
    response = await raw_client.post(
        "/api/notes",
        json={"title": "Healed"},
        headers={CSRF_HEADER_NAME: token},
    )
    assert response.status_code == 201


# ---------------------------------------------------------------------------
# Origin check (login/signup CSRF)
# ---------------------------------------------------------------------------


async def test_cross_origin_login_rejected(raw_client):
    """A browser cross-site POST carries a foreign Origin → 403."""
    response = await raw_client.post(
        "/api/auth/login",
        json={"email_or_username": "x@jamnote.dev", "password": "password123"},
        headers={"Origin": "https://evil.example"},
    )
    assert response.status_code == 403


async def test_allowed_origin_login_passes_origin_gate(raw_client):
    """Origin within cors_origins clears the gate (auth failure is 401,
    not 403 — the origin check must not leak into credential errors)."""
    response = await raw_client.post(
        "/api/auth/login",
        json={"email_or_username": "x@jamnote.dev", "password": "password123"},
        headers={"Origin": "http://localhost:3000"},
    )
    assert response.status_code == 401


async def test_missing_origin_login_allowed(raw_client):
    """Non-browser clients (curl, tests) send no Origin — allowed."""
    response = await raw_client.post(
        "/api/auth/login",
        json={"email_or_username": "x@jamnote.dev", "password": "password123"},
    )
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------


async def test_login_rate_limited(raw_client):
    """10 login attempts per minute per IP — the 11th is throttled even
    with correct credentials."""
    await _signup_raw(raw_client, "rl_login@jamnote.dev", "rl_login")

    for _ in range(10):
        response = await raw_client.post(
            "/api/auth/login",
            json={"email_or_username": "rl_login@jamnote.dev", "password": "wrong"},
        )
        assert response.status_code == 401

    response = await raw_client.post(
        "/api/auth/login",
        json={
            "email_or_username": "rl_login@jamnote.dev",
            "password": "password123",
        },
    )
    assert response.status_code == 429


async def test_signup_rate_limited(raw_client):
    """5 signups per hour per IP — the 6th is throttled."""
    for i in range(5):
        await _signup_raw(raw_client, f"rl_signup{i}@jamnote.dev", f"rl_signup{i}")

    response = await raw_client.post(
        "/api/auth/signup",
        json={"email": "rl_over@jamnote.dev", "username": "rl_over", "password": "password123"},
    )
    assert response.status_code == 429


async def test_password_rotation_rate_limited(client: AsyncClient, mock_db):
    """3 password rotations per hour per user — the 4th is throttled."""
    await _signup_raw(client, "rl_pw@jamnote.dev", "rl_pw")

    for _ in range(3):
        response = await client.put(
            "/api/auth/password",
            json={
                "current_password": "wrong",
                "new_password": "newpassword123",
                "confirm_password": "newpassword123",
            },
        )
        assert response.status_code == 400

    response = await client.put(
        "/api/auth/password",
        json={
            "current_password": "password123",
            "new_password": "newpassword123",
            "confirm_password": "newpassword123",
        },
    )
    assert response.status_code == 429


# ---------------------------------------------------------------------------
# JWT algorithm pinning
# ---------------------------------------------------------------------------


async def test_jwt_algorithm_confusion_rejected(raw_client):
    """A token signed with HS384 (same secret) must be rejected — decode
    is pinned to HS256."""
    from fastapi_backend.config import settings

    user = await _signup_raw(raw_client, "jwt_alg@jamnote.dev", "jwt_alg")

    # Control: the issued HS256 session works.
    response = await raw_client.get("/api/auth/me")
    assert response.status_code == 200

    # Forged HS384 token with the same secret and sub claim.
    forged = pyjwt.encode(
        {"sub": user["id"]},
        settings.jwt_secret,
        algorithm="HS384",
    )
    raw_client.cookies.set("jam_session", forged)
    response = await raw_client.get("/api/auth/me")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Config: production fails closed on weak JWT secrets
# ---------------------------------------------------------------------------


def test_config_rejects_weak_secret_in_production():
    for weak in ("", "super-secret-dev-key-change-in-production", "short"):
        with pytest.raises(ValidationError):
            Settings(_env_file=None, environment="production", jwt_secret=weak)


def test_config_accepts_strong_secret_in_production():
    strong = "a" * 32
    s = Settings(_env_file=None, environment="production", jwt_secret=strong)
    assert s.jwt_secret == strong


def test_config_dev_generates_secret_when_missing():
    """Development with no JWT_SECRET never falls back to a known
    constant — it mints a random per-process secret."""
    s = Settings(_env_file=None)
    assert len(s.jwt_secret) >= 32
    assert s.jwt_secret not in KNOWN_WEAK_SECRETS


# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------


async def test_security_headers_present(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    # HSTS/CSP are production-only.
    assert "Strict-Transport-Security" not in response.headers
    assert "Content-Security-Policy" not in response.headers


async def test_security_headers_production_mode(
    client: AsyncClient, monkeypatch
):
    from fastapi_backend.config import settings

    monkeypatch.setattr(settings, "environment", "production")
    response = await client.get("/health")

    assert response.headers["Strict-Transport-Security"] == (
        "max-age=31536000; includeSubDomains"
    )
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]


async def test_session_cookie_secure_flag_in_production(raw_client, monkeypatch):
    from fastapi_backend.config import settings

    monkeypatch.setattr(settings, "environment", "production")
    response = await raw_client.post(
        "/api/auth/signup",
        json={
            "email": "secure_flag@jamnote.dev",
            "username": "secure_flag",
            "password": "password123",
        },
    )
    assert response.status_code == 201
    assert "Secure" in response.headers["set-cookie"]