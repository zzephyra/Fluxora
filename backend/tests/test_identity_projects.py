import asyncio
import hashlib
import os
from pathlib import Path
from uuid import UUID, uuid4

import asyncpg
import pytest
from alembic import command
from alembic.config import Config
from app.core.config import Settings, get_settings
from app.infrastructure.db.session import UnitOfWork, create_db_engine, create_session_factory
from app.main import create_app
from app.modules.auth.cli import main
from app.modules.auth.service import AuthService
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import make_settings

BACKEND_ROOT = Path(__file__).resolve().parents[1]
ADMIN_URL = "postgresql://fluxora:fluxora@127.0.0.1:5432/fluxora"
TEST_DATABASE_URL = "postgresql+asyncpg://fluxora:fluxora@127.0.0.1:5432/fluxora_test"
ORIGIN = "http://localhost:5173"
PASSWORD = "correct-horse-battery"


@pytest.fixture(scope="session")
def migrated_database() -> str:
    try:
        asyncio.run(_ensure_database())
    except (OSError, asyncpg.PostgresError) as exc:
        pytest.fail(f"PostgreSQL is required for identity and project tests: {exc}")
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
    get_settings.cache_clear()
    try:
        config = Config(str(BACKEND_ROOT / "alembic.ini"))
        config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
        command.upgrade(config, "head")
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous
        get_settings.cache_clear()
    return TEST_DATABASE_URL


@pytest.fixture
def api(migrated_database: str):
    asyncio.run(_truncate(migrated_database))
    settings = make_settings(
        database_url=migrated_database,
        csrf_secret="test-csrf-secret-value-with-32b",
        cors_allowed_origins=[ORIGIN],
    )
    with TestClient(create_app(settings)) as client:
        yield client, settings


def test_login_rotates_session_and_logout_revokes_it(api) -> None:
    client, settings = api
    asyncio.run(_create_user(settings, "owner@example.com", PASSWORD))
    first = _login(client, settings, "owner@example.com", PASSWORD)
    assert first.status_code == 200
    assert first.json()["user"]["email"] == "owner@example.com"
    assert "password" not in first.text
    _assert_session_cookie(first)
    old_session = _cookie(client, settings.session_cookie_name)

    second = _login(client, settings, "owner@example.com", PASSWORD, fresh_csrf=False)
    assert second.status_code == 200
    assert _cookie(client, settings.session_cookie_name) != old_session
    _install(client, settings, session=old_session, csrf=None)
    stale = client.get("/api/v1/auth/me")
    assert stale.status_code == 401
    assert stale.json()["error"]["code"] == "authentication_error"

    _login(client, settings, "owner@example.com", PASSWORD)
    logout = client.post("/api/v1/auth/logout", headers=_mutation_headers(client, settings))
    assert logout.status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401


def test_login_failures_do_not_reveal_which_check_failed(api) -> None:
    client, settings = api
    asyncio.run(_create_user(settings, "known@example.com", PASSWORD))
    missing = _login(client, settings, "missing@example.com", "wrong-password-value")
    wrong = _login(client, settings, "known@example.com", "wrong-password-value")
    assert missing.status_code == wrong.status_code == 401
    assert missing.json()["error"] == wrong.json()["error"]
    assert "wrong-password-value" not in missing.text
    assert "wrong-password-value" not in wrong.text

    leaked = client.post(
        "/api/v1/auth/login",
        json={"email": "known@example.com", "password": PASSWORD, "extra": True},
        headers=_mutation_headers(client, settings),
    )
    assert leaked.status_code == 422
    assert PASSWORD not in leaked.text


def test_csrf_rejects_missing_token_and_foreign_origin(api) -> None:
    client, settings = api
    asyncio.run(_create_user(settings, "csrf@example.com", PASSWORD))
    missing = client.post(
        "/api/v1/auth/login",
        json={"email": "csrf@example.com", "password": PASSWORD},
        headers={"Origin": ORIGIN},
    )
    assert missing.status_code == 403
    assert missing.json()["error"]["code"] == "csrf_failed"

    _login(client, settings, "csrf@example.com", PASSWORD)
    forged = _mutation_headers(client, settings)
    forged["Origin"] = "https://evil.example"
    rejected = client.post("/api/v1/projects", json={"name": "Hidden"}, headers=forged)
    assert rejected.status_code == 403
    assert rejected.json()["error"]["code"] == "csrf_failed"
    assert client.get("/api/v1/projects").json()["items"] == []


