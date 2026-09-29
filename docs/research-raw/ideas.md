## Collaborative Flower Agents on SuperGrid: what the platform supports, and 8 scored hackathon ideas

### 1. What Flower Agent, SuperGrid and the Collaborative AgentApp actually provide (checked against docs and source, 2026-09-29)

**Runtime model** (docs target `flwr==1.39.0`)
- An `AgentApp` is packaged agent logic. It ships as a FAB (Flower App Bundle). You declare it in `pyproject.toml` with `[tool.flwr.app.components] agentapp = "pkg.agent_app:app"`.
- A FAB holds either one `agentapp` or a `serverapp` + `clientapp`, never both. So one bundle cannot do federated-learning training and an agent together.
- Flower calls `@app.main() def main(agent: AgentSession, context: Context)`. `AgentSession` exposes:
  - `agent.prompt`
  - `agent.connectors`: `.tools(refs)` and `.call(tool_call)`
  - `agent.events`: `.emit(event)` and `.get_trace()`
  - `agent.grid`: `.tools()` and `.call(tool_call)`
- Model access goes through the OpenAI SDK Responses API. The runtime injects `FLWR_RUNTIME_BASE_URL` and `FLWR_RUNTIME_API_KEY`.
  - Recognised fields: `model`, `input`, `stream`, `tools`, `tool_choice`, `instructions`, `previous_response_id`, `reasoning`, `max_output_tokens`, `metadata`, `text`.
  - The default provider `api.flower.ai` does not support `previous_response_id`. Rebuild `input` from `agent.events.get_trace()` instead.
- State:
  - `context.state` persists across a run series.
  - `agent.events.emit(...)` feeds Flower Chat and the run-series trace.
  - `print` only goes to the logs.
- Connectors:
  - Built-in: `web_search`, `web_fetch`, `start_automation`.
  - Account connectors (read-only, personal workspace only): Slack, Notion, GitHub, Attio.
  - New in 1.38: a read-only filesystem connector, ref `filesystem`, with tools `filesystem_list_directory` and `filesystem_read_file`. Reads are capped at 1 MiB, UTF-8 only, no symlinks. It only exists when `FLWR_FILESYSTEM_ALLOWED_DIRS` is set on the node.
- Automations: the `start_automation` tool takes args `input`, `start_at` (an RFC 3339 timestamp with timezone), `fixed_interval` in seconds, and `max_runs`. Scheduled runs stay in the same run series, so `context.state` carries memory between them. Automations are listed and stopped only in the SuperGrid UI; there is no CLI in 1.39.
- Limits on the day (Stanford forum FAQ): **each task times out after 5 minutes** from `Running`. Credits are provided.

**Collaborative / Grid layer** (Flower 1.38, "Run AgentApps across a federation (experimental)"; source file `framework/py/flwr/supercore/task_process/agent/grid.py`)
- An AgentApp can run on the SuperLink (the orchestrator) and on SuperNodes (the agents next to the data).
- The tools each side gets depend on its role:
  - **SuperLink AgentApp:** `get_nodes(sample_size|null)` returns `{nodes:[{id,name,location}], num_available}`. `push_messages(messages:[{dst_node_id, payload, reply_to_message_id|null}])` returns `{results:[{message_id,error}]}`. `pull_messages(message_ids, timeout≤300s)` returns `{messages:[{message_id,reply_to_message_id,src_node_id,payload,error}], pending_message_ids}`.
  - **SuperNode AgentApp:** only `push_reply_message(payload)`. It can reply once to the instruction that started it.
