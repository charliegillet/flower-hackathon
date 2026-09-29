"""Credit bureau node: looks up the real score locally, signs only the band."""

from __future__ import annotations

from typing import Any

from .. import attest, pricing
from ..llm import LLM


def handle(msg: dict[str, Any], cfg: dict[str, Any], llm: LLM) -> dict[str, Any]:
    from . import load_json

    if msg.get("kind") != "attest_request":
        return {"kind": "error", "message": f"bureau cannot handle {msg.get('kind')!r}"}
    files = load_json(cfg, "credit_files.json")
    token = str(msg.get("token", ""))
    record = files.get("consents", {}).get(token)
    if record is None:
        return {"kind": "error", "message": "unknown or expired consent token"}
    band = pricing.fico_band(int(record["score"]))
    key = attest.load_key(cfg.get("hmac_key_file"))
    return {
        "kind": "attestation",
        "session": msg.get("session"),
        "fico_band": band,
        "token": token,
        "sig": attest.sign(key, band, token),
        "bureau": cfg.get("name", "Credit Bureau"),
    }
