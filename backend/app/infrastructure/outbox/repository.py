from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.outbox.models import OutboxEvent


class OutboxRepository:
    async def add(self, session: AsyncSession, event: OutboxEvent) -> None:
        session.add(event)
