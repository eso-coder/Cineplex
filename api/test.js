// Diagnostika uchun — app yuklanishini tekshiradi
module.exports = (req, res) => {
  try {
    const app = require('../backend/src/app');
    res.json({ ok: true, message: 'App loaded successfully' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, stack: err.stack });
  }
};
