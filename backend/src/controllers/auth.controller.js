const crypto = require('crypto');
const User = require('../models/User');
const Otp = require('../models/Otp');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { signAccessToken, signRefreshToken, verifyRefreshToken, REFRESH_COOKIE_OPTIONS } = require('../utils/jwt');
const { sendSuccess, sendCreated } = require('../utils/response');
const { generateOtp, sendOtpEmail } = require('../utils/mailer');
const { uploadImage, deleteImage } = require('../utils/upload');
const { handleUpload } = require('../middleware/upload.middleware');
const { imageUpload } = require('../config/s3');
const { google: googleCfg, apple: appleCfg, nodeEnv } = require('../config/env');
const logger = require('../utils/logger');

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Rasm URL'lari faqat https:// yoki xavfsiz raster data:image bo'lishi mumkin.
// data:image/svg+xml ga RUXSAT BERILMAYDI — SVG ichida script bo'lib, stored XSS
// vektori bo'lishi mumkin. http:// (shifrlanmagan) ham rad etiladi.
const isSafeImageUrl = (url) => {
  if (typeof url !== 'string') return false;
  if (url.startsWith('https://')) return true;
  return /^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(url);
};

/* Har bir qurilma/brauzer uchun ALOHIDA refresh token saqlanadi
   (refreshTokens massivi, oxirgi 10 ta sessiya). Avvalgi xato: bitta
   `refreshToken` maydoni bo'lgani uchun boshqa qurilmada kirish eski
   sessiyani bekor qilardi — foydalanuvchi tez-tez qayta login qilishga
   majbur bo'lardi. `replacedToken` — rotatsiyada eskisining o'rniga
   yangisi qo'yiladi (massiv cheksiz o'smaydi). */
