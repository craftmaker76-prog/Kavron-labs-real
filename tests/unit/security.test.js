const test = require('node:test');
const assert = require('node:assert');
const { hashPassword, verifyPassword } = require('../../backend/auth/password');
const { sanitizeAiOutput, aiTextToSafeHtml } = require('../../backend/services/exammate/sanitize');
test('password hashing: bcryptjs verifies correct password and rejects wrong', async () => {
  const h = await hashPassword('Test1234!');
  assert.ok(await verifyPassword('Test1234!', h));
  assert.ok(!(await verifyPassword('Wrong123!', h)));
  assert.ok(!h.includes('Test1234!'));
});
test('AI output sanitization: script and onerror are removed', () => {
  const out = sanitizeAiOutput('<p>Hello</p><script>alert(1)</script><img src=x onerror=alert(1)>');
  assert.ok(!out.includes('<script')); assert.ok(!out.includes('onerror')); assert.ok(out.includes('Hello'));
});
test('AI text escaping: < is escaped, not executed', () => {
  const out = aiTextToSafeHtml('<script>alert(1)</script>');
  assert.ok(!out.includes('<script>alert'));
});
