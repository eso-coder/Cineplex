const router = require('express').Router();
const ctrl = require('../controllers/comment.controller');
const authMiddleware = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const v = require('../validators/comment.validator');

router.get('/user/mine', authMiddleware, ctrl.getMyComments);
router.get('/movie/:movieId', ctrl.getMovieComments);
router.post('/movie/:movieId', authMiddleware, validate(v.createComment), ctrl.addComment);
router.patch('/:id', authMiddleware, validate(v.updateComment), ctrl.updateComment);
router.delete('/:id', authMiddleware, ctrl.deleteComment);
router.post('/:id/like', authMiddleware, ctrl.toggleLike);
router.post('/:id/reply', authMiddleware, validate(v.replyComment), ctrl.replyComment);

module.exports = router;
