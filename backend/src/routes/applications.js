import { Router } from 'express';
import { Application } from '../models/Application.js';
import { runNegotiation } from '../agents/conversation.js';

const router = Router();

// Submit a loan application. Runs the agent-to-agent negotiation, then
// returns the full record including the conversation transcript.
router.post('/', async (req, res, next) => {
  try {
    const app = await Application.create(req.body);
    await runNegotiation(app);
    await app.save();
    res.status(201).json(app);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const apps = await Application.find()
      .select('applicant.name applicant.email loan status evaluation.decision createdAt')
      .sort({ createdAt: -1 });
    res.json(apps);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const app = await Application.findById(req.params.id);
    if (!app) return res.status(404).json({ error: 'Application not found' });
    res.json(app);
  } catch (err) {
    next(err);
  }
});

// Re-run the negotiation (e.g., after the client updates their info).
router.post('/:id/renegotiate', async (req, res, next) => {
  try {
    const app = await Application.findById(req.params.id);
    if (!app) return res.status(404).json({ error: 'Application not found' });
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
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default router;
