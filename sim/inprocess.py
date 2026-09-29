"""In-process Grid: every "SuperNode" is a role handler with its own data dir and model.

Used by the UI's Simulation mode and by tests. The coordinator and node code are
exactly the same modules that run inside the Flower AgentApp; only the
transport differs. Each push is handled on a worker thread, so replies arrive
at different times as they would across real nodes.
"""

from __future__ import annotations

import itertools
import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from blindquote.core.llm import LLM
from blindquote.core.protocol import decode
from blindquote.core.roles import handle_node_message

ROOT = Path(__file__).resolve().parents[1]

FLOWER_BASE_URL = "https://api.flower.ai/v1"
NEBIUS_BASE_URL = "https://api.tokenfactory.tf-ca1.nebius.com/v1"


@dataclass
class SimNode:
    node_id: str
    cfg: dict[str, Any]
    llm: LLM
    latency: float = 0.0  # extra artificial delay (seconds), to make timing visible


class InProcessGrid:
    def __init__(self, nodes: list[SimNode], workers: int = 8) -> None:
        self._nodes = {n.node_id: n for n in nodes}
        self._pool = ThreadPoolExecutor(max_workers=workers)
        self._replies: dict[str, dict[str, Any]] = {}
        self._lock = threading.Condition()
        self._ids = itertools.count(1)

    def get_nodes(self) -> list[dict[str, Any]]:
        return [{"id": nid, "name": None, "location": n.cfg.get("location")} for nid, n in self._nodes.items()]

    def push(self, messages: list[tuple[str, str]]) -> list[str | None]:
        ids: list[str | None] = []
        for dst, payload in messages:
            node = self._nodes.get(dst)
            if node is None:
                ids.append(None)
                continue
            mid = f"m{next(self._ids)}"
            ids.append(mid)
            self._pool.submit(self._handle, node, mid, payload)
        return ids

    def _handle(self, node: SimNode, mid: str, payload: str) -> None:
        if node.latency:
            time.sleep(node.latency)
        try:
            reply = json.dumps(handle_node_message(decode(payload), node.cfg, node.llm))
            error = None
        except Exception as exc:  # noqa: BLE001
            reply, error = None, f"{type(exc).__name__}: {exc}"
        with self._lock:
            self._replies[mid] = {
                "message_id": f"r{mid}",
                "reply_to_message_id": mid,
                "src_node_id": node.node_id,
                "payload": reply,
                "error": error,
            }
            self._lock.notify_all()

    def pull(self, message_ids: list[str], timeout: float) -> tuple[list[dict[str, Any]], list[str]]:
        deadline = time.monotonic() + timeout
        with self._lock:
            while True:
                ready = [mid for mid in message_ids if mid in self._replies]
                remaining = deadline - time.monotonic()
                if ready or remaining <= 0:
                    break
                self._lock.wait(timeout=remaining)
            out = [self._replies.pop(mid) for mid in ready]
        pending = [mid for mid in message_ids if mid not in ready]
        return out, pending

    def close(self) -> None:
        self._pool.shutdown(wait=False, cancel_futures=True)


def _openai_factory(base_url: str, api_key: str) -> Callable[[], Any]:
    def factory() -> Any:
        from openai import OpenAI

        return OpenAI(base_url=base_url, api_key=api_key, max_retries=0)

    return factory


def provider_llm(provider: str | None, model: str | None, timeout: float = 45.0) -> LLM:
    """Build an LLM from .env credentials: provider is 'flower', 'nebius-kimi' or 'nebius-minimax'."""
    if provider == "flower" and os.environ.get("FLWR_MODEL_API_KEY"):
        return LLM(_openai_factory(FLOWER_BASE_URL, os.environ["FLWR_MODEL_API_KEY"]), model, timeout)
    if provider == "nebius-kimi" and os.environ.get("NEBIUS_KIMI_API_KEY"):
        return LLM(_openai_factory(NEBIUS_BASE_URL, os.environ["NEBIUS_KIMI_API_KEY"]), model, timeout)
    if provider == "nebius-minimax" and os.environ.get("NEBIUS_MINIMAX_API_KEY"):
        return LLM(_openai_factory(NEBIUS_BASE_URL, os.environ["NEBIUS_MINIMAX_API_KEY"]), model, timeout)
    return LLM(None, model)


def load_topology(path: Path | None = None) -> list[dict[str, Any]]:
    return json.loads((path or ROOT / "deploy" / "topology.json").read_text())["nodes"]


def build_federation(use_llm: bool = True, latency: bool = True, topology: Path | None = None) -> InProcessGrid:
    """Create the six-node federation described in deploy/topology.json."""
    nodes = []
    for i, spec in enumerate(load_topology(topology)):
        cfg = dict(spec["node_config"])
        cfg["data_dir"] = str(ROOT / cfg["data_dir"])
        if cfg["role"] in {"bureau", "bank"}:  # only signer and verifiers hold the attestation key
            cfg["hmac_key_file"] = str(ROOT / "secrets" / "bureau.key")
        llm = provider_llm(spec.get("provider"), cfg.get("model")) if use_llm else LLM(None, cfg.get("model"))
        nodes.append(SimNode(node_id=str(1000 + i), cfg=cfg, llm=llm, latency=(0.3 + 0.25 * i) if latency else 0.0))
    return InProcessGrid(nodes)
