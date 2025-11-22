const jwt = require('jsonwebtoken');

const extractToken = (req) => {
  const authHeader = req.headers.authorization || req.headers['x-access-token'] || req.header('Authorization');
  if (!authHeader) return null;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return authHeader;
};

const authMiddleware = (roles = []) => {
  return (req, res, next) => {
    try {
      const token = extractToken(req);
      if (!token) {
        if (roles.length > 0) {
          return res.status(401).json({ error: 'No token provided' });
        }
        req.user = null;
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (process.env.NODE_ENV === 'development') {
        console.log('authMiddleware: token present, decoded=', decoded);
      }

      req.user = decoded;
      if (roles.length > 0 && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: 'Access denied: Insufficient role' });
      }
      next();
    } catch (error) {
      // If token expired: mark and continue for public routes; fail for protected routes
      if (error.name === 'TokenExpiredError') {
        // for protected routes (roles required), return expired info
        if (roles.length > 0) {
          return res.status(401).json({ expired: true, error: { message: 'jwt expired' } });
        }
        // for public routes (e.g. login), don't block — set flag and continue
        req.tokenExpired = true;
        req.user = null;
        return next();
      }
      return res.status(401).json({ error });
    }
  };
};

const requireAdmin = authMiddleware(['admin']);
const requireUser = authMiddleware(['customer','admin']);

module.exports = {
  authMiddleware,
  requireAdmin,
  requireUser,
  extractToken
};
