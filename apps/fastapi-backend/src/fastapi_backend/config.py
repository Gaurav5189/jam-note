import secrets as _secrets

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
    cors_origins: list[str] = ["http://localhost:3000"]
    # "production" enables Secure cookie flag, HSTS, CSP, and the
    # mandatory JWT_SECRET check.
    environment: str = "development"

    @model_validator(mode="after")
    def _validate_jwt_secret(self) -> "Settings":
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
