from uuid import UUID

from app.modules.uploads.models import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class UploadRepository:
    async def add(self, session: AsyncSession, upload: UploadFile) -> None:
        session.add(upload)

    async def get_for_user(
        self,
        session: AsyncSession,
        user_id: UUID,
        upload_id: UUID,
    ) -> UploadFile | None:
        stmt = select(UploadFile).where(UploadFile.id == upload_id, UploadFile.user_id == user_id)
        return (await session.execute(stmt)).scalar_one_or_none()

    async def get_by_key_for_user(
        self,
        session: AsyncSession,
        user_id: UUID,
        object_key: str,
    ) -> UploadFile | None:
        stmt = select(UploadFile).where(
            UploadFile.user_id == user_id,
            UploadFile.object_key == object_key,
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    async def list_uploaded(
        self,
        session: AsyncSession,
        user_id: UUID,
        limit: int,
    ) -> list[UploadFile]:
        stmt = (
            select(UploadFile)
            .where(UploadFile.user_id == user_id, UploadFile.status == "uploaded")
            .order_by(UploadFile.created_at.desc(), UploadFile.id.desc())
            .limit(limit)
        )
        return list((await session.execute(stmt)).scalars().all())
