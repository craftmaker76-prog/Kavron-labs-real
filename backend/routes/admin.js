const express = require('express');
const router = express.Router();
const { getClient } = require('../db/client');
const { requireAuth, requireRole } = require('../middleware/auth');
const { csrfProtect } = require('../middleware/csrf');
// Admin-only. Role is checked on the server, not by hiding a link.
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
module.exports = router;
