import asyncio
import json
import os
from uuid import UUID

import pytest
from alembic import command
from alembic.config import Config
from app.api.deps import get_image_generation_service
from app.core.config import get_settings
from app.infrastructure.ai.adapters.openai_images import OpenAICompatibleImages
from app.main import create_app
from app.modules.generation.service import ImageClient, ImageGenerationService
from fastapi.testclient import TestClient

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
from tests.test_model_configs import LEAKED_KEY, _grant, _publish, _truncate

TEST_DATABASE_URL = "postgresql+asyncpg://fluxora:fluxora@127.0.0.1:5432/fluxora_test"
FAKE_KEY = "test-key-not-real"
ENDPOINT = json.dumps(
    {
        "openai_api_key": {
            "base_url": "https://example.test/v1",
            "api_key": FAKE_KEY,
        }
    }
)
PNG = b"\x89PNG\r\n\x1a\n" + b"pixels"


class MemoryStorage:
    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    async def put_object(self, *, object_key: str, content: bytes, content_type: str) -> None:
        self.objects[object_key] = (content, content_type)

    async def get_object(self, *, object_key: str) -> bytes:
        return self.objects[object_key][0]


class ExplodingImages:
    async def generate(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        prompt: str,
        size: str | None = None,
        count: int = 1,
    ) -> list[tuple[bytes, str]]:
        raise AssertionError("submit must not call the provider")


class RecordingImages:
    def __init__(self) -> None:
        self.api_keys: list[str] = []

    async def generate(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        prompt: str,
        size: str | None = None,
        count: int = 1,
    ) -> list[tuple[bytes, str]]:
        self.api_keys.append(api_key)
        assert prompt == "a quiet harbor"
        assert model == "image-1"
        assert base_url == "https://example.test/v1"
        assert size is None
        assert count == 1
        return [(PNG, "image/png")]


@pytest.fixture(scope="module")
def migrated_database() -> str:
    try:
        asyncio.run(_ensure_database())
    except OSError as exc:
        pytest.fail(f"PostgreSQL is required for image generation tests: {exc}")
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
def image_api(migrated_database: str):
    asyncio.run(_truncate(migrated_database))
    settings = make_settings(
        database_url=migrated_database,
        csrf_secret="test-csrf-secret-value-with-32b",
        cors_allowed_origins=[ORIGIN],
        model_secret_refs="openai_api_key",
        model_endpoints=ENDPOINT,
        s3_endpoint_url="http://127.0.0.1:9000",
        s3_bucket="fluxora",
        s3_access_key_id="fluxora",
        s3_secret_access_key="test-storage-secret",
    )
    storage = MemoryStorage()
    app = create_app(settings)
    app.dependency_overrides[get_image_generation_service] = lambda: ImageGenerationService(
        settings,
        client=ExplodingImages(),
        storage=storage,
    )
    with TestClient(app) as client:
        yield client, settings, storage


