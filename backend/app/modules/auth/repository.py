from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User, UserSession


class AuthRepository:
    async def get_user_by_email(
        self, session: AsyncSession, email: str, *, for_update: bool = False
    ) -> User | None:
        stmt = select(User).where(User.email_normalized == email)
        if for_update:
            stmt = stmt.with_for_update()
        return (await session.execute(stmt)).scalar_one_or_none()

    async def get_user_by_id(self, session: AsyncSession, user_id: UUID) -> User | None:
        stmt = select(User).where(User.id == user_id)
        return (await session.execute(stmt)).scalar_one_or_none()

    async def get_users_by_ids(self, session: AsyncSession, user_ids: list[UUID]) -> list[User]:
        if not user_ids:
            return []
        stmt = select(User).where(User.id.in_(user_ids))
        return list((await session.execute(stmt)).scalars().all())

    async def add_user(self, session: AsyncSession, user: User) -> None:
        session.add(user)

    async def get_session_by_token_hash(
        self,
        session: AsyncSession,
        token_hash: str,
    ) -> UserSession | None:
        stmt = select(UserSession).where(UserSession.token_hash == token_hash)
        return (await session.execute(stmt)).scalar_one_or_none()

    async def get_session_by_id(
        self,
        session: AsyncSession,
        session_id: UUID,
    ) -> UserSession | None:
        stmt = select(UserSession).where(UserSession.id == session_id)
        return (await session.execute(stmt)).scalar_one_or_none()

    async def add_session(self, session: AsyncSession, user_session: UserSession) -> None:
        session.add(user_session)
