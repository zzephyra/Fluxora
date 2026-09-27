from datetime import UTC, datetime

from fastapi import Response
from starlette.requests import Request

from app.core.config import Settings
from app.core.errors import CsrfError
from app.modules.auth.tokens import tokens_match


def assert_allowed_origin(request: Request, settings: Settings) -> None:
    origin = request.headers.get("origin")
    if origin is None or origin not in settings.cors_allowed_origins:
        raise CsrfError("CSRF validation failed")


def presented_csrf_token(request: Request, settings: Settings) -> str:
    header = request.headers.get("x-csrf-token")
    cookie = request.cookies.get(settings.csrf_cookie_name)
    if not isinstance(header, str) or not tokens_match(header, cookie):
        raise CsrfError("CSRF validation failed")
    return header


def set_session_cookie(
    response: Response,
    settings: Settings,
    token: str,
    expires_at: datetime,
) -> None:
    max_age = max(0, int((expires_at - datetime.now(UTC)).total_seconds()))
    response.set_cookie(
        settings.session_cookie_name,
        token,
        **_cookie_args(settings, httponly=True, max_age=max_age),
    )


def set_csrf_cookie(response: Response, settings: Settings, token: str, max_age: int) -> None:
    response.set_cookie(
        settings.csrf_cookie_name,
        token,
        **_cookie_args(settings, httponly=False, max_age=max_age),
    )


def clear_auth_cookies(response: Response, settings: Settings) -> None:
    response.delete_cookie(settings.session_cookie_name, **_delete_args(settings, httponly=True))
    response.delete_cookie(settings.csrf_cookie_name, **_delete_args(settings, httponly=False))


def no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


def _cookie_args(settings: Settings, *, httponly: bool, max_age: int) -> dict[str, object]:
    return {
        "max_age": max_age,
        "path": "/",
        "secure": settings.session_cookie_secure,
        "httponly": httponly,
        "samesite": "lax",
    }


def _delete_args(settings: Settings, *, httponly: bool) -> dict[str, object]:
    return {
        "path": "/",
        "secure": settings.session_cookie_secure,
        "httponly": httponly,
        "samesite": "lax",
    }
