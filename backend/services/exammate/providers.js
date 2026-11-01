// ExamMate provider chain. One generic OpenAI-compatible caller serves
// Groq, OpenRouter and the Meta Model API (Muse models) — only the base
// URL, key and model differ. Gemini keeps its own endpoint (already built).
// A provider with no key configured is skipped, never faked. The chain IS
// the retry: if one provider fails, the next one answers. If all fail,
// the caller returns null and the route answers honestly (502), never a
// made-up answer.
//
// Time budget: serverless functions have a hard time limit, so the whole
// chain is capped (~50s of provider time). Gemini gets the longest single
// slot because its real successes were observed at 18-22s; the free race
// runs at 15s per provider and the Muse fallback at 10s.
async function callChatCompletions({ baseUrl, key, model, prompt, timeoutMs }) {
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
      }),
    });
    if (!resp.ok) {
      try { const t = await resp.text(); console.error('exammate provider error', baseUrl, resp.status, t.slice(0, 300)); }
      catch (e) { console.error('exammate provider error', baseUrl, resp.status, 'unreadable body'); }
      return null;
    }
    const data = await resp.json();
    const text = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
    return text || null;
  } catch (e) {
    return null;
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
    clearTimeout(timer);
    if (!resp.ok) {
      try { const t = await resp.text(); console.error('exammate gemini error', resp.status, t.slice(0, 500)); }
      catch (e) { console.error('exammate gemini error', resp.status, 'unreadable body'); }
      return null;
    }
    const data = await resp.json();
    const raw = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts || []).map(p => p.text || '').join('');
    return raw || null;
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

// Try providers in order. Returns { provider, text } on first success, else null.
// SPEED RULE (user requirement: answer within 15 seconds): free providers
// race IN PARALLEL — whoever answers first wins. Sequential fallback made
// every answer wait for the slowest provider (Gemini alone was observed at
// 18-22s). Groq is the speed provider: in the normal case it answers in a
// few seconds, so the race finishes well inside 15s. Order is still
// cost-smart: the paid Muse Model API runs SEQUENTIALLY and LAST, only
// when every free provider failed — paid tokens are never burned on a
// question a free provider could already answer. That rare path may exceed
// 15s, but a late answer beats no answer.
// NOTE: with ONLY Gemini configured, 15s is not achievable — its real
// successes take 18-22s. The 15s requirement is met once Groq is keyed in.
function firstSuccess(promises) {
  return new Promise((resolve) => {
    let settled = 0;
    const total = promises.length;
    if (total === 0) return resolve(null);
    promises.forEach((p) => p.then((v) => {
      if (v) return resolve(v);
      if (++settled === total) resolve(null);
    }).catch(() => {
      if (++settled === total) resolve(null);
    }));
  });
}

async function askWithFallback({ prompt, config }) {
  const started = Date.now();
  const BUDGET_MS = 50000;
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

  const freeAttempts = [];
  if (config.geminiKey) {
    // 25s: do NOT cut Gemini to 15s — its real successes take 18-22s.
    freeAttempts.push(callGemini({ key: config.geminiKey, model: geminiModel, prompt, timeoutMs: 25000 }).then((text) => (text ? { provider: 'gemini', text } : null)));
  }
  if (config.groqKey) freeAttempts.push(callChatCompletions({ baseUrl: 'https://api.groq.com/openai/v1', key: config.groqKey, model: config.groqModel, prompt, timeoutMs: 15000 }).then((text) => (text ? { provider: 'groq', text } : null)));
  if (config.openrouterKey) freeAttempts.push(callChatCompletions({ baseUrl: 'https://openrouter.ai/api/v1', key: config.openrouterKey, model: config.openrouterModel, prompt, timeoutMs: 15000 }).then((text) => (text ? { provider: 'openrouter', text } : null)));

  if (freeAttempts.length) {
    const winner = await firstSuccess(freeAttempts);
    if (winner) return winner;
  }
  // Premium fallback, sequential and last only.
  // Muse slot: the Meta Model API (Muse models via dev.meta.ai key).
  // A Muse APP account's tokens cannot power this — only a Model API key
  // (MODEL_API_KEY) can. No key configured => skipped, never faked.
  if (config.museKey && Date.now() - started <= BUDGET_MS) {
    const text = await callChatCompletions({ baseUrl: 'https://api.meta.ai/v1', key: config.museKey, model: config.museModel, prompt, timeoutMs: 10000 });
    if (text) return { provider: 'muse', text };
  }
  return null;
}

module.exports = { askWithFallback, callChatCompletions, callGemini };
