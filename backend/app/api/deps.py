from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request

from app.api.security import assert_allowed_origin, presented_csrf_token
from app.core.config import Settings
from app.core.errors import AuthenticationError, CsrfError
from app.infrastructure.db.session import UnitOfWork, get_uow
from app.modules.auth.service import AuthService, Principal
from app.modules.auth.tokens import hashes_match, preauth_token_is_valid
from app.modules.projects.service import ProjectService


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


UowDep = Annotated[UnitOfWork, Depends(get_uow)]
SettingsDep = Annotated[Settings, Depends(get_app_settings)]
AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
ProjectServiceDep = Annotated[ProjectService, Depends(get_project_service)]
PrincipalDep = Annotated[Principal, Depends(require_principal)]
OptionalPrincipalDep = Annotated[Principal | None, Depends(optional_principal)]
MutationDep = Annotated[Principal, Depends(require_mutation)]
