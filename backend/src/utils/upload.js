const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { nodeEnv } = require('../config/env');
const logger = require('./logger');

/*
 * Image upload helper (avatar/cover).
 *
 * Files are saved on local disk under <project>/uploads, which the Express
 * server exposes at /uploads/*. The caller gets back { url, public_id }.
 * On Vercel (read-only fs) the frontend uses the /auth/avatar-url base64 path
 * instead, so this local-disk branch is only hit in local development.
 */

const UPLOAD_ROOT = path.join(__dirname, '../../../uploads');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

/** Upload an in-memory file buffer. folder e.g. 'avatars' | 'covers'. */
async function uploadImage(buffer, folder, originalname) {
  const dir = path.join(UPLOAD_ROOT, folder);
  ensureDir(dir);
  const ext = (path.extname(originalname || '') || '.jpg').toLowerCase();
  const filename = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  // public_id form "local:folder/filename" lets us delete it later.
  return { url: `/uploads/${folder}/${filename}`, public_id: `local:${folder}/${filename}` };
}

/** Remove a previously uploaded image (best-effort). */
async function deleteImage(publicId) {
  if (!publicId || !publicId.startsWith('local:')) return;
  const rel = publicId.slice('local:'.length);
  fs.promises.unlink(path.join(UPLOAD_ROOT, rel)).catch(() => {});
}

module.exports = {
  uploadImage,
  deleteImage,
  UPLOAD_ROOT,
};

if (nodeEnv !== 'production') {
  logger.info('[upload] storage mode: local disk (/uploads)');
}
