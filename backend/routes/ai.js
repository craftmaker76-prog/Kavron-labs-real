// Hissa 1 AI tools: text generator, caption generator, product
// description writer and email writer — all powered by the SAME provider
// chain as ExamMate (routes/exammate.js patterns copied exactly):
// requireAuth + csrfProtect + dbRateLimit, panel keys beat env keys,
// strictly sequential askWithFallback with onAttempt -> recordAttempt,
// provider daily limits counted from BOTH exammate_history AND
// ai_tool_usage, 80%/limit-hit bell notifications, honest 502/503.
// NO FAKE ANSWER: no key or all-failed means an honest error, never a
// locally drafted output.
const express = require('express');
const router = express.Router();
const config = require('../config/env');
const { getClient } = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const { csrfProtect } = require('../middleware/csrf');
const { dbRateLimit } = require('../middleware/rateLimit');
const { cleanText } = require('../validators');
const { aiTextToSafeHtml, sanitizeAiOutput } = require('../services/exammate/sanitize');
const { askWithFallback } = require('../services/exammate/providers');
const { ensurePanelSchema } = require('../db/panelSchema');
const { ensureAiToolsSchema } = require('../db/aiToolsSchema');
const { resolveProviderKeys } = require('../services/admin/keyResolver');
const { recordAttempt, shouldWarn80 } = require('../services/admin/providerEvents');
const { createNotification } = require('../services/admin/notifications');
const { getProvider } = require('../services/exammate/registry');
const { getProviderStates, findNextProvider, shouldNotifyLimitHit } = require('../services/admin/providerLimits');

const AI_TOOLS = ['ai-text-generator', 'ai-caption-generator', 'ai-product-description', 'ai-email-writer'];
const AI_MAX_INPUT = 2000;
const AI_MAX_SAVED_HTML = 100000;
const AI_SAVED_CAP = 50;

// Tool-specific system prompts (short, from the original ARvo design).
// The language rule is part of every prompt: answer in the same language
// and script as the user's input.
const AI_PROMPTS = {
  'ai-text-generator': "You are a helpful writing assistant. Write clear, useful text based on the user's input. Do not invent facts, prices, or statistics. Answer in the same language and script as the user's input.",
  'ai-caption-generator': "You write short, engaging social media captions based on the user's input. Keep them natural, no fake claims, no invented statistics. Answer in the same language and script as the user's input.",
  'ai-product-description': "You write honest product descriptions from the details the user gives. Do not invent features, prices, or guarantees the user did not provide. Answer in the same language and script as the user's input.",
  'ai-email-writer': "You write professional, polite emails based on the user's input. Do not invent commitments, dates, or names the user did not provide. Answer in the same language and script as the user's input.",
};

// Per-user daily usage, counted in the DB (Vercel-safe, not memory).
// Only successful generations are inserted (see POST /generate), so the
// quota counts answers, never failed attempts.
async function dailyUsage(userId) {
  const c = getClient();
  const today = new Date().toISOString().slice(0, 10);
  const r = await c.execute({ sql: "SELECT COUNT(*) AS n FROM ai_tool_usage WHERE user_id = ? AND substr(created_at,1,10) = ?", args: [userId, today] });
  return Number(r.rows[0].n);
}

// Shared monthly token cap (same table and pattern as ExamMate): AI-tool
// generations also INSERT into ai_usage, so they count toward this cap.
async function monthlyTokens() {
  const c = getClient();
  const month = new Date().toISOString().slice(0, 7);
  const r = await c.execute({ sql: "SELECT COALESCE(SUM(tokens_used),0) AS t FROM ai_usage WHERE substr(created_at,1,7) = ?", args: [month] });
  return Number(r.rows[0].t);
}

