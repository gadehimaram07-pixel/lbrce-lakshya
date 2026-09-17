const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'lakshya_super_secret_jwt_key_2026_fest_portal';

const verifyAdminToken = (req, res, next) => {
  const authHeader = req.headers['authorization'] || req.headers['x-access-token'] || req.query.token;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Admin authorization token is required.'
    });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired authentication token.'
    });
  }
};

module.exports = {
  verifyAdminToken,
  JWT_SECRET
};
