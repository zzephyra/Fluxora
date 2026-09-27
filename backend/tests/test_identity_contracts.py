import base64
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from app.core.config import INSECURE_CSRF_SECRET, LOCAL_DEV_ORIGINS, Settings
from app.main import create_app
from app.modules.auth.domain import normalize_email, validate_password
from app.modules.auth.tokens import issue_preauth_token, preauth_token_is_valid
from app.modules.projects.domain import decode_cursor, encode_cursor, normalize_project_name
from pydantic import ValidationError

from tests.conftest import make_settings


def test_openapi_lists_identity_and_project_routes() -> None:
    schema = create_app(make_settings()).openapi()
    paths = schema["paths"]
    for path in (
        "/api/v1/auth/csrf",
        "/api/v1/auth/login",
        "/api/v1/auth/me",
        "/api/v1/auth/logout",
        "/api/v1/projects",
        "/api/v1/projects/{project_id}",
        "/api/v1/projects/{project_id}/members",
        "/api/v1/projects/{project_id}/members/{user_id}",
    ):
        assert path in paths


def test_email_is_normalized_and_rejected_when_invalid() -> None:
    assert normalize_email("  User@Example.com ") == "user@example.com"
    with pytest.raises(Exception, match="Email is invalid"):
        normalize_email("not-an-email")


def test_password_length_is_bounded() -> None:
    assert validate_password("a") == "a"
    with pytest.raises(Exception, match="Password must be"):
        validate_password("")
    with pytest.raises(Exception, match="Password must be"):
        validate_password("x" * 129)


def test_preauth_csrf_rejects_tampering_and_expiry() -> None:
    now = datetime(2026, 9, 27, tzinfo=UTC)
    secret = "test-csrf-secret-value-with-32b"
    token = issue_preauth_token(secret, 600, now)
    assert preauth_token_is_valid(secret, token, now + timedelta(minutes=5))
    assert not preauth_token_is_valid(secret, token, now + timedelta(minutes=11))
    assert not preauth_token_is_valid("other-csrf-secret-value-with-32b", token, now)
    assert not preauth_token_is_valid(secret, token + "x", now)


def test_project_name_is_stripped() -> None:
    assert normalize_project_name("  Launch film  ") == "Launch film"
    with pytest.raises(Exception, match="Project name"):
        normalize_project_name("   ")


def test_cursor_round_trip() -> None:
    created_at = datetime(2026, 9, 27, 3, 4, 5, tzinfo=UTC)
    entity_id = uuid4()
    cursor = decode_cursor(encode_cursor(created_at, entity_id))
    assert cursor.entity_id == entity_id
    assert cursor.created_at == created_at
    with pytest.raises(Exception, match="Cursor is invalid"):
        decode_cursor(base64.urlsafe_b64encode(b"not-a-cursor").decode())


def test_production_rejects_default_auth_settings() -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            environment="production",
            csrf_secret=INSECURE_CSRF_SECRET,
            cors_allowed_origins=["https://app.example.com"],
        )
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            environment="production",
            csrf_secret="x" * 32,
            cors_allowed_origins=list(LOCAL_DEV_ORIGINS),
        )
