const Joi = require('joi');

const rateMovie = Joi.object({
  score: Joi.number().integer().min(1).max(10).required(),
});

module.exports = { rateMovie };
