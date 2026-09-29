## Publishing to Flower Hub, the Stanford hackathon, and past Flower hackathons

### 1. Publishing an AgentApp to Flower Hub

**Primary docs**
- AgentApp guide (targets Flower 1.39.0): https://flower.ai/docs/agent/how-to-guides/use-flower-hub.html#publish-your-agentapp. The Stanford hackathon post links to this page for submissions.
- General Hub publish rules: https://flower.ai/docs/hub/how-to-publish-app-on-hub.html (Flower Hub docs 0.2.0)
- FAB format version: https://flower.ai/docs/hub/fab-format-version.html
- Signing and verification after you publish (optional): https://flower.ai/docs/hub/how-to-sign-hub-apps.html

**`pyproject.toml` (from the agent docs)**
```toml
[project]
name = "hello-agent"                 # becomes part of the app spec @publisher/name; cannot be changed after the first publish
version = "0.1.0"
description = "Answer questions with a Flower AgentApp"   # required and non-empty; you get a warning above 200 chars
license = { file = "LICENSE" }       # with fab-format-version = 1 it must be LICENSE or LICENSE.md at the root
dependencies = ["flwr>=1.39.0,<2.0", "openai>=2.16.0,<3.0.0"]

[tool.flwr.app]
publisher = "your-username"          # must match the Flower account you logged in with
display-name = "Hello Agent"
fab-format-version = 1
flwr-version-target = "1.39.0"       # must satisfy the flwr lower bound (which must be inclusive)

[tool.flwr.app.components]
agentapp = "hello_agent.agent_app:app"   # this line is what marks the project as an AgentApp; no tag is needed
```
The official `@flwrlabs/collaborative-agent` v0.2.0 also sets `color = "emerald"`, `requires-python = ">=3.11,<4.0"` and `fab-include = ["agent/**/*.py", "LICENSE"]`, with `publisher = "flwrlabs"` and `display-name = "Clinical Analytics Agent"`. I got this file by downloading the app's zip from the Hub API (see below).

**Commands**
```bash
uv sync
uv run flwr build                 # local check; prints the path of the .fab it builds
uv run flwr login supergrid       # opens a browser; needs the connection superlink.supergrid -> api.flower.ai, present by default
uv run flwr app publish .         # uploads project sources; the Hub builds the FAB on the server
# The app is then live at: https://flower.ai/apps/<publisher>/<project-name>/
# New version: bump [project].version, then run flwr build and flwr app publish . again
```

**Upload rules (docs, confirmed in `flwrlabs/flower` source at `framework/py/flwr/cli/app_cmd/publish.py`)**
- Only these files are uploaded: `**/*.py, *.toml, *.md, *.yaml, *.yml, *.json, *.jsonl`, the root `.gitignore`, `.editorconfig`, and root `LICENSE` / `LICENSE.md`. HTML, CSS, JS, PNG and CSV are skipped, so a web UI will not ship to the Hub.
- `.flwr/**` and `__pycache__` are always excluded, and `.gitignore` is applied after that. Every skipped file is printed as `Skip: ...`.
- Limits: at most 1,000 files, 1 MB per file, 10 MB in total, and every file must be UTF-8. Files more than 10 directory levels deep are not collected.
- **The directory name is validated too.** The code calls `_validate_app_name(app.name, "Flower App directory name")`, so the folder must start with a letter and contain only letters, digits and hyphens. A folder named `my_agent` fails.
- Upload endpoint: `POST https://api.flower.ai/v1/hub/apps/publish`. If you are not logged in you get "Please log in before publishing app."
- There is no confirmation prompt. The `Attach:` lines are printed as the files go up, and **everything uploaded is public**. Remove API keys, `.env` files and private data first.
- **Published apps cannot be deleted.** An app ID cannot switch between Agent and Federated types.
- From the README of Cambridge winner `@i53n1/consortium`: "Hub rejects a bundle carrying both surfaces (422)." Declare only `agentapp` in `[tool.flwr.app.components]`, not a `serverapp` as well.
- Troubleshooting list in the docs: not logged in, publisher mismatch, missing description, required file skipped by `.gitignore`, or the component can't be loaded (check the `agentapp` module path).

**Getting other apps' code**
- `flwr new @publisher/app` downloads an app. It calls `POST https://api.flower.ai/v1/hub/fetch-zip` with body `{"app_id":"@flwrlabs/collaborative-agent","app_version":null,"flwr_version":"1.39.0"}`, which returns a `zip_url` on S3. I called this directly with curl and it worked without logging in.
- `@flwrlabs/endeavor-agent` v0.2.2 (description "Chat with Flower Endeavor") uses **model ID `flwrlabs/endeavor-1.0`** (`_MODEL` in `endeavor_agent/workflow.py`). That is the string to use for the Endeavor bonus.
- `@flwrlabs/collaborative-agent` uses `MODEL = "openai/gpt-5.6-terra"` in `agent/utils.py`.
- Endeavor docs: https://flower.ai/docs/model/endeavor.html. Endeavor 1.0 is described as a "frontier-class generalist" preview with a context window of up to 1M tokens. Outside the hackathon, access is by request.

