// bcryptjs (pure JS) is used on purpose, not argon2.
// argon2 is a native module and sometimes fails a Vercel build.
// bcryptjs cost 12 is the Phase 1 standard. Never store plain passwords,
// never use MD5 or SHA for passwords.
const bcrypt = require('bcryptjs');
const COST = 12;
async function hashPassword(plain) { return bcrypt.hash(plain, COST); }
async function verifyPassword(plain, hash) { return bcrypt.compare(plain, hash); }
module.exports = { hashPassword, verifyPassword, COST };
