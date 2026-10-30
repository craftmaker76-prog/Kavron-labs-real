const express = require('express');
const router = express.Router();
const { getClient } = require('../db/client');
const { hashPassword, verifyPassword } = require('../auth/password');
const { createSession, destroySession, sessionCookieOptions } = require('../auth/sessions');
const { isLocked, recordLoginAttempt, clearFailedAttempts, dbRateLimit } = require('../middleware/rateLimit');
const { requireAuth } = require('../middleware/auth');
const { csrfProtect } = require('../middleware/csrf');
const { isEmail, isString } = require('../validators');
// Login is rate-limited per IP in the DB, not in memory (Vercel-safe).
const loginLimiter = dbRateLimit({ limit: 10, windowMinutes: 15, keyFn: req => 'login:' + (req.ip || 'unknown') });
// Register: only role 'user' can be created here. Admins are created
// only by scripts/create-admin.js, never by a public API (privilege guard).
router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!isEmail(email) || !isString(password, 128) || password.length < 8) {
      return res.status(400).json({ error: 'Please enter a valid email and a password of at least 8 characters.' });
    }
    const c = getClient();
    const existing = await c.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email.toLowerCase()] });
    if (existing.rows.length) return res.status(400).json({ error: 'This email is already registered.' });
    const hash = await hashPassword(password);
    await c.execute({ sql: 'INSERT INTO users (email, password_hash, role) VALUES (?,?,?)', args: [email.toLowerCase(), hash, 'user'] });
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!isEmail(email) || typeof password !== 'string') return res.status(400).json({ error: 'Please enter your email and password.' });
    if (await isLocked(email)) return res.status(423).json({ error: 'Too many failed login attempts. Please wait 15 minutes and try again.' });
    const c = getClient();
    const r = await c.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email.toLowerCase()] });
    const user = r.rows[0];
    const ok = user ? await verifyPassword(password, user.password_hash) : false;
    await recordLoginAttempt(email, req.ip || 'unknown', ok);
    if (!ok) return res.status(401).json({ error: 'Email or password is incorrect.' });
    await clearFailedAttempts(email);
    const session = await createSession(user.id);
    res.cookie('kavron_session', session.sessionId + '.' + session.token, sessionCookieOptions());
    // CSRF token cookie is intentionally NOT httpOnly: JS reads it and sends it as a header.
    res.cookie('kavron_csrf', session.csrfToken, { sameSite: 'lax', path: '/', maxAge: 7 * 24 * 3600 * 1000, secure: false });
    res.json({ ok: true, role: user.role, email: user.email });
  } catch (e) { next(e); }
});
router.get('/me', requireAuth, (req, res) => {
  res.json({ email: req.user.email, role: req.user.role, csrfToken: req.user.csrfToken });
});
router.post('/logout', requireAuth, csrfProtect, async (req, res, next) => {
  try { await destroySession(req.user.id); res.clearCookie('kavron_session', { path: '/' }); res.json({ ok: true }); } catch (e) { next(e); }
});
module.exports = router;
