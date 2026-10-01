import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from tests.test_identity_projects import PASSWORD, _create_user, _login, _mutation_headers
from tests.test_model_configs import _grant, _publish
from tests.test_model_configs import api as base_api
from tests.test_model_configs import migrated_database as migrated_database

api = base_api


def setup_admin(client, settings):
    admin = asyncio.run(_create_user(settings, "admin@example.com", PASSWORD))
    asyncio.run(_grant(settings, admin.email))
    _login(client, settings, admin.email, PASSWORD)
    return admin


async def sql(settings, statement, params=None):
    engine = create_async_engine(settings.database_url)
    try:
        async with engine.begin() as connection:
            result = await connection.execute(text(statement), params or {})
            return result.fetchall() if result.returns_rows else []
    finally:
        await engine.dispose()


def test_user_lifecycle_permissions_concurrency_and_audits(api):
    client, settings = api
    assert client.get("/api/v1/admin/users").status_code == 401
    ordinary = asyncio.run(_create_user(settings, "creator@example.com", PASSWORD))
    _login(client, settings, ordinary.email, PASSWORD)
    old_cookie = client.cookies.get(settings.session_cookie_name)
    assert client.get("/api/v1/admin/users").status_code == 404
    assert client.get("/api/v1/admin/generation-tasks").status_code == 404
    admin = setup_admin(client, settings)
    result = client.get("/api/v1/admin/users", params={"q": "creator", "limit": 1})
    assert result.status_code == 200
    assert result.json()["total"] == 1
    assert "password" not in result.text and "token" not in result.text
    row = result.json()["items"][0]
    url = f"/api/v1/admin/users/{ordinary.id}/status"
    body = {"status": "disabled", "expected_updated_at": row["updated_at"]}
    assert client.patch(url, json=body).status_code == 403
    result = client.patch(url, json=body, headers=_mutation_headers(client, settings))
    assert result.status_code == 200
    assert result.json()["status"] == "disabled"
    assert (
        client.patch(url, json=body, headers=_mutation_headers(client, settings)).status_code == 409
    )
    restored = client.patch(
        url,
        json={"status": "active", "expected_updated_at": result.json()["updated_at"]},
        headers=_mutation_headers(client, settings),
    )
    assert restored.status_code == 200
    protected = client.get("/api/v1/admin/users", params={"q": "admin@"}).json()["items"][0]
    assert (
        client.patch(
            f"/api/v1/admin/users/{admin.id}/status",
            json={"status": "disabled", "expected_updated_at": protected["updated_at"]},
            headers=_mutation_headers(client, settings),
        ).status_code
        == 409
    )
    revoked = client.post(
        f"/api/v1/admin/users/{ordinary.id}/revoke-sessions",
        json={"expected_updated_at": restored.json()["updated_at"]},
        headers=_mutation_headers(client, settings),
    )
    assert revoked.status_code == 200
    assert len(asyncio.run(sql(settings, "SELECT * FROM auth_admin_audits"))) == 3
    client.cookies.clear()
    client.cookies.set(settings.session_cookie_name, old_cookie)
    assert client.get("/api/v1/auth/me").status_code == 401
    _login(client, settings, ordinary.email, PASSWORD)
    assert client.get("/api/v1/auth/me").status_code == 200


def seed_task(client, settings, kind="image"):
    model = _publish(
        client,
        settings,
        model_name="test-model",
        capability="text_to_image" if kind == "image" else "text_to_video",
    )
    project = client.post(
        "/api/v1/projects", json={"name": "test film"}, headers=_mutation_headers(client, settings)
    ).json()
    actor = client.get("/api/v1/auth/me").json()["id"]
    task_id = str(uuid4())
    asyncio.run(
        sql(
            settings,
            """INSERT INTO generation_tasks
        (id,project_id,actor_id,model_config_id,config_version,idempotency_key,request_hash,request_snapshot,kind,status,provider,reconciliation_required,lease_token)
        VALUES (:id,:project,:actor,:model,1,'test-key','hash',
        '{"prompt":"PRIVATE PROMPT"}',:kind,'queued','test-provider',false,0)""",
            {
                "id": task_id,
                "project": project["id"],
                "actor": actor,
                "model": model["id"],
                "kind": kind,
            },
        )
    )
    return project["id"], task_id


