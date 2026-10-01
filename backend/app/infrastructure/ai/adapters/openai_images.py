"""OpenAI-compatible image generation.

The API key is sent only as a request header and is never copied into errors or logs.
"""

import asyncio
import base64
import json
import math
import urllib.error
import urllib.request
from collections.abc import Callable
from io import BytesIO
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

from app.core.errors import ProviderError, RateLimitError
from app.core.errors import TimeoutError as ProviderTimeout
from app.infrastructure.ai.domain import IMAGE_BYTES_MAX
from PIL import Image, ImageOps

Post = Callable[[str, str, dict[str, Any], float], tuple[int, object]]
Fetch = Callable[[str, float], tuple[bytes, str]]
_TIMEOUT_SECONDS = 120.0


class _RejectRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise _TransportFailure("network")


class _TransportFailure(Exception):
    def __init__(self, kind: str) -> None:
        super().__init__(kind)
        self.kind = kind


def _edit_references(image: bytes, mask: bytes) -> tuple[bytes, bytes]:
    """Bound provider copies only; original bytes remain stored for exact compositing."""
    limit = 8 * 1024 * 1024
    with Image.open(BytesIO(image)) as original, Image.open(BytesIO(mask)) as selection:
        if original.size != selection.size:
            raise ProviderError("图片与选区尺寸不一致")
        if max(original.size) <= 2048 and max(len(image), len(mask)) <= limit:
            return image, mask
        source = original.convert("RGBA")
        selected = selection.convert("L")
        scale = min(1.0, 2048 / max(source.size))
        while True:
            size = (max(1, round(source.width * scale)), max(1, round(source.height * scale)))
            reference = source.resize(size, Image.Resampling.LANCZOS)
            # BOX retains small selections; any selected source coverage remains selected.
            region = selected.resize(size, Image.Resampling.BOX).point(lambda v: 255 if v else 0)
            buffers = []
            for bitmap in (reference, region):
                stream = BytesIO()
                bitmap.save(stream, "PNG")
                buffers.append(stream.getvalue())
            if max(map(len, buffers)) <= limit:
                return buffers[0], buffers[1]
            if min(size) <= 1:
                raise ProviderError("无法准备模型参考图片")
            scale *= 0.8


class OpenAICompatibleImages:
    def __init__(self, post: Post | None = None, fetch: Fetch | None = None) -> None:
        self._post = post or _post_json
        self._fetch = fetch or _fetch_bytes

    async def generate(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        prompt: str,
        size: str | None = None,
        count: int = 1,
        reference_images: list[str] | None = None,
    ) -> list[tuple[bytes, str]]:
        url = base_url.rstrip("/") + "/images/generations"
        payload: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "n": count,
            "response_format": "b64_json",
        }
        if reference_images:
            payload["image"] = reference_images
            payload["prompt_extend"] = False
        if size:
            payload["size"] = size
        try:
            status, body = await asyncio.to_thread(
                self._post,
                url,
                api_key,
                payload,
                _TIMEOUT_SECONDS,
            )
        except _TransportFailure as exc:
            if exc.kind == "timeout":
                raise ProviderTimeout("The model provider timed out") from None
            raise ProviderError("The model provider request failed") from None
        if status == 429:
            raise RateLimitError("The model provider is rate limiting requests")
        if status in {401, 403}:
            raise ProviderError("The model provider rejected the server credential")
        if status < 200 or status >= 300:
            raise ProviderError("The model provider request failed")
        images: list[tuple[bytes, str]] = []
        for encoded, remote_url in _image_fields(body)[:count]:
            if encoded:
                images.append(_decode_image(encoded))
            elif remote_url:
                images.append(await self._download(remote_url))
        if not images:
            raise ProviderError("The model provider returned an empty response")
        return images

    async def edit(
        self, *, base_url: str, api_key: str, model: str, prompt: str, image: bytes, mask: bytes
    ) -> list[tuple[bytes, str]]:
        image, mask = await asyncio.to_thread(_edit_references, image, mask)
        if model in {"qwen-image-3.0", "qwen-image-3.0-pro"}:
            # Qwen accepts image references, not the OpenAI mask/multipart protocol.
            with Image.open(BytesIO(image)) as original:
                width, height = original.size
            if not 1 / 8 <= width / height <= 8:
                raise ProviderError("当前图片模型仅支持 1:8 到 8:1 的画幅")
            area = width * height
            scale = math.sqrt(min(max(area, 512 * 512), 2048 * 2048) / area)
            round_dimension = math.floor if area > 2048 * 2048 else math.ceil
            size = f"{round_dimension(width * scale)}x{round_dimension(height * scale)}"
            instructions = (
                "编辑第一张原图。第二张是选区参考：白色区域需要修改，黑色区域保持原样。"
                "保持第一张图的布局、主体位置和画幅，仅按要求编辑对应白色区域。"
                "只输出完整编辑后的第一张图片，不输出蒙版、拼图或选区标记。修改要求：" + prompt
            )
            return await self.generate(
                base_url=base_url,
                api_key=api_key,
                model=model,
                prompt=instructions,
                size=size,
                count=1,
                reference_images=[
                    "data:image/png;base64," + base64.b64encode(data).decode()
                    for data in (image, mask)
                ],
            )
        # Application masks are white=edit. OpenAI masks are alpha=0 at edits.
        with Image.open(BytesIO(mask)) as source:
            selection = source.convert("L")
            rgba = Image.new("RGBA", selection.size, "white")
            rgba.putalpha(ImageOps.invert(selection))
            stream = BytesIO()
            rgba.save(stream, "PNG")
        boundary = "fluxora-" + uuid4().hex
        fields = {
            "model": model,
            "prompt": prompt,
            "n": "1",
            "output_format": "png",
            "size": "auto",
        }
        parts = []
        for name, value in fields.items():
            parts.append(
                (
                    f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"'
                    f"\r\n\r\n{value}\r\n"
                ).encode()
            )
        for name, content in (("image", image), ("mask", stream.getvalue())):
            parts.append(
                (
                    f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; '
                    f'filename="{name}.png"\r\nContent-Type: image/png\r\n\r\n'
                ).encode()
                + content
                + b"\r\n"
            )
        parts.append(f"--{boundary}--\r\n".encode())
        try:
            status, body = await asyncio.to_thread(
                _post_multipart,
                base_url.rstrip("/") + "/images/edits",
                api_key,
                b"".join(parts),
                boundary,
            )
        except _TransportFailure as exc:
            if exc.kind == "timeout":
                raise ProviderTimeout("图片编辑超时，请查看任务状态") from None
            raise ProviderError("图片编辑服务暂不可用") from None
        if status == 429:
            raise RateLimitError("图片编辑服务限流，请稍后重试")
        if not 200 <= status < 300:
            raise ProviderError("图片编辑服务拒绝请求，请检查模型配置")
        images = []
        for encoded, remote in _image_fields(body)[:1]:
            if encoded:
                images.append(_decode_image(encoded))
            elif remote:
                images.append(await self._download(remote))
        if not images:
            raise ProviderError("图片编辑服务未返回图片")
        return images

    async def _download(self, url: str) -> tuple[bytes, str]:
        _validate_image_url(url)
        try:
            content, content_type = await asyncio.to_thread(self._fetch, url, _TIMEOUT_SECONDS)
        except _TransportFailure as exc:
            if exc.kind == "timeout":
                raise ProviderTimeout("The model provider timed out") from None
            raise ProviderError("The model provider request failed") from None
        return _checked_image(content, content_type)


