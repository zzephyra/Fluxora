"""Image generation tasks and the assets that store their output."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005_image_generations"
down_revision = "0004_text_completions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("object_key", sa.String(length=512), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("mime", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
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
        sa.CheckConstraint("kind IN ('IMAGE', 'VIDEO', 'AUDIO', 'FILE')", name="ck_assets_kind"),
        sa.CheckConstraint(
            "status IN ('uploading', 'ready', 'failed', 'deleted')",
            name="ck_assets_status",
        ),
        sa.CheckConstraint("size_bytes > 0", name="ck_assets_size"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("object_key", name="uq_assets_object_key"),
    )
    op.create_index("ix_assets_project_created", "assets", ["project_id", "created_at", "id"])
    op.create_table(
        "generation_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("model_config_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("config_version", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("request_snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("phase", sa.String(length=32), nullable=True),
        sa.Column("progress", sa.Integer(), nullable=True),
        sa.Column(
            "reconciliation_required",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("provider_task_id", sa.String(length=256), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.String(length=300), nullable=True),
        sa.Column("lease_token", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("lease_owner", sa.String(length=64), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_poll_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
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
            name="ck_generation_tasks_status",
        ),
        sa.CheckConstraint(
            "progress IS NULL OR progress BETWEEN 0 AND 100",
            name="ck_generation_tasks_progress",
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["model_config_id"], ["model_configs.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint(
            "project_id",
            "actor_id",
            "idempotency_key",
            name="uq_generation_tasks_idempotency",
        ),
    )
    op.create_index(
        "ix_generation_tasks_project_created",
        "generation_tasks",
        ["project_id", "created_at", "id"],
    )
    op.create_index(
        "ix_generation_tasks_status_created",
        "generation_tasks",
        ["status", "created_at"],
    )
    op.create_table(
        "generation_outputs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("ordinal >= 1", name="ck_generation_outputs_ordinal"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["task_id"], ["generation_tasks.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("task_id", "ordinal", name="uq_generation_outputs_task_ordinal"),
    )


def downgrade() -> None:
    op.drop_table("generation_outputs")
    op.drop_index("ix_generation_tasks_status_created", table_name="generation_tasks")
    op.drop_index("ix_generation_tasks_project_created", table_name="generation_tasks")
    op.drop_table("generation_tasks")
    op.drop_index("ix_assets_project_created", table_name="assets")
    op.drop_table("assets")
