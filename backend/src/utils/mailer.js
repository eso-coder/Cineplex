const { smtp, nodeEnv } = require('../config/env');
const logger = require('./logger');

// ── Resend (priority 1) ───────────────────────────────────────────────────────
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
let resendClient = null;

if (RESEND_API_KEY) {
  try {
    const { Resend } = require('resend');
    resendClient = new Resend(RESEND_API_KEY);
    logger.info('[mailer] Resend configured ✓');
  } catch (err) {
    logger.warn(`[mailer] Resend unavailable (${err.message})`);
  }
}

// ── Nodemailer / Gmail SMTP (priority 2) ──────────────────────────────────────
let smtpTransporter = null;
const smtpConfigured = Boolean(smtp.user && smtp.pass);

if (!resendClient && smtpConfigured) {
  try {
    const nodemailer = require('nodemailer');
    smtpTransporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });
    logger.info('[mailer] SMTP (nodemailer) configured ✓');
  } catch (err) {
    logger.warn(`[mailer] nodemailer unavailable (${err.message}) — using dev stub.`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

// Domen Resend'da tasdiqlangach noreply@cineplex.uz dan yuboriladi.
// MAIL_FROM env bilan ham override qilish mumkin.
const RESEND_FROM = process.env.MAIL_FROM || 'CINEPLEX <noreply@cineplex.uz>';
const SMTP_FROM   = smtp.from || 'CINEPLEX <no-reply@cineplex.app>';
const SUBJECT     = 'Email tasdiqlash kodi — CINEPLEX';

const otpEmailHtml = (code) => `
  <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;background:#000;border-radius:0">
    <div style="background:#0d0d0d;padding:32px 36px 36px;border-radius:16px;border:1px solid #1a1a1a">
      <div style="margin-bottom:24px">
        <span style="font-size:22px;font-weight:800;color:#e50914;letter-spacing:-0.5px">CINEPLEX</span>
      </div>
      <h1 style="font-size:22px;font-weight:700;margin:0 0 10px;color:#fff">Email tasdiqlash kodi</h1>
      <p style="color:#888;margin:0 0 28px;font-size:14px;line-height:1.6">
        CINEPLEX hisobingizni yaratishni tugatish uchun quyidagi kodni kiriting.<br>
        Kod <strong style="color:#ccc">10 daqiqa</strong> davomida amal qiladi.
      </p>
      <div style="background:#111;border:2px solid #e50914;border-radius:12px;padding:20px 12px;text-align:center;margin-bottom:28px">
        <span style="font-size:42px;font-weight:900;letter-spacing:14px;color:#fff;font-variant-numeric:tabular-nums">${code}</span>
      </div>
      <p style="color:#444;margin:0;font-size:12px;line-height:1.5">
        Agar siz bu kodni so'ramagan bo'lsangiz, ushbu xatni e'tiborsiz qoldiring.<br>
        Hech qachon kodingizni hech kimga bermang.
      </p>
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #1a1a1a">
        <p style="color:#333;font-size:11px;margin:0">© 2025 CINEPLEX. Barcha huquqlar himoyalangan.</p>
      </div>
    </div>
  </div>`;

// ── sendOtpEmail ──────────────────────────────────────────────────────────────
/**
 * Sends an OTP to `email`. Returns { delivered, devCode }.
 * Priority: Resend → SMTP → dev stub.
 * `devCode` is only populated outside production so the client can auto-fill.
 */
async function sendOtpEmail(email, code) {
  // 1. Try Resend
  if (resendClient) {
    try {
      const { data, error } = await resendClient.emails.send({
        from: RESEND_FROM,
        to: [email],
        subject: SUBJECT,
        html: otpEmailHtml(code),
      });
      if (error) {
        logger.error(`[mailer:resend] API error for ${email}: ${JSON.stringify(error)}`);
        // fall through to SMTP
      } else {
        logger.info(`[mailer:resend] OTP delivered to ${email} (id: ${data?.id})`);
        return { delivered: true, devCode: null };
      }
    } catch (err) {
      logger.error(`[mailer:resend] Failed to send to ${email}: ${err.message}`);
      // fall through to SMTP
    }
  }

  // 2. Try SMTP (nodemailer)
  if (smtpTransporter) {
    try {
      await smtpTransporter.sendMail({
        from: SMTP_FROM,
        to: email,
        subject: SUBJECT,
        html: otpEmailHtml(code),
      });
      logger.info(`[mailer:smtp] OTP delivered to ${email}`);
      return { delivered: true, devCode: null };
    } catch (err) {
      logger.error(`[mailer:smtp] Failed to send to ${email}: ${err.message}`);
      // fall through to dev stub
    }
  }

  // 3. Dev stub — log to console, return code so the UI can auto-fill
  logger.info(`[mailer:DEV] OTP for ${email} → ${code}`);
  return { delivered: false, devCode: nodeEnv === 'production' ? null : code };
}

module.exports = { generateOtp, sendOtpEmail };
