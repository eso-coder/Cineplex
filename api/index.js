/**
 * Vercel serverless entry point — /api/* barcha so'rovlar shu yerga keladi.
 * Barcha paketlar root node_modules da (root package.json dan).
 */
const path = require('path');

// Local dev uchun backend/.env yukla (Vercel da env vars dashboard dan keladi)
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const mongoose = require('mongoose');
const app = require('../backend/src/app');

// ── MongoDB connection caching (serverless best practice) ─────────────────────
let isConnected = false;

async function connectDB() {
  if (isConnected && mongoose.connection.readyState === 1) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is not set');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  isConnected = true;
  console.log('[vercel] MongoDB connected');
}

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
