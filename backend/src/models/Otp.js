const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    code: { type: String, required: true }, // 6-digit code (stored as string)
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false },
    // Snapshot of signup data so we only create the User after verification.
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

// TTL index — Mongo auto-removes documents once expiresAt passes.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);