// getProviderStates counts Today from exammate_history ONLY. AI-tool
// generations must ALSO count toward provider daily limits, so merge
// today's per-provider counts from ai_tool_usage into the same map.
async function combinedTodayCounts(states) {
  const counts = {};
  for (const id of Object.keys(states)) counts[id] = states[id].today;
  try {
    const c = getClient();
    const today = new Date().toISOString().slice(0, 10);
    const r = await c.execute({ sql: "SELECT provider, COUNT(*) AS n FROM ai_tool_usage WHERE substr(created_at,1,10) = ? GROUP BY provider", args: [today] });
    for (const row of r.rows) counts[row.provider] = (counts[row.provider] || 0) + Number(row.n);
  } catch (e) { console.error('ai tool usage count failed:', e.message); }
  return counts;
}

// Same shape as getProviderStates, but with the COMBINED today count and
// autoOff recomputed from it, so limit warnings and findNextProvider see
// the true (ExamMate + AI tools) usage for the day.
function buildCombinedStates(states, combinedCounts) {
  const out = {};
  for (const id of Object.keys(states)) {
    const s = states[id];
    const today = combinedCounts[id] || 0;
    out[id] = {
      ...s,
      today,
      autoOff: s.enabled && s.effectiveLimit !== null && s.effectiveLimit !== undefined && today >= s.effectiveLimit,
    };
  }
  return out;
}

// Combined Today count for one provider (ExamMate history + AI tools).
async function providerTodayCount(c, provider, today) {
  const h = await c.execute({ sql: "SELECT COUNT(*) AS n FROM exammate_history WHERE provider = ? AND substr(created_at,1,10) = ?", args: [provider, today] });
  const a = await c.execute({ sql: "SELECT COUNT(*) AS n FROM ai_tool_usage WHERE provider = ? AND substr(created_at,1,10) = ?", args: [provider, today] });
  return Number(h.rows[0].n) + Number(a.rows[0].n);
}

const aiRateLimit = dbRateLimit({ limit: 30, windowMinutes: 60, keyFn: (req) => 'ai:' + req.user.userId });

