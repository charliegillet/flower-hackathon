# Negotiation layer: agents that reason with each other

Written 2026-09-29, mid-afternoon at the hackathon. Demos start 17:15, so this is split into what ships today and what comes after.

## Where the repo is right now

Four branches matter.

| Branch | Who | What it holds |
|---|---|---|
| `main` | all | Johnny's accounts + sidebar app, plus the trust-flow frontend (merged from `feat/trust-flow`, PR #1) |
| `feat/trust-flow` | Philip | Seven-question step 1 with document dropbox, sealing, six-bank stage, mandate report. Simulated agents in `frontend/src/core/negotiation.js`. |
| `charlie` | Charlie | The real thing in Python: a Flower AgentApp (`blindquote/`) with a coordinator on the SuperLink and one SuperNode each for borrower, bureau and banks. Sealed round 1, a one-pass round 2 on "best competing total cost", allowlist guard, HMAC attestation, ledger, `bq.*` run events, a FastAPI bridge (`ui/server.py`), and offline tests. Verified on a local Flower federation; SuperGrid not yet run. |
| `flower-integration` | Charlie | Joins the two: the Express backend relays runs to the Python bridge (`backend/src/routes/flower.js`), and `frontend/src/core/flowerNegotiation.js` turns `bq.*` events into the event shapes the Banks stage already expects. Falls back to simulation when no bridge is up. |

So the seam marked in `negotiation.js` is already being filled. **`flower-integration` is where the negotiation layer goes.** Nothing below changes the screens' event contract; it adds to it.

### How negotiation works today, in Charlie's code

- Round 1: every bank prices from its private sheet in code; its model writes one pitch sentence.
- Round 2 (`core/roles/bank.py`): the coordinator sends each bank one number, the best competing total. Code computes three exact outcomes (hold, the minimum discount that wins, the maximum discount to the floor). The model picks one and writes a sentence. Code clamps to the floor.
- The guard (`core/protocol.py`) is an allowlist per message kind. A field not on the list is blocked. This is good: every new field below has to be added deliberately.
- Whole run budget is 240 seconds (`RUN_BUDGET_S`), inside Flower's 5-minute task window. That is the hard constraint on how much talking we can add.

What's missing for real negotiation: there is no borrower-side agent making choices, banks can only move on price, there is one pass, and nothing carries the user's mandate.

## The design

Three changes, each small, each on top of what exists.

### 1. The borrower's agent lives on the borrower node

