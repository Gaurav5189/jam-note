"""BetterAuth JWT verification (AUTH_MODE=betterauth).

The legacy cookie/JWT tests live in `test_auth_routes.py` and
`test_security.py`; these exercise the Bearer + JWKS path that replaces
them after the cutover.
"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import jwt as pyjwt
import pytest
from bson import ObjectId
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from httpx import AsyncClient
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi_backend.auth import dependencies as auth_dependencies
from fastapi_backend.auth.models import UserOut
from fastapi_backend.config import settings

ISSUER = "http://localhost:3000"
AUDIENCE = "http://localhost:3000"


class _FakeJWKSClient:
    """Stands in for PyJWKClient — no network, no key cache."""

    def __init__(self, public_key: object) -> None:
        self._public_key = public_key

    def get_signing_key_from_jwt(self, _token: str) -> SimpleNamespace:
        return SimpleNamespace(key=self._public_key)


@pytest.fixture
def betterauth_mode(monkeypatch: pytest.MonkeyPatch) -> Ed25519PrivateKey:
    """Switch the app to BetterAuth mode with a local Ed25519 signing key."""
    private_key = Ed25519PrivateKey.generate()
    fake_client = _FakeJWKSClient(private_key.public_key())

    monkeypatch.setattr(settings, "auth_mode", "betterauth")
    monkeypatch.setattr(settings, "better_auth_issuer", ISSUER)
    monkeypatch.setattr(settings, "better_auth_audience", AUDIENCE)
    monkeypatch.setattr(settings, "better_auth_jwt_algorithm", "EdDSA")
    monkeypatch.setattr(auth_dependencies, "_jwks_client", fake_client)
    yield private_key
    auth_dependencies.reset_jwks_client()


def _token(
    private_key: Ed25519PrivateKey,
    *,
    subject: str,
    expires_in: int = 900,
    issuer: str = ISSUER,
    audience: str = AUDIENCE,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
        "iss": issuer,
        "aud": audience,
    }
    return pyjwt.encode(
        payload, private_key, algorithm="EdDSA", headers={"kid": "test-key"}
    )


async def _seed_user(
    db: AsyncIOMotorDatabase,
    *,
    with_profile: bool = True,
) -> ObjectId:
    user_id = ObjectId()
    now = datetime.now(timezone.utc)
    await db.user.insert_one(
        {
            "_id": user_id,
            "email": "bearer@example.com",
            "username": "bearer_user",
            "name": "Bearer User",
            "emailVerified": True,
            "image": None,
            "createdAt": now,
            "updatedAt": now,
        }
    )
    if with_profile:
        await db.profiles.insert_one(
            {
                "user_id": user_id,
                "display_name": "Bearer User",
                "avatar_url": None,
                "settings": {
                    "theme": "dark-mono",
                    "editor_preferences": {
                        "default_layout": "document",
                        "font_family": "Inter",
                        "font_size": 14,
                    },
                },
            }
        )
    return user_id


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_valid_bearer_token_returns_composed_user(
    client: AsyncClient,
    mock_db: AsyncIOMotorDatabase,
    betterauth_mode: Ed25519PrivateKey,
) -> None:
    user_id = await _seed_user(mock_db)

    response = await client.get(
        "/api/account/me", headers=_bearer(_token(betterauth_mode, subject=str(user_id)))
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(user_id)
    assert body["email"] == "bearer@example.com"
    assert body["username"] == "bearer_user"
    assert body["profile"]["display_name"] == "Bearer User"
    assert body["settings"]["theme"] == "dark-mono"


async def test_profile_defaults_when_profiles_doc_missing(
    client: AsyncClient,
    mock_db: AsyncIOMotorDatabase,
    betterauth_mode: Ed25519PrivateKey,
) -> None:
    user_id = await _seed_user(mock_db, with_profile=False)

    response = await client.get(
        "/api/account/me", headers=_bearer(_token(betterauth_mode, subject=str(user_id)))
    )

    assert response.status_code == 200
    body = response.json()
    assert body["profile"]["display_name"] == "Bearer User"
    assert body["settings"]["theme"] == "dark-mono"
    assert body["settings"]["editor_preferences"]["font_size"] == 14


async def test_expired_token_is_rejected(
    client: AsyncClient,
    mock_db: AsyncIOMotorDatabase,
    betterauth_mode: Ed25519PrivateKey,
) -> None:
    user_id = await _seed_user(mock_db)
    token = _token(betterauth_mode, subject=str(user_id), expires_in=-60)

    response = await client.get("/api/account/me", headers=_bearer(token))

    assert response.status_code == 401


async def test_wrong_issuer_is_rejected(
    client: AsyncClient,
    mock_db: AsyncIOMotorDatabase,
    betterauth_mode: Ed25519PrivateKey,
) -> None:
    user_id = await _seed_user(mock_db)
    token = _token(
        betterauth_mode, subject=str(user_id), issuer="https://evil.example"
    )

    response = await client.get("/api/account/me", headers=_bearer(token))

    assert response.status_code == 401


async def test_wrong_audience_is_rejected(
    client: AsyncClient,
    mock_db: AsyncIOMotorDatabase,
    betterauth_mode: Ed25519PrivateKey,
) -> None:
    user_id = await _seed_user(mock_db)
    token = _token(
        betterauth_mode, subject=str(user_id), audience="https://evil.example"
    )

    response = await client.get("/api/account/me", headers=_bearer(token))

    assert response.status_code == 401


async def test_hs256_token_is_rejected_algorithm_confusion(
    client: AsyncClient,
    mock_db: AsyncIOMotorDatabase,
    betterauth_mode: Ed25519PrivateKey,
) -> None:
    user_id = await _seed_user(mock_db)
    now = datetime.now(timezone.utc)
    token = pyjwt.encode(
        {
            "sub": str(user_id),
            "iat": now,
            "exp": now + timedelta(minutes=5),
            "iss": ISSUER,
            "aud": AUDIENCE,
        },
        "not-the-real-key-but-long-enough-for-hs256",
        algorithm="HS256",
    )

    response = await client.get("/api/account/me", headers=_bearer(token))

    assert response.status_code == 401


async def test_unknown_subject_is_rejected(
    client: AsyncClient,
    mock_db: AsyncIOMotorDatabase,
    betterauth_mode: Ed25519PrivateKey,
) -> None:
    response = await client.get(
        "/api/account/me", headers=_bearer(_token(betterauth_mode, subject=str(ObjectId())))
    )

    assert response.status_code == 401


async def test_non_object_id_subject_is_rejected(
    client: AsyncClient,
    mock_db: AsyncIOMotorDatabase,
    betterauth_mode: Ed25519PrivateKey,
) -> None:
    response = await client.get(
        "/api/account/me",
        headers=_bearer(_token(betterauth_mode, subject="not-an-object-id")),
    )

    assert response.status_code == 401


async def test_missing_authorization_header_is_rejected(
    client: AsyncClient,
    mock_db: AsyncIOMotorDatabase,
    betterauth_mode: Ed25519PrivateKey,
) -> None:
    await _seed_user(mock_db)

    response = await client.get("/api/account/me")

    assert response.status_code == 401


async def test_legacy_cookie_is_not_accepted_in_betterauth_mode(
    client: AsyncClient,
    mock_db: AsyncIOMotorDatabase,
    betterauth_mode: Ed25519PrivateKey,
) -> None:
    """A valid legacy jam_session cookie must not authenticate FastAPI."""
    from fastapi_backend.auth.service import create_access_token
    from fastapi_backend.auth.session_store import create_session

    user_id = await _seed_user(mock_db)
    # The legacy collection the cookie path would read.
    await mock_db.users.insert_one(
        {
            "_id": user_id,
            "email": "bearer@example.com",
            "username": "bearer_user",
            "password_hash": "x",
            "profile": {"display_name": "Legacy"},
            "settings": {},
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
    )
    jti = "legacy-jti"
    await create_session(mock_db, str(user_id), jti)
    token = create_access_token({"sub": str(user_id), "jti": jti})

    client.cookies.set(settings.cookie_name, token)
    try:
        response = await client.get("/api/account/me")
    finally:
        client.cookies.delete(settings.cookie_name)

    assert response.status_code == 401


def test_from_auth_prefers_betterauth_identity_fields() -> None:
    user_id = ObjectId()
    now = datetime.now(timezone.utc)
    user = UserOut.from_auth(
        {
            "_id": user_id,
            "email": "x@example.com",
            "username": "handle",
            "name": "Canonical Name",
            "image": "https://cdn.example/a.png",
            "createdAt": now,
            "updatedAt": now,
        },
        {
            "display_name": "Stale Name",
            "avatar_url": "https://cdn.example/old.png",
            "settings": {"theme": "light"},
        },
    )

    assert user.profile.display_name == "Canonical Name"
    assert user.profile.avatar_url == "https://cdn.example/a.png"
    assert user.settings.theme == "light"
