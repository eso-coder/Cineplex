const router = require('express').Router();
const ctrl = require('../controllers/rating.controller');
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const { rateMovie } = require('../validators/rating.validator');

router.post('/movie/:movieId', authMiddleware, validate(rateMovie), ctrl.rateMovie);
router.get('/movie/:movieId/my-rating', authMiddleware, ctrl.getMyRating);
router.delete('/movie/:movieId', authMiddleware, ctrl.deleteRating);

module.exports = router;
