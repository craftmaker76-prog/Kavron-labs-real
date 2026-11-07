-- Rotation pointer for the ExamMate provider chain (one row, one counter).
-- Vercel functions are stateless, so consecutive asks cycle providers via
-- this counter: ask N picks eligible[counter % eligibleCount]. The live
-- self-healing guard in backend/services/exammate/rotation.js carries the
-- same statements (the serverless bundle cannot reliably read .sql files).
CREATE TABLE IF NOT EXISTS rotation_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  counter INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO rotation_state (id, counter) VALUES (1, 0);
