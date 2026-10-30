# Kavron Labs — Real Website, Phase 1

Portable backend: Express app in `backend/app.js` is separate from
- Vercel: `api/index.js` (serverless export, no graceful shutdown)
- VPS / Docker: `server.js` (persistent server, graceful shutdown)

Database: `@libsql/client`. Local = SQLite file, production = Turso.
Same code, only `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` change.
Rate limits, login lockout and sessions are DB-backed, never in memory,
because Vercel serverless instances are not persistent.

## Phase 1 — the 8 high-risk items, implemented + tested
1. Password hashing: bcryptjs, cost 12. No MD5/SHA, no plain passwords.
2. Login lockout + DB rate limit: 5 failed logins in 15 minutes = lockout.
3. Secure sessions + CSRF: httpOnly, Secure (prod), SameSite=Lax cookie,
   session row in Turso, CSRF token bound to that session.
4. IDOR / permission: `requireRole('admin')` + `requireOwnership()` middleware.
5. Security headers: helmet + CSP, HSTS, X-Frame-Options, etc.
6. ExamMate caps: question max 2000 chars, per-user daily cap (env),
   monthly token cap (env). No key = honest 503, never a fake answer.
7. AI output sanitization: `sanitize-html`, scripts / event handlers removed.
8. Backup + restore: `npm run backup`, `npm run restore-test` (must pass).

## Run locally
```
cp .env.example .env
npm install
npm run migrate
npm run seed        # test user only, never in production
npm start           # http://localhost:3000
npm test
npm run restore-test
```

## Create an admin (local only, secure)
```
ADMIN_PASSWORD='<at least 12 chars>' node scripts/create-admin.js admin@example.com
```
Never paste a password or key in chat. Set it only in `.env` or hosting env.
