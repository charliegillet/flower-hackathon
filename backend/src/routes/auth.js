import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { signToken, requireAuth } from '../auth.js';

const router = Router();

const PROFILE_SECTIONS = ['personal', 'income', 'assets', 'debts', 'credit'];
const SETTINGS_KEYS = ['emailNotifications', 'currency'];

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role, bankName, profile } = req.body;
    if (!name || !email || !password || !['customer', 'bank'].includes(role)) {
      return res.status(400).json({ error: 'name, email, password and role (customer|bank) are required' });
    }
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const user = await User.create({
      name,
      email,
      role,
      passwordHash: await bcrypt.hash(password, 10),
      bankName: role === 'bank' ? bankName : undefined,
      profile: role === 'customer' ? profile : undefined,
    });
    res.status(201).json({ token: signToken(user), user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase() });
    if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({ token: signToken(user), user: user.toSafeJSON() });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user.toSafeJSON());
});

// Update own info. Accepts { name, bankName, profile: {<section>: {...}}, settings: {...} }.
// Each profile section is merged independently so the UI can save per section.
router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const { name, bankName, profile, settings } = req.body;
    if (name) req.user.name = name;
    if (req.user.role === 'bank' && bankName !== undefined) req.user.bankName = bankName;

    if (req.user.role === 'customer' && profile) {
      for (const section of PROFILE_SECTIONS) {
        if (profile[section]) {
          req.user.profile = req.user.profile || {};
          req.user.profile[section] = {
            ...(req.user.profile[section]?.toObject?.() || req.user.profile[section] || {}),
            ...profile[section],
          };
        }
      }
      req.user.markModified('profile');
    }

    if (settings) {
      for (const key of SETTINGS_KEYS) {
        if (settings[key] !== undefined) req.user.settings[key] = settings[key];
      }
      req.user.markModified('settings');
    }

    await req.user.save();
    res.json(req.user.toSafeJSON());
  } catch (err) {
    next(err);
  }
});

router.post('/password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    if (!(await bcrypt.compare(currentPassword || '', req.user.passwordHash))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    req.user.passwordHash = await bcrypt.hash(newPassword, 10);
    await req.user.save();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
