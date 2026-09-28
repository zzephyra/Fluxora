"""Allow video generation tasks to use the submitting states."""

import sqlalchemy as sa
from alembic import op

revision = "0007_video_generations"
down_revision = "0006_model_assignments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "generation_tasks",
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="image"),
    )
    op.create_check_constraint(
        "ck_generation_tasks_kind",
        "generation_tasks",
        "kind IN ('image', 'video')",
    )
    op.drop_constraint("ck_generation_tasks_status", "generation_tasks", type_="check")
    op.create_check_constraint(
        "ck_generation_tasks_status",
        "generation_tasks",
        "status IN ('queued', 'submitting', 'running', 'cancel_requested', "
        "'succeeded', 'failed', 'canceled')",
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM generation_outputs WHERE task_id IN "
        "(SELECT id FROM generation_tasks WHERE kind = 'video')"
    )
    op.execute("DELETE FROM generation_tasks WHERE kind = 'video'")
    op.drop_constraint("ck_generation_tasks_status", "generation_tasks", type_="check")
    op.create_check_constraint(
        "ck_generation_tasks_status",
        "generation_tasks",
        "status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')",
    )
    op.drop_constraint("ck_generation_tasks_kind", "generation_tasks", type_="check")
    op.drop_column("generation_tasks", "kind")
