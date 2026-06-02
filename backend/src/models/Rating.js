const mongoose = require('mongoose');
const Movie = require('./Movie');

const ratingSchema = new mongoose.Schema(
  {
    movie: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Movie',
      required: [true, 'Movie reference is required'],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
    },
    score: {
      type: Number,
      required: [true, 'Score is required'],
      min: [1, 'Score must be at least 1'],
      max: [10, 'Score cannot exceed 10'],
    },
  },
  { timestamps: true }
);

// One rating per user per movie
ratingSchema.index({ movie: 1, user: 1 }, { unique: true });

// Recalculate movie average rating after save/delete
const recalcAverage = async (movieId) => {
  const result = await mongoose.model('Rating').aggregate([
    { $match: { movie: movieId } },
    {
      $group: {
        _id: '$movie',
        averageRating: { $avg: '$score' },
        ratingsCount: { $sum: 1 },
      },
    },
  ]);

  if (result.length > 0) {
    await Movie.findByIdAndUpdate(movieId, {
      averageRating: Math.round(result[0].averageRating * 10) / 10,
      ratingsCount: result[0].ratingsCount,
    });
  } else {
    await Movie.findByIdAndUpdate(movieId, { averageRating: 0, ratingsCount: 0 });
  }
};

ratingSchema.post('save', function () {
  recalcAverage(this.movie);
});

ratingSchema.post('findOneAndDelete', function (doc) {
  if (doc) recalcAverage(doc.movie);
});

module.exports = mongoose.model('Rating', ratingSchema);
