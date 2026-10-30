// Auth + authorization middleware. Hiding a page is NOT security:
// every protected route must pass these checks on the server.
const { getSessionFromCookie } = require('../auth/sessions');
async function requireAuth(req, res, next) {
  try {
    const s = await getSessionFromCookie(req);
    if (!s) return res.status(401).json({ error: 'Please log in first.' });
    req.user = s; next();
  } catch (e) { next(e); }
}
// Reusable role check: requireRole('admin')
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
    if (req.user.role !== role) return res.status(403).json({ error: 'You do not have permission for this action.' });
    next();
  };
}
// IDOR / object-level check: a user may only read their OWN history.
// Admins may read any. Usage: requireOwnership(req => req.params.userId)
function requireOwnership(getOwnerId) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
    if (req.user.role === 'admin') return next();
    const ownerId = String(getOwnerId(req));
    if (String(req.user.userId) !== ownerId) return res.status(403).json({ error: 'This record does not belong to you.' });
    next();
  };
}
module.exports = { requireAuth, requireRole, requireOwnership };
