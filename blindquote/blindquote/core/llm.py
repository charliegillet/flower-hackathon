"""Thin wrapper over an OpenAI-compatible Responses client.

Every call is optional: on any failure the caller gets ``None`` and falls back
to deterministic behaviour, so a slow or unavailable model never breaks a run.
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable, Iterator

ClientFactory = Callable[[], Any]


class LLM:
    def __init__(self, client_factory: ClientFactory | None, model: str | None, timeout: float = 45.0) -> None:
        self._factory = client_factory
        self.model = model
        self.timeout = timeout
        self.last_error: str | None = None

    @property
    def available(self) -> bool:
        return self._factory is not None and bool(self.model)

    def _client(self) -> Any:
        client = self._factory()  # type: ignore[misc]
        return client.with_options(timeout=self.timeout, max_retries=0)

    def complete(self, instructions: str, prompt: str, max_tokens: int = 1200) -> str | None:
        if not self.available:
            return None
        try:
            resp = self._client().responses.create(
                model=self.model,
                instructions=instructions,
                input=prompt,
                max_output_tokens=max_tokens,
            )
            text = (resp.output_text or "").strip()
            return text or None
        except Exception as exc:  # noqa: BLE001 - any model failure falls back
            self.last_error = f"{type(exc).__name__}: {exc}"[:300]
            return None

    def complete_json(self, instructions: str, prompt: str, max_tokens: int = 1200) -> dict[str, Any] | None:
        text = self.complete(instructions + "\nRespond with ONLY a JSON object, no prose.", prompt, max_tokens)
        if not text:
            return None
        match = re.search(r"\{.*\}", text, re.S)
        if not match:
            return None
        try:
            obj = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
        return obj if isinstance(obj, dict) else None

    def stream(self, instructions: str, prompt: str, max_tokens: int = 1500) -> Iterator[dict[str, Any]] | None:
        """Yield SDK stream events as dicts, or return None if the model is unavailable."""
        if not self.available:
            return None
        try:
            stream = self._client().responses.create(
                model=self.model,
                instructions=instructions,
                input=prompt,
                max_output_tokens=max_tokens,
                stream=True,
            )
        except Exception as exc:  # noqa: BLE001
            self.last_error = f"{type(exc).__name__}: {exc}"[:300]
            return None

        def _iter() -> Iterator[dict[str, Any]]:
            for event in stream:
                yield event.to_dict()

        return _iter()
