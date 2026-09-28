from uuid import UUID

from app.infrastructure.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column


class EditorDocument(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "editor_documents"
    __table_args__ = (CheckConstraint("version > 0", name="ck_editor_version"),)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), index=True
    )
    created_by: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    title: Mapped[str] = mapped_column(String(120))
    composition: Mapped[dict] = mapped_column(JSONB)
    version: Mapped[int] = mapped_column(BigInteger, default=1)


class EditorRender(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "editor_renders"
    __table_args__ = (
        UniqueConstraint("project_id", "actor_id", "idempotency_key", name="uq_editor_render_key"),
        CheckConstraint(
            "status IN ('queued','running','succeeded','failed','canceled')",
            name="ck_editor_render_status",
        ),
    )
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"), index=True
    )
    actor_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    document_id: Mapped[UUID] = mapped_column(
        ForeignKey("editor_documents.id", ondelete="RESTRICT")
    )
    idempotency_key: Mapped[str] = mapped_column(String(128))
    request_hash: Mapped[str] = mapped_column(String(64))
    snapshot: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    output_asset_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("assets.id", ondelete="RESTRICT")
    )
    error: Mapped[str | None] = mapped_column(String(240))
