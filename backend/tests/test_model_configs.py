import asyncio
import os

import pytest
from alembic import command
from alembic.config import Config
from app.core.config import get_settings
from app.infrastructure.db.session import UnitOfWork, create_db_engine, create_session_factory
from app.main import create_app
from app.modules.auth.cli import main
from app.modules.auth.service import AuthService
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from tests.conftest import make_settings
from tests.test_identity_projects import (
    BACKEND_ROOT,
    ORIGIN,
    PASSWORD,
    _create_user,
    _ensure_database,
    _login,
    _mutation_headers,
)

TEST_DATABASE_URL = "postgresql+asyncpg://fluxora:fluxora@127.0.0.1:5432/fluxora_test"
LEAKED_KEY = "sk-live-SHOULD-NOT-LEAK"


@pytest.fixture(scope="module")
def migrated_database() -> str:
    try:
        asyncio.run(_ensure_database())
    except OSError as exc:
        pytest.fail(f"PostgreSQL is required for model catalog tests: {exc}")
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
        model_secret_refs="openai_api_key",
    )
    with TestClient(create_app(settings)) as client:
        yield client, settings


def test_members_read_enabled_models_without_secrets(api) -> None:
    client, settings = api
    owner = asyncio.run(_create_user(settings, "owner@example.com", PASSWORD))
    outsider = asyncio.run(_create_user(settings, "outsider@example.com", PASSWORD))
    _login(client, settings, owner.email, PASSWORD)
    created = client.post(
        "/api/v1/projects",
        json={"name": "Film"},
        headers=_mutation_headers(client, settings),
    )
    project_id = created.json()["id"]
    asyncio.run(_grant(settings, owner.email))
    visible = _publish(client, settings, model_name="gpt-4o", capability="text_generation")
    hidden = _publish(client, settings, model_name="old-video", capability="text_to_video")
    disabled = client.patch(
        f"/api/v1/admin/model-configs/{hidden['id']}",
        json={"enabled": False},
        headers=_mutation_headers(client, settings),
    )
    assert disabled.status_code == 200

    listed = client.get(f"/api/v1/projects/{project_id}/models")
    assert listed.status_code == 200
    assert len(listed.json()["items"]) == 1
    item = listed.json()["items"][0]
    assert item["id"] == visible["id"]
    assert set(item) == {
        "id",
        "provider",
        "model_name",
        "capability",
        "config_version",
        "parameters_schema",
        "limits",
    }
    assert "secret_ref" not in listed.text
    assert LEAKED_KEY not in listed.text
    assert "old-video" not in listed.text

    blocked = client.get(f"/api/v1/projects/{project_id}/models?capability=not-a-capability")
    assert blocked.status_code == 422
    _login(client, settings, outsider.email, PASSWORD)
    missing = client.get(f"/api/v1/projects/{project_id}/models?capability=not-a-capability")
    assert missing.status_code == 404


def test_non_admin_and_secret_writes_stay_closed(api) -> None:
    client, settings = api
    owner = asyncio.run(_create_user(settings, "owner@example.com", PASSWORD))
    _login(client, settings, owner.email, PASSWORD)
    created = client.post(
        "/api/v1/projects",
        json={"name": "Film"},
        headers=_mutation_headers(client, settings),
    )
    assert created.status_code == 201
    assert client.get("/api/v1/auth/me").json()["platform_admin"] is False

    hidden = client.get("/api/v1/admin/model-configs")
    assert hidden.status_code == 404
    hidden_assignments = client.get("/api/v1/admin/model-assignments")
    assert hidden_assignments.status_code == 404
    assert hidden.json()["error"]["code"] == "not_found"
    rejected = client.post(
        "/api/v1/admin/model-configs",
        json=_body(),
        headers=_mutation_headers(client, settings),
    )
    assert rejected.status_code == 404
    assert LEAKED_KEY not in rejected.text

    asyncio.run(_grant(settings, owner.email))
    assert client.get("/api/v1/auth/me").json()["platform_admin"] is True
    no_csrf = client.post(
        "/api/v1/admin/model-configs",
        json=_body(),
        headers={"Origin": ORIGIN},
    )
    assert no_csrf.status_code == 403
    assert no_csrf.json()["error"]["code"] == "csrf_failed"

    leaked = client.post(
        "/api/v1/admin/model-configs",
        json={**_body(), "api_key": LEAKED_KEY},
        headers=_mutation_headers(client, settings),
    )
    assert leaked.status_code == 422
    assert LEAKED_KEY not in leaked.text
    nested = client.post(
        "/api/v1/admin/model-configs",
        json={**_body(), "parameters_schema": {"api_key": LEAKED_KEY}},
        headers=_mutation_headers(client, settings),
    )
    assert nested.status_code == 422
    assert LEAKED_KEY not in nested.text
    unknown = client.post(
        "/api/v1/admin/model-configs",
        json={**_body(), "secret_ref": "missing_key"},
        headers=_mutation_headers(client, settings),
    )
    assert unknown.status_code == 422
    assert asyncio.run(_config_count(settings.database_url)) == 0


