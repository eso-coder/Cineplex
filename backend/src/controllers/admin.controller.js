const User = require('../models/User');
const Movie = require('../models/Movie');
const Comment = require('../models/Comment');
const Genre = require('../models/Genre');
const Rating = require('../models/Rating');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess, sendCreated, sendPaginated } = require('../utils/response');
const { imageUpload, uploadToS3, deleteFromS3 } = require('../config/s3');
const { handleUpload } = require('../middleware/upload.middleware');
const { autoTranslateMovieFields } = require('../utils/translate');

// GET /api/admin/dashboard
const getDashboard = asyncHandler(async (req, res) => {
  const [users, movies, comments, ratings] = await Promise.all([
    User.countDocuments(),
    Movie.countDocuments(),
    Comment.countDocuments(),
    Rating.countDocuments(),
  ]);
  const recentMovies = await Movie.find().sort({ createdAt: -1 }).limit(5).select('title poster views averageRating');
  const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5).select('name email role createdAt');
  sendSuccess(res, { stats: { users, movies, comments, ratings }, recentMovies, recentUsers });
});

// ─── USERS ───────────────────────────────────────────────────────────────────

const getUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Filtrlar: rol + qidiruv (ism / email / telefon)
  const filter = {};
  if (req.query.role && ['user', 'admin'].includes(req.query.role)) {
    filter.role = req.query.role;
  }
  if (req.query.search && req.query.search.trim()) {
    const safe = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { firstName: rx }, { lastName: rx }];
  }

  // password & refreshToken schema'da select:false — qaytmaydi (bcrypt hash hech qachon yuborilmaydi)
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  sendPaginated(res, users, { page, limit, total, totalPages: Math.ceil(total / limit) });
});

// GET /api/admin/users/:id — bitta foydalanuvchining TO'LIQ ma'lumoti + statistikasi
const getUserDetail = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .populate('favorites', 'title')
    .populate('watchlist', 'title')
    .lean();
  if (!user) throw ApiError.notFound('User');

  const [comments, ratings] = await Promise.all([
    Comment.countDocuments({ user: user._id }),
    Rating.countDocuments({ user: user._id }),
  ]);

  user.stats = {
    favorites: Array.isArray(user.favorites) ? user.favorites.length : 0,
    watchlist: Array.isArray(user.watchlist) ? user.watchlist.length : 0,
    comments,
    ratings,
  };
  sendSuccess(res, user);
});

const updateUser = asyncHandler(async (req, res) => {
  const { role, isActive } = req.body;
  if (req.params.id === req.user._id.toString()) {
    throw ApiError.badRequest('Cannot modify your own admin account');
  }
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { ...(role && { role }), ...(isActive !== undefined && { isActive }) },
    { new: true, runValidators: true }
  );
  if (!user) throw ApiError.notFound('User');
  sendSuccess(res, user.toPublic(), 'User updated');
});

const deleteUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user._id.toString()) {
    throw ApiError.badRequest('Cannot delete your own account');
  }
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw ApiError.notFound('User');
  if (user.avatar?.public_id) await deleteFromS3(user.avatar.public_id);
  sendSuccess(res, null, 'User deleted');
});

// ─── MOVIES ──────────────────────────────────────────────────────────────────

