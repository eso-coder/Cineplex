/* ════════════════════════════════════════════════════════════════════════
   BACKFILL BANNERS — hamma kinoga "Anna Karenina" uslubidagi TOZA (textsiz)
   backdrop banner qo'yadi. Joker kabi kinolarda banner ichida film nomi
   yozilgan bo'lib, logo bilan ustma-ust tushardi — bu skript shuni tuzatadi.

   Ishlash printsipi:
     • Production ADMIN API orqali ishlaydi (to'g'ridan bazaga emas) — shuning
       uchun jonli saytdagi ma'lumotni yangilaydi.
     • Har bir kino uchun TMDB'dan iso_639_1 == null (TILSIZ = textsiz) backdrop
       tanlaydi. Bu poster URL'idan butunlay boshqa rasm.
     • bannerUrl + gallery (6+ textsiz backdrop) yangilanadi.

   Ishga tushirish (PowerShell):
     $env:TMDB_API_KEY="427b04...";
     $env:ADMIN_EMAIL="maleyip22@gmail.com";
     $env:ADMIN_PASSWORD="<admin parol>";
     node scripts/backfill-banners.js

   Bash:
     TMDB_API_KEY=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/backfill-banners.js

   Faqat ko'rish (yozmasdan): yuqoridagiga DRY_RUN=1 qo'shing.
   ════════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const API_BASE = (process.env.API_BASE || 'https://www.cineplex.uz/api').replace(/\/$/, '');
const EMAIL    = process.env.ADMIN_EMAIL || '';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const TMDB_KEY = process.env.TMDB_API_KEY || '';
const DRY_RUN  = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

function die(msg) { console.error('\n❌ ' + msg); process.exit(1); }

async function jfetch(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const m = (body && body.message) || (body && body.error && body.error.message) || text;
    throw new Error(`HTTP ${res.status} — ${m}`);
  }
  return body;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ── 1. Admin login ── */
async function login() {
  const data = await jfetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const token = data?.data?.accessToken || data?.accessToken;
  if (!token) throw new Error('Login javobida accessToken yo\'q');
  return token;
}

/* ── 2. TMDB: kino id sini topish ── */
async function tmdbFindId(title, year) {
  const tries = [
    `${TMDB_API}/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}${year ? `&year=${year}` : ''}`,
    `${TMDB_API}/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}`,
  ];
  for (const url of tries) {
    try {
      const data = await jfetch(url);
      if (data && Array.isArray(data.results) && data.results.length) {
        // Yilga eng mos keladiganini tanlaymiz
        if (year) {
          const exact = data.results.find(r => (r.release_date || '').startsWith(String(year)));
          if (exact) return exact.id;
        }
        return data.results[0].id;
      }
    } catch (e) { /* keyingi urinish */ }
  }
  return null;
}

/* ── 3. TMDB: TEXTSIZ (til-neytral) backdroplarni olish ── */
async function tmdbBackdrops(tmdbId) {
  // include_image_language bo'sh — barcha (jumladan null-til) backdroplarni qaytaradi
  const data = await jfetch(`${TMDB_API}/movie/${tmdbId}/images?api_key=${TMDB_KEY}`);
  const all = (data && data.backdrops) || [];
  // Faqat TEXTSIZ (iso_639_1 == null) — film nomi yozilmagan toza sahnalar
  const neutral = all
    .filter(b => !b.iso_639_1)
    .sort((a, b) => (b.width || 0) - (a.width || 0));
  return neutral.map(b => `${TMDB_IMG}/original${b.file_path}`);
}

/* ── Main ── */
(async () => {
  if (!TMDB_KEY)  die('TMDB_API_KEY yo\'q. FARS v3 .env dan oling: 427b04...');
  if (!DRY_RUN && (!EMAIL || !PASSWORD)) die('ADMIN_EMAIL va ADMIN_PASSWORD kerak (yoki DRY_RUN=1).');

  console.log(`\n🎬 Banner backfill — ${API_BASE}${DRY_RUN ? '  (DRY RUN — yozilmaydi)' : ''}`);

  let token = null;
  if (!DRY_RUN) {
    console.log('🔑 Admin login...');
    token = await login();
    console.log('   ✓ kirildi');
  }

  console.log('📥 Kinolar olinmoqda...');
  const list = await jfetch(`${API_BASE}/movies?limit=500`);
  const movies = (list.data || list.movies || []).filter(Boolean);
  console.log(`   ✓ ${movies.length} ta kino\n`);

  let ok = 0, skip = 0, fail = 0;

  for (const m of movies) {
    const id = (m._id || m.id || '').toString();
    const title = m.title || '';
    const year = m.releaseYear || m.year || '';
    const poster = (m.poster && m.poster.url) || m.img || '';
    const label = `${title} (${year || '—'})`;

    try {
      const tmdbId = await tmdbFindId(title, year);
      if (!tmdbId) { console.log(`⏭  ${label} — TMDB topilmadi, o'tkazildi`); skip++; continue; }

      const backdrops = await tmdbBackdrops(tmdbId);
      // Posterga teng bo'lib qolmasligi uchun filtrlash (ehtiyot chorasi)
      const clean = backdrops.filter(u => u && u !== poster);
      if (!clean.length) { console.log(`⏭  ${label} — textsiz backdrop yo'q, o'tkazildi`); skip++; continue; }

      const bannerUrl = clean[0];
      const gallery   = clean.slice(0, 10); // banner ham gallereyada bo'lsin (6+ kafolat)

      if (DRY_RUN) {
        console.log(`🔎 ${label}\n     banner → ${bannerUrl}\n     gallery: ${gallery.length} ta textsiz backdrop`);
        ok++; continue;
      }

      await jfetch(`${API_BASE}/admin/movies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bannerUrl, gallery }),
      });
      console.log(`✅ ${label} — banner yangilandi (gallery: ${gallery.length})`);
      ok++;
      await sleep(250); // TMDB/API ni bo'g'masdan
    } catch (e) {
      console.log(`❌ ${label} — ${e.message}`);
      fail++;
    }
  }

  console.log(`\n──────────────────────────────\n✓ Yangilandi: ${ok}   ⏭ O'tkazildi: ${skip}   ❌ Xato: ${fail}\n`);
  process.exit(0);
})().catch(err => die(err.message || String(err)));
