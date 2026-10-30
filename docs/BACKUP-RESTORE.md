# Backup & Restore
- Backup: `npm run backup` — exports tables to `database/backups/backup-*.json`.
  Password hashes and session token hashes are NOT exported, on purpose.
- Restore test: `npm run restore-test` — backup → restore into a fresh DB →
  compare. This test must pass in CI before a release.
- Restore: `npm run restore -- <file>` — restores non-credential tables.
  After a restore, recreate admins with `scripts/create-admin.js`.
- Off-site copy: copy the backup file off the server (e.g. a second drive
  or object storage). A backup on the same server as the DB is not a backup.
- Turso production: use `turso db shell <db> ".dump"` as an additional
  dump, and keep the JSON export as the portable, hosting-independent copy.
- Encryption: encrypt backup files at rest if they contain student data.
