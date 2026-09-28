from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from app.core.errors import ValidationError
from app.modules.auth.domain import normalize_email, validate_password


class _StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginRequest(_StrictRequest):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        try:
            return normalize_email(value)
        except ValidationError as exc:
            raise ValueError(exc.message) from exc

    @field_validator("password")
    @classmethod
    def _password(cls, value: str) -> str:
        try:
            return validate_password(value)
        except ValidationError as exc:
            raise ValueError(exc.message) from exc


class UserIdentity(BaseModel):
    id: UUID
    email: str
    platform_admin: bool


class LoginResponse(BaseModel):
    user: UserIdentity


class CsrfTokenResponse(BaseModel):
    csrf_token: str
