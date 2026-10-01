"""Account administration; no project access is implied."""

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict
from sqlalchemy import func, select, update

from app.core.errors import ConflictError, NotFoundError, VersionConflictError
from app.infrastructure.db.session import UnitOfWork
from app.modules.auth.models import User, UserAdminAudit, UserSession


class AdminUser(BaseModel):
    id: UUID
    email: str
    status: Literal["active", "disabled"]
    platform_admin: bool
    created_at: datetime
    updated_at: datetime


class AdminUserList(BaseModel):
    items: list[AdminUser]
    total: int


class UserStatusChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["active", "disabled"]
    expected_updated_at: AwareDatetime


class SessionRevoke(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_updated_at: AwareDatetime


def user_view(row: User) -> AdminUser:
    return AdminUser(
        id=row.id,
        email=row.email_normalized,
        status=row.status,
        platform_admin=row.platform_admin,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class UserAdminService:
    async def list_users(
        self, uow: UnitOfWork, *, q: str, status: str | None, offset: int, limit: int
    ) -> AdminUserList:
        stmt = select(User)
        if q:
            stmt = stmt.where(User.email_normalized.contains(q.strip().lower(), autoescape=True))
        if status:
            stmt = stmt.where(User.status == status)
        total = await uow.session.scalar(select(func.count()).select_from(stmt.subquery()))
        rows = (
            await uow.session.scalars(
                stmt.order_by(User.created_at.desc(), User.id.desc()).offset(offset).limit(limit)
            )
        ).all()
        return AdminUserList(items=[user_view(row) for row in rows], total=total or 0)

    async def change(
        self,
        uow: UnitOfWork,
        *,
        actor_id: UUID,
        user_id: UUID,
        expected_updated_at: datetime,
        status: str | None,
        request_id: str,
    ) -> AdminUser:
        row = await uow.session.scalar(
            select(User)
            .where(User.id == user_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if row is None:
            raise NotFoundError("User was not found")
        if row.id == actor_id or row.platform_admin:
            raise ConflictError("不能在后台修改自己或平台管理员账号")
        if row.updated_at != expected_updated_at:
            raise VersionConflictError("用户信息已变更，请刷新后重试")
        before = row.status
        now = datetime.now(UTC)
        if status is None or status == "disabled":
            await uow.session.execute(
                update(UserSession)
                .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
                .values(revoked_at=now)
            )
        if status is not None:
            row.status = status
        row.updated_at = now
        uow.session.add(
            UserAdminAudit(
                actor_id=actor_id,
                target_id=user_id,
                action="revoke_sessions" if status is None else "set_status",
                before_status=before,
                after_status=row.status,
                request_id=request_id,
            )
        )
        await uow.session.flush()
        result = user_view(row)
        await uow.commit()
        return result