const createMovie = [
  handleUpload(imageUpload.fields([
    { name: 'poster', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
  ])),
  asyncHandler(async (req, res) => {
    let poster;
    const posterFile = req.files?.poster?.[0];
    const bannerFile = req.files?.banner?.[0];

    if (posterFile) {
      const { url, key } = await uploadToS3(
        posterFile.buffer, 'posters', posterFile.mimetype, posterFile.originalname
      );
      poster = { url, public_id: key };
    } else if (req.body.posterUrl) {
      poster = { url: req.body.posterUrl, public_id: '' };
    } else {
      throw ApiError.badRequest('Poster fayl yoki URL kiritilishi shart');
    }

    const movieData = { ...req.body, poster, createdBy: req.user._id };

    // Banner
    if (bannerFile) {
      const { url } = await uploadToS3(bannerFile.buffer, 'banners', bannerFile.mimetype, bannerFile.originalname);
      movieData.bannerUrl = url;
    }

    // Gallery JSON
    if (movieData.gallery && typeof movieData.gallery === 'string') {
      try { movieData.gallery = JSON.parse(movieData.gallery).filter(Boolean); }
      catch { movieData.gallery = []; }
    }

    // Subtitles JSON: [{lang, label, url}]
    if (movieData.subtitles && typeof movieData.subtitles === 'string') {
      try { movieData.subtitles = JSON.parse(movieData.subtitles).filter(s => s && s.url); }
      catch { movieData.subtitles = []; }
    }

    // Episodes JSON: [{season, number, title, videoUrl, duration, thumb}]
    if (movieData.episodeList && typeof movieData.episodeList === 'string') {
      try { movieData.episodeList = JSON.parse(movieData.episodeList).filter(e => e && e.videoUrl); }
      catch { movieData.episodeList = []; }
      // seasons/episodes hisoblarini qismlardan avtomatik chiqaramiz
      if (Array.isArray(movieData.episodeList) && movieData.episodeList.length) {
        movieData.seasons  = new Set(movieData.episodeList.map(e => e.season || 1)).size;
        movieData.episodes = movieData.episodeList.length;
      }
    }

    if (typeof movieData.genres === 'string')
      movieData.genres = movieData.genres.split(',').map((g) => g.trim()).filter(Boolean);
    if (typeof movieData.cast === 'string')
      movieData.cast = movieData.cast.split(',').map((c) => c.trim()).filter(Boolean);

    // Numeric coercion
    if (movieData.imdbRating) movieData.imdbRating = parseFloat(movieData.imdbRating) || 0;
    if (movieData.ageRating)  movieData.ageRating  = parseInt(movieData.ageRating,  10) || 0;
    if (movieData.seasons)    movieData.seasons    = parseInt(movieData.seasons,    10) || 0;
    if (movieData.episodes)   movieData.episodes   = parseInt(movieData.episodes,   10) || 0;

    // Admin ru/en tarjimasini qo'lda kiritmagan bo'lsa — asl (uz) matndan
    // avtomatik tarjima qilib to'ldiramiz (qo'lda kiritilgan bo'lsa unga tegmaymiz).
    Object.assign(movieData, await autoTranslateMovieFields(movieData));

    const movie = await Movie.create(movieData);
    await movie.populate('genres', 'name slug');
    sendCreated(res, movie, 'Movie created');
  }),
];

const updateMovie = [
  handleUpload(imageUpload.fields([
    { name: 'poster', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
  ])),
  asyncHandler(async (req, res) => {
    const movie = await Movie.findById(req.params.id);
    if (!movie) throw ApiError.notFound('Movie');

    const updates = { ...req.body };
    const posterFile = req.files?.poster?.[0];
    const bannerFile = req.files?.banner?.[0];

    if (posterFile) {
      if (movie.poster?.public_id) await deleteFromS3(movie.poster.public_id);
      const { url, key } = await uploadToS3(posterFile.buffer, 'posters', posterFile.mimetype, posterFile.originalname);
      updates.poster = { url, public_id: key };
    } else if (updates.posterUrl) {
      updates.poster = { url: updates.posterUrl, public_id: '' };
      delete updates.posterUrl;
    }

    if (bannerFile) {
      const { url } = await uploadToS3(bannerFile.buffer, 'banners', bannerFile.mimetype, bannerFile.originalname);
      updates.bannerUrl = url;
    }

    if (updates.gallery && typeof updates.gallery === 'string') {
      try { updates.gallery = JSON.parse(updates.gallery).filter(Boolean); }
      catch { updates.gallery = []; }
    }

    if (updates.subtitles && typeof updates.subtitles === 'string') {
      try { updates.subtitles = JSON.parse(updates.subtitles).filter(s => s && s.url); }
      catch { updates.subtitles = []; }
    }

    // Episodes JSON: [{season, number, title, videoUrl, duration, thumb}]
    if (updates.episodeList && typeof updates.episodeList === 'string') {
      try { updates.episodeList = JSON.parse(updates.episodeList).filter(e => e && e.videoUrl); }
      catch { updates.episodeList = []; }
      if (Array.isArray(updates.episodeList) && updates.episodeList.length) {
        updates.seasons  = new Set(updates.episodeList.map(e => e.season || 1)).size;
        updates.episodes = updates.episodeList.length;
      }
    }

    if (typeof updates.genres === 'string')
      updates.genres = updates.genres.split(',').map((g) => g.trim()).filter(Boolean);
    if (typeof updates.cast === 'string')
      updates.cast = updates.cast.split(',').map((c) => c.trim()).filter(Boolean);

    if (updates.imdbRating) updates.imdbRating = parseFloat(updates.imdbRating) || 0;
    if (updates.ageRating)  updates.ageRating  = parseInt(updates.ageRating,  10) || 0;
    if (updates.seasons)    updates.seasons    = parseInt(updates.seasons,    10) || 0;
    if (updates.episodes)   updates.episodes   = parseInt(updates.episodes,   10) || 0;

    // Yangi kiritilgan (yoki eski, hali tarjima qilinmagan) title/description
    // uchun yetishmayotgan ru/en tarjimalarini avtomatik to'ldiramiz.
    const merged = {
      title: updates.title || movie.title,
      description: updates.description || movie.description,
      title_ru: updates.title_ru !== undefined ? updates.title_ru : movie.title_ru,
      title_en: updates.title_en !== undefined ? updates.title_en : movie.title_en,
      description_ru: updates.description_ru !== undefined ? updates.description_ru : movie.description_ru,
      description_en: updates.description_en !== undefined ? updates.description_en : movie.description_en,
    };
    Object.assign(updates, await autoTranslateMovieFields(merged));

    const updated = await Movie.findByIdAndUpdate(req.params.id, updates, {
      new: true, runValidators: true,
    }).populate('genres', 'name slug');

    sendSuccess(res, updated, 'Movie updated');
  }),
];

// POST /api/admin/movies/backfill-translations — mavjud (eski) filmlarda
// yetishmayotgan title_ru/title_en/description_ru/description_en'ni
// asl (uz) matndan avtomatik tarjima qilib to'ldiradi. Bir martalik migratsiya
// uchun — allaqachon tarjimasi bor filmlarga tegmaydi.
const backfillTranslations = asyncHandler(async (req, res) => {
  const movies = await Movie.find({
    $or: [
      { title_ru: '' }, { title_en: '' },
      { description_ru: '' }, { description_en: '' },
    ],
  }).select('title description title_ru title_en description_ru description_en');

  let updated = 0;
  const failed = [];
  for (const movie of movies) {
    try {
      const auto = await autoTranslateMovieFields(movie.toObject());
      if (Object.keys(auto).length) {
        Object.assign(movie, auto);
        await movie.save();
        updated += 1;
      }
    } catch (err) {
      failed.push({ id: movie._id, title: movie.title, error: err.message });
    }
  }

  sendSuccess(res, { scanned: movies.length, updated, failed }, 'Backfill complete');
});

const deleteMovie = asyncHandler(async (req, res) => {
  const movie = await Movie.findByIdAndDelete(req.params.id);
  if (!movie) throw ApiError.notFound('Movie');
  if (movie.poster?.public_id) await deleteFromS3(movie.poster.public_id);
  await Promise.all([
    Rating.deleteMany({ movie: movie._id }),
    Comment.deleteMany({ movie: movie._id }),
  ]);
  sendSuccess(res, null, 'Movie deleted');
});

// ─── COMMENTS ────────────────────────────────────────────────────────────────

const getComments = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;
  const [comments, total] = await Promise.all([
    Comment.find()
      .populate('user', 'name email')
      .populate('movie', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Comment.countDocuments(),
  ]);
  sendPaginated(res, comments, { page, limit, total, totalPages: Math.ceil(total / limit) });
});

const deleteComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findByIdAndDelete(req.params.id);
  if (!comment) throw ApiError.notFound('Comment');
  await Comment.deleteMany({ parentComment: comment._id });
  sendSuccess(res, null, 'Comment deleted');
});

