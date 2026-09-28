"""Platform admin flag, model catalog, and catalog audit."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003_model_configs"
down_revision = "0002_auth_and_projects"
branch_labels = None
depends_on = None

CAPABILITIES = (
    "text_generation",
    "embedding",
    "text_to_video",
    "image_to_video",
    "text_to_image",
)


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "platform_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_table(
        "model_configs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("model_name", sa.String(length=128), nullable=False),
        sa.Column("capability", sa.String(length=32), nullable=False),
        sa.Column("config_version", sa.Integer(), nullable=False),
        sa.Column("parameters_schema", postgresql.JSONB(), nullable=False),
        sa.Column("limits", postgresql.JSONB(), nullable=False),
        sa.Column("secret_ref", sa.String(length=64), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
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
            "capability IN (" + ", ".join(f"'{item}'" for item in CAPABILITIES) + ")",
            name="ck_model_configs_capability",
        ),
        sa.CheckConstraint("config_version >= 1", name="ck_model_configs_version"),
        sa.CheckConstraint(
            "char_length(provider) BETWEEN 1 AND 64",
            name="ck_model_configs_provider_length",
        ),
        sa.CheckConstraint(
            "char_length(model_name) BETWEEN 1 AND 128",
            name="ck_model_configs_model_name_length",
        ),
        sa.CheckConstraint(
            "char_length(secret_ref) BETWEEN 1 AND 64",
            name="ck_model_configs_secret_ref_length",
        ),
        sa.UniqueConstraint(
            "provider",
            "model_name",
            "capability",
            "config_version",
            name="uq_model_configs_identity",
        ),
    )
    op.create_index(
        "ix_model_configs_enabled_capability",
        "model_configs",
        ["enabled", "capability"],
    )
    op.create_table(
        "model_config_audits",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("model_config_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("config_version", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "action IN ('created', 'disabled')",
            name="ck_model_config_audits_action",
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["model_config_id"],
            ["model_configs.id"],
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "ix_model_config_audits_config",
        "model_config_audits",
        ["model_config_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_model_config_audits_config", table_name="model_config_audits")
    op.drop_table("model_config_audits")
    op.drop_index("ix_model_configs_enabled_capability", table_name="model_configs")
    op.drop_table("model_configs")
    op.drop_column("users", "platform_admin")
