/**
 * Vercel serverless entry point.
 * Barcha /api/* so'rovlar shu yerga keladi.
 * MongoDB ulanishi serverless uchun cache qilingan.
 */
const path = require('path');

// .env faylni backend papkasidan yukla (lokal dev uchun)
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const mongoose = require('mongoose');

// ── MongoDB connection caching (serverless best practice) ─────────────────────
let isConnected = false;

async function connectDB() {
  if (isConnected && mongoose.connection.readyState === 1) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is not set');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  isConnected = true;
}

// ── Express app (app.listen() chaqirilmaydi — Vercel boshqaradi) ──────────────
const app = require('../backend/src/app');

// ── Vercel serverless handler ─────────────────────────────────────────────────
module.exports = async (req, res) => {
  try {
    await connectDB();
  } catch (err) {
    console.error('[vercel] DB connection failed:', err.message);
    return res.status(503).json({
      success: false,
      message: 'Database unavailable. Please try again shortly.',
    });
  }

  return app(req, res);
};
