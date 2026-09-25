from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    mongodb_url: str = "mongodb://localhost:27017"
    database_name: str = "jam_note"
    jwt_secret: str = "super-secret-dev-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days
    cookie_name: str = "jam_session"
    cors_origins: list[str] = ["http://localhost:3000"]

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
