## Model access for the Flower Collaborative Agent Hackathon (Stanford, 2026-09-29): Endeavor, Flower API keys, Nebius, ARM/AMD

### 0. The hackathon's own brief is the main source
The organisers (user `dimitris`, Flower Labs) posted the day's reference page at **https://discuss.flower.ai/t/collaborative-agent-hackathon-stanford-ca-2026/1275** (raw text: `https://discuss.flower.ai/raw/1275`, last edited 2026-09-29 16:19 UTC). It covers:

- **Challenge ("Flower Agent Harness"):** show several Flower Agents working together on SuperGrid, for example an agent chain or several `AgentApp`s that share context and hand work to each other. "**Bonus points** if you use our recently released **Endeavor** model."
- **Templates:** `flwr new @flwrlabs/agent` (https://flower.ai/apps/flwrlabs/agent) and `flwr new @flwrlabs/collaborative-agent` (https://flower.ai/apps/flwrlabs/collaborative-agent). The second has Grid tools turned on so an agent can sample other agents in a federation, push messages to them and pull their replies. The multi-SuperNode reference demo is https://github.com/jafermarq/flower-collaborative-agent-hackathon.
- **Limits:** each SuperGrid task times out after **5 minutes**, counted from when it switches to `Running`. Credits are provided, and Flower staff can add more.
- **What to submit:** team form at https://flowerlabs.typeform.com/to/rQuplUGG, a published Flower Hub app, a short description and a GitHub link. Demos last 3–5 minutes.
- **Judging:** Use of Flower, Impact & Originality, Demo & Delivery.
- **Partners:** Nebius, ARM and AMD. Prizes go to the top 3, with a pool worth up to $5,000.
- **Slack:** `#hackathon_stanford_2026`. Join via https://flower.ai/join-slack.

---

### 1. Endeavor 1.0

**What it is.** Flower Labs released Endeavor 1.0 on 2026-09-01. It is a "frontier-class generalist" model aimed at reasoning, coding and long-horizon agent work. It is built on open-weight foundation models, then extended with continual pre-training, targeted post-training, Lizzy's UK-specific knowledge and FlowerBench enterprise evaluation signals. It is **not an open-weight release**. You can use it as a Flower-managed API or as a private deployment, and it is officially a "production-ready preview, by request". It follows Lizzy 7B.

| Property | Value (per docs) |
|---|---|
| Max context length | 1M tokens |
| Supplied Codex client config | 128,000-token window, auto-compaction at 96,000 |
| Reasoning effort levels | `low` (default), `medium`, `high`, `xhigh` |
| Input modalities | text only |
| Parallel tool calls | supported |
| Wire API | OpenAI **Responses** API (`/v1/responses`) |
| Benchmarks (Flower internal) | GPQA 92.0, HumanEval 98.2, IFEval 94.1, AIME 2026 99.9 |

**Which model ID to use depends on where you call it from:**

| Context | Model ID | Status |
|---|---|---|
| **Inside an AgentApp on SuperGrid** (through `FLWR_RUNTIME_BASE_URL`) | **`flower-endeavor-v1.0`** | Community-verified on SuperGrid, 2026-09-16 (Nici30067/FlowerApp `docs/verification.md`). The alias `flower-endeavor` also works and resolves to v1.0. **`endeavor-1.0` is rejected** with "not a valid model ID". At least four other hackathon repos use `flower-endeavor-v1.0`. |
| Direct call to `https://api.flower.ai/v1` (Codex / OpenCode guides) | `flwrlabs/endeavor-1.0` | Official docs (`model/docs/source/endeavor-chatgpt-codex.rst`, `_static/flower-models.json`) |
| Fallback that works on SuperGrid | `openai/gpt-5.6-sol` | Official docs default, and community-verified |

**Calling it inside an AgentApp** (official pattern from `agent/docs/source/how-to-guides/use-openai-sdk.md`; only the model string is changed):
```python
import os
from flwr.agentapp import AgentApp, AgentSession
from flwr.app import Context
from openai import OpenAI

MODEL = "flower-endeavor-v1.0"   # fallback: "openai/gpt-5.6-sol"
app = AgentApp()

@app.main()
def main(agent: AgentSession, context: Context) -> None:
    client = OpenAI(
        base_url=os.environ["FLWR_RUNTIME_BASE_URL"],   # injected by Flower
        api_key=os.environ["FLWR_RUNTIME_API_KEY"],     # injected by Flower
        max_retries=0,   # each request creates a Flower model task; retries would duplicate it
    )
    stream = client.responses.create(model=MODEL, input=agent.prompt, stream=True,
                                     reasoning={"effort": "low"})
    out = []
    for event in stream:
        agent.events.emit(event.to_dict())      # needed for Flower Chat / browser to render
        if event.type in {"error", "response.failed"}:
            raise RuntimeError(f"Model response failed: {event}")
        if event.type == "response.output_text.delta":
            out.append(event.delta)
    print("".join(out))
```
Requirements: `flwr>=<stable>,<2.0` and `openai>=2.16.0,<3.0.0`. The runtime accepts these request fields: `model`, `input`, `stream`, `tools`, `tool_choice`, `instructions`, `previous_response_id` (the Stanford team's notes also list `reasoning`, `max_output_tokens`, `metadata` and `text`). **The default provider at api.flower.ai does not support `previous_response_id`.** Rebuild `input` from `agent.events.get_trace()` instead.

**Performance notes from community measurements (verification.md, 2026-09-16):**
- Endeavor calls took about 7 s in a trivial check but **28–91 s** in real multi-step prompts. `openai/gpt-5.6-sol` took 3–13 s.
- With the 5-minute task timeout, use `reasoning effort = "low"`, allow at most 0–1 tool rounds, run calls concurrently, and set per-call timeouts around 120 s.
- Cost was about **500 credits per Endeavor plan-plus-replan cycle**, against about 60 on the fallback model. The same notes mention a **3000-credit sign-up grant**.
- Endeavor wrapped JSON in prose and code fences, so use a tolerant parser.

**Direct access outside SuperGrid** (Codex CLI, `~/.codex/config.toml`):
```toml
model = "flwrlabs/endeavor-1.0"
model_provider = "flower"
model_reasoning_effort = "low"
model_catalog_json = "/Users/YOU/.codex/flower-models.json"
[model_providers.flower]
name = "Flower Labs"
base_url = "https://api.flower.ai/v1"
wire_api = "responses"
env_key = "FLOWER_API_KEY"
```
For OpenCode, set provider `flower-labs` with `"npm": "@ai-sdk/openai"`, `baseURL: https://api.flower.ai/v1`, and run `opencode --model flower-labs/flwrlabs/endeavor-1.0`. The docs say the key needs Endeavor access; the request form is https://flowerlabs.typeform.com/to/jlniHsuy.

---

### 2. Flower model serving: `FLWR_MODEL_API_KEY`, OpenRouter-style names, where to get keys

- **Where to get the key:** on flower.ai, go to **Profile → Settings → API Keys**. This comes from the Stanford brief and the jafermarq README.
- **Model names:** the brief says "For the name of the model you can follow the **OpenRouter format**, e.g., `openai/gpt-5.6-sol`." Flower's own code uses `openai/gpt-5-nano` to generate conversation titles (`framework/py/flwr/superlink/servicer/control/conversation_title.py`).
- **Who needs the key:**
  - AgentApps on hosted SuperGrid do **not** need it. The runtime injects `FLWR_RUNTIME_BASE_URL` and `FLWR_RUNTIME_API_KEY`.
  - A **local SuperLink** does need it.
  - So does **your own SuperNode**, because agent tasks on the node call the model through the node's environment.

How the provider resolves the endpoint (source: `framework/py/flwr/supercore/task_process/model/provider.py`):
```python
DEFAULT_MODEL_API_ENDPOINT = "https://api.flower.ai/v1/responses"
api_key = os.getenv("FLWR_MODEL_API_KEY")        # sent as "Authorization: Bearer <key>"
responses_url = os.getenv("FLWR_MODEL_API_ENDPOINT")  # optional; MUST end with /responses
timeout = float(os.getenv("FLWR_MODEL_API_TIMEOUT", "180"))
# no endpoint + no key -> RuntimeError "Model API key is not set (FLWR_MODEL_API_KEY)."
```

Local SuperLink setup:
```bash
export FLWR_MODEL_API_KEY="<flower key>"      # uses https://api.flower.ai/v1/responses
# or any Open Responses-compatible endpoint:
export FLWR_MODEL_API_ENDPOINT="https://.../v1/responses"
uv run flower-superlink --insecure            # HTTP Control API on 127.0.0.1:8000
# ~/.flwr/config.toml
# [superlink.local-agent]
# address = "127.0.0.1:8000"
# insecure = true
export FLWR_CHAT_SUPERLINK=local-agent && uv run flwr chat   # then /load .
```

SuperNodes on SuperGrid, from the reference `compose.yaml` in jafermarq/flower-collaborative-agent-hackathon:
```yaml
image: flwr/supernode:1.39.0
command: [--superlink=fleet-supergrid.flower.ai:443, --auth-supernode-private-key=/keys/supernode-0, --allow-runtime-dependency-installation]
environment:
  FLWR_MODEL_API_KEY: ${FLWR_MODEL_API_KEY}
  FLWR_FILESYSTEM_ALLOWED_DIRS: /data/supernode-a
```
Register nodes with `uvx flwr login supergrid` and then `uvx flwr supernode register keys/supernode-0.pub supergrid --name="..." --location="lat,lon"`. Add them to a **deployment**-type federation; a simulation federation cannot take SuperNodes.

---

### 3. Nebius (main sponsor, supplying all compute)

**Token Factory endpoints for the event** (verbatim from the brief):

| Model | `FLWR_MODEL_API_ENDPOINT` | Model ID | API key |
|---|---|---|---|
| Kimi-K2.7-Code | `https://api.tokenfactory.tf-ca1.nebius.com/v1/responses` | `dedicated/flowerai/Kimi-K2.7-Code-1OUHWL` | Shared in Slack |
| MiniMax-M3 | `https://api.tokenfactory.tf-ca1.nebius.com/v1/responses` | `dedicated/flowerai/MiniMax-M3-OOLI9o` | Shared in Slack |

```bash
export FLWR_MODEL_API_ENDPOINT="https://api.tokenfactory.tf-ca1.nebius.com/v1/responses"
export FLWR_MODEL_API_KEY="<NEBIUS-API-KEY>"   # from #hackathon_stanford_2026
uv run flower-superlink --insecure             # restart SuperLink after switching endpoint
```
Then pass the matching model ID in the AgentApp, e.g. `model="dedicated/flowerai/MiniMax-M3-OOLI9o"`.

Background from the Nebius docs:
- The model IDs are dedicated-endpoint **routing keys** (use the `routing_key` as `model`).
- `tf-ca1` is one of Token Factory's `SupportedRegion` values, and dedicated endpoints use regional data-plane URLs.
- The API is OpenAI-compatible and supports `/v1/responses`, `/v1/chat/completions` and `/v1/models`.
- To check a key: `curl https://api.tokenfactory.tf-ca1.nebius.com/v1/models -H "Authorization: Bearer $KEY"`. This regional host is my assumption and was not tested.

**"Spinning up a Flower SuperNode on a Nebius Serverless AI endpoint"** (steps copied from the brief):
```bash
flwr login supergrid                                                   # browser: grant access to flower.ai
ssh-keygen -t ecdsa -b 384 -N "" -f nebius-supernode-key-1             # creates key + .pub
flwr supernode register nebius-supernode-key-1.pub supergrid
```
In the Nebius console, go to **Serverless AI → Endpoints → Create Endpoint** and fill in:

| Field | Value |
|---|---|
| Configuration | `Custom` |
| Image path | `docker.io/flwr/supernode:1.37.0-py3.12-ubuntu24.04` |
| Port / Protocol | `9092` / `TCP` |
| Entrypoint (single line) | `exec flower-supernode --superlink=fleet-supergrid.flower.ai:443 --auth-supernode-private-key=/tmp/nebius-supernode-key-1 --allow-runtime-dependency-installation` |
| Env vars / secret env vars | "Leave empty" (see the open questions below) |
| Bearer token auth | Off |
| Platform | `With GPUs, NVIDIA L40S` if the ClientApp needs a GPU; VM type `Regular`; preset `1 GPU - 8 CPUs - 32 GiB RAM` |
| Container disk | `250 GB` |
| Files | upload the private key `nebius-supernode-key-1`, mount it at `/tmp/nebius-supernode-key-1` |
| Network | `Public`, or a Private subnet with outbound NAT |

Check it with `flwr supernode list supergrid --verbose`; the node should show as online. Repeat the steps for each extra node, then add the nodes to your deployment federation, e.g. `flwr federation add-supernode <id> @<user>/<fed> supergrid`.

The Nebius CLI equivalent of the console form follows the pattern in https://docs.nebius.com/serverless/quickstart/endpoints. I have not tested this adaptation for Flower:
```bash
nebius ai endpoint create --name flwr-supernode-1 \
  --image docker.io/flwr/supernode:1.37.0-py3.12-ubuntu24.04 \
  --platform gpu-l40s-a --preset 1gpu-8vcpu-32gb --container-port 9092 --public --subnet-id "$SUBNET_ID" ...
```

---

### 4. ARM and AMD

- **Stanford:** the brief names "Nebius, ARM and AMD" as partners. The Luma judge list includes **Disha Patil (ARM)** and **Naveen Purushotham (AMD)**, alongside Nebius (Anastasia Raskolova, Daria Balashova), NVIDIA (Mehul Vani), Meta (Sai Nagabhairava) and Flower Labs (Daniel Nata Nugraha, Dimitris Stripelis). **I found no Stanford-specific ARM or AMD resources, tracks or prizes.** At this event, Nebius provides the compute.
- **AMD precedent (Cambridge, 2026-08-26, https://discuss.flower.ai/t/1269):** AMD hosted temporary Responses-compatible endpoints on **Instinct MI300X** for the "Infrastructure" track:

  | Model | Endpoint | Model ID |
  |---|---|---|
  | Qwen3.5 397B | `http://129.212.182.232:8001/v1/responses` | `/models/Qwen3.5-397B-A17B-FP8` (no key) |
  | Kimi-K2.7-Code | `http://134.199.193.245:8001/v1/responses` | `/models/Kimi-K2.7-Code` |
  | GLM-5.2 | `http://129.212.179.194:8001/v1/responses` | `glm-5.2-fp8` |
  | MiniMax-M3 | `http://165.245.135.52:8001/v1/responses` | `minimax-m3` |

  These were temporary for that day and are probably not live now.
- **ARM angle:**
  - Arm Developer Relations attended the earlier hackathon, and Cambridge prizes included ARM swag.
  - Flower has a long record of on-device and edge federated learning (the Arm-hosted paper "On-device federated learning with Flower"; EdgeFlowerTune on Arm Cortex/Snapdragon devices).
  - **Practical hook:** the `flwr/supernode` Docker images (`1.37.0-py3.12-ubuntu24.04` and `1.39.0`) ship both **`amd64` and `arm64`**, checked on Docker Hub. A SuperNode can therefore run on an Arm laptop (Apple Silicon), a Raspberry Pi or an Arm cloud VM next to local data, which suits a pitch about an edge or on-device collaborative agent.

---

### Sources
- https://discuss.flower.ai/t/collaborative-agent-hackathon-stanford-ca-2026/1275 (raw: https://discuss.flower.ai/raw/1275) — the main event brief
- https://discuss.flower.ai/t/collaborative-agent-hackathon-cambridge-uk-2026/1269 and https://discuss.flower.ai/t/collaborative-agent-hackathon-berlin-germany-2026/1273
- https://discuss.flower.ai/t/announcing-flower-1-39-0/1276
- https://flower.ai/events/collaborative-agent-hackathon-stanford-2026 and https://luma.com/flwrlabs-bamu
- https://flower.ai/models/endeavor and https://flower.ai/blog/2026-09-01-introducing-endeavor-1.0 and https://flower.ai/docs/model/
- GitHub flwrlabs/flower: `model/docs/source/{endeavor,endeavor-chatgpt-codex,endeavor-opencode}.rst`, `model/docs/source/_static/flower-models.json`, `agent/docs/source/how-to-guides/{use-openai-sdk,run-with-local-superlink}.md`, `agent/docs/source/explanations/agentapp-runtime.md`, `framework/py/flwr/supercore/task_process/model/provider.py`, `framework/py/flwr/superlink/servicer/control/conversation_title.py`
- https://github.com/jafermarq/flower-collaborative-agent-hackathon (README and `compose.yaml`)
- Community: https://github.com/Nici30067/FlowerApp (`docs/verification.md`), https://github.com/Stanford-Hackathon/Main-Repo (`research-agent/FLOWER_NOTES.md`, `campus-agent/FLOWER_GRID_NOTES.md`), Backooo/Soteria, NishankKS/PreventNet
- https://flower.ai/apps/flwrlabs/agent and https://flower.ai/apps/flwrlabs/collaborative-agent
- https://flower.ai/docs/framework/how-to-connect-supernodes-to-supergrid.html and https://flower.ai/docs/framework/how-to-run-flower-apps-on-supergrid.html
- Nebius: https://docs.tokenfactory.nebius.com/api-reference/inference/create-a-response, https://docs.tokenfactory.nebius.com/api-reference/examples/list-of-models, https://docs.tokenfactory.nebius.com/ai-models-inference/dedicated-endpoints/control-data-plane, https://docs.tokenfactory.nebius.com/api-reference/dedicated-endpoints/create-dedicated-endpoint, https://docs.nebius.com/serverless/quickstart/endpoints, https://docs.nebius.com/serverless/tutorials/deploy-model
- Nebius sponsorship: https://www.linkedin.com/posts/flwrlabs_nebius-is-joining-us-as-the-main-sponsor-activity-7508499654175678464-UFK1
- ARM/AMD: https://www.linkedin.com/posts/christian-jardine-008369118_really-enjoyed-attending-the-recent-flower-activity-7500502620906713088-Pwc6, https://developer.arm.com/cfs-file/__key/communityserver-blogs-components-weblogfiles/00-00-00-37-98/Akhil-Mathur-_2D00_-On_2D00_device-federated-learning-with-Flower.pdf, Docker Hub `flwr/supernode` tag metadata

### Unverified / open questions
1. **Endeavor model ID.** Official docs don't list the SuperGrid runtime ID. `flower-endeavor-v1.0` comes only from community test runs on 2026-09-16. It is also unclear whether `flwrlabs/endeavor-1.0` works through the SuperGrid runtime, or whether `flower-endeavor-v1.0` works when a local SuperLink calls api.flower.ai with `FLWR_MODEL_API_KEY`. Ask Flower staff or Slack to confirm the ID for the day.
2. **Endeavor access for hackathon keys.** The docs say Endeavor needs a key with Endeavor access, requested through the form. It is unverified whether a regular Profile → Settings → API Keys key, or hackathon allow-listing, grants Endeavor on SuperGrid or api.flower.ai. Community teams did use it on SuperGrid.
3. **Is api.flower.ai an OpenRouter proxy?** Only suggested by the OpenRouter-style names and the OpenRouter-style "not a valid model ID" error. There is no full list of available models; the only names confirmed to work are `openai/gpt-5.6-sol`, `openai/gpt-5-nano` and `flower-endeavor-v1.0`.
4. **Model access for a SuperNode on Nebius.** The Nebius form says to leave env vars empty, but the reference compose sets `FLWR_MODEL_API_KEY` on every SuperNode, and the provider code raises an error without a key or endpoint. If agents on the Nebius node call a model, you probably need to add `FLWR_MODEL_API_KEY` (and optionally `FLWR_MODEL_API_ENDPOINT`) as secret env vars. Not tested.
5. **Image version.** The Nebius guide pins `flwr/supernode:1.37.0`, while the compose file and current release are 1.39.0. Version skew between SuperNode, CLI and SuperGrid has not been tested.
6. **Nebius CLI command.** Not tested for Flower. Also unconfirmed whether a Serverless endpoint must expose port 9092 at all, since the SuperNode only makes outbound connections to `fleet-supergrid.flower.ai:443`.
7. **Nebius Token Factory endpoints.** The `dedicated/flowerai/...` IDs, tf-ca1 `/v1/responses` support for these models and their tool-calling behaviour were not called live, because the key is shared only in Slack. It is also unknown whether a hosted SuperGrid run can be pointed at Nebius, or only a local SuperLink or your own SuperNode.
8. **ARM/AMD at Stanford.** No Stanford-specific ARM or AMD tracks, prizes, hardware or endpoints were found. The Cambridge AMD MI300X endpoints are almost certainly offline.
9. **Credits.** The 3000-credit sign-up grant and the per-run costs come from one community log. The hackathon credit amounts were not published.