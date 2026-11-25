from typing import Annotated, Any

import jwt as pyjwt
from bson import ObjectId
from fastapi import Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from starlette.concurrency import run_in_threadpool

from fastapi_backend.config import settings
from fastapi_backend.database import get_db
from fastapi_backend.auth.models import UserOut
from fastapi_backend.auth.service import decode_access_token
from fastapi_backend.auth.session_store import is_session_valid

_jwks_client: pyjwt.PyJWKClient | None = None


def _get_jwks_client() -> pyjwt.PyJWKClient:
    """Lazily build the cached JWKS client.

    Built lazily so importing the app (tests, `--reload`, docs) never makes
    a network call, and so a changed setting in tests is picked up after
    `reset_jwks_client()`.
    """
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = pyjwt.PyJWKClient(
            settings.better_auth_jwks_url,
            cache_keys=True,
            lifespan=settings.better_auth_jwks_cache_seconds,
            timeout=settings.better_auth_jwks_timeout_seconds,
        )
    return _jwks_client


def reset_jwks_client() -> None:
    """Drop the cached JWKS client (tests / key rotation)."""
    global _jwks_client
    _jwks_client = None


def _bearer_token(request: Request) -> str | None:
    header = request.headers.get("Authorization")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def _decode_better_auth_token(token: str) -> dict[str, Any]:
    """Verify a BetterAuth JWT against its JWKS.

    Blocking (JWKS may need a fetch), so callers run it in a threadpool.
    The algorithm is pinned to the configured value — the token header's
    `alg` is never trusted, which blocks algorithm-confusion attacks.
    """
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        return pyjwt.decode(
            token,
            signing_key.key,
            algorithms=[settings.better_auth_jwt_algorithm],
            issuer=settings.better_auth_issuer,
            audience=settings.better_auth_audience,
            leeway=settings.better_auth_clock_skew_seconds,
            options={
                "require": ["sub", "exp", "iat"],
                "verify_signature": True,
                "verify_exp": True,
                "verify_iat": True,
                "verify_iss": True,
                "verify_aud": True,
            },
        )
    except pyjwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def _get_better_auth_user(
    request: Request,
    db: AsyncIOMotorDatabase,
) -> UserOut:
    token = _bearer_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = await run_in_threadpool(_decode_better_auth_token, token)

    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    try:
        object_id = ObjectId(subject)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user id",
        ) from None

    user_doc = await db.user.find_one({"_id": object_id})
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    profile_doc = await db.profiles.find_one({"user_id": object_id})
    return UserOut.from_auth(user_doc, profile_doc)


async def get_current_user(
    request: Request,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)]
) -> UserOut:
    if settings.auth_mode == "betterauth":
        # Bearer-only: the legacy jam_session cookie is deliberately not
        # consulted, so a browser holding an old cookie cannot authenticate.
        return await _get_better_auth_user(request, db)

    token = request.cookies.get(settings.cookie_name)
    
    if not token:
        # Fallback to authorization header if needed
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    jti = payload.get("jti")
    if jti:
        valid = await is_session_valid(db, jti)
        if not valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session revoked",
            )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    try:
        object_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user id",
        )

    user_doc = await db.users.find_one({"_id": object_id})
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return UserOut.from_mongo(user_doc)

CurrentUserDep = Annotated[UserOut, Depends(get_current_user)]
