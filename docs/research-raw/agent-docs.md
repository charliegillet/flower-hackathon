## Flower Agent docs and tutorials (verified 2026-09-29 against Flower 1.39.0)

**Where this comes from.** The live docs are at https://flower.ai/docs/agent/ (Sphinx/Furo; I scraped it live on 2026-09-29). Their source is `flwrlabs/flower` → `agent/docs/source/*.md` (the old `adap/flower` org search failed; the repo now lives at `flwrlabs/flower`). The docs' `conf.py` sets `release = "1.39.0"`, so every `|stable_flwr_version|` below is **1.39.0**. The `framework-1.39.0` release was tagged 2026-09-28. The docs call Flower Agent **experimental**.

On 2026-09-25, PR #8244 ("Consolidate AgentApp guides around Flower Chat") renamed pages. The titles in the task don't match the live ones exactly, so this is my mapping:

| Requested title | Current page (live URL) |
|---|---|
| Use SuperGrid to interact with Flower Agents | https://flower.ai/docs/agent/tutorials/quickstart.html ("Chat in your browser") + https://flower.ai/docs/agent/how-to-guides/use-agents-and-federations.html |
| Use Flower Chat to run agents in the terminal | https://flower.ai/docs/agent/tutorials/get-started-with-flower-agent.html ("Chat in your terminal") |
| Build a custom AgentApp | https://flower.ai/docs/agent/tutorials/write-your-first-agentapp.html + https://flower.ai/docs/agent/tutorials/build-a-research-agent.html |
| Run your AgentApp on SuperGrid | https://flower.ai/docs/agent/how-to-guides/run-on-supergrid.html |
| Run your AgentApp with a local SuperLink | https://flower.ai/docs/agent/how-to-guides/run-with-local-superlink.html (+ `run-with-ollama.html`) |
| Use connectors on SuperGrid | https://flower.ai/docs/agent/explanations/use-connectors.html + https://flower.ai/docs/agent/how-to-guides/connect-accounts.html |

Other pages: `how-to-guides/create-automations.html`, `use-flower-hub.html`, `use-openai-sdk.html`, `troubleshoot-agent-runs.html`, `explanations/agentapp-runtime.html`. The API reference is at https://flower.ai/docs/framework/ref-api/flwr.agentapp.html.

### Core concepts (index page and runtime explanation)
- **AgentApp**: packaged agent logic that Flower runs, shipped as a FAB (Flower App Bundle).
- **Agent**: an AgentApp that can be selected by app spec (e.g. `@flwrlabs/flwr-agent`) or by FAB hash.
- **Run**: one execution. Related runs form a **run series**, which the chat UIs show as a conversation.
- **Federation**: the SuperGrid workspace where runs execute. The default is `@<account>/personal`.
- **Connector**: a tool the runtime supplies. It is either built in (`web_search`, `web_fetch`, `start_automation`) or an account connector (Slack, Notion, GitHub, Attio; all read-only).
- A FAB holds **either** one `agentapp` component **or** a `serverapp`+`clientapp` pair, never both.
- `AgentSession` API (from `flwr/agentapp/base.py`):
  - `agent.prompt`
  - `agent.connectors.tools(refs)` / `.call(tool_call)`
  - `agent.events.emit(event)` / `.get_trace()`
  - `agent.grid.tools()` / `.call(tool_call)`
- `Context` provides `context.run_config`, `context.state` (persisted for the run series) and `context.run_id`.
- The runtime injects `FLWR_RUNTIME_BASE_URL` and `FLWR_RUNTIME_API_KEY`, which point at an OpenAI-compatible **Responses** endpoint that only works inside the AgentApp process.
  - Supported fields: `model`, `input`, `stream`, `tools`, `tool_choice`, `instructions`, `previous_response_id`, `reasoning`, `max_output_tokens`, `metadata`, `text`.
  - The default provider at `api.flower.ai` does **not** support `previous_response_id`. Rebuild `input` from the trace instead.
- Where output goes:
  - `print()` → the AgentApp logs only.
  - `agent.events.emit()` → the run-event stream and the run-series trace. This is what Flower Chat and the browser render.
  - `Context` → only state your app defines itself.
- Run lifecycle: CLI/browser submits → SuperGrid validates membership, config and connectors → run (and series if needed) is created → executor starts an isolated process and loads the FAB → `AgentSession` and `Context` are initialised → `main` runs → `Context` is pushed once at shutdown.

