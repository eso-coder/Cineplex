const Movie = require('../models/Movie');
const Genre = require('../models/Genre');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess, sendPaginated } = require('../utils/response');

const SORT_MAP = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  rating: { averageRating: -1 },
  views: { views: -1 },
};

// GET /api/movies
const getMovies = asyncHandler(async (req, res) => {
  const { page, limit, genre, year, sort, search } = req.query;

  const filter = {};

  if (search) {
    filter.$text = { $search: search };
  }

  if (genre) {
    const genreDoc = await Genre.findOne({ slug: genre });
    if (genreDoc) filter.genres = genreDoc._id;
  }

  if (year) {
    filter.releaseYear = Number(year);
  }

  const sortObj = SORT_MAP[sort] || SORT_MAP.newest;
  const skip = (page - 1) * limit;

  const [movies, total] = await Promise.all([
    Movie.find(filter)
      .populate('genres', 'name slug')
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean(),
    Movie.countDocuments(filter),
  ]);

  sendPaginated(res, movies, {
    page: Number(page),
    limit: Number(limit),
    total,
    totalPages: Math.ceil(total / limit),
  });
});

// GET /api/movies/featured
const getFeatured = asyncHandler(async (req, res) => {
  const movies = await Movie.find({ isFeatured: true })
    .populate('genres', 'name slug')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  sendSuccess(res, movies);
});

// GET /api/movies/trending
const getTrending = asyncHandler(async (req, res) => {
  const movies = await Movie.find()
    .populate('genres', 'name slug')
    .sort({ views: -1 })
    .limit(10)
    .lean();
  sendSuccess(res, movies);
});

// GET /api/movies/search
const searchMovies = asyncHandler(async (req, res) => {
  const q = req.query.q?.trim();
  if (!q) throw ApiError.badRequest('Search query required');

  const movies = await Movie.find({ $text: { $search: q } })
    .populate('genres', 'name slug')
    .sort({ score: { $meta: 'textScore' } })
    .limit(20)
    .lean();

  sendSuccess(res, movies);
});

// GET /api/movies/:id
const getMovie = asyncHandler(async (req, res) => {
  const movie = await Movie.findById(req.params.id)
    .populate('genres', 'name slug')
    .populate('createdBy', 'name');
  if (!movie) throw ApiError.notFound('Movie');
  sendSuccess(res, movie);
});

// POST /api/movies/:id/view
const incrementView = asyncHandler(async (req, res) => {
  await Movie.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
  sendSuccess(res, null, 'View counted');
});

// POST /api/movies/:id/favorite
const toggleFavorite = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const movieId = req.params.id;

  const movie = await Movie.findById(movieId);
  if (!movie) throw ApiError.notFound('Movie');

  const idx = user.favorites.findIndex((id) => id.toString() === movieId);
  let action;

  if (idx === -1) {
    user.favorites.push(movieId);
    action = 'added';
  } else {
    user.favorites.splice(idx, 1);
    action = 'removed';
  }

  await user.save({ validateBeforeSave: false });
  sendSuccess(res, { favorites: user.favorites }, `${action === 'added' ? 'Added to' : 'Removed from'} favorites`);
});

// POST /api/movies/:id/watchlist
const toggleWatchlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const movieId = req.params.id;

  const movie = await Movie.findById(movieId);
  if (!movie) throw ApiError.notFound('Movie');

  const idx = user.watchlist.findIndex((id) => id.toString() === movieId);
  let action;

  if (idx === -1) {
    user.watchlist.push(movieId);
    action = 'added';
  } else {
    user.watchlist.splice(idx, 1);
    action = 'removed';
  }

  await user.save({ validateBeforeSave: false });
  sendSuccess(res, { watchlist: user.watchlist }, `${action === 'added' ? 'Added to' : 'Removed from'} watchlist`);
});

// GET /api/movies/user/favorites
const getFavorites = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate({
    path: 'favorites',
    populate: { path: 'genres', select: 'name slug' },
  });
  sendSuccess(res, user.favorites);
});

// GET /api/movies/user/watchlist
const getWatchlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate({
    path: 'watchlist',
    populate: { path: 'genres', select: 'name slug' },
  });
  sendSuccess(res, user.watchlist);
});

module.exports = {
  getMovies,
  getFeatured,
  getTrending,
  searchMovies,
  getMovie,
  incrementView,
  toggleFavorite,
  toggleWatchlist,
  getFavorites,
  getWatchlist,
};
