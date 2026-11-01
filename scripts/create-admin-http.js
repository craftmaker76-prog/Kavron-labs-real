// Creates an admin user WITHOUT the native libsql module.
// Why this file exists: on some Windows PCs the native @libsql/win32
// binary cannot load (missing MSVC runtime) and the normal
// scripts/create-admin.js fails at import time, before it even runs.
// This version talks to Turso over plain HTTPS using the pure-JS HTTP
// client, so no native code is loaded at all. It does NOT change the
// live site or its config: the TURSO values below are only for this
// one command, in this terminal.
//
// Setup: save this file as scripts/create-admin-http.js inside the
// repo folder (next to create-admin.js), then run (PowerShell,
// repo root, same terminal where the env vars are set):
//   $env:TURSO_DATABASE_URL="https://<same host as your libsql URL>"
//   $env:TURSO_AUTH_TOKEN="<token>"
//   $env:ADMIN_PASSWORD="<password, at least 12 chars>"
//   node scripts/create-admin-http.js you@example.com
// If TURSO_DATABASE_URL still starts with libsql://, it is converted
// to https:// automatically (same host), so either form works.
// Password is read from ADMIN_PASSWORD env, NEVER typed in chat.
const { createClient } = require('@libsql/client/http');
const { hashPassword } = require('../backend/auth/password');

async function main() {
  const email = (process.argv[2] || '').toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  let url = process.env.TURSO_DATABASE_URL || '';
  const token = process.env.TURSO_AUTH_TOKEN || '';
  if (!email || !password || password.length < 12) {
    console.error('Usage: ADMIN_PASSWORD=<at least 12 chars> node scripts/create-admin-http.js you@example.com');
    process.exit(1);
  }
  if (!url || !token) {
    console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN env vars. Set them in this terminal first, then re-run.');
    process.exit(1);
  }
  if (url.startsWith('libsql://')) url = 'https://' + url.slice('libsql://'.length);
  const c = createClient({ url, authToken: token });
  const hash = await hashPassword(password);
  await c.execute({
    sql: "INSERT INTO users (email, password_hash, role) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash, role='admin'",
    args: [email, hash],
  });
  console.log('Admin ready:', email);
  c.close();
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
