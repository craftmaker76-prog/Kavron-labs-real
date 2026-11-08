// AI Tools schema guard (Hissa 1: 4 AI tools + quotas + saved results).
// Runs lazily on the first /api/ai request (cached afterwards), so the
// tables self-heal on Vercel without a manual migration step: the
// serverless bundle cannot reliably read .sql files. Idempotent: every
// statement is safe to re-run in any order.
// Keep the CREATE TABLE statements in sync with
// backend/db/migrations/004_ai_tools.sql.
const { getClient } = require('./client');

const TABLES_SQL = `
CREATE TABLE IF NOT EXISTS ai_tool_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  tool TEXT NOT NULL,
  provider TEXT,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ai_saved_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  tool TEXT NOT NULL,
  input TEXT NOT NULL,
  output_html TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_tool_usage_user_date ON ai_tool_usage(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_tool_usage_provider_date ON ai_tool_usage(provider, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_saved_user ON ai_saved_results(user_id, created_at);
`;

let ready = null;
async function ensureAiToolsSchema() {
  if (ready) return ready;
  ready = (async () => {
    const c = getClient();
    await c.executeMultiple(TABLES_SQL);
  })();
  // On failure, allow a retry on the next request instead of caching it.
  ready.catch(() => { ready = null; });
  return ready;
}

module.exports = { ensureAiToolsSchema };
