const router = require('express').Router();
const ctrl = require('../controllers/admin.controller');
const settingsCtrl = require('../controllers/settings.controller');
const authMiddleware = require('../middleware/auth.middleware');
const adminMiddleware = require('../middleware/admin.middleware');
const validate = require('../middleware/validate.middleware');
const Joi = require('joi');
const { createGenre, updateGenre } = require('../validators/genre.validator');

// All admin routes require auth + admin role
router.use(authMiddleware, adminMiddleware);

// Dashboard
router.get('/dashboard', ctrl.getDashboard);

// Users
router.get('/users', ctrl.getUsers);
router.get('/users/:id', ctrl.getUserDetail);
router.patch(
  '/users/:id',
  validate(
    Joi.object({
      role: Joi.string().valid('user', 'admin').optional(),
      isActive: Joi.boolean().optional(),
    }).min(1)
  ),
  ctrl.updateUser
);
router.delete('/users/:id', ctrl.deleteUser);

// Movies
router.post('/movies', ...ctrl.createMovie);
router.patch('/movies/:id', ...ctrl.updateMovie);
router.delete('/movies/:id', ctrl.deleteMovie);

// Hero (bosh sahifa slideshow konfiguratsiyasi)
router.post('/hero', settingsCtrl.saveHero);

// Janr kartalari (filmlar/seriallar sahifasidagi kartalar konfiguratsiyasi)
router.post('/genre-cards', settingsCtrl.saveGenreCards);

// Comments (moderation)
router.get('/comments', ctrl.getComments);
router.delete('/comments/:id', ctrl.deleteComment);

// Genres
router.get('/genres', ctrl.getGenres);
router.post('/genres', validate(createGenre), ctrl.createGenre);
router.patch('/genres/:id', validate(updateGenre), ctrl.updateGenre);
router.delete('/genres/:id', ctrl.deleteGenre);

module.exports = router;
