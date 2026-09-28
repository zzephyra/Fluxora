"""Explicit text completions claimed by a separate worker."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004_text_completions"
down_revision = "0003_model_configs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "text_completions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("model_config_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("config_version", sa.Integer(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.String(length=300), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')",
            name="ck_text_completions_status",
        ),
        sa.CheckConstraint(
            "char_length(prompt) BETWEEN 1 AND 10000",
            name="ck_text_completions_prompt_length",
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["model_config_id"], ["model_configs.id"], ondelete="RESTRICT"),
    )
    op.create_index(
        "ix_text_completions_status_created",
        "text_completions",
        ["status", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_text_completions_status_created", table_name="text_completions")
    op.drop_table("text_completions")
