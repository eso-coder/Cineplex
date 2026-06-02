const mongoose = require('mongoose');

// A single user's relationship to a film: watched / rated / liked / favourited.
// Backs Recent Activity and Favourite Films.
const userFilmSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    film: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true },
    watched: { type: Boolean, default: false },
    rating: { type: Number, min: 0, max: 5, default: 0 }, // 0–5 stars (half-star allowed)
    liked: { type: Boolean, default: false },
    isFavourite: { type: Boolean, default: false },
    watchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One row per (user, film).
userFilmSchema.index({ user: 1, film: 1 }, { unique: true });
userFilmSchema.index({ user: 1, watchedAt: -1 });
userFilmSchema.index({ user: 1, isFavourite: 1 });

module.exports = mongoose.model('UserFilm', userFilmSchema);
