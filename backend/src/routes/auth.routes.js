import { Router } from 'express';
import crypto from 'node:crypto';
import db from '../db/connection.js';
import { ApiError } from '../middleware/error-handler.js';
import { clearAuthCookies, createSession, requireAuth, revokeCurrentSession, setAuthCookies, csrfProtection } from '../middleware/auth.js';
import { loginRateLimit } from '../middleware/rate-limit.js';
import { email } from '../utils/validation.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

const router = Router();

router.post('/login', loginRateLimit, async (req, res) => {
  const loginEmail = email(req.body?.email);
  const password = req.body?.password;
  if (!loginEmail || typeof password !== 'string' || password.length < 1) throw new ApiError(400, 'Укажите email и пароль');
  const user = (await (db.prepare('SELECT id, email, name, role, active, password_hash FROM users WHERE email = ?').get(loginEmail)));
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    throw new ApiError(401, 'Неверный email или пароль', 'LOGIN_FAILED');
  }
  const session = await createSession(user.id);
  setAuthCookies(res, session.sessionToken, session.csrfToken);
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/logout', requireAuth, csrfProtection, async (req, res) => {
  await revokeCurrentSession(req);
  clearAuthCookies(res);
  res.status(204).end();
});

router.get('/csrf', requireAuth, (req, res) => res.json({ ok: true }));

export default router;
