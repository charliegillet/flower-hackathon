"""Minimal grid interface shared by the Flower adapter and the in-process simulator."""

from __future__ import annotations

from typing import Any, Protocol


class Grid(Protocol):
    """Coordinator-side view of the federation Grid."""

    def get_nodes(self) -> list[dict[str, Any]]:
        """Return ``[{"id", "name", "location"}]`` for connected SuperNodes."""
        ...

    def push(self, messages: list[tuple[str, str]]) -> list[str | None]:
        """Send ``(dst_node_id, payload)`` pairs; return message ids (None if rejected)."""
        ...

    def pull(self, message_ids: list[str], timeout: float) -> tuple[list[dict[str, Any]], list[str]]:
        """Return ``(replies, pending_ids)``; each reply has ``reply_to_message_id``,
        ``src_node_id``, ``payload`` and ``error``."""
        ...


class NodeReply(Protocol):
    """Node-side reply channel (exactly one reply per instruction)."""

    def __call__(self, payload: str) -> None: ...