### 1. Chat in your browser / use SuperGrid (quickstart.html, use-agents-and-federations.html)
- Go to https://flower.ai/app → **Sign in**. You need a Flower account with Flower Agent access; no install or API key.
- You land in the `@<account>/personal` federation, with **New chat**, a prompt, an agent selector and a connector control next to it. The screenshot shows agents "Flower Agent" and "GPT 5.6 Chat".
- Deterministic test prompt: `Reply with exactly: Flower Agent is ready.`
- Follow-up that tests context: `What exact phrase did I ask you to return?` The default agent replays history; custom AgentApps have to do this themselves.
- To use an agent in a team federation, select that federation in the sidebar → **New chat** → pick one of its assigned agents.
- List federations from the CLI: `uvx --from flwr==1.39.0 flwr federation list supergrid` (use the full ID, including the leading `@`).
- To add a Hub app to a federation: https://flower.ai/apps → type **Agent** → open the app → **Add app to federation** (+) → choose a federation → **Confirm**.

### 2. Chat in your terminal / Flower Chat (get-started-with-flower-agent.html)
Prerequisites: uv, Python ≥3.11, a Flower account with Agent access. No model credentials are needed on SuperGrid.
```console
$ uvx --from flwr==1.39.0 flwr --version
$ uvx --from flwr==1.39.0 flwr login supergrid     # opens browser auth link
$ uvx --from flwr==1.39.0 flwr chat
```
`~/.flwr/config.toml` is created automatically and must contain:
```toml
[superlink.supergrid]
address = "api.flower.ai"
```
In-chat controls:
- `@<publisher>/<agent> <request>` at the start of the prompt selects an agent and starts a new series.
- `/federation @<account>/<federation-name>` clears the transcript, resets to Flower Agent and starts a new conversation.
- `/help`, `/new`, `/history` (arrow keys, Enter, Esc), `/load <path>` (builds and selects a local AgentApp), `/quit`.
- Ctrl+C stops the current run, closes history, clears a draft, or exits from an idle prompt.
- Env var `FLWR_CHAT_SUPERLINK` chooses the connection (default `supergrid`).
- **Discrepancy:** the 1.39.0 source also has a `/connector` command ("Select or clear connectors") in `framework/py/flwr/cli/constant.py`, added in PR #8148 on 2026-09-15. The docs (`connect-accounts.md`) still say "The CLI does not currently provide connector selection inside `flwr chat`. Use the SuperGrid browser for account-backed runs."

### 3. Build a custom AgentApp (write-your-first-agentapp.html, build-a-research-agent.html)
```console
$ uvx --from flwr==1.39.0 flwr new @flwrlabs/agent
$ cd agent
$ uv sync
$ uv run flwr build            # validates config + component ref, prints .fab path
$ uv run flwr login supergrid
$ uv run flwr chat
/load .
Explain Flower Agent in one sentence.
```
Project layout:
```text
agent/
├── .gitignore
├── agent/
│   ├── __init__.py
│   └── agent_app.py
├── LICENSE
├── README.md
└── pyproject.toml
```
`pyproject.toml`, from the Hub template (`hub/apps/agent/pyproject.toml`). The docs use version 1.39.0; the template repo still pins 1.38.0:
```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "agent"
version = "0.4.0"
description = "A minimal Flower AgentApp"
license = { file = "LICENSE" }
requires-python = ">=3.11,<4.0"
dependencies = ["flwr>=1.39.0,<2.0", "openai>=2.16.0,<3.0.0"]

[tool.hatch.build.targets.wheel]
packages = ["agent"]

[tool.flwr.app]
publisher = "flwrlabs"          # change to your Flower username before publishing
fab-format-version = 1
flwr-version-target = "1.39.0"
fab-include = ["agent/**/*.py", "LICENSE"]

[tool.flwr.app.components]
agentapp = "agent.agent_app:app"   # <module>:<attribute>
```
Minimal `agent/agent_app.py` from the docs:
```python
import os
from flwr.agentapp import AgentApp, AgentSession
from flwr.app import Context
from openai import OpenAI

MODEL = "openai/gpt-5.6-sol"
app = AgentApp()

@app.main()
def main(agent: AgentSession, context: Context) -> None:
    client = OpenAI(base_url=os.environ["FLWR_RUNTIME_BASE_URL"],
                    api_key=os.environ["FLWR_RUNTIME_API_KEY"],
                    max_retries=0)   # retries would create duplicate model tasks
    stream = client.responses.create(model=MODEL, input=agent.prompt, stream=True)
    out = []
    for event in stream:
        agent.events.emit(event.to_dict())       # makes it render in chat/browser
        if event.type in {"error", "response.failed"}:
            raise RuntimeError(f"Model response failed: {event}")
        if event.type == "response.output_text.delta":
            out.append(event.delta)
    print("".join(out))                          # logs only
```
Notes:
- Create the client inside `main` so that `flwr build` can import the module.
- The Hub template's own `agent_app.py` also rebuilds history from `agent.events.get_trace()`. It collects `message` events with role `user`, gathers `response.output_text.delta` / `response.refusal.delta` until `response.completed`, and skips `error`, `response.failed` and `response.incomplete`.
- To publish text that doesn't come from the SDK stream, emit two events: `{"type":"response.output_text.delta","delta":text}` then `{"type":"response.completed"}`.
- The research agent tutorial sets `TOOL_REFS = ("web_search","web_fetch")` and `MAX_TOOL_TURNS = 3`, runs a bounded loop, then makes a final streamed call with `instructions="Answer ... do not invent results."`.
- **Older docs** (before 2026-09-25, file `build-a-collaborative-agent.md`) used `uv run flwr run . supergrid --stream` and `--run-config 'agent.input="..."'` with `[tool.flwr.app.config.agent] input = "..."`. The current docs replace this with `flwr chat` + `/load`.

