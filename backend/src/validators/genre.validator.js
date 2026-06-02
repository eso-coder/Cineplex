const Joi = require('joi');

const createGenre = Joi.object({
  name: Joi.string().min(2).max(50).required(),
});

const updateGenre = Joi.object({
  name: Joi.string().min(2).max(50).required(),
});

module.exports = { createGenre, updateGenre };
