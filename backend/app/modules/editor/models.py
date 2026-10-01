from uuid import UUID

from app.infrastructure.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column


class EditorDocument(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "editor_documents"
    __table_args__ = (
        CheckConstraint("version > 0", name="ck_editor_version"),
        UniqueConstraint("project_id", "id", name="uq_editor_document_scope"),
    )
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
        Index("ix_editor_renders_admin_created", "created_at", "id"),
        UniqueConstraint("project_id", "id", name="uq_editor_render_scope"),
        ForeignKeyConstraint(
            ["project_id", "document_id"],
            ["editor_documents.project_id", "editor_documents.id"],
            name="fk_editor_render_document_scope",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["project_id", "output_asset_id"],
            ["assets.project_id", "assets.id"],
            name="fk_editor_render_output_scope",
            ondelete="RESTRICT",
        ),
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


class EditorDocumentAsset(Base):
    __tablename__ = "editor_document_assets"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "document_id"],
            ["editor_documents.project_id", "editor_documents.id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["project_id", "asset_id"], ["assets.project_id", "assets.id"], ondelete="RESTRICT"
        ),
    )
    project_id: Mapped[UUID] = mapped_column(primary_key=True)
    document_id: Mapped[UUID] = mapped_column(primary_key=True)
    asset_id: Mapped[UUID] = mapped_column(primary_key=True)


class EditorRenderAsset(Base):
    __tablename__ = "editor_render_assets"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "render_id"],
            ["editor_renders.project_id", "editor_renders.id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["project_id", "asset_id"], ["assets.project_id", "assets.id"], ondelete="RESTRICT"
        ),
    )
    project_id: Mapped[UUID] = mapped_column(primary_key=True)
    render_id: Mapped[UUID] = mapped_column(primary_key=True)
    asset_id: Mapped[UUID] = mapped_column(primary_key=True)


class EditorAdminAudit(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "editor_admin_audits"
    actor_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    target_id: Mapped[UUID] = mapped_column(ForeignKey("editor_renders.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    before_status: Mapped[str] = mapped_column(String(16), nullable=False)
    after_status: Mapped[str] = mapped_column(String(16), nullable=False)
    request_id: Mapped[str] = mapped_column(String(128), nullable=False)
