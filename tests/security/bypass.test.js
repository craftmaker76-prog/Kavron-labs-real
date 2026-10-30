const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kavron-sec-'));
process.env.TURSO_DATABASE_URL = 'file:' + path.join(tmp, 'sec.db');
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
const request = require('supertest');
const { migrate } = require('../../backend/db/migrate');
const app = require('../../backend/app');
test('security: auth bypass, injection, oversize body', async () => {
  await migrate();
  const agent = request.agent(app);
  // Unauthenticated exammate must be 401
  const unauth = await agent.post('/api/exammate/ask').send({ question: 'Hi' });
  assert.equal(unauth.status, 401);
  // SQL injection attempt in login must not log in
  const inj = await agent.post('/api/auth/login').send({ email: "' OR '1'='1", password: 'x' });
  assert.ok([400, 401].includes(inj.status));
  // Oversize body must be rejected, not crash the server
  const big = await agent.post('/api/auth/register').set('Content-Type', 'application/json').send({ email: 'b@test.com', password: 'x'.repeat(200000) });
  assert.ok([400, 413].includes(big.status));
  const stillUp = await agent.get('/health'); assert.equal(stillUp.status, 200);
});
