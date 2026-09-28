"""Single render per process; PostgreSQL SKIP LOCKED supports multiple workers."""

import asyncio

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.infrastructure.db.session import create_db_engine, create_session_factory
from app.modules.editor.service import EditorService


async def run():
    settings = get_settings()
    configure_logging(settings)
    engine = create_db_engine(settings)
    factory = create_session_factory(engine)
    service = EditorService(settings)
    try:
        while True:
            if not await service.execute_next(factory):
                await asyncio.sleep(2)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
