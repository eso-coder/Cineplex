const Joi = require('joi');

const register = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().min(6).max(100).required(),
});

// New Letterboxd-style signup: first/last name + email (+ optional phone & password).
const signup = Joi.object({
  firstName: Joi.string().min(1).max(50).required(),
  lastName: Joi.string().allow('').max(50).default(''),
  email: Joi.string().email().lowercase().required(),
  phone: Joi.string().allow('').max(30).default(''),
  password: Joi.string().min(6).max(100).optional(),
});

const verifyOtp = Joi.object({
  email: Joi.string().email().lowercase().required(),
  code: Joi.string().length(6).pattern(/^\d{6}$/).required(),
});

const resendOtp = Joi.object({
  email: Joi.string().email().lowercase().required(),
});

const login = Joi.object({
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().required(),
});

const oauth = Joi.object({
  // Real token from the provider SDK. In stub mode we also accept an email so
  // the flow is testable without configured OAuth credentials.
  token: Joi.string().allow('').optional(),
  credential: Joi.string().allow('').optional(),
  email: Joi.string().email().lowercase().optional(),
  firstName: Joi.string().allow('').max(50).optional(),
  lastName: Joi.string().allow('').max(50).optional(),
}).or('token', 'credential', 'email');

const updateProfile = Joi.object({
  firstName: Joi.string().min(1).max(50),
  lastName: Joi.string().allow('').max(50),
  name: Joi.string().min(2).max(50),
  email: Joi.string().email().lowercase(),
  location: Joi.string().allow('').max(80),
  website: Joi.string().allow('').max(200),
  socialHandle: Joi.string().allow('').max(80),
  phone: Joi.string().allow('').max(30),
}).min(1);

const changePassword = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).max(100).required(),
});

module.exports = { register, signup, verifyOtp, resendOtp, login, oauth, updateProfile, changePassword };
