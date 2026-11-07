// ExamMate provider chain. One generic OpenAI-compatible caller serves
// Groq, OpenRouter, Mistral, Cohere, IteraCompute, Pollinations,
// Cloudflare Workers AI and NVIDIA NIM — only the base URL, key and model
// differ — plus the Meta Model API (Muse models). Gemini keeps its own
// endpoint (already built).
// A provider with no key configured is skipped, never faked. The chain IS
// the retry: if one provider fails, the next one answers. If all fail,
// the caller returns null and the route answers honestly (502), never a
// made-up answer.
//
// MANUAL SELECTION (user decision 2026-11-03, race rejected): strictly
// sequential, ONE active provider at a time, NO parallel calls, NO
// rotation pointer. Each ask walks the providers in registry order
// (gemini, groq, openrouter, mistral, cohere, iteracompute, pollinations, cloudflare, nvidia) and tries the FIRST one that
// is wired, enabled (panel flag), keyed (panel key beats env key) and
// under its effective daily limit (custom panel limit, else the published
// registry daily limit, else unlimited — computed live from the Today
// question count, never a persisted auto-off flag). On FAILURE (error
// status or timeout) it moves to the NEXT provider satisfying the same
// conditions, in order, until one succeeds or all are exhausted.
// Manually-OFF providers are NEVER auto-turned on. The paid Muse Model
// API runs SEQUENTIALLY and LAST, only when every free provider failed —
// paid tokens are never burned on a question a free provider could already
// answer. The Muse step runs only with deadline budget remaining, capped
// at the remaining time like every other attempt.
//
// HARD OVERALL DEADLINE (user order 2026-11-03, raised to 17s 2026-11-05).
// The deadline is shared across all attempts in one ask: each attempt gets min(its normal timeout, time
// remaining until the deadline) — never a fresh budget. Per-provider
// timeouts are kept (Gemini 25s because its real successes were observed
// at 18-22s; free providers 15s; Muse 10s) but they are only ever CAPPED
// by the remaining budget, never extended, so a slow Gemini can no longer
// push an ask past 10s: it is cut off at the deadline and the next
// eligible provider gets whatever budget remains. When the deadline
// expires with no success, the chain stops immediately (including no Muse
// step) and returns null, so the route answers with its existing honest
// 502 — never a hang. A fast provider is unaffected: a ~3s first answer
// still finishes in ~3s; the deadline only ever cuts attempts short,
// never delays a success.
//
// ATTEMPT REPORTING (admin panel): every caller returns { text, status }
// (status: 'ok' | HTTP status | 'timeout' | 'error' | 'empty'). askWithFallback
// accepts an optional onAttempt callback, invoked per settled attempt with
// { provider, ok, status }. The callback is fire-and-forget: the chain never
// awaits it, so panel bookkeeping can never slow down or break an answer.
// ENABLED FILTER: askWithFallback accepts an optional `enabled` map
// ({ gemini: true, groq: false, ... }); a provider with enabled === false
// is skipped (the admin panel toggle). Omitted map = everything enabled.
// LIMIT FILTER: askWithFallback accepts optional `limits` (id -> effective
// daily limit or null for unlimited) and `todayCounts` (id -> Today's
// question count); a provider at/over its limit is skipped for the day.
// Omitted maps = no limit filtering (defensive default only — the route
// always passes both).

