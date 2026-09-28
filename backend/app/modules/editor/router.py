from typing import Annotated
from uuid import UUID

from app.api.deps import ImageGenerationDep, MutationDep, PrincipalDep, SettingsDep, UowDep
from app.modules.editor.schemas import (
    CreateDocument,
    DocumentList,
    DocumentResponse,
    MediaList,
    RenderRequest,
    RenderResponse,
    SaveDocument,
)
from app.modules.editor.service import EditorService
from fastapi import APIRouter, Depends, Header

router = APIRouter(prefix="/api/v1/projects/{project_id}/editor", tags=["editor"])


def get_editor(settings: SettingsDep, assets: ImageGenerationDep) -> EditorService:
    return EditorService(settings, assets)


EditorDep = Annotated[EditorService, Depends(get_editor)]


@router.get("/media", response_model=MediaList)
async def media(project_id: UUID, principal: PrincipalDep, uow: UowDep, editor: EditorDep):
    await editor.authorize(uow, project_id, principal.user_id)
    return {"items": await editor.assets.editor_assets(uow, project_id=project_id)}


@router.get("/documents", response_model=DocumentList)
async def documents(project_id: UUID, principal: PrincipalDep, uow: UowDep, editor: EditorDep):
    return {"items": await editor.list(uow, project_id, principal.user_id)}


@router.post("/documents", response_model=DocumentResponse, status_code=201)
async def create(
    project_id: UUID,
    payload: CreateDocument,
    principal: MutationDep,
    uow: UowDep,
    editor: EditorDep,
):
    return await editor.create(uow, project_id, principal.user_id, payload)


@router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get(
    project_id: UUID, document_id: UUID, principal: PrincipalDep, uow: UowDep, editor: EditorDep
):
    return await editor.get(uow, project_id, principal.user_id, document_id)


@router.patch("/documents/{document_id}", response_model=DocumentResponse)
async def save(
    project_id: UUID,
    document_id: UUID,
    payload: SaveDocument,
    principal: MutationDep,
    uow: UowDep,
    editor: EditorDep,
):
    return await editor.save(uow, project_id, principal.user_id, document_id, payload)


@router.post("/documents/{document_id}/renders", response_model=RenderResponse, status_code=202)
async def export(
    project_id: UUID,
    document_id: UUID,
    payload: RenderRequest,
    principal: MutationDep,
    uow: UowDep,
    editor: EditorDep,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key")],
):
    return await editor.submit(
        uow, project_id, principal.user_id, document_id, payload.expected_version, idempotency_key
    )


@router.get("/renders/{task_id}", response_model=RenderResponse)
async def task(
    project_id: UUID, task_id: UUID, principal: PrincipalDep, uow: UowDep, editor: EditorDep
):
    return await editor.task(uow, project_id, principal.user_id, task_id)


@router.get("/documents/{document_id}/latest-render", response_model=RenderResponse | None)
async def latest_render(project_id: UUID, document_id: UUID, principal: PrincipalDep,
                        uow: UowDep, editor: EditorDep):
    return await editor.latest_render(uow, project_id, principal.user_id, document_id)
