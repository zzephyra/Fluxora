import base64
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID

from app.core.errors import ValidationError

PROJECT_NAME_MAX_LENGTH = 120
PERSONAL_SPACE_NAME = "个人空间"
DEFAULT_PAGE_LIMIT = 20
MAX_PAGE_LIMIT = 100
PROJECT_DELETED_EVENT = "project.deleted.v1"
PROJECT_DELETED_SCHEMA_VERSION = 1


class ProjectRole(StrEnum):
    OWNER = "OWNER"
    MEMBER = "MEMBER"


class ProjectKind(StrEnum):
    PERSONAL = "personal"
    STANDARD = "standard"


@dataclass(frozen=True)
class PageCursor:
    created_at: datetime
    entity_id: UUID


def normalize_project_name(value: str) -> str:
    name = value.strip()
    if not 1 <= len(name) <= PROJECT_NAME_MAX_LENGTH:
        raise ValidationError("Project name must be 1-120 characters")
    return name


def normalize_limit(limit: int) -> int:
    if not 1 <= limit <= MAX_PAGE_LIMIT:
        raise ValidationError("Limit is out of range")
    return limit


def encode_cursor(created_at: datetime, entity_id: UUID) -> str:
    payload = f"{created_at.astimezone(UTC).isoformat()}|{entity_id}"
    encoded = base64.urlsafe_b64encode(payload.encode()).decode()
    return encoded.rstrip("=")


def decode_cursor(value: str) -> PageCursor:
    try:
        padded = value + "=" * (-len(value) % 4)
        raw = base64.urlsafe_b64decode(padded.encode()).decode()
        timestamp, entity_text = raw.split("|", 1)
        created_at = datetime.fromisoformat(timestamp)
        entity_id = UUID(entity_text)
    except (ValueError, UnicodeDecodeError) as exc:
        raise ValidationError("Cursor is invalid") from exc
    if created_at.tzinfo is None:
        raise ValidationError("Cursor is invalid")
    return PageCursor(created_at=created_at.astimezone(UTC), entity_id=entity_id)
