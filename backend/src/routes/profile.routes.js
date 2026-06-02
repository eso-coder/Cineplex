const router = require('express').Router();
const ctrl = require('../controllers/profile.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Public profile + stats (read-only)
router.get('/:userId', ctrl.getProfile);
router.get('/:userId/stats', ctrl.getStats);

module.exports = router;

// Separately exported sub-routers mounted in app.js:
module.exports.activityRouter = require('express').Router().get('/:userId', ctrl.getActivity);

const favRouter = require('express').Router();
favRouter.get('/:userId', ctrl.getFavourites);
favRouter.post('/', authMiddleware, ctrl.addFavourite);
favRouter.delete('/:filmId', authMiddleware, ctrl.removeFavourite);
module.exports.favouritesRouter = favRouter;
