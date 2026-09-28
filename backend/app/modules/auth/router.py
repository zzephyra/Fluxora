from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from app.api.deps import (
    AuthServiceDep,
    MutationDep,
    OptionalPrincipalDep,
    PrincipalDep,
    SettingsDep,
    UowDep,
    require_login_csrf,
)
from app.api.security import clear_auth_cookies, no_store, set_csrf_cookie, set_session_cookie
from app.modules.auth.schemas import CsrfTokenResponse, LoginRequest, LoginResponse, UserIdentity
from app.modules.auth.tokens import issue_preauth_token

router = APIRouter(prefix="/api/v1", tags=["auth"])


@router.get("/auth/csrf", response_model=CsrfTokenResponse)
async def issue_csrf(
    response: Response,
    uow: UowDep,
    settings: SettingsDep,
    auth_service: AuthServiceDep,
    principal: OptionalPrincipalDep,
) -> CsrfTokenResponse:
    if principal is None:
        token = issue_preauth_token(
            settings.csrf_secret,
            settings.csrf_preauth_ttl_seconds,
            datetime.now(UTC),
        )
        max_age = settings.csrf_preauth_ttl_seconds
    else:
        issued = await auth_service.rotate_csrf(uow, principal)
        token = issued.token
        max_age = issued.max_age_seconds
    set_csrf_cookie(response, settings, token, max_age)
    no_store(response)
    return CsrfTokenResponse(csrf_token=token)


@router.post("/auth/login", response_model=LoginResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    uow: UowDep,
    settings: SettingsDep,
    auth_service: AuthServiceDep,
    _: Annotated[None, Depends(require_login_csrf)],
) -> LoginResponse:
    result = await auth_service.login(
        uow,
        email=payload.email,
        password=payload.password,
        existing_session_token=request.cookies.get(settings.session_cookie_name),
    )
    set_session_cookie(response, settings, result.session_token, result.expires_at)
    remaining = max(0, int((result.expires_at - datetime.now(UTC)).total_seconds()))
    set_csrf_cookie(response, settings, result.csrf_token, remaining)
    no_store(response)
    return LoginResponse(
        user=UserIdentity(
            id=result.user_id,
            email=result.email,
            platform_admin=result.platform_admin,
        )
    )


@router.get("/auth/me", response_model=UserIdentity)
async def me(response: Response, principal: PrincipalDep) -> UserIdentity:
    no_store(response)
    return UserIdentity(
        id=principal.user_id,
        email=principal.email,
        platform_admin=principal.platform_admin,
    )


@router.post("/auth/logout", status_code=204)
async def logout(
    uow: UowDep,
    settings: SettingsDep,
    auth_service: AuthServiceDep,
    principal: MutationDep,
) -> Response:
    await auth_service.logout(uow, principal)
    response = Response(status_code=204)
    clear_auth_cookies(response, settings)
    no_store(response)
    return response
