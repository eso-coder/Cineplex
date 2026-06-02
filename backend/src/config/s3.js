const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET;
const REGION = process.env.AWS_REGION;

const generateKey = (folder, originalname) => {
  const ext = path.extname(originalname);
  const id = crypto.randomUUID();
  return `${folder}/${id}${ext}`;
};

// Upload buffer to S3, returns { url, key }
const uploadToS3 = async (buffer, folder, mimetype, originalname) => {
  const key = generateKey(folder, originalname);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
    })
  );
  const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
  return { url, key };
};

// Delete object from S3 by key
const deleteFromS3 = async (key) => {
  if (!key) return;
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
};

// Multer memory storage (files kept in RAM, then uploaded to S3 in controller)
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only jpg, png, webp images are allowed'), false);
  },
});

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^video\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only video files are allowed'), false);
  },
});

module.exports = { uploadToS3, deleteFromS3, imageUpload, videoUpload };
