"""Node-side role dispatch: one incoming message in, one reply out."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..llm import LLM
from ..protocol import GuardViolation, check
from . import bank, borrower, bureau

HANDLERS = {"borrower": borrower.handle, "bureau": bureau.handle, "bank": bank.handle}


def load_json(cfg: dict[str, Any], filename: str) -> dict[str, Any]:
    """Read a private data file from this node's data_dir (never leaves the node)."""
    path = Path(str(cfg.get("data_dir", ""))) / filename
    return json.loads(path.read_text())


def hello_reply(cfg: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "hello_reply",
        "role": cfg.get("role"),
        "name": cfg.get("name"),
        "org_kind": cfg.get("org_kind"),
        "model": cfg.get("model") or None,
        "location": cfg.get("location") or None,
    }


def handle_node_message(msg: dict[str, Any], cfg: dict[str, Any], llm: LLM) -> dict[str, Any]:
    """Handle one coordinator message on a SuperNode and return the reply object.

    The reply is guard-checked before it leaves the node; a violation turns into
    an ``error`` reply instead of leaking data.
    """
    role = str(cfg.get("role", ""))
    if msg.get("kind") == "hello":
        reply = hello_reply(cfg)
    elif role in HANDLERS:
        try:
            reply = HANDLERS[role](msg, cfg, llm)
        except Exception as exc:  # noqa: BLE001 - report instead of crashing the task
            reply = {"kind": "error", "message": f"{role} failed: {type(exc).__name__}: {exc}"[:400]}
    else:
        reply = {"kind": "error", "message": f"node has no BlindQuote role (role={role!r})"}
    try:
        check(reply)
    except GuardViolation as exc:
        reply = {"kind": "error", "message": f"outbound blocked by guard: {exc.detail}"}
    return reply
