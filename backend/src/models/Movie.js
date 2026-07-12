const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    // Multilingual content (uz is the base title/description above)
    title_ru:       { type: String, trim: true, default: '', maxlength: 200 },
    title_en:       { type: String, trim: true, default: '', maxlength: 200 },
    description_ru: { type: String, default: '', maxlength: 2000 },
    description_en: { type: String, default: '', maxlength: 2000 },
    poster: {
      url: { type: String, required: [true, 'Poster is required'] },
      public_id: { type: String, default: '' },
    },
    trailerUrl: { type: String, default: '' },
    videoUrl: { type: String, default: '' },
    genres: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Genre' }],
    director: { type: String, trim: true, default: '' },
    cast: [{ type: String, trim: true }],
    releaseYear: {
      type: Number,
      required: [true, 'Release year is required'],
      min: [1888, 'Invalid release year'],
      max: [new Date().getFullYear() + 5, 'Release year too far in the future'],
    },
    duration: { type: Number, min: 0, default: 0 }, // minutes
    country: { type: String, trim: true, default: '' },
    language: { type: String, trim: true, default: '' },
    averageRating: { type: Number, default: 0, min: 0, max: 10 },
    ratingsCount: { type: Number, default: 0, min: 0 },
    views: { type: Number, default: 0, min: 0 },
    isFeatured: { type: Boolean, default: false },
    type:       { type: String, enum: ['movie', 'series'], default: 'movie' },
    seasons:    { type: Number, default: 0 },
    episodes:   { type: Number, default: 0 },
    ageRating:  { type: Number, default: 0 },
    imdbRating: { type: Number, default: 0, min: 0, max: 10 },
    bannerUrl:  { type: String, default: '' },
    logoUrl:    { type: String, default: '' },
    gallery:    [{ type: String }],
    subtitles:  [{
      lang:  { type: String, trim: true, default: '' },  // 'uz', 'ru', 'en'
      label: { type: String, trim: true, default: '' },  // 'O\'zbek', 'Rus', 'Ingliz'
      url:   { type: String, trim: true, default: '' },  // VTT fayl URL
    }],
    // Seriallar uchun qismlar ro'yxati (mavsumlarga bo'lingan)
    episodeList: [{
      season:   { type: Number, default: 1 },            // mavsum raqami
      number:   { type: Number, default: 1 },            // qism raqami (mavsum ichida)
      title:    { type: String, trim: true, default: '' },
      videoUrl: { type: String, trim: true, default: '' },
      duration: { type: String, trim: true, default: '' },
      thumb:    { type: String, trim: true, default: '' },
    }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

movieSchema.index({ genres: 1 });
movieSchema.index({ releaseYear: -1 });
movieSchema.index({ averageRating: -1 });
movieSchema.index({ views: -1 });

module.exports = mongoose.model('Movie', movieSchema);
