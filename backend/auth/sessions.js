// DB-backed sessions. NEVER in server memory.
// On Vercel every request can hit a different instance, so a memory
// session would randomly disappear. A session row in Turso survives that.
// Cookie: httpOnly (JS cannot read it), Secure in production,
// SameSite=Lax (CSRF defence), signed with a server secret via HMAC.
const crypto = require('crypto');
const config = require('../config/env');
const { getClient } = require('../db/client');
function sign(value) {
  return crypto.createHmac('sha256', config.sessionSecret).update(value).digest('hex');
}
function newId() { return crypto.randomBytes(32).toString('hex'); }
async function createSession(userId) {
  const c = getClient();
  const sessionId = newId();
  const token = newId();
  const csrfToken = newId();
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  await c.execute({ sql: 'INSERT INTO sessions (id, user_id, token_hash, csrf_token, expires_at) VALUES (?,?,?,?,?)', args: [sessionId, userId, sign(token), csrfToken, expires] });
  return { sessionId, token, csrfToken, expires };
}
async function getSessionFromCookie(req) {
  const raw = req.cookies && req.cookies.kavron_session;
  if (!raw) return null;
  const [sessionId, token] = String(raw).split('.');
  if (!sessionId || !token) return null;
  const c = getClient();
  const r = await c.execute({ sql: 'SELECT s.*, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.token_hash = ?', args: [sessionId, sign(token)] });
  if (!r.rows.length) return null;
  const s = r.rows[0];
  if (new Date(s.expires_at).getTime() < Date.now()) return null;
  return { id: s.id, userId: s.user_id, email: s.email, role: s.role, csrfToken: s.csrf_token };
}
function sessionCookieOptions() {
  return { httpOnly: true, secure: config.sessionSecure, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 3600 * 1000 };
}
async function destroySession(sessionId) {
  await getClient().execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [sessionId] });
}
module.exports = { createSession, getSessionFromCookie, destroySession, sessionCookieOptions };
