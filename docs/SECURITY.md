# Security
- Passwords: bcryptjs cost 12. No MD5/SHA. No plain passwords anywhere.
- Sessions: DB-backed, httpOnly, Secure in production, SameSite=Lax.
- CSRF: token bound to the session, required on all state-changing routes.
- Headers: helmet + CSP. HSTS is set by helmet in production.
- CORS: allowlist from ALLOWED_ORIGINS only. No wildcard.
- IDOR: every user-owned resource checks ownership on the server.
- Secrets: only in .env / hosting env. .env.example has dummy values only.
  If a key leaks: revoke it at the provider, rotate it, update hosting env,
  check git history with gitleaks, and record the incident in audit logs.
- Dependencies: run `npm audit` regularly; Dependabot/Snyk in CI.
- Cloudflare WAF / DDoS: configure at the domain level when the domain
  is connected (Phase 2 migration step, not faked in Phase 1).
- Email SPF/DKIM/DMARC: configure in domain DNS when the domain is live,
  otherwise password-reset emails will go to spam.
