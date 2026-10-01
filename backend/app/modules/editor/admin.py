"""Editor operations and asset source enrichment through the asset service."""

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from app.core.errors import ConflictError, NotFoundError
from app.infrastructure.db.session import UnitOfWork
from app.modules.editor.models import EditorAdminAudit, EditorRender
from app.modules.editor.schemas import Composition
from app.modules.generation.admin_assets import AdminAsset, AdminAssetList, AssetAdminService
from pydantic import BaseModel, ValidationError
from sqlalchemy import func, select, tuple_

RenderStatus = Literal["queued", "running", "succeeded", "failed", "canceled"]


class AdminRender(BaseModel):
    id: UUID
    project_id: UUID
    actor_id: UUID
    document_id: UUID
    status: RenderStatus
    width: int | None
    height: int | None
    fps: int | None
    duration_seconds: float | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime
    allowed_actions: list[Literal["cancel"]]


def render_view(row: EditorRender) -> AdminRender:
    try:
        composition = Composition.model_validate(row.snapshot)
    except ValidationError:
        composition = None
    return AdminRender(
        id=row.id,
        project_id=row.project_id,
        actor_id=row.actor_id,
        document_id=row.document_id,
        status=row.status,
        width=composition.width if composition else None,
        height=composition.height if composition else None,
        fps=composition.fps if composition else None,
        duration_seconds=composition.duration_in_frames / composition.fps if composition else None,
        error_message="导出失败，请凭任务编号排查服务端记录" if row.status == "failed" else None,
        created_at=row.created_at,
        updated_at=row.updated_at,
        allowed_actions=["cancel"] if row.status == "queued" else [],
    )


class AdminRenderList(BaseModel):
    items: list[AdminRender]
    total: int


class EditorAdminService:
    async def enrich_assets(self, uow: UnitOfWork, items: list[AdminAsset]) -> None:
        if not items:
            return
        outputs = set(
            (
                await uow.session.execute(
                    select(EditorRender.project_id, EditorRender.output_asset_id).where(
                        tuple_(EditorRender.project_id, EditorRender.output_asset_id).in_(
                            [(item.project_id, item.id) for item in items]
                        )
                    )
                )
            ).all()
        )
        for item in items:
            if (item.project_id, item.id) in outputs:
                item.source = "editor"

    async def list_assets(
        self,
        uow: UnitOfWork,
        *,
        offset: int,
        limit: int,
        asset_id: UUID | None,
        project_id: UUID | None,
        created_by: UUID | None,
        kind: str | None,
        status: str | None,
        created_from: datetime | None,
        created_to: datetime | None,
    ) -> AdminAssetList:
        result = await AssetAdminService().list(
            uow,
            offset=offset,
            limit=limit,
            asset_id=asset_id,
            project_id=project_id,
            created_by=created_by,
            kind=kind,
            status=status,
            created_from=created_from,
            created_to=created_to,
        )
        await self.enrich_assets(uow, result.items)
        return result

    async def get_asset(self, uow: UnitOfWork, *, project_id: UUID, asset_id: UUID) -> AdminAsset:
        result = await AssetAdminService().get(uow, project_id=project_id, asset_id=asset_id)
        await self.enrich_assets(uow, [result])
        return result

    async def list(
        self,
        uow: UnitOfWork,
        *,
        offset: int,
        limit: int,
        render_id: UUID | None,
        project_id: UUID | None,
        actor_id: UUID | None,
        document_id: UUID | None,
        status: str | None,
        created_from: datetime | None,
        created_to: datetime | None,
    ) -> AdminRenderList:
        stmt = select(EditorRender)
        for column, value in [
            (EditorRender.id, render_id),
            (EditorRender.project_id, project_id),
            (EditorRender.actor_id, actor_id),
            (EditorRender.document_id, document_id),
            (EditorRender.status, status),
        ]:
            if value is not None:
                stmt = stmt.where(column == value)
        if created_from:
            stmt = stmt.where(EditorRender.created_at >= created_from)
        if created_to:
            stmt = stmt.where(EditorRender.created_at <= created_to)
        total = await uow.session.scalar(select(func.count()).select_from(stmt.subquery()))
        rows = (
            await uow.session.scalars(
                stmt.order_by(EditorRender.created_at.desc(), EditorRender.id.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()
        return AdminRenderList(items=[render_view(row) for row in rows], total=total or 0)

    async def get(self, uow: UnitOfWork, *, project_id: UUID, render_id: UUID) -> AdminRender:
        row = await uow.session.scalar(
            select(EditorRender).where(
                EditorRender.id == render_id, EditorRender.project_id == project_id
            )
        )
        if row is None:
            raise NotFoundError("导出任务不存在")
        return render_view(row)

    async def cancel(
        self, uow: UnitOfWork, *, project_id: UUID, render_id: UUID, actor_id: UUID, request_id: str
    ) -> AdminRender:
        row = await uow.session.scalar(
            select(EditorRender)
            .where(EditorRender.id == render_id, EditorRender.project_id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if row is None:
            raise NotFoundError("导出任务不存在")
        if row.status == "canceled":
            return render_view(row)
        if row.status != "queued":
            raise ConflictError("任务已开始或结束，不能取消，请刷新列表")
        row.status = "canceled"
        row.updated_at = datetime.now(UTC)
        uow.session.add(
            EditorAdminAudit(
                actor_id=actor_id,
                target_id=row.id,
                action="cancel",
                before_status="queued",
                after_status="canceled",
                request_id=request_id,
            )
        )
        await uow.session.flush()
        result = render_view(row)
        await uow.commit()
        return result
