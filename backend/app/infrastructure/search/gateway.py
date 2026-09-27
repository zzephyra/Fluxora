"""Search port. Elasticsearch is a rebuildable index, not the source of truth."""

from typing import Protocol


class SearchHit(Protocol):
    document_id: str
    score: float


class SearchGateway(Protocol):
    async def search(self, *, project_id: str, query: str) -> list[SearchHit]:
        """Return candidate ids. Callers must re-check them in PostgreSQL."""
