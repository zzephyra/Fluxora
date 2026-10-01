"""Private generation inputs and masked editing capability."""

import sqlalchemy as sa
from alembic import op

revision = "0014_generation_inputs"
down_revision = "0013_admin_editor_audits"
branch_labels = None
depends_on = None
OLD = (
    "'text_generation', 'embedding', 'text_to_video', 'image_to_video', "
    "'text_to_image', 'speech_synthesis', 'speech_recognition'"
)


def upgrade():
    for table in ("model_configs", "model_assignments"):
        op.drop_constraint(f"ck_{table}_capability", table, type_="check")
        op.create_check_constraint(
            f"ck_{table}_capability", table, f"capability IN ({OLD}, 'image_inpaint')"
        )
    op.create_table(
        "generation_inputs",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("project_id", sa.UUID(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("created_by", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("image_key", sa.String(512), nullable=False, unique=True),
        sa.Column("mask_key", sa.String(512)),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("project_id", "id", name="uq_generation_inputs_project_id"),
        sa.CheckConstraint(
            "status IN ('uploading', 'ready', 'failed', 'deleted')",
            name="ck_generation_inputs_status",
        ),
    )
    op.add_column("generation_tasks", sa.Column("input_id", sa.UUID()))
    op.create_foreign_key(
        "fk_generation_tasks_input_scope",
        "generation_tasks",
        "generation_inputs",
        ["project_id", "input_id"],
        ["project_id", "id"],
    )


def downgrade():
    op.drop_constraint("fk_generation_tasks_input_scope", "generation_tasks", type_="foreignkey")
    op.drop_column("generation_tasks", "input_id")
    op.drop_table("generation_inputs")
    for table in ("model_configs", "model_assignments"):
        op.drop_constraint(f"ck_{table}_capability", table, type_="check")
        op.create_check_constraint(f"ck_{table}_capability", table, f"capability IN ({OLD})")
