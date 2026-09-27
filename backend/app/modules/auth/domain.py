import re
from enum import StrEnum

from app.core.errors import ValidationError

EMAIL_MAX_LENGTH = 254
PASSWORD_MAX_LENGTH = 128
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class UserStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


def normalize_email(value: str) -> str:
    normalized = value.strip().lower()
    if not 1 <= len(normalized) <= EMAIL_MAX_LENGTH or _EMAIL.fullmatch(normalized) is None:
        raise ValidationError("Email is invalid")
    return normalized


def validate_password(password: str) -> str:
    if not 1 <= len(password) <= PASSWORD_MAX_LENGTH:
        raise ValidationError("Password must be 1-128 characters")
    return password