def test_queue_does_not_call_provider_and_worker_stores_the_image(image_api) -> None:
    client, settings, storage = image_api
    owner = asyncio.run(_create_user(settings, "owner@example.com", PASSWORD))
    outsider = asyncio.run(_create_user(settings, "outsider@example.com", PASSWORD))
    _login(client, settings, owner.email, PASSWORD)
    project_id = client.post(
        "/api/v1/projects",
        json={"name": "Film"},
        headers=_mutation_headers(client, settings),
    ).json()["id"]
    asyncio.run(_grant(settings, owner.email))
    model = _publish(client, settings, model_name="image-1", capability="text_to_image")
    video = _publish(client, settings, model_name="video-1", capability="text_to_video")

    leaked = client.post(
        f"/api/v1/projects/{project_id}/generation-tasks",
        json={
            "model_config_id": model["id"],
            "prompt": "a quiet harbor",
            "parameters": {},
            "api_key": LEAKED_KEY,
        },
        headers={**_mutation_headers(client, settings), "Idempotency-Key": "image-key-1"},
    )
    assert leaked.status_code == 422
    assert LEAKED_KEY not in leaked.text
    assert FAKE_KEY not in leaked.text

    unsupported = _submit(
        client,
        settings,
        project_id,
        "a quiet harbor",
        "image-key-bad",
        {"quality": "4k"},
    )
    assert unsupported.status_code == 422
    unassigned = _submit(client, settings, project_id, "a quiet harbor", "image-key-0")
    assert unassigned.status_code == 422
    mismatch = client.put(
        "/api/v1/admin/model-assignments/text_to_image",
        json={"model_config_id": video["id"]},
        headers=_mutation_headers(client, settings),
    )
    assert mismatch.status_code == 422
    assigned = client.put(
        "/api/v1/admin/model-assignments/text_to_image",
        json={"model_config_id": model["id"]},
        headers=_mutation_headers(client, settings),
    )
    assert assigned.status_code == 200

    queued = _submit(client, settings, project_id, " a quiet harbor ", "image-key-1")
    assert queued.status_code == 202
    body = queued.json()
    assert body["status"] == "queued"
    assert body["output_asset_ids"] == []
    assert body["allowed_actions"] == ["cancel"]
    assert body["reconciliation_required"] is False
    assert FAKE_KEY not in queued.text
    replay = _submit(client, settings, project_id, "a quiet harbor", "image-key-1")
    assert replay.status_code == 202
    assert replay.json()["id"] == body["id"]
    changed = _submit(
        client,
        settings,
        project_id,
        "a different harbor",
        "image-key-1",
    )
    assert changed.status_code == 409

    recorder = RecordingImages()
    asyncio.run(_execute(settings, UUID(body["id"]), recorder, storage))
    assert recorder.api_keys == [FAKE_KEY]
    finished = client.get(f"/api/v1/projects/{project_id}/generation-tasks/{body['id']}")
    assert finished.status_code == 200
    assert finished.json()["status"] == "succeeded"
    asset_id = finished.json()["output_asset_ids"][0]
    content = client.get(f"/api/v1/projects/{project_id}/assets/{asset_id}/content")
    assert content.status_code == 200
    assert content.content == PNG
    assert content.headers["content-type"].startswith("image/png")
    assert FAKE_KEY not in content.content.decode("latin1")
    stored = next(iter(storage.objects.values()))
    assert stored[0] == PNG
    assert FAKE_KEY.encode() not in stored[0]

    failing = _submit(client, settings, project_id, "a quiet harbor", "image-key-3")
    assert failing.status_code == 202

    def reject(url: str, api_key: str, payload: dict, timeout: float) -> tuple[int, object]:
        assert api_key == FAKE_KEY
        return 401, {"error": LEAKED_KEY}

    asyncio.run(
        _execute(
            settings,
            UUID(failing.json()["id"]),
            OpenAICompatibleImages(post=reject),
            storage,
        )
    )
    failed = client.get(f"/api/v1/projects/{project_id}/generation-tasks/{failing.json()['id']}")
    assert failed.json()["status"] == "failed"
    assert failed.json()["error"]["retryable"] is False
    assert LEAKED_KEY not in failed.text
    assert FAKE_KEY not in failed.text

    waiting = _submit(client, settings, project_id, "a quiet harbor", "image-key-4")
    canceled = client.post(
        f"/api/v1/projects/{project_id}/generation-tasks/{waiting.json()['id']}/cancel",
        headers=_mutation_headers(client, settings),
    )
    assert canceled.status_code == 200
    assert canceled.json()["status"] == "canceled"

    _login(client, settings, outsider.email, PASSWORD)
    hidden = _submit(client, settings, project_id, "a quiet harbor", "image-key-5")
    assert hidden.status_code == 404
    assert FAKE_KEY not in hidden.text


def _submit(
    client: TestClient,
    settings,
    project_id: str,
    prompt: str,
    key: str,
    parameters: dict | None = None,
):
    return client.post(
        f"/api/v1/projects/{project_id}/generation-tasks",
        json={"prompt": prompt, "parameters": {} if parameters is None else parameters},
        headers={**_mutation_headers(client, settings), "Idempotency-Key": key},
    )


def test_selected_image_options_are_sent_to_the_provider() -> None:
    import base64

    seen: dict = {}

    def post(url: str, api_key: str, payload: dict, timeout: float) -> tuple[int, object]:
        seen.update(payload)
        return 200, {"data": [{"b64_json": base64.b64encode(PNG).decode()}]}

    images = asyncio.run(
        OpenAICompatibleImages(post=post).generate(
            base_url="https://example.test/v1",
            api_key=FAKE_KEY,
            model="image-1",
            prompt="a quiet harbor",
            size="1024x1024",
            count=2,
        )
    )
    assert seen["size"] == "1024x1024"
    assert seen["n"] == 2
    assert images == [(PNG, "image/png")]


async def _execute(settings, task_id: UUID, client: ImageClient, storage: MemoryStorage) -> None:
    from app.infrastructure.db.session import create_db_engine, create_session_factory

    engine = create_db_engine(settings)
    try:
        service = ImageGenerationService(
            settings,
            session_factory=create_session_factory(engine),
            client=client,
            storage=storage,
        )
        await service.execute(task_id)
    finally:
        await engine.dispose()
