"""Audit editor cancellation and index admin inventories."""

import sqlalchemy as sa
from alembic import op

revision = "0013_admin_editor_audits"
down_revision = "0012_admin_operations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "editor_admin_audits",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("actor_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("target_id", sa.UUID(), sa.ForeignKey("editor_renders.id"), nullable=False),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("before_status", sa.String(16), nullable=False),
        sa.Column("after_status", sa.String(16), nullable=False),
        sa.Column("request_id", sa.String(128), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    for table in ["assets", "upload_files", "editor_renders"]:
        op.create_index(f"ix_{table}_admin_created", table, ["created_at", "id"])


def downgrade() -> None:
    for table in ["assets", "upload_files", "editor_renders"]:
        op.drop_index(f"ix_{table}_admin_created", table_name=table)
    op.drop_table("editor_admin_audits")
