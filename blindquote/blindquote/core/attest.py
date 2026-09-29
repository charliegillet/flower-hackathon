"""Credit-band attestation: the bureau signs a band, banks verify it.

HMAC with a consortium key shared by the bureau and banks. A stand-in for
bureau-grade signatures (e.g. Ed25519 or verifiable credentials).
"""

from __future__ import annotations

import hashlib
import hmac
import os
from pathlib import Path


def load_key(key_file: str | None = None) -> bytes:
    """Load the consortium key from a file (node_config) or BUREAU_HMAC_KEY."""
    if key_file and Path(key_file).is_file():
        return Path(key_file).read_text().strip().encode()
    env = os.environ.get("BUREAU_HMAC_KEY", "").strip()
    if env:
        return env.encode()
    raise RuntimeError("No attestation key: set node_config hmac_key_file or BUREAU_HMAC_KEY")


def sign(key: bytes, fico_band: str, token: str) -> str:
    return hmac.new(key, f"{fico_band}|{token}".encode(), hashlib.sha256).hexdigest()


def verify(key: bytes, fico_band: str, token: str, sig: str) -> bool:
    return hmac.compare_digest(sign(key, fico_band, token), sig or "")
