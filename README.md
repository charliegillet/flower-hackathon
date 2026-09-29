# flower-finance

Loan application platform built at the Flower Collaborative Agent Hackathon (Stanford, 2026-09-29).

A client submits their info to request a loan. A **bank agent** underwrites the application, and a
**client agent** negotiates with it — the full agent-to-agent conversation is stored and shown in the UI.

## Stack

- **Frontend:** React + Vite (`frontend/`)
- **Backend:** Node.js + Express (`backend/`)
- **Database:** MongoDB (`MONGODB_URI`)

## Features

0. **Accounts** — register as a **loan applicant** or a **bank reviewer** (JWT auth). Customers
   manage their financial profile (income, debts, credit score, employment) under "My info"; it
   prefills each application. Bankers see every application and record the final
   approve/deny decision on top of the agent negotiation.
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
| PUT    | `/api/auth/me`                    | Update name / profile / bankName               |
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