// ─── GENRES ──────────────────────────────────────────────────────────────────

const getGenres = asyncHandler(async (req, res) => {
  const genres = await Genre.find().sort({ name: 1 });
  sendSuccess(res, genres);
});

const createGenre = asyncHandler(async (req, res) => {
  const genre = await Genre.create({ name: req.body.name });
  sendCreated(res, genre, 'Genre created');
});

const updateGenre = asyncHandler(async (req, res) => {
  const genre = await Genre.findByIdAndUpdate(
    req.params.id,
    { name: req.body.name },
    { new: true, runValidators: true }
  );
  if (!genre) throw ApiError.notFound('Genre');
  sendSuccess(res, genre, 'Genre updated');
});

const deleteGenre = asyncHandler(async (req, res) => {
  const genre = await Genre.findByIdAndDelete(req.params.id);
  if (!genre) throw ApiError.notFound('Genre');
  await Movie.updateMany({ genres: genre._id }, { $pull: { genres: genre._id } });
  sendSuccess(res, null, 'Genre deleted');
});

module.exports = {
  getDashboard,
  getUsers, getUserDetail, updateUser, deleteUser,
  createMovie, updateMovie, deleteMovie, backfillTranslations,
  getComments, deleteComment,
  getGenres, createGenre, updateGenre, deleteGenre,
};
