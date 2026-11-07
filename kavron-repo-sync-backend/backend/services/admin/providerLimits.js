// Manual provider control: per-provider daily limits, computed live.
// DESIGN (user decision 2026-11-03, race rejected): the chain is strictly
// sequential — first eligible provider in registry order answers, the next
// takes over only on failure. A provider at/over its effective daily limit
// is SKIPPED for the day (auto-off). Auto-off is computed live from the
// Today question count, NEVER by writing enabled=false, so limits re-arm
// automatically the next day when the count resets. Manually-OFF providers
// are never auto-turned on: only already-enabled providers can take over.
// Effective limit = custom limit set in the panel, else the published
// registry daily limit, else unlimited (null). A custom limit of 0 is a
// real limit (provider always skipped); null/empty clears the custom limit.
const { PROVIDERS, getProvider } = require('../exammate/registry');

function effectiveLimitFor(entry, customLimit) {
  if (customLimit !== null && customLimit !== undefined) return customLimit;
  if (entry && entry.dailyLimit !== null && entry.dailyLimit !== undefined) return entry.dailyLimit;
  return null;
}

// Validate a custom-limit value from the panel (or API). Accepts a JSON
// number (integer 0..1000000) or null/empty to clear. Strings, booleans,
// floats, negatives and absurd values are rejected — the route returns 400.
function parseCustomLimit(value) {
  if (value === null || value === undefined || value === '') return { ok: true, limit: null };
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { ok: false, error: 'Daily limit must be a whole number of questions per day, or empty to clear it.' };
  }
  if (value < 0 || value > 1000000) {
    return { ok: false, error: 'Daily limit must be between 0 and 1000000 questions per day.' };
  }
  return { ok: true, limit: value };
}

// Fire the limit-hit notification exactly when a provider's Today count
// first reaches its effective limit (counts rise by 1 per ask, so === is
// the transition; a provider already past its limit was never attempted).
function shouldNotifyLimitHit(todayCount, effectiveLimit) {
  return effectiveLimit !== null && effectiveLimit !== undefined && effectiveLimit > 0 && todayCount === effectiveLimit;
}

// Full per-provider state for one ask, from one DB round trip each for
// config and Today counts. `today` uses the UTC date, the same convention
// as the panel GET and the ask route (created_at defaults to UTC now).
async function getProviderStates(c) {
  const today = new Date().toISOString().slice(0, 10);
  const cfg = await c.execute('SELECT provider, enabled, custom_limit FROM provider_config');
  const cfgById = {};
  for (const row of cfg.rows) cfgById[row.provider] = row;
  const todayRows = await c.execute({ sql: "SELECT provider, COUNT(*) AS n FROM exammate_history WHERE substr(created_at,1,10) = ? GROUP BY provider", args: [today] });
  const todayById = {};
  for (const row of todayRows.rows) todayById[row.provider] = Number(row.n);
  const states = {};
  for (const p of PROVIDERS) {
    const row = cfgById[p.id];
    const enabled = row ? !!row.enabled : true;
    const rawCustom = row ? row.custom_limit : null;
    const customLimit = rawCustom === null || rawCustom === undefined || Number.isNaN(Number(rawCustom)) ? null : Number(rawCustom);
    const effectiveLimit = effectiveLimitFor(p, customLimit);
    const todayCount = todayById[p.id] || 0;
    const autoOff = enabled && effectiveLimit !== null && todayCount >= effectiveLimit;
    const status = !enabled ? 'Off' : (autoOff ? 'Auto-off (limit reached)' : 'Active');
    states[p.id] = { enabled, customLimit, effectiveLimit, today: todayCount, autoOff, status };
  }
  return states;
}

// Who answers the NEXT question after `excludeId` hit its limit (or is
// otherwise unavailable)? First provider in registry order that is wired,
// enabled, keyed and under its limit — Muse is never a "next" here: it is
// the dormant sequential-last fallback, not part of manual selection.
function findNextProvider(states, keys, excludeId) {
  for (const p of PROVIDERS) {
    if (!p.wired || p.id === 'muse' || p.id === excludeId) continue;
    const s = states[p.id];
    if (!s || !s.enabled || s.autoOff) continue;
    if (!keys || !keys[p.id]) continue;
    return p;
  }
  return null;
}

module.exports = { effectiveLimitFor, parseCustomLimit, shouldNotifyLimitHit, getProviderStates, findNextProvider };
