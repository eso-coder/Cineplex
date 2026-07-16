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

/* ── Janr kartalari (filmlar/seriallar sahifasidagi Spotify-uslub kartalar) ──
   Hech narsa saqlanmagan bo'lsa quyidagi standart ro'yxat qaytariladi —
   frontend va admin panel bir xil manbadan boshlanadi. */
const DEFAULT_GENRE_CARDS = [
  { key: 'action',      label: 'Jangovar',    color: '#a8324a', tag: 'Mashhur', img: '' },
  { key: 'drama',       label: 'Drama',       color: '#477d95', tag: 'Trendda', img: '' },
  { key: 'comedy',      label: 'Komediya',    color: '#148a5f', tag: '', img: '' },
  { key: 'scifi',       label: 'Fantastika',  color: '#7b2ff7', tag: '', img: '' },
  { key: 'fantasy',     label: 'Fantaziya',   color: '#503aa8', tag: '', img: '' },
  { key: 'thriller',    label: 'Triller',     color: '#d9480f', tag: '', img: '' },
  { key: 'historical',  label: 'Tarixiy',     color: '#8a5a2b', tag: '', img: '' },
  { key: 'adventure',   label: 'Sarguzasht',  color: '#1d7a3c', tag: '', img: '' },
  { key: 'animation',   label: 'Animatsiya',  color: '#0e7490', tag: '', img: '' },
  { key: 'biography',   label: 'Biografik',   color: '#6d4c2f', tag: '', img: '' },
  { key: 'crime',       label: 'Kriminal',    color: '#5f273d', tag: '', img: '' },
  { key: 'documentary', label: 'Hujjatli',    color: '#3f5f3a', tag: '', img: '' },
  { key: 'horror',      label: "Qo'rqinchli", color: '#311b4f', tag: '', img: '' },
  { key: 'mystery',     label: 'Sirli',       color: '#2c3a6e', tag: '', img: '' },
  { key: 'romance',     label: 'Romantik',    color: '#b03a5b', tag: '', img: '' },
  { key: 'western',     label: 'Vestern',     color: '#9c6b1f', tag: '', img: '' },
];

// GET /api/settings/genre-cards — janr kartalari konfiguratsiyasi (public)
const getGenreCards = asyncHandler(async (req, res) => {
  const doc = await Setting.findOne({ key: 'genreCards' }).lean();
  const v = doc && doc.value ? doc.value : {};
  const items = Array.isArray(v.items) && v.items.length ? v.items : DEFAULT_GENRE_CARDS;
  const visibleCount =
    Number.isInteger(v.visibleCount) && v.visibleCount >= 1 && v.visibleCount <= 40
      ? v.visibleCount
      : 8;
  sendSuccess(res, { items, visibleCount });
});

// POST /api/admin/genre-cards — janr kartalarini saqlash (admin)
const saveGenreCards = asyncHandler(async (req, res) => {
  const raw = Array.isArray(req.body.items) ? req.body.items.slice(0, 40) : [];
  const items = raw
    .map((it) => ({
      key:   String(it.key || '').toLowerCase().trim().slice(0, 40),
      label: String(it.label || '').trim().slice(0, 60),
      color: String(it.color || '').trim().slice(0, 30),
      tag:   String(it.tag || '').trim().slice(0, 30),
      img:   String(it.img || '').trim().slice(0, 2000),
    }))
    .filter((it) => it.key);
  let visibleCount = parseInt(req.body.visibleCount, 10);
  if (isNaN(visibleCount) || visibleCount < 1 || visibleCount > 40) visibleCount = 8;
  await Setting.findOneAndUpdate(
    { key: 'genreCards' },
    { value: { items, visibleCount } },
    { upsert: true, new: true }
  );
  sendSuccess(res, { items, visibleCount }, 'Janr kartalari saqlandi');
});

module.exports = { getHero, saveHero, getGenreCards, saveGenreCards };
