"""Object storage port. PostgreSQL remains the owner of asset metadata."""

from typing import Protocol


class StorageGateway(Protocol):
    async def put_object(self, *, object_key: str, content: bytes, content_type: str) -> None:
        """Store bytes. The caller persists the key in PostgreSQL."""

    async def create_download_url(self, *, object_key: str) -> str:
        """Return a short-lived URL after the caller has authorized the asset."""
