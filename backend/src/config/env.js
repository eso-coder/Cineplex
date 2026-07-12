require('dotenv').config();

const requiredEnvVars = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',

  // ── Optional integrations (all degrade to dev stubs when unset) ──
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 465,
    user: process.env.SMTP_USER || process.env.GMAIL_USER || process.env.EMAIL_USER || '',
    pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS || '',
    from: process.env.MAIL_FROM || 'CINEPLEX <no-reply@cineplex.app>',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
  },
  apple: {
    clientId: process.env.APPLE_CLIENT_ID || '',
  },

  // ── CloudFront signed cookies (video segmentlarini himoyalash) ──
  // Uch birdek to'ldirilmasa, video himoyasi o'chirilgan holda ishlaydi
  // (frontend to'g'ridan-to'g'ri S3 URL'ga qaytadi) — SETUP_CLOUDFRONT.md'ga qarang.
  cloudfront: {
    domain: process.env.CF_DOMAIN || '',
    keyPairId: process.env.CF_KEY_PAIR_ID || '',
    privateKey: (process.env.CF_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    cookieDomain: process.env.CF_COOKIE_DOMAIN || '',
  },
};
