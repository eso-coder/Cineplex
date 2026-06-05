/**
 * Vercel serverless entry point.
 * Barcha /api/* so'rovlar shu yerga keladi.
 *
 * Muhim: barcha paketlar backend/node_modules da o'rnatilgan.
 * Shu sababli mongoose va dotenv ga to'g'ridan-to'g'ri yo'l ko'rsatilgan.
 */
const path = require('path');
const BACKEND = path.resolve(__dirname, '../backend');

// dotenv — backend papkasidagi .env ni yukla (local dev uchun)
require(path.join(BACKEND, 'node_modules/dotenv')).config({
  path: path.join(BACKEND, '.env'),
});

// mongoose — backend modellari bilan BIR XIL instance ishlatilsin
const mongoose = require(path.join(BACKEND, 'node_modules/mongoose'));

// Express ilovasi (app.listen() yo'q — Vercel boshqaradi)
const app = require('../backend/src/app');

// ── MongoDB connection caching (serverless uchun) ─────────────────────────────
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