- The topology is therefore **hub-and-spoke**. SuperNodes cannot message each other directly; any node-to-node exchange has to be relayed by the orchestrator.
- On a SuperNode, `agent.prompt` is the compact JSON string `{"message_id","src_node_id","payload"}`. Payloads are plain strings, so encode your own JSON protocol inside them.
- Node `name` and `location` come from `flwr supernode register ... --name= --location="lat,lon"`. SuperGrid draws the nodes on a federation map, which works well in a demo.
- `agent.grid.call()` accepts a `function_call` dict (`name`, `call_id`, `arguments` as a str or dict). **Your code can call the Grid tools deterministically without routing through the model.** That is how to build safety gates.
- Hub template: `flwr new @flwrlabs/collaborative-agent`, "a simple Flower AgentApp with Grid tools enabled… sample other agents in a federation, push messages to them, and pull their replies."
- Reference 4-hospital demo: `github.com/jafermarq/flower-collaborative-agent-hackathon`, by Javier Fernandez-Marques of Flower Labs, updated today.
  - It runs 4 SuperNodes with Docker Compose (`flwr/supernode:1.39.0`, `--superlink=fleet-supergrid.flower.ai:443`, `--auth-supernode-private-key`, `--allow-runtime-dependency-installation`).
  - Each node has `FLWR_FILESYSTEM_ALLOWED_DIRS=/data/supernode-X` and synthetic patient files in different formats: CSV, CSV, Markdown and a TXT key=value dump.

**Models**
- On SuperGrid, model names use the OpenRouter format, e.g. `openai/gpt-5.6-sol`.
- **Endeavor 1.0** (blog post 2026-09-01) is a frontier generalist: GPQA 92.0, HumanEval 98.2, AIME 2026 99.9, IFEval 94.1, context up to 1M tokens. Access is by request during the preview.
  - Model id: `flwrlabs/endeavor-1.0` at `https://api.flower.ai/v1`, per the OpenCode guide.
  - Flower pitches it for "long-horizon agent work", "harness" behaviour, and "improvement loops".
- Nebius Token Factory (Stanford post): endpoint `https://api.tokenfactory.tf-ca1.nebius.com/v1/responses`. Model ids `dedicated/flowerai/Kimi-K2.7-Code-1OUHWL` and `dedicated/flowerai/MiniMax-M3-OOLI9o`.
- Each SuperNode gets its model provider from its own environment (`FLWR_MODEL_API_KEY` / `FLWR_MODEL_API_ENDPOINT`). That suggests a federation can mix models: Endeavor at the orchestrator, Kimi or MiniMax on some nodes. This is inferred and not tested.

**Key commands**
```bash
uvx --from flwr==1.39.0 flwr login supergrid
uvx --from flwr==1.39.0 flwr new @flwrlabs/collaborative-agent   # or @flwrlabs/agent
uv sync && uv run flwr build
uv run flwr chat            # then: /load .   /federation @<acct>/<fed>   @<publisher>/<agent>   /connector   /new
uvx flwr federation list supergrid
ssh-keygen -t ecdsa -b 384 -N "" -f keys/sn-0
uvx flwr supernode register keys/sn-0.pub supergrid --name="Org A" --location="37.43,-122.17"
uvx flwr supernode list supergrid --verbose
uvx flwr list --run-id <id> supergrid ; uvx flwr log <id> supergrid --show ; uvx flwr stop <id> supergrid
uv run flwr app publish .   # [tool.flwr.app] publisher = "<your-username>", fab-format-version = 1
```
- The federation must be of type `deployment` before SuperNodes can join it.
- Nebius Serverless option: image `docker.io/flwr/supernode:1.37.0-py3.12-ubuntu24.04`, port 9092, entrypoint `exec flower-supernode --superlink=fleet-supergrid.flower.ai:443 --auth-supernode-private-key=/tmp/<key> --allow-runtime-dependency-installation`.

