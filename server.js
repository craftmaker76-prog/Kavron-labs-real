// VPS / Docker entry ONLY. This is the persistent server.
// Graceful shutdown lives HERE, not in api/index.js, because only a
// long-running server has requests to finish on shutdown.
const app = require('./backend/app');
const config = require('./backend/config/env');
const { migrate } = require('./backend/db/migrate');
const { getClient } = require('./backend/db/client');
async function main() {
  await migrate();
  const server = app.listen(config.port, () => console.log(`Kavron Labs running on http://localhost:${config.port}`));
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return; shuttingDown = true;
    console.log('Shutting down gracefully...');
    server.close(async () => { try { getClient().close(); } catch {} process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
main().catch(e => { console.error(e); process.exit(1); });