async function callChatCompletions({ baseUrl, key, model, prompt, timeoutMs, extraBody }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        ...(extraBody || {}),
      }),
    });
    if (!resp.ok) {
      try { const t = await resp.text(); console.error('exammate provider error', baseUrl, resp.status, t.slice(0, 300)); }
      catch (e) { console.error('exammate provider error', baseUrl, resp.status, 'unreadable body'); }
      return { text: null, status: resp.status };
    }
    const data = await resp.json();
    const text = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
    if (!text) console.error('exammate provider empty reply', baseUrl);
    return { text: text || null, status: text ? 'ok' : 'empty' };
  } catch (e) {
    console.error('exammate provider timeout/error', baseUrl, e && e.name);
    return { text: null, status: e && e.name === 'AbortError' ? 'timeout' : 'error' };
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini({ key, model, prompt, timeoutMs }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!resp.ok) {
      try { const t = await resp.text(); console.error('exammate gemini error', resp.status, t.slice(0, 500)); }
      catch (e) { console.error('exammate gemini error', resp.status, 'unreadable body'); }
      return { text: null, status: resp.status };
    }
    const data = await resp.json();
    const raw = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts || []).map(p => p.text || '').join('');
    return { text: raw || null, status: raw ? 'ok' : 'empty' };
  } catch (e) {
    return { text: null, status: e && e.name === 'AbortError' ? 'timeout' : 'error' };
  } finally {
    clearTimeout(timer);
  }
}

// Hard overall deadline for every ask (user order 2026-11-03, raised to 17s
// 2026-11-05 so queued free providers like Qwen get a real chance). The route
// passes no seam, so production always uses this exact value.
const OVERALL_DEADLINE_MS = 17000;