def test_session_token_is_hashed_and_password_uses_argon2id(api) -> None:
    client, settings = api
    asyncio.run(_create_user(settings, "hash@example.com", PASSWORD))
    assert _login(client, settings, "hash@example.com", PASSWORD).status_code == 200
    raw_token = _cookie(client, settings.session_cookie_name)
    token_hash, password_hash = asyncio.run(_credential_hashes(settings.database_url))
    assert token_hash == hashlib.sha256(raw_token.encode()).hexdigest()
    assert token_hash != raw_token
    assert password_hash.startswith("$argon2id$")

    asyncio.run(_expire_sessions(settings.database_url))
    assert client.get("/api/v1/auth/me").status_code == 401


def test_owner_member_and_cross_project_access(api) -> None:
    client, settings = api
    owner = asyncio.run(_create_user(settings, "owner@example.com", PASSWORD))
    member = asyncio.run(_create_user(settings, "member@example.com", PASSWORD))
    outsider = asyncio.run(_create_user(settings, "outsider@example.com", PASSWORD))

    _login(client, settings, owner.email, PASSWORD)
    created = client.post(
        "/api/v1/projects",
        json={"name": "  Film  "},
        headers=_mutation_headers(client, settings),
    )
    assert created.status_code == 201
    project = created.json()
    assert project["name"] == "Film"
    assert project["role"] == "OWNER"
    assert project["version"] == 1
    project_id = project["id"]

    outsider_project = _as(
        client,
        settings,
        outsider.email,
        lambda: client.post(
            "/api/v1/projects",
            json={"name": "Other"},
            headers=_mutation_headers(client, settings),
        ).json()["id"],
    )
    _login(client, settings, owner.email, PASSWORD)

    hidden = client.get(f"/api/v1/projects/{outsider_project}")
    assert hidden.status_code == 404
    assert hidden.json()["error"]["code"] == "not_found"
    forged_patch = client.patch(
        f"/api/v1/projects/{outsider_project}",
        json={"name": "Stolen", "expected_version": 1},
        headers=_mutation_headers(client, settings),
    )
    assert forged_patch.status_code == 404
    forged_members = client.get(f"/api/v1/projects/{outsider_project}/members")
    assert forged_members.status_code == 404
    listed = client.get("/api/v1/projects").json()["items"]
    assert [item["id"] for item in listed] == [project_id]

    added = client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"user_id": str(member.id), "role": "OWNER"},
        headers=_mutation_headers(client, settings),
    )
    assert added.status_code == 422
    added = client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"user_id": str(member.id)},
        headers=_mutation_headers(client, settings),
    )
    assert added.status_code == 201
    assert added.json()["role"] == "MEMBER"

    _login(client, settings, member.email, PASSWORD)
    visible = client.get(f"/api/v1/projects/{project_id}")
    assert visible.status_code == 200
    assert visible.json()["role"] == "MEMBER"
    assert client.get(f"/api/v1/projects/{project_id}/members").status_code == 200
    denied = client.patch(
        f"/api/v1/projects/{project_id}",
        json={"name": "Renamed", "expected_version": 1},
        headers=_mutation_headers(client, settings),
    )
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "authorization_error"
    assert (
        client.delete(
            f"/api/v1/projects/{project_id}",
            headers=_mutation_headers(client, settings),
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/projects/{project_id}/members",
            json={"user_id": str(outsider.id)},
            headers=_mutation_headers(client, settings),
        ).status_code
        == 403
    )

    _login(client, settings, owner.email, PASSWORD)
    remove_owner = client.delete(
        f"/api/v1/projects/{project_id}/members/{owner.id}",
        headers=_mutation_headers(client, settings),
    )
    assert remove_owner.status_code == 422
    assert remove_owner.json()["error"]["code"] == "domain_error"
    removed = client.delete(
        f"/api/v1/projects/{project_id}/members/{member.id}",
        headers=_mutation_headers(client, settings),
    )
    assert removed.status_code == 204
    _login(client, settings, member.email, PASSWORD)
    assert client.get(f"/api/v1/projects/{project_id}").status_code == 404

    with pytest.raises(IntegrityError):
        asyncio.run(_insert_second_owner(settings.database_url, project_id, outsider.id))