### 4. Run on SuperGrid (run-on-supergrid.html)
- Use `uvx --from flwr==1.39.0 flwr ...` for standalone commands and `uv run flwr ...` inside a project.
- Get a Hub agent: `uvx --from flwr==1.39.0 flwr new '@<publisher>/<agent>'`.
- Check the project: `uv sync && uv run flwr build`.
- Chat: `uv run flwr chat`, then `/load <path-to-app>`. The path is relative to where chat started. Local changes are rebuilt before each message; if a build fails, the previous build stays selected.
- Observe and stop runs:
```console
$ uvx --from flwr==1.39.0 flwr list --run-id <run-id> supergrid
$ uvx --from flwr==1.39.0 flwr log <run-id> supergrid --show   # streams by default without --show
$ uvx --from flwr==1.39.0 flwr stop <run-id> supergrid
```
- Stopping a run doesn't stop automations. Stop those under **Settings > Automations**; there is no CLI command for this.
- Publish to Flower Hub (use-flower-hub.html):
  - Set `publisher` to your username, include a `description`, add a `LICENSE` file, and use `fab-format-version = 1`.
  - Run `uv run flwr login supergrid`, then `uv run flwr app publish .`. The uploaded sources are public and upload starts right away without confirmation.
  - The app appears at `https://flower.ai/apps/<publisher>/<project-name>/`.
  - For a new version, bump `[project].version` and publish again.

### 5. Run with a local SuperLink (run-with-local-superlink.html, run-with-ollama.html)
This setup needs no SuperGrid account. It is insecure (no TLS) and meant for development only.
```console
# terminal 1 (inside the AgentApp project)
$ export FLWR_MODEL_API_KEY="<your-api-key>"                              # Flower default endpoint
# or any Open Responses-compatible endpoint (must be the full /responses URL):
$ export FLWR_MODEL_API_ENDPOINT="http://127.0.0.1:8080/v1/responses"
$ export FLWR_MODEL_API_KEY="<your-provider-api-key>"                     # omit if no auth
$ uv run flower-superlink --insecure        # HTTP API on 127.0.0.1:8000; no SuperNode needed
```
Add this to `~/.flwr/config.toml` (no `flwr login` needed):
```toml
[superlink.local-agent]
address = "127.0.0.1:8000"
insecure = true
```
```console
# terminal 2
$ export FLWR_CHAT_SUPERLINK=local-agent
$ uv run flwr chat          # then /load .
$ uv run flwr list --run-id <run-id> local-agent
$ uv run flwr log <run-id> local-agent --show
$ uv run flwr stop <run-id> local-agent
```
- Account connectors are **not** available locally. Built-in connectors depend on the local runtime and provider.
- Run the CLI and SuperLink from the same environment to avoid version mismatches.
- Ollama variant: `ollama pull qwen3.5:4b`, `ollama serve`, `export FLWR_MODEL_API_ENDPOINT="http://127.0.0.1:11434/v1/responses"`, and set `MODEL = "qwen3.5:4b"` (requires Ollama ≥0.13.3).
- **Nebius (my inference, not in the docs):** `export FLWR_MODEL_API_ENDPOINT="https://api.tokenfactory.tf-ca1.nebius.com/v1/responses"` plus `FLWR_MODEL_API_KEY=<nebius key>`, and set `MODEL` to a Nebius model ID.