def _post_json(
    url: str,
    api_key: str,
    payload: dict[str, Any],
    timeout: float,
) -> tuple[int, object]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    opener = urllib.request.build_opener(_RejectRedirect())
    try:
        with opener.open(request, timeout=timeout) as response:
            raw = response.read()
            status = response.status
    except TimeoutError as exc:
        raise _TransportFailure("timeout") from exc
    except urllib.error.HTTPError as exc:
        return exc.code, None
    except urllib.error.URLError as exc:
        if isinstance(exc.reason, TimeoutError):
            raise _TransportFailure("timeout") from exc
        raise _TransportFailure("network") from exc
    if not raw:
        return status, None
    try:
        return status, json.loads(raw.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError):
        return status, None


def _fetch_bytes(url: str, timeout: float) -> tuple[bytes, str]:
    request = urllib.request.Request(url, method="GET")
    opener = urllib.request.build_opener(_RejectRedirect())
    try:
        with opener.open(request, timeout=timeout) as response:
            content_type = response.headers.get("Content-Type", "")
            return response.read(IMAGE_BYTES_MAX + 1), content_type
    except TimeoutError as exc:
        raise _TransportFailure("timeout") from exc
    except urllib.error.HTTPError as exc:
        raise _TransportFailure("network") from exc
    except urllib.error.URLError as exc:
        if isinstance(exc.reason, TimeoutError):
            raise _TransportFailure("timeout") from exc
        raise _TransportFailure("network") from exc


def _image_fields(body: object) -> list[tuple[str | None, str | None]]:
    if not isinstance(body, dict):
        return []
    data = body.get("data")
    if not isinstance(data, list):
        return []
    images: list[tuple[str | None, str | None]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        encoded = item.get("b64_json")
        remote = item.get("url")
        images.append(
            (
                encoded if isinstance(encoded, str) and encoded.strip() else None,
                remote if isinstance(remote, str) and remote.strip() else None,
            )
        )
    return images


def _decode_image(encoded: str) -> tuple[bytes, str]:
    if len(encoded) > IMAGE_BYTES_MAX * 2:
        raise ProviderError("The model provider response is too large")
    try:
        content = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError) as exc:
        raise ProviderError("The model provider returned an empty response") from exc
    return _checked_image(content, "")


def _checked_image(content: bytes, content_type: str) -> tuple[bytes, str]:
    if not content or len(content) > IMAGE_BYTES_MAX:
        raise ProviderError("The model provider response is too large")
    mime = _mime(content, content_type)
    if mime is None:
        raise ProviderError("The model provider returned an empty response")
    return content, mime


def _mime(content: bytes, content_type: str) -> str | None:
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    lowered = content_type.split(";", 1)[0].strip().lower()
    if lowered in {"image/png", "image/jpeg", "image/webp"}:
        return lowered
    return None


def _validate_image_url(url: str) -> None:
    parts = urlsplit(url)
    if (
        parts.scheme != "https"
        or not parts.hostname
        or parts.username
        or parts.password
        or parts.fragment
    ):
        raise ProviderError("The model provider request failed")


def _post_multipart(url: str, api_key: str, data: bytes, boundary: str):
    request = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    try:
        with urllib.request.build_opener(_RejectRedirect()).open(
            request, timeout=_TIMEOUT_SECONDS
        ) as response:
            return response.status, json.loads(response.read(IMAGE_BYTES_MAX * 2))
    except TimeoutError as exc:
        raise _TransportFailure("timeout") from exc
    except urllib.error.HTTPError as exc:
        return exc.code, None
    except (urllib.error.URLError, ValueError) as exc:
        raise _TransportFailure("network") from exc
