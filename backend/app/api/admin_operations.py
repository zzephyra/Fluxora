from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Query, Response
from pydantic import AwareDatetime
from structlog.contextvars import get_contextvars

from app.api.deps import (
    ImageGenerationDep,
    PlatformAdminDep,
    PlatformAdminReadDep,
    UowDep,
    VideoGenerationDep,
)
from app.api.security import no_store
from app.core.errors import ValidationError
from app.modules.auth.admin import (
    AdminUser,
    AdminUserList,
    SessionRevoke,
    UserAdminService,
    UserStatusChange,
)
from app.modules.generation.admin import (
    AdminTask,
    AdminTaskList,
    GenerationAdminService,
    TaskStatus,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin-operations"])


def request_id() -> str:
    return str(get_contextvars().get("request_id") or uuid4())[:128]


@router.get("/users", response_model=AdminUserList)
async def list_users(
    response: Response,
    uow: UowDep,
    principal: PlatformAdminReadDep,
    q: str = Query(default="", max_length=254),
    status: Literal["active", "disabled"] | None = None,
    offset: int = Query(default=0, ge=0, le=100000),
    limit: int = Query(default=20, ge=1, le=100),
) -> AdminUserList:
    no_store(response)
    return await UserAdminService().list_users(uow, q=q, status=status, offset=offset, limit=limit)


@router.patch("/users/{user_id}/status", response_model=AdminUser)
async def set_user_status(
    user_id: UUID,
    payload: UserStatusChange,
    response: Response,
    uow: UowDep,
    principal: PlatformAdminDep,
) -> AdminUser:
    no_store(response)
    return await UserAdminService().change(
        uow,
        actor_id=principal.user_id,
        user_id=user_id,
        expected_updated_at=payload.expected_updated_at,
        status=payload.status,
        request_id=request_id(),
    )


@router.post("/users/{user_id}/revoke-sessions", response_model=AdminUser)
async def revoke_sessions(
    user_id: UUID,
    payload: SessionRevoke,
    response: Response,
    uow: UowDep,
    principal: PlatformAdminDep,
) -> AdminUser:
    no_store(response)
    return await UserAdminService().change(
        uow,
        actor_id=principal.user_id,
        user_id=user_id,
        expected_updated_at=payload.expected_updated_at,
        status=None,
        request_id=request_id(),
    )


@router.get("/generation-tasks", response_model=AdminTaskList)
async def list_tasks(
    response: Response,
    uow: UowDep,
    principal: PlatformAdminReadDep,
    offset: int = Query(default=0, ge=0, le=100000),
    limit: int = Query(default=20, ge=1, le=100),
    kind: Literal["image", "video"] | None = None,
    status: TaskStatus | None = None,
    provider: str | None = Query(default=None, max_length=64),
    project_id: UUID | None = None,
    actor_id: UUID | None = None,
    task_id: UUID | None = None,
    reconciliation_required: bool | None = None,
    created_from: AwareDatetime | None = None,
    created_to: AwareDatetime | None = None,
) -> AdminTaskList:
    if created_from and created_to and created_from > created_to:
        raise ValidationError("开始时间不能晚于结束时间")
    no_store(response)
    return await GenerationAdminService().list_tasks(
        uow,
        offset=offset,
        limit=limit,
        kind=kind,
        status=status,
        provider=provider,
        project_id=project_id,
        actor_id=actor_id,
        task_id=task_id,
        reconciliation_required=reconciliation_required,
        created_from=created_from,
        created_to=created_to,
    )


@router.get("/projects/{project_id}/generation-tasks/{task_id}", response_model=AdminTask)
async def get_task(
    project_id: UUID,
    task_id: UUID,
    response: Response,
    uow: UowDep,
    principal: PlatformAdminReadDep,
) -> AdminTask:
    no_store(response)
    return await GenerationAdminService().get(uow, project_id=project_id, task_id=task_id)


@router.post("/projects/{project_id}/generation-tasks/{task_id}/cancel", response_model=AdminTask)
async def cancel_task(
    project_id: UUID,
    task_id: UUID,
    response: Response,
    uow: UowDep,
    principal: PlatformAdminDep,
    images: ImageGenerationDep,
    videos: VideoGenerationDep,
) -> AdminTask:
    no_store(response)
    return await GenerationAdminService().cancel(
        uow,
        project_id=project_id,
        task_id=task_id,
        actor_id=principal.user_id,
        request_id=request_id(),
        images=images,
        videos=videos,
    )
