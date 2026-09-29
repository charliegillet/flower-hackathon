# Trust flow: three-stage application experience

Plan for the customer-facing flow in flower-finance. Builds on Johnny's sidebar layout (`frontend/src/App.jsx`) and the sectioned profile in `backend/src/models/User.js`. Interactive reference for the look and feel: https://philiprmocanu-cell.github.io/blindquote-ui/ (source on branch `ui/trust-console`, `docs/ui-prototype/index.html`).

The whole flow lives in one screen with three tabs across the top, like tabs in a desktop app. Finishing a stage opens the next tab and shrinks the previous one to a small pill on the left of the tab strip. The user can always click a pill to look back, but cannot edit a finished stage without restarting.

```
[ 1 Your answers ✓ ] [ 2 Sealing ✓ ] [ 3 Banks ● ]
```

---

## Stage 1 · Your answers

Left half: a question list. Every question and its answer sits in one long, scrollable column grouped by section. Right half: a running preview called "What banks will see", which fills in as the user types, always as a range, never an exact value.

### Questions to add (beyond what exists today)

The `User.profile` model already has personal, income, assets, debts and credit sections. Add the fields marked *new*; everything else is already stored.

| Section | Field | Stored today | Banks ever see |
|---|---|---|---|
| Identity | Full legal name | yes | never |
| | Date of birth | yes | never (age band only if a bank needs it) |
| | Phone, email | yes | never |
| | Home address | yes | state only |
| | SSN last 4 *(new)* | no | never |
| | Citizenship / residency status *(new)* | no | category |
| | Marital status *(new)* | no | never |
| | Dependents *(new)* | no | never |
| Income | Annual income | yes | debt-to-income range |
| | Employment status, employer, years employed | yes | status + tenure band |
| | Other income (rental, bonus, side) *(new)* | no | folded into ranges |
| Assets | Checking, savings, investments, real estate, other | yes | total assets range |
| | Retirement accounts *(new)* | no | folded into range |
| Debts | Housing, auto, student, cards, other (monthly) | yes | debt-to-income range |
| | Total balances per debt *(new)* | no | never |
| Credit | Score | yes | 20-point band, bureau-signed |
| | Bankruptcies / late payments in 7 yrs *(new)* | no | yes/no flag |
| Loan | Amount, purpose, term | yes | rounded range, purpose, term |
| | Property price and occupancy (home loans) *(new)* | no | loan-to-value range, occupancy |
| | How long you plan to keep the loan *(new)* | no | used to rank offers, never sent |

Each answer row has a small lock icon and one of three labels: **Never sent**, **Sent as range**, **Sent as-is** (only purpose, term, occupancy). The label is fixed by code, not by the user.

Bottom of the left column: one button, **Seal and continue**. Disabled until required fields are done.

### Backend

- Extend `User.profile` with the new fields. Extend `Application.applicant` the same way.
- Add a pure function `bands.js` in `backend/src/agents/` that turns an applicant into a bands object (`dtiBand`, `ltvBand`, `assetBand`, `loanBand`, `ficoBand`, `tenureBand`, `flags`). Unit-test it. This is the only thing that leaves the borrower side.
- The bank agent must underwrite from bands only. Today `clientAgentIntro` in `clientAgent.js` sends exact income, debt and score in plain text. Replace its input with the bands object.

---

## Stage 2 · Sealing

Opens automatically on submit. Stage 1 shrinks to a pill.

Left: the same answers column, now read-only. Right: a live work panel titled **Your agent is sealing your data**. Bottom: a summary card that fills in when sealing finishes.

### The visual, step by step (about 6 seconds, driven by real events)

1. **Scan.** A thin highlight sweeps down the answers column. Each row lights up for a moment as the agent reads it.
2. **Blur and lock.** Rows marked *Never sent* blur to unreadable text, then a lock closes over them, one row at a time, top to bottom. Rows marked *Sent as range* blur, then a blue chip with the range slides out to the right of the row (for example `$142,000` becomes `→ 30–35% debt-to-income`). Rows marked *Sent as-is* get a plain blue check.
3. **Sign.** The credit row shows a bureau stamp: "Range 740–759 confirmed by the bureau. Exact score not shared."
4. **Seal.** The right panel collapses into one sealed envelope card listing exactly what is inside, in plain words, and a **Show raw message** toggle that reveals the JSON.

### The summary card at the bottom

Title: **What every bank will know about you.**

