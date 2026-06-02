const { smtp, nodeEnv } = require('../config/env');
const logger = require('./logger');

/*
 * OTP mailer.
 *
 * If SMTP credentials are configured (SMTP_USER + SMTP_PASS, e.g. a Gmail app
 * password) AND the `nodemailer` package is installed, a real email is sent.
 * Otherwise we fall back to a dev stub: the code is logged to the server console
 * and, in non-production, returned to the caller so the UI can surface it.
 */

let transporter = null;
let nodemailer = null;
const smtpConfigured = Boolean(smtp.user && smtp.pass);

if (smtpConfigured) {
  try {
    // Lazy require so a missing dependency never crashes the server.
    nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });
  } catch (err) {
    logger.warn(`[mailer] nodemailer unavailable (${err.message}) — using dev stub.`);
    transporter = null;
  }
}

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const otpEmailHtml = (code) => `
  <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#14181c;border-radius:16px;color:#fff">
    <h1 style="font-size:20px;margin:0 0 8px;color:#fff">Confirm your email</h1>
    <p style="color:#9ab;margin:0 0 24px;font-size:14px">Use this code to finish creating your CINEPLEX account. It expires in 10 minutes.</p>
    <div style="font-size:34px;font-weight:800;letter-spacing:10px;text-align:center;padding:18px;background:#1f262d;border-radius:12px;color:#fff">${code}</div>
    <p style="color:#5a6a78;margin:24px 0 0;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
  </div>`;

/**
 * Sends an OTP to `email`. Returns { delivered, devCode }.
 * `devCode` is only populated outside production so the client can auto-fill.
 */
async function sendOtpEmail(email, code) {
  if (transporter) {
    try {
      await transporter.sendMail({
        from: smtp.from,
        to: email,
        subject: `${code} is your CINEPLEX verification code`,
        html: otpEmailHtml(code),
      });
      return { delivered: true, devCode: null };
    } catch (err) {
      logger.error(`[mailer] Failed to send OTP to ${email}: ${err.message}`);
      // fall through to stub so signup still completes in dev
    }
  }

  logger.info(`[mailer:DEV] OTP for ${email} → ${code}`);
  return { delivered: false, devCode: nodeEnv === 'production' ? null : code };
}

module.exports = { generateOtp, sendOtpEmail, smtpConfigured };
