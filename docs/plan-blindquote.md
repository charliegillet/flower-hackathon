# BlindQuote: Implementation Plan

> **Shop every lender without becoming a lead.** Your agent collects sealed, negotiated mortgage quotes from competing banks. Each bank sees only verified *bands* of your finances, never exact numbers, and never sees the other banks' bids.

Flower Collaborative Agent Hackathon, Stanford, 2026-09-29. Background research is in `research.md`; the API details come from `research-raw/templates.md`.

---

## 1. The optimized idea

### Why it matters (verified)
- **Shopping around saves money.** Borrowers who get one extra quote save $966–$2,086; with five quotes the average saving is about $2,914 ([Freddie Mac](https://freddiemac.gcs-web.com/news-releases/news-release-details/freddie-mac-april-2018-insight)). Shopping saved about 20 basis points in 2022 ([NMP](https://nationalmortgageprofessional.com/news/66769/freddie-buyers-better-shop-around)).
- **People skip shopping because their data gets sold.** Congress banned mortgage "trigger leads" in the [Homebuyers Privacy Protection Act](https://www.congress.gov/bill/119th-congress/house-bill/2808) (signed 2025-09-05, effective 2026-03-05).
- **Banks already price in bands.** The [Fannie Mae LLPA matrix](https://singlefamily.fanniemae.com/media/9391/display) grids price by credit-score band × loan-to-value (LTV) band. So quoting from bands is realistic, not a demo shortcut.

### Changes from the original version

| Original | Optimized | Why it scores |
|---|---|---|
| The user sends their finances to banks | The **borrower node computes bands on the user's own machine**. Only bands leave it. | The privacy claim becomes true and demonstrable. |
| Privacy protects the user only | **Two-sided privacy**: banks keep their rate sheets, margins and floors local, and never see each other's bids | A genuine federation problem, not a website |
| Banks must trust the user's claims | A **bureau node attests to the credit band** with a signature banks can verify. The raw score never leaves the bureau. | Three kinds of agents collaborate |
| Ask once, pick the lowest rate | **Two sealed-bid rounds**. In round 2 each bank hears only the best competing *total cost* and may reprice down to its private floor. | Real multi-agent strategy with visible tension |
| "Best rate" | **Lowest total cost over your stay horizon** (points + fees + interest), plus an **APR bait check** | The agent reasons over trade-offs, which an API can't |
| No safety story | A **code-enforced guard**: blocks any non-band data, blocks banks asking for more, and clamps prices at the bank's floor. **The AI proposes; code decides.** | A clear gate moment for the demo, which past winners had |
| — | A **disclosure ledger** shown at the end: what each party learned and never learned | Makes the privacy visible to judges |

### Topology (one app bundle; the role is set per node)

```
 flwr chat / flower.ai/app
   "Best 30-yr fixed for a $850k house, staying ~7 years"
                 │
   ┌─────────────▼──────────────────────────────┐
   │ COORDINATOR (SuperLink on SuperGrid)       │  model: flwrlabs/endeavor-1.0
   │ neutral broker; never sees raw numbers     │  (fallback openai/gpt-5.6-sol)
   │ get_nodes → push_messages → pull_messages  │
   └──┬──────────┬───────────┬──────────┬───────┘
      │          │           │          │
 ┌────▼───┐ ┌────▼────┐ ┌────▼───┐ ┌────▼───┐ ┌────────┐
 │BORROWER│ │ BUREAU  │ │ BANK A │ │ BANK B │ │ BANK C │ (+ BANK D "greedy")
 │profile │ │credit   │ │rate    │ │rate    │ │rate    │
 │.json   │ │files    │ │sheet + │ │sheet + │ │sheet + │
 │→ bands │ │→ signed │ │floor   │ │floor   │ │floor   │
 │        │ │  band   │ │Endeavor│ │Nebius  │ │Nebius  │
 └────────┘ └─────────┘ └────────┘ │Kimi    │ │MiniMax │
                                   └────────┘ └────────┘
```

### Flow of one run (target: under 2 minutes, well inside the 5-minute task timeout)
1. `get_nodes` returns names and locations. The coordinator groups nodes by role.
2. **Borrower node:** reads `profile.json` and returns bands for LTV, debt-to-income (DTI), loan amount, and occupancy. It also returns a one-time applicant token (a random nonce, not a person ID).
3. **Bureau node:** receives the token, looks up the synthetic credit file, and returns `{"fico_band": "740-759", "sig": HMAC(bureau_key, band|token)}`.
4. **Round 1, sent to all banks in parallel:** bands plus the attestation. Each bank verifies the signature, then applies its private rate sheet deterministically (base + LLPA grid + margin + overlays). Its model writes the offer terms (points vs rate options). Code clamps every number to the rate sheet.
5. **Guard moment:** Bank D's persona asks for `exact_income` and `assets`. The guard rejects the request and records it in the ledger. Bank D must quote on bands only or withdraw.
6. **Round 2:** each bank gets only "best competing total cost = $X". Its model decides whether to reprice; code enforces the floor. Some banks improve, some decline.
7. **Coordinator:**
   - ranks offers by total cost over the horizon, recomputes each APR, and flags any that differ by more than 0.125%;
   - pulls the market average from Freddie Mac PMMS via `web_fetch` for context;
   - streams the result table, a savings figure versus a single-bank quote, and the disclosure ledger.
8. **Optional:** `start_automation` re-runs the quote every Monday for three weeks and alerts if total cost drops by $2k or more (useful before a rate lock).

### What is shared and what is never shared

| Party | Receives | Never receives |
|---|---|---|
| Bank | LTV, DTI, loan-amount and occupancy bands; attested FICO band; best competing *total cost* (round 2) | Exact income, assets, name, exact score, other banks' identities or quotes |
| Bureau | A one-time token | Loan details, which banks are bidding |
| Coordinator (SuperGrid) | Bands, quotes | Raw profile, raw credit file, bank rate sheets and floors |
| Borrower | Every quote plus the ledger | Bank floors and margins |

---

## 2. Credentials and access needed

| # | What | Who | Where to get it | Where it's used | Status |
|---|---|---|---|---|---|
| 1 | **Flower account** with Flower Agent access, **allow-listed for SuperGrid** | Every team member | flower.ai sign-up. Give your username to organizers at check-in. | `flwr login supergrid` (browser OAuth; the CLI stores the token) | **Required** |
| 2 | **Flower API key** | At least one member | flower.ai → Profile → Settings → API Keys | `FLWR_MODEL_API_KEY` on SuperNodes that use Flower-served models (Endeavor), and for local SuperLink development | **Required** |
| 3 | **Endeavor access** for `flwrlabs/endeavor-1.0` | Team | Ask a mentor; outside the event it's preview by request | Coordinator model and Bank A's model | Verify at 10:30. Fall back to `openai/gpt-5.6-sol`. |
| 4 | **Nebius Token Factory API key** | Team | Posted in Slack #hackathon_stanford_2026 | `FLWR_MODEL_API_ENDPOINT=https://api.tokenfactory.tf-ca1.nebius.com/v1/responses` + `FLWR_MODEL_API_KEY` on Bank B and Bank C nodes (models `dedicated/flowerai/Kimi-K2.7-Code-1OUHWL`, `dedicated/flowerai/MiniMax-M3-OOLI9o`) | Strongly recommended (partner points, and different models per bank) |
| 5 | **SuperNode keypairs**, one per node (6) | We generate them | `ssh-keygen -t ecdsa -b 384 -N "" -f keys/<node>` → `flwr supernode register keys/<node>.pub supergrid --name=... --location=...` | `--auth-supernode-private-key` in `compose.yaml` | **Required.** SuperNode registration may need extra entitlement, so ask a mentor. |
| 6 | **Deployment federation** | Team lead | `flwr federation ...` in the CLI or SuperGrid UI. It must be type `deployment`; simulation federations can't hold SuperNodes. | Add every member and all 6 SuperNodes | **Required** |
| 7 | **Bureau attestation HMAC key** (our own) | We generate it | `python -c "import secrets;print(secrets.token_hex(32))" > secrets/bureau.key` | Mounted into the bureau and bank containers only | Required. **gitignored, never published to the Hub.** |
| 8 | **GitHub** repo plus push access | Team | Already set up: `charliegillet/flower-hackathon` | Submission link | Have it |
| 9 | Nebius cloud account (Serverless AI) | Optional | Nebius console / credits from organizers | Host one bank SuperNode in the cloud (L40S endpoint, image `flwr/supernode:1.37.0-py3.12-ubuntu24.04`; check version skew) | Stretch |

**Not needed:** an OpenAI API key (SuperGrid injects `FLWR_RUNTIME_BASE_URL`/`FLWR_RUNTIME_API_KEY` inside the AgentApp), or the Slack/Notion/GitHub/Attio connectors (personal workspace only, and rejected in collaborative federations).

**Tools to install:** `uv`, Python 3.11 or newer, Docker Desktop (for the SuperNodes), and `flwr==1.39.0` (`uvx --from flwr==1.39.0 flwr --version`).

**Secret hygiene:**
- `keys/`, `secrets/` and `.env` go in `.gitignore`.
- `fab-include = ["blindquote/**/*.py", "LICENSE"]` keeps data and keys out of the bundle.
- Publishing is public, has no confirmation prompt, and can't be undone. Run `git status` and review the file list before `flwr app publish`.

---

## 3. Project layout

```
blindquote/                         # directory name: letters/digits/hyphens only
├── pyproject.toml                  # agentapp = "blindquote.agent_app:app", publisher = <username>
├── LICENSE  README.md  .gitignore
├── blindquote/
│   ├── agent_app.py                # @app.main(): dispatch on role (SuperLink → coordinator; node_config["role"])
│   ├── grid.py                     # thin wrappers: get_nodes/push/pull via agent.grid.call(dict); FakeGrid for tests
│   ├── protocol.py                 # message schemas + ALLOWLIST guard (reject unknown/raw fields → ledger)
│   ├── pricing.py                  # rate-sheet eval, P&I, total cost over horizon, APR recompute, floor clamp
│   ├── attest.py                   # HMAC sign/verify for bureau bands
│   ├── ledger.py                   # disclosure ledger (who learned what)
│   ├── emit.py                     # emit markdown progress lines / final table as text deltas
│   └── roles/
│       ├── coordinator.py          # orchestration, rounds, ranking, Endeavor narrative, web_fetch PMMS
│       ├── borrower.py             # profile → bands + token
│       ├── bureau.py               # token → signed FICO band
│       └── bank.py                 # verify → price → LLM terms/strategy → clamp → reply
├── data/                           # synthetic, per node (mounted; NOT in FAB)
│   ├── borrower/profile.json
│   ├── bureau/credit_files.json
│   └── bank-{a,b,c,d}/rate_sheet.json   # base, LLPA subset, margin, floor, overlays, persona
├── scripts/gen_rate_sheets.py      # builds sheets from this week's PMMS + Fannie LLPA subset
├── compose.yaml                    # 6 SuperNodes, per-node env + --node-config role/model/data
├── tests/                          # offline: pricing, guard, attestation, full flow on FakeGrid
└── keys/ secrets/                  # gitignored
```

**Role dispatch.** One bundle runs everywhere:
- The SuperLink task sees only `get_nodes`, `push_messages` and `pull_messages`, so it's the coordinator.
- A SuperNode task sees `push_reply_message` and reads `context.node_config["role"]` (`borrower | bureau | bank`), plus `model` and `data_dir`.
- Pass these per node with `--node-config 'role="bank" name="Cardinal Bank" model="..." data_dir="/data/bank-a"'`.

**Direct grid calls, not model-driven.**
- Call `agent.grid.call({"type":"function_call","call_id":..,"name":"push_messages","arguments":{...}})` from code. Other teams have used this pattern.
- Routing stays deterministic and fast; the models only negotiate and explain.
- Nodes reply exactly once per message with `push_reply_message`.
- Nodes are stateless, so every round-2 message carries the bank's own round-1 offer.

---

## 4. Implementation plan

Team roles (for 2–4 people):
- **A: Infra.** SuperNodes, federation, compose.
- **B: Coordinator.** Rounds, ranking, output.
- **C: Nodes.** Bank, bureau, borrower, guard.
- **D: Data & demo.** Rate sheets, script, README, pitch.

With two people, pair A+D and B+C.

### Phase 0: Access and credentials (10:30–11:00) · everyone
1. Confirm SuperGrid allow-listing: `uvx --from flwr==1.39.0 flwr login supergrid`, then `flwr federation list supergrid`.
2. Get the Nebius key from Slack. Create a Flower API key.
3. **Ask mentors three questions:**
   - Does our key reach `flwrlabs/endeavor-1.0`, with tool calls?
   - Do we have SuperNode registration entitlement?
   - Where do we submit the Hub link and description?
4. Register the team on the Typeform.

✅ **Checkpoint:** everyone is logged in, one federation exists, and the Endeavor answer is known.

### Phase 1: Walking skeleton on the stock template (11:00–12:00) · A + B
1. `uvx --from flwr==1.39.0 flwr new @flwrlabs/collaborative-agent`. Rename the project to `blindquote` and set `publisher`.
2. Generate 6 keypairs, run `flwr supernode register ... --name --location`, create the `deployment` federation, and add the nodes.
3. `docker compose up` with **2 nodes**, each holding one dummy file. Chat with `/load .` in the federation and confirm the coordinator reaches both nodes and gets replies.
4. **Publish v0.1.0 to the Hub now**, which locks in the name and publisher early: `uv run flwr app publish .`.

✅ **Checkpoint:** a round trip from coordinator to 2 SuperNodes works on SuperGrid.
**Fallback if SuperNodes are blocked:** use a local SuperLink with local SuperNodes (`flower-superlink --insecure` + `flower-supernode --insecure ... --node-config`) and keep demoing via `flwr chat`. Tell judges it's SuperGrid-ready.

### Phase 2: Deterministic core, tested offline (11:00–12:30, in parallel) · C + D
1. `pricing.py`:
   - monthly payment (principal and interest)
   - `total_cost(rate, points, fees, loan, horizon_years)`
   - APR recompute
   - `clamp(offer, floor)`
2. `gen_rate_sheets.py`:
   - pull this week's 30-year average from [PMMS](https://www.freddiemac.com/pmms)
   - take a small FICO×LTV LLPA subset from the Fannie Mae matrix
   - write 4 sheets with different margins, floors, overlays, appetite and persona (`D = greedy`)
3. `protocol.py`: schemas for `BandsMsg`, `AttestMsg`, `QuoteRequest`, `Quote`, `Counter`, plus an allowlist guard that raises and logs to the ledger.
4. `attest.py` (HMAC) and `ledger.py`.
5. `tests/`, all offline: pricing math, guard rejection, signature verification, and **the full flow on FakeGrid**. Run with `uv run pytest`.

✅ **Checkpoint:** `pytest` is green and the full negotiation runs locally with no network.

### Phase 3: Wire the roles into the app (12:30–14:00; eat lunch while coding) · B + C
1. `agent_app.py` role dispatch plus the `grid.py` direct-call wrappers.
2. `borrower.py`, `bureau.py`, `bank.py`:
   - The bank verifies the signature and prices from its sheet.
   - It sends one LLM call for terms and strategy (`instructions` = persona; input = its computed numbers only).
   - It clamps, then calls `push_reply_message`.
3. `coordinator.py`: role discovery by `get_nodes` name/location → borrower → bureau → round 1 (parallel `push_messages` + `pull_messages` with timeout ≤ 45 s) → rank.
4. `compose.yaml`:
   - 6 nodes with per-node `--node-config`
   - Bank B and Bank C get the Nebius endpoint and key
   - Bank A and the coordinator use Endeavor
5. `emit.py`: node-by-node progress lines, for example `🏦 Cardinal Bank → quote received (sealed)`.

✅ **Checkpoint (MVP cut line):** one chat message produces round 1 from 3 banks, a ranked table and the ledger, on SuperGrid, in under 2 minutes.

### Phase 4: The winning features (14:00–15:30) · everyone, in priority order
1. **Guard moment:** Bank D's greedy persona requests `exact_income`/`assets`. The guard blocks it, the ledger entry is shown, and D requotes on bands.
2. **Round 2 negotiation:** send "best competing total cost"; banks' models decide; floors are enforced in code. Show "Bank C improved by $3,140; Bank A declined (at floor)."
3. **Endeavor narrative:** the coordinator explains the trade-offs (points vs rate over 7 years) and flags any APR bait offer.
4. `web_fetch` PMMS for the "market average" line.
5. *Stretch:* `start_automation` weekly re-quote.
6. *Stretch:* one bank node on Nebius Serverless.
7. *Stretch:* self-improvement, where banks keep node-local win/loss stats and adjust margin in the next session. (Unverified whether node-side file writes persist.)

✅ **Checkpoint:** the full demo script runs end to end three times in a row.

### Phase 5: Ship (15:30–16:30) · D leads, everyone reviews
1. Record a **fallback video** of a clean run.
2. README:
   - problem, with the verified stats above
   - architecture diagram and shared/never-shared table
   - how to run (SuperGrid + compose, and local)
   - an honest **built vs planned** section
3. Bump the version, run `flwr build`, review the files, run `uv run flwr app publish .`, and check `https://flower.ai/apps/<publisher>/blindquote/`.
4. Push to GitHub and submit the Typeform, Hub link, description and repo link.
5. Rehearse the 4-minute pitch twice with a timer.

✅ **Checkpoint:** everything submitted by the 16:30 reminder.

---

## 5. Demo script (4 minutes)

| Time | Beat |
|---|---|
| 0:00 | "You shopped for a mortgage and got 40 spam calls. Congress banned trigger leads in March. Here's the alternative, where your data never leaves your side." |
| 0:30 | Show the 6 nodes (`get_nodes`, names and locations). Show the raw profile *on the borrower node only*, then the bands it emits. |
| 1:00 | Send the prompt. The bureau attests "740–759 ✔". Round 1 streams in as sealed quotes. |
| 1:45 | **Gate:** Bank D demands exact income. `BLOCKED: bands only`. D requotes. |
| 2:15 | **Round 2:** Bank C improves by $3,140; Bank A declines at its floor. |
| 2:45 | Endeavor's verdict: best 7-year total cost, savings vs a single quote, APR-bait flag. |
| 3:15 | **Disclosure ledger:** what each bank learned and never learned. |
| 3:40 | Why Flower: every institution is its own SuperNode with its own data and model, and SuperGrid coordinates without centralizing. Close with the Hub app link. |

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| SuperNode registration or entitlement is blocked | Ask at 10:30. Local SuperLink + SuperNodes fallback (Phase 1). |
| Endeavor unavailable, or no tool calling | The core works without it because grid calls are direct from code. Swap `MODEL` to `openai/gpt-5.6-sol`. |
| 5-minute task timeout | Direct grid calls, `pull_messages` timeout ≤ 45 s, max 2 rounds, one short LLM call per bank. Round 2 can move to the next chat message using `context.state`. |
| Node model credentials on SuperGrid unclear | The compose file sets `FLWR_MODEL_API_KEY` per node (template pattern). Test on node 1 in Phase 1. |
| Stale or phantom SuperNodes | Restart compose cleanly and wait about 60 s. One `FLWR_HOME` per node. |
| Hub rejects the project | Only `.py/.toml/.md/.json` get uploaded, the name is hyphen-safe, `agentapp` is the only component, and LICENSE plus description are present. |
| Judges question realism | Say plainly: pre-qualification quotes, not binding Loan Estimates. HMAC stands in for bureau-grade signatures. Private set intersection and verifiable credentials are future work. |
