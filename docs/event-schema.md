# BlindQuote run-event schema (core ⇄ UI contract)

The coordinator emits these events while it runs:
- **On Flower:** via `agent.events.emit`. The UI server relays them from `StreamRunEvents`.
- **In simulation mode:** via an in-process sink.

The UI consumes the same JSON in both modes. Every event is a JSON object with a string `type` and a float `ts`, the seconds since the run started.

The narrative text also streams as standard Responses events:
- `response.output_text.delta` (`{"type","delta"}`)
- `response.completed` at the end

## Identifiers

| Field | Meaning |
|---|---|
| `node_id` | Flower SuperNode id (string) or `"coordinator"` |
| `role` | `coordinator` · `borrower` · `bureau` · `bank` |
| `bank` | Bank display name, e.g. `"Cardinal Bank"` |
| `round` | `1` or `2` |

## Events

| type | payload fields | when |
|---|---|---|
| `bq.run` | `prompt`, `mode` (`sim`/`flower`), `horizon_years` | first event |
| `bq.stage` | `stage` (`discover`,`bands`,`attest`,`round1`,`round2`,`verdict`), `status` (`start`/`done`), `label` | stage boundaries |
| `bq.node` | `node_id`, `role`, `name`, `org_kind` (e.g. "Borrower device", "Credit bureau", "Bank"), `model` (string or null), `location` (string or null) | once per discovered node |
| `bq.msg` | `from`, `to` (node_ids), `kind` (`hello`,`hello_reply`,`bands_request`,`bands`,`attest_request`,`attestation`,`quote_request`,`quote`,`counter_request`,`counter`), `summary` (short human text), `fields` (list of field names carried), `sealed` (bool: content hidden from other banks) | every grid message out/in (for animation) |
| `bq.bands` | `bands` {`loan_band`,`ltv_band`,`dti_band`,`occupancy`,`term_years`,`property_state`}, `withheld` (list of raw fields never sent, e.g. `["exact_income","assets","name","exact_credit_score"]`) | borrower node replied |
| `bq.attest` | `bureau`, `fico_band`, `signature_ok` (`null` until banks verify, then bool), `verified_by` (number of banks whose signature check passed) | bureau replied (`null`), then again after round 1 |
| `bq.quote` | `bank`, `node_id`, `round`, `model`, `rate` (% e.g. 6.875), `points` (% of loan), `fees` ($), `apr` (% recomputed by coordinator), `apr_stated` (% claimed by bank or null), `monthly_pi` ($), `total_cost` ($ over horizon), `horizon_years`, `note` (bank's short pitch) | each accepted quote |
| `bq.guard` | `bank` (or borrower/bureau name when `round` is 0), `node_id`, `round` (0 = before bidding), `violation` (`requested_fields`/`apr_mismatch`/`outbound_blocked`), `requested` (list), `detail`, `action` (`blocked`/`flagged`) | the guard intervened |
| `bq.decline` | `bank`, `round`, `reason`, `message` | bank declined to quote or to improve |
| `bq.round2` | `best_total` ($, cheapest round-1 total over the horizon; shown to the borrower only), `banks` | round 2 opens |
| `bq.improve` | `bank`, `from_total`, `to_total`, `delta` ($ saved, positive), `message` | round-2 improvement |
| `bq.market` | `pmms_30y` (%), `as_of` (date string), `source` (url) | market context |
| `bq.verdict` | `ranking` [ {`bank`,`rate`,`points`,`fees`,`apr`,`total_cost`,`monthly_pi`,`flags` (list of strings)} ] sorted best first, `winner` (bank), `savings_vs_single_quote` ($, winner vs the median round-1 total among unflagged lenders; never negative), `savings_vs_worst` ($), `horizon_years` | final ranking |
| `bq.ledger` | `parties` [ {`party`,`role`,`learned` (list of strings),`never` (list of strings)} ] | final disclosure ledger |
| `bq.done` | `elapsed_s` | last event |
| `bq.error` | `message` | fatal error |

## UI server API

- `GET /api/status` → `{"modes": {"sim": bool, "local": bool, "supergrid": bool}, "models": {...}}`
- `POST /api/runs` with body `{"mode": "sim"|"local"|"supergrid", "prompt": str}` → `{"run_id": str}`
- `GET /api/runs/{run_id}/events` → Server-Sent Events. Each message is `data: <event json>\n\n`. The stream closes after `bq.done` or `bq.error`.
- `GET /fixtures/sample-run.json` → a recorded run for offline "Replay" mode: `{"events": [...]}` with `ts` timing.
