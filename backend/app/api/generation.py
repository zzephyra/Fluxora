from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, Query, Response
from fastapi.responses import Response as RawResponse

from app.api.deps import (
    GenerationInputDep,
    ImageGenerationDep,
    MutationDep,
    PrincipalDep,
    ProjectServiceDep,
    UowDep,
    VideoGenerationDep,
)
from app.api.security import no_store
from app.core.errors import ValidationError
from app.modules.generation.models import GenerationTask
from app.modules.generation.schemas import (
    CreateGenerationRequest,
    GenerationErrorBody,
    GenerationInputResponse,
    GenerationTaskList,
    GenerationTaskResponse,
    ImageEditorOption,
    SaveGenerationInputRequest,
)

router = APIRouter(prefix="/api/v1", tags=["generation"])


@router.post(
    "/projects/{project_id}/generation-tasks",
    response_model=GenerationTaskResponse,
    status_code=202,
)
async def create_generation_task(
    project_id: UUID,
    payload: CreateGenerationRequest,
    response: Response,
    uow: UowDep,
    principal: MutationDep,
    projects: ProjectServiceDep,
    generations: ImageGenerationDep,
    videos: VideoGenerationDep,
    idempotency_key: str = Header(alias="Idempotency-Key"),
) -> GenerationTaskResponse:
    if payload.kind not in {"image", "video"}:
        raise ValidationError("Generation kind is not supported")
    if payload.reference_asset_ids:
        raise ValidationError("Reference images are not supported yet")
    await projects.get_project(uow, principal.user_id, project_id)
    if payload.kind == "video":
        row = await videos.submit(
            uow,
            project_id=project_id,
            actor_id=principal.user_id,
            prompt=payload.prompt,
            parameters=payload.parameters,
            idempotency_key=idempotency_key,
            input_id=payload.input_id,
        )
    else:
        row = await generations.submit(
            uow,
            project_id=project_id,
            actor_id=principal.user_id,
            prompt=payload.prompt,
            parameters=payload.parameters,
            idempotency_key=idempotency_key,
            input_id=payload.input_id,
        )
    outputs = await generations.output_ids(uow, project_id=project_id, task_ids=[row.id])
    no_store(response)
    return _response(row, outputs.get(row.id, []))


@router.get("/projects/{project_id}/generation-tasks", response_model=GenerationTaskList)
async def list_generation_tasks(
    project_id: UUID,
    response: Response,
    uow: UowDep,
    principal: PrincipalDep,
    projects: ProjectServiceDep,
    generations: ImageGenerationDep,
    kind: str | None = Query(default=None),
) -> GenerationTaskList:
    if kind is not None and kind not in {"image", "video"}:
        raise ValidationError("Generation kind is not supported")
    await projects.get_project(uow, principal.user_id, project_id)
    rows = await generations.list_tasks(uow, project_id=project_id, kind=kind)
    outputs = await generations.output_ids(
        uow,
        project_id=project_id,
        task_ids=[row.id for row in rows],
    )
    no_store(response)
    return GenerationTaskList(items=[_response(row, outputs.get(row.id, [])) for row in rows])


@router.get(
    "/projects/{project_id}/generation-tasks/{task_id}",
    response_model=GenerationTaskResponse,
)
async def get_generation_task(
    project_id: UUID,
    task_id: UUID,
    response: Response,
    uow: UowDep,
    principal: PrincipalDep,
    projects: ProjectServiceDep,
    generations: ImageGenerationDep,
) -> GenerationTaskResponse:
    await projects.get_project(uow, principal.user_id, project_id)
    row = await generations.get(uow, project_id=project_id, task_id=task_id)
    outputs = await generations.output_ids(uow, project_id=project_id, task_ids=[row.id])
    no_store(response)
    return _response(row, outputs.get(row.id, []))


