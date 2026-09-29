# flower-finance

Loan application platform built at the Flower Collaborative Agent Hackathon (Stanford, 2026-09-29).

A client submits their info to request a loan. A **bank agent** underwrites the application, and a
**client agent** negotiates with it — the full agent-to-agent conversation is stored and shown in the UI.

## Flower integration (BlindQuote engine)

The **Banks** stage of the trust flow runs on real **Flower** agents:

```
browser (seals answers into ranges) ──► Node /api/flower (JWT) ──► bridge (ui/server.py)
                                                                        │ starts a Flower AgentApp run
          ┌─────────────────────────────────────────────────────────────┘
   SuperLink coordinator (Endeavor) ── agent.grid ──► bureau SuperNode (signs the credit range)
                                                  └─► 6 bank SuperNodes (private rate sheets; Endeavor / Kimi / MiniMax)
```

- Only the sealed ranges leave the browser. The stay horizon goes to the coordinator for ranking and is never sent to a bank.
- Round 1: sealed quotes priced in code from each bank's private sheet (Freddie Mac PMMS + Fannie Mae LLPA grid).
- Guard (code): U.S. Bank's request for exact income/assets is blocked; a misleading APR is flagged.
- Round 2: each bank hears only its rank and % gap, answers with a price ladder; the coordinator takes the smallest rung that wins.
- The app falls back to the in-browser simulation, labelled as such, when the bridge is offline.

Run it locally:

```bash
uv sync && cp -n .env.example .env        # add FLWR_MODEL_API_KEY + Nebius keys
uv run python scripts/gen_nodes.py
uv run python deploy/local_federation.py up
BQ_MODE=local uv run uvicorn ui.server:app --port 8765
# backend: FLOWER_BRIDGE_URL=http://127.0.0.1:8765 in backend/.env, then npm run dev as below
```

Engine details: `docs/blindquote-engine.md`, event contract: `docs/event-schema.md`, deploy: `docs/deploy-flower.md`.
Tests: `uv run pytest -q`. Flower Hub app: `blindquote/` (`uv run flwr app publish .`).

## Stack

- **Frontend:** React + Vite (`frontend/`)
- **Backend:** Node.js + Express (`backend/`)
- **Database:** MongoDB (`MONGODB_URI`)
- **Agents:** Flower AgentApp + SuperLink/SuperNodes (`blindquote/`), Python bridge (`ui/server.py`)

## Features

0. **Accounts** — register as a **loan applicant** or a **bank reviewer** (JWT auth). Customers
   manage a sectioned financial profile — personal details, income & employment, assets, monthly
   debts, credit — plus a settings page (password, preferences). The profile prefills each
   application, and assets count in underwriting. Bankers see every application and record the
   final approve/deny decision on top of the agent negotiation.
1. **Apply for a loan** — name, income, employment, debts, credit score, amount, purpose, term.
2. **Bank agent evaluation** — deterministic underwriting (credit band, DTI, loan-to-income,
   40% DTI payment cap) produces `approved` / `countered` / `denied` with terms and reasons.
3. **Agent-to-agent negotiation** — the client agent presents the application, the bank agent
   responds with an offer, the client agent accepts/counters/appeals, and the bank replies once
   more (it can improve the rate by up to 0.75% but never below its floor). The transcript is
   saved on the application and rendered as a chat thread.

Agents use an OpenAI-compatible LLM endpoint when `FLWR_MODEL_API_KEY` is set (see
`.env.example`), and fall back to deterministic templates otherwise, so the demo always works.

## Deployment

Live at **https://flower.zfloo.com**

- **Backend:** systemd service `flower-finance-backend` (`/etc/systemd/system/flower-finance-backend.service`),
  runs `backend/src/index.js` on port 4000 with env from `backend/.env`
- **Frontend:** `vite build` output copied to `/var/www/flower-finance`
- **nginx:** `/etc/nginx/sites-available/flower.zfloo.com` — serves the static build,
  proxies `/api/` → `127.0.0.1:4000`, SSL via certbot
- **MongoDB:** system `mongod` on port 37017

Redeploying the frontend after changes:

```bash
cd frontend && npm run build
cp -r dist/* /var/www/flower-finance/
```

## Run locally

```bash
# MongoDB (deployed instance listens on :37017; set MONGODB_URI accordingly)
cd backend
cp ../.env.example .env   # or create backend/.env with MONGODB_URI and PORT
npm install
npm run dev               # http://localhost:4000

cd frontend
npm install
npm run dev               # http://localhost:5173 (proxies /api -> :4000)
```

## API

| Method | Path                              | Description                                   |
|--------|-----------------------------------|-----------------------------------------------|
| POST   | `/api/auth/register`              | Create account (`role`: `customer` or `bank`)  |
| POST   | `/api/auth/login`                 | Log in, returns a JWT                          |
| GET    | `/api/auth/me`                    | Current user                                   |
| PUT    | `/api/auth/me`                    | Update name / profile sections / settings      |
| POST   | `/api/auth/password`              | Change password                                |
| POST   | `/api/applications`               | Submit application (customer); runs negotiation |
| GET    | `/api/applications`               | List own applications (bank: all)              |
| GET    | `/api/applications/:id`           | Application detail incl. conversation          |
| POST   | `/api/applications/:id/decision`  | Final approve/deny (bank)                      |
| POST   | `/api/applications/:id/renegotiate` | Re-run the agent negotiation (customer)      |
| GET    | `/api/health`                     | Health check                                   |

All `/api/applications` routes require an `Authorization: Bearer <token>` header.
`JWT_SECRET` lives in `backend/.env`.

## Docs

Hackathon brief, research, and the BlindQuote implementation plan live in `docs/`.
