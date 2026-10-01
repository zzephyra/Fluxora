"""Read-only, safe upload inventory for platform operations."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from app.core.errors import NotFoundError
from app.infrastructure.db.session import UnitOfWork
from app.modules.uploads.models import UploadFile
from pydantic import BaseModel
from sqlalchemy import case, func, select


class AdminUpload(BaseModel):
    id: UUID
    user_id: UUID
    category: Literal["image", "video", "file"]
    status: Literal["pending", "uploaded", "failed", "deleted"]
    content_type: str
    size: int
    created_at: datetime
    updated_at: datetime


class AdminUploadList(BaseModel):
    items: list[AdminUpload]
    total: int
    active_size_bytes: int


def upload_view(row: UploadFile) -> AdminUpload:
    return AdminUpload(
        id=row.id,
        user_id=row.user_id,
        category=row.category,
        status=row.status,
        content_type=row.content_type,
        size=row.size,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class UploadAdminService:
    async def list(
        self,
        uow: UnitOfWork,
        *,
        offset: int,
        limit: int,
        file_id: UUID | None,
        user_id: UUID | None,
        category: str | None,
        status: str | None,
        created_from: datetime | None,
        created_to: datetime | None,
    ) -> AdminUploadList:
        stmt = select(UploadFile)
        for column, value in [
            (UploadFile.id, file_id),
            (UploadFile.user_id, user_id),
            (UploadFile.category, category),
            (UploadFile.status, status),
        ]:
            if value is not None:
                stmt = stmt.where(column == value)
        if created_from:
            stmt = stmt.where(UploadFile.created_at >= created_from)
        if created_to:
            stmt = stmt.where(UploadFile.created_at <= created_to)
        sub = stmt.subquery()
        total, size = (
            await uow.session.execute(
                select(
                    func.count(),
                    func.coalesce(
                        func.sum(case((sub.c.status != "deleted", sub.c.size), else_=0)), 0
                    ),
                ).select_from(sub)
            )
        ).one()
        rows = (
            await uow.session.scalars(
                stmt.order_by(UploadFile.created_at.desc(), UploadFile.id.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()
        return AdminUploadList(
            items=[upload_view(row) for row in rows], total=total, active_size_bytes=size
        )

    async def get(self, uow: UnitOfWork, *, user_id: UUID, file_id: UUID) -> AdminUpload:
        row = await uow.session.scalar(
            select(UploadFile).where(UploadFile.id == file_id, UploadFile.user_id == user_id)
        )
        if row is None:
            raise NotFoundError("上传记录不存在")
        return upload_view(row)
