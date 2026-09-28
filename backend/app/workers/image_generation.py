"""Claim queued image generations and call the provider outside the API process."""

import asyncio

from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.infrastructure.db.session import create_db_engine, create_session_factory
from app.infrastructure.storage.s3 import S3Storage
from app.modules.generation.service import ImageGenerationService

logger = get_logger(__name__)


async def _run() -> None:
    settings = get_settings()
    configure_logging(settings)
    engine = create_db_engine(settings)
    session_factory = create_session_factory(engine)
    storage = S3Storage(settings)
    await _wait_for_bucket(storage)
    service = ImageGenerationService(settings, session_factory=session_factory, storage=storage)
    logger.info("image_generation_worker_started")
    try:
        while True:
            task_ids = await service.queued_ids()
            if not task_ids:
                await asyncio.sleep(1)
                continue
            for task_id in task_ids:
                await service.execute(task_id)
    finally:
        await engine.dispose()
        logger.info("image_generation_worker_stopped")


async def _wait_for_bucket(storage: S3Storage) -> None:
    last_error = "RuntimeError"
    for _ in range(10):
        try:
            await storage.ensure_bucket()
            return
        except Exception as exc:
            last_error = type(exc).__name__
            await asyncio.sleep(1)
    raise RuntimeError(f"object storage is not ready: {last_error}")


def main() -> None:
    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        return


if __name__ == "__main__":
    main()
