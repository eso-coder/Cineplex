const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');

const authMiddleware = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Access token required');
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }

  const user = await User.findById(decoded.id).select('-password -refreshToken');
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('User not found or deactivated');
  }

  req.user = user;
  next();
});

module.exports = authMiddleware;
