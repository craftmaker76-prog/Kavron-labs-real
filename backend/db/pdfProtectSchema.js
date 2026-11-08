// PDF Protect/Unlock schema guard (Hissa 3: Protect PDF + Unlock PDF).
// Runs lazily on the first /api/pdf request (cached afterwards), so the
// table self-heals on Vercel without a manual migration step: the
// serverless bundle cannot reliably read .sql files. Idempotent: every
// statement is safe to re-run in any order.
// Keep the CREATE TABLE statements in sync with
// backend/db/migrations/005_pdf_protect.sql.
const { getClient } = require('./client');

const TABLES_SQL = `
CREATE TABLE IF NOT EXISTS pdf_tool_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  tool TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pdf_tool_usage_user_date ON pdf_tool_usage(user_id, created_at);
`;

let ready = null;
async function ensurePdfProtectSchema() {
  if (ready) return ready;
  ready = (async () => {
    const c = getClient();
    await c.executeMultiple(TABLES_SQL);
  })();
  // On failure, allow a retry on the next request instead of caching it.
  ready.catch(() => { ready = null; });
  return ready;
}

module.exports = { ensurePdfProtectSchema };
