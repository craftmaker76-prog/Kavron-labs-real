// Rotation pointer for the ExamMate provider chain. Vercel functions are
// stateless, so the pointer lives in the DB, not memory: one row, one
// counter. Each ask advances the counter exactly once with a single atomic
// UPDATE ... RETURNING, then picks eligible[counter % eligibleCount] —
// so consecutive questions cycle through the eligible providers in order
// and wrap around. If the DB is unreachable, an in-memory counter backs it
// for that invocation only: rotation never throws and never blocks an
// answer. Keep the CREATE TABLE below in sync with
// backend/db/migrations/003_rotation.sql.
const { getClient } = require('../../db/client');

let ready = null;
async function ensureRotationSchema() {
  if (ready) return ready;
  ready = (async () => {
    const c = getClient();
    await c.executeMultiple(`
      CREATE TABLE IF NOT EXISTS rotation_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        counter INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO rotation_state (id, counter) VALUES (1, 0);
    `);
  })();
  // On failure, allow a retry on the next ask instead of caching it.
  ready.catch(() => { ready = null; });
  return ready;
}

let memCounter = 0;
// Advance the pointer once and return the index of the next eligible
// provider (0-based into the caller's eligible list). Never throws: any
// DB failure falls back to the in-memory counter for this invocation only.
async function pickRotationIndex(count) {
  if (!count || count <= 0) return 0;
  try {
    await ensureRotationSchema();
    const c = getClient();
    const r = await c.execute({ sql: "UPDATE rotation_state SET counter = counter + 1, updated_at = datetime('now') WHERE id = 1 RETURNING counter", args: [] });
    const counter = r.rows.length ? Number(r.rows[0].counter) : NaN;
    if (Number.isFinite(counter)) return (counter - 1) % count;
    throw new Error('rotation counter unreadable');
  } catch (e) {
    console.error('rotation pointer fell back to memory:', e.message);
    const idx = memCounter % count;
    memCounter += 1;
    return idx;
  }
}

module.exports = { ensureRotationSchema, pickRotationIndex };
