// Seed: one test user + one exammate history row, for local testing only.
// Never run seed in production.
const { migrate } = require('../backend/db/migrate');
const { getClient } = require('../backend/db/client');
const { hashPassword } = require('../backend/auth/password');
async function main() {
  await migrate();
  const c = getClient();
  const hash = await hashPassword('Test1234!');
  await c.execute({ sql: 'INSERT INTO users (email, password_hash, role) VALUES (?,?,?) ON CONFLICT(email) DO NOTHING', args: ['test@example.com', hash, 'user'] });
  const u = await c.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: ['test@example.com'] });
  await c.execute({ sql: 'INSERT INTO exammate_history (user_id, country, province, class_name, subject, question, answer) VALUES (?,?,?,?,?,?,?)', args: [u.rows[0].id, 'Pakistan', 'Punjab', 'Class 10', 'Mathematics', 'What is 2+2?', '4'] });
  console.log('Seeded test user test@example.com');
}
if (require.main === module) main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
module.exports = { main };
