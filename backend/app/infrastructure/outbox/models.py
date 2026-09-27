from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base


class OutboxEvent(Base):
    __tablename__ = "outbox_events"

    event_id: Mapped[UUID] = mapped_column(primary_key=True)
    project_id: Mapped[UUID | None] = mapped_column(nullable=True)
    aggregate_type: Mapped[str] = mapped_column(nullable=False)
    aggregate_id: Mapped[UUID] = mapped_column(nullable=False)
    aggregate_version: Mapped[int] = mapped_column(nullable=False)
    event_type: Mapped[str] = mapped_column(nullable=False)
    schema_version: Mapped[int] = mapped_column(nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
