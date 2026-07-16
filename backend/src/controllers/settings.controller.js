const Setting = require('../models/Setting');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

// GET /api/settings/hero — bosh sahifa hero konfiguratsiyasi (public)
const getHero = asyncHandler(async (req, res) => {
  const doc = await Setting.findOne({ key: 'hero' }).lean();
  const v = doc && doc.value ? doc.value : {};
  sendSuccess(res, {
    items: Array.isArray(v.items) ? v.items : [],
    clickable: v.clickable !== false,
  });
});

// POST /api/admin/hero — hero konfiguratsiyasini saqlash (admin)
const saveHero = asyncHandler(async (req, res) => {
  const raw = Array.isArray(req.body.items) ? req.body.items.slice(0, 10) : [];
  const clickable = req.body.clickable !== false;
  // Faqat kutilgan maydonlarni string ko'rinishida saqlaymiz
  const items = raw.map((it) => ({
    id:       String(it.id || ''),
    trailer:  String(it.trailer || ''),
    img:      String(it.img || ''),
    logoImg:  String(it.logoImg || ''),
    logoScale: String(it.logoScale || '100'),
    logoMain: String(it.logoMain || ''),
    logoSub:  String(it.logoSub || ''),
    year:     String(it.year || ''),
    imdb:     String(it.imdb || ''),
    age:      String(it.age || ''),
    duration: String(it.duration || ''),
    views:    String(it.views || ''),
  }));
  await Setting.findOneAndUpdate(
    { key: 'hero' },
    { value: { items, clickable } },
    { upsert: true, new: true }
  );
  sendSuccess(res, { items, clickable }, 'Hero konfiguratsiyasi saqlandi');
});

module.exports = { getHero, saveHero };
