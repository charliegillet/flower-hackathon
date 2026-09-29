"""Run-event emitter (see docs/event-schema.md)."""

from __future__ import annotations

import time
from typing import Any, Callable

Sink = Callable[[dict[str, Any]], None]


class Emitter:
    def __init__(self, sink: Sink) -> None:
        self._sink = sink
        self._t0 = time.monotonic()

    @property
    def elapsed(self) -> float:
        return round(time.monotonic() - self._t0, 3)

    def emit(self, type_: str, **fields: Any) -> None:
        self._sink({"type": type_, "ts": self.elapsed, **fields})

    def raw(self, event: dict[str, Any]) -> None:
        """Forward a pre-built event (e.g. an OpenAI SDK stream event), stamping ``ts``."""
        self._sink({**event, "ts": event.get("ts", self.elapsed)})

    def stage(self, stage: str, status: str, label: str = "") -> None:
        self.emit("bq.stage", stage=stage, status=status, label=label)

    def msg(self, src: str, dst: str, kind: str, summary: str, fields: list[str], sealed: bool = False) -> None:
        self.emit("bq.msg", **{"from": src, "to": dst}, kind=kind, summary=summary, fields=fields, sealed=sealed)
