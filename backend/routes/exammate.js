const express = require('express');
const router = express.Router();
const config = require('../config/env');
const { getClient } = require('../db/client');
const { requireAuth, requireOwnership } = require('../middleware/auth');
const { csrfProtect } = require('../middleware/csrf');
const { dbRateLimit } = require('../middleware/rateLimit');
const { cleanText, EXAMMATE_MAX_QUESTION, EXAMMATE_MAX_SUBJECT } = require('../validators');
const { aiTextToSafeHtml } = require('../services/exammate/sanitize');
const { askWithFallback } = require('../services/exammate/providers');
const { ensurePanelSchema } = require('../db/panelSchema');
const { resolveProviderKeys } = require('../services/admin/keyResolver');
const { recordAttempt, shouldWarn80 } = require('../services/admin/providerEvents');
const { createNotification } = require('../services/admin/notifications');
const { getProvider } = require('../services/exammate/registry');
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
    if (!question || question.length > EXAMMATE_MAX_QUESTION) {
      return res.status(400).json({ error: `Question must be 1 to ${EXAMMATE_MAX_QUESTION} characters.` });
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
    // NO FAKE ANSWER. If no provider key is configured at all, say so honestly.
    if (!resolvedKeys.gemini && !resolvedKeys.groq && !resolvedKeys.openrouter && !resolvedKeys.muse) {
      return res.status(503).json({ error: 'AI service is not configured yet. Please try again later.' });
    }
    // Provider chain: free providers race in parallel, paid Muse sequential
    // last. Panel-saved keys win over env keys; panel-disabled providers
    // are skipped. The chain IS the retry — a second provider answers
    // better than retrying the same overloaded one. If every provider
    // fails, the honest 502 below is the answer, never a fake.
    const prompt = `You are a school tutor. Country: ${country}. Region: ${province}. Class: ${className}. Subject: ${subject}. Answer the student's question in the same language as the question. Do not provide leaked exam papers. Question: ${question}`;
    // Per-attempt panel bookkeeping: fire-and-forget, never blocks an answer.
    const onAttempt = (att) => {
      recordAttempt(getClient(), att).catch((e) => console.error('provider event record failed:', e.message));
    };
    const result = await askWithFallback({
      prompt,
      config: { ...config, geminiKey: resolvedKeys.gemini, groqKey: resolvedKeys.groq, openrouterKey: resolvedKeys.openrouter, museKey: resolvedKeys.muse },
      enabled,
      onAttempt,
    });
    if (!result) {
      try {
        await createNotification(getClient(), {
          type: 'all_failed', severity: 'critical',
          title: 'ExamMate ne jawab nahi diya',
          message: 'Koi provider jawab nahi de saka. Sab providers ki keys aur haalat panel me check karo.',
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
    // 80% usage warning: fires exactly on the ask that crosses the line
    // (counts rise by 1 per ask, so no nagging repeats).
    try {
      const entry = getProvider(result.provider);
      if (entry && entry.dailyLimit) {
        const today = new Date().toISOString().slice(0, 10);
        const cnt = await c.execute({ sql: "SELECT COUNT(*) AS n FROM exammate_history WHERE provider = ? AND substr(created_at,1,10) = ?", args: [result.provider, today] });
        if (shouldWarn80(Number(cnt.rows[0].n), entry.dailyLimit)) {
          await createNotification(c, {
            type: 'usage_warning', severity: 'warning',
            title: `${entry.name} ki limit 80% poori`,
            message: `${entry.name} ki aaj ki limit 80% poori ho gayi hai (${cnt.rows[0].n}/${entry.dailyLimit}). Nayi key tayyar rakho.`,
            provider: result.provider, action: result.provider,
          });
        }
      }
    } catch (e) { console.error('usage warning failed:', e.message); }
    res.json({ answerHtml: safeHtml });
  } catch (e) { next(e); }
});
// GET /api/exammate/history/:userId — IDOR: only owner or admin.
router.get('/history/:userId', requireAuth, requireOwnership(req => req.params.userId), async (req, res, next) => {
  try {
    const c = getClient();
    const r = await c.execute({ sql: 'SELECT id, country, province, class_name, subject, question, answer, created_at FROM exammate_history WHERE user_id = ? ORDER BY id DESC LIMIT 20', args: [req.params.userId] });
    res.json({ history: r.rows });
  } catch (e) { next(e); }
});
module.exports = router;