Today the coordinator computes the round-2 ask. Instead, the **borrower node** (the user's device, which already holds the profile) also holds the mandate and decides the moves. The coordinator becomes a relay and referee, which matches the "neutral broker" story and adds a fourth kind of reasoning node to the federation.

New message pair:
- `board` (coordinator → borrower): the current offers, one entry per bank, plus each bank's last move. Banks stay named to the borrower (the user sees names in the UI anyway).
- `moves` (borrower → coordinator): one move per bank for this turn.

The mandate never crosses the grid. Only the moves it produces do.

### 2. A small vocabulary of moves

Every message a bank or the borrower's agent sends is one of these, plus one sentence of reasoning:

| Move | Who | Fields |
|---|---|---|
| `ask` | borrower | `what`: `fees_match` / `drop_prepay` / `zero_points` / `rate_cut` / `faster_close`; `reveal`: optional `best_competing_total` |
| `trade` | borrower | `give`: what the borrower accepts (e.g. `points_ok`); `want`: same values as `ask.what` |
| `accept` / `walk` | borrower | none |
| `offer` | bank | `options` (as today), `changed`: list of what moved |
| `partial` | bank | `changed` (e.g. dropped prepay, held rate) |
| `hold` / `withdraw` | bank | none |

For the bank, code prices every candidate response before the model sees anything, exactly as round 2 does today: hold, the exact ask, the cheapest partial, the max. The model picks one and writes the sentence. **The AI proposes, code decides** stays true.

For the borrower's agent, the model sees the board and the mandate and returns one move per bank. Code validates: it cannot reveal anything but a total-cost number, cannot ask for more than one thing per turn, cannot accept an offer that breaks a hard line.

### 3. Turns instead of one pass

Replace `_round2` with `_negotiate`: up to **3 turns**, all banks in parallel each turn, stop early when no bank moved. Per-turn timeout 20 s, so worst case about 70 s, leaving the run inside its budget. Banks still never see each other; the borrower's agent carries information across threads, which is where the search for a better result happens.

Ends with the existing verdict, plus a mandate report: for each hard line, did the winner meet it, and if not, which offer does.

## Wire and event changes (the checklist)

`core/protocol.py`
- `ALLOWED_BAND_FIELDS` += `priority`, `cash_band`, `prepay_pref` (the public half of the mandate).
- New kinds: `board`, `moves`, `negotiate_request` (replaces `counter_request`: adds `turn`, `ask`, `reveal`), and `counter` gains `move`, `changed`.
- Nothing from the private mandate (payment cap, walk-away rate, horizon) is ever on a list.

`core/roles/borrower.py`
- Load `mandate.json` next to `profile.json`.
- Handle `board`: build the prompt from mandate + board, call the model with a 12 s timeout, validate, return `moves`. Deterministic fallback: ask the runner-up to match the leader's total; ask the leader to fix its worst mandate miss.

`core/roles/bank.py`
- Extend the round-2 chooser: price `hold`, `exact_ask`, `partial`, `max` in code; model picks; clamp. Rate-sheet knobs already exist (`margin_pts`, `floor_pts`, `reprice`); add `prepay_penalty`, `close_days`, `min_fees`.

`core/roles/coordinator.py`
- `_negotiate(states, bands, att)`: loop turns → send `board` to borrower → get `moves` → send one `negotiate_request` per bank → collect `counter`s → `_accept_offer` as today → emit events → stop when no `changed` this turn.
- Keep `_round2` as the fallback when the borrower node has no mandate.

`core/events.py` and `docs/event-schema.md`
- New `bq.turn` {`turn`, `bank`, `move`, `what`, `reveal`, `message`}: the borrower agent's move.
- `bq.improve` gains `move` (`offer`/`partial`) and `changed`; `bq.decline` gains `move` (`hold`/`withdraw`).
- `bq.verdict` gains `mandate_report`: [{`line`, `met`, `value`}] for the winner, and `alternative` (bank that meets everything, or null).

`frontend/src/core/flowerNegotiation.js`
- Map `bq.turn` → UI event `ask` {bankId, what, text}; `partial` → `improve` with `delta: 0`; `mandate_report` → the report the Banks stage already renders from the private mandate (use the server's version when present).

`frontend/src/core/negotiation.js` (simulation)
- Same loop, same events, so the demo works with no bridge. This is the fallback on stage.

`tests/test_core.py`
- Three new tests: a partial trade is priced and clamped; the borrower agent never reveals more than a total; a `walk` ends that thread and never crashes the run. Keep `test_no_raw_personal_data_in_any_event` green; it is the privacy claim.

## Who does what, today

| Owner | Task | Time |
|---|---|---|
| Charlie | protocol kinds + bank chooser + `_negotiate` loop + tests | 75 min |
| Philip | simulated loop in `negotiation.js` with the same events; `bq.turn` and partials in the Banks stage; mandate report from server when present | 60 min |
| Johnny | `mandate.json` generated from the user's answers via the existing `/api/flower` relay (public half to bands, private half to the borrower node only); demo rehearsal | 45 min |

**Cut line for 16:30:** the loop with `ask` and `hold`/`offer` only, 2 turns, simulated in the frontend and real in Python if Charlie's tests are green. `trade`, `partial`, `walk` and the borrower-node model call are stretch. If the Python side slips, the demo runs on the simulation and we say so: same events, same screens, real nodes next.

## What to say on stage

"Round 1 is a sealed auction. Then the borrower's agent, running on the borrower's device with a mandate the banks never see, negotiates with each bank's agent in parallel: it asks for one thing at a time, reveals only a competing total, and every bank's model chooses how to respond from options its own code priced. Three turns, seventy seconds, and the result is checked against what the borrower actually asked for."

## After the hackathon

- Real loan-officer channel: the same `negotiate_request` goes out as an email with a reply form; the reply comes back as a `counter`. Same loop, human on the other end.
- Bank appetite: a per-bank daily volume target so "how much do we want this loan" is a real input to the chooser.
- Borrower agent memory across runs (the automation re-quote in the original plan) so it learns which asks each bank tends to grant.
