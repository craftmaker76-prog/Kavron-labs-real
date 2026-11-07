const express = require('express');
const router = express.Router();
const config = require('../config/env');
const { getClient } = require('../db/client');
const { requireAuth, requireOwnership } = require('../middleware/auth');
const { csrfProtect } = require('../middleware/csrf');
const { dbRateLimit } = require('../middleware/rateLimit');
const { cleanText, EXAMMATE_MAX_QUESTION, EXAMMATE_MAX_SUBJECT } = require('../validators');
const { aiTextToSafeHtml } = require('../services/exammate/sanitize');
const { buildTutorPrompt } = require('../services/exammate/tutorPrompt');
const { askWithFallback } = require('../services/exammate/providers');
const { ensurePanelSchema } = require('../db/panelSchema');
const { resolveProviderKeys } = require('../services/admin/keyResolver');
const { recordAttempt, shouldWarn80 } = require('../services/admin/providerEvents');
const { createNotification } = require('../services/admin/notifications');
const { getProvider } = require('../services/exammate/registry');
const { getProviderStates, findNextProvider, shouldNotifyLimitHit } = require('../services/admin/providerLimits');
// Per-user daily cap, counted in the DB (Vercel-safe, not memory).
async function dailyUsage(userId) {
  const c = getClient();
  const today = new Date().toISOString().slice(0, 10);
  const r = await c.execute({ sql: "SELECT COUNT(*) AS n FROM exammate_history WHERE user_id = ? AND substr(created_at,1,10) = ?", args: [userId, today] });
  return Number(r.rows[0].n);
}
async function monthlyTokens() {
  const c = getClient();
  const month = new Date().toISOString().slice(0, 7);
  const r = await c.execute({ sql: "SELECT COALESCE(SUM(tokens_used),0) AS t FROM ai_usage WHERE substr(created_at,1,7) = ?", args: [month] });
  return Number(r.rows[0].t);
}
// POST /api/exammate/ask — requires login + CSRF + per-IP rate limit.
router.post('/ask', requireAuth, csrfProtect, dbRateLimit({ limit: 30, windowMinutes: 60, keyFn: req => 'exammate:' + req.user.userId }), async (req, res, next) => {
  try {
    const question = cleanText(req.body && req.body.question);
    const subject = cleanText(req.body && req.body.subject);
    const country = cleanText(req.body && req.body.country);
    const province = cleanText(req.body && req.body.province);
    const className = cleanText(req.body && req.body.className);
    const board = cleanText(req.body && req.body.board);
    if (!question || question.length > EXAMMATE_MAX_QUESTION) {
      return res.status(400).json({ error: `Question must be 1 to ${EXAMMATE_MAX_QUESTION} characters.` });
    }
    // Step-by-step gate (user requirement 2026-11-03): all five fields
    // are MANDATORY for every country, in order Country -> Province/State
    // -> Class -> Board -> Subject. cleanText trims, so missing, empty and
    // whitespace-only all arrive here as ''. First missing step wins, and
    // its message matches the frontend exactly.
    if (!country) {
      return res.status(400).json({ error: 'Please select your Country first.' });
    }
    if (!province) {
      return res.status(400).json({ error: 'Please select your Province/State.' });
    }
    if (!className) {
      return res.status(400).json({ error: 'Please select your Class.' });
    }
    if (!board) {
      return res.status(400).json({ error: 'Please select your Board.' });
    }
    if (!subject) {
      return res.status(400).json({ error: 'Please select your Subject.' });
    }
    if (subject.length > EXAMMATE_MAX_SUBJECT) return res.status(400).json({ error: 'Subject is too long.' });
    if (await dailyUsage(req.user.userId) >= config.exammateDailyCap) {
      return res.status(429).json({ error: 'You have reached your daily ExamMate limit. Please try again tomorrow.' });
    }
    if (await monthlyTokens() >= config.exammateMonthlyTokenCap) {
      return res.status(503).json({ error: 'ExamMate is temporarily unavailable because the monthly AI budget has been reached.' });
    }
    // Panel keys first, env keys as fallback. Panel schema is ensured here
    // (the admin router does it for /api/admin/*, but asks arrive here).
    await ensurePanelSchema();
    const { keys: resolvedKeys, enabled } = await resolveProviderKeys();
    // Manual selection state: per-provider enabled flag, custom limit,
    // effective limit and Today count — computed live, so an auto-off
    // provider re-arms tomorrow when its count resets (no flag is ever
    // persisted for auto-off, and manually-OFF providers stay off).
    const states = await getProviderStates(getClient());
    const limits = {};
    const todayCounts = {};
    for (const id of Object.keys(states)) {
      limits[id] = states[id].effectiveLimit;
      todayCounts[id] = states[id].today;
    }
    // NO FAKE ANSWER. If no provider key is configured at all, say so honestly.
    if (!resolvedKeys.gemini && !resolvedKeys.groq && !resolvedKeys.openrouter && !resolvedKeys.mistral && !resolvedKeys.cohere && !resolvedKeys.iteracompute && !resolvedKeys.pollinations && !resolvedKeys.cloudflare && !resolvedKeys.nvidia && !resolvedKeys.muse) {
      return res.status(503).json({ error: 'AI service is not configured yet. Please try again later.' });
    }
    // Provider chain: MANUAL SEQUENTIAL selection (race rejected
    // 2026-11-03). Each ask walks the free providers in registry order and
    // tries the first one that is wired, enabled, keyed and under its
    // effective daily limit; on failure the next eligible one is tried, in
    // order. Paid Muse stays sequential-last only. Panel-saved keys win
    // over env keys; panel-disabled providers are skipped and never
    // auto-turned on. If every provider fails, the honest 502 below is
    // the answer, never a fake.
    const prompt = buildTutorPrompt({ country, province, className, board, subject, question });
    // Per-attempt panel bookkeeping: fire-and-forget, never blocks an answer.
    const onAttempt = (att) => {
      recordAttempt(getClient(), att).catch((e) => console.error('provider event record failed:', e.message));
    };
    const result = await askWithFallback({
      prompt,
      config: { ...config, geminiKey: resolvedKeys.gemini, groqKey: resolvedKeys.groq, openrouterKey: resolvedKeys.openrouter, mistralKey: resolvedKeys.mistral, cohereKey: resolvedKeys.cohere, iteracomputeKey: resolvedKeys.iteracompute, pollinationsKey: resolvedKeys.pollinations, cloudflareKey: resolvedKeys.cloudflare, nvidiaKey: resolvedKeys.nvidia, museKey: resolvedKeys.muse },
      enabled,
      onAttempt,
      limits,
      todayCounts,
    });
    if (!result) {
      // Clear reason when nothing could even be attempted: every free
      // provider off or over its daily limit, and no usable Muse fallback.
      const anyFreeEligible = ['gemini', 'groq', 'openrouter', 'mistral', 'cohere', 'iteracompute', 'pollinations', 'cloudflare', 'nvidia'].some((id) => {
        const entry = getProvider(id);
        const s = states[id];
        return entry && entry.wired && s && s.enabled && resolvedKeys[id] && !s.autoOff;
      });
      const museAttemptable = !!(resolvedKeys.muse && enabled.muse !== false);
      const nothingAttempted = !anyFreeEligible && !museAttemptable;
      try {
        await createNotification(getClient(), {
          type: 'all_failed', severity: 'critical',
          title: 'ExamMate ne jawab nahi diya',
          message: nothingAttempted
            ? 'Sab providers band hain ya unki daily limit poori ho gayi hai. Panel me kisi provider ko ON karo ya uski limit barhao.'
            : 'Koi provider jawab nahi de saka. Sab providers ki keys aur haalat panel me check karo.',
          provider: null, action: null,
        });
      } catch (e) { console.error('all-failed notification failed:', e.message); }
      return res.status(502).json({ error: 'AI service is temporarily unavailable. Please try again in a little while.' });
    }
    console.log('exammate answered by', result.provider);
    const raw = result.text;
    const safeHtml = aiTextToSafeHtml(raw);
    const c = getClient();
    // Privacy-aware storage: question + answer only. Photos are never stored.
    await c.execute({ sql: 'INSERT INTO exammate_history (user_id, country, province, class_name, subject, question, answer, provider) VALUES (?,?,?,?,?,?,?,?)', args: [req.user.userId, country, province, className, subject, question, raw, result.provider] });
    await c.execute({ sql: 'INSERT INTO ai_usage (user_id, tokens_used, provider) VALUES (?,?,?)', args: [req.user.userId, Math.ceil(raw.length / 4), result.provider] });
    // 80% usage warning (against the EFFECTIVE limit: custom if set, else
    // published; no limit means no warning) and limit-hit notification.
    // Both fire exactly on the ask that crosses the line (counts rise by
    // 1 per ask, so no nagging repeats). The limit-hit bell also names
    // who answers next — the first still-eligible provider in registry
    // order, or that none remains. If concurrent asks push a count past
    // the limit without ever equalling it, no limit-hit bell fires, but
    // the provider is still auto-off on later asks (skip logic above).
    try {
      const entry = getProvider(result.provider);
      const st = states[result.provider];
      const eff = st ? st.effectiveLimit : (entry ? entry.dailyLimit : null);
      if (entry && eff !== null && eff !== undefined) {
        const today = new Date().toISOString().slice(0, 10);
        const cnt = await c.execute({ sql: "SELECT COUNT(*) AS n FROM exammate_history WHERE provider = ? AND substr(created_at,1,10) = ?", args: [result.provider, today] });
        const n = Number(cnt.rows[0].n);
        if (shouldWarn80(n, eff)) {
          await createNotification(c, {
            type: 'usage_warning', severity: 'warning',
            title: `${entry.name} ki limit 80% poori`,
            message: `${entry.name} ki aaj ki limit 80% poori ho gayi hai (${n}/${eff}). Nayi key tayyar rakho.`,
            provider: result.provider, action: result.provider,
          });
        }
        if (shouldNotifyLimitHit(n, eff)) {
          const next = findNextProvider(states, resolvedKeys, result.provider);
          await createNotification(c, {
            type: 'provider_limit', severity: 'warning',
            title: `${entry.name} ki daily limit poori`,
            message: `${entry.name} ki aaj ki limit poori ho gayi hai (${n}/${eff}). Agla provider: ${next ? next.name + ' jawab dega' : 'koi nahi bacha — sab band ya limit par hain'}.`,
            provider: result.provider, action: result.provider,
          });
        }
      }
    } catch (e) { console.error('usage warning failed:', e.message); }
    res.json({ answerHtml: safeHtml });
  } catch (e) { next(e); }
});
// GET /api/exammate/history — own history, no id needed in the client
// (/api/auth/me never exposes the numeric user id, so the param route
// cannot be called from the page). Same rendering as the param route.
router.get('/history', requireAuth, async (req, res, next) => {
  try {
    const c = getClient();
    const r = await c.execute({ sql: 'SELECT id, country, province, class_name, subject, question, answer, created_at FROM exammate_history WHERE user_id = ? ORDER BY id DESC LIMIT 20', args: [req.user.userId] });
    const history = r.rows.map((row) => ({ ...row, answerHtml: aiTextToSafeHtml(row.answer) }));
    res.json({ history });
  } catch (e) { next(e); }
});
// GET /api/exammate/history/:userId — IDOR: only owner or admin.
router.get('/history/:userId', requireAuth, requireOwnership(req => req.params.userId), async (req, res, next) => {
  try {
    const c = getClient();
    const r = await c.execute({ sql: 'SELECT id, country, province, class_name, subject, question, answer, created_at FROM exammate_history WHERE user_id = ? ORDER BY id DESC LIMIT 20', args: [req.params.userId] });
    // History fix: stored answers are raw markdown (same as /ask stores).
    // Render each through the same safe renderer so clients get answerHtml
    // (formatted, XSS-stripped) like live answers. Raw `answer` is kept
    // for backward compatibility with any client reading it.
    const history = r.rows.map((row) => ({ ...row, answerHtml: aiTextToSafeHtml(row.answer) }));
    res.json({ history });
  } catch (e) { next(e); }
});
module.exports = router;
