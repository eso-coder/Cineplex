const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { nodeEnv } = require('../config/env');

const errorMiddleware = (err, req, res, next) => {
  let error = err;

  // Mongoose validation error
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    error = ApiError.validationError(details);
  }

  // Mongoose cast error (invalid ObjectId)
  if (err instanceof mongoose.Error.CastError) {
    error = ApiError.badRequest(`Invalid ${err.path}: ${err.value}`);
  }

  // MongoDB duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error = ApiError.conflict(`${field} already exists`);
  }

  // JWT errors handled in authMiddleware already

  const statusCode = error.statusCode || 500;
  const message = error.isOperational ? error.message : 'Internal server error';

  if (!error.isOperational) {
    logger.error(err);
  }

  const response = {
    success: false,
    message,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      ...(error.details && { details: error.details }),
      ...(nodeEnv === 'development' && !error.isOperational && { stack: err.stack }),
    },
  };

  res.status(statusCode).json(response);
};

module.exports = errorMiddleware;
