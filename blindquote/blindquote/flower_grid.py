"""Adapter from Flower's ``agent.grid`` tools to BlindQuote's ``Grid`` interface.

Grid tools are called directly from code (no model in the loop): routing is
deterministic, fast and bounded, and every call is still recorded in the run's
event trace by Flower.
"""

from __future__ import annotations

import itertools
import json
from typing import Any

from flwr.agentapp import AgentSession


class FlowerGrid:
    def __init__(self, agent: AgentSession) -> None:
        self._agent = agent
        self._ids = itertools.count(1)

    def _call(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        out = self._agent.grid.call(
            {"type": "function_call", "call_id": f"bq_{next(self._ids)}", "name": name, "arguments": arguments}
        )
        return json.loads(out["output"])

    def tool_names(self) -> set[str]:
        return {str(t.get("name")) for t in self._agent.grid.tools()}

    def get_nodes(self) -> list[dict[str, Any]]:
        return list(self._call("get_nodes", {"sample_size": None}).get("nodes", []))

    def push(self, messages: list[tuple[str, str]]) -> list[str | None]:
        if not messages:
            return []
        res = self._call(
            "push_messages",
            {"messages": [{"dst_node_id": dst, "payload": payload, "reply_to_message_id": None} for dst, payload in messages]},
        )
        return [r.get("message_id") for r in res.get("results", [])]

    def pull(self, message_ids: list[str], timeout: float) -> tuple[list[dict[str, Any]], list[str]]:
        if not message_ids:
            return [], []
        res = self._call("pull_messages", {"message_ids": message_ids, "timeout": max(0.0, min(timeout, 300.0))})
        return list(res.get("messages", [])), list(res.get("pending_message_ids", []))

    def reply(self, payload: str) -> None:
        res = self._call("push_reply_message", {"payload": payload})
        if res.get("error"):
            raise RuntimeError(f"push_reply_message failed: {res['error']}")
