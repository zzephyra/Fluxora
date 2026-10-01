"""Record direct uploads to Qiniu."""

import sqlalchemy as sa
from alembic import op

revision = "0011_upload_files"
down_revision = "0010_editor_asset_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "upload_files",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "user_id",
            sa.UUID(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("bucket", sa.String(length=63), nullable=False),
        sa.Column("object_key", sa.String(length=512), nullable=False),
        sa.Column("url", sa.String(length=2048), nullable=False, server_default=""),
        sa.Column("original_filename", sa.String(length=200), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False),
        sa.Column("category", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("provider", sa.String(length=16), nullable=False, server_default="qiniu"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "category IN ('image', 'video', 'file')",
            name="ck_upload_files_category",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'uploaded', 'failed', 'deleted')",
            name="ck_upload_files_status",
        ),
        sa.CheckConstraint("provider = 'qiniu'", name="ck_upload_files_provider"),
        sa.CheckConstraint("size >= 0", name="ck_upload_files_size"),
        sa.CheckConstraint(
            "char_length(original_filename) BETWEEN 1 AND 200",
            name="ck_upload_files_filename",
        ),
    )
    op.create_index("uq_upload_files_object_key", "upload_files", ["object_key"], unique=True)
    op.create_index("ix_upload_files_user_created", "upload_files", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_upload_files_user_created", table_name="upload_files")
    op.drop_index("uq_upload_files_object_key", table_name="upload_files")
    op.drop_table("upload_files")
