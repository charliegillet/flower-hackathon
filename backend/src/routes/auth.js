import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { signToken, requireAuth } from '../auth.js';

const router = Router();

const CUSTOMER_PROFILE_KEYS = ['annualIncome', 'employmentStatus', 'monthlyDebt', 'creditScore'];

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

// Update own info. Customers edit their financial profile; bankers edit name/bankName.
router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const { name, bankName, profile } = req.body;
    if (name) req.user.name = name;
    if (req.user.role === 'bank' && bankName !== undefined) req.user.bankName = bankName;
    if (req.user.role === 'customer' && profile) {
      for (const key of CUSTOMER_PROFILE_KEYS) {
        if (profile[key] !== undefined) req.user.profile[key] = profile[key];
      }
      req.user.markModified('profile');
    }
    await req.user.save();
    res.json(req.user.toSafeJSON());
  } catch (err) {
    next(err);
  }
});

export default router;