def test_project_version_conflict_and_delete_event(api) -> None:
    client, settings = api
    owner = asyncio.run(_create_user(settings, "owner@example.com", PASSWORD))
    _login(client, settings, owner.email, PASSWORD)
    first = client.post(
        "/api/v1/projects",
        json={"name": "One"},
        headers=_mutation_headers(client, settings),
    ).json()
    second = client.post(
        "/api/v1/projects",
        json={"name": "Two"},
        headers=_mutation_headers(client, settings),
    ).json()
    page = client.get("/api/v1/projects", params={"limit": 1})
    assert [item["id"] for item in page.json()["items"]] == [second["id"]]
    assert page.json()["next_cursor"]
    rest = client.get("/api/v1/projects", params={"limit": 1, "cursor": page.json()["next_cursor"]})
    assert [item["id"] for item in rest.json()["items"]] == [first["id"]]
    assert rest.json()["next_cursor"] is None

    renamed = client.patch(
        f"/api/v1/projects/{first['id']}",
        json={"name": "One revised", "expected_version": 1},
        headers=_mutation_headers(client, settings),
    )
    assert renamed.status_code == 200
    assert renamed.json()["version"] == 2
    conflict = client.patch(
        f"/api/v1/projects/{first['id']}",
        json={"name": "Lost update", "expected_version": 1},
        headers=_mutation_headers(client, settings),
    )
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "version_conflict"
    assert client.get(f"/api/v1/projects/{first['id']}").json()["name"] == "One revised"

    deleted = client.delete(
        f"/api/v1/projects/{first['id']}",
        headers=_mutation_headers(client, settings),
    )
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/projects/{first['id']}").status_code == 404
    listed_ids = {item["id"] for item in client.get("/api/v1/projects").json()["items"]}
    assert first["id"] not in listed_ids
    again = client.delete(
        f"/api/v1/projects/{first['id']}",
        headers=_mutation_headers(client, settings),
    )
    assert again.status_code == 204
    assert asyncio.run(_event_count(settings.database_url)) == 1


def test_disabled_user_cannot_login_or_join(api) -> None:
    client, settings = api
    owner = asyncio.run(_create_user(settings, "owner@example.com", PASSWORD))
    disabled = asyncio.run(_create_user(settings, "disabled@example.com", PASSWORD))
    asyncio.run(_disable_user(settings.database_url, disabled.id))
    failed = _login(client, settings, disabled.email, PASSWORD)
    assert failed.status_code == 401
    assert failed.json()["error"]["code"] == "authentication_error"

    _login(client, settings, owner.email, PASSWORD)
    created = client.post(
        "/api/v1/projects",
        json={"name": "Crew"},
        headers=_mutation_headers(client, settings),
    )
    assert created.status_code == 201
    added = client.post(
        f"/api/v1/projects/{created.json()['id']}/members",
        json={"user_id": str(disabled.id)},
        headers=_mutation_headers(client, settings),
    )
    assert added.status_code == 404
    assert added.json()["error"]["code"] == "not_found"


def test_cli_creates_a_user_without_echoing_the_password(api, monkeypatch, capsys) -> None:
    _client, settings = api
    monkeypatch.setenv("DATABASE_URL", settings.database_url)
    get_settings.cache_clear()
    try:
        assert main(["--email", "CLI@Example.com", "--password", PASSWORD]) == 0
        duplicate = main(["--email", "cli@example.com", "--password", PASSWORD])
        captured = capsys.readouterr()
    finally:
        get_settings.cache_clear()
    assert duplicate == 1
    assert PASSWORD not in captured.out
    assert PASSWORD not in captured.err
    logged_in = _login(_client, settings, "cli@example.com", PASSWORD)
    assert logged_in.status_code == 200


def _login(
    client: TestClient,
    settings: Settings,
    email: str,
    password: str,
    *,
    fresh_csrf: bool = True,
):
    if fresh_csrf:
        issued = client.get("/api/v1/auth/csrf")
        assert issued.status_code == 200
        _retain_auth_cookies(client, settings, issued)
        token = issued.json()["csrf_token"]
    else:
        token = _cookie(client, settings.csrf_cookie_name)
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        headers={"Origin": ORIGIN, "X-CSRF-Token": token},
    )
    _retain_auth_cookies(client, settings, response)
    return response


def _mutation_headers(client: TestClient, settings: Settings) -> dict[str, str]:
    return {"Origin": ORIGIN, "X-CSRF-Token": _cookie(client, settings.csrf_cookie_name)}


def _as(client: TestClient, settings: Settings, email: str, action):
    saved = (
        _cookie(client, settings.session_cookie_name),
        _cookie(client, settings.csrf_cookie_name),
    )
    _install(client, settings, session=None, csrf=None)
    _login(client, settings, email, PASSWORD)
    try:
        return action()
    finally:
        _install(client, settings, session=saved[0], csrf=saved[1])


