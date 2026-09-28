"""Queue one explicit image generation and finish it outside the request transaction."""

import hashlib
import json
import re
from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID, uuid4

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.errors import (
    ApplicationError,
    CancellationUnsupportedError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.core.logging import get_logger
from app.infrastructure.ai.adapters.openai_images import OpenAICompatibleImages
from app.infrastructure.ai.catalog import require_assigned
from app.infrastructure.ai.domain import PROMPT_MAX_LENGTH, json_object
from app.infrastructure.ai.models import ModelConfig
from app.infrastructure.db.session import UnitOfWork
from app.infrastructure.storage.s3 import S3Storage
from app.modules.generation.models import Asset, GenerationOutput, GenerationTask

logger = get_logger(__name__)
_IDEMPOTENCY_KEY = re.compile(r"^[\x21-\x7e]{1,128}$")
_EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}


class ImageClient(Protocol):
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
        """Return image bytes and mime types. Implementations must not log the API key."""


class ObjectStorage(Protocol):
    async def put_object(self, *, object_key: str, content: bytes, content_type: str) -> None:
        """Store private bytes."""

    async def get_object(self, *, object_key: str) -> bytes:
        """Read private bytes after the caller has authorized the asset."""


class ImageGenerationService:
    def __init__(
        self,
        settings: Settings,
        session_factory: async_sessionmaker[AsyncSession] | None = None,
        client: ImageClient | None = None,
        storage: ObjectStorage | None = None,
    ) -> None:
        self.settings = settings
        self.session_factory = session_factory
        self.client = client or OpenAICompatibleImages()
        self.storage = storage or S3Storage(settings)

    async def submit(
        self,
        uow: UnitOfWork,
        *,
        project_id: UUID,
        actor_id: UUID,
        prompt: str,
        parameters: dict,
        idempotency_key: str,
    ) -> GenerationTask:
        key = _clean_key(idempotency_key)
        cleaned = _clean_prompt(prompt)
        safe_parameters = _parameters(parameters)
        if not self.settings.object_storage_configured:
            raise ValidationError("Object storage is not configured")
        config = await require_assigned(uow.session, "text_to_image")
        if self.settings.model_endpoint(config.secret_ref) is None:
            raise ValidationError("Secret reference is not configured")
        request_hash = _request_hash(config.id, cleaned, safe_parameters)
        existing = await _by_key(uow.session, project_id, actor_id, key)
        if existing is not None:
            return _same_request(existing, request_hash)
        row = GenerationTask(
            id=uuid4(),
            project_id=project_id,
            actor_id=actor_id,
            model_config_id=config.id,
            config_version=config.config_version,
            idempotency_key=key,
            request_hash=request_hash,
            request_snapshot={"prompt": cleaned, "parameters": safe_parameters},
            kind="image",
            status="queued",
            phase=None,
            progress=None,
            reconciliation_required=False,
            provider=config.provider,
            provider_task_id=None,
            error_code=None,
            error_message=None,
            lease_token=0,
            started_at=None,
            finished_at=None,
        )
        uow.session.add(row)
        try:
            await uow.session.flush()
            await uow.commit()
        except IntegrityError:
            await uow.rollback()
            raced = await _by_key(uow.session, project_id, actor_id, key)
            if raced is None:
                raise ConflictError("Generation request conflicted") from None
            return _same_request(raced, request_hash)
        logger.info("image_generation_queued", task_id=str(row.id), project_id=str(project_id))
        return row

    async def get(self, uow: UnitOfWork, *, project_id: UUID, task_id: UUID) -> GenerationTask:
        row = await _get(uow.session, project_id, task_id)
        if row is None:
            raise NotFoundError("Generation task was not found")
        return row

    async def list_tasks(
        self,
        uow: UnitOfWork,
        *,
        project_id: UUID,
        limit: int = 20,
        kind: str | None = None,
    ) -> list[GenerationTask]:
        stmt = select(GenerationTask).where(GenerationTask.project_id == project_id)
        if kind is not None:
            stmt = stmt.where(GenerationTask.kind == kind)
        stmt = stmt.order_by(GenerationTask.created_at.desc(), GenerationTask.id.desc()).limit(
            min(max(limit, 1), 20)
        )
        return list((await uow.session.execute(stmt)).scalars().all())

    async def output_ids(
        self,
        uow: UnitOfWork,
        *,
        project_id: UUID,
        task_ids: list[UUID],
    ) -> dict[UUID, list[UUID]]:
        if not task_ids:
            return {}
        stmt = (
            select(GenerationOutput.task_id, GenerationOutput.asset_id, GenerationOutput.ordinal)
            .where(
                GenerationOutput.project_id == project_id,
                GenerationOutput.task_id.in_(task_ids),
            )
            .order_by(GenerationOutput.ordinal)
        )
        found: dict[UUID, list[UUID]] = {task_id: [] for task_id in task_ids}
        for task_id, asset_id, _ordinal in (await uow.session.execute(stmt)).all():
            found.setdefault(task_id, []).append(asset_id)
        return found

    async def cancel(self, uow: UnitOfWork, *, project_id: UUID, task_id: UUID) -> GenerationTask:
        stmt = (
            update(GenerationTask)
            .where(
                GenerationTask.id == task_id,
                GenerationTask.project_id == project_id,
                GenerationTask.kind == "image",
                GenerationTask.status == "queued",
            )
            .values(status="canceled", finished_at=datetime.now(UTC), updated_at=datetime.now(UTC))
            .returning(GenerationTask.id)
        )
        canceled = (await uow.session.execute(stmt)).one_or_none()
        if canceled is not None:
            await uow.commit()
            row = await _get(uow.session, project_id, task_id)
            if row is None:
                raise NotFoundError("Generation task was not found")
            return row
        row = await _get(uow.session, project_id, task_id)
        if row is None:
            raise NotFoundError("Generation task was not found")
        if row.status == "running":
            raise CancellationUnsupportedError(
                "This image generation cannot be canceled after it starts"
            )
        if row.kind != "image":
            raise NotFoundError("Generation task was not found")
        return row

    async def asset_for_download(
        self,
        uow: UnitOfWork,
        *,
        project_id: UUID,
        asset_id: UUID,
    ) -> Asset:
        stmt = select(Asset).where(
            Asset.id == asset_id,
            Asset.project_id == project_id,
            Asset.status == "ready",
        )
        asset = (await uow.session.execute(stmt)).scalar_one_or_none()
        if asset is None:
            raise NotFoundError("Asset was not found")
        return asset

    async def editor_assets(self, uow: UnitOfWork, *, project_id: UUID) -> list[Asset]:
        rows = await uow.session.execute(select(Asset).where(
            Asset.project_id == project_id, Asset.status == "ready", Asset.kind == "VIDEO"
        ).order_by(Asset.created_at.desc()).limit(100))
        return list(rows.scalars())

    async def register_editor_output(self, uow: UnitOfWork, *, project_id: UUID,
                                     actor_id: UUID, asset_id: UUID, object_key: str,
                                     content: bytes, width: int, height: int) -> Asset:
        asset = Asset(id=asset_id, project_id=project_id, created_by=actor_id,
                      kind="VIDEO", status="ready", object_key=object_key,
                      mime="video/mp4", size_bytes=len(content),
                      sha256=hashlib.sha256(content).hexdigest(), width=width, height=height)
        uow.session.add(asset)
        await uow.session.flush()
        return asset

    async def queued_ids(self, limit: int = 5) -> list[UUID]:
        factory = self._factory()
        async with factory() as session:
            stmt = (
                select(GenerationTask.id)
                .where(GenerationTask.status == "queued", GenerationTask.kind == "image")
                .order_by(GenerationTask.created_at)
                .limit(limit)
            )
            return list((await session.execute(stmt)).scalars().all())

    async def execute(self, task_id: UUID) -> None:
        claimed = await self._claim(task_id)
        if claimed is None:
            return
        project_id, actor_id, prompt, model_config_id, parameters = claimed
        try:
            images = await self._call_provider(model_config_id, prompt, parameters)
            await self._store(task_id, project_id, actor_id, images)
        except ApplicationError as exc:
            logger.info(
                "image_generation_failed",
                task_id=str(task_id),
                error_type=type(exc).__name__,
            )
            await self._fail(task_id, exc.code, exc.message)
        except Exception as exc:
            logger.info(
                "image_generation_failed",
                task_id=str(task_id),
                error_type=type(exc).__name__,
            )
            await self._fail(task_id, "provider_error", "The model provider request failed")

    async def _claim(self, task_id: UUID) -> tuple[UUID, UUID, str, UUID, dict] | None:
        factory = self._factory()
        async with factory() as session:
            stmt = (
                update(GenerationTask)
                .where(
                    GenerationTask.id == task_id,
                    GenerationTask.status == "queued",
                    GenerationTask.kind == "image",
                )
                .values(
                    status="running",
                    phase="generating",
                    started_at=datetime.now(UTC),
                    updated_at=datetime.now(UTC),
                )
                .returning(
                    GenerationTask.project_id,
                    GenerationTask.actor_id,
                    GenerationTask.request_snapshot,
                    GenerationTask.model_config_id,
                )
            )
            result = (await session.execute(stmt)).one_or_none()
            if result is None:
                await session.rollback()
                return None
            await session.commit()
            snapshot = result.request_snapshot
            prompt = snapshot.get("prompt") if isinstance(snapshot, dict) else None
            raw_parameters = snapshot.get("parameters") if isinstance(snapshot, dict) else None
            if not isinstance(prompt, str):
                await self._fail(task_id, "validation_error", "Prompt must be 1-10000 characters")
                return None
            parameters = raw_parameters if isinstance(raw_parameters, dict) else {}
            return result.project_id, result.actor_id, prompt, result.model_config_id, parameters

    async def _call_provider(
        self,
        model_config_id: UUID,
        prompt: str,
        parameters: dict,
    ) -> list[tuple[bytes, str]]:
        factory = self._factory()
        async with factory() as session:
            config = await session.get(ModelConfig, model_config_id)
            if config is None or not config.enabled or config.capability != "text_to_image":
                raise NotFoundError("Model config was not found")
            model_name = config.model_name
            secret_ref = config.secret_ref
        endpoint = self.settings.model_endpoint(secret_ref)
        if endpoint is None:
            raise ValidationError("Secret reference is not configured")
        base_url, api_key = endpoint
        size, count = _provider_options(parameters)
        return await self.client.generate(
            base_url=base_url,
            api_key=api_key,
            model=model_name,
            prompt=prompt,
            size=size,
            count=count,
        )

    async def _store(
        self,
        task_id: UUID,
        project_id: UUID,
        actor_id: UUID,
        images: list[tuple[bytes, str]],
    ) -> None:
        stored: list[tuple[UUID, str, bytes, str]] = []
        for content, mime in images:
            extension = _EXTENSIONS.get(mime, "img")
            asset_id = uuid4()
            object_key = f"projects/{project_id}/assets/{asset_id}/image.{extension}"
            await self.storage.put_object(object_key=object_key, content=content, content_type=mime)
            stored.append((asset_id, object_key, content, mime))
        factory = self._factory()
        async with factory() as session:
            for ordinal, (asset_id, object_key, content, mime) in enumerate(stored, start=1):
                session.add(
                    Asset(
                        id=asset_id,
                        project_id=project_id,
                        kind="IMAGE",
                        object_key=object_key,
                        sha256=hashlib.sha256(content).hexdigest(),
                        mime=mime,
                        size_bytes=len(content),
                        width=None,
                        height=None,
                        status="ready",
                        created_by=actor_id,
                    )
                )
                session.add(
                    GenerationOutput(
                        project_id=project_id,
                        task_id=task_id,
                        asset_id=asset_id,
                        ordinal=ordinal,
                    )
                )
            await session.execute(
                update(GenerationTask)
                .where(GenerationTask.id == task_id, GenerationTask.status == "running")
                .values(
                    status="succeeded",
                    phase=None,
                    finished_at=datetime.now(UTC),
                    updated_at=datetime.now(UTC),
                )
            )
            await session.commit()
        logger.info("image_generation_succeeded", task_id=str(task_id))

    async def _fail(self, task_id: UUID, code: str, message: str) -> None:
        factory = self._factory()
        async with factory() as session:
            await session.execute(
                update(GenerationTask)
                .where(GenerationTask.id == task_id, GenerationTask.status == "running")
                .values(
                    status="failed",
                    phase=None,
                    error_code=code,
                    error_message=(message or "")[:300] or None,
                    finished_at=datetime.now(UTC),
                    updated_at=datetime.now(UTC),
                )
            )
            await session.commit()

    def _factory(self) -> async_sessionmaker[AsyncSession]:
        if self.session_factory is None:
            raise RuntimeError("Image generation worker requires a session factory")
        return self.session_factory


