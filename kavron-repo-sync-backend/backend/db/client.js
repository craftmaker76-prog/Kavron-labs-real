// One database client for both environments, via @libsql/client.
// Local dev: a SQLite file (file:./data/local.db) — works on a laptop / VPS.
// Vercel production: Turso (libsql://...) — serverless has no persistent disk,
// so a file database would be lost on every request. Code does not change,
// only TURSO_DATABASE_URL / TURSO_AUTH_TOKEN change.
const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');
const config = require('../config/env');

let client = null;
function getClient() {
  if (client) return client;
  if (config.dbUrl.startsWith('file:')) {
    const filePath = config.dbUrl.replace('file:', '');
    const dir = path.dirname(path.resolve(filePath));
    fs.mkdirSync(dir, { recursive: true });
  }
  client = createClient({ url: config.dbUrl, authToken: config.dbToken });
  return client;
}
async function ping() {
  const c = getClient();
  await c.execute('SELECT 1 AS ok');
  return true;
}
module.exports = { getClient, ping };
