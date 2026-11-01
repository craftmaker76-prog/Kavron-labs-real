// Per-attempt bookkeeping for the admin panel bell. Called fire-and-forget
// from the ask flow (the chain never awaits it): a failure here must never
// break an answer. The caller wraps this in try/catch as well.
// Alerts (all deduped by the notifications helper, so repeats refresh one
// unread row instead of spamming):
//  - 429 on any provider  -> 'provider_quota' warning (limit khatam).
//  - 3+ failures for one provider within 1 hour -> 'provider_failing'.
//  - 80% of a published daily limit -> handled in the ask route (it knows
//    the count); see shouldWarn80.
const { getProvider } = require('../exammate/registry');
const { createNotification } = require('./notifications');

function shouldWarn80(todayCount, dailyLimit) {
  if (!dailyLimit || dailyLimit <= 0) return false;
  return todayCount === Math.ceil(dailyLimit * 0.8);
}

async function recordAttempt(c, { provider, ok, status }) {
  await c.execute({ sql: 'INSERT INTO provider_events (provider, ok, status) VALUES (?,?,?)', args: [provider, ok ? 1 : 0, String(status)] });
  if (ok) return;
  const entry = getProvider(provider);
  const name = entry ? entry.name : provider;
  if (status === 429) {
    await createNotification(c, {
      type: 'provider_quota', severity: 'warning',
      title: `${name} ki limit khatam`,
      message: `${name} ne limit khatam hone ka jawab diya (429). Chain ne agle provider se jawab le liya hoga, lekin is provider ki key badalne ya kal tak wait karne ki zaroorat hai.`,
      provider, action: provider,
    });
    return;
  }
  const streak = await c.execute({
    sql: "SELECT COUNT(*) AS n FROM provider_events WHERE provider = ? AND ok = 0 AND created_at >= datetime('now','-1 hour')",
    args: [provider],
  });
  if (Number(streak.rows[0].n) >= 3) {
    await createNotification(c, {
      type: 'provider_failing', severity: 'warning',
      title: `${name} fail ho raha hai`,
      message: `${name} pichhle 1 ghante me 3+ dafa fail ho chuka hai. Key ya provider ki haalat check karo.`,
      provider, action: provider,
    });
  }
}

module.exports = { recordAttempt, shouldWarn80 };
