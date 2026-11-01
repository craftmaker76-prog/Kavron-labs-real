// Admin panel API. Admin-only: every route checks the session role on the
// server (requireRole('admin')). Hiding the panel link is NOT the security;
// these checks are. All key values stay server-side: the panel only ever
// sees presence + last-4 hint, never a key.
// NOTE: email alerts were dropped from panel v1 (user decision 2026-11-02:
// "email wala chakkar choro"). The bell is panel-only for now; email
// dispatch joins later, after his Gmail 2SV is fixed.
const express = require('express');
const router = express.Router();
const config = require('../config/env');
const { getClient } = require('../db/client');
const { ensurePanelSchema } = require('../db/panelSchema');
const { requireAuth, requireRole } = require('../middleware/auth');
const { csrfProtect } = require('../middleware/csrf');
const { PROVIDERS, getProvider } = require('../services/exammate/registry');
const { encryptKey, keyHint } = require('../services/admin/keyCrypto');
const { listNotifications, markRead, markAllRead } = require('../services/admin/notifications');

// Self-healing schema: the first admin request ensures the panel tables
// and columns exist (cached afterwards). Normal site traffic never pays it.
router.use(async (req, res, next) => {
  try { await ensurePanelSchema(); next(); } catch (e) { next(e); }
});

