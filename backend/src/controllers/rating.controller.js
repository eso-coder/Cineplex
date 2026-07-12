const Rating = require('../models/Rating');
const Movie = require('../models/Movie');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/response');

// POST /api/ratings/movie/:movieId
const rateMovie = asyncHandler(async (req, res) => {
  const { movieId } = req.params;
  const { score } = req.body;

  const movie = await Movie.findById(movieId);
  if (!movie) throw ApiError.notFound('Movie');

  const existing = await Rating.findOne({ movie: movieId, user: req.user._id });

  let rating;
  if (existing) {
    existing.score = score;
    rating = await existing.save();
  } else {
    rating = await Rating.create({ movie: movieId, user: req.user._id, score });
  }

  // averageRating is recalculated by Rating post-save hook
  const updatedMovie = await Movie.findById(movieId).select('averageRating ratingsCount');

  sendSuccess(res, { rating, movie: updatedMovie }, existing ? 'Rating updated' : 'Rating added');
});

module.exports = { rateMovie };
