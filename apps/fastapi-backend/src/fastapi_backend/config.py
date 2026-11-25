import secrets as _secrets
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Well-known placeholder secrets that must never be accepted in production.
KNOWN_WEAK_SECRETS = {
    "super-secret-dev-key-change-in-production",
    "secret",
    "changeme",
}


class Settings(BaseSettings):
    mongodb_url: str = "mongodb://localhost:27017"
    database_name: str = "jam_note"
    # JWT_SECRET MUST be set in production (>= 32 chars; generate with
    # `openssl rand -hex 32`). In development an unset value falls back
    # to a random per-process secret so no well-known constant is ever
    # used to sign tokens.
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days
    cookie_name: str = "jam_session"
    # "legacy" = FastAPI issues/verifies the jam_session JWT (pre-migration).
    # "betterauth" = Next.js/BetterAuth owns auth; FastAPI only accepts a
    # BetterAuth-issued Bearer JWT verified against the JWKS endpoint.
    # Defaults to "legacy" so the backend can ship before the cutover and
    # rollback is an env change.
    auth_mode: Literal["legacy", "betterauth"] = "legacy"
    better_auth_jwks_url: str = "http://localhost:3000/api/auth/jwks"
    better_auth_issuer: str = "http://localhost:3000"
    better_auth_audience: str = "http://localhost:3000"
    # Pinned algorithm — never trust the token header's `alg`.
    better_auth_jwt_algorithm: str = "EdDSA"
    better_auth_jwks_cache_seconds: float = 300.0
    better_auth_jwks_timeout_seconds: float = 10.0
    better_auth_clock_skew_seconds: int = 10
    cors_origins: list[str] = ["http://localhost:3000"]
    # "production" enables Secure cookie flag, HSTS, CSP, and the
    # mandatory JWT_SECRET check.
    environment: str = "development"

    @model_validator(mode="after")
    def _validate_jwt_secret(self) -> "Settings":
        if self.auth_mode == "betterauth":
            # FastAPI no longer signs tokens; BetterAuth owns the secret.
            # Keep a per-process value so nothing accidentally signs with
            # an empty key.
            if not self.jwt_secret:
                self.jwt_secret = _secrets.token_hex(32)
            return self
        if self.environment == "production":
            if (
                not self.jwt_secret
                or len(self.jwt_secret) < 32
                or self.jwt_secret in KNOWN_WEAK_SECRETS
            ):
                raise ValueError(
                    "JWT_SECRET must be set to a strong random value "
                    "(>= 32 chars, e.g. `openssl rand -hex 32`) when "
                    "ENVIRONMENT=production"
                )
        elif not self.jwt_secret or self.jwt_secret in KNOWN_WEAK_SECRETS:
            # Dev/test: never sign with a well-known constant — mint a
            # random per-process secret instead (tokens simply do not
            # survive a dev-server restart).
            self.jwt_secret = _secrets.token_hex(32)
        return self

    # OpenSearch settings
    opensearch_url: str = "http://localhost:9200"
    opensearch_user: str | None = None
    opensearch_password: str | None = None
    opensearch_index: str = "notes-blocks-v1"
    opensearch_alias: str = "notes-blocks"
    opensearch_timeout: float = 5.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
