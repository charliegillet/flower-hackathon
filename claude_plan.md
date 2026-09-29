# Claude Plan: Private Mortgage Rate Finder

## Idea
One Flower **AgentApp** run is the "closed forum". The user's agent and the bank agents all run inside it. The user's figures exist only in that run's memory: nothing is sent out, stored, or returned to a bank. Only the recommendation leaves the forum, and it goes to the user alone.

```
user (flwr chat) ──prompt──▶ [ AgentApp run = closed forum ]
                               UserAgent ⇄ BankAgent A
                                         ⇄ BankAgent B
user ◀──recommendation──────── (only the final answer is emitted)
```

## Design
| Part | What it does |
|---|---|
| `UserAgent` | Uses the LLM to turn the chat prompt into `{income, loan, house_price}`. Asks each bank for a quote, runs one "can you beat X%?" round, then recommends the best offer. |
| `BankAgent` (×2) | Each has a private rate policy. A deterministic `quote()` tool calculates the rate, so the numbers are exact. The LLM only phrases the offer and decides the counter-offer. |
| `banks.py` | **Bank A "Prime Mutual"** rewards high income, via a loan-to-income (LTI) discount. **Bank B "Harbour Bank"** rewards a big deposit, via a loan-to-value (LTV) discount. Both refuse LTI > 4.5 or LTV > 90%. |
| Recommendation | A table of rate, monthly payment and total cost for each bank, with the best offer and why. |

## Privacy rules (the key constraint)
1. No connectors are requested (no `web_search` or `web_fetch`), so the run has no way to send data out.
2. `context.state` stores nothing about the user's finances. Each run starts clean.
3. The negotiation round shares only competing *rates* between banks, never the user's figures.
4. `agent.events.emit()` sends only the final answer, not the bank-agent transcripts.
5. A test checks that no user figure ever appears in any bank-facing output.

## Files
```
mortgage_forum/
  pyproject.toml        # from `flwr new @flwrlabs/agent`; agentapp = "mortgage_forum.agent_app:app"
  mortgage_forum/
    agent_app.py        # @app.main(): parse → quote → negotiate → recommend
    user_agent.py
    bank_agent.py
    banks.py            # rate policies + quote() + monthly payment maths
  tests/test_pricing.py, tests/test_privacy.py
```

## Steps
1. Scaffold with `uvx --from flwr==1.39.0 flwr new @flwrlabs/agent` and rename it to `mortgage_forum`.
2. Write `banks.py` and the pricing tests (this part needs no LLM).
3. Build the bank and user agents using the OpenAI Responses API on the runtime endpoint Flower provides (`max_retries=0`).
4. Wire up `agent_app.py` with a fixed limit on negotiation rounds, then add the privacy test.
5. Run locally: Ollama (`qwen3.5:4b`) + `flower-superlink --insecure` + `flwr chat`.
6. Run on SuperGrid for the demo: `flwr login supergrid` + `flwr chat` → `/load .`

## Demo script
- *"I earn £120k, house £400k, need £300k"* → Bank A wins (high income).
- *"I earn £70k, house £500k, need £250k"* → Bank B wins (big deposit).
- *"I earn £40k, need £300k"* → both banks decline (LTI too high), with an explanation.

## Open question
Should the banks run as **separate Flower nodes**, one SuperNode per bank, so each bank's policy stays on its own machine? That is a closer fit to "federated", but needs ServerApp/ClientApp instead of AgentApp, and the two can't share one bundle. I suggest the single-AgentApp version for the hackathon, with this as a stretch goal.
