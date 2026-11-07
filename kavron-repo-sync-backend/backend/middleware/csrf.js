// CSRF: double-submit + session binding.
// The session cookie is httpOnly, so JS cannot read it. A separate
// non-httpOnly csrf cookie + X-CSRF-Token header must match the
// csrf_token stored in the session row. Safe methods (GET) are exempt.
function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.user) return res.status(401).json({ error: 'Please log in first.' });
  const header = req.get('X-CSRF-Token');
  if (!header || header !== req.user.csrfToken) {
    return res.status(403).json({ error: 'Security check failed. Please refresh and try again.' });
  }
  next();
}
module.exports = { csrfProtect };
