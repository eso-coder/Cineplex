const Movie = require('../models/Movie');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/response');
const { issueVideoCookies, extractMovieFolder, toCloudFrontUrl, isConfigured } = require('../services/videoAccess');

// POST /api/watch/:id/start
// Foydalanuvchi autentifikatsiyasini tekshiradi, so'ralgan video (film yoki
// bitta serial qismi) shu filmga tegishli ekanini tasdiqlaydi, so'ng shu
// video joylashgan S3 papka uchun 6 soatlik CloudFront signed cookie beradi.
// CloudFront sozlanmagan bo'lsa — video S3 manzili o'zgarishsiz qaytariladi
// (frontend to'g'ridan-to'g'ri S3'dan o'qishda davom etadi).
const startWatch = asyncHandler(async (req, res) => {
  const movie = await Movie.findById(req.params.id).select('videoUrl episodeList title type').lean();
  if (!movie) throw ApiError.notFound('Movie');

  const { videoUrl: requestedUrl } = req.body || {};

  // So'ralgan URL shu filmning o'ziga yoki uning bitta qismiga tegishli
  // ekanini tekshiramiz — aks holda ixtiyoriy S3 yo'liga cookie berilishi
  // mumkin bo'lardi.
  const validUrls = [movie.videoUrl, ...(movie.episodeList || []).map((e) => e.videoUrl)].filter(Boolean);
  const targetUrl = requestedUrl && validUrls.includes(requestedUrl) ? requestedUrl : movie.videoUrl;

  if (!targetUrl) throw ApiError.badRequest('Bu film uchun video manzili topilmadi');

  if (!isConfigured()) {
    // CloudFront sozlanmagan (dev muhit yoki hali AWS Console qadamlari
    // bajarilmagan) — S3'ga to'g'ridan-to'g'ri kirishda davom etamiz.
    return sendSuccess(res, { videoUrl: targetUrl, protected: false });
  }

  const movieFolder = extractMovieFolder(targetUrl);
  if (!movieFolder) throw ApiError.badRequest('Video manzilidan papka nomini aniqlab bo\'lmadi');

  const { expiresAt } = issueVideoCookies(res, movieFolder);

  sendSuccess(res, {
    videoUrl: toCloudFrontUrl(targetUrl),
    protected: true,
    expiresAt,
  });
});

module.exports = { startWatch };