// POST /api/ai/generate — requires login + CSRF + per-user rate limit.
router.post('/generate', requireAuth, csrfProtect, aiRateLimit, async (req, res, next) => {
  try {
    await ensureAiToolsSchema();
    await ensurePanelSchema();
    const tool = cleanText(req.body && req.body.tool);
    const input = cleanText(req.body && req.body.input);
    if (!AI_TOOLS.includes(tool)) {
      return res.status(400).json({ error: 'Please choose a valid AI tool.' });
    }
    if (!input || input.length > AI_MAX_INPUT) {
      return res.status(400).json({ error: `Input must be 1 to ${AI_MAX_INPUT} characters.` });
    }
    const limit = config.aiDailyCap;
    const used = await dailyUsage(req.user.userId);
    if (used >= limit) {
      return res.status(429).json({ error: `You have used all ${limit} free AI requests for today. Please try again tomorrow.`, remaining: 0, limit });
    }
    if (await monthlyTokens() >= config.exammateMonthlyTokenCap) {
      return res.status(503).json({ error: 'AI service is temporarily unavailable because the monthly AI budget has been reached.' });
    }
    // Panel keys first, env keys as fallback.
    const { keys: resolvedKeys, enabled } = await resolveProviderKeys();
    // Manual selection state: per-provider enabled flag, custom limit,
    // effective limit and Today count — computed live, so an auto-off
    // provider re-arms tomorrow when its count resets (no flag is ever
    // persisted for auto-off, and manually-OFF providers stay off).
    const states = await getProviderStates(getClient());
    const limits = {};
    for (const id of Object.keys(states)) limits[id] = states[id].effectiveLimit;
    // AI-tool usage counts toward the same provider daily limits.
    const todayCounts = await combinedTodayCounts(states);
    const combinedStates = buildCombinedStates(states, todayCounts);
    // NO FAKE ANSWER. If no provider key is configured at all, say so honestly.
    if (!resolvedKeys.gemini && !resolvedKeys.groq && !resolvedKeys.openrouter && !resolvedKeys.mistral && !resolvedKeys.cohere && !resolvedKeys.iteracompute && !resolvedKeys.pollinations && !resolvedKeys.cloudflare && !resolvedKeys.nvidia && !resolvedKeys.muse) {
      return res.status(503).json({ error: 'AI service is not configured yet. Please try again later.' });
    }
    // Provider chain: MANUAL SEQUENTIAL selection (same as ExamMate).
    // Each generate walks the providers in registry order and tries the
    // first one that is wired, enabled, keyed and under its effective
    // daily limit; on failure the next eligible one is tried, in order.
    const prompt = AI_PROMPTS[tool] + '\n\n' + input;
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
        const s = combinedStates[id];
        return entry && entry.wired && s && s.enabled && resolvedKeys[id] && !s.autoOff;
      });
      const museAttemptable = !!(resolvedKeys.muse && enabled.muse !== false);
      const nothingAttempted = !anyFreeEligible && !museAttemptable;
      try {
        await createNotification(getClient(), {
          // DISTINCT type from ExamMate's 'all_failed', so the deduped
          // unread row for one never clobbers the other's.
          type: 'ai_all_failed', severity: 'critical',
          title: 'AI tools ne jawab nahi diya',
          message: nothingAttempted
            ? 'Sab providers band hain ya unki daily limit poori ho gayi hai. Panel me kisi provider ko ON karo ya uski limit barhao.'
            : 'Koi provider jawab nahi de saka. Sab providers ki keys aur haalat panel me check karo.',
          provider: null, action: null,
        });
      } catch (e) { console.error('ai all-failed notification failed:', e.message); }
      return res.status(502).json({ error: 'AI service is temporarily unavailable. Please try again in a little while.' });
    }
    console.log('ai tool answered by', result.provider, 'tool', tool);
    const raw = result.text;
    const safeHtml = aiTextToSafeHtml(raw);
    const tokens = Math.ceil(raw.length / 4);
    const c = getClient();
    // Count ONLY successful generations: usage rows are inserted after
    // a successful answer, exactly like ExamMate inserts history.
    await c.execute({ sql: 'INSERT INTO ai_tool_usage (user_id, tool, provider, tokens_used) VALUES (?,?,?,?)', args: [req.user.userId, tool, result.provider, tokens] });
    await c.execute({ sql: 'INSERT INTO ai_usage (user_id, tokens_used, provider) VALUES (?,?,?)', args: [req.user.userId, tokens, result.provider] });
    // 80% usage warning (against the EFFECTIVE limit) and limit-hit
    // notification, on the COMBINED Today count (ExamMate + AI tools).
    // Both fire exactly on the ask that crosses the line. The limit-hit
    // bell also names who answers next — the first still-eligible
    // provider in registry order, or that none remains.
    try {
      const entry = getProvider(result.provider);
      const st = combinedStates[result.provider];
      const eff = st ? st.effectiveLimit : (entry ? entry.dailyLimit : null);
      if (entry && eff !== null && eff !== undefined) {
        const today = new Date().toISOString().slice(0, 10);
        const n = await providerTodayCount(c, result.provider, today);
        if (shouldWarn80(n, eff)) {
          await createNotification(c, {
            type: 'usage_warning', severity: 'warning',
            title: `${entry.name} ki limit 80% poori`,
            message: `${entry.name} ki aaj ki limit 80% poori ho gayi hai (${n}/${eff}). Nayi key tayyar rakho.`,
            provider: result.provider, action: result.provider,
          });
        }
        if (shouldNotifyLimitHit(n, eff)) {
          const next = findNextProvider(combinedStates, resolvedKeys, result.provider);
          await createNotification(c, {
            type: 'provider_limit', severity: 'warning',
            title: `${entry.name} ki daily limit poori`,
            message: `${entry.name} ki aaj ki limit poori ho gayi hai (${n}/${eff}). Agla provider: ${next ? next.name + ' jawab dega' : 'koi nahi bacha — sab band ya limit par hain'}.`,
            provider: result.provider, action: result.provider,
          });
        }
      }
    } catch (e) { console.error('usage warning failed:', e.message); }
    const usedNow = await dailyUsage(req.user.userId);
    res.json({ answerHtml: safeHtml, remaining: Math.max(0, limit - usedNow), used: usedNow, limit, provider: result.provider });
  } catch (e) { next(e); }
});

