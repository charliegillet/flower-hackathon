import { Router } from 'express';
import { Application } from '../models/Application.js';
import { runNegotiation } from '../agents/conversation.js';
import { requireAuth, requireRole } from '../auth.js';
import { bankView, bandsOf } from '../agents/bands.js';

// Bank accounts never receive identity or exact figures.
const forUser = (req, app) => (req.user.role === 'bank' ? bankView(app) : app);

const router = Router();
router.use(requireAuth);

// Submit a loan application (customers only). Runs the agent-to-agent
// negotiation, then returns the full record including the transcript.
router.post('/', requireRole('customer'), async (req, res, next) => {
  try {
    const app = await Application.create({ ...req.body, user: req.user._id });
    await runNegotiation(app);
    await app.save();
    res.status(201).json(app);
  } catch (err) {
    next(err);
  }
});

// Customers see their own applications; bankers see all of them.
router.get('/', async (req, res, next) => {
  try {
    const filter = req.user.role === 'bank' ? {} : { user: req.user._id };
    const isBank = req.user.role === 'bank';
    const apps = await Application.find(filter)
      .select(isBank
        ? 'applicant.annualIncome applicant.monthlyDebt applicant.totalAssets applicant.creditScore applicant.employmentStatus loan status evaluation.decision bankDecision.decision createdAt'
        : 'applicant.name applicant.email loan status evaluation.decision bankDecision.decision createdAt')
      .sort({ createdAt: -1 });
    res.json(isBank ? apps.map((a) => { const d = a.toObject(); return { ...d, applicant: { code: bandsOf(d).code, bands: bandsOf(d) } }; }) : apps);
  } catch (err) {
    next(err);
  }
});

async function loadAuthorized(req, res) {
  const app = await Application.findById(req.params.id);
  if (!app) {
    res.status(404).json({ error: 'Application not found' });
    return null;
  }
  if (req.user.role !== 'bank' && app.user?.toString() !== req.user._id.toString()) {
    res.status(403).json({ error: 'Not your application' });
    return null;
  }
  return app;
}

router.get('/:id', async (req, res, next) => {
  try {
    const app = await loadAuthorized(req, res);
    if (app) res.json(forUser(req, app));
  } catch (err) {
    next(err);
  }
});

// Banker makes the final approve/deny call after the agents negotiate.
router.post('/:id/decision', requireRole('bank'), async (req, res, next) => {
  try {
    const { decision, note } = req.body;
    if (!['approved', 'denied'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be approved or denied' });
    }
    const app = await Application.findById(req.params.id);
    if (!app) return res.status(404).json({ error: 'Application not found' });

    app.bankDecision = { decision, note, decidedBy: req.user.name, decidedAt: new Date() };
    app.status = decision === 'approved' ? 'approved' : 'denied';
    app.conversation.push({
      agent: 'system',
      text: `Banker ${req.user.name} ${decision} the application.${note ? ` Note: ${note}` : ''}`,
    });
    await app.save();
    res.json(forUser(req, app));
  } catch (err) {
    next(err);
  }
});

// Customer re-runs the negotiation on their own application.
router.post('/:id/renegotiate', requireRole('customer'), async (req, res, next) => {
  try {
    const app = await loadAuthorized(req, res);
    if (!app) return;
    app.conversation.push({ agent: 'system', text: 'Renegotiation requested.' });
    await runNegotiation(app);
    await app.save();
    res.json(app);
  } catch (err) {
    next(err);
  }
});

// eslint-disable-next-line no-unused-vars
router.use((err, _req, res, _next) => {
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid id' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default router;
