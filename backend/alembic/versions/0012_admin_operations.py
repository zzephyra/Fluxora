"""Audits for administrator account and generation operations."""

import sqlalchemy as sa
from alembic import op

revision = "0012_admin_operations"
down_revision = "0011_upload_files"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for module, target in [("auth", "users"), ("generation", "generation_tasks")]:
        op.create_table(
            f"{module}_admin_audits",
            sa.Column("id", sa.UUID(), primary_key=True),
            sa.Column("actor_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("target_id", sa.UUID(), sa.ForeignKey(f"{target}.id"), nullable=False),
            sa.Column("action", sa.String(40), nullable=False),
            sa.Column("before_status", sa.String(32), nullable=False),
            sa.Column("after_status", sa.String(32), nullable=False),
            sa.Column("request_id", sa.String(128), nullable=False),
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
        )
    op.create_index("ix_generation_tasks_admin_created", "generation_tasks", ["created_at", "id"])


def downgrade() -> None:
    op.drop_index("ix_generation_tasks_admin_created", table_name="generation_tasks")
    op.drop_table("generation_admin_audits")
    op.drop_table("auth_admin_audits")