### 2. The event: Collaborative Agent Hackathon, Stanford, 2026-09-29

**Main post:** https://discuss.flower.ai/t/collaborative-agent-hackathon-stanford-ca-2026/1275 (topic 1275, posted by `dimitris` on 2026-09-25). Luma page: https://luma.com/flwrlabs-bamu (430 going).

- **Time and place:** 9:30 am to 7:30 pm, 389 Jane Stanford Way, W450 Simonyi Center.
- **Forum schedule:** 10:15 Flower Agent technical demo · 10:30 team formation and hacking starts · 12:30 lunch · 13:00 build · **16:30 demo prep and submission reminder** · **17:15 demos** · 18:00 dinner · 18:45 awards · 19:30 finish. Luma shows an older schedule with demos at 5:30, so use the forum times.
- **Challenge ("Flower Agent Harness"):** "Showcase the collaborative aspect of Flower Agents running on SuperGrid… multiple Flower Agents can work together… agent chain… or multiple `AgentApp`s that share context and hand work between agents. Bonus points if you use our recently released Endeavor model."
- **Templates:** https://flower.ai/apps/flwrlabs/agent (receives the prompt plus earlier user and assistant turns) and https://flower.ai/apps/flwrlabs/collaborative-agent (Grid tools to sample other agents in a federation, send them messages and retrieve responses). Multi-SuperNode demo repo: https://github.com/jafermarq/flower-collaborative-agent-hackathon.
- **What that repo contains:** 4 SuperNodes representing hospitals, each with synthetic `patient_data` in a different format (CSV, CSV, MD, TXT), started with `docker compose` (image `flwr/supernode:1.39.0`, `--superlink=fleet-supergrid.flower.ai:443`, `--auth-supernode-private-key=/keys/supernode-N`, `--allow-runtime-dependency-installation`, env `FLWR_MODEL_API_KEY` and `FLWR_FILESYSTEM_ALLOWED_DIRS=/data/supernode-x`).
  - Key generation: `ssh-keygen -t ecdsa -b 384 -N "" -C "supernode-$i" -f "keys/supernode-$i"`
  - Registration: `uvx flwr supernode register keys/supernode-0.pub supergrid --name="..." --location="lat,lon"`
  - Then create a federation of type `deployment` and add the SuperNodes to it.
- **Model environment variables:**
  - Flower AI: `export FLWR_MODEL_API_KEY=...`. Get the key at flower.ai → Profile → Settings → API Keys. Model names follow the OpenRouter format, e.g. `openai/gpt-5.6-sol`.
  - Nebius Token Factory: `FLWR_MODEL_API_ENDPOINT="https://api.tokenfactory.tf-ca1.nebius.com/v1/responses"`. The key is shared in Slack.
  - Nebius models: `dedicated/flowerai/Kimi-K2.7-Code-1OUHWL` and `dedicated/flowerai/MiniMax-M3-OOLI9o`.
- **SuperNode on Nebius Serverless AI:**
  - Run `flwr login supergrid`, then `ssh-keygen -t ecdsa -b 384 -N "" -f nebius-supernode-key-1`, then `flwr supernode register nebius-supernode-key-1.pub supergrid`.
  - Create the endpoint under Serverless AI → Endpoints → Create Endpoint (Custom), image `docker.io/flwr/supernode:1.37.0-py3.12-ubuntu24.04`, port 9092 TCP.
  - Entrypoint, entered as a single line: `exec flower-supernode --superlink=fleet-supergrid.flower.ai:443 --auth-supernode-private-key=/tmp/nebius-supernode-key-1 --allow-runtime-dependency-installation`
  - Upload the private key as a file mounted at `/tmp/nebius-supernode-key-1`. Suggested machine: L40S, 1 GPU, 8 CPUs, 32 GiB RAM, 250 GB disk, public endpoint.
  - Check it is online with `flwr supernode list supergrid --verbose`.
- **What to submit before demos:**
  1. Team details through the Typeform https://flowerlabs.typeform.com/to/rQuplUGG. Its title is "(Team Formation) | Team Registration". Fields: Team Name, then Full Name and **Flower Username** for each member. Members 1–3 are required and 4–5 optional.
  2. A published Flower Hub app.
  3. A short project description.
  4. A GitHub repo link.

  Only the team details go through the form. The forum post does not say where items 2–4 are submitted.
