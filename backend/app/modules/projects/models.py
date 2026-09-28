from datetime import datetime
from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Project(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint("char_length(name) BETWEEN 1 AND 120", name="ck_projects_name_length"),
        CheckConstraint("version >= 1", name="ck_projects_version"),
        CheckConstraint("kind IN ('personal', 'standard')", name="ck_projects_kind"),
        Index("ix_projects_created_at_id", "created_at", "id"),
        Index(
            "uq_projects_one_active_personal",
            "created_by",
            unique=True,
            postgresql_where=text("kind = 'personal' AND deleted_at IS NULL"),
        ),
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="standard",
        server_default="standard",
    )
    created_by: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=1, server_default="1")


class ProjectMember(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "project_members"
    __table_args__ = (
        CheckConstraint("role IN ('OWNER', 'MEMBER')", name="ck_project_members_role"),
        Index("uq_project_members_project_user", "project_id", "user_id", unique=True),
        Index(
            "uq_project_members_one_owner",
            "project_id",
            unique=True,
            postgresql_where=text("role = 'OWNER'"),
        ),
        Index("ix_project_members_user_id", "user_id"),
    )

    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="RESTRICT"),
        nullable=False,
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