def _clean_key(value: str) -> str:
    if _IDEMPOTENCY_KEY.fullmatch(value) is None:
        raise ValidationError("Idempotency key is invalid")
    return value


def _clean_prompt(value: str) -> str:
    cleaned = value.strip()
    if not 1 <= len(cleaned) <= PROMPT_MAX_LENGTH:
        raise ValidationError("Prompt must be 1-10000 characters")
    return cleaned


_IMAGE_SIZES = frozenset(
    {
        "1024x1024",
        "864x1152",
        "1152x864",
        "1280x720",
        "720x1280",
        "1248x832",
        "832x1248",
        "1568x672",
        "2048x2048",
        "1536x2048",
        "2048x1536",
        "2048x1152",
        "1152x2048",
        "2048x1366",
        "1366x2048",
        "2048x878",
    }
)


def _parameters(value: dict) -> dict:
    cleaned = json_object(value, label="Parameters")
    if set(cleaned) - {"size", "n"}:
        raise ValidationError("Parameters are not supported for this model")
    result: dict = {}
    if "n" in cleaned:
        count = cleaned["n"]
        if isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= 4:
            raise ValidationError("Image count must be 1-4")
        result["n"] = count
    if "size" in cleaned:
        size = cleaned["size"]
        if not isinstance(size, str) or size not in _IMAGE_SIZES:
            raise ValidationError("Image size is not supported")
        result["size"] = size
    return result


