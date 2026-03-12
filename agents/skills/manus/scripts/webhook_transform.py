# /// script
# requires-python = ">=3.11"
# dependencies = ["cryptography>=45.0.0", "httpx>=0.27.0"]
# ///
"""Generic Manus webhook helper for Python runtimes."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

BASE_URL = "https://api.manus.ai"
STATE_HOME = Path(os.environ.get("MANUS_SKILL_HOME", Path.home() / ".manus-skill"))
PUBKEY_CACHE = STATE_HOME / "cache" / "manus-webhook-pubkey.pem"
PUBKEY_TTL = timedelta(hours=1)
TIMESTAMP_TOLERANCE = 300

_cached_pubkey: str | None = None
_cached_pubkey_at: datetime | None = None


def load_pubkey() -> str | None:
    global _cached_pubkey, _cached_pubkey_at

    now = datetime.now(timezone.utc)
    if _cached_pubkey and _cached_pubkey_at and now - _cached_pubkey_at < PUBKEY_TTL:
        return _cached_pubkey

    if PUBKEY_CACHE.exists():
        try:
            _cached_pubkey = PUBKEY_CACHE.read_text()
            _cached_pubkey_at = now
            return _cached_pubkey
        except OSError:
            return None
    return None


def save_pubkey(pem: str) -> None:
    global _cached_pubkey, _cached_pubkey_at

    PUBKEY_CACHE.parent.mkdir(parents=True, exist_ok=True)
    PUBKEY_CACHE.write_text(pem)
    _cached_pubkey = pem
    _cached_pubkey_at = datetime.now(timezone.utc)


def fetch_pubkey(api_key: str) -> str | None:
    response = httpx.get(
        f"{BASE_URL}/v1/webhook/public_key",
        headers={"API_KEY": api_key},
        timeout=30,
    )
    if not response.is_success:
        return None

    data = response.json()
    pem = data.get("public_key")
    if pem:
        save_pubkey(pem)
    return pem


def verify_signature(ctx: dict[str, Any], pubkey_pem: str) -> bool:
    headers = ctx.get("headers") or {}
    signature_b64 = headers.get("x-webhook-signature") or headers.get("X-Webhook-Signature")
    timestamp = headers.get("x-webhook-timestamp") or headers.get("X-Webhook-Timestamp")
    if not signature_b64 or not timestamp:
        return False

    try:
        request_time = int(timestamp)
    except (TypeError, ValueError):
        return False

    now = int(datetime.now(timezone.utc).timestamp())
    if abs(now - request_time) > TIMESTAMP_TOLERANCE:
        return False

    raw_body = ctx.get("rawBody")
    if isinstance(raw_body, bytes):
        raw_body_bytes = raw_body
    elif isinstance(raw_body, str):
        raw_body_bytes = raw_body.encode("utf-8")
    else:
        return False

    url = ctx.get("url") or ""
    body_hash = hashlib.sha256(raw_body_bytes).hexdigest()
    signature_content = f"{timestamp}.{url}.{body_hash}".encode("utf-8")

    try:
        signature = base64.b64decode(signature_b64)
        public_key = serialization.load_pem_public_key(pubkey_pem.encode("utf-8"))
        public_key.verify(signature, signature_content, padding.PKCS1v15(), hashes.SHA256())
        return True
    except (ValueError, InvalidSignature):
        return False


def transform_manus(ctx: dict[str, Any]) -> dict[str, Any]:
    payload = ctx.get("payload") or {}
    api_key = os.environ.get("MANUS_API_KEY", "")

    pubkey = load_pubkey()
    if not pubkey and api_key:
        pubkey = fetch_pubkey(api_key)

    verified = verify_signature(ctx, pubkey) if pubkey else False
    task_detail = payload.get("task_detail") or {}

    return {
        "verified": verified,
        "eventType": payload.get("event_type"),
        "taskId": task_detail.get("task_id"),
        "taskTitle": task_detail.get("task_title"),
        "taskUrl": task_detail.get("task_url"),
        "stopReason": task_detail.get("stop_reason"),
        "message": task_detail.get("message"),
        "attachments": task_detail.get("attachments") or [],
    }


def main() -> None:
    ctx = json.load(sys.stdin)
    json.dump(transform_manus(ctx), sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
