const ApiError = require('../utils/ApiError');

const adminMiddleware = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    throw ApiError.forbidden('Admin access required');
  }
  next();
};

module.exports = adminMiddleware;
