// Input validation. Every route uses these, never trusts req.body directly.
function isEmail(v) { return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254; }
function isString(v, max) { return typeof v === 'string' && v.length > 0 && v.length <= max; }
function cleanText(v) { return typeof v === 'string' ? v.trim() : ''; }
// ExamMate limits (Phase 1): question max 2000 chars, photo handled separately.
const EXAMMATE_MAX_QUESTION = 2000;
const EXAMMATE_MAX_SUBJECT = 100;
module.exports = { isEmail, isString, cleanText, EXAMMATE_MAX_QUESTION, EXAMMATE_MAX_SUBJECT };
