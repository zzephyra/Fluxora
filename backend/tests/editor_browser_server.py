"""Manual browser acceptance harness using the real app and a dedicated test database.

Run only after pytest finishes: uv run python -m tests.editor_browser_server
Uses real FFmpeg media, real cookie authentication, PG persistence and render service.
The in-memory object storage is a test substitute, never wired into production.
"""
import asyncio
from pathlib import Path
from tempfile import TemporaryDirectory

import uvicorn
from app.api.deps import get_image_generation_service
from app.infrastructure.db.session import UnitOfWork, create_db_engine, create_session_factory
from app.main import create_app
from app.modules.auth.service import AuthService
from app.modules.editor.schemas import CreateDocument
from app.modules.editor.service import EditorService
from app.modules.generation.service import ImageGenerationService
from app.modules.projects.service import ProjectService
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from tests.conftest import make_settings
from tests.test_identity_projects import PASSWORD, _create_user
from tests.test_image_generations import MemoryStorage
from tests.test_video_editor import composition, sample, seed


async def main():
    settings = make_settings(database_url="postgresql+asyncpg://fluxora:fluxora@127.0.0.1:5432/fluxora_test", cors_allowed_origins=["http://localhost:8011"], csrf_secret="test-csrf-secret-value-with-32b")
    user = await _create_user(settings, "browser-editor@example.com", PASSWORD)
    engine = create_db_engine(settings)
    factory = create_session_factory(engine)
    async with factory() as session:
        project = await ProjectService(AuthService(settings)).create_project(UnitOfWork(session), user.id, "编辑器验收 · 测试环境")
    storage = MemoryStorage()
    with TemporaryDirectory() as tmp:
        source = Path(tmp) / "source.mp4"
        await sample(source)
        asset_id = await seed(settings, str(project.id), user.id, storage, source.read_bytes())
    assets = ImageGenerationService(settings, storage=storage)
    editor = EditorService(settings, assets)
    async with factory() as session:
        document = await editor.create(UnitOfWork(session), project.id, user.id, CreateDocument(title="编辑器浏览器验收", composition=composition(asset_id)))
    app = create_app(settings)
    app.dependency_overrides[get_image_generation_service] = lambda: assets
    dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    app.mount("/assets", StaticFiles(directory=dist / "assets"))

    @app.get("/{path:path}", include_in_schema=False)
    async def frontend(path: str):
        return FileResponse(dist / "index.html")

    async def worker():
        while True:
            await editor.execute_next(factory)
            await asyncio.sleep(.5)

    print(f"TEST_EDITOR_URL=http://localhost:8011/projects/{project.id}/editor/{document.id}", flush=True)
    task = asyncio.create_task(worker())
    try:
        await uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=8011, log_level="warning")).serve()
    finally:
        task.cancel()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
