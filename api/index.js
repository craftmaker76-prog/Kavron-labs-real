// Vercel serverless entry ONLY - bisect probe (no secrets in output).
// Reports ONLY the type/keys of each backend piece, never any values.
const report = {};
function tryRequire(name, path) {
  try {
    const m = require(path);
    report[name] = { type: typeof m, keys: (m && typeof m === 'object') ? Object.keys(m) : null };
  } catch (e) {
    report[name] = { error: String(e && e.message ? e.message : e) };
  }
}
tryRequire('config', '../backend/config/env');
tryRequire('dbClient', '../backend/db/client');
tryRequire('healthRouter', '../backend/routes/health');
tryRequire('app', '../backend/app');
function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(report));
}
module.exports = handler;
module.exports.default = handler;
