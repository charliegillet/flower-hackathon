import { Router } from 'express';
import { requireAuth } from '../auth.js';

// Relay to the BlindQuote Flower bridge (ui/server.py), which starts real Flower
// AgentApp runs (SuperLink coordinator + bank SuperNodes) and streams their events.
// Only the sealed bands object is forwarded: never the applicant's exact answers.
const BRIDGE = (process.env.FLOWER_BRIDGE_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');

// Keys computeBands() may produce (frontend/src/core/bands.js). Anything else is dropped here,
// and the Flower coordinator re-checks the same allowlist.
const BAND_KEYS = [
  'dtiBand', 'ltvBand', 'assetBand', 'loanBand', 'ficoBand', 'tenureBand',
  'employmentStatus', 'purpose', 'termMonths', 'occupancy', 'residency', 'state', 'derogatory',
];

const runs = new Map(); // runId -> { userId, createdAt, finished }
const RUN_TTL_MS = 30 * 60 * 1000;
// Every run spends model credits: one active run per user, a few at a time overall.
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const MAX_ACTIVE_RUNS = Number(process.env.FLOWER_MAX_ACTIVE_RUNS || 3);
const isActive = (run, now) => !run.finished && now - run.createdAt < ACTIVE_WINDOW_MS;

function sanitizeBands(bands) {
  const out = {};
  for (const key of BAND_KEYS) {
    const v = bands?.[key];
    if (v == null || v === '') continue;
    if (typeof v === 'boolean' || typeof v === 'number') out[key] = v;
    else if (typeof v === 'string' && v.length <= 40) out[key] = v;
  }
  return out;
}

const router = Router();
router.use(requireAuth);

router.get('/status', async (_req, res) => {
  try {
    const r = await fetch(`${BRIDGE}/api/status`, { signal: AbortSignal.timeout(3000) });
    const body = await r.json();
    // Available only if the bridge answers AND its federation for the default mode is up.
    res.json({ available: r.ok && Boolean(body.modes?.[body.default_mode]), mode: body.default_mode, modes: body.modes });
  } catch {
    res.json({ available: false });
  }
});

router.post('/runs', async (req, res) => {
  const { bands, horizonYears, consentToken } = req.body || {};
  const clean = sanitizeBands(bands);
  if (!clean.loanBand || !clean.ficoBand) return res.status(400).json({ error: 'Sealed bands are required' });
  // The Flower engine prices home loans from loan, LTV, DTI and credit bands; anything else uses the simulation.
  if ((clean.purpose && clean.purpose !== 'home') || !clean.ltvBand || !clean.dtiBand) {
    return res.status(422).json({ error: 'Flower prices home loans with a property price', unsupported: true });
  }
  const now = Date.now();
  const active = [...runs.values()].filter((run) => isActive(run, now));
  if (active.some((run) => run.userId === String(req.user._id))) {
    return res.status(429).json({ error: 'You already have a negotiation running' });
  }
  if (active.length >= MAX_ACTIVE_RUNS) return res.status(429).json({ error: 'Flower is busy, try again shortly' });
  try {
    const r = await fetch(`${BRIDGE}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request: {
          bands: clean,
          horizon_years: Math.min(Math.max(Number(horizonYears) || 7, 1), 30),
          consent_token: typeof consentToken === 'string' ? consentToken.slice(0, 64) : null,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return res.status(502).json({ error: `Flower bridge answered ${r.status}` });
    const { run_id: runId, mode } = await r.json();
    for (const [id, run] of runs) if (now - run.createdAt > RUN_TTL_MS) runs.delete(id);
    runs.set(runId, { userId: String(req.user._id), createdAt: now, finished: false });
    res.json({ runId, mode });
  } catch (err) {
    res.status(503).json({ error: `Flower bridge unavailable: ${err.message}` });
  }
});

router.get('/runs/:id/events', async (req, res) => {
  const run = runs.get(req.params.id);
  if (!run || run.userId !== String(req.user._id)) return res.status(404).json({ error: 'Unknown run' });
  const ctrl = new AbortController();
  res.on('close', () => ctrl.abort());
  try {
    const upstream = await fetch(`${BRIDGE}/api/runs/${encodeURIComponent(req.params.id)}/events`, { signal: ctrl.signal });
    if (!upstream.ok || !upstream.body) return res.status(502).json({ error: 'Run stream unavailable' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx: stream immediately
    });
    for await (const chunk of upstream.body) res.write(chunk);
    run.finished = true;
    res.end();
  } catch (err) {
    if (!res.headersSent) res.status(502).json({ error: err.message });
    else res.end();
  }
});

export default router;
