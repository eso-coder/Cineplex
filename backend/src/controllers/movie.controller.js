const Movie = require('../models/Movie');
const Genre = require('../models/Genre');
const User = require('../models/User');
const UserFilm = require('../models/UserFilm');
const { fuzzySearch } = require('../utils/fuzzySearch');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess, sendPaginated } = require('../utils/response');

const SORT_MAP = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  rating: { averageRating: -1 },
  views: { views: -1 },
};

// Vercel edge / CDN cache — ommaviy GET javoblari 2 daqiqa cache'da turadi,
// 10 daqiqagacha eski javob beriladi va fonda yangilanadi. Bu serverless
// cold start'ni ko'pchilik so'rovlar uchun butunlay yo'q qiladi.
const PUBLIC_CACHE = 'public, max-age=0, s-maxage=120, stale-while-revalidate=600';

// GET /api/movies
const getMovies = asyncHandler(async (req, res) => {
  const { page, limit, genre, year, sort, search, type } = req.query;

  const filter = {};

  if (type && ['movie', 'series'].includes(type)) {
    filter.type = type;
  }

  if (genre) {
    const genreDoc = await Genre.findOne({ slug: genre });
    if (genreDoc) filter.genres = genreDoc._id;
  }

  if (year) {
    filter.releaseYear = Number(year);
  }

  const sortObj = SORT_MAP[sort] || SORT_MAP.newest;
  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;

  // Qidiruv (search) bo'lsa — 3 tilda (uz/ru/en) nom/tavsif/aktyor bo'yicha
  // fuzzy (taxminiy, to'liq yozilmagan so'z bo'yicha ham) qidiruv qilamiz.
  // Katalog kichik bo'lgani uchun barcha nomzodlarni xotirada tekshirish tez ishlaydi.
  if (search && search.trim()) {
    const candidates = await Movie.find(filter).populate('genres', 'name slug').lean();
    const matched = fuzzySearch(candidates, search, [
      { name: 'title', weight: 2 },
      { name: 'title_ru', weight: 2 },
      { name: 'title_en', weight: 2 },
      { name: 'description', weight: 0.5 },
      { name: 'description_ru', weight: 0.5 },
      { name: 'description_en', weight: 0.5 },
      { name: 'cast', weight: 1 },
      { name: 'genres.name', weight: 1 },
    ]);
    const total = matched.length;
    const skip = (pageNum - 1) * limitNum;
    const movies = matched.slice(skip, skip + limitNum);

    res.set('Cache-Control', PUBLIC_CACHE);
    return sendPaginated(res, movies, {
      page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum),
    });
  }

  const skip = (pageNum - 1) * limitNum;
  const [movies, total] = await Promise.all([
    Movie.find(filter)
      .populate('genres', 'name slug')
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Movie.countDocuments(filter),
  ]);

  res.set('Cache-Control', PUBLIC_CACHE);
  sendPaginated(res, movies, {
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum),
  });
});

// GET /api/movies/featured
const getFeatured = asyncHandler(async (req, res) => {
  const movies = await Movie.find({ isFeatured: true })
    .populate('genres', 'name slug')
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  res.set('Cache-Control', PUBLIC_CACHE);
  sendSuccess(res, movies);
});

// GET /api/movies/trending
const getTrending = asyncHandler(async (req, res) => {
  const movies = await Movie.find()
    .populate('genres', 'name slug')
    .sort({ views: -1 })
    .limit(10)
    .lean();
  res.set('Cache-Control', PUBLIC_CACHE);
  sendSuccess(res, movies);
});

// GET /api/movies/search
const searchMovies = asyncHandler(async (req, res) => {
  const q = req.query.q?.trim();
  if (!q) throw ApiError.badRequest('Search query required');

  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const movies = await Movie.find({ $or: [{ title: re }, { description: re }] })
    .populate('genres', 'name slug')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  sendSuccess(res, movies);
});

// GET /api/movies/:id
const getMovie = asyncHandler(async (req, res) => {
  const movie = await Movie.findById(req.params.id)
    .populate('genres', 'name slug')
    .populate('createdBy', 'name')
    .lean();
  if (!movie) throw ApiError.notFound('Movie');

  // Janrga mos tavsiya qilingan filmlar — o'zidan tashqari, kamida bitta
  // umumiy janr bo'yicha, reyting/ko'rishlar soni bo'yicha saralangan.
  if (movie.genres && movie.genres.length) {
    movie.related = await Movie.find({
      _id: { $ne: movie._id },
      genres: { $in: movie.genres.map((g) => g._id) },
    })
      .populate('genres', 'name slug')
      .sort({ averageRating: -1, views: -1 })
      .limit(12)
      .lean();
  } else {
    movie.related = [];
  }

  res.set('Cache-Control', PUBLIC_CACHE);
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

// POST /api/movies/:id/progress — "davom ettirish" uchun ko'rish holatini saqlash
const saveProgress = asyncHandler(async (req, res) => {
  const movieId = req.params.id;
  const progress = Math.max(0, Number(req.body.progress) || 0);
  const duration = Math.max(0, Number(req.body.duration) || 0);

  const movie = await Movie.findById(movieId).select('_id');
  if (!movie) throw ApiError.notFound('Movie');

  const user = await User.findById(req.user._id);
  const entry = user.watchHistory.find((h) => h.movie.toString() === movieId);
  if (entry) {
    entry.progress = progress;
    entry.duration = duration || entry.duration;
    entry.updatedAt = new Date();
  } else {
    user.watchHistory.unshift({ movie: movieId, progress, duration, updatedAt: new Date() });
  }
  // Ko'rish tarixini oxirgi 50 ta bilan cheklaymiz (hujjat shishib ketmasligi uchun)
  if (user.watchHistory.length > 50) user.watchHistory = user.watchHistory.slice(0, 50);

  await user.save({ validateBeforeSave: false });

  // Video 85%+ ko'rilgan bo'lsa — "Films"/"Activity"/statistika (profil sahifasi)
  // uchun ishlatiladigan UserFilm yozuvini ham watched=true qilib belgilaymiz.
  if (duration > 0 && progress >= duration * 0.85) {
    await UserFilm.findOneAndUpdate(
      { user: req.user._id, film: movieId },
      { $set: { watched: true, watchedAt: new Date() } },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  sendSuccess(res, null, 'Progress saved');
});

// GET /api/movies/:id/progress — bitta film uchun saqlangan ko'rish holati
const getProgress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('watchHistory');
  const entry = user.watchHistory.find((h) => h.movie.toString() === req.params.id);
  sendSuccess(res, entry ? { progress: entry.progress, duration: entry.duration } : { progress: 0, duration: 0 });
});

// GET /api/movies/user/history — "Ko'rilganlar tarixi" ro'yxati (oxirgi ko'rilganlar birinchi)
const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate({
    path: 'watchHistory.movie',
    populate: { path: 'genres', select: 'name slug' },
  });
  const history = user.watchHistory
    .filter((h) => h.movie) // o'chirilgan filmlarni chetlab o'tish
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map((h) => ({
      ...h.movie.toObject(),
      watchProgress: h.progress,
      watchDuration: h.duration,
      watchedAt: h.updatedAt,
    }));
  sendSuccess(res, history);
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
  saveProgress,
  getProgress,
  getWatchHistory,
};
