// Provider keys, encrypted at rest. No new secret is introduced: the master
// key is derived from SESSION_SECRET (already in Vercel env, never stored,
// never transmitted, never written in code).
//   master = SHA256(SESSION_SECRET + ':provider-keys')
// Format: base64(iv) + ':' + base64(authTag) + ':' + base64(ciphertext),
// AES-256-GCM via node:crypto (no new dependency).
// Honest trade-off: if SESSION_SECRET ever rotates, every stored provider
// key must be re-entered in the panel (old ciphertext cannot be decrypted).
const crypto = require('crypto');
const config = require('../../config/env');

function masterKey() {
  return crypto.createHash('sha256').update(String(config.sessionSecret) + ':provider-keys').digest();
}

function encryptKey(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

function decryptKey(stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 3) throw new Error('Bad encrypted key format');
  const [iv, tag, data] = parts.map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// What the panel may show: never the key, only its last 4 characters.
function keyHint(plain) {
  const s = String(plain || '');
  return s.length > 4 ? '••••' + s.slice(-4) : '••••';
}

module.exports = { encryptKey, decryptKey, keyHint };