def _cookie(client: TestClient, name: str) -> str:
    values = [cookie.value for cookie in client.cookies.jar if cookie.name == name]
    assert len(values) == 1, values
    return values[0]


def _install(
    client: TestClient,
    settings: Settings,
    *,
    session: str | None,
    csrf: str | None,
) -> None:
    client.cookies.clear()
    if session is not None:
        client.cookies.set(
            settings.session_cookie_name,
            session,
            domain="testserver.local",
            path="/",
        )
    if csrf is not None:
        client.cookies.set(
            settings.csrf_cookie_name,
            csrf,
            domain="testserver.local",
            path="/",
        )


def _retain_auth_cookies(client: TestClient, settings: Settings, response) -> None:
    names = {settings.session_cookie_name, settings.csrf_cookie_name}
    retained = {
        cookie.name: cookie.value for cookie in client.cookies.jar if cookie.name in names
    }
    for cookie in response.cookies.jar:
        if cookie.name in names:
            retained[cookie.name] = cookie.value
    _install(
        client,
        settings,
        session=retained.get(settings.session_cookie_name),
        csrf=retained.get(settings.csrf_cookie_name),
    )


def _assert_session_cookie(response) -> None:
    cookies = response.headers.get_list("set-cookie")
    session = next(item for item in cookies if item.startswith("fluxora_session="))
    csrf = next(item for item in cookies if item.startswith("fluxora_csrf="))
    assert "httponly" in session.lower()
    assert "samesite=lax" in session.lower()
    assert "secure" not in session.lower()
    assert "httponly" not in csrf.lower()


async def _ensure_database() -> None:
    connection = await asyncpg.connect(ADMIN_URL)
    try:
        exists = await connection.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            "fluxora_test",
        )
        if exists is None:
            await connection.execute("CREATE DATABASE fluxora_test")
    finally:
        await connection.close()


async def _truncate(database_url: str) -> None:
    engine = create_async_engine(database_url)
    try:
        async with engine.begin() as connection:
            await connection.execute(
                text(
                    "TRUNCATE outbox_events, project_members, projects, sessions, users "
                    "RESTART IDENTITY CASCADE"
                )
            )
    finally:
        await engine.dispose()


async def _create_user(settings: Settings, email: str, password: str):
    engine = create_db_engine(settings)
    session_factory = create_session_factory(engine)
    try:
        async with session_factory() as session:
            return await AuthService(settings).create_user(UnitOfWork(session), email, password)
    finally:
        await engine.dispose()


async def _credential_hashes(database_url: str) -> tuple[str, str]:
    engine = create_async_engine(database_url)
    try:
        async with engine.connect() as connection:
            token_hash = (
                await connection.execute(text("SELECT token_hash FROM sessions"))
            ).scalar_one()
            password_hash = (
                await connection.execute(text("SELECT password_hash FROM users"))
            ).scalar_one()
    finally:
        await engine.dispose()
    return token_hash, password_hash


async def _expire_sessions(database_url: str) -> None:
    engine = create_async_engine(database_url)
    try:
        async with engine.begin() as connection:
            await connection.execute(
                text("UPDATE sessions SET expires_at = now() - interval '1 second'")
            )
    finally:
        await engine.dispose()


async def _disable_user(database_url: str, user_id: UUID) -> None:
    engine = create_async_engine(database_url)
    try:
        async with engine.begin() as connection:
            await connection.execute(
                text("UPDATE users SET status = 'disabled' WHERE id = :user_id"),
                {"user_id": user_id},
            )
    finally:
        await engine.dispose()


async def _event_count(database_url: str) -> int:
    engine = create_async_engine(database_url)
    try:
        async with engine.connect() as connection:
            return int(
                (await connection.execute(text("SELECT count(*) FROM outbox_events"))).scalar_one()
            )
    finally:
        await engine.dispose()


async def _insert_second_owner(database_url: str, project_id: str, user_id: UUID) -> None:
    engine = create_async_engine(database_url)
    try:
        async with engine.begin() as connection:
            await connection.execute(
                text(
                    "INSERT INTO project_members (id, project_id, user_id, role) "
                    "VALUES (:id, :project_id, :user_id, 'OWNER')"
                ),
                {
                    "id": uuid4(),
                    "project_id": UUID(project_id),
                    "user_id": user_id,
                },
            )
    finally:
        await engine.dispose()
