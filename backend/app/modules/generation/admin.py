"""Restricted operational metadata and existing cancellation use cases."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.errors import NotFoundError
from app.infrastructure.db.session import UnitOfWork
from app.modules.generation.models import GenerationAdminAudit, GenerationTask
from app.modules.generation.service import ImageGenerationService
from app.modules.generation.video import VideoGenerationService

TaskStatus = Literal[
    "queued", "submitting", "running", "cancel_requested", "succeeded", "failed", "canceled"
]


class AdminTask(BaseModel):
    id: UUID
    project_id: UUID
    actor_id: UUID
    kind: Literal["image", "video"]
    status: TaskStatus
    phase: str | None
    progress: int | None
    provider: str
    model_config_id: UUID
    config_version: int
    reconciliation_required: bool
    error_code: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    allowed_actions: list[Literal["cancel"]]


class AdminTaskList(BaseModel):
    items: list[AdminTask]
    total: int


_SAFE_ERRORS = {
    "provider_failed",
    "output_persist_failed",
    "provider_error",
    "timeout",
    "invalid_configuration",
    "permission_revoked",
}


def task_view(row: GenerationTask) -> AdminTask:
    return AdminTask(
        id=row.id,
        project_id=row.project_id,
        actor_id=row.actor_id,
        kind=row.kind,
        status=row.status,
        phase=row.phase
        if row.phase in {"submitting", "generating", "storing", "reconciling"}
        else None,
        progress=row.progress,
        provider=row.provider,
        model_config_id=row.model_config_id,
        config_version=row.config_version,
        reconciliation_required=row.reconciliation_required,
        error_code=(row.error_code if row.error_code in _SAFE_ERRORS else "generation_error")
        if row.error_code
        else None,
        error_message="生成遇到异常，请使用任务编号排查服务端记录" if row.error_code else None,
        created_at=row.created_at,
        updated_at=row.updated_at,
        started_at=row.started_at,
        finished_at=row.finished_at,
        allowed_actions=["cancel"] if row.status == "queued" else [],
    )


class GenerationAdminService:
    async def list_tasks(
        self,
        uow: UnitOfWork,
        *,
        offset: int,
        limit: int,
        kind: str | None,
        status: str | None,
        provider: str | None,
        project_id: UUID | None,
        actor_id: UUID | None,
        task_id: UUID | None,
        reconciliation_required: bool | None,
        created_from: datetime | None,
        created_to: datetime | None,
    ) -> AdminTaskList:
        stmt = select(GenerationTask)
        for column, value in [
            (GenerationTask.kind, kind),
            (GenerationTask.status, status),
            (GenerationTask.provider, provider),
            (GenerationTask.project_id, project_id),
            (GenerationTask.actor_id, actor_id),
            (GenerationTask.id, task_id),
            (GenerationTask.reconciliation_required, reconciliation_required),
        ]:
            if value is not None:
                stmt = stmt.where(column == value)
        if created_from:
            stmt = stmt.where(GenerationTask.created_at >= created_from)
        if created_to:
            stmt = stmt.where(GenerationTask.created_at <= created_to)
        total = await uow.session.scalar(select(func.count()).select_from(stmt.subquery()))
        rows = (
            await uow.session.scalars(
                stmt.order_by(GenerationTask.created_at.desc(), GenerationTask.id.desc())
                .offset(offset)
                .limit(limit)
            )
        ).all()
        return AdminTaskList(items=[task_view(row) for row in rows], total=total or 0)

    async def get(self, uow: UnitOfWork, *, project_id: UUID, task_id: UUID) -> AdminTask:
        row = await uow.session.scalar(
            select(GenerationTask).where(
                GenerationTask.id == task_id, GenerationTask.project_id == project_id
            )
        )
        if row is None:
            raise NotFoundError("Generation task was not found")
        return task_view(row)

    async def cancel(
        self,
        uow: UnitOfWork,
        *,
        project_id: UUID,
        task_id: UUID,
        actor_id: UUID,
        request_id: str,
        images: ImageGenerationService,
        videos: VideoGenerationService,
    ) -> AdminTask:
        row = await uow.session.scalar(
            select(GenerationTask)
            .where(GenerationTask.id == task_id, GenerationTask.project_id == project_id)
            .with_for_update()
        )
        if row is None:
            raise NotFoundError("Generation task was not found")
        before = row.status
        service = videos if row.kind == "video" else images
        row = await service.cancel_in_transaction(uow, project_id=project_id, task_id=task_id)
        uow.session.add(
            GenerationAdminAudit(
                actor_id=actor_id,
                target_id=task_id,
                action="cancel",
                before_status=before,
                after_status=row.status,
                request_id=request_id,
            )
        )
        await uow.session.flush()
        result = task_view(row)
        await uow.commit()
        return result