### 6. Connectors (use-connectors.html, connect-accounts.html, create-automations.html)
Built-in connectors: `web_search`, `web_fetch` (private and unsafe targets are blocked), and `start_automation`. `start_automation` takes:
- `input` and `start_at` (required; RFC 3339 with a timezone)
- `fixed_interval` (optional, seconds)
- `max_runs` (optional; only valid with `fixed_interval`)

Account connectors:

| Connector | What it can read |
|---|---|
| Slack | search messages, list conversations, read history and thread replies |
| Notion | search shared pages and data sources, read page blocks |
| GitHub | search code in one public repo, read one public UTF-8 file |
| Attio | search records, list meetings and call recordings, read transcripts |

To connect an account: https://flower.ai/settings/connectors → **Connect** → approve the provider's consent screen. Then select connectors per run in the browser's connector selector.

**Account connectors only work in your personal federation.** A run in a collaborative federation that selects them is rejected.

Pattern:
```python
tools = agent.connectors.tools(["web_search", "web_fetch"])   # schemas only; ["slack"] expands to several tools
allowed = {t["name"] for t in tools if isinstance(t.get("name"), str)}
for _ in range(3):                                            # always bound the loop
    resp = client.responses.create(model=MODEL, input=input_items, tools=tools, tool_choice="auto")
    output = [i.to_dict() for i in resp.output]
    calls = [i for i in output if i.get("type") == "function_call"]
    if not calls: break
    for c in calls:
        if c.get("name") not in allowed: raise RuntimeError("not exposed")
    input_items += output + [agent.connectors.call(c) for c in calls]  # returns function_call_output with same call_id
```
If a connector fails, it raises `RuntimeError`. You can either let the run fail or return an error-shaped `function_call_output` to the model.

### 7. Collaborative AgentApp / Grid tools (from source; the only mention in the docs is one line)
`framework/py/flwr/supercore/task_process/agent/grid.py` (`RuntimeAgentGrid`) exposes `agent.grid.tools()` and `agent.grid.call(tool_call)`. The same pattern as connectors applies: pass `tools` to the model, then pass the returned `function_call` item to `call`.
- **An AgentApp on the SuperLink** (coordinator) gets these tools:
  - `get_nodes(sample_size: int|null)` → `{nodes:[{id,name,location}], num_available}`
  - `push_messages(messages:[{dst_node_id, payload, reply_to_message_id|null}])` → `{results:[{message_id, error}]}`
  - `pull_messages(message_ids:[...], timeout: 0–300s)` → `{messages:[{message_id, reply_to_message_id, src_node_id, payload, error}], pending_message_ids}`
- **An AgentApp on a SuperNode** (participant) gets only `push_reply_message(payload)`. Its `agent.prompt` is a compact JSON string `{"message_id","src_node_id","payload"}` rather than plain text; system messages arrive as plain text.
- Grid calls also emit `function_call` / `function_call_output` events into the trace.
```python
tools = agent.connectors.tools(["web_search"]) + agent.grid.tools()
# ... when the model returns a function_call named get_nodes/push_messages/pull_messages/push_reply_message:
out = agent.grid.call(tool_call)
```
This snippet is my composition from the source; no tutorial shows it.

### Troubleshooting highlights (troubleshoot-agent-runs.html, use-openai-sdk.html)
- Missing `supergrid` connection → add the `[superlink.supergrid]` section shown above.
- Expired authentication → run `flwr login supergrid` again.
- Agent not listed → check the federation (`[superlink.supergrid].federation` or `flwr federation list supergrid`).
- `ModuleNotFoundError: openai` → run `uv sync`.
- Missing runtime URL or key → you ran the module directly instead of through Flower.
- `FLWR_RUNTIME_BASE_URL` (inside the AgentApp) is **not** `FLWR_MODEL_API_ENDPOINT` (the upstream provider config for a self-hosted SuperLink).

