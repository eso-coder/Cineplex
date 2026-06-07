const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const v = require('../validators/auth.validator');
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for localhost (dev/admin tools)
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1',
});

// ── Public OAuth config (qaysi providerlar yoqilgan) ──
router.get('/config', ctrl.getAuthConfig);

// ── New Letterboxd-style auth (OTP + OAuth) ──
router.post('/signup', authLimiter, validate(v.signup), ctrl.signup);
router.post('/verify-otp', authLimiter, validate(v.verifyOtp), ctrl.verifyOtp);
router.post('/resend-otp', authLimiter, validate(v.resendOtp), ctrl.resendOtp);
router.post('/signin', authLimiter, validate(v.login), ctrl.signin);
router.post('/google', authLimiter, validate(v.oauth), ctrl.googleAuth);
router.post('/apple', authLimiter, validate(v.oauth), ctrl.appleAuth);

// ── Legacy / shared ──
router.post('/register', authLimiter, validate(v.register), ctrl.register);
router.post('/login', authLimiter, validate(v.login), ctrl.login);
router.post('/logout', authMiddleware, ctrl.logout);
router.post('/refresh-token', ctrl.refreshToken);
router.get('/me', authMiddleware, ctrl.getMe);
router.patch('/update-profile', authMiddleware, validate(v.updateProfile), ctrl.updateProfile);
router.patch('/change-password', authMiddleware, validate(v.changePassword), ctrl.changePassword);
router.post('/upload-avatar', authMiddleware, ...ctrl.uploadAvatar);
router.post('/upload-cover', authMiddleware, ...ctrl.uploadCover);
router.patch('/avatar-url', authMiddleware, ctrl.saveAvatarUrl);
router.patch('/cover-url', authMiddleware, ctrl.saveCoverUrl);

module.exports = router;