**Skeleton for one FAB with both roles.** The role is detected from the Grid tool set. The orchestrator's steps are deterministic; the model is only used for local judgement on each node.
```python
import json, os, uuid
from flwr.agentapp import AgentApp, AgentSession
from flwr.app import Context
from openai import OpenAI

app = AgentApp()
MODEL = "flwrlabs/endeavor-1.0"   # fallback "openai/gpt-5.6-sol" if not entitled

def grid(agent, name, **args):
    out = agent.grid.call({"type": "function_call", "name": name,
                           "call_id": f"c_{uuid.uuid4().hex[:8]}", "arguments": args})
    return json.loads(out["output"])

@app.main()
def main(agent: AgentSession, context: Context) -> None:
    client = OpenAI(base_url=os.environ["FLWR_RUNTIME_BASE_URL"],
                    api_key=os.environ["FLWR_RUNTIME_API_KEY"], max_retries=0)
    names = {t["name"] for t in agent.grid.tools()}
    if "push_messages" in names:                      # SuperLink orchestrator
        nodes = grid(agent, "get_nodes", sample_size=None)["nodes"]
        q = json.dumps({"v": 1, "task": "count", "criteria": agent.prompt})
        ids = [r["message_id"] for r in grid(agent, "push_messages", messages=[
            {"dst_node_id": n["id"], "payload": q, "reply_to_message_id": None} for n in nodes])["results"]
            if r["message_id"]]
        replies = grid(agent, "pull_messages", message_ids=ids, timeout=240)
        # deterministic gate: schema-validate every reply, drop/flag anything off-contract,
        # treat pending_message_ids as UNKNOWN (never zero), then summarise with the model
        ...
    else:                                             # SuperNode data agent
        msg = json.loads(agent.prompt)                # {"message_id","src_node_id","payload"}
        fs_tools = agent.connectors.tools(["filesystem"])   # only if FLWR_FILESYSTEM_ALLOWED_DIRS set
        # bounded tool loop over local files -> produce a typed answer; enforce output schema in code
        answer = {"status": "MET", "count_bucket": "10-20"}  # never raw rows
        grid(agent, "push_reply_message", payload=json.dumps(answer))
```

### 2. Landscape: what previous Flower hackathons already did

- **Cambridge (2026-08-26), 16 teams.** Source: Flower's X recap and the blog quickstart.
  - Winners: 1st Consortium (two-round attestation of bid coverage), 2nd PyroGuard (Python safety gate that rejected a 15% fuel reserve), 3rd Mizan Grid (clinical-trial feasibility returning MET/NOT_MET/UNKNOWN).
  - Others: GapCheck/NPZ, Flower Seed, Pollen Mesh (hashed IoCs), RecoveryBox (immutable treatment envelope), VANNA (typed JSON handoffs), Federated Compliance Panel (quotes verified in code), Rare Disease Consult Network (adversarial panel plus a planted false diagnosis), Dissensus, SwarmScience (human decision gate), SEEVAD/provenance-harness (hash-chained ledger), Argus (code review), Federated Security Guard, and a Minecraft orchestrator.
  - Flower's recap organised the projects around four questions: *What can cross the network? What decisions can a model make? What happens when agents disagree or fail? How can someone check what happened afterwards?*
- **Berlin (2026-09-16).** New Hub apps: freight damage decisions, collaborative lab analysis, drone survivor detection, local lyrics and music.
  - Berlin was judged on 6 criteria, including **Safety and oversight**. Stanford collapses these into 3, but the 10:15 talk still covers "safe coordination, self-improvement loops".

**What this means for Stanford.** Single-round "ask every hospital, aggregate an attestation" projects are now well covered. To score on originality, use things those projects did not:
- multi-hop or iterative Grid rounds
- a **self-improvement loop** that measurably improves
- automations for memory over time
- Grid calls issued deterministically from code
- different models at different nodes
- **Endeavor** as the orchestrator

Stanford's Luma page frames the challenge as "safe, human-supervised collaboration", with self-improving loops and work across distributed machines as named directions.

### 3. Project ideas

Each idea is scored 1–5 on the three judging criteria. "Endeavor" means it is used as the orchestrator and/or node model. "SN" is the number of SuperNodes.

**1. FedPrompt: a federated self-improving query protocol**
- **Loop:** the orchestrator (Endeavor) writes an extraction protocol, i.e. instructions for the node agents. Each node runs it on its local, differently formatted data (reuse the 4-hospital CSV/MD/TXT demo). The node grades itself against a local answer key that never leaves, and returns only `{score, failure_category}`. The orchestrator rewrites the protocol and repeats for 3–5 rounds, which fits the 5-minute limit per run.
- **Memory:** each iteration can be one run in the series, with state kept in `context.state`, or driven by `start_automation`.
- **Demo:** a per-node accuracy curve rising across rounds, which is "FedAvg for prompts".
- **Scores:** Use of Flower 5 · Impact & Originality 5 · Demo 4 · Endeavor yes · 4 SN.
- **Risk:** keep the rounds short.

