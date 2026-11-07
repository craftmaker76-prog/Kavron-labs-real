// Runs every migration file once, in filename order. Safe to re-run.
// SQLite-compatible, so the same files work for local file DB and Turso.
const fs = require('fs');
const path = require('path');
const { getClient } = require('./client');
async function migrate() {
  const c = getClient();
  await c.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const done = await c.execute({ sql: 'SELECT name FROM schema_migrations WHERE name = ?', args: [file] });
    if (done.rows.length) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await c.executeMultiple(sql);
    await c.execute({ sql: 'INSERT INTO schema_migrations (name) VALUES (?)', args: [file] });
    console.log('Applied migration:', file);
  }
}
if (require.main === module) migrate().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
module.exports = { migrate };
