"""Rules for user-upload keys. Callers must not accept a client-supplied user id."""

import re
from datetime import datetime
from uuid import UUID

from app.core.errors import ValidationError

IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}
VIDEO_TYPES = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
}
CATEGORIES = frozenset({"image", "video", "file"})
_FILE_EXTENSION = re.compile(r"^[a-z0-9]{1,8}$")
_FILE_MIME = re.compile(r"^(application|text)/[a-z0-9][a-z0-9.+-]{0,80}$")
_BLOCKED_EXTENSIONS = frozenset({"exe", "dll", "bat", "cmd", "sh", "js", "html", "htm", "svg"})
_BLOCKED_FILE_TYPES = frozenset(
    {"application/javascript", "text/html", "application/xhtml+xml", "application/x-msdownload"}
)
_GENERATED_CATEGORY = re.compile(r"^generated/(image|video|file)$")


def display_filename(filename: str) -> str:
    name = filename.replace("\\", "/").rsplit("/", 1)[-1].strip()
    if not name or name in {".", ".."} or "\x00" in name or "/" in name or "\\" in name:
        raise ValidationError("Filename is invalid")
    if len(name) > 200:
        raise ValidationError("Filename is too long")
    return name


def extension_for(filename: str, content_type: str, category: str) -> str:
    if category not in CATEGORIES:
        raise ValidationError("Upload category is not supported")
    mime = content_type.strip().lower()
    if category == "image":
        extension = IMAGE_TYPES.get(mime)
    elif category == "video":
        extension = VIDEO_TYPES.get(mime)
    else:
        extension = _file_extension(filename)
        if _FILE_MIME.fullmatch(mime) is None or mime in _BLOCKED_FILE_TYPES:
            raise ValidationError("File type is not allowed")
    if extension is None:
        raise ValidationError("File type is not allowed")
    return extension


def object_key(
    category: str,
    user_id: UUID,
    extension: str,
    now: datetime,
    file_id: UUID,
) -> str:
    if category not in CATEGORIES or _FILE_EXTENSION.fullmatch(extension) is None:
        raise ValidationError("Upload category is not supported")
    return f"uploads/{category}/{user_id}/{now:%Y}/{now:%m}/{file_id}.{extension}"


def generated_object_key(category: str, extension: str, now: datetime, file_id: UUID) -> str:
    if _GENERATED_CATEGORY.fullmatch(category) is None:
        raise ValidationError("Upload category is not supported")
    if _FILE_EXTENSION.fullmatch(extension) is None:
        raise ValidationError("Upload category is not supported")
    kind = category.split("/", 1)[1]
    return f"uploads/generated/{kind}/{now:%Y}/{now:%m}/{file_id}.{extension}"


def key_belongs_to_user(key: str, user_id: UUID) -> bool:
    if ".." in key or "\\" in key or key.startswith("/") or "//" in key:
        return False
    parts = key.split("/")
    if len(parts) != 6 or parts[0] != "uploads" or parts[1] not in CATEGORIES:
        return False
    if parts[2] != str(user_id) or not parts[3].isdigit() or not parts[4].isdigit():
        return False
    filename = parts[5]
    if "." not in filename or "/" in filename:
        return False
    stem, extension = filename.rsplit(".", 1)
    return _FILE_EXTENSION.fullmatch(extension) is not None and bool(stem)


def _file_extension(filename: str) -> str | None:
    name = display_filename(filename).lower()
    if "." not in name:
        return None
    extension = name.rsplit(".", 1)[-1]
    if _FILE_EXTENSION.fullmatch(extension) is None or extension in _BLOCKED_EXTENSIONS:
        return None
    return extension
