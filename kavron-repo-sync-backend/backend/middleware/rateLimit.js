// DB-backed rate limiting + login lockout.
// In-memory counters DO NOT work on Vercel: each request can hit a
// different instance. Counters live in Turso (rate_limits / login_attempts).
const config = require('../config/env');
const { getClient } = require('../db/client');
function windowStart(minutes) {
  const d = new Date(); d.setSeconds(0, 0); d.setMinutes(Math.floor(d.getMinutes() / minutes) * minutes);
  return d.toISOString();
}
// Generic limiter: limit requests per windowMinutes for a key.
function dbRateLimit({ limit, windowMinutes, keyFn }) {
  return async (req, res, next) => {
    try {
      const c = getClient();
      const key = keyFn(req);
      const ws = windowStart(windowMinutes);
      const row = await c.execute({ sql: 'SELECT count, window_start FROM rate_limits WHERE key = ?', args: [key] });
      if (!row.rows.length || row.rows[0].window_start !== ws) {
        await c.execute({ sql: 'INSERT INTO rate_limits (key, count, window_start) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET count=1, window_start=excluded.window_start', args: [key, 1, ws] });
        return next();
      }
      const count = row.rows[0].count;
      if (count >= limit) return res.status(429).json({ error: 'Too many requests. Please wait a little and try again.' });
      await c.execute({ sql: 'UPDATE rate_limits SET count = count + 1 WHERE key = ?', args: [key] });
      next();
    } catch (e) { next(e); }
  };
}
async function isLocked(email) {
  const c = getClient();
  // Use SQLite datetime, not JS ISO: created_at uses datetime('now')
  // which is "YYYY-MM-DD HH:MM:SS", and "T" in ISO sorts after a space,
  // so an ISO comparison would never match. SQLite time math is correct.
  const r = await c.execute({ sql: "SELECT COUNT(*) AS n FROM login_attempts WHERE email = ? AND success = 0 AND created_at >= datetime('now', ?)", args: [email.toLowerCase(), '-' + config.loginLockMinutes + ' minutes'] });
  return Number(r.rows[0].n) >= config.loginMaxFailed;
}
async function recordLoginAttempt(email, ip, success) {
  await getClient().execute({ sql: 'INSERT INTO login_attempts (email, ip, success) VALUES (?,?,?)', args: [email.toLowerCase(), ip, success ? 1 : 0] });
}
async function clearFailedAttempts(email) {
  await getClient().execute({ sql: 'DELETE FROM login_attempts WHERE email = ? AND success = 0', args: [email.toLowerCase()] });
}
module.exports = { dbRateLimit, isLocked, recordLoginAttempt, clearFailedAttempts };