- **Demo:** 3–5 minutes plus judges' questions. Focus on how Flower Agent and SuperGrid enable the solution, the problem, and the working result.
- **Judging:** Use of Flower (how much the project uses Flower Agents and SuperGrid), Impact & Originality, and Demo & Delivery. "Agent performance may inform the assessment, but it is not the sole or decisive factor."
- **Prizes and people:** top 3 projects share a pool of up to $5,000. Partners are Nebius, ARM and AMD. Judges listed on Luma:
  - Anastasia Raskolova (Nebius)
  - Daria Balashova (Nebius)
  - Disha Patil (ARM)
  - Naveen Purushotham (AMD)
  - Mehul Vani (Nvidia)
  - Sai Nagabhairava (Meta)
  - Daniel Nata Nugraha (Flower Labs)
  - Dimitris Stripelis (Flower Labs)
- **FAQ (quoted):**
  - Team size: "We recommend teams of 3–5 people". Luma, the Typeform and earlier events say 2–4.
  - Questions: walk up to any Flower Labs team member.
  - Credit limit on SuperGrid: "Yes. We will ensure that you have sufficient credits… Speak to any member of the Flower Labs team if you think you will need additional credits."
  - Time limit: "Yes. Each task has a **5-minute timeout**, starting from when the task switches to the Running status."
  - Feedback: use the "Share feedback" icon on SuperGrid, post in #hackathon_stanford_2026, or tell the Flower Labs team.
- **Slack:** join at https://flower.ai/join-slack, then the channel **#hackathon_stanford_2026**. It is used for announcements, support and API keys.
- **Before arriving:** have your Flower account username ready (it is used for SuperGrid allow-listing) and install uv.
- **Warmup docs:**
  - https://flower.ai/docs/agent/tutorials/quickstart.html
  - https://flower.ai/docs/agent/tutorials/get-started-with-flower-agent.html (Flower Chat)
  - https://flower.ai/docs/agent/tutorials/write-your-first-agentapp.html
  - https://flower.ai/docs/agent/how-to-guides/run-on-supergrid.html
  - https://flower.ai/docs/agent/how-to-guides/run-with-local-superlink.html
  - https://flower.ai/docs/agent/explanations/use-connectors.html

### 3. Past Flower hackathons and what did well

