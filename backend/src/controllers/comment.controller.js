const Comment = require('../models/Comment');
const Movie = require('../models/Movie');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess, sendCreated, sendPaginated } = require('../utils/response');

// GET /api/comments/movie/:movieId
const getMovieComments = asyncHandler(async (req, res) => {
  const { movieId } = req.params;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const [comments, total] = await Promise.all([
    Comment.find({ movie: movieId, parentComment: null })
      .populate('user', 'name avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Comment.countDocuments({ movie: movieId, parentComment: null }),
  ]);

  sendPaginated(res, comments, {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

// GET /api/comments/user/mine — joriy foydalanuvchining barcha sharhlari (profil "Reviews" tabi uchun)
const getMyComments = asyncHandler(async (req, res) => {
  const comments = await Comment.find({ user: req.user._id, parentComment: null })
    .populate('movie', 'title poster bannerUrl releaseYear')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  sendSuccess(res, comments.filter((c) => c.movie));
});

// POST /api/comments/movie/:movieId
const addComment = asyncHandler(async (req, res) => {
  const { movieId } = req.params;

  const movie = await Movie.findById(movieId);
  if (!movie) throw ApiError.notFound('Movie');

  const comment = await Comment.create({
    movie: movieId,
    user: req.user._id,
    text: req.body.text,
  });

  await comment.populate('user', 'name avatar');
  sendCreated(res, comment, 'Comment added');
});

// PATCH /api/comments/:id
const updateComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) throw ApiError.notFound('Comment');
  if (comment.user.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('You can only edit your own comments');
  }

  comment.text = req.body.text;
  await comment.save();
  await comment.populate('user', 'name avatar');

  sendSuccess(res, comment, 'Comment updated');
});

// DELETE /api/comments/:id
const deleteComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) throw ApiError.notFound('Comment');

  const isOwner = comment.user.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';

  if (!isOwner && !isAdmin) throw ApiError.forbidden('Not authorized to delete this comment');

  // Delete replies as well
  await Comment.deleteMany({ parentComment: comment._id });
  await comment.deleteOne();

  sendSuccess(res, null, 'Comment deleted');
});

// POST /api/comments/:id/like
const toggleLike = asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) throw ApiError.notFound('Comment');

  const userId = req.user._id;
  const idx = comment.likes.findIndex((id) => id.toString() === userId.toString());

  if (idx === -1) {
    comment.likes.push(userId);
  } else {
    comment.likes.splice(idx, 1);
  }

  await comment.save();
  sendSuccess(res, { likesCount: comment.likes.length }, 'Like toggled');
});

module.exports = { getMovieComments, getMyComments, addComment, updateComment, deleteComment, toggleLike };
