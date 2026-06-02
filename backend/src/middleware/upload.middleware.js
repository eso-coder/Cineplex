const ApiError = require('../utils/ApiError');

// Wraps multer upload to return proper ApiError on multer failures
const handleUpload = (uploadFn) => (req, res, next) => {
  uploadFn(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(ApiError.badRequest('File size exceeds allowed limit'));
    }
    return next(ApiError.badRequest(err.message || 'File upload failed'));
  });
};

module.exports = { handleUpload };
