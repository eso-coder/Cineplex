const router = require('express').Router();
const ctrl = require('../controllers/settings.controller');

// Public — bosh sahifa hero konfiguratsiyasi
router.get('/hero', ctrl.getHero);

// Public — filmlar/seriallar sahifasidagi janr kartalari konfiguratsiyasi
router.get('/genre-cards', ctrl.getGenreCards);

module.exports = router;
