"""OpenAI-compatible image generation.

The API key is sent only as a request header and is never copied into errors or logs.
"""

import asyncio
import base64
import json
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any
from urllib.parse import urlsplit

from app.core.errors import ProviderError, RateLimitError
from app.core.errors import TimeoutError as ProviderTimeout
from app.infrastructure.ai.domain import IMAGE_BYTES_MAX

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
    ) -> list[tuple[bytes, str]]:
        url = base_url.rstrip("/") + "/images/generations"
        payload: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "n": count,
            "response_format": "b64_json",
        }
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
