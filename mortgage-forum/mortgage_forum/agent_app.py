"""Private Mortgage Rate Finder: one AgentApp run is the closed forum.

The user's agent and both bank agents live only inside this run. No connectors
are requested, nothing is written to `context.state`, and the only thing
emitted is the final recommendation for the user.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Callable

from flwr.agentapp import AgentApp, AgentSession
from flwr.app import Context
from openai import OpenAI

from .bank_agent import BankAgent
from .banks import POLICIES
from .llm import LLM, RuntimeLLM
from .user_agent import UserAgent

DEFAULT_MODEL = "openai/gpt-5.6-sol"

app = AgentApp()


def build_forum(
    make_llm: Callable[[str], LLM], rounds: int = 1, term_years: int = 25
) -> tuple[UserAgent, list[BankAgent]]:
    """Create the user agent and one agent per bank policy.

    `make_llm(label)` returns the LLM handle for the agent named `label`.
    """
    banks = [BankAgent(policy, make_llm(policy.name)) for policy in POLICIES]
    user = UserAgent(make_llm("user"), banks, rounds=rounds, term_years=term_years)
    return user, banks


def answer_events(text: str) -> list[dict]:
    """Responses-style stream events that `flwr chat` renders as one answer."""
    response_id = f"resp_{uuid.uuid4().hex}"
    return [
        {"type": "response.output_text.delta", "delta": text},
        {
            "type": "response.completed",
            "response": {
                "id": response_id,
                "object": "response",
                "status": "completed",
                "output": [
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": text}],
                    }
                ],
            },
        },
    ]


@app.main()
def main(agent: AgentSession, context: Context) -> None:
    """Run the closed forum for this prompt and emit only the recommendation."""
    config = context.run_config
    client = OpenAI(
        base_url=os.environ["FLWR_RUNTIME_BASE_URL"],
        api_key=os.environ["FLWR_RUNTIME_API_KEY"],
        max_retries=0,
    )
    model = str(config.get("model", DEFAULT_MODEL))
    user, _ = build_forum(
        lambda _label: RuntimeLLM(client, model),
        rounds=int(config.get("negotiation-rounds", 1)),
        term_years=int(config.get("term-years", 25)),
    )

    # Only the current prompt is used: earlier turns are not replayed, so no
    # figures carry over between runs.
    answer = user.run(agent.prompt)
    for event in answer_events(answer):
        agent.events.emit(event)
