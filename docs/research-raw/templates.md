## Flower AgentApp and Collaborative AgentApp templates: structure, API, Grid tools, and how to run them

All findings come from fetched sources on 2026-09-29: the `flwrlabs/flower` repo at commit `83bd061` (2026-09-29), both template ZIPs downloaded from the Flower Hub API, the Stanford hackathon forum thread, and the organizer's GitHub repo. Current flwr release: **1.39.0** (2026-09-28). The Grid tools for agents arrived in **1.38.0**.

### 1. Where things live

| Item | Location |
|---|---|
| Flower AgentApp template | https://flower.ai/apps/flwrlabs/agent (v0.4.0). Source mirrored in https://github.com/flwrlabs/flower/tree/main/hub/apps/agent |
| Flower Collaborative AgentApp template | https://flower.ai/apps/flwrlabs/collaborative-agent (v0.2.0, "A Flower Collaborative AgentApp"). **Not in the flwrlabs/flower repo**, only on the Hub |
| Repo for running the Collaborative AgentApp across SuperNodes | **https://github.com/jafermarq/flower-collaborative-agent-hackathon** (linked from the official Stanford thread, single commit `00c8f77`, 2026-09-29) |
| Official Stanford hackathon guide | https://discuss.flower.ai/t/collaborative-agent-hackathon-stanford-ca-2026/1275 |
| Public API source | `framework/py/flwr/agentapp/{agent_app.py,base.py}` |
| Runtime implementation (Grid tools) | `framework/py/flwr/supercore/task_process/agent/{grid.py,session.py,run_agentapp.py}` |
| Agent docs | https://flower.ai/docs/agent/ (source: `agent/docs/source/` in the repo) |
| API reference | https://flower.ai/docs/framework/ref-api/flwr.agentapp.html |

The forum thread says: "The Flower AgentApp receives the current prompt together with the conversation's previous user and assistant messages. The Collaborative AgentApp comes with Grid tools enabled, allowing agents to sample other agents in a federation, send messages to them, and retrieve their responses. You can find more details on how to run the Flower Collaborative AgentApp across Flower SuperNodes, in this GitHub repo [jafermarq/flower-collaborative-agent-hackathon]."

### 2. Getting the templates

```bash
uvx --from flwr flwr new @flwrlabs/agent
uvx --from flwr flwr new @flwrlabs/collaborative-agent
cd collaborative-agent && uv sync && uv run flwr build
```

`flwr new` does not need a login. Under the hood it calls `POST https://api.flower.ai/v1/hub/fetch-zip` with `{"app_id":"@flwrlabs/<app>","app_version":null,"flwr_version":"1.39.0"}`, and the response's `zip_url` points to a presigned S3 ZIP. Calling this directly with curl worked, which is how I got the ZIPs below.

**Layout (both templates):**
```
agent/                      collaborative-agent/
├── .gitignore              ├── .gitignore
├── LICENSE                 ├── LICENSE
├── README.md               ├── README.md
├── pyproject.toml          ├── pyproject.toml
└── agent/                  └── agent/
    ├── __init__.py             ├── __init__.py
    └── agent_app.py            ├── agent_app.py   # tool loop
                                └── utils.py       # model, instructions, history, streaming
```

**`collaborative-agent/pyproject.toml`:**
```toml
[project]
name = "collaborative-agent"
version = "0.2.0"
description = "A Flower Collaborative AgentApp"
license = { file = "LICENSE" }
requires-python = ">=3.11,<4.0"
dependencies = ["flwr>=1.38.0,<2.0", "openai>=2.16.0,<3.0.0"]

[tool.hatch.build.targets.wheel]
packages = ["agent"]

[tool.flwr.app]
publisher = "flwrlabs"            # change to your Flower username before `flwr app publish`
display-name = "Clinical Analytics Agent"
color = "emerald"
fab-format-version = 1
flwr-version-target = "1.38.0"
fab-include = ["agent/**/*.py", "LICENSE"]

[tool.flwr.app.components]
agentapp = "agent.agent_app:app"  # <module>:<attribute>
```
The minimal `agent` template is the same except `name="agent"`, `version="0.4.0"`, and it has no `display-name` or `color`.

A FAB can hold either one `agentapp` component or a `serverapp`+`clientapp` pair, never both. The Soteria team found that if both are declared, only the AgentApp runs and there is no warning (see `control_handlers.py`).

### 3. AgentApp API (`flwr.agentapp`)

Exports: `AgentApp`, `AgentSession`, `AgentConnectors`, `AgentEvents`, `AgentGrid`, `LoadAgentAppError`.

