import asyncio
import json
from uuid import UUID, uuid4

import pytest
from app.core.errors import ConflictError
from app.infrastructure.db.session import UnitOfWork
from app.modules.editor.admin import EditorAdminService
from app.modules.editor.models import EditorRender
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from tests.test_admin_operations import setup_admin, sql
from tests.test_identity_projects import PASSWORD, _create_user, _login, _mutation_headers
from tests.test_model_configs import api as base_api
from tests.test_model_configs import migrated_database as migrated_database

api = base_api


def seed(client, settings):
    actor = setup_admin(client, settings)
    project = client.post(
        "/api/v1/projects", json={"name": "Media"}, headers=_mutation_headers(client, settings)
    ).json()["id"]
    ids = {key: str(uuid4()) for key in ["upload", "deleted", "asset", "document", "render"]}
    for key, status, size in [("upload", "uploaded", 100), ("deleted", "deleted", 900)]:
        asyncio.run(
            sql(
                settings,
                """INSERT INTO upload_files
            (id,user_id,bucket,object_key,url,original_filename,content_type,size,category,status,provider)
            VALUES (:id,:user,'PRIVATE_BUCKET',:key,'PRIVATE_URL','PRIVATE_NAME',
            'image/png',:size,'image',:status,'qiniu')""",
                {"id": ids[key], "user": actor.id, "key": ids[key], "size": size, "status": status},
            )
        )
    asyncio.run(
        sql(
            settings,
            """INSERT INTO assets
        (id,project_id,kind,object_key,sha256,mime,size_bytes,width,height,status,created_by)
        VALUES (:id,:project,'VIDEO','PRIVATE_KEY','hash','video/mp4',
        250,1280,720,'ready',:actor)""",
            {"id": ids["asset"], "project": project, "actor": actor.id},
        )
    )
    snapshot = json.dumps(
        {
            "schema_version": 1,
            "fps": 30,
            "width": 1280,
            "height": 720,
            "duration_in_frames": 60,
            "tracks": [{"id": "video", "type": "video", "clips": []}],
        }
    )
    asyncio.run(
        sql(
            settings,
            """INSERT INTO editor_documents
        (id,project_id,created_by,title,composition,version)
        VALUES (:id,:project,:actor,'PRIVATE_TITLE',CAST(:snapshot AS jsonb),1)""",
            {"id": ids["document"], "project": project, "actor": actor.id, "snapshot": snapshot},
        )
    )
    asyncio.run(
        sql(
            settings,
            """INSERT INTO editor_renders
        (id,project_id,actor_id,document_id,idempotency_key,request_hash,snapshot,status,output_asset_id)
        VALUES (:id,:project,:actor,:document,'key','hash',CAST(:snapshot AS jsonb),
        'queued',:asset)""",
            {
                "id": ids["render"],
                "project": project,
                "actor": actor.id,
                "document": ids["document"],
                "snapshot": snapshot,
                "asset": ids["asset"],
            },
        )
    )
    return actor, project, ids


def test_inventory_totals_scope_and_redaction(api):
    client, settings = api
    actor, project, ids = seed(client, settings)
    uploads = client.get("/api/v1/admin/uploads?limit=1")
    assert uploads.status_code == 200, uploads.text
    assert uploads.json()["total"] == 2
    assert uploads.json()["active_size_bytes"] == 100
    assert len(uploads.json()["items"]) == 1
    assert "PRIVATE" not in uploads.text
    assert "no-store" in uploads.headers["cache-control"]
    assert client.get("/api/v1/admin/uploads?status=deleted").json()["active_size_bytes"] == 0
    assert (
        client.get("/api/v1/admin/uploads?offset=1&limit=1").json()["items"][0]["id"]
        != uploads.json()["items"][0]["id"]
    )
    assert client.get(f"/api/v1/admin/users/{uuid4()}/uploads/{ids['upload']}").status_code == 404
    detail = client.get(f"/api/v1/admin/users/{actor.id}/uploads/{ids['upload']}")
    assert detail.status_code == 200 and "PRIVATE" not in detail.text
    assets = client.get("/api/v1/admin/assets")
    assert assets.status_code == 200, assets.text
    assert assets.json()["active_size_bytes"] == 250
    assert assets.json()["items"][0]["source"] == "editor"
    assert "object_key" not in assets.text and "PRIVATE" not in assets.text
    assert client.get(f"/api/v1/admin/projects/{uuid4()}/assets/{ids['asset']}").status_code == 404
    assert client.get("/api/v1/admin/assets?kind=IMAGE").json()["total"] == 0
    assert client.get("/api/v1/admin/uploads?status=ready").status_code == 422
    assert client.get("/api/v1/admin/editor-renders?limit=101").status_code == 422
    assert (
        client.get(
            "/api/v1/admin/assets?created_from=2026-09-29T00:00:00Z&created_to=2026-09-28T00:00:00Z"
        ).status_code
        == 422
    )


