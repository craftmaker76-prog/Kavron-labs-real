// Restore: imports a backup JSON into the current DB (for testing, use a
// separate TURSO_DATABASE_URL file DB). Password/token hashes were not
// exported, so restored users/sessions must be recreated via create-admin.
// This is intentional: a backup copy must not leak credentials.
const fs = require('fs');
const { getClient } = require('../backend/db/client');
const { migrate } = require('../backend/db/migrate');
async function restore(file) {
  if (!file || !fs.existsSync(file)) { console.error('Backup file not found:', file); process.exit(1); }
  await migrate();
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const c = getClient();
  for (const [table, rows] of Object.entries(data)) {
    if (!Array.isArray(rows) || !rows.length) continue;
    // Only restore non-credential tables fully; users/sessions are counted, not re-inserted with hashes.
    if (table === 'users' || table === 'sessions') { console.log(`Skipped credential table ${table} (${rows.length} rows counted, not re-inserted)`); continue; }
    for (const row of rows) {
      const cols = Object.keys(row);
      const placeholders = cols.map(() => '?').join(',');
      await c.execute({ sql: `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`, args: cols.map(k => row[k]) });
    }
    console.log(`Restored ${table}: ${rows.length} rows`);
  }
}
if (require.main === module) restore(process.argv[2]).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
module.exports = { restore };
