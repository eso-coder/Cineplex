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

// Frontend fayllari (backend/.. papkasi = loyiha ildizi)
const FRONTEND_DIR = path.join(__dirname, '../../');

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  cors({
    origin: clientUrl,
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
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
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
