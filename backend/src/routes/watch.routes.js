const router = require('express').Router();
const ctrl = require('../controllers/watch.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Auth required — video segmentlariga CloudFront signed cookie shu yerda beriladi
router.post('/:id/start', authMiddleware, ctrl.startWatch);

module.exports = router;