// GET /api/ai/usage — today's quota for this user.
router.get('/usage', requireAuth, async (req, res, next) => {
  try {
    await ensureAiToolsSchema();
    await ensurePanelSchema();
    const limit = config.aiDailyCap;
    const used = await dailyUsage(req.user.userId);
    res.json({ used, remaining: Math.max(0, limit - used), limit });
  } catch (e) { next(e); }
});

// GET /api/ai/saved — own saved results, newest first.
router.get('/saved', requireAuth, async (req, res, next) => {
  try {
    await ensureAiToolsSchema();
    await ensurePanelSchema();
    const c = getClient();
    const r = await c.execute({ sql: 'SELECT id, tool, input, output_html AS outputHtml, created_at FROM ai_saved_results WHERE user_id = ? ORDER BY id DESC LIMIT 50', args: [req.user.userId] });
    res.json({ items: r.rows });
  } catch (e) { next(e); }
});

// POST /api/ai/save — save one generated result. The stored HTML is
// re-sanitized (sanitize-html pass only) before storing — never store
// unsanitized HTML.
router.post('/save', requireAuth, csrfProtect, async (req, res, next) => {
  try {
    await ensureAiToolsSchema();
    await ensurePanelSchema();
    const tool = cleanText(req.body && req.body.tool);
    const input = cleanText(req.body && req.body.input);
    const outputHtml = req.body && req.body.outputHtml;
    if (!AI_TOOLS.includes(tool)) {
      return res.status(400).json({ error: 'Please choose a valid AI tool.' });
    }
    if (!input || input.length > AI_MAX_INPUT) {
      return res.status(400).json({ error: `Input must be 1 to ${AI_MAX_INPUT} characters.` });
    }
    if (typeof outputHtml !== 'string' || outputHtml.length > AI_MAX_SAVED_HTML) {
      return res.status(400).json({ error: `Saved output must be at most ${AI_MAX_SAVED_HTML} characters.` });
    }
    const c = getClient();
    const count = await c.execute({ sql: 'SELECT COUNT(*) AS n FROM ai_saved_results WHERE user_id = ?', args: [req.user.userId] });
    if (Number(count.rows[0].n) >= AI_SAVED_CAP) {
      return res.status(429).json({ error: `Saved items limit reached (${AI_SAVED_CAP}). Delete an old item first.` });
    }
    const cleanHtml = sanitizeAiOutput(outputHtml);
    const ins = await c.execute({ sql: 'INSERT INTO ai_saved_results (user_id, tool, input, output_html) VALUES (?,?,?,?)', args: [req.user.userId, tool, input, cleanHtml] });
    const row = await c.execute({ sql: 'SELECT id, tool, created_at FROM ai_saved_results WHERE id = ?', args: [Number(ins.lastInsertRowid)] });
    res.status(201).json({ item: row.rows[0] });
  } catch (e) { next(e); }
});

// DELETE /api/ai/saved/:id — delete own item only. A foreign id returns
// 404 (no enumeration leak), never 403.
router.delete('/saved/:id', requireAuth, csrfProtect, async (req, res, next) => {
  try {
    await ensureAiToolsSchema();
    await ensurePanelSchema();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ error: 'Saved item not found.' });
    }
    const c = getClient();
    const r = await c.execute({ sql: 'DELETE FROM ai_saved_results WHERE id = ? AND user_id = ?', args: [id, req.user.userId] });
    if (!r.rowsAffected) {
      return res.status(404).json({ error: 'Saved item not found.' });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
