const { verifyToken } = require('../utils/jwt');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Missing bearer token' });
  }
  try {
    req.user = verifyToken(token); // { id, role, name }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: `Requires role: ${roles.join(', ')}` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
