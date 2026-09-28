from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.ai.domain import MAX_MODEL_CONFIGS
from app.infrastructure.ai.models import ModelAssignment, ModelConfig, ModelConfigAudit


class ModelConfigRepository:
    async def list_configs(
        self,
        session: AsyncSession,
        *,
        enabled_only: bool,
        capability: str | None,
    ) -> list[ModelConfig]:
        stmt = select(ModelConfig)
        if enabled_only:
            stmt = stmt.where(ModelConfig.enabled.is_(True))
        if capability is not None:
            stmt = stmt.where(ModelConfig.capability == capability)
        stmt = stmt.order_by(
            ModelConfig.provider,
            ModelConfig.model_name,
            ModelConfig.config_version,
        ).limit(MAX_MODEL_CONFIGS)
        return list((await session.execute(stmt)).scalars().all())

    async def count_configs(self, session: AsyncSession) -> int:
        stmt = select(func.count()).select_from(ModelConfig)
        return int((await session.execute(stmt)).scalar_one())

    async def next_version(
        self,
        session: AsyncSession,
        *,
        provider: str,
        model_name: str,
        capability: str,
    ) -> int:
        stmt = select(func.coalesce(func.max(ModelConfig.config_version), 0)).where(
            ModelConfig.provider == provider,
            ModelConfig.model_name == model_name,
            ModelConfig.capability == capability,
        )
        current = int((await session.execute(stmt)).scalar_one())
        return current + 1

    async def get_config(self, session: AsyncSession, config_id: UUID) -> ModelConfig | None:
        stmt = select(ModelConfig).where(ModelConfig.id == config_id)
        return (await session.execute(stmt)).scalar_one_or_none()

    async def add_config(self, session: AsyncSession, config: ModelConfig) -> None:
        session.add(config)

    async def add_audit(self, session: AsyncSession, audit: ModelConfigAudit) -> None:
        session.add(audit)

    async def list_assignments(
        self,
        session: AsyncSession,
    ) -> list[tuple[ModelAssignment, ModelConfig]]:
        stmt = select(ModelAssignment, ModelConfig).join(
            ModelConfig,
            ModelConfig.id == ModelAssignment.model_config_id,
        )
        return list((await session.execute(stmt)).all())

    async def get_assignment(
        self,
        session: AsyncSession,
        capability: str,
    ) -> ModelAssignment | None:
        stmt = select(ModelAssignment).where(ModelAssignment.capability == capability)
        return (await session.execute(stmt)).scalar_one_or_none()

    async def assignment_for_config(
        self,
        session: AsyncSession,
        config_id: UUID,
    ) -> ModelAssignment | None:
        stmt = select(ModelAssignment).where(ModelAssignment.model_config_id == config_id)
        return (await session.execute(stmt)).scalar_one_or_none()

    async def assigned_config(self, session: AsyncSession, capability: str) -> ModelConfig | None:
        stmt = (
            select(ModelConfig)
            .join(ModelAssignment, ModelAssignment.model_config_id == ModelConfig.id)
            .where(
                ModelAssignment.capability == capability,
                ModelConfig.capability == capability,
                ModelConfig.enabled.is_(True),
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    async def delete_assignment(self, session: AsyncSession, capability: str) -> None:
        await session.execute(
            delete(ModelAssignment).where(ModelAssignment.capability == capability)
        )
