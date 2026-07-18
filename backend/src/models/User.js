const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    // ── Identity ──
    firstName: {
      type: String,
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
      default: '',
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
      default: '',
    },
    // Legacy/display name. Kept so the rest of the app (navbar, comments) keeps working.
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    password: {
      // Not required: OAuth (Google/Apple) accounts have no local password.
      type: String,
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    phone: { type: String, trim: true, default: '' }, // informational only — never verified

    // ── Profile media ──
    avatar: {
      url: { type: String, default: '' },
      public_id: { type: String, default: '' },
    },
    coverImage: {
      url: { type: String, default: '' },
      public_id: { type: String, default: '' },
    },

    // ── Profile meta ──
    location: { type: String, trim: true, default: '', maxlength: 80 },
    website: { type: String, trim: true, default: '', maxlength: 200 },
    socialHandle: { type: String, trim: true, default: '', maxlength: 80 },
    isPatron: { type: Boolean, default: false },

    // ── Auth ──
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    provider: { type: String, enum: ['local', 'google', 'apple'], default: 'local' },
    isVerified: { type: Boolean, default: false }, // email confirmed via OTP / OAuth

    // ── Relations (legacy arrays kept for compatibility) ──
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Movie' }],
    watchlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Movie' }],

    // ── Ko'rish tarixi — "davom ettirish" va profil statistikasi uchun ──
    watchHistory: [{
      movie: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie' },
      progress: { type: Number, default: 0 },  // soniyalarda, qayerda to'xtagan
      duration: { type: Number, default: 0 },  // videoning umumiy davomiyligi (soniya)
      updatedAt: { type: Date, default: Date.now },
    }],

    refreshToken: { type: String, select: false },
    // Ko'p qurilmali sessiyalar: har bir qurilma/brauzer o'z refresh
    // tokeniga ega — birida kirish boshqasidagi sessiyani bekor qilmaydi.
    refreshTokens: { type: [String], select: false, default: [] },
    isActive: { type: Boolean, default: true },

    // ── Activity tracking (admin panel uchun) ──
    lastLogin:  { type: Date, default: null },  // oxirgi marta qachon kirgan
    loginCount: { type: Number, default: 0 },   // necha marta kirgan
  },
  { timestamps: true }  // createdAt = ro'yxatdan o'tgan sana, updatedAt
);

// Keep `name` in sync when first/last are provided.
userSchema.pre('save', function (next) {
  if ((this.isModified('firstName') || this.isModified('lastName')) && (this.firstName || this.lastName)) {
    const composed = `${this.firstName || ''} ${this.lastName || ''}`.trim();
    if (composed) this.name = composed;
  }
  next();
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toPublic = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshToken;
  delete obj.refreshTokens;
  // Flatten media objects to plain URLs for the frontend, but keep nested too.
  obj.avatarUrl = obj.avatar?.url || '';
  obj.coverImageUrl = obj.coverImage?.url || '';
  return obj;
};

module.exports = mongoose.model('User', userSchema);
