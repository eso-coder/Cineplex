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
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  REFRESH_COOKIE_OPTIONS,
};
