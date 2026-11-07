// Canonical provider registry, shared by the chain and the admin panel.
// `wired` = the chain can actually call this provider today. A provider
// with wired=false can still have a key saved in the panel; it joins the
// race when its chain entry is built (one small change per provider).
// `dailyLimit` = published free-tier cap. null = unpublished or not a daily
// cap — the panel then shows usage WITHOUT a limit, never an invented one.
// `limitPeriod` distinguishes daily caps from monthly ones.
// `keyFields` = fields the panel key form asks for (default: one key).
const PROVIDERS = [
  { id: 'gemini', name: 'Gemini', wired: true, envKey: 'GEMINI_API_KEY', dailyLimit: null, limitPeriod: null, limitNote: 'Google AI Studio free tier' },
  { id: 'groq', name: 'Groq', wired: true, envKey: 'GROQ_API_KEY', dailyLimit: 1000, limitPeriod: 'day', limitNote: 'gpt-oss models, free tier' },
  { id: 'openrouter', name: 'OpenRouter', wired: true, envKey: 'OPENROUTER_API_KEY', dailyLimit: 50, limitPeriod: 'day', limitNote: ':free models, no purchase' },
  { id: 'mistral', name: 'Mistral', wired: true, envKey: 'MISTRAL_API_KEY', dailyLimit: null, limitPeriod: null, limitNote: '~1B tokens/month org-wide, phone verification' },
  { id: 'cohere', name: 'Cohere', wired: true, envKey: 'COHERE_API_KEY', dailyLimit: null, limitPeriod: null, limitNote: '1,000 calls/month trial, eval only' },
  { id: 'iteracompute', name: 'IteraCompute Qwen', wired: true, envKey: 'ITERACOMPUTE_API_KEY', dailyLimit: null, limitPeriod: null, limitNote: 'Qwen3.8-27B free, 30M tokens/month, no card — promo ends 24 Nov 2026' },
  { id: 'sambanova', name: 'SambaNova', wired: false, envKey: 'SAMBANOVA_API_KEY', dailyLimit: 20, limitPeriod: 'day', limitNote: 'Free tier disputed — try, skip if card asked' },
  { id: 'huggingface', name: 'Hugging Face', wired: false, envKey: 'HF_TOKEN', dailyLimit: null, limitPeriod: null, limitNote: '$0.10/month credit, test-level' },
  { id: 'pollinations', name: 'Pollinations', wired: true, envKey: 'POLLINATIONS_API_KEY', dailyLimit: null, limitPeriod: null, limitNote: 'gen.pollinations.ai keyed, model openai, Pollen credits, best-effort last backup' },
  // Cloudflare Workers AI: panel key = API token only; the Account ID is
  // an env var (CLOUDFLARE_ACCOUNT_ID), never a panel field. Free tier is
  // 10,000 Neurons/day (compute units, not a question cap) — dailyLimit
  // stays null, never an invented question cap.
  { id: 'cloudflare', name: 'Cloudflare Workers AI', wired: true, envKey: 'CLOUDFLARE_API_TOKEN', dailyLimit: null, limitPeriod: null, limitNote: 'OpenAI-compatible /ai/v1, @cf/meta/llama-4-scout-17b-16e-instruct, 10,000 Neurons/day free' },
  // NVIDIA NIM: free prototyping credits (trial-style, depletes) on
  // build.nvidia.com; no card for the key. No daily question cap known.
  { id: 'nvidia', name: 'NVIDIA NIM', wired: true, envKey: 'NVIDIA_API_KEY', dailyLimit: null, limitPeriod: null, limitNote: 'Free prototyping credits, meta/llama-3.1-8b-instruct, trial terms' },
  { id: 'muse', name: 'Muse (Model API)', wired: true, envKey: 'MODEL_API_KEY', dailyLimit: null, limitPeriod: null, limitNote: 'Paid/billing — sequential last only' },
];

function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id) || null;
}

module.exports = { PROVIDERS, getProvider };
