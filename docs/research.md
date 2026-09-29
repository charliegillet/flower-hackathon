# Flower Collaborative Agent Hackathon — Research

> See also: `hackathon-brief.md` (event post), `flower-agent-docs/` (full docs mirror), `community-pulse.md` (/last30days), `ideas.md` (brainstorm), `research-raw/` (per-topic agent reports).

> Research date: 2026-09-29 (event day). Checked against Flower **1.39.0** docs, the `flwrlabs/flower` source, the Stanford forum post and the Hub API.
> Anything marked **(unverified)** has not been confirmed in official docs or tested. Do not treat it as fact.

---

## 1. TL;DR

**What to build with**

- **Flower 1.39.0.** Pin it: `uvx --from flwr==1.39.0 flwr ...` for standalone commands, `uv run flwr ...` inside a project. The `framework-1.39.0` tag was cut 2026-09-28. The docs call Flower Agent **experimental**.
- **Templates:**
  - `@flwrlabs/collaborative-agent` gives you Grid tools to sample other agents, message them and collect replies.
  - `@flwrlabs/agent` is a minimal chat agent that replays history.
  - Multi-SuperNode demo repo: https://github.com/jafermarq/flower-collaborative-agent-hackathon
- **Model:** Endeavor, model ID **`flwrlabs/endeavor-1.0`** (taken from the `@flwrlabs/endeavor-agent` source). It earns bonus points. Fallbacks are `openai/gpt-5.6-sol` and `openai/gpt-5.6-terra`, plus the Nebius Token Factory models.
- **Interfaces:** Flower Chat (`flwr chat` + `/load .`) and the browser at https://flower.ai/app.

**The 10 things to know first**

1. **Collaboration means Grid tools.**
   - A coordinator AgentApp on the SuperLink gets `get_nodes`, `push_messages` and `pull_messages`.
   - A participant AgentApp on a SuperNode gets only `push_reply_message`.
   - These tools are documented only in source (`supercore/task_process/agent/grid.py`). No tutorial covers them.
2. **The model API lives inside the AgentApp.** Use `FLWR_RUNTIME_BASE_URL` and `FLWR_RUNTIME_API_KEY`, which point at an OpenAI-compatible **Responses** endpoint. Create the client with `max_retries=0`. The default provider does **not** support `previous_response_id`, so rebuild history from `agent.events.get_trace()`.
3. **Output only shows up if you emit it.** `print()` goes to logs only. Call `agent.events.emit(...)` to render output in Flower Chat or the browser.
4. **Each task has a 5-minute timeout**, counted from when it enters Running (forum FAQ). Bound every tool loop. `pull_messages` accepts timeouts up to 300 s, which uses the whole budget.
5. **Account connectors (Slack, Notion, GitHub, Attio) work only in your personal federation.** Runs in a collaborative federation that select them are rejected. The built-ins (`web_search`, `web_fetch`, `start_automation`) are the safe choice.
6. **Endeavor = `flwrlabs/endeavor-1.0`.** We have not confirmed that a hackathon key can call it without a separate access request **(unverified)**. Test it first.
7. **Publishing is public, has no confirmation step and cannot be undone.** `uv run flwr app publish .` uploads immediately and apps cannot be deleted. Remove keys and `.env` files first.
8. **The Hub is strict about files.**
   - Only `.py/.toml/.md/.yaml/.yml/.json/.jsonl` files, root `LICENSE`/`LICENSE.md`, `.gitignore` and `.editorconfig` are uploaded. **No HTML, JS, CSS, PNG or CSV.**
   - The folder name may contain only letters, digits and hyphens (`my_agent` fails).
   - Declare only `agentapp` as a component.
9. **Submission before demos (17:15):**
   - The Typeform (team name plus Flower usernames)
   - A published Hub app
   - A short description
   - A GitHub repo link
   - The submission reminder is at 16:30. Demos run 3–5 minutes plus Q&A.
10. **Judging:** Use of Flower (Agents + SuperGrid), Impact & Originality, and Demo & Delivery. Past winners shared four traits:
    - data sovereignty (share judgements, not records)
    - a visible safety gate
    - specialist roles plus a coordinator
    - honest scoping of what was built versus planned

---

## 2. Concepts & architecture

