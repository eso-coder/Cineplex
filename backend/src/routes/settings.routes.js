const router = require('express').Router();
const ctrl = require('../controllers/settings.controller');

// Public — bosh sahifa hero konfiguratsiyasi
router.get('/hero', ctrl.getHero);

module.exports = router;
