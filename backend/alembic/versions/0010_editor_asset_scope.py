"""Enforce same-project source and output references at the database boundary."""

import sqlalchemy as sa
from alembic import op

revision = "0010_editor_asset_scope"
down_revision = "0009_video_editor"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint("uq_assets_project_id", "assets", ["project_id", "id"])
    op.create_unique_constraint(
        "uq_editor_document_scope", "editor_documents", ["project_id", "id"]
    )
    op.create_unique_constraint("uq_editor_render_scope", "editor_renders", ["project_id", "id"])
    op.create_foreign_key(
        "fk_editor_render_document_scope",
        "editor_renders",
        "editor_documents",
        ["project_id", "document_id"],
        ["project_id", "id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_editor_render_output_scope",
        "editor_renders",
        "assets",
        ["project_id", "output_asset_id"],
        ["project_id", "id"],
        ondelete="RESTRICT",
    )
    for table, parent, field in [
        ("editor_document_assets", "editor_documents", "document_id"),
        ("editor_render_assets", "editor_renders", "render_id"),
    ]:
        op.create_table(
            table,
            sa.Column("project_id", sa.UUID(), primary_key=True),
            sa.Column(field, sa.UUID(), primary_key=True),
            sa.Column("asset_id", sa.UUID(), primary_key=True),
            sa.ForeignKeyConstraint(
                ["project_id", field], [f"{parent}.project_id", f"{parent}.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["project_id", "asset_id"], ["assets.project_id", "assets.id"], ondelete="RESTRICT"
            ),
        )
        source = "composition" if field == "document_id" else "snapshot"
        op.execute(
            sa.text(
                f"INSERT INTO {table} (project_id, {field}, asset_id) "
                f"SELECT DISTINCT p.project_id, p.id, (clip->>'asset_id')::uuid "
                f"FROM {parent} p, "
                f"jsonb_array_elements(p.{source}->'tracks'->0->'clips') clip"
            )
        )


def downgrade() -> None:
    op.drop_table("editor_render_assets")
    op.drop_table("editor_document_assets")
    op.drop_constraint("fk_editor_render_output_scope", "editor_renders", type_="foreignkey")
    op.drop_constraint("fk_editor_render_document_scope", "editor_renders", type_="foreignkey")
    op.drop_constraint("uq_editor_render_scope", "editor_renders", type_="unique")
    op.drop_constraint("uq_editor_document_scope", "editor_documents", type_="unique")
    op.drop_constraint("uq_assets_project_id", "assets", type_="unique")
