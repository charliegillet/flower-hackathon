"""Thin wrapper over the OpenAI Responses API served by Flower Runtime.

Every call is best-effort: on any failure it returns None and the caller falls
back to deterministic behaviour, so a flaky small local model never breaks the
negotiation or changes a number.
"""

from __future__ import annotations

import json
import re
from typing import Any, Protocol

_THINK = re.compile(r"<think>.*?</think>", re.DOTALL)
_JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)


class LLM(Protocol):
    """What the agents need from a language model."""

    def text(self, instructions: str, prompt: str) -> str | None: ...

    def json(self, instructions: str, prompt: str) -> dict[str, Any] | None: ...


class RuntimeLLM:
    """LLM backed by an OpenAI client pointed at the Flower Runtime endpoint."""

    def __init__(self, client: Any, model: str) -> None:
        self._client = client
        self._model = model

    def text(self, instructions: str, prompt: str) -> str | None:
        try:
            response = self._client.responses.create(
                model=self._model,
                instructions=instructions,
                input=prompt,
            )
        except Exception:  # pylint: disable=broad-except
            return None
        text = _THINK.sub("", response.output_text or "").strip()
        return text or None

    def json(self, instructions: str, prompt: str) -> dict[str, Any] | None:
        text = self.text(instructions + "\nReply with a single JSON object only.", prompt)
        return parse_json_object(text)


def parse_json_object(text: str | None) -> dict[str, Any] | None:
    """Pull the first JSON object out of a model reply."""
    if not text:
        return None
    match = _JSON_OBJECT.search(text)
    if match is None:
        return None
    try:
        value = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None
