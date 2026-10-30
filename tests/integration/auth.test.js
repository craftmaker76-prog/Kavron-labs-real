const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
// Each integration test run uses its own temp DB file, via env before app load.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kavron-test-'));
process.env.TURSO_DATABASE_URL = 'file:' + path.join(tmp, 'test.db');
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
const request = require('supertest');
const { migrate } = require('../../backend/db/migrate');
const app = require('../../backend/app');
test('health, headers, CORS, login lockout, IDOR, CSRF', async () => {
  await migrate();
  const agent = request.agent(app);
  const h = await agent.get('/health'); assert.equal(h.status, 200); assert.ok(h.body.status);
  // Security headers present
  assert.ok(h.headers['x-content-type-options']); assert.ok(h.headers['x-frame-options'] || h.headers['content-security-policy']);
  // CORS: disallowed origin must not get a CORS allow header
  const corsBad = await agent.get('/health').set('Origin', 'https://evil.example');
  assert.ok(!corsBad.headers['access-control-allow-origin']);
  // Register + login
  await agent.post('/api/auth/register').send({ email: 'a@test.com', password: 'Test1234!' }).expect(201);
  const login = await agent.post('/api/auth/login').send({ email: 'a@test.com', password: 'Test1234!' });
  assert.equal(login.status, 200);
  // CSRF: exammate without CSRF header must be 403, not 200
  const noCsrf = await agent.post('/api/exammate/ask').send({ question: 'Hi' });
  assert.equal(noCsrf.status, 403);
  // IDOR: user 999 history must be 403 for a normal user (user id is not 999)
  const me = await agent.get('/api/auth/me'); assert.equal(me.status, 200);
  const idor = await agent.get('/api/exammate/history/999');
  assert.equal(idor.status, 403);
  // Admin route as normal user must be 403
  const admin = await agent.get('/api/admin/audit');
  assert.equal(admin.status, 403);
  // Login lockout: 5 failed attempts -> 423 on next try
  for (let i = 0; i < 5; i++) await agent.post('/api/auth/login').send({ email: 'a@test.com', password: 'Wrong123!' });
  const locked = await agent.post('/api/auth/login').send({ email: 'a@test.com', password: 'Test1234!' });
  assert.ok([423, 429].includes(locked.status), 'expected lockout, got ' + locked.status);
});
