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
    // NO FAKE ANSWER. If no provider key is configured at all, say so honestly.
    if (!config.geminiKey && !config.groqKey && !config.openrouterKey && !config.museKey) {
      return res.status(503).json({ error: 'AI service is not configured yet. Please try again later.' });
    }
    // Provider chain: Gemini first, then free Groq, free OpenRouter, then
    // the paid Muse Model API. The chain IS the retry — a second provider
    // answers better than retrying the same overloaded one. If every
    // provider fails, the honest 502 below is the answer, never a fake.
    const prompt = `You are a school tutor. Country: ${country}. Region: ${province}. Class: ${className}. Subject: ${subject}. Answer the student's question in the same language as the question. Do not provide leaked exam papers. Question: ${question}`;
    const result = await askWithFallback({ prompt, config });
    if (!result) return res.status(502).json({ error: 'AI service is temporarily unavailable. Please try again in a little while.' });
    console.log('exammate answered by', result.provider);
    const raw = result.text;
    const safeHtml = aiTextToSafeHtml(raw);
    const c = getClient();
    // Privacy-aware storage: question + answer only. Photos are never stored.
    await c.execute({ sql: 'INSERT INTO exammate_history (user_id, country, province, class_name, subject, question, answer) VALUES (?,?,?,?,?,?,?)', args: [req.user.userId, country, province, className, subject, question, raw] });
    await c.execute({ sql: 'INSERT INTO ai_usage (user_id, tokens_used) VALUES (?,?)', args: [req.user.userId, Math.ceil(raw.length / 4)] });
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
