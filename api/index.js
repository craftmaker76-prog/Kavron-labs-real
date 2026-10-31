// Vercel serverless entry ONLY - diagnostic version.
// If backend/app does not arrive as a function, answer with what it
// actually is instead of crashing, so the next fix is based on fact.
const loaded = require('../backend/app');
const app = (typeof loaded === 'function') ? loaded : (loaded && (loaded.default || loaded.app));
function handler(req, res) {
  if (typeof app === 'function') return app(req, res);
  res.statusCode = 500;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    error: 'backend/app is not a function on Vercel',
    loadedType: typeof loaded,
    loadedKeys: loaded && typeof loaded === 'object' ? Object.keys(loaded) : null,
    hasDefault: !!(loaded && loaded.default),
    hasApp: !!(loaded && loaded.app)
  }));
}
module.exports = handler;
module.exports.default = handler;
module.exports.app = app;
