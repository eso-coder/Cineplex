const jwt = require('jsonwebtoken');
const { jwt: jwtCfg } = require('../config/env');

const signAccessToken = (payload) =>
  jwt.sign(payload, jwtCfg.accessSecret, { expiresIn: jwtCfg.accessExpiry });

const signRefreshToken = (payload) =>
  jwt.sign(payload, jwtCfg.refreshSecret, { expiresIn: jwtCfg.refreshExpiry });

const verifyAccessToken = (token) => jwt.verify(token, jwtCfg.accessSecret);

const verifyRefreshToken = (token) => jwt.verify(token, jwtCfg.refreshSecret);

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  // 'lax' — tashqi havoladan kirilganda ham cookie yuboriladi (strict'da
  // birinchi so'rovlar cookiesiz qolib, keraksiz 401 chiqishi mumkin edi)
  sameSite: 'lax',
  // 365 kun — har refresh'da qaytadan beriladi (sliding sessiya)
  maxAge: 365 * 24 * 60 * 60 * 1000,
};

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  REFRESH_COOKIE_OPTIONS,
};