// --- Audit log (Phase 1) ---
router.get('/audit', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const c = getClient();
    const r = await c.execute('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 50');
    res.json({ audit: r.rows });
  } catch (e) { next(e); }
});
router.post('/audit', requireAuth, requireRole('admin'), csrfProtect, async (req, res, next) => {
  try {
    const c = getClient();
    await c.execute({ sql: 'INSERT INTO audit_logs (admin_id, action, detail) VALUES (?,?,?)', args: [req.user.userId, String(req.body.action || '').slice(0, 100), String(req.body.detail || '').slice(0, 500)] });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

async function audit(c, adminId, action, detail) {
  await c.execute({ sql: 'INSERT INTO audit_logs (admin_id, action, detail) VALUES (?,?,?)', args: [adminId, action, String(detail || '').slice(0, 500)] });
}

// Env-key presence for the wired providers (config field per registry envKey).
function envHasKey(entry) {
  if (!entry.envKey) return false;
  const map = { GEMINI_API_KEY: config.geminiKey, GROQ_API_KEY: config.groqKey, OPENROUTER_API_KEY: config.openrouterKey, MODEL_API_KEY: config.museKey };
  return !!map[entry.envKey];
}

function validKeyString(s) {
  return typeof s === 'string' && s.trim().length >= 8 && s.length <= 2000;
}

// --- Providers: status, usage, keys, toggles ---
router.get('/providers', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const c = getClient();
    const today = new Date().toISOString().slice(0, 10);
    const month = new Date().toISOString().slice(0, 7);
    const cfg = await c.execute('SELECT provider, encrypted_key, key_hint, enabled FROM provider_config');
    const cfgById = {};
    for (const row of cfg.rows) cfgById[row.provider] = row;
    const todayRows = await c.execute({ sql: "SELECT provider, COUNT(*) AS n FROM exammate_history WHERE substr(created_at,1,10) = ? GROUP BY provider", args: [today] });
    const todayById = {};
    for (const row of todayRows.rows) todayById[row.provider] = Number(row.n);
    const monthRows = await c.execute({ sql: "SELECT provider, COALESCE(SUM(tokens_used),0) AS t FROM ai_usage WHERE substr(created_at,1,7) = ? GROUP BY provider", args: [month] });
    const monthById = {};
    for (const row of monthRows.rows) monthById[row.provider] = Number(row.t);
    const providers = PROVIDERS.map((p) => {
      const row = cfgById[p.id];
      const hasPanelKey = !!(row && row.encrypted_key);
      return {
        id: p.id, name: p.name, wired: p.wired,
        dailyLimit: p.dailyLimit, limitPeriod: p.limitPeriod, limitNote: p.limitNote,
        keyFields: p.keyFields || [{ name: 'key', label: 'API Key' }],
        keySource: hasPanelKey ? 'panel' : (envHasKey(p) ? 'env' : 'none'),
        keyHint: hasPanelKey ? row.key_hint : null,
        enabled: row ? !!row.enabled : true,
        today: todayById[p.id] || 0,
        monthTokens: monthById[p.id] || 0,
      };
    });
    res.json({ providers });
  } catch (e) { next(e); }
});

// Save a provider key (encrypted). Body: { key } or { fields: {...} }.
router.post('/providers/:id/key', requireAuth, requireRole('admin'), csrfProtect, async (req, res, next) => {
  try {
    const entry = getProvider(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Unknown provider.' });
    let stored;
    let hint;
    if (entry.keyFields) {
      const fields = (req.body && req.body.fields) || {};
      const values = {};
      for (const f of entry.keyFields) {
        if (!validKeyString(fields[f.name])) return res.status(400).json({ error: `Please enter a valid ${f.label}.` });
        values[f.name] = String(fields[f.name]).trim();
      }
      stored = JSON.stringify(values);
      hint = keyHint(values[entry.keyFields[0].name]);
    } else {
      if (!validKeyString(req.body && req.body.key)) return res.status(400).json({ error: 'Please enter a valid API key.' });
      stored = String(req.body.key).trim();
      hint = keyHint(stored);
    }
    const c = getClient();
    await c.execute({
      sql: `INSERT INTO provider_config (provider, encrypted_key, key_hint, enabled, updated_at) VALUES (?,?,?,1,datetime('now'))
        ON CONFLICT(provider) DO UPDATE SET encrypted_key = excluded.encrypted_key, key_hint = excluded.key_hint, updated_at = datetime('now')`,
      args: [entry.id, encryptKey(stored), hint],
    });
    await audit(c, req.user.userId, 'provider_key_set', entry.id);
    res.json({ ok: true, keySource: 'panel', keyHint: hint });
  } catch (e) { next(e); }
});

// Delete a provider key (keeps the enabled flag row).
router.delete('/providers/:id/key', requireAuth, requireRole('admin'), csrfProtect, async (req, res, next) => {
  try {
    const entry = getProvider(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Unknown provider.' });
    const c = getClient();
    await c.execute({ sql: 'UPDATE provider_config SET encrypted_key = NULL, key_hint = NULL, updated_at = datetime(\'now\') WHERE provider = ?', args: [entry.id] });
    await audit(c, req.user.userId, 'provider_key_deleted', entry.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Enable / disable a provider. Body: { enabled: true|false }.
router.post('/providers/:id/toggle', requireAuth, requireRole('admin'), csrfProtect, async (req, res, next) => {
  try {
    const entry = getProvider(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Unknown provider.' });
    if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be true or false.' });
    const c = getClient();
    await c.execute({
      sql: `INSERT INTO provider_config (provider, encrypted_key, key_hint, enabled, updated_at) VALUES (?, NULL, NULL, ?, datetime('now'))
        ON CONFLICT(provider) DO UPDATE SET enabled = excluded.enabled, updated_at = datetime('now')`,
      args: [entry.id, req.body.enabled ? 1 : 0],
    });
    await audit(c, req.user.userId, 'provider_toggled', `${entry.id} -> ${req.body.enabled ? 'on' : 'off'}`);
    res.json({ ok: true, enabled: req.body.enabled });
  } catch (e) { next(e); }
});

// --- Notifications (the bell) ---
router.get('/notifications', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const c = getClient();
    res.json(await listNotifications(c, 50));
  } catch (e) { next(e); }
});
router.post('/notifications/:id/read', requireAuth, requireRole('admin'), csrfProtect, async (req, res, next) => {
  try {
    const c = getClient();
    await markRead(c, Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});
router.post('/notifications/read-all', requireAuth, requireRole('admin'), csrfProtect, async (req, res, next) => {
  try {
    const c = getClient();
    await markAllRead(c);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
