"""Give each user at most one active personal creative space."""

import sqlalchemy as sa
from alembic import op

revision = "0008_personal_spaces"
down_revision = "0007_video_generations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="standard"),
    )
    op.create_check_constraint(
        "ck_projects_kind",
        "projects",
        "kind IN ('personal', 'standard')",
    )
    op.create_index(
        "uq_projects_one_active_personal",
        "projects",
        ["created_by"],
        unique=True,
        postgresql_where=sa.text("kind = 'personal' AND deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_projects_one_active_personal", table_name="projects")
    op.drop_constraint("ck_projects_kind", "projects", type_="check")
    op.drop_column("projects", "kind")