### Sources
- https://flower.ai/docs/agent/ (live scrape 2026-09-29)
- https://flower.ai/docs/agent/tutorials/quickstart.html
- https://flower.ai/docs/agent/tutorials/get-started-with-flower-agent.html
- https://flower.ai/docs/agent/tutorials/write-your-first-agentapp.html
- https://flower.ai/docs/agent/tutorials/build-a-research-agent.html
- https://flower.ai/docs/agent/how-to-guides/run-on-supergrid.html
- https://flower.ai/docs/agent/how-to-guides/run-with-local-superlink.html
- https://flower.ai/docs/agent/how-to-guides/run-with-ollama.html
- https://flower.ai/docs/agent/how-to-guides/use-agents-and-federations.html
- https://flower.ai/docs/agent/how-to-guides/connect-accounts.html
- https://flower.ai/docs/agent/how-to-guides/create-automations.html
- https://flower.ai/docs/agent/how-to-guides/use-flower-hub.html
- https://flower.ai/docs/agent/how-to-guides/use-openai-sdk.html
- https://flower.ai/docs/agent/how-to-guides/troubleshoot-agent-runs.html
- https://flower.ai/docs/agent/explanations/agentapp-runtime.html
- https://flower.ai/docs/agent/explanations/use-connectors.html
- https://flower.ai/docs/framework/ref-api/flwr.agentapp.html
- https://github.com/flwrlabs/flower/tree/main/agent/docs/source (plus `conf.py`: release 1.39.0)
- https://github.com/flwrlabs/flower/tree/main/hub/apps/agent (template `pyproject.toml`, `agent_app.py`, README)
- https://github.com/flwrlabs/flower/blob/main/framework/py/flwr/agentapp/base.py
- https://github.com/flwrlabs/flower/blob/main/framework/py/flwr/supercore/task_process/agent/grid.py
- https://github.com/flwrlabs/flower/blob/main/framework/py/flwr/supercore/task_process/agent/run_agentapp.py
- https://github.com/flwrlabs/flower/blob/framework-1.39.0/framework/py/flwr/cli/constant.py (chat commands, including `/connector`)
- Older tutorial: `agent/docs/source/tutorials/build-a-collaborative-agent.md` at commit `af5b702cfdd8726c0c4a24bf9f7ac4e26e0d5881`
- https://github.com/flwrlabs/flower/releases (framework-1.39.0, 2026-09-28)

### Unverified / open questions
- The exact requested titles ("Use SuperGrid to interact with Flower Agents", "Build a custom AgentApp", "Use connectors on SuperGrid", etc.) aren't on the live site. The mapping above is my inference from content and the 2026-09-25 renames. The hackathon handout may point to a different or older doc build.
- Collaborative AgentApp and Grid tools: there is no tutorial or how-to. Everything here comes from source code. How to deploy an AgentApp onto SuperNodes in a SuperGrid federation (which process runs where, how participants register their agent) is not documented and I couldn't verify it.
- `flwr chat` `/connector` exists in 1.39.0 code, but the docs say the CLI has no connector selection. I haven't checked how it behaves.
- Whether `flwr run . supergrid --stream` / `--run-config` still work for AgentApps in 1.39.0. They were documented before 2026-09-25 and have since been removed from the docs.
- The "Endeavor" model: it isn't mentioned anywhere in the agent docs. The only model ID in the docs is `openai/gpt-5.6-sol` (plus `qwen3.5:4b` for Ollama). I don't know the model string for Endeavor on SuperGrid.
- Nebius Token Factory as `FLWR_MODEL_API_ENDPOINT`: plausible because it is Open Responses-compatible, but not in the docs or tested. The model ID format and whether `web_search`/`web_fetch` work locally with it are also untested.
- "Nebius Serverless AI" and "connectors on SuperGrid" beyond the four account connectors plus three built-ins: I found no documentation.
- Flower Agent access may need an entitlement ("request Flower Agent access"); I don't know how hackathon accounts get it.
- `@flwrlabs/flwr-agent` is named as the default agent's app spec. I didn't browse the Hub catalog to list other agent apps.