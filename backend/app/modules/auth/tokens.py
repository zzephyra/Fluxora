import hashlib
import hmac
import secrets
from datetime import datetime

_PREAUTH_VERSION = "v1"


def new_token() -> str:
    """Return a 256-bit token. Callers persist only hash_token() output."""

    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def tokens_match(left: str | None, right: str | None) -> bool:
    if left is None or right is None:
        return False
    return hmac.compare_digest(left, right)


def hashes_match(raw_token: str, token_hash: str) -> bool:
    return hmac.compare_digest(hash_token(raw_token), token_hash)


def issue_preauth_token(secret: str, ttl_seconds: int, now: datetime) -> str:
    expiry = int(now.timestamp()) + ttl_seconds
    nonce = secrets.token_urlsafe(32)
    payload = f"{_PREAUTH_VERSION}.{expiry}.{nonce}"
    signature = _sign(secret, payload)
    return f"{payload}.{signature}"


def preauth_token_is_valid(secret: str, token: str, now: datetime) -> bool:
    version, expiry_text, nonce, signature = _parts(token)
    if version != _PREAUTH_VERSION or nonce is None or expiry_text is None or signature is None:
        return False
    payload = f"{version}.{expiry_text}.{nonce}"
    if not hmac.compare_digest(_sign(secret, payload), signature):
        return False
    return int(expiry_text) > int(now.timestamp())


def _parts(token: str) -> tuple[str | None, str | None, str | None, str | None]:
    pieces = token.split(".")
    if len(pieces) != 4:
        return None, None, None, None
    version, expiry_text, nonce, signature = pieces
    if not expiry_text.isdigit() or not nonce or not signature:
        return None, None, None, None
    return version, expiry_text, nonce, signature


def _sign(secret: str, payload: str) -> str:
    return hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
