from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request

from app.api.security import assert_allowed_origin, presented_csrf_token
from app.core.config import Settings
from app.core.errors import AuthenticationError, CsrfError, NotFoundError
from app.infrastructure.ai.catalog import ModelCatalog
from app.infrastructure.ai.text_completion import TextCompletionService
from app.infrastructure.db.session import UnitOfWork, get_uow
from app.modules.auth.service import AuthService, Principal
from app.modules.auth.tokens import hashes_match, preauth_token_is_valid
from app.modules.generation.inputs import GenerationInputService
from app.modules.generation.service import ImageGenerationService
from app.modules.generation.video import VideoGenerationService
from app.modules.projects.service import ProjectService
from app.modules.uploads.service import UploadService


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_auth_service(settings: Annotated[Settings, Depends(get_app_settings)]) -> AuthService:
    return AuthService(settings)


def get_project_service(
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> ProjectService:
    return ProjectService(AuthService(settings))


async def require_principal(
    request: Request,
    uow: Annotated[UnitOfWork, Depends(get_uow)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> Principal:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise AuthenticationError("Authentication required")
    return await auth_service.authenticate(uow, token)


async def optional_principal(
    request: Request,
    uow: Annotated[UnitOfWork, Depends(get_uow)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> Principal | None:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None
    try:
        return await auth_service.authenticate(uow, token)
    except AuthenticationError:
        return None


async def require_login_csrf(
    request: Request,
    uow: Annotated[UnitOfWork, Depends(get_uow)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> None:
    assert_allowed_origin(request, settings)
    csrf_token = presented_csrf_token(request, settings)
    session_token = request.cookies.get(settings.session_cookie_name)
    if session_token and await auth_service.presented_csrf_matches_live_session(
        uow,
        session_token,
        csrf_token,
    ):
        return
    if not preauth_token_is_valid(settings.csrf_secret, csrf_token, datetime.now(UTC)):
        raise CsrfError("CSRF validation failed")


async def require_mutation(
    request: Request,
    principal: Annotated[Principal, Depends(require_principal)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> Principal:
    assert_allowed_origin(request, settings)
    csrf_token = presented_csrf_token(request, settings)
    if not hashes_match(csrf_token, principal.csrf_token_hash):
        raise CsrfError("CSRF validation failed")
    return principal


def get_model_catalog(settings: Annotated[Settings, Depends(get_app_settings)]) -> ModelCatalog:
    return ModelCatalog(settings)


def get_text_completion_service(
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> TextCompletionService:
    return TextCompletionService(settings)


def get_image_generation_service(
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> ImageGenerationService:
    return ImageGenerationService(settings)


def get_video_generation_service(
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> VideoGenerationService:
    return VideoGenerationService(settings)


def get_upload_service(settings: Annotated[Settings, Depends(get_app_settings)]) -> UploadService:
    return UploadService(settings)


async def _require_platform_admin(
    uow: Annotated[UnitOfWork, Depends(get_uow)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    principal: Principal,
) -> Principal:
    if not await auth_service.is_platform_admin(uow, principal.user_id):
        raise NotFoundError("Not found")
    return principal


async def require_platform_admin_reader(
    uow: Annotated[UnitOfWork, Depends(get_uow)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    principal: Annotated[Principal, Depends(require_principal)],
) -> Principal:
    return await _require_platform_admin(uow, auth_service, principal)


async def require_platform_admin(
    uow: Annotated[UnitOfWork, Depends(get_uow)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    principal: Annotated[Principal, Depends(require_mutation)],
) -> Principal:
    return await _require_platform_admin(uow, auth_service, principal)


UowDep = Annotated[UnitOfWork, Depends(get_uow)]
SettingsDep = Annotated[Settings, Depends(get_app_settings)]
AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
ProjectServiceDep = Annotated[ProjectService, Depends(get_project_service)]
PrincipalDep = Annotated[Principal, Depends(require_principal)]
OptionalPrincipalDep = Annotated[Principal | None, Depends(optional_principal)]
MutationDep = Annotated[Principal, Depends(require_mutation)]
ModelCatalogDep = Annotated[ModelCatalog, Depends(get_model_catalog)]
TextCompletionDep = Annotated[TextCompletionService, Depends(get_text_completion_service)]
ImageGenerationDep = Annotated[ImageGenerationService, Depends(get_image_generation_service)]
VideoGenerationDep = Annotated[VideoGenerationService, Depends(get_video_generation_service)]
UploadServiceDep = Annotated[UploadService, Depends(get_upload_service)]
PlatformAdminReadDep = Annotated[Principal, Depends(require_platform_admin_reader)]
PlatformAdminDep = Annotated[Principal, Depends(require_platform_admin)]


def get_generation_input_service(
    images: ImageGenerationDep,
) -> GenerationInputService:
    return GenerationInputService(images.settings, images.storage)


GenerationInputDep = Annotated[GenerationInputService, Depends(get_generation_input_service)]
