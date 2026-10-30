// Backup: exports every table to a JSON file in database/backups/.
// For Turso production, the same export works via @libsql/client, and
// the Turso CLI dump method is documented in docs/BACKUP-RESTORE.md.
// Backup files are gitignored and must be copied off-site (see docs).
const fs = require('fs');
const path = require('path');
const { migrate } = require('../backend/db/migrate');
const { getClient } = require('../backend/db/client');
const TABLES = ['users', 'sessions', 'login_attempts', 'rate_limits', 'ai_usage', 'exammate_history', 'audit_logs'];
async function backup(outPath) {
  await migrate();
  const c = getClient();
  const data = {};
  for (const t of TABLES) {
    const r = await c.execute(`SELECT * FROM ${t}`);
    // Never export password hashes or session token hashes in a plain backup copy.
    data[t] = r.rows.map(row => { const o = { ...row }; delete o.password_hash; delete o.token_hash; return o; });
  }
  const dir = path.join(__dirname, '..', 'database', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = outPath || path.join(dir, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log('Backup written:', file);
  return file;
}
if (require.main === module) backup(process.argv[2]).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
module.exports = { backup, TABLES };
