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
        // if route requires roles, reject when no token
        if (roles.length > 0) {
          return res.status(401).json({ error: 'No token provided' });
        }
        req.user = null;
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // debug log in development
      if (process.env.NODE_ENV === 'development') {
        console.log('authMiddleware: token present, decoded=', decoded);
      }

      req.user = decoded;
      if (roles.length > 0 && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: 'Access denied: Insufficient role' });
      }
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
};

const requireAdmin = authMiddleware(['admin']);
const requireUser = authMiddleware(['customer', 'admin']);

module.exports = {
  authMiddleware,
  requireAdmin,
  requireUser,
  extractToken
};
