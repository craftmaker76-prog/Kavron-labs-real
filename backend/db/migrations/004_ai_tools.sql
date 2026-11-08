-- 004_ai_tools: Hissa 1 AI tools — per-user daily usage (quota) and saved results.
-- Idempotent: safe to run any number of times, in any order with
-- backend/db/aiToolsSchema.js (the app applies the same statements on boot,
-- because the serverless bundle cannot reliably read .sql files).
-- Keep the CREATE TABLE statements in sync with aiToolsSchema.js.
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
