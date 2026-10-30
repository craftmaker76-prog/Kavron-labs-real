// Vercel serverless entry ONLY. No business logic lives here.
// Express is exported as a Vercel function. Graceful shutdown does NOT
// apply here — serverless instances are short-lived by design.
const app = require('../backend/app');
module.exports = app;
