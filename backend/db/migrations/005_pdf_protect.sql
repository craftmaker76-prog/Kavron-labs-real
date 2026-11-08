-- 005_pdf_protect: Hissa 3 Protect/Unlock PDF — per-user daily usage (quota).
-- Idempotent: safe to run any number of times, in any order with
-- backend/db/pdfProtectSchema.js (the app applies the same statements on
-- first /api/pdf request, because the serverless bundle cannot reliably
-- read .sql files).
-- Keep the CREATE TABLE statements in sync with pdfProtectSchema.js.
CREATE TABLE IF NOT EXISTS pdf_tool_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  tool TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pdf_tool_usage_user_date ON pdf_tool_usage(user_id, created_at);
