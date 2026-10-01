"""Minimal S3-compatible client for private image bytes.

ADR-006 names boto3. This process uses the standard library so the current
image can store objects without a new package. The bucket stays private.
"""

import hashlib
import hmac
import urllib.error
import urllib.request
from datetime import UTC, datetime
from urllib.parse import quote, urlsplit

from app.core.config import Settings


class S3Storage:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def put_object(self, *, object_key: str, content: bytes, content_type: str) -> None:
        await _call(self._settings, "PUT", object_key, content, content_type)

    async def get_object(self, *, object_key: str) -> bytes:
        return await _call(self._settings, "GET", object_key, b"", None)

    async def delete_object(self, *, object_key: str) -> None:
        await _call(self._settings, "DELETE", object_key, b"", None)

    async def ensure_bucket(self) -> None:
        await _call(self._settings, "PUT", "", b"", None, bucket_only=True)


async def _call(
    settings: Settings,
    method: str,
    object_key: str,
    payload: bytes,
    content_type: str | None,
    *,
    bucket_only: bool = False,
) -> bytes:
    import asyncio

    return await asyncio.to_thread(
        _call_sync,
        settings,
        method,
        object_key,
        payload,
        content_type,
        bucket_only,
    )


def _call_sync(
    settings: Settings,
    method: str,
    object_key: str,
    payload: bytes,
    content_type: str | None,
    bucket_only: bool,
) -> bytes:
    endpoint = urlsplit(settings.s3_endpoint_url.strip())
    if endpoint.scheme not in {"http", "https"} or not endpoint.hostname:
        raise RuntimeError("object storage endpoint is invalid")
    host = endpoint.hostname
    if endpoint.port:
        host = f"{host}:{endpoint.port}"
    bucket = settings.s3_bucket.strip()
    path = f"/{bucket}" if bucket_only else f"/{bucket}/{object_key.lstrip('/')}"
    now = datetime.now(UTC)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    payload_hash = hashlib.sha256(payload).hexdigest()
    headers = {
        "host": host,
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
    }
    if content_type:
        headers["content-type"] = content_type
    authorization = _authorization(
        method,
        path,
        headers,
        payload_hash,
        amz_date,
        settings.s3_access_key_id,
        settings.s3_secret_access_key,
        settings.s3_region or "us-east-1",
    )
    request_headers = {name: value for name, value in headers.items() if name != "host"}
    request_headers["Authorization"] = authorization
    request = urllib.request.Request(
        f"{endpoint.scheme}://{host}{path}",
        data=payload if method != "GET" else None,
        headers=request_headers,
        method=method,
    )
    opener = urllib.request.build_opener(_RejectRedirect())
    try:
        with opener.open(request, timeout=30) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        if bucket_only and exc.code in {409, 200}:
            return b""
        raise RuntimeError("object storage request failed") from None


class _RejectRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("object storage request failed")


def _authorization(
    method: str,
    path: str,
    headers: dict[str, str],
    payload_hash: str,
    amz_date: str,
    access_key: str,
    secret_key: str,
    region: str,
) -> str:
    signed = sorted(headers)
    canonical_headers = "".join(f"{name}:{headers[name]}\n" for name in signed)
    signed_names = ";".join(signed)
    canonical = "\n".join(
        [
            method,
            _canonical_path(path),
            "",
            canonical_headers,
            signed_names,
            payload_hash,
        ]
    )
    datestamp = amz_date[:8]
    scope = f"{datestamp}/{region}/s3/aws4_request"
    to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            scope,
            hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        ]
    )
    key = ("AWS4" + secret_key).encode("utf-8")
    for part in (datestamp, region, "s3", "aws4_request"):
        key = hmac.new(key, part.encode("utf-8"), hashlib.sha256).digest()
    signature = hmac.new(key, to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    return (
        "AWS4-HMAC-SHA256 "
        f"Credential={access_key}/{scope}, "
        f"SignedHeaders={signed_names}, "
        f"Signature={signature}"
    )


def _canonical_path(path: str) -> str:
    return "/" + "/".join(quote(part, safe="") for part in path.split("/") if part)
