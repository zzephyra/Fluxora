from uuid import UUID

from fastapi import APIRouter, Response

from app.api.deps import MutationDep, PrincipalDep, ProjectServiceDep, TextCompletionDep, UowDep
from app.api.security import no_store
from app.infrastructure.ai.models import TextCompletion
from app.infrastructure.ai.schemas import (
    SubmitTextCompletionRequest,
    TextCompletionErrorBody,
    TextCompletionResponse,
)

router = APIRouter(prefix="/api/v1", tags=["text"])


@router.post(
    "/projects/{project_id}/text-completions",
    response_model=TextCompletionResponse,
    status_code=202,
)
async def submit_text_completion(
    project_id: UUID,
    payload: SubmitTextCompletionRequest,
    response: Response,
    uow: UowDep,
    principal: MutationDep,
    projects: ProjectServiceDep,
    completions: TextCompletionDep,
) -> TextCompletionResponse:
    await projects.get_project(uow, principal.user_id, project_id)
    row = await completions.submit(
        uow,
        project_id=project_id,
        actor_id=principal.user_id,
        prompt=payload.prompt,
    )
    no_store(response)
    return _response(row)


@router.get(
    "/projects/{project_id}/text-completions/{completion_id}",
    response_model=TextCompletionResponse,
)
async def get_text_completion(
    project_id: UUID,
    completion_id: UUID,
    response: Response,
    uow: UowDep,
    principal: PrincipalDep,
    projects: ProjectServiceDep,
    completions: TextCompletionDep,
) -> TextCompletionResponse:
    await projects.get_project(uow, principal.user_id, project_id)
    row = await completions.get(uow, project_id=project_id, completion_id=completion_id)
    no_store(response)
    return _response(row)


def _response(row: TextCompletion) -> TextCompletionResponse:
    error = None
    if row.error_code and row.error_message:
        error = TextCompletionErrorBody(code=row.error_code, message=row.error_message)
    return TextCompletionResponse(
        id=row.id,
        status=row.status,
        content=row.content,
        error=error,
    )
