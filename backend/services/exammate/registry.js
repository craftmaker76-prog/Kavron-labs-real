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
  { id: 'mistral', name: 'Mistral', wired: false, envKey: 'MISTRAL_API_KEY', dailyLimit: null, limitPeriod: null, limitNote: '~1B tokens/month org-wide, phone verification' },
  { id: 'cloudflare', name: 'Cloudflare Workers AI', wired: false, envKey: 'CLOUDFLARE_API_TOKEN', dailyLimit: null, limitPeriod: null, limitNote: '10,000 neurons/day, custom API shape', keyFields: [{ name: 'token', label: 'API Token' }, { name: 'accountId', label: 'Account ID' }] },
  { id: 'nvidia', name: 'NVIDIA API catalog', wired: false, envKey: 'NVIDIA_API_KEY', dailyLimit: null, limitPeriod: null, limitNote: 'Free prototyping, trial terms' },
  { id: 'cohere', name: 'Cohere', wired: false, envKey: 'COHERE_API_KEY', dailyLimit: null, limitPeriod: null, limitNote: '1,000 calls/month trial, eval only' },
  { id: 'sambanova', name: 'SambaNova', wired: false, envKey: 'SAMBANOVA_API_KEY', dailyLimit: 20, limitPeriod: 'day', limitNote: 'Free tier disputed — try, skip if card asked' },
  { id: 'huggingface', name: 'Hugging Face', wired: false, envKey: 'HF_TOKEN', dailyLimit: null, limitPeriod: null, limitNote: '$0.10/month credit, test-level' },
  { id: 'pollinations', name: 'Pollinations', wired: false, envKey: null, dailyLimit: null, limitPeriod: null, limitNote: 'Keyless free API, variable reliability' },
  { id: 'muse', name: 'Muse (Model API)', wired: true, envKey: 'MODEL_API_KEY', dailyLimit: null, limitPeriod: null, limitNote: 'Paid/billing — sequential last only' },
];

function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id) || null;
}

module.exports = { PROVIDERS, getProvider };