def test_published_version_can_only_be_disabled(api) -> None:
    client, settings = api
    asyncio.run(_create_user(settings, "owner@example.com", PASSWORD))
    _login(client, settings, "owner@example.com", PASSWORD)
    asyncio.run(_grant(settings, "owner@example.com"))
    first = _publish(client, settings, model_name="gpt-4o", capability="text_generation")
    second = _publish(client, settings, model_name="gpt-4o", capability="text_generation")
    assert first["config_version"] == 1
    assert second["config_version"] == 2
    assert first["secret_ref"] == "openai_api_key"

    rewritten = client.patch(
        f"/api/v1/admin/model-configs/{first['id']}",
        json={"enabled": False, "model_name": "other"},
        headers=_mutation_headers(client, settings),
    )
    assert rewritten.status_code == 422
    enabled = client.patch(
        f"/api/v1/admin/model-configs/{first['id']}",
        json={"enabled": True},
        headers=_mutation_headers(client, settings),
    )
    assert enabled.status_code == 422
    current = client.get("/api/v1/admin/model-configs")
    assert current.status_code == 200
    stored = next(item for item in current.json()["items"] if item["id"] == first["id"])
    assert stored["model_name"] == "gpt-4o"
    assert stored["enabled"] is True
    assert LEAKED_KEY not in current.text

    disabled = client.patch(
        f"/api/v1/admin/model-configs/{first['id']}",
        json={"enabled": False},
        headers=_mutation_headers(client, settings),
    )
    assert disabled.status_code == 200
    again = client.patch(
        f"/api/v1/admin/model-configs/{first['id']}",
        json={"enabled": False},
        headers=_mutation_headers(client, settings),
    )
    assert again.status_code == 200
    audits = asyncio.run(_audits(settings.database_url))
    assert [row[3] for row in audits] == ["created", "created", "disabled"]
    assert all(LEAKED_KEY not in " ".join(map(str, row)) for row in audits)
    assert "secret_ref" not in asyncio.run(_audit_columns(settings.database_url))


def test_a_business_uses_only_its_assigned_model(api) -> None:
    client, settings = api
    owner = asyncio.run(_create_user(settings, "owner@example.com", PASSWORD))
    member = asyncio.run(_create_user(settings, "member@example.com", PASSWORD))
    _login(client, settings, owner.email, PASSWORD)
    project_id = client.post(
        "/api/v1/projects",
        json={"name": "Film"},
        headers=_mutation_headers(client, settings),
    ).json()["id"]
    added = client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"user_id": str(member.id)},
        headers=_mutation_headers(client, settings),
    )
    assert added.status_code == 201
    asyncio.run(_grant(settings, owner.email))
    text = _publish(client, settings, model_name="gpt-4o", capability="text_generation")
    other = _publish(client, settings, model_name="gpt-4o-mini", capability="text_generation")
    video = _publish(client, settings, model_name="video-1", capability="text_to_video")

    listed = client.get("/api/v1/admin/model-assignments")
    assert listed.status_code == 200
    by_capability = {item["capability"]: item for item in listed.json()["items"]}
    assert by_capability["text_generation"]["model_config_id"] is None
    assert by_capability["text_to_video"]["model_config_id"] is None
    assert "speech_synthesis" in by_capability
    mismatch = client.put(
        "/api/v1/admin/model-assignments/text_to_video",
        json={"model_config_id": text["id"]},
        headers=_mutation_headers(client, settings),
    )
    assert mismatch.status_code == 422
    assigned = client.put(
        "/api/v1/admin/model-assignments/text_generation",
        json={"model_config_id": text["id"]},
        headers=_mutation_headers(client, settings),
    )
    assert assigned.status_code == 200
    assert assigned.json()["model_name"] == "gpt-4o"
    switched = client.put(
        "/api/v1/admin/model-assignments/text_generation",
        json={"model_config_id": other["id"]},
        headers=_mutation_headers(client, settings),
    )
    assert switched.status_code == 200
    assert switched.json()["model_config_id"] == other["id"]
    disabled = client.patch(
        f"/api/v1/admin/model-configs/{other['id']}",
        json={"enabled": False},
        headers=_mutation_headers(client, settings),
    )
    assert disabled.status_code == 200
    cleared = client.get("/api/v1/admin/model-assignments")
    text_row = next(
        item for item in cleared.json()["items"] if item["capability"] == "text_generation"
    )
    assert text_row["model_config_id"] is None
    video_only = client.put(
        "/api/v1/admin/model-assignments/text_to_video",
        json={"model_config_id": video["id"]},
        headers=_mutation_headers(client, settings),
    )
    assert video_only.status_code == 200
    assert video_only.json()["model_name"] == "video-1"

    _login(client, settings, member.email, PASSWORD)
    missing = client.get(f"/api/v1/projects/{project_id}/active-model?capability=text_generation")
    assert missing.status_code == 404
    _login(client, settings, owner.email, PASSWORD)
    client.put(
        "/api/v1/admin/model-assignments/text_generation",
        json={"model_config_id": text["id"]},
        headers=_mutation_headers(client, settings),
    )
    _login(client, settings, member.email, PASSWORD)
    active = client.get(f"/api/v1/projects/{project_id}/active-model?capability=text_generation")
    assert active.status_code == 200
    assert active.json()["model_name"] == "gpt-4o"
    assert "secret_ref" not in active.json()
    blocked = client.put(
        "/api/v1/admin/model-assignments/text_generation",
        json={"model_config_id": text["id"]},
        headers=_mutation_headers(client, settings),
    )
    assert blocked.status_code == 404


