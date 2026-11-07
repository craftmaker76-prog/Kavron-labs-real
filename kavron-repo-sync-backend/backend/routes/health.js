const express = require('express');
const router = express.Router();
const { ping } = require('../db/client');
// /health: no auth. Used by Render / Railway / VPS health checks.
// Returns ok only if the server is up; db status is reported honestly.
router.get('/health', async (req, res) => {
  let db = 'unknown';
  try { await ping(); db = 'connected'; } catch { db = 'disconnected'; }
  res.json({ status: db === 'connected' ? 'ok' : 'degraded', service: 'kavron-labs', time: new Date().toISOString(), db });
});
router.get('/ready', async (req, res) => {
  try { await ping(); res.json({ ready: true }); }
  catch { res.status(503).json({ ready: false, error: 'Database is not ready.' }); }
});
module.exports = router;
