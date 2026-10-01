"""Project asset metadata; object keys and bytes never leave this boundary."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import case, func, select

from app.core.errors import NotFoundError
from app.infrastructure.db.session import UnitOfWork
from app.modules.generation.models import Asset, GenerationOutput


class AdminAsset(BaseModel):
    id: UUID
    project_id: UUID
    created_by: UUID
    kind: Literal["IMAGE", "VIDEO", "AUDIO", "FILE"]
    status: Literal["uploading", "ready", "failed", "deleted"]
    mime: str
    size_bytes: int
    width: int | None
    height: int | None
    source: Literal["generation", "editor", "other"]
    created_at: datetime
    updated_at: datetime


class AdminAssetList(BaseModel):
    items: list[AdminAsset]
    total: int
    active_size_bytes: int


class AssetAdminService:
    async def views(self, uow: UnitOfWork, rows: list[Asset]) -> list[AdminAsset]:
        generated = (
            set(
                (
                    await uow.session.scalars(
                        select(GenerationOutput.asset_id).where(
                            GenerationOutput.asset_id.in_([row.id for row in rows])
                        )
                    )
                ).all()
            )
            if rows
            else set()
        )
        return [
            AdminAsset(
                id=row.id,
                project_id=row.project_id,
                created_by=row.created_by,
                kind=row.kind,
                status=row.status,
                mime=row.mime,
                size_bytes=row.size_bytes,
                width=row.width,
                height=row.height,
                source="generation" if row.id in generated else "other",
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
            for row in rows
        ]

    async def list(
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
        stmt = select(Asset)
        for column, value in [
            (Asset.id, asset_id),
            (Asset.project_id, project_id),
            (Asset.created_by, created_by),
            (Asset.kind, kind),
            (Asset.status, status),
        ]:
            if value is not None:
                stmt = stmt.where(column == value)
        if created_from:
            stmt = stmt.where(Asset.created_at >= created_from)
        if created_to:
            stmt = stmt.where(Asset.created_at <= created_to)
        sub = stmt.subquery()
        total, size = (
            await uow.session.execute(
                select(
                    func.count(),
                    func.coalesce(
                        func.sum(case((sub.c.status != "deleted", sub.c.size_bytes), else_=0)), 0
                    ),
                ).select_from(sub)
            )
        ).one()
        rows = list(
            (
                await uow.session.scalars(
                    stmt.order_by(Asset.created_at.desc(), Asset.id.desc())
                    .offset(offset)
                    .limit(limit)
                )
            ).all()
        )
        return AdminAssetList(
            items=await self.views(uow, rows), total=total, active_size_bytes=size
        )

    async def get(self, uow: UnitOfWork, *, project_id: UUID, asset_id: UUID) -> AdminAsset:
        row = await uow.session.scalar(
            select(Asset).where(Asset.id == asset_id, Asset.project_id == project_id)
        )
        if row is None:
            raise NotFoundError("资产不存在")
        return (await self.views(uow, [row]))[0]
