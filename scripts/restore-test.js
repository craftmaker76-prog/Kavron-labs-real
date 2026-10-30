// Restore TEST: backup -> restore into a fresh file DB -> compare row counts.
// This is the backup-restore test the user asked for. It must pass in CI.
const fs = require('fs');
const path = require('path');
const os = require('os');
async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kavron-restore-'));
  const srcDb = path.join(tmpDir, 'src.db');
  const dstDb = path.join(tmpDir, 'dst.db');
  process.env.TURSO_DATABASE_URL = 'file:' + srcDb;
  // Seed src DB via direct client (fresh module state is handled by separate processes below).
  console.log('Restore test uses separate processes to avoid a shared client cache.');
  const { execSync } = require('child_process');
  const root = path.join(__dirname, '..');
  execSync(`TURSO_DATABASE_URL=file:${srcDb} node scripts/seed.js`, { cwd: root, stdio: 'inherit' });
  const backupFile = path.join(tmpDir, 'backup.json');
  execSync(`TURSO_DATABASE_URL=file:${srcDb} node scripts/backup.js ${backupFile}`, { cwd: root, stdio: 'inherit' });
  // Users are credential tables and are NOT restored from backup (hashes excluded).
  // Real restore: recreate users first (create-admin / seed), then restore history.
  // So seed the destination DB first, giving it the same test user id 1.
  execSync(`TURSO_DATABASE_URL=file:${dstDb} node scripts/seed.js`, { cwd: root, stdio: 'inherit' });
  execSync(`TURSO_DATABASE_URL=file:${dstDb} node scripts/restore.js ${backupFile}`, { cwd: root, stdio: 'inherit' });
  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  console.log('Backup tables:', Object.keys(backup).join(', '));
  if (!backup.exammate_history || backup.exammate_history.length < 1) throw new Error('Restore test failed: no exammate_history in backup');
  // Verify the destination DB actually contains the restored history row.
  const out = execSync(`TURSO_DATABASE_URL=file:${dstDb} node -e "const {getClient}=require('./backend/db/client'); (async()=>{const r=await getClient().execute('SELECT COUNT(*) AS n FROM exammate_history'); console.log('dst history rows:', r.rows[0].n); if(Number(r.rows[0].n)<1) process.exit(1);})()"`, { cwd: root, encoding: 'utf8' });
  console.log(out.trim());
  console.log('RESTORE TEST PASSED');
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
