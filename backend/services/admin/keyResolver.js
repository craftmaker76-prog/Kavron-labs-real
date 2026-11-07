// Resolves the effective provider keys for one ask: panel key first,
// Vercel env key as fallback. A panel key saved by the admin takes over
// instantly (no redeploy); deleting it falls back to the env key.
// A key that fails to decrypt (e.g. SESSION_SECRET was rotated) is skipped
// with a logged error — it must never break an ask.
// Only the chain-wired providers are resolved here. Keys saved for
// unwired providers sit encrypted in the panel until their chain entry
// is built; they are listed (presence only) by the panel, never used.
const config = require('../../config/env');
const { getClient } = require('../../db/client');
const { decryptKey } = require('./keyCrypto');

const ENV_KEYS = { gemini: 'geminiKey', groq: 'groqKey', openrouter: 'openrouterKey', mistral: 'mistralKey', cohere: 'cohereKey', iteracompute: 'iteracomputeKey', pollinations: 'pollinationsKey', cloudflare: 'cloudflareKey', nvidia: 'nvidiaKey', muse: 'museKey' };

async function resolveProviderKeys() {
  const keys = {};
  const enabled = {};
  for (const id of Object.keys(ENV_KEYS)) {
    keys[id] = config[ENV_KEYS[id]] || '';
    enabled[id] = true;
  }
  try {
    const c = getClient();
    const rows = await c.execute('SELECT provider, encrypted_key, enabled FROM provider_config');
    for (const row of rows.rows) {
      if (!ENV_KEYS[row.provider]) continue;
      enabled[row.provider] = !!row.enabled;
      if (!row.encrypted_key) continue;
      try {
        const plain = decryptKey(row.encrypted_key);
        // Every wired provider stores one raw key string in the panel.
        // (Cloudflare's Account ID is an env var, never a panel field, so
        // its panel key is just the API token — no JSON to parse here.)
        keys[row.provider] = plain;
      } catch (e) {
        console.error('provider key decrypt failed for', row.provider, '- falling back to env key');
      }
    }
  } catch (e) {
    console.error('provider key resolution failed, using env keys only:', e.message);
  }
  return { keys, enabled };
}

module.exports = { resolveProviderKeys };
