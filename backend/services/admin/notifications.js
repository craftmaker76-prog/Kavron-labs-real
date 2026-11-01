// Admin notifications (the panel bell). Stored in the DB, admin-only.
// ANTI-SPAM: one unread notification per (type, provider). A repeat event
// refreshes the existing unread row instead of creating a duplicate, so a
// failing provider cannot flood the bell or the admin's attention.
// RETENTION: only the latest 100 notifications are kept.
async function createNotification(c, { type, severity, title, message, provider, action }) {
  const existing = await c.execute({
    sql: 'SELECT id FROM notifications WHERE type = ? AND provider IS ? AND is_read = 0 ORDER BY id DESC LIMIT 1',
    args: [type, provider || null],
  });
  // NOTE: `provider IS ?` with NULL matches NULL rows in SQLite; for a
  // non-null provider it behaves like =. (provider is always a string or
  // null in our calls, never undefined.)
  if (existing.rows.length) {
    await c.execute({
      sql: 'UPDATE notifications SET title = ?, message = ?, severity = ?, action = ?, created_at = datetime(\'now\') WHERE id = ?',
      args: [title, message, severity || 'info', action || null, existing.rows[0].id],
    });
    return existing.rows[0].id;
  }
  const r = await c.execute({
    sql: 'INSERT INTO notifications (type, severity, title, message, provider, action) VALUES (?,?,?,?,?,?)',
    args: [type, severity || 'info', title, message, provider || null, action || null],
  });
  const id = Number(r.lastInsertRowid);
  await c.execute('DELETE FROM notifications WHERE id NOT IN (SELECT id FROM notifications ORDER BY id DESC LIMIT 100)');
  return id;
}

async function listNotifications(c, limit) {
  const r = await c.execute({
    sql: 'SELECT id, type, severity, title, message, provider, action, is_read, created_at FROM notifications ORDER BY is_read ASC, id DESC LIMIT ?',
    args: [limit || 50],
  });
  const n = await c.execute('SELECT COUNT(*) AS n FROM notifications WHERE is_read = 0');
  return { notifications: r.rows, unread: Number(n.rows[0].n) };
}

async function markRead(c, id) {
  await c.execute({ sql: 'UPDATE notifications SET is_read = 1 WHERE id = ?', args: [id] });
}

async function markAllRead(c) {
  await c.execute('UPDATE notifications SET is_read = 1 WHERE is_read = 0');
}

module.exports = { createNotification, listNotifications, markRead, markAllRead };
