const jwt = require('jsonwebtoken');

const extractToken = (req) => {
  const authHeader = req.headers.authorization || req.headers['x-access-token'] || req.header('Authorization');
  if (!authHeader) return null;
  // support "Bearer <token>" or raw token
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return authHeader;
};

const authMiddleware = (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // gắn thông tin user vào req (id, email, role...)
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const requireAdmin = (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Admin role required' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// export default middleware and named admin checker
module.exports = authMiddleware;
module.exports.requireAdmin = requireAdmin;