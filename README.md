# BlindQuote

**Shop every mortgage lender without becoming a lead.**
Your agent collects sealed, negotiated mortgage quotes from competing banks. Each bank sees only verified *bands* of your finances, never exact numbers, and never sees the other banks' bids.

Built at the Flower Collaborative Agent Hackathon, Stanford, 2026-09-29, on **Flower Agent + SuperGrid** with the **Endeavor** model.

## Why

- **Shopping around saves money.** One extra quote saves $966–$2,086 and five quotes save about $2,914 ([Freddie Mac](https://freddiemac.gcs-web.com/news-releases/news-release-details/freddie-mac-april-2018-insight)). Yet borrowers avoid it because rate shopping turns them into a sold lead.
- **Congress agreed.** It banned mortgage "trigger leads" in the [Homebuyers Privacy Protection Act](https://www.congress.gov/bill/119th-congress/house-bill/2808), effective 2026-03-05.
- **Banks already price in bands.** The [Fannie Mae LLPA matrix](https://singlefamily.fanniemae.com/media/9391/display) grids pricing by credit-score band × LTV band, so quoting on bands is realistic.

## How it works

Every organisation is its own Flower **SuperNode** with private data. A neutral coordinator AgentApp on the **SuperLink** (SuperGrid) runs the negotiation over `agent.grid`.

```
  flwr chat / BlindQuote UI ──► COORDINATOR (SuperLink, Endeavor)
                                  │ get_nodes · push_messages · pull_messages
      ┌───────────┬───────────┬───┴───────┬───────────┬───────────┐
  BORROWER     BUREAU      BANK A      BANK B      BANK C      BANK D
  profile →    score →     rate sheet  rate sheet  rate sheet  "greedy"
  bands only   signed band Endeavor    Kimi        MiniMax     Kimi
```

1. **Discover.** The coordinator finds the SuperNodes, and each node reports its role.
2. **Bands.** The borrower node turns the private profile into bands (loan $650k–$700k, LTV 75.01–80%, DTI 36.01–43%). Nothing else leaves the device.
3. **Attest.** The credit-bureau node looks up the real score and returns only the band, HMAC-signed. Banks verify the signature.
4. **Round 1: sealed bids.** Each bank prices from its private rate sheet (this week's PMMS rate + the Fannie LLPA grid + its private margin), in code. Its model writes the pitch.
5. **Guard.** Code enforces an allowlist on every message:
   - Rapid Lending asks for exact income and assets: **blocked**.
   - Its advertised APR is off by more than 1/8 point: **flagged**.
6. **Round 2.** Each bank hears only the *best competing total cost*. Code computes the exact outcome of holding, the minimum discount needed to win, and the maximum discount; the bank's model picks one. The floor is enforced in code.
7. **Verdict.** Offers are ranked by **total cost over your stay horizon** (points + fees + interest), with a live Freddie Mac PMMS market context. Endeavor explains the result.
8. **Disclosure ledger.** Shows what every party learned and never learned.

**Design rule: the AI proposes, code decides.** Grid routing, pricing, the guard and the floors are deterministic. Models only write pitches, choose negotiation strategy and explain. Every model call has a timeout and a deterministic fallback, so a slow model never breaks a run.

## What is verified

| Claim | Evidence |
|---|---|
| Full negotiation across a real local Flower federation (SuperLink + 6 SuperNodes), streamed to the UI | Local Flower mode, run ≈ 2–2.5 min |
| Custom `bq.*` events flow through Flower's run-event stream | UI relays `StreamRunEvents` |
| Endeavor (`flwrlabs/endeavor-1.0`), Kimi-K2.7 and MiniMax-M3 all answer | Verified with the event keys |
| No raw personal data appears in any event | `tests/test_core.py::test_no_raw_personal_data_in_any_event` |
| SuperGrid deployment | **Not yet run.** `deploy/compose.supergrid.yaml` is generated from the same topology but needs SuperNode registration on the event account |

## Quickstart

```bash
uv sync                                   # Python 3.12, flwr 1.39.0
cp .env.example .env                      # add FLWR_MODEL_API_KEY and the Nebius keys
uv run python scripts/gen_nodes.py        # synthetic node data + secrets/bureau.key
uv run pytest -q                          # offline tests (no models)
```

**UI** (Replay · Simulation · Local Flower · SuperGrid):

```bash
uv run uvicorn ui.server:app --port 8765  # open http://127.0.0.1:8765
```

- **Replay** plays a recorded real run. It needs no network, so it's the demo fallback.
- **Simulation** runs the same role code in-process with real models.
- **Local Flower** runs a real Flower run on a local federation:

  ```bash
  uv run python deploy/local_federation.py up      # SuperLink + 6 SuperNodes (insecure, local only)
  uv run python deploy/local_federation.py down
  ```

- **SuperGrid** needs `BQ_FEDERATION=@<account>/<federation>` in `.env`, plus the deployment below.

**CLI:** `uv run python -m sim.run` (add `--no-llm` for offline, `--record <file>` to save a replay).

## Deploy on SuperGrid

```bash
uvx --from flwr==1.39.0 flwr login supergrid
uv run python deploy/gen_supergrid.py     # writes compose + prints key/registration commands
# run the printed ssh-keygen + `flwr supernode register` commands, then create a
# deployment federation and add the six SuperNodes to it
docker compose -f deploy/compose.supergrid.yaml --env-file .env up
```

Then chat with the app: `cd blindquote && uv run flwr chat`, `/federation @<account>/<federation>`, `/load .`, and ask. Or use the UI's SuperGrid mode.

**Publish to Flower Hub:** `cd blindquote && uv run flwr build && uv run flwr app publish .`. The publisher is set in `blindquote/pyproject.toml`. Publishing is public and permanent, so review the files first.

## Repo layout

| Path | What |
|---|---|
| `blindquote/` | The Flower AgentApp (published to the Hub). `core/` is transport-agnostic logic; `flower_grid.py` + `agent_app.py` bind it to Flower. |
| `nodes/` | Synthetic private data per node (never in the FAB) |
| `deploy/` | `topology.json` (single source of truth), local federation launcher, SuperGrid compose generator |
| `sim/` | In-process federation and CLI |
| `ui/` | FastAPI server + static frontend |
| `docs/` | Hackathon brief, research, Flower docs mirror, plan, ideas, event schema |

## Honest limits

- These are pre-qualification quotes, not binding Loan Estimates.
- HMAC with a consortium key stands in for bureau-grade signatures. Ed25519 or verifiable credentials are the upgrade path.
- Loan amounts are priced at the band midpoint. The coordinator sees bands and quotes, but never raw data, rate sheets or floors.
- Pricing data is real (PMMS, LLPA). Banks, borrower and bureau data are synthetic.
