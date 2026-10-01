import json
import re
from functools import lru_cache
from typing import Literal, Self
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

EnvironmentName = Literal["development", "testing", "staging", "production"]

# Development-only placeholder. Staging and production must replace it.
INSECURE_CSRF_SECRET = "development-only-csrf-secret-change-me"
LOCAL_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
SECRET_REF_NAME = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


class ModelEndpoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_url: str
    api_key: str


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
    # Comma-separated names of configured secrets. Values are never stored here.
    model_secret_refs: str = ""
    # JSON object: {"name": {"base_url": "https://...", "api_key": "..."}}
    model_endpoints: str = Field(default="", repr=False)
    s3_endpoint_url: str = ""
    s3_bucket: str = ""
    s3_region: str = "us-east-1"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = Field(default="", repr=False)
    qiniu_access_key: str = ""
    qiniu_secret_key: str = Field(default="", repr=False)
    qiniu_bucket: str = ""
    qiniu_domain: str = ""
    qiniu_region: str = "z2"
    qiniu_upload_token_ttl_seconds: int = Field(default=3600, gt=0, le=7200)
    image_max_size: int = Field(default=20 * 1024 * 1024, gt=0)
    video_max_size: int = Field(default=512 * 1024 * 1024, gt=0)
    file_max_size: int = Field(default=50 * 1024 * 1024, gt=0)
    _parsed_endpoints: dict[str, ModelEndpoint] = PrivateAttr(default_factory=dict)

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
        for name in (part.strip() for part in self.model_secret_refs.split(",")):
            if name and SECRET_REF_NAME.fullmatch(name) is None:
                raise ValueError("model_secret_refs contains an invalid name")
        self._parsed_endpoints = _parse_model_endpoints(self.model_endpoints)
        allowed = {part.strip() for part in self.model_secret_refs.split(",") if part.strip()}
        unknown = set(self._parsed_endpoints).difference(allowed)
        if unknown:
            raise ValueError("model endpoint name is not listed in model_secret_refs")
        return self

    @property
    def object_storage_configured(self) -> bool:
        return bool(
            self.s3_endpoint_url.strip()
            and self.s3_bucket.strip()
            and self.s3_access_key_id.strip()
            and self.s3_secret_access_key.strip()
        )

    @property
    def qiniu_configured(self) -> bool:
        return bool(
            self.qiniu_access_key.strip()
            and self.qiniu_secret_key.strip()
            and self.qiniu_bucket.strip()
            and self.qiniu_domain.strip()
            and self.qiniu_region.strip()
        )

    def upload_size_limit(self, category: str) -> int:
        if category == "image":
            return self.image_max_size
        if category == "video":
            return self.video_max_size
        if category == "file":
            return self.file_max_size
        raise ValueError("upload category is invalid")

    def model_endpoint(self, secret_ref: str) -> tuple[str, str] | None:
        endpoint = self._parsed_endpoints.get(secret_ref)
        if endpoint is None:
            return None
        return endpoint.base_url, endpoint.api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()


def _parse_model_endpoints(raw: str) -> dict[str, ModelEndpoint]:
    if not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        raise ValueError("model_endpoints must be a JSON object") from None
    if not isinstance(parsed, dict):
        raise ValueError("model_endpoints must be a JSON object")
    endpoints: dict[str, ModelEndpoint] = {}
    for name, value in parsed.items():
        if not isinstance(name, str) or SECRET_REF_NAME.fullmatch(name) is None:
            raise ValueError("model endpoint name is invalid")
        if not isinstance(value, dict):
            raise ValueError("model endpoint must include base_url and api_key")
        try:
            endpoint = ModelEndpoint.model_validate(value)
        except ValueError:
            raise ValueError("model endpoint must include base_url and api_key") from None
        _validate_base_url(endpoint.base_url)
        if not endpoint.api_key.strip():
            raise ValueError("model endpoint api key is missing")
        endpoints[name] = endpoint
    return endpoints


def _validate_base_url(value: str) -> None:
    parts = urlsplit(value.strip())
    if (
        parts.scheme != "https"
        or not parts.hostname
        or parts.username
        or parts.password
        or parts.fragment
    ):
        raise ValueError("model endpoint base_url must be an https URL without credentials")