const MAX_SESSIONS = 10;
const generateTokens = async (user, replacedToken) => {
  const payload = { id: user._id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  // refreshTokens select:false — hujjatda tanlanmagan bo'lsa DB'dan olamiz,
  // aks holda mavjud sessiyalar ro'yxati bilinmasdan o'chib ketadi
  if (user.refreshTokens === undefined) {
    const fresh = await User.findById(user._id).select('+refreshTokens');
    user.refreshTokens = (fresh && fresh.refreshTokens) || [];
  }
  const list = (user.refreshTokens || []).filter(
    (t) => t && t !== replacedToken
  );
  list.push(refreshToken);
  user.refreshTokens = list.slice(-MAX_SESSIONS);
  // Legacy maydon endi ishlatilmaydi — eski qiymat qolib ketmasin
  user.refreshToken = '';
  await user.save({ validateBeforeSave: false });
  return { accessToken, refreshToken };
};

const issueSession = async (res, user, message, created = false) => {
  // Kirish vaqtini va sonini yozib boramiz (generateTokens save qiladi)
  user.lastLogin = new Date();
  user.loginCount = (user.loginCount || 0) + 1;
  const { accessToken, refreshToken } = await generateTokens(user);
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
  const fn = created ? sendCreated : sendSuccess;
  return fn(res, { user: user.toPublic(), accessToken }, message);
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/signup  → create/update a pending OTP, send the code by email
// ─────────────────────────────────────────────────────────────────────────────
const signup = asyncHandler(async (req, res) => {
  const { firstName, lastName = '', email, phone = '', password } = req.body;

  const existing = await User.findOne({ email });
  if (existing && existing.isVerified) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // One active OTP per email — replace any prior one.
  await Otp.deleteMany({ email });
  await Otp.create({
    email,
    code,
    expiresAt,
    used: false,
    payload: { firstName, lastName, phone, password: password || null },
  });

  const { delivered, devCode } = await sendOtpEmail(email, code);

  return sendCreated(
    res,
    { email, otpSent: true, delivered, ...(devCode ? { devCode } : {}) },
    'Verification code sent'
  );
});

// LEGACY: POST /api/auth/register (name + email + password) — register.html
// hali shu yo'lni ishlatadi; name'ni firstName/lastName'ga bo'lib signup'ga uzatamiz.
const register = (req, res, next) => {
  const { name = '', email, password } = req.body;
  const [firstName, ...rest] = String(name).trim().split(/\s+/);
  req.body = { firstName: firstName || '', lastName: rest.join(' '), email, password };
  return signup(req, res, next);
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/verify-otp  → confirm code, create account, return JWT
// ─────────────────────────────────────────────────────────────────────────────
const verifyOtp = asyncHandler(async (req, res) => {
  const { email, code } = req.body;

  const otp = await Otp.findOne({ email, used: false }).sort({ createdAt: -1 });
  if (!otp) throw ApiError.badRequest('No pending verification. Please sign up again.');
  if (otp.expiresAt.getTime() < Date.now()) throw ApiError.badRequest('Code has expired. Request a new one.');

  // Brute-force himoyasi: 5 ta noto'g'ri urinishdan so'ng kod bloklanadi.
  const MAX_OTP_ATTEMPTS = 5;
  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    await Otp.deleteMany({ email });
    throw ApiError.badRequest('Too many incorrect attempts. Please request a new code.');
  }

  if (otp.code !== code) {
    otp.attempts += 1;
    await otp.save();
    const left = MAX_OTP_ATTEMPTS - otp.attempts;
    throw ApiError.badRequest(left > 0 ? `Incorrect code. ${left} attempt(s) left.` : 'Too many incorrect attempts. Please request a new code.');
  }

  otp.used = true;
  await otp.save();

  const data = otp.payload || {};
  const name = `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.name || email.split('@')[0];

  let user = await User.findOne({ email });
  if (user) {
    user.isVerified = true;
    if (data.firstName) user.firstName = data.firstName;
    if (data.lastName) user.lastName = data.lastName;
    if (data.phone) user.phone = data.phone;
    if (data.password) user.password = data.password;
    await user.save();
  } else {
    user = await User.create({
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      name,
      email,
      phone: data.phone || '',
      password: data.password || undefined,
      isVerified: true,
      provider: 'local',
    });
  }

  await Otp.deleteMany({ email });
  return issueSession(res, user, 'Account verified', true);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/resend-otp
// ─────────────────────────────────────────────────────────────────────────────
const resendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const prev = await Otp.findOne({ email }).sort({ createdAt: -1 });

  if (!prev) {
    // Allow resend for existing but unverified users (e.g. signed up via legacy /register)
    const user = await User.findOne({ email });
    if (!user) throw ApiError.badRequest('No pending signup for this email');
    if (user.isVerified) throw ApiError.badRequest('Email is already verified');
  }

  const code = generateOtp();
  await Otp.deleteMany({ email });
  await Otp.create({
    email,
    code,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    used: false,
    payload: prev ? prev.payload : null,
  });

  const { delivered, devCode } = await sendOtpEmail(email, code);
  return sendSuccess(res, { email, delivered, ...(devCode ? { devCode } : {}) }, 'New code sent');
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/signin  (alias of login)  — email + password
// ─────────────────────────────────────────────────────────────────────────────
const signin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.isActive) throw ApiError.forbidden('Account has been deactivated');
  if (!user.isVerified) {
    throw new ApiError(403, 'Email tasdiqlanmagan', 'EMAIL_NOT_VERIFIED', { needsVerification: true });
  }
  return issueSession(res, user, 'Login successful');
});

// ─────────────────────────────────────────────────────────────────────────────
// OAuth helpers (Google / Apple)
// Real verification runs when credentials + SDKs are present; otherwise we accept
// a provided email so the flow is testable in stub mode.
// ─────────────────────────────────────────────────────────────────────────────
const verifyGoogleToken = async (token) => {
  if (!token || !googleCfg.clientId) return null;
  try {
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(googleCfg.clientId);
    const ticket = await client.verifyIdToken({ idToken: token, audience: googleCfg.clientId });
    const p = ticket.getPayload();
    return { email: p.email, firstName: p.given_name || '', lastName: p.family_name || '', avatar: p.picture };
  } catch (err) {
    logger.warn(`[auth] Google token verify failed: ${err.message}`);
    return null;
  }
};

const verifyAppleToken = async (token) => {
  if (!token || !appleCfg.clientId) return null;
  try {
    const appleSignin = require('apple-signin-auth');
    // audience = Services ID — token aynan bizning ilova uchun chiqarilganini tekshiradi
    const p = await appleSignin.verifyIdToken(token, {
      audience: appleCfg.clientId,
      ignoreExpiration: false,
    });
    return { email: p.email, firstName: '', lastName: '' };
  } catch (err) {
    logger.warn(`[auth] Apple token verify failed: ${err.message}`);
    return null;
  }
};

const oauthLogin = (provider, verifier) =>
  asyncHandler(async (req, res) => {
    const { token, credential, email: bodyEmail, firstName = '', lastName = '' } = req.body;
    const idToken = token || credential;

    let profile = await verifier(idToken);
    if (!profile) {
      // XAVFSIZLIK: production'da HECH QACHON email'ga ishonmaymiz — bu autentifikatsiya
      // bypass'i bo'lardi (istalgan kishi istalgan email, jumladan admin bilan kira olardi).
      // Stub fallback faqat development muhitida, OAuth sozlanmagan holatda ishlaydi.
      if (nodeEnv === 'production') {
        throw ApiError.unauthorized(`${provider} token verification failed`);
      }
      if (!bodyEmail) {
        throw ApiError.badRequest(`${provider} sign-in is not configured. Provide an email to continue in stub mode.`);
      }
      logger.warn(`[auth] ${provider} STUB login (dev only) for ${bodyEmail}`);
      profile = { email: bodyEmail, firstName, lastName, avatar: '' };
    }

    let user = await User.findOne({ email: profile.email });
    if (!user) {
      const name = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.email.split('@')[0];
      user = await User.create({
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        name,
        email: profile.email,
        provider,
        isVerified: true,
        password: crypto.randomBytes(24).toString('hex'), // unusable random password
        avatar: profile.avatar ? { url: profile.avatar, public_id: '' } : undefined,
      });
    }
    return issueSession(res, user, `${provider} sign-in successful`);
  });

// GET /api/auth/config — ommaviy OAuth client ID lari (frontend qaysi tugmani
// yoqishni shu orqali biladi). Client ID maxfiy emas — uni ko'rsatish xavfsiz.
const getAuthConfig = asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    google: { clientId: googleCfg.clientId || '', enabled: !!googleCfg.clientId },
    apple:  { clientId: appleCfg.clientId  || '', enabled: !!appleCfg.clientId },
  });
});

const googleAuth = oauthLogin('google', verifyGoogleToken);
const appleAuth = oauthLogin('apple', verifyAppleToken);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
const logout = asyncHandler(async (req, res) => {
  // Faqat SHU qurilmaning sessiyasi yopiladi — boshqa qurilmalardagi
  // sessiyalar (refreshTokens massividagi qolgan tokenlar) saqlanadi
  const token = req.cookies?.refreshToken || '';
  await User.findByIdAndUpdate(req.user._id, {
    $set: { refreshToken: '' },
    ...(token ? { $pull: { refreshTokens: token } } : {}),
  });
  res.clearCookie('refreshToken');
  sendSuccess(res, null, 'Logged out successfully');
});

// POST /api/auth/refresh-token
const refreshToken = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) throw ApiError.unauthorized('Refresh token required');
  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }
  const user = await User.findById(decoded.id).select('+refreshToken +refreshTokens');
  // Token yangi massivda YOKI eski legacy maydonda bo'lsa — haqiqiy.
  // (Legacy: bu o'zgarishdan oldin berilgan cookie'lar ham ishlashda davom
  // etadi — foydalanuvchi qayta login qilishga majbur bo'lmaydi.)
  const inList = (user && user.refreshTokens || []).includes(token);
  const isLegacy = user && user.refreshToken === token && token;
  if (!user || (!inList && !isLegacy)) {
    throw ApiError.unauthorized('Refresh token revoked');
  }
  const { accessToken, refreshToken: newRefresh } = await generateTokens(user, token);
  res.cookie('refreshToken', newRefresh, REFRESH_COOKIE_OPTIONS);
  sendSuccess(res, { accessToken }, 'Token refreshed');
});

// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  sendSuccess(res, req.user.toPublic ? req.user.toPublic() : req.user);
});

// PATCH /api/auth/update-profile
const updateProfile = asyncHandler(async (req, res) => {
  const { name, email, firstName, lastName, location, website, socialHandle, phone } = req.body;
  if (email && email !== req.user.email) {
    const exists = await User.findOne({ email });
    if (exists) throw ApiError.conflict('Email already in use');
  }

  const user = await User.findById(req.user._id);
  if (firstName !== undefined) user.firstName = firstName;
  if (lastName !== undefined) user.lastName = lastName;
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  if (location !== undefined) user.location = location;
  if (website !== undefined) user.website = website;
  if (socialHandle !== undefined) user.socialHandle = socialHandle;
  if (phone !== undefined) user.phone = phone;
  // Keep display name coherent if first/last changed but name not explicitly set.
  if ((firstName !== undefined || lastName !== undefined) && name === undefined) {
    const composed = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    if (composed) user.name = composed;
  }
  await user.save({ validateBeforeSave: true });

  sendSuccess(res, user.toPublic(), 'Profile updated');
});

// PATCH /api/auth/change-password
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');
  if (!user.password || !(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  user.password = newPassword;
  await user.save();
  sendSuccess(res, null, 'Password changed successfully');
});

// PATCH /api/auth/avatar-url  — saves any URL or base64 data URL directly to DB
// Used when no S3/Cloudinary is configured (Vercel serverless)
const saveAvatarUrl = asyncHandler(async (req, res) => {
  const { avatarUrl } = req.body;
  if (!avatarUrl) throw ApiError.badRequest('avatarUrl required');
  if (!isSafeImageUrl(avatarUrl)) throw ApiError.badRequest('Invalid avatar URL');
  const user = await User.findById(req.user._id);
  user.avatar = { url: avatarUrl, public_id: '' };
  await user.save({ validateBeforeSave: false });
  const u = user.toPublic();
  sendSuccess(res, { avatar: user.avatar, avatarUrl }, 'Avatar updated');
});

// PATCH /api/auth/cover-url  — saves any URL or base64 data URL directly to DB
const saveCoverUrl = asyncHandler(async (req, res) => {
  const { coverUrl } = req.body;
  if (!coverUrl) throw ApiError.badRequest('coverUrl required');
  if (!isSafeImageUrl(coverUrl)) throw ApiError.badRequest('Invalid cover URL');
  const user = await User.findById(req.user._id);
  user.coverImage = { url: coverUrl, public_id: '' };
  await user.save({ validateBeforeSave: false });
  sendSuccess(res, { coverImage: user.coverImage, coverImageUrl: coverUrl }, 'Cover updated');
});

// POST /api/auth/upload-avatar  (Cloudinary if configured, else local disk)
const uploadAvatar = [
  handleUpload(imageUpload.single('avatar')),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('Avatar file required');
    const user = await User.findById(req.user._id);
    if (user.avatar?.public_id) await deleteImage(user.avatar.public_id);
    const { url, public_id } = await uploadImage(req.file.buffer, 'avatars', req.file.originalname);
    user.avatar = { url, public_id };
    await user.save({ validateBeforeSave: false });
    sendSuccess(res, { avatar: user.avatar, avatarUrl: url }, 'Avatar uploaded');
  }),
];

// POST /api/auth/upload-cover
const uploadCover = [
  handleUpload(imageUpload.single('cover')),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('Cover file required');
    const user = await User.findById(req.user._id);
    if (user.coverImage?.public_id) await deleteImage(user.coverImage.public_id);
    const { url, public_id } = await uploadImage(req.file.buffer, 'covers', req.file.originalname);
    user.coverImage = { url, public_id };
    await user.save({ validateBeforeSave: false });
    sendSuccess(res, { coverImage: user.coverImage, coverImageUrl: url }, 'Cover uploaded');
  }),
];

module.exports = {
  saveAvatarUrl,
  saveCoverUrl,
  register,
  signup,
  verifyOtp,
  resendOtp,
  signin,
  login: signin, // keep /login working
  getAuthConfig,
  googleAuth,
  appleAuth,
  logout,
  refreshToken,
  getMe,
  updateProfile,
  changePassword,
  uploadAvatar,
  uploadCover,
};
