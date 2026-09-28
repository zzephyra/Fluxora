"""Business model assignments and the speech capabilities."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006_model_assignments"
down_revision = "0005_image_generations"
branch_labels = None
depends_on = None

CAPABILITIES = (
    "text_generation",
    "embedding",
    "text_to_video",
    "image_to_video",
    "text_to_image",
    "speech_synthesis",
    "speech_recognition",
)
PREVIOUS_CAPABILITIES = (
    "text_generation",
    "embedding",
    "text_to_video",
    "image_to_video",
    "text_to_image",
)


def upgrade() -> None:
    _replace_check(
        "model_configs",
        "ck_model_configs_capability",
        "capability IN (" + ", ".join(f"'{item}'" for item in CAPABILITIES) + ")",
    )
    _replace_check(
        "model_config_audits",
        "ck_model_config_audits_action",
        "action IN ('created', 'disabled', 'assigned', 'unassigned')",
    )
    op.create_table(
        "model_assignments",
        sa.Column("capability", sa.String(length=32), primary_key=True),
        sa.Column("model_config_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("config_version", sa.Integer(), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "capability IN (" + ", ".join(f"'{item}'" for item in CAPABILITIES) + ")",
            name="ck_model_assignments_capability",
        ),
        sa.CheckConstraint("config_version >= 1", name="ck_model_assignments_version"),
        sa.ForeignKeyConstraint(
            ["model_config_id"],
            ["model_configs.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="RESTRICT"),
    )


def downgrade() -> None:
    op.drop_table("model_assignments")
    _replace_check(
        "model_config_audits",
        "ck_model_config_audits_action",
        "action IN ('created', 'disabled')",
    )
    _replace_check(
        "model_configs",
        "ck_model_configs_capability",
        "capability IN (" + ", ".join(f"'{item}'" for item in PREVIOUS_CAPABILITIES) + ")",
    )


def _replace_check(table: str, name: str, expression: str) -> None:
    op.drop_constraint(name, table, type_="check")
    op.create_check_constraint(name, table, expression)