| Term | What it is |
|---|---|
| **Flower Agent** | Flower's agent product: agents run as AgentApps on SuperGrid or a local SuperLink. It is experimental. The default agent is `@flwrlabs/flwr-agent`. |
| **SuperGrid** | Flower's hosted platform. The CLI address is `api.flower.ai`, and SuperNodes connect to `fleet-supergrid.flower.ai:443`. You log in with `flwr login supergrid`. It validates membership, config and connectors, then runs AgentApps in isolated processes. |
| **Federation** | A SuperGrid workspace where runs execute. The default is `@<account>/personal`. Team federations can have agents assigned to them. The demo repo creates a federation of type `deployment` and adds SuperNodes to it. |
| **SuperLink** | The coordinating server. On SuperGrid it is hosted. Locally you start it with `flower-superlink --insecure`, which serves an HTTP API on `127.0.0.1:8000`. An AgentApp running on the SuperLink is the **coordinator** and gets the Grid tools `get_nodes`, `push_messages` and `pull_messages`. |
| **SuperNode** | A participant node, for example one per organisation or hospital. It registers with an ECDSA key and connects to the SuperLink. An AgentApp on a SuperNode gets only `push_reply_message`. Local data is exposed through `FLWR_FILESYSTEM_ALLOWED_DIRS`, as in the demo repo. |
| **AgentApp** | Packaged agent logic shipped as a FAB (Flower App Bundle). A FAB contains **either** one `agentapp` component **or** a `serverapp`+`clientapp` pair, never both. |
| **Agent** | An AgentApp you select by app spec (`@publisher/name`) or by FAB hash. |
| **Run / run series** | A run is one execution. Related runs form a series, which the UIs show as one conversation. |
| **Collaborative AgentApp** | An AgentApp that uses `agent.grid.tools()` / `agent.grid.call()` to find other nodes' agents, send them messages and collect replies. The template is `@flwrlabs/collaborative-agent`. |
| **Grid tools** | Function-calling tools provided by `RuntimeAgentGrid` (see §4). Grid calls also add `function_call` / `function_call_output` events to the trace. |
| **Connectors** | Tools supplied by the runtime. **Built-in:** `web_search`, `web_fetch` (blocks private and unsafe targets) and `start_automation`. **Account connectors (read-only):** Slack, Notion, GitHub and Attio. Account connectors work only in the personal federation and are not available on a local SuperLink. |
| **Flower Chat** | The terminal UI (`flwr chat`) and the browser chat at https://flower.ai/app. Both render the events your app emits. |
| **Flower Hub** | The app registry at https://flower.ai/apps. It had 191 apps, 49 of them `agentapp`. You publish with `flwr app publish .` and fetch with `flwr new @publisher/app`. |

**Run lifecycle**

1. The CLI or browser submits the run.
2. SuperGrid validates membership, config and connectors.
3. The run is created, and a series too if needed.
4. The executor starts an isolated process and loads the FAB.
5. `AgentSession` and `Context` are initialised.
6. `main` runs.
7. `Context` is pushed once at shutdown.

**`AgentSession` API** (`flwr/agentapp/base.py`)

- `agent.prompt` is plain text for a coordinator or chat agent. For a SuperNode participant it is compact JSON: `{"message_id","src_node_id","payload"}`. System messages arrive as plain text.
- `agent.connectors.tools(refs)` / `agent.connectors.call(tool_call)`
- `agent.events.emit(event)` / `agent.events.get_trace()`
- `agent.grid.tools()` / `agent.grid.call(tool_call)`
- `Context` provides `context.run_config`, `context.state` (persisted for the run series) and `context.run_id`.

**Where output goes**

| Call | Destination |
|---|---|
| `print()` | AgentApp logs only |
| `agent.events.emit()` | The run-event stream and series trace. Chat and the browser render this. |
| `Context` | Only state your app defines itself |

---

## 3. Setup & quickstart

### Prerequisites

- uv
- Python ≥ 3.11
- A Flower account with Flower Agent access. Your username is used for SuperGrid allow-listing, so have it ready.
- Slack: https://flower.ai/join-slack, then the channel **#hackathon_stanford_2026**, which carries announcements, support and API keys.

### Browser (no install)

1. Go to https://flower.ai/app and sign in. You land in `@<account>/personal`.
2. Test prompt: `Reply with exactly: Flower Agent is ready.`
3. Test context: `What exact phrase did I ask you to return?` The default agent replays history. Custom apps must do this themselves.
4. To use a team federation, select it in the sidebar, click **New chat** and pick an assigned agent.
5. To add a Hub app to a federation, go to https://flower.ai/apps, filter by type **Agent**, open the app, click **Add app to federation (+)**, pick the federation and click **Confirm**.

### Terminal (Flower Chat)

```console
$ uvx --from flwr==1.39.0 flwr --version
$ uvx --from flwr==1.39.0 flwr login supergrid        # opens a browser auth link
$ uvx --from flwr==1.39.0 flwr chat
$ uvx --from flwr==1.39.0 flwr federation list supergrid   # use full IDs, including the leading @
```

`~/.flwr/config.toml` is created automatically and must contain:

```toml
[superlink.supergrid]
address = "api.flower.ai"
```

Chat controls:

