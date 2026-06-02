const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { cloudinary: cfg, nodeEnv } = require('../config/env');
const logger = require('./logger');

/*
 * Image upload helper.
 *
 * If Cloudinary credentials are configured AND the `cloudinary` package is
 * installed, images go to Cloudinary. Otherwise we fall back to saving the file
 * on local disk under <project>/uploads, which the Express server exposes at
 * /uploads/*. Either way the caller gets back { url, public_id }.
 */

const UPLOAD_ROOT = path.join(__dirname, '../../../uploads');

let cloudinary = null;
const cloudinaryConfigured = Boolean(cfg.cloudName && cfg.apiKey && cfg.apiSecret);

if (cloudinaryConfigured) {
  try {
    cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: cfg.cloudName,
      api_key: cfg.apiKey,
      api_secret: cfg.apiSecret,
    });
  } catch (err) {
    logger.warn(`[upload] cloudinary unavailable (${err.message}) — using local disk.`);
    cloudinary = null;
  }
}

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const cloudinaryUpload = (buffer, folder) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `cineplex/${folder}`, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(buffer);
  });

const localUpload = (buffer, folder, originalname) => {
  const dir = path.join(UPLOAD_ROOT, folder);
  ensureDir(dir);
  const ext = (path.extname(originalname || '') || '.jpg').toLowerCase();
  const id = crypto.randomUUID();
  const filename = `${id}${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  // public_id form "local:folder/filename" lets us delete it later.
  return { url: `/uploads/${folder}/${filename}`, public_id: `local:${folder}/${filename}` };
};

/** Upload an in-memory file buffer. folder e.g. 'avatars' | 'covers'. */
async function uploadImage(buffer, folder, originalname) {
  if (cloudinary) {
    try {
      return await cloudinaryUpload(buffer, folder);
    } catch (err) {
      logger.error(`[upload] Cloudinary upload failed (${err.message}) — falling back to disk.`);
    }
  }
  return localUpload(buffer, folder, originalname);
}

/** Remove a previously uploaded image (best-effort). */
async function deleteImage(publicId) {
  if (!publicId) return;
  if (publicId.startsWith('local:')) {
    const rel = publicId.slice('local:'.length);
    const full = path.join(UPLOAD_ROOT, rel);
    fs.promises.unlink(full).catch(() => {});
    return;
  }
  if (cloudinary) {
    cloudinary.uploader.destroy(publicId).catch(() => {});
  }
}

module.exports = {
  uploadImage,
  deleteImage,
  cloudinaryConfigured,
  UPLOAD_ROOT,
  storageMode: cloudinary ? 'cloudinary' : 'local',
};

if (nodeEnv !== 'production') {
  logger.info(`[upload] storage mode: ${cloudinary ? 'cloudinary' : 'local disk (/uploads)'}`);
}
