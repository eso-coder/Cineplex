const sendSuccess = (res, data = null, message = 'Success', statusCode = 200) => {
  const body = { success: true, message };
  if (data !== null) body.data = data;
  return res.status(statusCode).json(body);
};

const sendPaginated = (res, data, pagination, message = 'Success') =>
  res.status(200).json({ success: true, message, data, pagination });

const sendCreated = (res, data, message = 'Created successfully') =>
  sendSuccess(res, data, message, 201);

module.exports = { sendSuccess, sendPaginated, sendCreated };