- Financial position in one line: "Strong. Debt-to-income 30–35%, loan-to-value 75–80%, assets $200–250k, credit 740–759."
- Preliminary verdict from your own agent: "Likely approvable at all four banks. Expect 6.0–6.5% before negotiation."
- Three counts: **N ranges shared · N exact values locked · 0 requests blocked.**
- Two buttons: **Back and edit** (reopens stage 1, clears the seal) and **Approve and send to banks** (primary).

Nothing is sent to any bank until the user clicks Approve. Say so under the button.

### Backend

- Add `POST /api/applications/:id/seal` which computes bands, stores them on the application, and returns a `sealEvents` list (`scan`, `lock:<field>`, `band:<field>`, `sign`, `sealed`) with the sealed payload. The frontend plays these events with a short delay between them so the animation is real, not fake.
- Add `POST /api/applications/:id/send` which runs the bank negotiations. Split today's `runNegotiation` so seal and send are separate steps.

---

## Stage 3 · Banks

Opens on Approve. Stages 1 and 2 shrink to pills.

Layout like a desktop app with vertical tabs on the left, one per bank, each with the bank's logo, name, and a status chip. Main area shows the selected bank's live transcript. A sticky bottom bar shows the running ranking.

### Banks to show

Use real logos only if the team has the rights; otherwise a monogram in the bank's brand color. Suggested set of six: Bank of America, Citibank, Chase, Wells Fargo, US Bank, and one credit union. Store as `banks.json` with name, short name, brand color, logo path, and a persona line for the model.

### What each bank tab shows

- Header: logo, name, status (**Waiting · Pricing · Quoted · Improving · Held · Blocked**), time of last message.
- "Knows about you": the sealed envelope contents, repeated so the user sees each bank got the same thing.
- Transcript: every message in and out, in order, with a **Sealed** badge on quotes and a **Blocked** badge in amber if the bank asked for more. Text should be the real model output.
- Current offer: rate, points, monthly payment, total cost over the user's stated horizon.

### The bottom bar

Live ranking of all banks by total cost over the horizon, with the leader highlighted. Ends with **Accept offer** on the winning row and **Open disclosure ledger** on the right.

### Backend

- Change the model so an application holds many negotiations: `negotiations: [{ bankId, status, evaluation, conversation }]`. Today there is one `conversation` array.
- Run bank agents in parallel, one per bank, from the same bands object. Stream progress with server-sent events on `GET /api/applications/:id/events` so tabs update live. Fall back to polling every 2 seconds if SSE is not done in time.
- Add a guard in code: any bank message containing a request for a field outside the allowed list is refused, logged to `ledger[]` on the application, and answered with a fixed refusal.

---

## Build order for the hackathon

1. `bands.js` and the bands-only bank agent. Without this the privacy story is false.
2. Stage 1 question list with the three lock labels and the live "What banks will see" preview.
3. Seal endpoint and the blur-lock-chip animation.
4. Many-bank model, parallel negotiations, bank tabs with transcripts.
5. Ranking bar, guard, ledger.

Steps 1 to 3 make a convincing demo on their own. Step 4 is where the Flower story lands, because each bank tab can map to its own SuperNode.

---

## Color system for trust

Replace the current dark theme with a light one. Dark with gold reads as crypto or gaming; banks that people trust use light backgrounds, a single deep blue, and very few other colors.

| Role | Hex | Use |
|---|---|---|
| Paper | `#F4F6F9` | page background |
| Panel | `#FFFFFF` | cards, tabs |
| Ink | `#101A2B` | body text |
| Muted | `#5B6778` | secondary text (passes contrast on white) |
| Trust blue | `#1E4B86` | primary buttons, "sent as range" chips, links |
| Blue tint | `#E7EFF9` | selected tab, chip background |
| Slate | `#2F3E56` | locks, "never sent" labels |
| Slate tint | `#EEF1F6` | locked row background |
| Amber | `#6B4300` on `#FFF8EA` | blocked requests only |
| Green | `#1F6B45` on `#EEF6F0` | verified, done, bureau-signed |

Rules: blue means shared, slate plus a lock means kept, amber means a bank overreached, green means confirmed. Never use red and green as the only difference between two states. No gradients, no emoji icons, no gold. Headings in a serif (Newsreader), body in a plain sans (IBM Plex Sans), money in a monospace (IBM Plex Mono).

Two alternatives if the team wants a different feel:

- **Deep navy on cream** (`#0B2545` navy, `#F5F1E8` cream, `#3E7CB1` accent): older, more private-bank. Good if the pitch is "wealth".
- **Forest and stone** (`#1B3A2F` green, `#F3F4F1` stone, `#2E6F5E` accent): calmer, more credit-union. Good if the pitch is "on your side".

Whichever is picked, keep one accent color and use amber only for warnings.