@pytest.mark.parametrize("kind", ["image", "video"])
def test_tasks_filter_safe_detail_cancel_and_scope(api, kind):
    client, settings = api
    setup_admin(client, settings)
    project, task = seed_task(client, settings, kind)
    path = f"/api/v1/admin/projects/{project}/generation-tasks/{task}"
    assert client.get("/api/v1/admin/generation-tasks?status=nonsense").status_code == 422
    assert client.get("/api/v1/admin/generation-tasks?limit=101").status_code == 422
    assert client.get("/api/v1/admin/generation-tasks?provider=missing").json()["total"] == 0
    result = client.get(
        "/api/v1/admin/generation-tasks",
        params={"kind": kind, "task_id": task, "project_id": project, "limit": 1},
    )
    assert result.json()["total"] == 1
    assert "PRIVATE PROMPT" not in result.text and "request_snapshot" not in result.text
    assert (
        client.get(f"/api/v1/admin/projects/{uuid4()}/generation-tasks/{task}").status_code == 404
    )
    assert client.get(path).json()["allowed_actions"] == ["cancel"]
    assert client.post(path + "/cancel").status_code == 403
    response = client.post(path + "/cancel", headers=_mutation_headers(client, settings))
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "canceled"
    assert response.json()["allowed_actions"] == []
    assert len(asyncio.run(sql(settings, "SELECT * FROM generation_admin_audits"))) == 1
    ordinary = asyncio.run(_create_user(settings, "outsider@example.com", PASSWORD))
    _login(client, settings, ordinary.email, PASSWORD)
    assert client.get(path).status_code == 404
    assert (
        client.post(path + "/cancel", headers=_mutation_headers(client, settings)).status_code
        == 404
    )
    assert client.get(f"/api/v1/projects/{project}/generation-tasks").status_code == 404


def test_running_task_rejects_cancel_and_redacts_errors(api):
    client, settings = api
    setup_admin(client, settings)
    project, task = seed_task(client, settings, "video")
    asyncio.run(
        sql(
            settings,
            "UPDATE generation_tasks SET status='running', reconciliation_required=true, "
            "error_code='SECRET', error_message='PRIVATE' WHERE id=:id",
            {"id": task},
        )
    )
    path = f"/api/v1/admin/projects/{project}/generation-tasks/{task}"
    result = client.get(path)
    assert result.json()["allowed_actions"] == []
    assert "PRIVATE" not in result.text and "SECRET" not in result.text
    assert (
        client.post(path + "/cancel", headers=_mutation_headers(client, settings)).status_code
        == 409
    )
    assert client.get(path).json()["status"] == "running"
    assert (
        client.get("/api/v1/admin/generation-tasks?reconciliation_required=true").json()["total"]
        == 1
    )
    assert asyncio.run(sql(settings, "SELECT * FROM generation_admin_audits")) == []


def test_audit_failure_rolls_back_task_cancel(api, monkeypatch):
    from app.infrastructure.db.session import UnitOfWork

    client, settings = api
    setup_admin(client, settings)
    project, task = seed_task(client, settings)
    original = UnitOfWork.commit

    async def broken_commit(self):
        raise RuntimeError("simulated commit failure")

    monkeypatch.setattr(UnitOfWork, "commit", broken_commit)
    with pytest.raises(RuntimeError, match="simulated"):
        client.post(
            f"/api/v1/admin/projects/{project}/generation-tasks/{task}/cancel",
            headers=_mutation_headers(client, settings),
        )
    monkeypatch.setattr(UnitOfWork, "commit", original)
    assert (
        asyncio.run(
            sql(settings, "SELECT status FROM generation_tasks WHERE id=:id", {"id": task})
        )[0][0]
        == "queued"
    )
    assert asyncio.run(sql(settings, "SELECT * FROM generation_admin_audits")) == []


def test_user_admin_revocation_is_checked_on_every_request(api):
    client, settings = api
    admin = setup_admin(client, settings)
    assert client.get("/api/v1/admin/users").status_code == 200
    asyncio.run(
        sql(settings, "UPDATE users SET platform_admin=false WHERE id=:id", {"id": admin.id})
    )
    assert client.get("/api/v1/admin/users").status_code == 404
    assert client.get("/api/v1/admin/generation-tasks").status_code == 404
