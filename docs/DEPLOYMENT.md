# Deployment & Migration
## Phase 1 — Vercel (temporary hosting)
- Import the repo in Vercel, root = this folder.
- Vercel entry is `api/index.js`. No build command is needed for the API;
  the frontend in `frontend/public` is served by Express.
- Set env in Vercel (never in code): TURSO_DATABASE_URL, TURSO_AUTH_TOKEN,
  ALLOWED_ORIGINS (your live domain), SESSION_SECRET, SESSION_COOKIE_SECURE=true,
  GEMINI_API_KEY, EXAMMATE_DAILY_CAP_PER_USER, EXAMMATE_MONTHLY_TOKEN_CAP.
- Domain and hosting are separate: domain = the address (e.g. kavron.com),
  hosting = where the code runs (Vercel now), database = Turso.
## Phase 2 — VPS / Cloud Server (long-term hosting)
- Same codebase, no code change: run `npm start` (server.js) or Docker.
- Point the SAME domain to the new server (DNS change only).
- Keep env names identical; only values change.
- Graceful shutdown, persistent server and load testing apply here, not on Vercel.
## Docker
```
docker compose up --build
```
See Dockerfile and docker-compose.yml.
