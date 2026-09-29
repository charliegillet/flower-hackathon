"""BlindQuote Flower AgentApp.

One FAB, two roles:
- on the SuperLink (coordinator grid tools available) it runs the negotiation;
- on a SuperNode (only ``push_reply_message``) it answers as the node's
  configured role: ``--node-config 'role="bank" data_dir="/data/bank-a" ...'``.
"""

from __future__ import annotations

import json
import os
from typing import Any

from flwr.agentapp import AgentApp, AgentSession
from flwr.app import Context
from openai import OpenAI

from blindquote.core.events import Emitter
from blindquote.core.llm import LLM
from blindquote.core.protocol import decode
from blindquote.core.roles import handle_node_message
from blindquote.core.roles.coordinator import Coordinator
from blindquote.flower_grid import FlowerGrid

DEFAULT_COORDINATOR_MODEL = "flwrlabs/endeavor-1.0"

app = AgentApp()


def _runtime_client() -> OpenAI:
    return OpenAI(
        base_url=os.environ["FLWR_RUNTIME_BASE_URL"],
        api_key=os.environ["FLWR_RUNTIME_API_KEY"],
        max_retries=0,
    )


def _node_config(context: Context) -> dict[str, Any]:
    cfg = getattr(context, "node_config", None) or {}
    return {str(k): v for k, v in dict(cfg).items()}


def _fetcher(agent: AgentSession):
    """Fetch a public page through Flower's built-in web_fetch connector, if available."""

    def fetch(url: str) -> str | None:
        try:
            tools = agent.connectors.tools(["web_fetch"])
        except Exception:  # noqa: BLE001 - connector not available in this runtime
            return None
        if not tools:
            return None
        name = str(tools[0].get("name"))
        out = agent.connectors.call(
            {"type": "function_call", "call_id": "bq_pmms", "name": name, "arguments": json.dumps({"url": url})}
        )
        return str(out.get("output", ""))

    return fetch


@app.main()
def main(agent: AgentSession, context: Context) -> None:
    grid = FlowerGrid(agent)
    tool_names = grid.tool_names()

    if "push_reply_message" in tool_names:
        # SuperNode side: answer exactly one coordinator message.
        cfg = _node_config(context)
        envelope = decode(agent.prompt)
        msg = decode(envelope.get("payload")) if "payload" in envelope else envelope
        llm = LLM(_runtime_client, str(cfg.get("model") or "") or None, timeout=40)
        reply = handle_node_message(msg, cfg, llm)
        grid.reply(json.dumps(reply, separators=(",", ":"), sort_keys=True))
        print(f"[blindquote:{cfg.get('role')}] {msg.get('kind')} -> {reply.get('kind')}")
        return

    # SuperLink side: run the negotiation.
    model = str(context.run_config.get("coordinator-model", DEFAULT_COORDINATOR_MODEL))
    emitter = Emitter(agent.events.emit)
    coordinator = Coordinator(grid, emitter, LLM(_runtime_client, model, timeout=60), fetch=_fetcher(agent), mode="flower")
    try:
        verdict = coordinator.run(agent.prompt)
    except Exception as exc:
        emitter.emit("bq.error", message=f"{type(exc).__name__}: {exc}"[:500])
        agent.events.emit({"type": "response.output_text.delta", "delta": f"BlindQuote could not finish: {exc}"})
        agent.events.emit({"type": "response.completed", "response": {"output": []}})
        raise
    print(f"[blindquote:coordinator] winner={verdict['winner']}")
