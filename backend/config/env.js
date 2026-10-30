// Portable config. No secret is hardcoded. All values come from env.
// Vercel and VPS both read the same env names, only the values change.
function num(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; }
module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 3000),
  // Local: file:./data/local.db  |  Turso: libsql://your-db.turso.io
  dbUrl: process.env.TURSO_DATABASE_URL || 'file:./data/local.db',
  dbToken: process.env.TURSO_AUTH_TOKEN || undefined,
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim()).filter(Boolean),
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-change-me',
  sessionSecure: process.env.SESSION_COOKIE_SECURE === 'true',
  geminiKey: process.env.GEMINI_API_KEY || '',
  exammateDailyCap: num(process.env.EXAMMATE_DAILY_CAP_PER_USER, 20),
  exammateMonthlyTokenCap: num(process.env.EXAMMATE_MONTHLY_TOKEN_CAP, 1000000),
  loginMaxFailed: num(process.env.LOGIN_MAX_FAILED, 5),
  loginLockMinutes: num(process.env.LOGIN_LOCK_MINUTES, 15),
};
