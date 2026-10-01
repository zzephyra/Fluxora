from datetime import datetime
from uuid import UUID

from app.infrastructure.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column


class UploadFile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "upload_files"
    __table_args__ = (
        Index("ix_upload_files_admin_created", "created_at", "id"),
        CheckConstraint("category IN ('image', 'video', 'file')", name="ck_upload_files_category"),
        CheckConstraint(
            "status IN ('pending', 'uploaded', 'failed', 'deleted')",
            name="ck_upload_files_status",
        ),
        CheckConstraint("provider = 'qiniu'", name="ck_upload_files_provider"),
        CheckConstraint("size >= 0", name="ck_upload_files_size"),
        CheckConstraint(
            "char_length(original_filename) BETWEEN 1 AND 200",
            name="ck_upload_files_filename",
        ),
        Index("uq_upload_files_object_key", "object_key", unique=True),
        Index("ix_upload_files_user_created", "user_id", "created_at"),
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    bucket: Mapped[str] = mapped_column(String(63), nullable=False)
    object_key: Mapped[str] = mapped_column(String(512), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False, default="", server_default="")
    original_filename: Mapped[str] = mapped_column(String(200), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    category: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    provider: Mapped[str] = mapped_column(String(16), nullable=False, default="qiniu")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
