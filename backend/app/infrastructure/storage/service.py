"""Server-side uploads. Workers call this service instead of a vendor SDK."""

from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.core.config import Settings
from app.core.errors import ValidationError
from app.infrastructure.storage.provider import StorageProvider, StoredObject
from app.infrastructure.storage.qiniu import QiniuStorageProvider
from app.modules.uploads.domain import extension_for, generated_object_key

_GENERATED_TYPES = {
    "image": "image/png",
    "video": "video/mp4",
    "file": "application/octet-stream",
}


class StorageService:
    def __init__(self, settings: Settings, provider: StorageProvider | None = None) -> None:
        self._provider = provider or QiniuStorageProvider(settings)

    def upload_file(self, local_path: str, category: str) -> dict[str, str | int]:
        path = Path(local_path)
        kind = _generated_kind(category)
        content_type = _content_type(path.suffix.lower(), kind)
        extension = extension_for(path.name, content_type, kind)
        key = generated_object_key(category, extension, datetime.now(UTC), uuid4())
        stored = self._provider.upload_path(key=key, path=str(path), content_type=content_type)
        return _result(stored)

    def upload_bytes(
        self,
        content: bytes,
        category: str,
        *,
        content_type: str,
        extension: str,
    ) -> dict[str, str | int]:
        kind = _generated_kind(category)
        cleaned = extension_for(f"object.{extension}", content_type, kind)
        key = generated_object_key(category, cleaned, datetime.now(UTC), uuid4())
        stored = self._provider.upload_bytes(key=key, content=content, content_type=content_type)
        return _result(stored)


def _generated_kind(category: str) -> str:
    if not category.startswith("generated/"):
        raise ValidationError("Upload category is not supported")
    return category.split("/", 1)[1]


def _content_type(suffix: str, kind: str) -> str:
    if kind == "image" and suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if kind == "image" and suffix == ".webp":
        return "image/webp"
    if kind == "image" and suffix == ".gif":
        return "image/gif"
    if kind == "video" and suffix == ".webm":
        return "video/webm"
    if kind == "video" and suffix == ".mov":
        return "video/quicktime"
    fallback = _GENERATED_TYPES.get(kind)
    if fallback is None or fallback == "application/octet-stream":
        raise ValidationError("File type is not allowed")
    return fallback


def _result(stored: StoredObject) -> dict[str, str | int]:
    return {"key": stored.key, "url": stored.url, "size": stored.size}
