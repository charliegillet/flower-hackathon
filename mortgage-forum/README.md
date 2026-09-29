---
tags: [agentapp]
dataset: []
framework: []
---

# Private Mortgage Rate Finder

Find the best mortgage rate without giving your finances to any bank.

One Flower **AgentApp** run is the "closed forum". Your agent and two bank
agents run inside it. Your figures exist only in that run's memory, and only
the final recommendation leaves it, to you alone.

```
you (flwr chat) ──prompt──▶ [ AgentApp run = closed forum ]
                              UserAgent ⇄ Prime Mutual
                                        ⇄ Harbour Bank
you ◀──recommendation──────── (only the final answer is emitted)
```

## How it works

| Part | Role |
|---|---|
| `user_agent.py` | Parses your message into income, loan and house price (LLM, with a regex fallback). Sends banks only your **LTI** (loan ÷ income) and **LTV** (loan ÷ house price), asks for quotes, runs a "can you beat X%?" round, then writes the recommendation. |
| `bank_agent.py` | Prices with the deterministic `quote()` tool, so the numbers are exact. The LLM phrases the offer and picks a counter-offer, which is then clamped to the bank's policy floor. |
| `banks.py` | **Prime Mutual** rewards high income (LTI discount). **Harbour Bank** rewards a big deposit (LTV discount). Both refuse LTI > 4.5 or LTV > 90%. |
| `agent_app.py` | Wires up the forum and emits only the final answer. |

### Privacy rules
1. No connectors are requested, so the run cannot fetch or send anything out.
2. Nothing is written to `context.state`, and earlier chat turns are not replayed.
3. Banks receive only LTI/LTV ratios and competing *rates*, never raw figures.
4. Only the final answer is emitted. Bank transcripts stay inside the run.
5. `tests/test_privacy.py` audits every prompt and message a bank receives or sends for any form of the user's figures.

Note: your own agent's LLM does see your message, so for full privacy run the
model locally (see below) rather than through a hosted provider.

## Test

```shell
uv sync
uv run pytest
```

## Run locally with Ollama

Local runs need an Ollama version that serves the `/v1/responses` API
(0.12.4 does not, so run `brew upgrade ollama` if needed).

```shell
ollama pull qwen3.5:4b
# set model = "qwen3.5:4b" under [tool.flwr.app.config] in pyproject.toml
export FLWR_MODEL_API_ENDPOINT=http://localhost:11434/v1/responses
FLWR_CHAT_SUPERLINK=local uv run flwr chat
# in chat:
/load .
```

## Run on SuperGrid

Set `publisher` in `pyproject.toml` to your Flower account name, then:

```shell
uv run flwr login supergrid
uv run flwr chat
/load .
```

## Demo prompts

| Prompt | Result |
|---|---|
| *I earn £120k, house £400k, need £300k* | Prime Mutual wins at 4.30% (high income) |
| *I earn £70k, house £500k, need £250k* | Harbour Bank wins at 4.00% (big deposit) |
| *I earn £100k, house £420k, need £300k* | Harbour Bank counters 4.70% → 4.55% and wins |
| *I earn £40k, need £300k* | Both banks decline (LTI 7.5x > 4.5x) |