@router.post(
    "/projects/{project_id}/generation-tasks/{task_id}/cancel",
    response_model=GenerationTaskResponse,
)
async def cancel_generation_task(
    project_id: UUID,
    task_id: UUID,
    response: Response,
    uow: UowDep,
    principal: MutationDep,
    projects: ProjectServiceDep,
    generations: ImageGenerationDep,
    videos: VideoGenerationDep,
) -> GenerationTaskResponse:
    await projects.get_project(uow, principal.user_id, project_id)
    current = await generations.get(uow, project_id=project_id, task_id=task_id)
    if current.kind == "video":
        row = await videos.cancel(uow, project_id=project_id, task_id=task_id)
    else:
        row = await generations.cancel(uow, project_id=project_id, task_id=task_id)
    outputs = await generations.output_ids(uow, project_id=project_id, task_ids=[row.id])
    no_store(response)
    return _response(row, outputs.get(row.id, []))


@router.get("/projects/{project_id}/assets/{asset_id}/content")
async def read_asset_content(
    project_id: UUID,
    asset_id: UUID,
    uow: UowDep,
    principal: PrincipalDep,
    projects: ProjectServiceDep,
    generations: ImageGenerationDep,
    range_header: Annotated[str | None, Header(alias="Range")] = None,
) -> RawResponse:
    await projects.get_project(uow, principal.user_id, project_id)
    asset = await generations.asset_for_download(uow, project_id=project_id, asset_id=asset_id)
    object_key = asset.object_key
    mime = asset.mime
    await uow.commit()
    content = await generations.storage.get_object(object_key=object_key)
    headers = {"Cache-Control": "no-store", "Accept-Ranges": "bytes"}
    if range_header:
        import re

        match = re.fullmatch(r"bytes=(\d{0,20})-(\d{0,20})", range_header)
        size = len(content)
        if match and (match[1] or match[2]):
            start = int(match[1]) if match[1] else max(0, size - int(match[2]))
            end = min(size - 1, int(match[2])) if match[1] and match[2] else size - 1
            if 0 <= start <= end < size and not (not match[1] and match[2] == "0"):
                headers["Content-Range"] = f"bytes {start}-{end}/{size}"
                return RawResponse(
                    content=content[start : end + 1],
                    status_code=206,
                    media_type=mime,
                    headers=headers,
                )
        return RawResponse(status_code=416, headers={**headers, "Content-Range": f"bytes */{size}"})
    return RawResponse(content=content, media_type=mime, headers=headers)


def _response(row: GenerationTask, output_ids: list[UUID]) -> GenerationTaskResponse:
    snapshot = row.request_snapshot if isinstance(row.request_snapshot, dict) else {}
    prompt = snapshot.get("prompt")
    error = None
    if row.error_code and row.error_message:
        error = GenerationErrorBody(code=row.error_code, message=row.error_message, retryable=False)
    actions = ["cancel"] if row.status == "queued" else []
    return GenerationTaskResponse(
        id=row.id,
        status=row.status,
        phase=row.phase,
        progress=row.progress,
        model_config_id=row.model_config_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
        error=error,
        output_asset_ids=output_ids,
        reconciliation_required=row.reconciliation_required,
        allowed_actions=actions,
        prompt=prompt if isinstance(prompt, str) else "",
        kind=row.kind if row.kind in {"image", "video"} else "image",
    )


@router.post(
    "/projects/{project_id}/generation-inputs",
    response_model=GenerationInputResponse,
    status_code=201,
)
async def save_generation_input(
    project_id: UUID,
    payload: SaveGenerationInputRequest,
    response: Response,
    uow: UowDep,
    principal: MutationDep,
    projects: ProjectServiceDep,
    inputs: GenerationInputDep,
):
    await projects.get_project(uow, principal.user_id, project_id)
    row = await inputs.save(
        uow,
        project_id=project_id,
        actor_id=principal.user_id,
        input_id=payload.id,
        image_base64=payload.image_base64,
        mask_base64=payload.mask_base64,
    )
    no_store(response)
    return GenerationInputResponse(id=row.id, width=row.width, height=row.height)


@router.get("/projects/{project_id}/image-editor-options", response_model=list[ImageEditorOption])
async def image_editor_options(
    project_id: UUID,
    response: Response,
    uow: UowDep,
    principal: PrincipalDep,
    projects: ProjectServiceDep,
    inputs: GenerationInputDep,
):
    await projects.get_project(uow, principal.user_id, project_id)
    no_store(response)
    return await inputs.options(uow)
