// Vercel serverless entry ONLY. No business logic lives here.
// Vercel reported "No exports found" for a bare Express app export,
// so export an explicit handler function as well as .default and .app.
const app = require('../backend/app');
function handler(req, res) { return app(req, res); }
module.exports = handler;
module.exports.default = handler;
module.exports.app = app;