**2. Hop-by-hop recall tracer (supply chain; variant: cross-bank anti-money-laundering)**
- Nodes are a farm, a processor, a distributor and retailers.
- A contaminated lot ID starts the trace. Each node answers only "which downstream lot IDs, and which partner node, received this?" The orchestrator relays the next hop. This is multi-hop graph traversal, unlike Consortium's single fan-out.
- A deterministic gate stops the trace at a hop limit, and anything that leaves a node must match `^LOT-\d+$`.
- **Demo:** the trace path lights up on the SuperGrid node map (`--location`).
- **Scores:** Use of Flower 5 · Impact & Originality 5 · Demo 5 · Endeavor as the orchestrator/planner · 4–6 SN.

**3. Sovereign Model Jury / FlowerBench-lite**
- Each SuperNode holds private evaluation tasks and runs a different model through its own `FLWR_MODEL_API_ENDPOINT`: Flower API vs Nebius Kimi-K2.7-Code vs MiniMax-M3.
- The orchestrator (Endeavor) sends a shared task spec. Each node solves and grades locally and returns only pass/fail. The output is a leaderboard with no task leakage, the same idea as FlowerBench's "tasks stay in the org's environment".
- **Scores:** Use of Flower 4 · Impact & Originality 4 · Demo 4 · Endeavor yes · 3+ SN.
- **Risk:** using a different provider per node is unverified.

**4. Contract-net mutual aid (ICU surge transfer or disaster resources)**
- The orchestrator broadcasts a request, e.g. "ventilator bed plus paediatric cardiology within 200 km". Hospital nodes bid from private capacity files, each bid either `{bid, eta_bucket}` or a decline. The orchestrator ranks the bids.
- Then a deterministic safety policy runs (hard constraints) and a **human-approval gate** in Flower Chat. The award goes out as a second `push_messages` round.
- **Scores:** Use of Flower 5 · Impact & Originality 4 · Demo 5 · Endeavor as the orchestrator · 4 SN.

**5. Schema Harmonizer: the fastest path to a working demo**
- Built on the official 4-hospital repo. Node agents read their own format and propose a mapping to a common data model. The orchestrator spots conflicts (sex codes M/F vs Male/Female, "Drugs taking" vs "Current Medicines") and negotiates a canonical schema over rounds.
- Then it runs a validated federated aggregate, such as a small-cell-suppressed histogram of age by department.
- **Scores:** Use of Flower 5 · Impact & Originality 3 · Demo 5 · Endeavor optional · 4 SN.
- **Note:** a good base to extend into idea 1.

**6. Standing Watch: recurring federated pharmacovigilance**
- `start_automation` (bounded `max_runs`) re-queries hospital nodes on a schedule for adverse-event counts for a drug. `context.state` keeps the history. The orchestrator raises a signal when the disproportionality crosses a threshold.
- It adjusts its own threshold from clinician feedback given in the chat, which is the self-improvement part.
- **Scores:** Use of Flower 5 · Impact & Originality 4 · Demo 3 (time is hard to show live; pre-seed past runs) · Endeavor yes · 3–4 SN.

**7. Newsroom corroboration network**
- Several newsrooms each hold confidential source notes. The orchestrator asks a claim; each node returns `{corroborates: yes/no/partial, independence_class, confidence}` with no identities.
- Code enforces the independence rule "≥2 unrelated sources", and dissent stays visible.
- Adds a web_search/web_fetch public-record agent at the SuperLink.
- **Scores:** Use of Flower 4 · Impact & Originality 5 · Demo 4 · Endeavor yes · 3 SN.

**8. Cross-vendor incident postmortem**
- Cloud, CDN and SaaS nodes each hold private logs as files. The orchestrator asks timeline questions, and nodes return only timestamped event types.
- The orchestrator builds a causal timeline and sends follow-up questions to the node that is the "suspected root".
- **Scores:** Use of Flower 4 · Impact & Originality 3 (close to Pollen Mesh) · Demo 4 · Endeavor yes · 3 SN.

