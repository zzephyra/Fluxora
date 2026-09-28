from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.ai.domain import AuditAction, ModelCapability
from app.infrastructure.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

_CAPABILITIES = ", ".join(f"'{item.value}'" for item in ModelCapability)
_ACTIONS = ", ".join(f"'{item.value}'" for item in AuditAction)


class ModelConfig(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "model_configs"
    __table_args__ = (
        CheckConstraint(f"capability IN ({_CAPABILITIES})", name="ck_model_configs_capability"),
        CheckConstraint("config_version >= 1", name="ck_model_configs_version"),
        CheckConstraint(
            "char_length(provider) BETWEEN 1 AND 64",
            name="ck_model_configs_provider_length",
        ),
        CheckConstraint(
            "char_length(model_name) BETWEEN 1 AND 128",
            name="ck_model_configs_model_name_length",
        ),
        CheckConstraint(
            "char_length(secret_ref) BETWEEN 1 AND 64",
            name="ck_model_configs_secret_ref_length",
        ),
    )

    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    model_name: Mapped[str] = mapped_column(String(128), nullable=False)
    capability: Mapped[str] = mapped_column(String(32), nullable=False)
    config_version: Mapped[int] = mapped_column(Integer, nullable=False)
    parameters_schema: Mapped[dict] = mapped_column(JSONB, nullable=False)
    limits: Mapped[dict] = mapped_column(JSONB, nullable=False)
    secret_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)


class ModelConfigAudit(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "model_config_audits"
    __table_args__ = (
        CheckConstraint(f"action IN ({_ACTIONS})", name="ck_model_config_audits_action"),
    )

    actor_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    model_config_id: Mapped[UUID] = mapped_column(
        ForeignKey("model_configs.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    config_version: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class ModelAssignment(Base):
    """The one model a business uses. Members cannot choose another."""

    __tablename__ = "model_assignments"
    __table_args__ = (
        CheckConstraint(f"capability IN ({_CAPABILITIES})", name="ck_model_assignments_capability"),
    )

    capability: Mapped[str] = mapped_column(String(32), primary_key=True)
    model_config_id: Mapped[UUID] = mapped_column(
        ForeignKey("model_configs.id", ondelete="RESTRICT"),
        nullable=False,
    )
    config_version: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_by: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class TextCompletion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One explicit text call. This is not a persisted conversation."""

    __tablename__ = "text_completions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')",
            name="ck_text_completions_status",
        ),
        CheckConstraint(
            "char_length(prompt) BETWEEN 1 AND 10000",
            name="ck_text_completions_prompt_length",
        ),
    )

    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    actor_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    model_config_id: Mapped[UUID] = mapped_column(
        ForeignKey("model_configs.id", ondelete="RESTRICT"),
        nullable=False,
    )
    config_version: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt: Mapped[str] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str | None] = mapped_column(nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(300), nullable=True)
