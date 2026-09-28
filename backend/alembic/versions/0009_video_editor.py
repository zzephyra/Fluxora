"""Persist video editing documents and asynchronous export snapshots."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0009_video_editor"
down_revision = "0008_personal_spaces"
branch_labels = None
depends_on = None


def timestamps():
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    ]


def upgrade():
    op.create_table(
        "editor_documents",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "project_id",
            sa.UUID(),
            sa.ForeignKey("projects.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "created_by", sa.UUID(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("composition", postgresql.JSONB(), nullable=False),
        sa.Column("version", sa.BigInteger(), nullable=False),
        *timestamps(),
        sa.CheckConstraint("version > 0", name="ck_editor_version"),
    )
    op.create_index("ix_editor_documents_project_id", "editor_documents", ["project_id"])
    op.create_table(
        "editor_renders",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "project_id",
            sa.UUID(),
            sa.ForeignKey("projects.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "actor_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column(
            "document_id",
            sa.UUID(),
            sa.ForeignKey("editor_documents.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("output_asset_id", sa.UUID(), sa.ForeignKey("assets.id", ondelete="RESTRICT")),
        sa.Column("error", sa.String(240)),
        *timestamps(),
        sa.UniqueConstraint(
            "project_id", "actor_id", "idempotency_key", name="uq_editor_render_key"
        ),
        sa.CheckConstraint(
            "status IN ('queued','running','succeeded','failed','canceled')",
            name="ck_editor_render_status",
        ),
    )
    op.create_index("ix_editor_renders_project_id", "editor_renders", ["project_id"])
    op.create_index("ix_editor_renders_status", "editor_renders", ["status"])


def downgrade():
    op.drop_table("editor_renders")
    op.drop_table("editor_documents")
