const { v2: cloudinary } = require('cloudinary');
const multer = require('multer');
const { cloudinary: cfg } = require('./env');

cloudinary.config({
  cloud_name: cfg.cloudName,
  api_key: cfg.apiKey,
  api_secret: cfg.apiSecret,
});

// Upload a buffer to Cloudinary using upload_stream (v2 compatible)
const uploadToCloudinary = (buffer, options = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    stream.end(buffer);
  });

// Multer memory storage instances
const imageMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only jpg, png, webp images are allowed'), false);
  },
});

const videoMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^video\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only video files are allowed'), false);
  },
});

// Named upload helpers (used in controllers)
const avatarUpload = imageMemory;
const posterUpload = imageMemory;
const videoUpload = videoMemory;

const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

module.exports = {
  cloudinary,
  uploadToCloudinary,
  avatarUpload,
  posterUpload,
  videoUpload,
  deleteFromCloudinary,
};
