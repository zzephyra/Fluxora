"""Immutable project-scoped generation inputs; bytes remain in private storage."""

import asyncio
import base64
import hashlib
from datetime import UTC, datetime, timedelta
from io import BytesIO
from typing import Protocol
from uuid import UUID

from PIL import Image, ImageChops, UnidentifiedImageError
from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.infrastructure.ai.catalog import VIDEO_RESOLUTIONS, require_editor_model
from app.infrastructure.db.session import UnitOfWork
from app.modules.generation.models import GenerationInput, GenerationTask

MAX_BYTES = 80 * 1024 * 1024
MAX_PIXELS = 16_777_216


def decode_image(content: bytes) -> Image.Image:
    if not content or len(content) > MAX_BYTES:
        raise ValidationError("图片不得超过 80 MB")
    try:
        with Image.open(BytesIO(content)) as image:
            if (
                image.format not in {"PNG", "JPEG", "WEBP"}
                or image.width * image.height > MAX_PIXELS
            ):
                raise ValidationError("图片格式或像素尺寸不受支持")
            if image.width > 8000 or image.height > 8000 or getattr(image, "n_frames", 1) != 1:
                raise ValidationError("仅支持边长不超过 8000 的静态图片")
            image.load()
            return image.convert("RGBA")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise ValidationError("图片文件无法解码") from exc


def png(image: Image.Image) -> bytes:
    stream = BytesIO()
    image.save(stream, format="PNG")
    data = stream.getvalue()
    if len(data) > MAX_BYTES:
        raise ValidationError("处理后的图片不得超过 80 MB，请缩小图片")
    return data


def normalize(image_b64: str, mask_b64: str | None) -> tuple[bytes, bytes | None, int, int]:
    try:
        image = decode_image(base64.b64decode(image_b64, validate=True))
        mask = decode_image(base64.b64decode(mask_b64, validate=True)) if mask_b64 else None
    except (ValueError, TypeError) as exc:
        raise ValidationError("图片编码无效") from exc
    mask_bytes = None
    if mask is not None:
        if mask.size != image.size:
            raise ValidationError("图片与蒙版尺寸必须一致")
        selection = ImageChops.multiply(mask.convert("L"), mask.getchannel("A"))
        selection = selection.point(lambda value: 255 if value >= 128 else 0)
        if selection.getbbox() is None:
            raise ValidationError("请先涂抹需要重绘的区域")
        mask_bytes = png(selection)
    else:
        if min(image.size) < 240:
            raise ValidationError("图生视频首帧宽高至少为 240 像素")
        background = Image.new("RGBA", image.size, "white")
        image = Image.alpha_composite(background, image).convert("RGB")
    return png(image), mask_bytes, image.width, image.height


async def require_input(
    session: AsyncSession, project_id: UUID, input_id: UUID, *, inpaint: bool
) -> GenerationInput:
    row = (
        await session.execute(
            select(GenerationInput)
            .where(
                GenerationInput.project_id == project_id,
                GenerationInput.id == input_id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None or row.status != "ready":
        raise NotFoundError("生成输入不存在或尚未上传完成")
    if bool(row.mask_key) != inpaint:
        raise ValidationError("生成输入与操作类型不匹配")
    return row


class InputStorage(Protocol):
    async def put_object(self, *, object_key: str, content: bytes, content_type: str) -> None: ...
    async def delete_object(self, *, object_key: str) -> None: ...


class GenerationInputService:
    def __init__(self, settings: Settings, storage: InputStorage) -> None:
        self.settings = settings
        self.storage = storage

    async def options(self, uow: UnitOfWork) -> list[dict]:
        result = []
        for capability in ("image_inpaint", "image_to_video"):
            try:
                config = await require_editor_model(uow, self.settings, capability)
                result.append(
                    {
                        "capability": capability,
                        "available": True,
                        "reason": None,
                        "model_name": config.model_name,
                        "resolutions": VIDEO_RESOLUTIONS.get(config.model_name, []),
                        "duration": 5 if capability == "image_to_video" else None,
                    }
                )
            except (ValidationError, NotFoundError) as exc:
                result.append(
                    {
                        "capability": capability,
                        "available": False,
                        "reason": "尚未指定可用模型，请联系管理员配置"
                        if "assigned" in exc.message
                        else exc.message,
                        "model_name": None,
                        "resolutions": [],
                        "duration": None,
                    }
                )
        return result

    async def save(
        self,
        uow: UnitOfWork,
        *,
        project_id: UUID,
        actor_id: UUID,
        input_id: UUID,
        image_base64: str,
        mask_base64: str | None,
    ) -> GenerationInput:
        if not self.settings.object_storage_configured:
            raise ValidationError("Object storage is not configured")
        image, mask, width, height = await asyncio.to_thread(normalize, image_base64, mask_base64)
        digest = hashlib.sha256(image + (mask or b"")).hexdigest()
        row = (
            await uow.session.execute(
                select(GenerationInput)
                .where(
                    GenerationInput.id == input_id,
                    GenerationInput.project_id == project_id,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if row:
            if row.created_by != actor_id or row.sha256 != digest:
                raise ConflictError("输入 ID 已被其他内容使用")
            if row.status == "ready":
                return row
            if row.status == "deleted" or (
                row.status == "uploading"
                and row.updated_at > datetime.now(UTC) - timedelta(minutes=10)
            ):
                raise ConflictError("输入正在上传或已失效，请稍后重试")
            row.status = "uploading"
            row.updated_at = datetime.now(UTC)
        else:
            prefix = f"projects/{project_id}/generation-inputs/{input_id}"
            row = GenerationInput(
                id=input_id,
                project_id=project_id,
                created_by=actor_id,
                image_key=f"{prefix}/image.png",
                mask_key=f"{prefix}/mask.png" if mask else None,
                sha256=digest,
                width=width,
                height=height,
                status="uploading",
            )
            uow.session.add(row)
        try:
            await uow.commit()
        except IntegrityError:
            await uow.rollback()
            raise ConflictError("输入正在上传，请稍后重试") from None
        try:
            await self.storage.put_object(
                object_key=row.image_key, content=image, content_type="image/png"
            )
            if mask:
                await self.storage.put_object(
                    object_key=row.mask_key, content=mask, content_type="image/png"
                )
        except Exception:
            row.status = "failed"
            await uow.commit()
            raise ValidationError("图片保存失败，请重试") from None
        row.status = "ready"
        await uow.commit()
        return row

    async def prune(self, uow: UnitOfWork) -> int:
        """Only unreferenced inputs older than a day; persist deletion intent before I/O."""
        rows = list(
            (
                await uow.session.execute(
                    select(GenerationInput)
                    .where(
                        GenerationInput.created_at < datetime.now(UTC) - timedelta(days=1),
                        ~exists().where(GenerationTask.input_id == GenerationInput.id),
                    )
                    .with_for_update(skip_locked=True)
                    .limit(100)
                )
            ).scalars()
        )
        keys = [(row.id, row.image_key, row.mask_key) for row in rows]
        for row in rows:
            row.status = "deleted"
        await uow.commit()
        for input_id, image_key, mask_key in keys:
            await self.storage.delete_object(object_key=image_key)
            if mask_key:
                await self.storage.delete_object(object_key=mask_key)
            row = await uow.session.get(GenerationInput, input_id)
            await uow.session.delete(row)
            await uow.commit()
        return len(keys)
