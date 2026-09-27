from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

EnvironmentName = Literal["development", "testing", "staging", "production"]


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

    @property
    def is_testing(self) -> bool:
        return self.environment == "testing"


@lru_cache
def get_settings() -> Settings:
    return Settings()
