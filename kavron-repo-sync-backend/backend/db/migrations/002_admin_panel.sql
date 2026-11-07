-- 002_admin_panel: provider keys (encrypted), notifications, provider tracking.
-- Idempotent: safe to run any number of times, in any order with panelSchema.
-- DESIGN NOTE: this file creates ONLY the new tables. The provider columns
-- on exammate_history / ai_usage, their indexes, and the factual backfill
-- live ONLY in backend/db/panelSchema.js (the app applies them on boot),
-- because SQLite has no IF NOT EXISTS for ADD COLUMN: a column reference
-- in this file would break it whenever panelSchema had already run first.
-- Keep the CREATE TABLE statements in sync with panelSchema.js.
CREATE TABLE IF NOT EXISTS provider_config (
  provider TEXT PRIMARY KEY,
  encrypted_key TEXT,
  key_hint TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
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
