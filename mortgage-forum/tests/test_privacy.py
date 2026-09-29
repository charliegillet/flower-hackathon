"""The user's figures must never reach a bank, and only the answer is emitted."""

from __future__ import annotations

import json
from typing import Any

import pytest
from flwr.app import Context, RecordDict

from mortgage_forum import agent_app
from mortgage_forum.agent_app import build_forum
from mortgage_forum.user_agent import parse_figures_regex

DEMOS = [
    ("I earn £120k, house £400k, need £300k", (120_000, 300_000, 400_000), "Prime Mutual"),
    ("I earn £70k, house £500k, need £250k", (70_000, 250_000, 500_000), "Harbour Bank"),
    ("I earn £40k, need £300k", (40_000, 300_000, None), None),
]


class RecordingLLM:
    """Fake LLM that logs every prompt it is sent. Returns nothing (fallback path)."""

    def __init__(self, label: str, log: list[tuple[str, str]], parse: dict | None):
        self.label, self.log, self.parse = label, log, parse

    def text(self, instructions: str, prompt: str) -> str | None:
        self.log.append((self.label, instructions + "\n" + prompt))
        return None

    def json(self, instructions: str, prompt: str) -> dict[str, Any] | None:
        self.log.append((self.label, instructions + "\n" + prompt))
        return self.parse if self.label == "user" else None


def figure_strings(*amounts: float | None) -> list[str]:
    """All the ways a user figure could show up in text."""
    out = []
    for a in amounts:
        if a is None:
            continue
        n = int(a)
        out += [str(n), f"{n:,}", f"{n // 1000}k", f"£{n // 1000}"]
    return out


@pytest.mark.parametrize("use_llm_parse", [True, False])
@pytest.mark.parametrize("prompt,figures,winner", DEMOS)
def test_banks_never_see_user_figures(prompt, figures, winner, use_llm_parse):
    income, loan, house = figures
    parse = {"income": income, "loan": loan, "house_price": house} if use_llm_parse else None
    log: list[tuple[str, str]] = []
    user, banks = build_forum(lambda label: RecordingLLM(label, log, parse))

    answer = user.run(prompt)

    if winner:
        assert f"Best offer: {winner}" in answer
    else:
        assert "No bank can offer" in answer

    secrets = figure_strings(income, loan, house)
    bank_facing = [text for label, text in log if label != "user"]
    bank_facing += [json.dumps(b.transcript, default=str) for b in banks]
    assert bank_facing, "banks should have been contacted"
    for text in bank_facing:
        for secret in secrets:
            assert secret not in text, f"{secret!r} leaked to a bank: {text[:200]}"


def test_negotiation_shares_only_rates():
    log: list[tuple[str, str]] = []
    # Figures where both banks approve and the loser can beat the winner.
    user, banks = build_forum(lambda label: RecordingLLM(label, log, None))
    user.run("I earn £100k, house £420k, need £300k")  # LTI 3.0, LTV 71.4%
    for bank in banks:
        received = [t["payload"] for t in bank.transcript if t["direction"] == "received"]
        assert set(received[0]) == {"lti", "ltv"}
        for later in received[1:]:
            assert set(later) == {"competitor_rate"}
    assert any(len(b.transcript) > 4 for b in banks), "a counter-offer round should run"


def test_regex_parser():
    assert parse_figures_regex("I earn £120k, house £400k, need £300k") == {
        "income": 120_000,
        "house_price": 400_000,
        "loan": 300_000,
    }
    assert parse_figures_regex("salary 55,000; borrowing 200000") == {
        "income": 55_000,
        "loan": 200_000,
    }


class FakeEvents:
    def __init__(self):
        self.emitted: list[dict] = []

    def emit(self, event):
        self.emitted.append(event)

    def get_trace(self):
        return []


class FakeSession:
    def __init__(self, prompt):
        self.prompt = prompt
        self.events = FakeEvents()
        self.connectors = None
        self.grid = None


def test_main_emits_only_final_answer_and_keeps_no_state(monkeypatch):
    monkeypatch.setenv("FLWR_RUNTIME_BASE_URL", "http://127.0.0.1:9/v1")
    monkeypatch.setenv("FLWR_RUNTIME_API_KEY", "test")
    # Unreachable endpoint: every LLM call fails and the deterministic path runs.
    session = FakeSession("I earn £120k, house £400k, need £300k")
    context = Context(
        run_id=1, node_id=0, node_config={}, state=RecordDict(), run_config={}
    )
    agent_app.app(session, context)

    types = [e["type"] for e in session.events.emitted]
    assert types == ["response.output_text.delta", "response.completed"]
    assert "Best offer: Prime Mutual" in session.events.emitted[0]["delta"]
    assert len(context.state) == 0


def test_regex_parser_informal():
    text = (
        "Hi! I'm on a salary of about 100 grand, looking at a place for "
        "£420,000 and would need to borrow £300k"
    )
    assert parse_figures_regex(text) == {
        "income": 100_000,
        "house_price": 420_000,
        "loan": 300_000,
    }


def test_missing_house_price_asks_user_before_contacting_banks():
    log: list[tuple[str, str]] = []
    user, banks = build_forum(lambda label: RecordingLLM(label, log, None))
    assert "house price" in user.run("I earn £100k and need £300k")
    assert all(not b.transcript for b in banks)