- `@<publisher>/<agent> <request>` selects an agent and starts a new series.
- `/federation @<account>/<name>` switches federation, resets to Flower Agent and starts a new conversation.
- `/help`, `/new`, `/history`, `/load <path>` (builds and selects a local AgentApp; the path is relative to where chat started) and `/quit`.
- Ctrl+C stops a run, closes history, clears a draft, or exits from an idle prompt.
- Env var `FLWR_CHAT_SUPERLINK` chooses the connection (default `supergrid`).
- Local changes are rebuilt before each message. If a build fails, the previous build stays selected.
- **Discrepancy:** the 1.39.0 source has a `/connector` command (PR #8148), but the docs say the CLI has no connector selection and tell you to use the browser. How `/connector` behaves is **(unverified)**.

### Build and run an AgentApp on SuperGrid

```console
$ uvx --from flwr==1.39.0 flwr new @flwrlabs/agent                  # or @flwrlabs/collaborative-agent
$ cd agent
$ uv sync
$ uv run flwr build            # validates config + component ref, prints .fab path
$ uv run flwr login supergrid
$ uv run flwr chat
/load .
Explain Flower Agent in one sentence.
```

Observe and stop runs:

```console
$ uvx --from flwr==1.39.0 flwr list --run-id <run-id> supergrid
$ uvx --from flwr==1.39.0 flwr log <run-id> supergrid --show    # without --show it streams
$ uvx --from flwr==1.39.0 flwr stop <run-id> supergrid
```

Stopping a run does **not** stop automations. Stop those in the browser under **Settings > Automations**; there is no CLI command.

Older docs (before 2026-09-25) used `uv run flwr run . supergrid --stream` and `--run-config 'agent.input="..."'`. We have not checked whether these still work for AgentApps in 1.39.0 **(unverified)**.

### Local SuperLink (no SuperGrid account; insecure, development only)

```console
# terminal 1 (inside the AgentApp project)
$ export FLWR_MODEL_API_KEY="<your-api-key>"          # Flower default endpoint
# or any Open Responses-compatible endpoint (must be the full /responses URL):
$ export FLWR_MODEL_API_ENDPOINT="http://127.0.0.1:8080/v1/responses"
$ export FLWR_MODEL_API_KEY="<provider-key>"          # omit if no auth
$ uv run flower-superlink --insecure                  # HTTP API on 127.0.0.1:8000; no SuperNode needed
```

Add this to `~/.flwr/config.toml` (no login needed):

```toml
[superlink.local-agent]
address = "127.0.0.1:8000"
insecure = true
```

```console
# terminal 2
$ export FLWR_CHAT_SUPERLINK=local-agent
$ uv run flwr chat                # then /load .
$ uv run flwr list --run-id <run-id> local-agent
$ uv run flwr log <run-id> local-agent --show
$ uv run flwr stop <run-id> local-agent
```

- Run the CLI and the SuperLink from the same environment to avoid version mismatches.
- Account connectors are unavailable locally. Built-in connectors depend on the local runtime and provider.
- **Ollama:** requires Ollama ≥ 0.13.3.
  - Run `ollama pull qwen3.5:4b` and `ollama serve`.
  - `export FLWR_MODEL_API_ENDPOINT="http://127.0.0.1:11434/v1/responses"`
  - Set `MODEL = "qwen3.5:4b"`.

### Model configuration: environment variables

Do not confuse the two variables:

- `FLWR_RUNTIME_BASE_URL` / `FLWR_RUNTIME_API_KEY` are injected **inside** the AgentApp process.
- `FLWR_MODEL_API_ENDPOINT` / `FLWR_MODEL_API_KEY` configure the **upstream provider** for a self-hosted SuperLink or SuperNode.

| Provider | Setup |
|---|---|
| **SuperGrid** | No model credentials needed. |
| **Flower AI** | `export FLWR_MODEL_API_KEY=...`. Get the key at flower.ai → Profile → Settings → API Keys. Model names use the OpenRouter format, e.g. `openai/gpt-5.6-sol`. |
| **Nebius Token Factory** | `export FLWR_MODEL_API_ENDPOINT="https://api.tokenfactory.tf-ca1.nebius.com/v1/responses"` plus `FLWR_MODEL_API_KEY=<nebius key>`. The key is shared in Slack. Models: `dedicated/flowerai/Kimi-K2.7-Code-1OUHWL` and `dedicated/flowerai/MiniMax-M3-OOLI9o`. |

The Nebius endpoint comes from the event forum post, not from the docs. We have not tested it. We also have not verified:
- whether `web_search`/`web_fetch` work with it locally
- whether SuperGrid-hosted coordinator runs can use Nebius models

### SuperNodes (multi-org demo) — from the demo repo

The demo sets up 4 "hospital" SuperNodes, each with synthetic `patient_data` in a different format (CSV, CSV, MD, TXT), started with `docker compose`:

- Image: `flwr/supernode:1.39.0`
- Flags: `--superlink=fleet-supergrid.flower.ai:443`, `--auth-supernode-private-key=/keys/supernode-N`, `--allow-runtime-dependency-installation`
- Env: `FLWR_MODEL_API_KEY`, `FLWR_FILESYSTEM_ALLOWED_DIRS=/data/supernode-x`

```bash
ssh-keygen -t ecdsa -b 384 -N "" -C "supernode-$i" -f "keys/supernode-$i"
uvx flwr supernode register keys/supernode-0.pub supergrid --name="..." --location="lat,lon"
# then create a federation of type `deployment` and add the SuperNodes to it
flwr supernode list supergrid --verbose      # check they are online
```

### SuperNode on Nebius Serverless AI (from the forum post)

1. Run the key and registration commands:

   ```bash
   flwr login supergrid
   ssh-keygen -t ecdsa -b 384 -N "" -f nebius-supernode-key-1
   flwr supernode register nebius-supernode-key-1.pub supergrid
   ```

2. Create the endpoint under Serverless AI → Endpoints → Create Endpoint (Custom):
   - Image: `docker.io/flwr/supernode:1.37.0-py3.12-ubuntu24.04`
   - Port: 9092 TCP
3. Enter the entrypoint as a single line:

   ```
   exec flower-supernode --superlink=fleet-supergrid.flower.ai:443 --auth-supernode-private-key=/tmp/nebius-supernode-key-1 --allow-runtime-dependency-installation
   ```

4. Upload the private key as a file mounted at `/tmp/nebius-supernode-key-1`.
5. Suggested machine: L40S, 1 GPU, 8 CPUs, 32 GiB RAM, 250 GB disk, public endpoint.

The Nebius image is **1.37.0** while the docs and demo repo use **1.39.0**. We have not checked whether mixing versions causes problems **(unverified)**.

### Troubleshooting

| Symptom | Fix |
|---|---|
| Missing `supergrid` connection | Add the `[superlink.supergrid]` section. |
| Expired auth | Run `flwr login supergrid` again. |
| Agent not listed | Check the federation (`[superlink.supergrid].federation` or `flwr federation list supergrid`). |
| `ModuleNotFoundError: openai` | Run `uv sync`. |
| Missing runtime URL or key | You ran the module directly instead of through Flower. |

---

## 4. AgentApp / Collaborative AgentApp API and templates

### Project layout

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

### `pyproject.toml` (Hub template, `hub/apps/agent/pyproject.toml`)

The docs use 1.39.0; the template repo still pins 1.38.0.

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

`@flwrlabs/collaborative-agent` v0.2.0 also sets:
- `display-name = "Clinical Analytics Agent"`
- `color = "emerald"`
- `requires-python = ">=3.11,<4.0"`
- `fab-include = ["agent/**/*.py", "LICENSE"]`

### Minimal `agent/agent_app.py` (docs)

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

- Create the client **inside** `main` so that `flwr build` can import the module.
- **Supported Responses fields:** `model`, `input`, `stream`, `tools`, `tool_choice`, `instructions`, `previous_response_id`, `reasoning`, `max_output_tokens`, `metadata`, `text`. The default provider at `api.flower.ai` does **not** support `previous_response_id`.
- **History replay (as the Hub template does it):**
  - Read `agent.events.get_trace()`.
  - Collect `message` events with role `user`.
  - Gather `response.output_text.delta` / `response.refusal.delta` until `response.completed`.
  - Skip `error`, `response.failed` and `response.incomplete`.
- **Emitting text that doesn't come from the SDK stream:**

  ```python
  agent.events.emit({"type": "response.output_text.delta", "delta": text})
  agent.events.emit({"type": "response.completed"})
  ```

### Connector tool loop (docs pattern)

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

- A failed connector raises `RuntimeError`. Either let the run fail or return an error-shaped `function_call_output` to the model.
- The research-agent tutorial uses `TOOL_REFS = ("web_search","web_fetch")` and `MAX_TOOL_TURNS = 3`, then makes a final streamed call with `instructions="Answer ... do not invent results."`.

**`start_automation` arguments:**
- `input` and `start_at` (required; RFC 3339 with a timezone)
- `fixed_interval` (optional, seconds)
- `max_runs` (optional; only valid with `fixed_interval`)

**Account connectors** (connect at https://flower.ai/settings/connectors → **Connect**, then select per run in the browser):

| Connector | What it can read |
|---|---|
| Slack | search messages, list conversations, read history and thread replies |
| Notion | search shared pages and data sources, read page blocks |
| GitHub | search code in one public repo, read one public UTF-8 file |
| Attio | search records, list meetings and call recordings, read transcripts |

### Grid tools (source: `framework/py/flwr/supercore/task_process/agent/grid.py`)

| Side | Tool | Signature → result |
|---|---|---|
| Coordinator (SuperLink) | `get_nodes` | `(sample_size: int \| null)` → `{nodes:[{id,name,location}], num_available}` |
| Coordinator | `push_messages` | `(messages:[{dst_node_id, payload, reply_to_message_id \| null}])` → `{results:[{message_id, error}]}` |
| Coordinator | `pull_messages` | `(message_ids:[...], timeout: 0–300s)` → `{messages:[{message_id, reply_to_message_id, src_node_id, payload, error}], pending_message_ids}` |
| Participant (SuperNode) | `push_reply_message` | `(payload)` |

The same pattern as connectors applies: pass `tools` to the model, then pass the returned `function_call` item to `agent.grid.call`.

```python
tools = agent.connectors.tools(["web_search"]) + agent.grid.tools()
# when the model returns a function_call named get_nodes/push_messages/pull_messages/push_reply_message:
out = agent.grid.call(tool_call)
```

### Coordinator / participant skeleton

**Our composition from source. Untested (unverified).** Whether one FAB should branch on role, and how participants' AgentApps are deployed to SuperNodes, are both undocumented. Compare against `@flwrlabs/collaborative-agent` before relying on this.

```python
import json, os
from flwr.agentapp import AgentApp, AgentSession
from flwr.app import Context
from openai import OpenAI

MODEL = "flwrlabs/endeavor-1.0"      # fallback: "openai/gpt-5.6-sol"
MAX_TURNS = 5                        # 5-minute task timeout: keep pull_messages timeouts short
app = AgentApp()

def _client():
    return OpenAI(base_url=os.environ["FLWR_RUNTIME_BASE_URL"],
                  api_key=os.environ["FLWR_RUNTIME_API_KEY"], max_retries=0)

def _emit_text(agent, text):
    agent.events.emit({"type": "response.output_text.delta", "delta": text})
    agent.events.emit({"type": "response.completed"})

@app.main()
def main(agent: AgentSession, context: Context) -> None:
    client = _client()
    grid_tools = agent.grid.tools()
    names = {t.get("name") for t in grid_tools}
    is_participant = names == {"push_reply_message"}   # inference: role detected from exposed tools

    if is_participant:
        try:
            msg = json.loads(agent.prompt)             # {"message_id","src_node_id","payload"}
            task = msg["payload"]
        except (json.JSONDecodeError, KeyError):
            task = agent.prompt                        # system messages arrive as plain text
        instructions = ("Answer using only local data. Share aggregate judgements, never raw records. "
                        "Reply by calling push_reply_message.")
    else:
        task = agent.prompt
        instructions = ("You coordinate agents on other nodes. Use get_nodes, push_messages, "
                        "pull_messages (timeout <= 60s), then synthesise an answer.")

    tools = grid_tools
    input_items = [{"role": "user", "content": task}]
    resp = None
    for _ in range(MAX_TURNS):
        resp = client.responses.create(model=MODEL, input=input_items, tools=tools,
                                       tool_choice="auto", instructions=instructions)
        output = [i.to_dict() for i in resp.output]
        calls = [i for i in output if i.get("type") == "function_call"]
        input_items += output
        if not calls:
            break
        for c in calls:
            if c.get("name") not in names:
                raise RuntimeError(f"tool not exposed: {c.get('name')}")
            input_items.append(agent.grid.call(c))    # assumed to return function_call_output like connectors
    if resp is not None and not is_participant:
        _emit_text(agent, resp.output_text)
```

Open points for this skeleton, all **(unverified)**:
- whether Endeavor supports tool calling through the runtime endpoint
- whether `agent.grid.call` returns a `function_call_output` item exactly like connectors
- whether participant replies can be pushed without going through the model

---

## 5. Models: Endeavor and others

| Model ID | Where it comes from | Notes |
|---|---|---|
| **`flwrlabs/endeavor-1.0`** | `_MODEL` in `endeavor_agent/workflow.py` of `@flwrlabs/endeavor-agent` v0.2.2 ("Chat with Flower Endeavor") | Earns the hackathon bonus. Docs: https://flower.ai/docs/model/endeavor.html. Described as a "frontier-class generalist" preview with a context window of up to 1M tokens. Outside the hackathon, access is by request. Whether a hackathon key can call it without a separate request is **(unverified)**. Launch post: https://flower.ai/blog/2026-09-01-introducing-endeavor-1.0 (GPQA 92.0, HumanEval 98.2, AIME 2026 99.9, IFEval 94.1). Endeavor is not mentioned anywhere in the agent docs. |
| `openai/gpt-5.6-sol` | Agent docs (the only model ID they name) | OpenRouter-style naming. |
| `openai/gpt-5.6-terra` | `MODEL` in `agent/utils.py` of `@flwrlabs/collaborative-agent` | — |
| "GPT 5.6 Chat" | Agent name shown in the browser selector screenshot | This is an agent name, not a model ID. |
| `dedicated/flowerai/Kimi-K2.7-Code-1OUHWL` | Forum post (Nebius Token Factory) | Endpoint `https://api.tokenfactory.tf-ca1.nebius.com/v1/responses`. Key in Slack. |
| `dedicated/flowerai/MiniMax-M3-OOLI9o` | Forum post (Nebius Token Factory) | Same endpoint. |
| `qwen3.5:4b` | Ollama how-to | Local only. Requires Ollama ≥ 0.13.3. |

Hardware partners are Nebius, ARM and AMD. The Cambridge event had an Infrastructure track using AMD MI300X endpoints. Nothing equivalent has been announced for Stanford.

---

## 6. Publishing to Flower Hub & submission checklist

### Docs

- AgentApp guide: https://flower.ai/docs/agent/how-to-guides/use-flower-hub.html#publish-your-agentapp (the forum post links here)
- General rules: https://flower.ai/docs/hub/how-to-publish-app-on-hub.html
- FAB format: https://flower.ai/docs/hub/fab-format-version.html
- Optional signing: https://flower.ai/docs/hub/how-to-sign-hub-apps.html

### `pyproject.toml` requirements

```toml
[project]
name = "hello-agent"                 # part of the app spec @publisher/name; cannot be changed after the first publish
version = "0.1.0"
description = "Answer questions with a Flower AgentApp"   # required and non-empty; warning above 200 chars
license = { file = "LICENSE" }       # with fab-format-version = 1 it must be LICENSE or LICENSE.md at the root
dependencies = ["flwr>=1.39.0,<2.0", "openai>=2.16.0,<3.0.0"]

[tool.flwr.app]
publisher = "your-username"          # must match the Flower account you logged in with
display-name = "Hello Agent"
fab-format-version = 1
flwr-version-target = "1.39.0"       # must satisfy the flwr lower bound, which must be inclusive

[tool.flwr.app.components]
agentapp = "hello_agent.agent_app:app"   # this line marks the project as an AgentApp; no tag is needed
```

### Commands

```bash
uv sync
uv run flwr build                 # local check; prints the .fab path
uv run flwr login supergrid
uv run flwr app publish .         # uploads sources; the Hub builds the FAB on the server
# live at: https://flower.ai/apps/<publisher>/<project-name>/
# new version: bump [project].version, then flwr build and flwr app publish . again
```

### Upload rules (docs + `framework/py/flwr/cli/app_cmd/publish.py`)

- **What gets uploaded:** only `**/*.py, *.toml, *.md, *.yaml, *.yml, *.json, *.jsonl`, the root `.gitignore`, `.editorconfig` and root `LICENSE`/`LICENSE.md`. HTML, CSS, JS, PNG and CSV are skipped, so a web UI will not ship.
- **What gets excluded:** `.flwr/**` and `__pycache__` always, then anything matched by `.gitignore`. Each skipped file is printed as `Skip: ...`.
- **Limits:** at most 1,000 files, 1 MB per file and 10 MB in total. Every file must be UTF-8. Files more than 10 directory levels deep are not collected.
- **Directory name:** must start with a letter and contain only letters, digits and hyphens (`_validate_app_name`).
- **Endpoint:** `POST https://api.flower.ai/v1/hub/apps/publish`. If you are not logged in you get "Please log in before publishing app."
- **No confirmation, public, permanent:** there is no prompt, everything uploaded is public, and apps cannot be deleted. An app ID cannot switch between Agent and Federated types.
- **Both component types:** declare only `agentapp`. A README from a third party (`@i53n1/consortium`) says "Hub rejects a bundle carrying both surfaces (422)". This is not in official docs **(unverified)**.
- **Common failures:** not logged in, publisher mismatch, missing description, a required file skipped by `.gitignore`, or an `agentapp` module path that can't be loaded.

### Fetching other apps' code

- `flwr new @publisher/app` calls `POST https://api.flower.ai/v1/hub/fetch-zip` with body `{"app_id":"@flwrlabs/collaborative-agent","app_version":null,"flwr_version":"1.39.0"}` and gets back an S3 `zip_url`. This worked with curl without logging in.
- To list agent apps, read the `__NEXT_DATA__` JSON on https://flower.ai/apps/.

### Submission checklist (Stanford, 2026-09-29)

- [ ] Team registered via Typeform https://flowerlabs.typeform.com/to/rQuplUGG ("(Team Formation) | Team Registration"). Fields: Team Name, then Full Name and **Flower Username** for each member. Members 1–3 are required; 4–5 are optional.
- [ ] Published Flower Hub app
- [ ] Short project description
- [ ] GitHub repo link
- [ ] Ready by the **16:30** submission reminder. Demos start at **17:15**.

The forum does not say where the Hub app, description and GitHub link are submitted; only the team details go through the Typeform. Ask in Slack.

Pre-publish hygiene:
- `publisher` equals your username.
- The folder name uses hyphens, not underscores.
- `LICENSE` and a non-empty `description` are present.
- No keys or `.env` files are in the project.
- Only `agentapp` is declared.
- `flwr build` passes.
- The app is tested through `flwr chat` `/load .`.

---

## 7. Judging criteria → strategy

### Event facts

- **Date and place:** Stanford, 2026-09-29, 9:30–19:30, 389 Jane Stanford Way, W450 Simonyi Center.
- **Schedule (forum):**

  | Time | Item |
  |---|---|
  | 10:15 | Technical demo |
  | 10:30 | Team formation and hacking starts |
  | 12:30 | Lunch |
  | 13:00 | Build |
  | **16:30** | **Demo prep and submission reminder** |
  | **17:15** | **Demos** |
  | 18:00 | Dinner |
  | 18:45 | Awards |
  | 19:30 | Finish |

  Luma shows an older schedule with demos at 5:30. Use the forum times.
- **Challenge ("Flower Agent Harness"):** "Showcase the collaborative aspect of Flower Agents running on SuperGrid… multiple Flower Agents can work together… agent chain… or multiple `AgentApp`s that share context and hand work between agents. Bonus points if you use our recently released Endeavor model."
- **Criteria:** Use of Flower (how much the project uses Flower Agents and SuperGrid), Impact & Originality, and Demo & Delivery. "Agent performance may inform the assessment, but it is not the sole or decisive factor."
- **Demo:** 3–5 minutes plus judges' questions. Cover how Flower Agent and SuperGrid enable the solution, the problem, and the working result.
- **Prizes:** the top 3 projects share up to $5,000.
- **Judges (Luma):**
  - Anastasia Raskolova (Nebius)
  - Daria Balashova (Nebius)
  - Disha Patil (ARM)
  - Naveen Purushotham (AMD)
  - Mehul Vani (Nvidia)
  - Sai Nagabhairava (Meta)
  - Daniel Nata Nugraha (Flower Labs)
  - Dimitris Stripelis (Flower Labs)
- **FAQ:**
  - Credits are "sufficient"; ask Flower Labs staff if you need more. No amounts are published.
  - **5-minute timeout per task.**
  - Give feedback via the "Share feedback" icon on SuperGrid, in #hackathon_stanford_2026, or to staff in person.

### Strategy

| Criterion | What scores | Concrete moves |
|---|---|---|
| **Use of Flower** | Real multi-agent collaboration on SuperGrid, not a single chatbot | Use the coordinator Grid tools (`get_nodes`, `push_messages`, `pull_messages`) across **≥ 3 SuperNodes** in a deployment federation. Use Endeavor (`flwrlabs/endeavor-1.0`) for the bonus. Add `web_search`/`web_fetch` or `start_automation` where natural. Publish to the Hub and demo it through `flwr chat`. Optionally run a SuperNode on Nebius Serverless for partner points. |
| **Impact & Originality** | A real problem that *needs* data to stay where it is | Choose a data-sovereignty problem where nodes share judgements or attestations, not records. Avoid repeating past winners directly: clinical trial feasibility (Mizan Grid), attestation gaps (Consortium), crisis planning with a safety gate (PyroGuard), threat correlation, freight damage, drone SAR, and lab cohorts. Healthcare is the most crowded area. |
| **Demo & Delivery** | A working, legible story in 3–5 min | Script one "gate moment": the safety or oversight agent blocks or revises something live. Show a node-by-node trace from emitted events. Keep every run well under 5 minutes. State plainly what is built versus planned (Consortium was praised for this). Keep a recorded fallback. |

Tactics:

- Get the thin end-to-end path working first: coordinator → 3 SuperNodes → reply → answer. Only then add polish.
- Cache model responses for the demo, as Consortium did.
- Have a local 3-node simulation or Makefile as a fallback, as Consortium did.
- Publish an early version before lunch so the Hub name and publisher are settled. The project name can't be changed after the first publish.
- The Cambridge and Berlin events also scored "Safety and oversight" and "Technical execution". Stanford lists neither, but judges still reward a visible safety gate.

### Past-winner reference

**Cambridge, 2026-08-26.** Tracks: SuperGrid and Infrastructure. Recipes: `@flwrlabs/hackathon-collab-agent-recipe` and `@flwrlabs/hackathon-ollama-agent-recipe`.

1. **Axomic "Consortium"** (`@i53n1/consortium`): organisations that can't pool data exchange anonymised attestations. A coordinator finds the coverage gap and broadcasts it, and each node re-checks its own data. Its README is a good model: Hub plus `flwr chat`, a local 3-node simulation, a Makefile, response caching, and a "what's not built" list.
2. **PyroGuard "Crisis Command":** interpret, plan and safety-check roles. The demo showed a plan rejected at 15% fuel reserve, revised to 25%, then approved. "AI proposes. Safety decides." Its Hub ID was not found.
3. **Mizan Grid** (`@mr-mustafa7/mizan-grid`): multi-hospital trial feasibility where records stay local. It flags patients who are one missing fact away from eligibility.

Honourable mention: cross-organisation threat correlation using hashed signatures, probably `@tanveer/pollen-mesh-agent`. That ID is inferred from the name only **(unverified)**.

**Berlin, 2026-09-16.** Criteria: Impact, Innovation, Use of Flower, Technical execution, Demo, Safety/oversight. The winners were not found **(unverified)**.
- Apps highlighted by Flower:
  - Soteria (freight damage)
  - a collaborative lab analysis app, probably `@apsal/cohortlens-agent`
  - `@kariminem/swarm-sar-commander`
  - BloomKit
- Other Berlin apps on the Hub:
  - `@tauska67/osm-travel-companion`
  - `@krithman/program-committee-review`
  - `@philiphimmeroeder/airlock` (policy gate)
  - `@tauska67/agentapp-builder` (Endeavor)
  - `@julianp/GrwFlwr`
  - `@sultan361/brand-dna-agent`
  - `@marykor/fusion-investigator`

**Decentralized AI Hackathon, Stanford, 2025-09-26** (classic federated learning).
- Winners: AICONTROLLER, FedLLM Studio, FedReRank, poultry disease detection with federated ViT, Dermacheck, HTJ2K streaming FL.
- ResearchGrid limits then: 15-minute TTL per run, 5 concurrent runs.

---

## 8. Project ideas (ranked)

These are the team's own proposals, derived from the constraints and winner patterns above. They are not from sources. We ranked them by fit to the judging criteria, risk within the 5-minute timeout, and overlap with past winners.

1. **Cross-supplier recall tracer (food or pharma supply chain)**
   - **How it works:** each SuperNode is a supplier or distributor holding local lot and shipment records. An Endeavor coordinator gets a contamination report, uses `get_nodes` and `push_messages` to ask "did lot X or its inputs pass through you?", and each node answers with a yes/no, hashed lot IDs and a confidence score. The coordinator builds the affected chain. A **Safety/Legal agent gates** the public recall notice (for example, it blocks the notice until two independent nodes confirm), and `start_automation` schedules re-checks.
   - **Why it ranks first:** strong data-sovereignty story, a clear gate moment, and a domain no past winner has used.
   - **Risk:** we have to build synthetic data per node.
2. **Cross-org vulnerability exposure census**
   - **How it works:** each SuperNode holds a private SBOM or dependency list. The coordinator broadcasts a new CVE (optionally enriched with `web_search`/`web_fetch`). Nodes reply "exposed / not exposed / unsure" plus severity, without revealing their stacks. A triage agent ranks the response and a gate stops over-disclosure.
   - **Why:** timely, and security judges will relate to it.
   - **Risk:** overlaps partly with the Cambridge threat-correlation honourable mention.
3. **Multi-hospital pharmacovigilance signal detection**
   - **How it works:** reuse the demo repo's 4 hospital SuperNodes (CSV/MD/TXT via `FLWR_FILESYSTEM_ALLOWED_DIRS`). The coordinator asks each node for counts of a drug–adverse event pair. A statistician agent computes the signal and a clinical-safety agent gates the alert.
   - **Why:** lowest setup risk, because the data and infrastructure already exist.
   - **Risk:** healthcare is saturated (Mizan Grid, cohortlens), so originality scores lower.
4. **Joint-bid / consortium proposal builder**
   - **How it works:** each partner organisation's node assesses its capacity against an RFP section by section and returns a commitment and gaps. The coordinator assembles the bid and a compliance agent gates it.
   - **Why:** a clean hand-off chain.
   - **Risk:** close to Consortium's coverage-gap mechanic.
5. **Agent chain on the Hub only (no SuperNodes)**
   - **How it works:** research → critic → safety-gate AgentApps, all using Endeavor and web connectors, handing off inside one coordinator.
   - **Why:** the fallback if SuperNode setup blocks us.
   - **Risk:** weaker on "Use of Flower", because there is no SuperGrid collaboration across nodes.

Cross-cutting design rules:

- Nodes return judgements, not records.
- Keep one visible safety gate.
- Keep every run under 5 minutes, with `pull_messages` timeouts well below 300 s.
- Emit per-node progress events so the demo is legible.
- Put a "built vs planned" list in the README.
- Keep any web UI off the Hub, since HTML/JS won't upload; host it on GitHub.

---

## 9. Links / sources

**Flower Agent docs** (live scrape 2026-09-29; `conf.py` release 1.39.0)

Pages were renamed on 2026-09-25 (PR #8244). This is how the older titles map to current pages:

| Older / handout title | Current page |
|---|---|
| Use SuperGrid to interact with Flower Agents | quickstart.html + use-agents-and-federations.html |
| Use Flower Chat to run agents in the terminal | get-started-with-flower-agent.html |
| Build a custom AgentApp | write-your-first-agentapp.html + build-a-research-agent.html |
| Run your AgentApp on SuperGrid | run-on-supergrid.html |
| Run your AgentApp with a local SuperLink | run-with-local-superlink.html (+ run-with-ollama.html) |
| Use connectors on SuperGrid | use-connectors.html + connect-accounts.html |

This mapping is inferred from page content. The handout may point to a different doc build **(unverified)**.

- https://flower.ai/docs/agent/
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
- https://flower.ai/docs/hub/how-to-publish-app-on-hub.html
- https://flower.ai/docs/hub/fab-format-version.html
- https://flower.ai/docs/hub/how-to-sign-hub-apps.html
- https://flower.ai/docs/model/endeavor.html

**Source code** (`flwrlabs/flower`)

- https://github.com/flwrlabs/flower/tree/main/agent/docs/source
- https://github.com/flwrlabs/flower/tree/main/hub/apps/agent
- https://github.com/flwrlabs/flower/blob/main/framework/py/flwr/agentapp/base.py
- https://github.com/flwrlabs/flower/blob/main/framework/py/flwr/supercore/task_process/agent/grid.py
- https://github.com/flwrlabs/flower/blob/main/framework/py/flwr/supercore/task_process/agent/run_agentapp.py
- https://github.com/flwrlabs/flower/blob/framework-1.39.0/framework/py/flwr/cli/constant.py
- `framework/py/flwr/cli/app_cmd/publish.py`, `cli/new/new.py`, `cli/utils.py`, `supercore/constant.py`, `supercore/utils.py`
- Older tutorial: `agent/docs/source/tutorials/build-a-collaborative-agent.md` at commit `af5b702cfdd8726c0c4a24bf9f7ac4e26e0d5881`
- https://github.com/flwrlabs/flower/releases (framework-1.39.0, 2026-09-28)

**Hub / apps**

- https://flower.ai/app (browser chat)
- https://flower.ai/apps
- https://flower.ai/apps/flwrlabs/agent
- https://flower.ai/apps/flwrlabs/collaborative-agent
- https://flower.ai/apps/i53n1/consortium/
- https://flower.ai/settings/connectors
- `POST https://api.flower.ai/v1/hub/fetch-zip`
- `POST https://api.flower.ai/v1/hub/apps/publish`

**Event**

- https://discuss.flower.ai/t/collaborative-agent-hackathon-stanford-ca-2026/1275
- https://luma.com/flwrlabs-bamu
- https://flowerlabs.typeform.com/to/rQuplUGG
- https://github.com/jafermarq/flower-collaborative-agent-hackathon
- https://flower.ai/join-slack (#hackathon_stanford_2026)

**Past hackathons**

- https://discuss.flower.ai/t/collaborative-agent-hackathon-cambridge-uk-2026/1269
- https://flower.ai/blog/2026-08-25-cambridge-agent-hackathon
- https://flower.ai/events/collaborative-agent-hackathon (the Cambridge event page, not Stanford)
- https://discuss.flower.ai/t/collaborative-agent-hackathon-berlin-germany-2026/1273
- https://discuss.flower.ai/t/decentralized-ai-hackathon-stanford-2025/1109
- https://flower.ai/blog/2025-10-22-decentralized-hackathon-sf-winners
- https://www.linkedin.com/posts/flwrlabs_were-excited-to-present-the-winners-and-activity-7498998345164603392-5lHv
- https://www.linkedin.com/posts/flwrlabs_here-are-4-new-flower-hub-apps-that-you-can-activity-7507877081762914304-eUEM

---

## 10. Open questions to ask mentors

1. **Endeavor access:** can our hackathon keys and SuperGrid runs call `flwrlabs/endeavor-1.0` directly, or do we need an access request? Does it support tool calling (Grid tools and connectors) through `FLWR_RUNTIME_BASE_URL`?
2. **Collaborative deployment:** how does a participant AgentApp end up running on each SuperNode in a deployment federation? Is it the same FAB with role detection, or separate apps? How do participants "register" their agent? None of this is documented.
3. **Grid tool semantics:** does `agent.grid.call` return a `function_call_output` exactly like connectors? Can a participant call `push_reply_message` without going through the model?
4. **Timeouts:** does the 5-minute timeout apply per coordinator run and per participant task separately? What `pull_messages` timeout do you recommend?
5. **Submission:** where do we submit the Hub app link, the description and the GitHub repo? The Typeform only takes team details.
6. **Team size:** the forum says 3–5, while Luma says 2–4 and the Typeform requires 3. Which is binding?
7. **Nebius:**
   - Can SuperGrid-hosted coordinator runs use the Nebius Token Factory models, or only local SuperLinks and SuperNodes?
   - Do `web_search`/`web_fetch` work with that endpoint?
   - Is the `1.37.0` Nebius SuperNode image compatible with a `1.39.0` SuperLink and CLI?
8. **Connectors:** is there any way to use account connectors (Slack, Notion, GitHub, Attio) in a collaborative federation? Does `flwr chat` `/connector` work in 1.39.0?
9. **Legacy CLI:** do `flwr run . supergrid --stream` and `--run-config` still work for AgentApps in 1.39.0?
10. **Credits:** what are the SuperGrid credit limits? Is there a concurrency limit on runs?
11. **Hub:** is the "422 for bundles with both `agentapp` and `serverapp`" rule official? Can we publish under a team or organisation publisher, or must it be one member's username?
12. **SuperNode filesystem:** how does an AgentApp on a SuperNode read files under `FLWR_FILESYSTEM_ALLOWED_DIRS`? Is there a runtime filesystem tool, or plain Python file I/O?
13. **Flower Agent access:** how do team members without Agent access get it (entitlement or allow-list via Flower username)?