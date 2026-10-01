from uuid import UUID

from app.api.deps import MutationDep, PrincipalDep, UowDep, UploadServiceDep
from app.modules.uploads.schemas import (
    UploadCompleteRequest,
    UploadFileResponse,
    UploadLimitsResponse,
    UploadListResponse,
    UploadTokenRequest,
    UploadTokenResponse,
)
from fastapi import APIRouter, Response

router = APIRouter(prefix="/api/v1", tags=["uploads"])


@router.get("/uploads", response_model=UploadListResponse)
async def list_uploads(
    uow: UowDep,
    principal: PrincipalDep,
    service: UploadServiceDep,
) -> UploadListResponse:
    rows = await service.list_uploaded(uow, principal.user_id)
    return UploadListResponse(
        items=[_file_response(row) for row in rows],
        limits=UploadLimitsResponse(
            image=service.settings.image_max_size,
            video=service.settings.video_max_size,
            file=service.settings.file_max_size,
        ),
    )


@router.post("/uploads/token", response_model=UploadTokenResponse)
async def issue_upload_token(
    payload: UploadTokenRequest,
    uow: UowDep,
    principal: MutationDep,
    service: UploadServiceDep,
) -> UploadTokenResponse:
    token, key, domain, upload_url, expires_in = await service.issue_token(
        uow,
        principal.user_id,
        filename=payload.filename,
        content_type=payload.content_type,
        size=payload.size,
        category=payload.category,
        key=payload.key,
    )
    return UploadTokenResponse(
        token=token,
        key=key,
        domain=domain,
        upload_url=upload_url,
        expires_in=expires_in,
    )


@router.post("/uploads/complete", response_model=UploadFileResponse)
async def complete_upload(
    payload: UploadCompleteRequest,
    uow: UowDep,
    principal: MutationDep,
    service: UploadServiceDep,
) -> UploadFileResponse:
    upload = await service.complete(uow, principal.user_id, payload.key)
    return _file_response(upload)


@router.delete("/uploads/{upload_id}", status_code=204)
async def delete_upload(
    upload_id: UUID,
    uow: UowDep,
    principal: MutationDep,
    service: UploadServiceDep,
) -> Response:
    await service.delete(uow, principal.user_id, upload_id)
    return Response(status_code=204)


def _file_response(upload) -> UploadFileResponse:
    return UploadFileResponse(
        id=upload.id,
        key=upload.object_key,
        url=upload.url,
        original_filename=upload.original_filename,
        content_type=upload.content_type,
        size=upload.size,
        category=upload.category,
        status=upload.status,
        provider=upload.provider,
        created_at=upload.created_at,
        updated_at=upload.updated_at,
    )