def test_render_metadata_cancel_idempotency_and_no_media_access(api):
    client, settings = api
    actor, project, ids = seed(client, settings)
    path = f"/api/v1/admin/projects/{project}/editor-renders/{ids['render']}"
    result = client.get(path)
    assert result.status_code == 200, result.text
    assert result.json()["duration_seconds"] == 2
    assert result.json()["allowed_actions"] == ["cancel"]
    assert "snapshot" not in result.text and "output_asset_id" not in result.text
    assert client.post(path + "/cancel").status_code == 403
    assert (
        client.post(path + "/cancel", headers=_mutation_headers(client, settings)).json()["status"]
        == "canceled"
    )
    assert (
        client.post(path + "/cancel", headers=_mutation_headers(client, settings)).json()["status"]
        == "canceled"
    )
    assert len(asyncio.run(sql(settings, "SELECT * FROM editor_admin_audits"))) == 1
    assert client.get("/api/v1/admin/editor-renders?status=queued").json()["total"] == 0
    asyncio.run(
        sql(
            settings,
            "UPDATE editor_renders SET status='running' WHERE id=:id",
            {"id": ids["render"]},
        )
    )
    assert (
        client.post(path + "/cancel", headers=_mutation_headers(client, settings)).status_code
        == 409
    )
    outsider = asyncio.run(_create_user(settings, "outsider@example.com", PASSWORD))
    _login(client, settings, outsider.email, PASSWORD)
    for route in [
        "/api/v1/admin/uploads",
        "/api/v1/admin/assets",
        "/api/v1/admin/editor-renders",
        path,
    ]:
        assert client.get(route).status_code == 404
    assert (
        client.post(path + "/cancel", headers=_mutation_headers(client, settings)).status_code
        == 404
    )
    client.cookies.clear()
    assert client.get(path).status_code == 401


def test_render_cancel_audit_failure_rolls_back(api, monkeypatch):
    client, settings = api
    _, project, ids = seed(client, settings)

    async def fail(self):
        raise RuntimeError("audit transaction failed")

    monkeypatch.setattr(UnitOfWork, "commit", fail)
    with pytest.raises(RuntimeError, match="audit transaction"):
        client.post(
            f"/api/v1/admin/projects/{project}/editor-renders/{ids['render']}/cancel",
            headers=_mutation_headers(client, settings),
        )
    assert (
        asyncio.run(
            sql(settings, "SELECT status FROM editor_renders WHERE id=:id", {"id": ids["render"]})
        )[0][0]
        == "queued"
    )
    assert asyncio.run(sql(settings, "SELECT * FROM editor_admin_audits")) == []


def test_worker_claim_wins_cancel_race(api):
    client, settings = api
    actor, project, ids = seed(client, settings)

    async def race():
        engine = create_async_engine(settings.database_url)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with factory() as worker, factory() as admin:
                row = await worker.scalar(
                    select(EditorRender)
                    .where(EditorRender.id == UUID(ids["render"]), EditorRender.status == "queued")
                    .with_for_update(skip_locked=True)
                )
                row.status = "running"
                pending = asyncio.create_task(
                    EditorAdminService().cancel(
                        UnitOfWork(admin),
                        project_id=UUID(project),
                        render_id=row.id,
                        actor_id=actor.id,
                        request_id="race",
                    )
                )
                await worker.commit()
                with pytest.raises(ConflictError):
                    await pending
                await admin.rollback()
        finally:
            await engine.dispose()

    asyncio.run(race())
    assert (
        asyncio.run(
            sql(settings, "SELECT status FROM editor_renders WHERE id=:id", {"id": ids["render"]})
        )[0][0]
        == "running"
    )
    assert asyncio.run(sql(settings, "SELECT * FROM editor_admin_audits")) == []


def test_canceled_render_is_not_claimed_and_invalid_snapshot_is_not_exposed(api):
    from app.modules.editor.service import EditorService

    client, settings = api
    _, project, ids = seed(client, settings)
    path = f"/api/v1/admin/projects/{project}/editor-renders/{ids['render']}"
    assert (
        client.post(path + "/cancel", headers=_mutation_headers(client, settings)).status_code
        == 200
    )

    async def work():
        engine = create_async_engine(settings.database_url)
        try:
            return await EditorService(settings).execute_next(
                async_sessionmaker(engine, expire_on_commit=False)
            )
        finally:
            await engine.dispose()

    assert asyncio.run(work()) is False
    asyncio.run(
        sql(
            settings,
            "UPDATE editor_renders SET status='failed', error='PRIVATE_PATH', "
            "snapshot='{}' WHERE id=:id",
            {"id": ids["render"]},
        )
    )
    result = client.get(path)
    assert result.status_code == 200
    assert result.json()["width"] is None
    assert result.json()["duration_seconds"] is None
    assert "PRIVATE_PATH" not in result.text
    asyncio.run(sql(settings, "UPDATE users SET platform_admin=false"))
    for route in ["/api/v1/admin/uploads", "/api/v1/admin/assets", "/api/v1/admin/editor-renders"]:
        assert client.get(route).status_code == 404
