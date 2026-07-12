const Joi = require('joi');

const createComment = Joi.object({
  text: Joi.string().min(1).max(1000).required(),
});

const updateComment = Joi.object({
  text: Joi.string().min(1).max(1000).required(),
});

module.exports = { createComment, updateComment };
