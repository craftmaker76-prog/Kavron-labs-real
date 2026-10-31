// Vercel serverless entry ONLY. No business logic lives here.
// Vercel returned "app is not a function" for the plain require, so
// unwrap whatever shape backend/app arrives in: a function, .default, or .app.
const loaded = require('../backend/app');
const app = (typeof loaded === 'function') ? loaded : (loaded && (loaded.default || loaded.app));
function handler(req, res) { return app(req, res); }
module.exports = handler;
module.exports.default = handler;
module.exports.app = app;
