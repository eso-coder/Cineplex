const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { clientUrl, nodeEnv } = require('./config/env');
const errorMiddleware = require('./middleware/error.middleware');
const logger = require('./utils/logger');

// Routes
const authRoutes = require('./routes/auth.routes');
const movieRoutes = require('./routes/movie.routes');
const commentRoutes = require('./routes/comment.routes');
const ratingRoutes = require('./routes/rating.routes');
const adminRoutes = require('./routes/admin.routes');
const profileRoutes = require('./routes/profile.routes');
const { UPLOAD_ROOT } = require('./utils/upload');

const app = express();

// Vercel/reverse-proxy orqasida ishlaymiz — client IP X-Forwarded-For'dan olinadi.
// Bu rate-limit'ning to'g'ri (haqiqiy IP bo'yicha) ishlashi uchun zarur.
app.set('trust proxy', 1);

// Frontend fayllari (backend/.. papkasi = loyiha ildizi)
const FRONTEND_DIR = path.join(__dirname, '../../');

// ─── Security ────────────────────────────────────────────────────────────────
// CSP frontend'da ko'p inline script bo'lgani uchun o'chirilgan, ammo qolgan
// himoya sarlavhalari (HSTS, X-Frame-Options, X-Content-Type-Options,
// Referrer-Policy, ...) yoqilgan. HSTS HTTPS'ni majburiy qiladi.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false, // YouTube/S3 embed'lari uchun
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // rasm/media boshqa originlardan
    hsts: { maxAge: 15552000, includeSubDomains: true },
  })
);

// API javoblari hech qachon cache'lanmasligi va sniff qilinmasligi kerak
app.use('/api', (req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});

// CORS: bir nechta ruxsat etilgan originlar (Vercel + localhost + custom domain)
const allowedOrigins = clientUrl
  ? clientUrl.split(',').map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      // Same-origin yoki server-to-server so'rovlar (origin yo'q)
      if (!origin) return callback(null, true);
      // Barcha originga ruxsat (CLIENT_URL='*' bo'lsa)
      if (allowedOrigins.includes('*')) return callback(null, true);
      // Ro'yxatdagi originlarga ruxsat
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // .vercel.app domenlariga avtomatik ruxsat
      if (origin.endsWith('.vercel.app')) return callback(null, true);
      // .cineplex.uz domenlariga avtomatik ruxsat
      if (origin.endsWith('.cineplex.uz') || origin === 'https://cineplex.uz') return callback(null, true);
      return callback(new Error(`CORS: ${origin} is not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Global rate limit (not auth-specific)
app.use(
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ─── Parsers ─────────────────────────────────────────────────────────────────
// base64 avatar (~150 KB) va cover (~600 KB) uchun 2 MB kerak
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
app.use(mongoSanitize());

// ─── Logging ─────────────────────────────────────────────────────────────────
if (nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.info(msg.trim()) },
    })
  );
}

// ─── Static frontend ─────────────────────────────────────────────────────────
app.use(express.static(FRONTEND_DIR));

// ─── Uploaded media (avatars/covers when using local-disk storage) ───────────
app.use('/uploads', express.static(UPLOAD_ROOT));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) =>
  res.json({ success: true, message: 'API is running', timestamp: new Date().toISOString() })
);

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/activity', profileRoutes.activityRouter);
app.use('/api/favourites', profileRoutes.favouritesRouter);

// ─── 404: API → JSON, boshqa → index.html ────────────────────────────────────
app.use((req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
  }
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorMiddleware);

module.exports = app;