def _provider_options(parameters: dict) -> tuple[str | None, int]:
    size = parameters.get("size")
    count = parameters.get("n", 1)
    if size is not None and (not isinstance(size, str) or size not in _IMAGE_SIZES):
        raise ValidationError("Image size is not supported")
    if isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= 4:
        raise ValidationError("Image count must be 1-4")
    return (size if isinstance(size, str) else None), count


def _request_hash(model_config_id: UUID, prompt: str, parameters: dict) -> str:
    payload = json.dumps(
        {
            "model_config_id": str(model_config_id),
            "parameters": parameters,
            "prompt": prompt,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _same_request(existing: GenerationTask, request_hash: str) -> GenerationTask:
    if existing.request_hash != request_hash:
        raise ConflictError("Idempotency key was reused with a different request")
    return existing


async def _by_key(
    session: AsyncSession,
    project_id: UUID,
    actor_id: UUID,
    idempotency_key: str,
) -> GenerationTask | None:
    stmt = select(GenerationTask).where(
        GenerationTask.project_id == project_id,
        GenerationTask.actor_id == actor_id,
        GenerationTask.idempotency_key == idempotency_key,
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def _get(session: AsyncSession, project_id: UUID, task_id: UUID) -> GenerationTask | None:
    stmt = select(GenerationTask).where(
        GenerationTask.id == task_id,
        GenerationTask.project_id == project_id,
    )
    return (await session.execute(stmt)).scalar_one_or_none()
