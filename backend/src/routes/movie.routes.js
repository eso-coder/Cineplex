const router = require('express').Router();
const ctrl = require('../controllers/movie.controller');
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { movieQuery } = require('../validators/movie.validator');

// Public
router.get('/', validate(movieQuery, 'query'), ctrl.getMovies);
router.get('/featured', ctrl.getFeatured);
router.get('/trending', ctrl.getTrending);
router.get('/search', ctrl.searchMovies);

// Auth required (must be before /:id to avoid route conflict)
router.get('/user/favorites', authMiddleware, ctrl.getFavorites);
router.get('/user/watchlist', authMiddleware, ctrl.getWatchlist);

// Public by ID
router.get('/:id', ctrl.getMovie);
router.post('/:id/view', ctrl.incrementView);

// Auth required
router.post('/:id/favorite', authMiddleware, ctrl.toggleFavorite);
router.post('/:id/watchlist', authMiddleware, ctrl.toggleWatchlist);

module.exports = router;
