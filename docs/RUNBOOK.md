# Runbook — what to do when something breaks
- Server down: check /health, then /ready. If DB is disconnected, check
  TURSO_DATABASE_URL / token in hosting env, then Turso status.
- Database down: restore from the latest off-site backup (see BACKUP-RESTORE),
  then run `npm run restore-test` before reopening traffic.
- AI down / quota: ExamMate returns a friendly 502/503, never a fake answer.
  Check monthly token cap in ai_usage, then provider status.
- Rollback: Vercel — redeploy the previous deployment. VPS/Docker — deploy
  the previous image/tag. Database migrations are forward-only in Phase 1;
  rollback is by restoring a backup, not by reversing a migration.
- RTO/RPO (basic): RTO = time to redeploy + restore. RPO = time since the
  last backup. Keep backups frequent enough that RPO is acceptable.
- Never paste a secret in a log, chat, or issue. Rotate it instead.
