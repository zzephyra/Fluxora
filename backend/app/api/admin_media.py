from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from app.api.admin_operations import request_id
from app.api.deps import PlatformAdminDep, PlatformAdminReadDep, UowDep
from app.api.security import no_store
from app.modules.editor.admin import AdminRender, AdminRenderList, EditorAdminService, RenderStatus
from app.modules.generation.admin_assets import AdminAsset, AdminAssetList
from app.modules.uploads.admin import AdminUpload, AdminUploadList, UploadAdminService


def private_response(response: Response) -> None:
    no_store(response)


router = APIRouter(
    prefix="/api/v1/admin", tags=["admin-media"], dependencies=[Depends(private_response)]
)


class PageFilters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    offset: int = Field(default=0, ge=0, le=100000)
    limit: int = Field(default=20, ge=1, le=100)
    created_from: AwareDatetime | None = None
    created_to: AwareDatetime | None = None

    @model_validator(mode="after")
    def time_range(self):
        if self.created_from and self.created_to and self.created_from > self.created_to:
            raise ValueError("开始时间不能晚于结束时间")
        return self


class UploadFilters(PageFilters):
    file_id: UUID | None = None
    user_id: UUID | None = None
    category: Literal["image", "video", "file"] | None = None
    status: Literal["pending", "uploaded", "failed", "deleted"] | None = None


class AssetFilters(PageFilters):
    asset_id: UUID | None = None
    project_id: UUID | None = None
    created_by: UUID | None = None
    kind: Literal["IMAGE", "VIDEO", "AUDIO", "FILE"] | None = None
    status: Literal["uploading", "ready", "failed", "deleted"] | None = None


class ExportFilters(PageFilters):
    render_id: UUID | None = None
    project_id: UUID | None = None
    actor_id: UUID | None = None
    document_id: UUID | None = None
    status: RenderStatus | None = None


@router.get("/uploads", response_model=AdminUploadList)
async def uploads(
    uow: UowDep, principal: PlatformAdminReadDep, filters: Annotated[UploadFilters, Query()]
) -> AdminUploadList:
    return await UploadAdminService().list(uow, **filters.model_dump())


@router.get("/users/{user_id}/uploads/{file_id}", response_model=AdminUpload)
async def upload(
    user_id: UUID, file_id: UUID, uow: UowDep, principal: PlatformAdminReadDep
) -> AdminUpload:
    return await UploadAdminService().get(uow, user_id=user_id, file_id=file_id)


@router.get("/assets", response_model=AdminAssetList)
async def assets(
    uow: UowDep, principal: PlatformAdminReadDep, filters: Annotated[AssetFilters, Query()]
) -> AdminAssetList:
    return await EditorAdminService().list_assets(uow, **filters.model_dump())


@router.get("/projects/{project_id}/assets/{asset_id}", response_model=AdminAsset)
async def asset(
    project_id: UUID, asset_id: UUID, uow: UowDep, principal: PlatformAdminReadDep
) -> AdminAsset:
    return await EditorAdminService().get_asset(uow, project_id=project_id, asset_id=asset_id)


@router.get("/editor-renders", response_model=AdminRenderList)
async def exports(
    uow: UowDep, principal: PlatformAdminReadDep, filters: Annotated[ExportFilters, Query()]
) -> AdminRenderList:
    return await EditorAdminService().list(uow, **filters.model_dump())


@router.get("/projects/{project_id}/editor-renders/{render_id}", response_model=AdminRender)
async def export(
    project_id: UUID, render_id: UUID, uow: UowDep, principal: PlatformAdminReadDep
) -> AdminRender:
    return await EditorAdminService().get(uow, project_id=project_id, render_id=render_id)


@router.post("/projects/{project_id}/editor-renders/{render_id}/cancel", response_model=AdminRender)
async def cancel_export(
    project_id: UUID, render_id: UUID, uow: UowDep, principal: PlatformAdminDep
) -> AdminRender:
    return await EditorAdminService().cancel(
        uow,
        project_id=project_id,
        render_id=render_id,
        actor_id=principal.user_id,
        request_id=request_id(),
    )