def test_cli_grants_platform_admin_without_a_password(api, monkeypatch, capsys) -> None:
    client, settings = api
    asyncio.run(_create_user(settings, "admin@example.com", PASSWORD))
    monkeypatch.setenv("DATABASE_URL", settings.database_url)
    get_settings.cache_clear()
    try:
        assert main(["--grant-platform-admin", "--email", "admin@example.com"]) == 0
        captured = capsys.readouterr()
    finally:
        get_settings.cache_clear()
    assert PASSWORD not in captured.out
    assert PASSWORD not in captured.err
    logged_in = _login(client, settings, "admin@example.com", PASSWORD)
    assert logged_in.json()["user"]["platform_admin"] is True


def _body() -> dict[str, object]:
    return {
        "provider": "openai",
        "model_name": "gpt-4o",
        "capability": "text_generation",
        "parameters_schema": {},
        "limits": {},
        "secret_ref": "openai_api_key",
    }


def _publish(client: TestClient, settings, *, model_name: str, capability: str) -> dict:
    response = client.post(
        "/api/v1/admin/model-configs",
        json={**_body(), "model_name": model_name, "capability": capability},
        headers=_mutation_headers(client, settings),
    )
    assert response.status_code == 201, response.text
    assert LEAKED_KEY not in response.text
    return response.json()


async def _grant(settings, email: str) -> None:
    engine = create_db_engine(settings)
    session_factory = create_session_factory(engine)
    try:
        async with session_factory() as session:
            await AuthService(settings).grant_platform_admin(UnitOfWork(session), email)
    finally:
        await engine.dispose()


async def _truncate(database_url: str) -> None:
    engine = create_async_engine(database_url)
    try:
        async with engine.begin() as connection:
            await connection.execute(
                text(
                    "TRUNCATE generation_outputs, generation_tasks, assets, text_completions, "
                    "model_assignments, "
                    "model_config_audits, model_configs, outbox_events, "
                    "project_members, projects, sessions, users RESTART IDENTITY CASCADE"
                )
            )
    finally:
        await engine.dispose()


async def _config_count(database_url: str) -> int:
    engine = create_async_engine(database_url)
    try:
        async with engine.connect() as connection:
            return int(
                (await connection.execute(text("SELECT count(*) FROM model_configs"))).scalar_one()
            )
    finally:
        await engine.dispose()


async def _audits(database_url: str) -> list[tuple]:
    engine = create_async_engine(database_url)
    try:
        async with engine.connect() as connection:
            result = await connection.execute(
                text(
                    "SELECT actor_id::text, model_config_id::text, config_version, action "
                    "FROM model_config_audits ORDER BY created_at, action"
                )
            )
            return [tuple(row) for row in result]
    finally:
        await engine.dispose()


async def _audit_columns(database_url: str) -> set[str]:
    engine = create_async_engine(database_url)
    try:
        async with engine.connect() as connection:
            result = await connection.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'model_config_audits'"
                )
            )
            return {row[0] for row in result}
    finally:
        await engine.dispose()
