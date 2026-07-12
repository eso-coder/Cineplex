const Joi = require('joi');

const movieQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(500).default(20),
  genre: Joi.string().optional(),
  year: Joi.number().integer().min(1888).optional(),
  sort: Joi.string().valid('newest', 'oldest', 'rating', 'views').default('newest'),
  search: Joi.string().max(200).allow('').optional(),
});

module.exports = { movieQuery };
