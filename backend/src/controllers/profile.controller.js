const mongoose = require('mongoose');
const User = require('../models/User');
const Movie = require('../models/Movie');
const UserFilm = require('../models/UserFilm');
const Follow = require('../models/Follow');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/response');

const toObjectId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw ApiError.badRequest('Invalid id');
  return new mongoose.Types.ObjectId(id);
};

// Map a populated UserFilm → flat film card shape the frontend expects.
const toFilmCard = (uf) => {
  const f = uf.film || {};
  return {
    id: (f._id || '').toString(),
    userFilmId: (uf._id || '').toString(),
    title: f.title || '',
    year: f.releaseYear || '',
    posterUrl: f.poster?.url || f.bannerUrl || '',
    backdropUrl: f.bannerUrl || '',
    rating: uf.rating || 0,
    liked: !!uf.liked,
    watched: !!uf.watched,
    isFavourite: !!uf.isFavourite,
    watchedAt: uf.watchedAt,
  };
};

// ── Stats for a user (Films / This Year / Lists / Following / Followers) ──
const computeStats = async (userId) => {
  const startOfYear = new Date(new Date().getFullYear(), 0, 1);
  const [films, thisYear, following, followers] = await Promise.all([
    UserFilm.countDocuments({ user: userId, watched: true }),
    UserFilm.countDocuments({ user: userId, watched: true, watchedAt: { $gte: startOfYear } }),
    Follow.countDocuments({ follower: userId }),
    Follow.countDocuments({ following: userId }),
  ]);
  return { films, thisYear, lists: 0, following, followers };
};

// GET /api/profile/:userId  → public profile + stats
const getProfile = asyncHandler(async (req, res) => {
  const id = toObjectId(req.params.userId);
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User');
  const stats = await computeStats(id);
  sendSuccess(res, { user: user.toPublic(), stats }, 'Profile loaded');
});

// GET /api/profile/:userId/stats
const getStats = asyncHandler(async (req, res) => {
  const id = toObjectId(req.params.userId);
  sendSuccess(res, await computeStats(id), 'Stats loaded');
});

// GET /api/activity/:userId  → last 5 logged films (poster, rating, title)
const getActivity = asyncHandler(async (req, res) => {
  const id = toObjectId(req.params.userId);
  const limit = Math.min(parseInt(req.query.limit, 10) || 5, 50);
  const rows = await UserFilm.find({ user: id, watched: true })
    .sort({ watchedAt: -1 })
    .limit(limit)
    .populate('film');
  sendSuccess(res, rows.filter((r) => r.film).map(toFilmCard), 'Activity loaded');
});

// GET /api/favourites/:userId  → all favourite-marked films
const getFavourites = asyncHandler(async (req, res) => {
  const id = toObjectId(req.params.userId);
  const rows = await UserFilm.find({ user: id, isFavourite: true })
    .sort({ updatedAt: -1 })
    .populate('film');
  sendSuccess(res, rows.filter((r) => r.film).map(toFilmCard), 'Favourites loaded');
});

// POST /api/favourites  { filmId }  → mark current user's film as favourite
const addFavourite = asyncHandler(async (req, res) => {
  const { filmId } = req.body;
  if (!filmId) throw ApiError.badRequest('filmId is required');
  const film = await Movie.findById(filmId);
  if (!film) throw ApiError.notFound('Film');

  const uf = await UserFilm.findOneAndUpdate(
    { user: req.user._id, film: film._id },
    { $set: { isFavourite: true } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).populate('film');

  sendSuccess(res, toFilmCard(uf), 'Added to favourites', 201);
});

// DELETE /api/favourites/:filmId  → unmark favourite for current user
const removeFavourite = asyncHandler(async (req, res) => {
  const filmId = toObjectId(req.params.filmId);
  const uf = await UserFilm.findOneAndUpdate(
    { user: req.user._id, film: filmId },
    { $set: { isFavourite: false } },
    { new: true }
  );
  if (!uf) throw ApiError.notFound('Favourite');
  sendSuccess(res, { id: filmId.toString(), isFavourite: false }, 'Removed from favourites');
});

module.exports = {
  getProfile,
  getStats,
  getActivity,
  getFavourites,
  addFavourite,
  removeFavourite,
};