**Cambridge, 2026-08-26** (https://discuss.flower.ai/t/collaborative-agent-hackathon-cambridge-uk-2026/1269; blog https://flower.ai/blog/2026-08-25-cambridge-agent-hackathon)
- Two tracks: SuperGrid, and Infrastructure (local SuperLink with AMD MI300X endpoints).
- The criteria also included Technical execution and "Safety and oversight".
- Recipes: `@flwrlabs/hackathon-collab-agent-recipe` and `@flwrlabs/hackathon-ollama-agent-recipe`.
- Winners (Flower Labs LinkedIn, 2026-08-28):
  - **1st, Axomic, "Consortium"** (`@i53n1/consortium`): organisations that cannot pool their data exchange anonymised "attestations" instead of records. A coordinator finds the coverage gap and broadcasts it, and each agent re-checks its own data locally. The team was praised for being honest about what was built versus planned. Its README is a good model: it runs on the Hub through `flwr chat`, has a local 3-node simulation, uses a Makefile, caches responses, and lists what is not built.
  - **2nd, PyroGuard, "Crisis Command":** three roles (interpret, plan, safety check). The demo showed a plan being rejected at 15% fuel reserve, revised to 25%, and approved. "AI proposes. Safety decides."
  - **3rd, Mustafa A., "Mizan Grid"** (`@mr-mustafa7/mizan-grid`): multi-hospital clinical-trial feasibility where patient records stay local. It flags patients who are one missing fact away from eligibility.
  - Honourable mention: Tanveer Singh, probably `@tanveer/pollen-mesh-agent`, which does cross-organisation threat correlation using hashed signatures.

**Berlin, 2026-09-16** (https://discuss.flower.ai/t/collaborative-agent-hackathon-berlin-germany-2026/1273)
- Criteria: Impact, Innovation, Use of Flower, Technical execution, Demo, Safety/oversight.
- Prizes: AirPods Pro 3, Sonos Roam 2, AeroPress.
- Flower highlighted 4 Hub apps from the event: Soteria (freight damage), collaborative lab analysis (probably `@apsal/cohortlens-agent`), drone survivor detection (`@kariminem/swarm-sar-commander`) and BloomKit (lyrics and music).
- Other Berlin apps on the Hub:
  - `@tauska67/osm-travel-companion`
  - `@krithman/program-committee-review`
  - `@philiphimmeroeder/airlock` ("policy gate for collaborative agents")
  - `@tauska67/agentapp-builder` (Endeavor agents that generate and validate AgentApps)
  - `@julianp/GrwFlwr` (farm watering using an FL model plus weather data)
  - `@sultan361/brand-dna-agent`
  - `@marykor/fusion-investigator`

**Decentralized AI Hackathon, Stanford, 2025-09-26** (classic federated learning; https://flower.ai/blog/2025-10-22-decentralized-hackathon-sf-winners)
- Winners: AICONTROLLER (an LLM CLI that runs and refines Flower FL runs), FedLLM Studio, FedReRank (federated RAG reranking, BioASQ), poultry disease detection with federated ViT, Dermacheck (a mobile skin-lesion app), and HTJ2K streaming FL.
- ResearchGrid limits then: 15-minute TTL per run and 5 concurrent runs.

**Patterns across winners:**
- Data-sovereignty problems (healthcare, legal and compliance, joint bids) where agents share judgements or attestations rather than raw records.
- An explicit safety or human gate, and a demo moment where it blocks something.
- Specialist roles plus a coordinator or referee.
- Honest scoping of what is built versus planned.
- A published Hub app that runs through `flwr chat`.
- Health and clinical use cases are the most common.

Agent-type apps from the Aug 26 and Sep 16 events can be listed from the `__NEXT_DATA__` JSON on https://flower.ai/apps/ (191 apps, 49 of them `agentapp`).

### Sources
- https://discuss.flower.ai/t/collaborative-agent-hackathon-stanford-ca-2026/1275 (read via the Discourse `.json` endpoint)
- https://discuss.flower.ai/t/collaborative-agent-hackathon-berlin-germany-2026/1273
- https://discuss.flower.ai/t/collaborative-agent-hackathon-cambridge-uk-2026/1269
- https://discuss.flower.ai/t/decentralized-ai-hackathon-stanford-2025/1109
- https://luma.com/flwrlabs-bamu
- https://flowerlabs.typeform.com/to/rQuplUGG
- https://flower.ai/docs/agent/how-to-guides/use-flower-hub.html
- https://flower.ai/docs/hub/how-to-publish-app-on-hub.html
- https://flower.ai/docs/model/endeavor.html
- https://github.com/jafermarq/flower-collaborative-agent-hackathon (README, compose.yaml)
- https://github.com/flwrlabs/flower: `framework/py/flwr/cli/app_cmd/publish.py`, `cli/new/new.py`, `cli/utils.py`, `supercore/constant.py`, `supercore/utils.py`
- `https://api.flower.ai/v1/hub/fetch-zip` (zips of `@flwrlabs/endeavor-agent` and `@flwrlabs/collaborative-agent`)
- https://flower.ai/apps/ and https://flower.ai/apps/i53n1/consortium/
- https://flower.ai/blog/2026-08-25-cambridge-agent-hackathon
- https://flower.ai/blog/2025-10-22-decentralized-hackathon-sf-winners
- https://www.linkedin.com/posts/flwrlabs_were-excited-to-present-the-winners-and-activity-7498998345164603392-5lHv
- https://www.linkedin.com/posts/flwrlabs_here-are-4-new-flower-hub-apps-that-you-can-activity-7507877081762914304-eUEM
- https://flower.ai/events/collaborative-agent-hackathon (this is the Cambridge event page, not Stanford)

### Unverified / open questions
- **Berlin winners:** not found in any source I could reach.
- **Where the Hub app, description and GitHub link are submitted:** the Typeform only collects team names and Flower usernames. It may be announced in Slack.
- **Team size conflict:** the forum FAQ says 3–5, while Luma says 2–4. The Typeform requires 3 members and allows 5.
- **Specific credit amounts:** not published.
- **Endeavor access:**
  - Model ID `flwrlabs/endeavor-1.0` is confirmed from app source.
  - It is unconfirmed whether a hackathon participant's `FLWR_MODEL_API_KEY` can call Endeavor without a separate access request. Endeavor is "by request" outside the event.
  - The Endeavor blog URL `/blog/2026-09-01-introducing-endeavor-1` returned 404.
- **Flower versions:** the docs target Flower 1.39.0 and the demo repo uses the `flwr/supernode:1.39.0` image, but the Nebius instructions use `1.37.0-py3.12-ubuntu24.04`. I did not check whether mixed versions cause problems.
- **The 422 rejection:** "a bundle with both `agentapp` and `serverapp` gets 422" comes from a third-party README, not official docs.
- **PyroGuard's Hub ID:** not identified.
- **Honourable mention:** that it was `@tanveer/pollen-mesh-agent` is inferred from the name only.
- **The `@flwrlabs/endeavor-agent` Hub page:** its README shows pytest-cache boilerplate, so the Hub page itself explains little.