async function askWithFallback({ prompt, config, enabled, onAttempt, limits, todayCounts, overallDeadlineMs }) {
  const started = Date.now();
  const deadline = started + (Number.isFinite(overallDeadlineMs) ? overallDeadlineMs : OVERALL_DEADLINE_MS);
  const remainingMs = () => deadline - Date.now();
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const isEnabled = (id) => !enabled || enabled[id] !== false;
  const underLimit = (id) => {
    if (!limits) return true;
    const lim = limits[id];
    if (lim === null || lim === undefined) return true;
    return (todayCounts ? (todayCounts[id] || 0) : 0) < lim;
  };
  const report = (provider, r) => {
    if (!onAttempt) return;
    try { onAttempt({ provider, ok: !!r.text, status: r.status }); } catch {}
  };
  const wrap = (provider, promise) => promise.then((r) => {
    report(provider, r);
    return r.text ? { provider, text: r.text } : null;
  }).catch(() => {
    report(provider, { text: null, status: 'error' });
    return null;
  });

  // MANUAL SEQUENTIAL SELECTION: registry order, one provider at a time.
  // Each candidate is attempted only if wired (it has a block below),
  // enabled, keyed and under its effective daily limit. A skipped provider
  // is never called and never reported as an attempt — skipped is not
  // failed. On failure the next eligible provider is tried, in order.
  // DEADLINE: every attempt is capped at the time remaining until the
  // shared deadline; when no budget remains the walk stops immediately.
  const attempts = [];
  if (config.geminiKey) {
    // 25s nominal: do NOT cut Gemini to 15s — its real successes take
    // 18-22s. The deadline cap below is what keeps an ask under 17s.
    attempts.push({ id: 'gemini', timeoutMs: 25000, call: (t) => callGemini({ key: config.geminiKey, model: geminiModel, prompt, timeoutMs: t }) });
  }
  if (config.groqKey) attempts.push({ id: 'groq', timeoutMs: 15000, call: (t) => callChatCompletions({ baseUrl: 'https://api.groq.com/openai/v1', key: config.groqKey, model: config.groqModel, prompt, timeoutMs: t }) });
  if (config.openrouterKey) attempts.push({ id: 'openrouter', timeoutMs: 15000, call: (t) => callChatCompletions({ baseUrl: 'https://openrouter.ai/api/v1', key: config.openrouterKey, model: config.openrouterModel, prompt, timeoutMs: t }) });
  if (config.mistralKey) attempts.push({ id: 'mistral', timeoutMs: 15000, call: (t) => callChatCompletions({ baseUrl: 'https://api.mistral.ai/v1', key: config.mistralKey, model: config.mistralModel, prompt, timeoutMs: t }) });
  if (config.cohereKey) attempts.push({ id: 'cohere', timeoutMs: 15000, call: (t) => callChatCompletions({ baseUrl: 'https://api.cohere.ai/compatibility/v1', key: config.cohereKey, model: config.cohereModel, prompt, timeoutMs: t }) });
  // IteraCompute Qwen (free tier, no card): LAST among free providers on
  // purpose — free capacity queues and the promo ends 24 Nov 2026, so it
  // only answers when every proven free provider failed or is skipped.
  // reasoning:false follows IteraCompute's own example: direct answers
  // without thinking tokens, which keeps asks inside the 17s deadline.
  // 20s nominal so Qwen can actually use the full 17s overall budget.
  if (config.iteracomputeKey) attempts.push({ id: 'iteracompute', timeoutMs: 20000, call: (t) => callChatCompletions({ baseUrl: 'https://api.iteracompute.com/v1', key: config.iteracomputeKey, model: config.iteracomputeModel, prompt, timeoutMs: t, extraBody: { reasoning: false } }) });
  // Pollinations (keyed gen API, OpenAI-compatible): LAST among free
  // providers on purpose — best-effort service, Pollen credits, no uptime
  // guarantee, so it only answers when every other free provider failed
  // or is skipped. Secret key from enter.pollinations.ai (server-side).
  if (config.pollinationsKey) attempts.push({ id: 'pollinations', timeoutMs: 15000, call: (t) => callChatCompletions({ baseUrl: 'https://gen.pollinations.ai/v1', key: config.pollinationsKey, model: config.pollinationsModel, prompt, timeoutMs: t }) });
  // Cloudflare Workers AI (OpenAI-compatible /ai/v1, account-scoped URL):
  // AFTER pollinations. Token is the panel key; the Account ID comes from
  // the CLOUDFLARE_ACCOUNT_ID env var — skipped when either is missing.
  // Free tier is 10,000 Neurons/day (compute units, not a question cap),
  // so no daily question limit is set for it.
  if (config.cloudflareKey && config.cloudflareAccountId) attempts.push({ id: 'cloudflare', timeoutMs: 15000, call: (t) => callChatCompletions({ baseUrl: 'https://api.cloudflare.com/client/v4/accounts/' + config.cloudflareAccountId + '/ai/v1', key: config.cloudflareKey, model: config.cloudflareModel, prompt, timeoutMs: t }) });
  // NVIDIA NIM (build.nvidia.com, free prototyping credits, OpenAI-compatible):
  // LAST — trial credits that deplete, so it only answers when every other
  // provider failed or is skipped. Note: NIM auth failures are 403, not 401.
  if (config.nvidiaKey) attempts.push({ id: 'nvidia', timeoutMs: 15000, call: (t) => callChatCompletions({ baseUrl: 'https://integrate.api.nvidia.com/v1', key: config.nvidiaKey, model: config.nvidiaModel, prompt, timeoutMs: t }) });

  for (const att of attempts) {
    if (!isEnabled(att.id) || !underLimit(att.id)) continue;
    const remaining = remainingMs();
    if (remaining <= 0) return null;
    const winner = await wrap(att.id, att.call(Math.min(att.timeoutMs, remaining)));
    if (winner) return winner;
  }
  // Premium fallback, sequential and last only, and only with deadline
  // budget remaining (capped at what is left, like every other attempt).
  // Muse slot: the Meta Model API (Muse models via dev.meta.ai key).
  // A Muse APP account's tokens cannot power this — only a Model API key
  // (MODEL_API_KEY) can. No key configured => skipped, never faked.
  // Muse is a dormant fallback slot, not part of manual selection: its
  // step is unchanged (key + enabled + budget, no limit logic).
  if (config.museKey && isEnabled('muse')) {
    const remaining = remainingMs();
    if (remaining > 0) {
      const r = await callChatCompletions({ baseUrl: 'https://api.meta.ai/v1', key: config.museKey, model: config.museModel, prompt, timeoutMs: Math.min(10000, remaining) });
      report('muse', r);
      if (r.text) return { provider: 'muse', text: r.text };
    }
  }
  return null;
}

module.exports = { askWithFallback, callChatCompletions, callGemini, OVERALL_DEADLINE_MS };
