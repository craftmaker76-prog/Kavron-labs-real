// Creates an admin user. Run: node scripts/create-admin.js admin@example.com
// Password is read from ADMIN_PASSWORD env, NEVER typed in chat or committed.
// Example (local only): ADMIN_PASSWORD='...' node scripts/create-admin.js admin@example.com
const { migrate } = require('../backend/db/migrate');
const { getClient } = require('../backend/db/client');
const { hashPassword } = require('../backend/auth/password');
async function main() {
  const email = (process.argv[2] || '').toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) { console.error('Usage: ADMIN_PASSWORD=<at least 12 chars> node scripts/create-admin.js <email>'); process.exit(1); }
  await migrate();
  const c = getClient();
  const hash = await hashPassword(password);
  await c.execute({ sql: 'INSERT INTO users (email, password_hash, role) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash, role=\'admin\'', args: [email, hash] });
  console.log('Admin ready:', email);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
