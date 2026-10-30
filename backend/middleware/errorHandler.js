// Global error handling + safe logging.
// - The server never crashes on an unexpected error.
// - The user gets a clean message, never a stack trace or DB detail.
// - The log records type + route + time, but NEVER passwords, tokens,
//   session values, or student question/answer content.
const config = require('../config/env');
function safeLog(err, req) {
  const entry = { time: new Date().toISOString(), method: req && req.method, path: req && req.path, message: err && err.message ? String(err.message).slice(0, 300) : 'Unknown error' };
  console.error(JSON.stringify(entry));
}
function notFound(req, res) { res.status(404).json({ error: 'This page was not found.' }); }
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  safeLog(err, req);
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large.' });
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
module.exports = { safeLog, notFound, errorHandler };