**Entry point.** There is one synchronous main function with the signature `Callable[[AgentSession, Context], None]`, registered once with `@app.main()`. If it raises an unhandled exception, the run is marked failed.
```python
from flwr.agentapp import AgentApp, AgentSession
from flwr.app import Context

app = AgentApp()

@app.main()
def main(agent: AgentSession, context: Context) -> None:
    ...
```

**`AgentSession`** (abstract base in `base.py`):
| Member | Meaning |
|---|---|
| `agent.prompt: str` | Initial prompt for this run. See "How messages arrive" below |
| `agent.connectors.tools(names) -> list[dict]` / `.call(function_call) -> function_call_output` | Built-in and account connectors (`web_search`, `web_fetch`, `filesystem`, `slack`, `notion`, `github`, `attio`, …) |
| `agent.events.emit(event: dict)` | Publishes to the run-event stream (Flower Chat/browser) and the run-series trace. The event needs a non-empty `"type"` |
| `agent.events.get_trace() -> list[dict]` | All events from **every run in the current run series**. Each is an envelope `{id, timestamp, run_id, task_id, event, data}` |
| `agent.grid.tools() -> list[dict]` / `.call(function_call) -> function_call_output` | Model-facing Grid tools (section 4) |

**`Context`:** `context.run_config` (FAB config plus per-run overrides), `context.state` (persisted for the run series), `context.run_id`, `context.node_id`, `context.node_config` (the SuperNode's `--node-config`).

**Model access.** The runtime injects `FLWR_RUNTIME_BASE_URL` and `FLWR_RUNTIME_API_KEY` into the AgentApp process. You use the OpenAI SDK with the **Responses API only**:
```python
client = OpenAI(base_url=os.environ["FLWR_RUNTIME_BASE_URL"],
                api_key=os.environ["FLWR_RUNTIME_API_KEY"], max_retries=0)
```
Supported fields: `model`, `input`, `stream`, `tools`, `tool_choice`, `instructions`, `previous_response_id`, `reasoning`, `max_output_tokens`, `metadata`, `text`. The default provider (`api.flower.ai`) **does not support `previous_response_id`**, so you have to rebuild history from `get_trace()`. Template model names: `openai/gpt-5.6-sol` (agent) and `openai/gpt-5.6-terra` (collaborative). Model names follow the OpenRouter format.

**Output destinations.** `print()` goes only to the logs. To show text in chat, emit SDK stream events or emit them by hand:
```python
agent.events.emit({"type": "response.output_text.delta", "delta": "Hello"})
agent.events.emit({"type": "response.completed"})
```

#### How the prompt and earlier messages arrive
- **Current prompt:** `agent.prompt`. At startup the runtime (`run_agentapp.py::pull_prompt`) pulls exactly one "instruction" Message and converts it with `message_to_prompt`:
  - For a user/system message (`message_type == "system"`), such as a chat on the SuperLink, the prompt is the **plain payload text**.
  - For a message from another agent via the Grid, the prompt is a **compact JSON string**: `{"message_id": "...", "src_node_id": "<uint64 str>", "payload": "<text>"}`.
  - The runtime also emits `{"type":"message","role":"user","content":prompt}` into the trace.
- **Earlier messages:** they are not injected automatically. The AgentApp rebuilds them from `agent.events.get_trace()`. The collaborative template's `utils._conversation` does this:
```python
def _conversation(agent, context):
    messages, current_prompt_seen = [], False
    for event in agent.events.get_trace():
        data = event["data"]
        if data.get("type") == "message" and data.get("role") in {"user", "assistant"}:
            text = _message_text(data["content"])
            messages.append({"type": "message", "role": data["role"], "content": text})
            current_prompt_seen |= (data["role"] == "user" and event.get("run_id") == context.run_id
                                    and text.strip() == agent.prompt.strip())
        elif data.get("type") == "response.completed":
            for item in data["response"]["output"]:
                if item.get("type") == "message" and item.get("role") == "assistant":
                    messages.append({"type": "message", "role": "assistant",
                                     "content": _message_text(item["content"])})
    if not current_prompt_seen:
        messages.append({"type": "message", "role": "user", "content": agent.prompt.strip()})
    return messages
```
  The minimal `agent` template instead rebuilds assistant turns by joining `response.output_text.delta` and `response.refusal.delta` events per `run_id`, and closes each turn on `response.completed`.

### 4. Grid tools (`agent.grid`), from `supercore/task_process/agent/grid.py`

**The same FAB runs in two roles.** Which tools `RuntimeAgentGrid` exposes depends on where the task runs:
- **On the SuperLink** (`node_id == SUPERLINK_NODE_ID`, the orchestrator): `get_nodes`, `push_messages`, `pull_messages`
- **On a SuperNode** (a worker agent next to the data): only `push_reply_message`

When a Grid message reaches a SuperNode for an AgentApp run, that node starts a new AgentApp task **of the same FAB**, with the message as its prompt.

| Tool | Arguments | Returns |
|---|---|---|
| `get_nodes` | `sample_size: int \| null` (≥1; null = all) | `{"nodes":[{"id":"<uint64 str>","name":str\|null,"location":str\|null}], "num_available": int}`. Sampling uses `random.sample` |
| `push_messages` | `messages: [{"dst_node_id": "<uint64 str>", "payload": str, "reply_to_message_id": str\|null}]` (minItems 1) | `{"results":[{"message_id": str\|null, "error": str\|null}]}`, one per message, in order |
| `pull_messages` | `message_ids: [str]` (minItems 1), `timeout: number` (0–300 s; 0 = check once) | `{"messages":[{"message_id","reply_to_message_id","src_node_id","payload": str\|null,"error": str\|null}], "pending_message_ids":[...]}`. Polls every 0.25 s |
| `push_reply_message` (SuperNode) | `payload: str` | `{"message_id": str\|null, "error": str\|null}`. It replies once to the instruction that started the task; a second call returns the error "No instruction message to reply to…" |

On the wire, a payload is a string wrapped as `Message(RecordDict({"agent": ConfigRecord({"text": payload})}), dst_node_id=..., message_type="query")`. Replies use a 6-hour TTL. Every `agent.grid.call(...)` also emits the `function_call` and `function_call_output` events to the run stream, which gives you an audit trail.

`agent.grid.call` takes a Responses-style `function_call` item (`{"type":"function_call","call_id":..,"name":..,"arguments": <json str or dict>}`). You can drive it from the model's tool calls, or build the dict in code without a model. Two teams (kidneygrid, and the Stanford-Hackathon/Main-Repo campus-agent) do the latter:
```python
out = agent.grid.call({"type": "function_call", "call_id": "c1", "name": "get_nodes",
                       "arguments": {"sample_size": None}})
nodes = json.loads(out["output"])["nodes"]
```

### 5. Collaborative AgentApp code (`agent/agent_app.py`, verbatim core)

```python
MAX_TOOL_ROUNDS = 20
app = AgentApp()

@app.main()
def main(agent: AgentSession, context: Context) -> None:
    client = OpenAI(base_url=os.environ["FLWR_RUNTIME_BASE_URL"],
                    api_key=os.environ["FLWR_RUNTIME_API_KEY"], max_retries=0)
    input_items = _conversation(agent, context)
    try:
        connector_tools = agent.connectors.tools(["filesystem"])
    except ValueError:
        connector_tools = []
    connector_tool_names = {tool["name"] for tool in connector_tools}
    tools = [*agent.grid.tools(), *connector_tools]

    for _ in range(MAX_TOOL_ROUNDS):
        response, completed_event = _stream_response(client, agent, input_items, tools)
        response_output = [item.to_dict() for item in response.output]
        tool_calls = [i for i in response_output if i.get("type") == "function_call"]
        input_items.extend(response_output)
        if not tool_calls:
            agent.events.emit(completed_event)
            return
        input_items.extend(
            agent.connectors.call(item) if item.get("name") in connector_tool_names
            else agent.grid.call(item)
            for item in tool_calls)
    raise RuntimeError(f"Agent exceeded {MAX_TOOL_ROUNDS} tool rounds")
```

`utils.py` sets up the following:
- `MODEL = "openai/gpt-5.6-terra"`, with `reasoning={"effort":"medium"}`.
- It re-emits only `response.output_text.delta` and `response.reasoning_summary_text.delta`.
- The system instructions are:
```python
AGENT_COLLABORATION_INSTRUCTIONS = (
  "The presence of `src_node_id` in the prompt means the request came from another agent; "
  "`payload` is its request. You MUST reply using `push_reply_message`, passing your reply as a "
  "string. Call this tool only once per instruction message. If the prompt has no `src_node_id`, "
  "reply directly to the user.")
INSTRUCTIONS = ("Use the available Grid tools as needed ... Base your answer on tool results; do not "
  "invent results." "EVER send raw data in a message ...")  # sic: missing space and "NEVER" typo in template
```

**Filesystem connector** (used by the template on SuperNodes):
- Tools: `filesystem_list_directory(path)` and `filesystem_read_file(path)`. The read tool handles UTF-8 files up to 1 MiB.
- They appear only when `FLWR_FILESYSTEM_ALLOWED_DIRS` is set to absolute paths separated by `os.pathsep`. Otherwise `tools()` returns nothing or raises `ValueError`, which the template catches.
- They are not available on Windows.

**Flow:**
1. The user chats with the SuperLink agent.
2. The model calls `get_nodes`, then `push_messages`.
3. Each SuperNode starts the same app, gets a JSON prompt with `src_node_id`, reads local files with the filesystem tools, and calls `push_reply_message`.
4. The SuperLink agent calls `pull_messages` and answers the user.

### 6. How to run it

**A. Single agent on SuperGrid (no SuperNodes):**
```bash
uv sync && uv run flwr build
uv run flwr login supergrid
uv run flwr chat          # starts in @<account>/personal
/load .                   # at the chat prompt, then type a message
/federation @<account>/<fed>   # switch federation; "@" opens the agent picker; /new, /history
```
You can also run it in the browser at https://flower.ai/app. To publish: set `publisher` to your username, then run `uv run flwr app publish .`.

**B. Collaborative agent across SuperNodes on SuperGrid.** This follows `jafermarq/flower-collaborative-agent-hackathon`, which ships four SuperNodes with synthetic patient data in CSV, CSV, MD, and TXT under `data/supernode-{a..d}`.
```bash
mkdir keys
for i in {0..3}; do ssh-keygen -t ecdsa -b 384 -N "" -C "supernode-$i" -f "keys/supernode-$i"; done
uvx flwr login supergrid
uvx flwr supernode register keys/supernode-0.pub supergrid --name="Lakeside Medical Center" --location="34.0522,-118.2437"
# ...repeat for supernode-1..3 (Northstar / Harborview / Pacific Maple)
export FLWR_MODEL_API_KEY="your-key"   # flower.ai Profile -> Settings -> API Keys
docker compose up
```
`compose.yaml` (one service per node):
```yaml
supernode-1:
  image: flwr/supernode:1.39.0
  command:
    - --superlink=fleet-supergrid.flower.ai:443
    - --auth-supernode-private-key=/keys/supernode-0
    - --allow-runtime-dependency-installation
  environment:
    FLWR_MODEL_API_KEY: ${FLWR_MODEL_API_KEY:?Set FLWR_MODEL_API_KEY before running docker compose}
    FLWR_FILESYSTEM_ALLOWED_DIRS: /data/supernode-a
  volumes: [./keys:/keys:ro, ./data/supernode-a:/data/supernode-a]
```
Next, create a federation of type **`deployment`** (simulation federations cannot hold SuperNodes) and add the nodes to it:
```bash
flwr supernode list supergrid --verbose
flwr federation add-supernode <supernode-id> @<username>/<federation-name> supergrid
```
Then chat with `@flwrlabs/collaborative-agent` (or your own `/load .`) in that federation.

Without Docker, you can start a node with:
```bash
flower-supernode --superlink fleet-supergrid.flower.ai:443 --auth-supernode-private-key keys/supernode-0
```
Add `--node-config 'k="v"'` to pass per-node config, which the app reads as `context.node_config`.

**SuperNode model endpoint** (from the forum thread; set these in the SuperNode environment):
```bash
export FLWR_MODEL_API_KEY="<YOUR-FLOWER-API-KEY>"                        # Flower-served models
# or Nebius Token Factory:
export FLWR_MODEL_API_ENDPOINT="https://api.tokenfactory.tf-ca1.nebius.com/v1/responses"
export FLWR_MODEL_API_KEY="<NEBIUS-API-KEY>"
```

**C. Fully local (no account), from the local-SuperLink docs and the kidneygrid scripts:**
```bash
export FLWR_MODEL_API_KEY=...          # or FLWR_MODEL_API_ENDPOINT=http://127.0.0.1:11434/v1/responses (Ollama)
uv run flower-superlink --insecure     # HTTP API 127.0.0.1:8000, Fleet 9092
uv run flower-supernode --insecure --superlink 127.0.0.1:9092 --port 9110 --node-config 'records="/abs/a.json"'
uv run flower-supernode --insecure --superlink 127.0.0.1:9092 --port 9111 ...
# ~/.flwr/config.toml:
#   [superlink.local-agent]
#   address = "127.0.0.1:8000"
#   insecure = true
export FLWR_CHAT_SUPERLINK=local-agent && uv run flwr chat   # then /load .
```
Inspect runs with `flwr list --run-id <id> local-agent`, `flwr log <id> local-agent --show`, and `flwr stop <id> local-agent`.

**Gotchas reported by other hackathon teams** (third-party repos, not official docs):
- `flower-superexec` must be on `PATH`, which is why the docs use `uv run`.
- Stale SuperNodes reconnect to a new SuperLink as phantom nodes.
- SuperGrid keeps a stopped node "active" for about 60 s.
- Each SuperNode on one machine needs its own `FLWR_HOME`.
- One task process is started per Grid message, so a round trip takes about 2–5 s locally. State between messages has to live on the node.
- In insecure mode nodes have `name` and `location` set to `None`. Names only come from `flwr supernode register --name/--location`.
- The Stanford-Hackathon/Main-Repo notes list a 5-minute task timeout on SuperGrid, citing "the hackathon brief". I did not see this in an official source.

### Sources
- https://discuss.flower.ai/t/collaborative-agent-hackathon-stanford-ca-2026/1275 (official Stanford guide: template links, repo link, env vars)
- https://github.com/jafermarq/flower-collaborative-agent-hackathon (README.md, compose.yaml, data/)
- https://flower.ai/apps/flwrlabs/collaborative-agent, https://flower.ai/apps/flwrlabs/agent (Hub pages); ZIPs via `POST https://api.flower.ai/v1/hub/fetch-zip`
- https://github.com/flwrlabs/flower: `framework/py/flwr/agentapp/{agent_app.py,base.py,__init__.py}`, `framework/py/flwr/supercore/task_process/agent/{grid.py,session.py,run_agentapp.py}`, `framework/py/flwr/supercore/task_process/connector/filesystem/filesystem.py`, `framework/py/flwr/cli/new/new.py`, `hub/apps/agent/`
- `agent/docs/source/...` = https://flower.ai/docs/agent/ (index, tutorials/write-your-first-agentapp, explanations/agentapp-runtime, how-to-guides/{run-on-supergrid, run-with-local-superlink, use-agents-and-federations, use-openai-sdk, use-flower-hub})
- https://flower.ai/docs/framework/how-to-connect-supernodes-to-supergrid.html (source `framework/docs/source/how-to-connect-supernodes-to-supergrid.rst`)
- Changelogs `framework/docs/source/changelog/v1.38.0.md` (AgentApps on SuperLink and SuperNodes, Grid tools) and `v1.39.0.md`; https://flower.ai/blog/2026-09-22-announcing-flower-1.38-release
- https://luma.com/flwrlabs-bamu (Stanford event page)
- Secondary examples from other teams: https://github.com/irangareddy/agent-warden (based on the Collaborative template), https://github.com/bouncypitch/kidneygrid (scripts/supergrid_nodes.sh, local_stack.sh), Stanford-Hackathon/Main-Repo `campus-agent/FLOWER_GRID_NOTES.md`, Backooo/Soteria `docs/FLOWER-FEEDBACK.md`

### Unverified / open questions
- **Nothing was run end to end.** I did not run `flwr chat`, SuperGrid, or SuperNodes. Commands come from docs and READMEs.
- **`flwr new` itself was not verified.** It timed out while installing flwr. I got the templates by calling the same Hub API it uses.
- **`SUPERLINK_NODE_ID` value.** It is `1` according to third-party notes only. I did not read `flwr/common/constant.py`.
- **Endeavor model ID.** No model string for "Endeavor" appears in the repo or the templates, and the forum post doesn't name one. Ask the mentors or Slack.
- **Nebius model names.** It is unconfirmed how the model name should be written for Nebius Token Factory when using `FLWR_MODEL_API_ENDPOINT`.
- **Where SuperNode-side AgentApps get their model credentials on SuperGrid.** The compose file sets `FLWR_MODEL_API_KEY` on each SuperNode, which suggests node-side model calls go through the node's own key. I did not confirm this in code.
- **5-minute task limit on SuperGrid.** Only a third-party note mentions it.
- **SuperNode access may need approval.** The docs say connecting SuperNodes to SuperGrid "may require additional access" (hello@flower.ai). Hackathon accounts may already have it.
- **Undocumented behavior.** The official docs mention `agent.grid` only in one line of the runtime explanation. The tool behavior above comes from reading `grid.py`, and Flower Agent is marked experimental, so interfaces may change.
- **Federation guide URL.** The "Create and Manage Federations" guide (https://flower.ai/docs/framework/how-to-create-and-manage-federations.html) is linked from the hackathon repo, but I did not fetch it.

Local copies: the templates are in `/private/tmp/claude-501/-Users-charlie-hackathons-flower-hackathon/8af87d96-1d88-4875-a17d-b1a9ede637d2/scratchpad/tmpl/{agent,collaborative-agent}/`, and the sparse repo clone is at `.../scratchpad/flwr-agent-research/`.