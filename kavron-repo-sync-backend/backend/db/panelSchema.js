// Admin-panel schema guard. Runs lazily on the first /api/admin request
// (cached afterwards), so the panel self-heals on Vercel without a manual
// migration step: the serverless bundle cannot reliably read .sql files.
// Idempotent: every statement is safe to re-run in any order.
// Keep the CREATE TABLE statements in sync with
// backend/db/migrations/002_admin_panel.sql.
const { getClient } = require('./client');

const TABLES_SQL = `
CREATE TABLE IF NOT EXISTS provider_config (
  provider TEXT PRIMARY KEY,
  encrypted_key TEXT,
  key_hint TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  custom_limit INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS provider_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  ok INTEGER NOT NULL DEFAULT 0,
  status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  provider TEXT,
  action TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_provider ON provider_events(provider, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read, created_at);
`;

let ready = null;
async function ensurePanelSchema() {
  if (ready) return ready;
  ready = (async () => {
    const c = getClient();
    await c.executeMultiple(TABLES_SQL);
    // History/usage tables belong to 001. Only touch them if they exist
    // (a fresh DB without 001 must not break the admin panel boot).
    const tableExists = async (table) => {
      const r = await c.execute({ sql: 'SELECT name FROM sqlite_master WHERE type = \'table\' AND name = ?', args: [table] });
      return r.rows.length > 0;
    };
    const columnsOf = async (table) => {
      const r = await c.execute(`PRAGMA table_info(${table})`);
      return new Set(r.rows.map((x) => x.name));
    };
    if (await tableExists('exammate_history')) {
      // Column FIRST, then the index on it, then the backfill.
      const historyCols = await columnsOf('exammate_history');
      if (!historyCols.has('provider')) await c.execute('ALTER TABLE exammate_history ADD COLUMN provider TEXT');
      await c.execute('CREATE INDEX IF NOT EXISTS idx_history_provider_date ON exammate_history(provider, created_at)');
      await c.execute(`UPDATE exammate_history SET provider = 'gemini' WHERE provider IS NULL`);
    }
    // Custom daily limits live ONLY here, never in a .sql migration:
    // SQLite has no IF NOT EXISTS for ADD COLUMN, so a bare ALTER in a
    // migration file would break once this guard had already run first.
    if (await tableExists('provider_config')) {
      const configCols = await columnsOf('provider_config');
      if (!configCols.has('custom_limit')) await c.execute('ALTER TABLE provider_config ADD COLUMN custom_limit INTEGER');
    }
    if (await tableExists('ai_usage')) {
      const usageCols = await columnsOf('ai_usage');
      if (!usageCols.has('provider')) await c.execute('ALTER TABLE ai_usage ADD COLUMN provider TEXT');
      await c.execute('CREATE INDEX IF NOT EXISTS idx_usage_provider_date ON ai_usage(provider, created_at)');
      await c.execute(`UPDATE ai_usage SET provider = 'gemini' WHERE provider IS NULL`);
    }
  })();
  // On failure, allow a retry on the next admin request instead of caching it.
  ready.catch(() => { ready = null; });
  return ready;
}

module.exports = { ensurePanelSchema };
