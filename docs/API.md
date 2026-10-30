# API (Phase 1)
- GET /health — no auth, {status, db}
- GET /ready — no auth, 200 if DB is ready, else 503
- POST /api/auth/register — {email, password>=8} → role user only
- POST /api/auth/login — DB rate limit + lockout, sets httpOnly session cookie
- GET /api/auth/me — requires session, returns email, role, csrfToken
- POST /api/auth/logout — requires session + X-CSRF-Token
- POST /api/exammate/ask — requires session + CSRF, question ≤2000 chars,
  daily cap + monthly token cap, sanitized answerHtml, or honest 503/429/502
- GET /api/exammate/history/:userId — owner or admin only (IDOR)
- GET /api/admin/audit — admin only
- POST /api/admin/audit — admin only + CSRF
All errors return a clean message. Stack traces and DB details are never sent.
Logs never contain passwords, tokens, or student question/answer content.
