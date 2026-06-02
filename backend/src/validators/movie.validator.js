const Joi = require('joi');

const createMovie = Joi.object({
  title: Joi.string().max(200).required(),
  description: Joi.string().max(2000).required(),
  trailerUrl: Joi.string().uri().allow('').optional(),
  videoUrl: Joi.string().uri().allow('').optional(),
  genres: Joi.array().items(Joi.string().hex().length(24)).optional(),
  director: Joi.string().max(100).allow('').optional(),
  cast: Joi.array().items(Joi.string().max(100)).optional(),
  releaseYear: Joi.number().integer().min(1888).max(new Date().getFullYear() + 5).required(),
  duration: Joi.number().integer().min(0).optional(),
  country: Joi.string().max(100).allow('').optional(),
  language: Joi.string().max(100).allow('').optional(),
  isFeatured: Joi.boolean().optional(),
});

const updateMovie = createMovie.fork(
  ['title', 'description', 'releaseYear'],
  (field) => field.optional()
);

const movieQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(500).default(20),
  genre: Joi.string().optional(),
  year: Joi.number().integer().min(1888).optional(),
  sort: Joi.string().valid('newest', 'oldest', 'rating', 'views').default('newest'),
  search: Joi.string().max(200).allow('').optional(),
});

module.exports = { createMovie, updateMovie, movieQuery };
