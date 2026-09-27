from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

EnvironmentName = Literal["development", "testing", "staging", "production"]

# Development-only placeholder. Staging and production must replace it.
INSECURE_CSRF_SECRET = "development-only-csrf-secret-change-me"
LOCAL_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


class Settings(BaseSettings):
    """Process configuration. Business code must use this object instead of os.getenv."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        extra="ignore",
    )

    environment: EnvironmentName = "development"
    log_level: str = "INFO"
    database_url: str = "postgresql+asyncpg://fluxora:fluxora@localhost:5432/fluxora"
    database_connect_timeout_seconds: float = 5.0
    session_ttl_seconds: int = Field(default=7 * 24 * 60 * 60, gt=0)
    # The API contract requires a short-lived pre-auth CSRF token but does not
    # fix the duration. Ten minutes matches the upload credential TTL.
    csrf_preauth_ttl_seconds: int = Field(default=10 * 60, gt=0)
    csrf_secret: str = INSECURE_CSRF_SECRET
    session_cookie_name: str = "fluxora_session"
    csrf_cookie_name: str = "fluxora_csrf"
    cors_allowed_origins: list[str] = Field(default_factory=list)

    @property
    def is_testing(self) -> bool:
        return self.environment == "testing"

    @property
    def session_cookie_secure(self) -> bool:
        """Secure cookies stay on outside local development and tests."""

        return self.environment not in ("development", "testing")

    @model_validator(mode="after")
    def enforce_deployed_auth_settings(self) -> Self:
        if not self.cors_allowed_origins and self.environment in ("development", "testing"):
            self.cors_allowed_origins = list(LOCAL_DEV_ORIGINS)
        if self.environment in ("staging", "production"):
            if not self.cors_allowed_origins or self.cors_allowed_origins == LOCAL_DEV_ORIGINS:
                raise ValueError(
                    "cors_allowed_origins must be set explicitly outside development and testing"
                )
            if self.csrf_secret == INSECURE_CSRF_SECRET or len(self.csrf_secret) < 32:
                raise ValueError(
                    "csrf_secret must be a non-default value of at least 32 characters"
                )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
