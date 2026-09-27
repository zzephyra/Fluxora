import asyncio
from logging.config import fileConfig

from alembic import context
from app.core.config import get_settings
from app.infrastructure.db.base import Base
from app.infrastructure.outbox.models import OutboxEvent
from app.modules.auth.models import User, UserSession
from app.modules.projects.models import Project, ProjectMember
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata
registered_tables = {
    User.__tablename__,
    UserSession.__tablename__,
    Project.__tablename__,
    ProjectMember.__tablename__,
    OutboxEvent.__tablename__,
}
missing_tables = registered_tables.difference(target_metadata.tables)
if missing_tables:
    raise RuntimeError(f"models are missing from metadata: {sorted(missing_tables)}")
config.set_main_option("sqlalchemy.url", get_settings().database_url)


def run_migrations_offline() -> None:
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
