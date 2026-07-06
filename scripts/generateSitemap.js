/* ═══════════════════════════════════════════════════════
   CINEPLEX — Dinamik sitemap.xml generatori
   MongoDB'dagi barcha film/serial hujjatlaridan sitemap.xml quradi.

   Ishlatish:
     node scripts/generateSitemap.js
   (yoki deploy build bosqichida / kunlik cron job sifatida)
═══════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '../backend/.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Movie = require('../backend/src/models/Movie');

const SITE_URL = process.env.SITE_URL || 'https://www.cineplex.uz';
const OUTPUT_PATH = path.join(__dirname, '../sitemap.xml');

// Statik sahifalar — mavjud sitemap.xml'dagi bilan bir xil
const STATIC_URLS = [
  { loc: `${SITE_URL}/`, changefreq: 'daily', priority: '1.0' },
  { loc: `${SITE_URL}/pages/movies.html`, changefreq: 'daily', priority: '0.9' },
  { loc: `${SITE_URL}/pages/series.html`, changefreq: 'daily', priority: '0.9' },
  { loc: `${SITE_URL}/pages/new.html`, changefreq: 'daily', priority: '0.8' },
  { loc: `${SITE_URL}/pages/actors.html`, changefreq: 'weekly', priority: '0.7' },
];

function escapeXml(s) {
  return String(s || '').replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  }[c]));
}

function urlEntry({ loc, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    priority ? `    <priority>${priority}</priority>` : null,
    '  </url>',
  ].filter(Boolean).join('\n');
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB ga ulandi');

  // Barcha film/serial hujjatlari — bitta Movie kolleksiyasida, type maydoni
  // orqali ajratiladi (loyihada alohida Series kolleksiyasi yo'q).
  const docs = await Movie.find({}).select('_id type updatedAt').lean();
  console.log(`Topildi: ${docs.length} ta film/serial`);

  const dynamicUrls = docs.map((m) => ({
    loc: `${SITE_URL}/pages/movie.html?id=${m._id}`,
    lastmod: (m.updatedAt || new Date()).toISOString().slice(0, 10),
    changefreq: 'weekly',
    priority: m.type === 'series' ? '0.75' : '0.7',
  }));

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...STATIC_URLS.map(urlEntry),
    ...dynamicUrls.map(urlEntry),
    '</urlset>',
    '',
  ].join('\n');

  fs.writeFileSync(OUTPUT_PATH, xml, 'utf8');
  console.log(`sitemap.xml yozildi: ${OUTPUT_PATH} (${STATIC_URLS.length + dynamicUrls.length} ta URL)`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error('Sitemap generatsiyasida xato:', err);
  process.exit(1);
});
