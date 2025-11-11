const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const generateToken = (payload, options = {}) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');

  let tokenPayload;
  if (!payload || typeof payload !== 'object') {
    tokenPayload = {};
  } else if (payload.id || payload.email || payload.role || payload.full_name || payload.name) {
    tokenPayload = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      full_name: payload.full_name,
      name: payload.name
    };
    // include any extra custom fields as well (e.g. purpose) if present
    const extraKeys = Object.keys(payload).filter(k => !['id','email','role','full_name','name'].includes(k));
    for (const k of extraKeys) tokenPayload[k] = payload[k];
  } else {
    tokenPayload = { ...payload };
  }

  const jwtOpts = {};
  if (options.expires_at) jwtOpts.expiresIn = options.expires_at;
  else if (options.expiresIn) jwtOpts.expiresIn = options.expiresIn;
  else jwtOpts.expiresIn = process.env.JWT_EXPIRES_IN || '1h';

  return jwt.sign(tokenPayload, secret, jwtOpts);
};

/**
 * Verify token and return decoded payload or null if invalid/expired.
 * (Returns null instead of throwing to let callers decide handling.)
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
};

const generateFreshToken = ()=>{
    return crypto.randomBytes(40).toString('hex'); //tạo chuỗi randoom có 80 ký tự
};

module.exports = {
  generateToken,
  verifyToken,
  generateFreshToken
};