**Recommendation:** build 5 first as a working base, then add the loop from 1, or go straight to 2.
- Pitch a typed payload contract with no raw rows.
- Put deterministic gates in code: the orchestrator calls `agent.grid.call` directly.
- Treat an unanswered node (still in `pending_message_ids`) as UNKNOWN, never zero.
- Emit an event trace so the run is auditable.
- Publish to Hub with `flwr app publish`.

### Sources
- https://flower.ai/docs/agent/ (index, runtime, federations, first AgentApp, connectors, automations, SuperGrid/local SuperLink, Flower Hub pages)
- https://flower.ai/docs/agent/explanations/agentapp-runtime.html
- https://flower.ai/docs/agent/how-to-guides/create-automations.html
- https://flower.ai/docs/framework/ref-api/flwr.agentapp.AgentGrid.html
- https://github.com/flwrlabs/flower/blob/main/framework/py/flwr/supercore/task_process/agent/grid.py and `run_agentapp.py`, `connector/filesystem/filesystem.py`, `connector/registry_generated.py`; PRs #8143, #8166, #8181, #8193, #8209
- https://flower.ai/apps/flwrlabs/collaborative-agent
- https://github.com/jafermarq/flower-collaborative-agent-hackathon (README, compose.yaml, data/)
- https://flower.ai/blog/2026-09-22-announcing-flower-1.38-release (federated AgentApps, filesystem connector, SuperNode name/location)
- https://flower.ai/blog/2026-09-15-announcing-flower-1.37-release (`flwr chat /load`, `get_trace`, `/connector`)
- https://flower.ai/blog/2026-08-05-announcing-flower-1.33-release (`flwr chat` introduced)
- https://flower.ai/blog/2026-09-01-introducing-endeavor-1.0 ; https://flower.ai/docs/model/endeavor.html ; https://flower.ai/docs/model/endeavor-opencode.html
- https://flower.ai/blog/2025-09-25-flower-supergrid
- https://flower.ai/blog/2026-08-25-cambridge-agent-hackathon ; https://x.com/flwrlabs/status/2094497079574077584 (recap of the 16 Cambridge builds)
- https://www.linkedin.com/posts/flwrlabs_here-are-4-new-flower-hub-apps-that-you-can-activity-7507877081762914304-eUEM (Berlin apps)
- https://luma.com/flwrlabs-bamu (Stanford event page and judges)
- Forum posts (as captured in `docs/hackathon-brief.md`): Stanford post; Berlin/Cambridge judging criteria; Cambridge guide https://discuss.flower.ai/t/collaborative-agent-hackathon-cambridge-uk-2026/1269
- https://github.com/munibrahman-star/provenance-harness (a Cambridge project)
- https://flower.ai/apps (Hub listing)

### Unverified / open questions
- I could not download the `@flwrlabs/collaborative-agent` source: `flwr new` hung in this sandbox. It is unconfirmed whether the same FAB runs on both SuperLink and SuperNodes, and how a SuperNode AgentApp is launched when a message arrives. My skeleton infers the role from `agent.grid.tools()`.
- It is unconfirmed whether the SuperNode-side AgentApp gets `agent.connectors` tools other than `filesystem`, and whether calling `agent.grid.call()` directly (without a model-issued call) is officially supported. The source accepts it.
- Whether hackathon SuperGrid accounts or keys can use `flwrlabs/endeavor-1.0` through the runtime endpoint is not confirmed; Endeavor access is by request. Ask the mentors early.
- Using a different model provider per SuperNode, and how the SuperLink-side model is chosen on SuperGrid, are both inferred and not tested.
- How the 5-minute task timeout interacts with `pull_messages` (max 300 s) and with multi-round orchestration is unknown, and so is whether SuperNode tasks have separate timeouts. Plan for short rounds.
- I did not find winners or a blog recap for the Berlin event. The Stanford forum replies #2 and #3 were empty in the capture.
- Payload size limits for Grid messages were not found.