/**
 * FARS v3 — Faqat admin panel bosqichini qayta ishlatish
 * HLS va S3 ni qayta qilmasdan.
 *
 * Foydalanish:
 *   npx ts-node run-admin-only.ts
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '.env') });

import { addMovieToAdmin } from './src/admin';
import { findYouTubeTrailer } from './src/trailer';

// ─────────────────────────────────────────────────────────────────────────────
// BladeRunner 2049 ma'lumotlari (pipeline chiqishidan olingan)
// ─────────────────────────────────────────────────────────────────────────────
const S3_URL   = 'https://cine-plex-uz.s3.eu-north-1.amazonaws.com/bladerunner20492026/master.m3u8';
const SLUG     = 'bladerunner20492026';
const OUT_DIR  = 'C:\\Users\\user\\Desktop\\films\\bladerunner20492026';

const SUBTITLES = [
  { lang: 'eng', label: 'English',   url: `https://cine-plex-uz.s3.eu-north-1.amazonaws.com/${SLUG}/sub_eng.vtt` },
  { lang: 'rus', label: 'Русский',   url: `https://cine-plex-uz.s3.eu-north-1.amazonaws.com/${SLUG}/sub_rus.vtt` },
  { lang: 'ara', label: 'العربية',   url: `https://cine-plex-uz.s3.eu-north-1.amazonaws.com/${SLUG}/sub_ara.vtt` },
  { lang: 'ger', label: 'Deutsch',   url: `https://cine-plex-uz.s3.eu-north-1.amazonaws.com/${SLUG}/sub_ger.vtt` },
  { lang: 'fre', label: 'Français',  url: `https://cine-plex-uz.s3.eu-north-1.amazonaws.com/${SLUG}/sub_fre.vtt` },
];

const METADATA = {
  title:         'Blade Runner 2049',
  titleRu:       'Бегущий по лезвию 2049',
  titleEn:       'Blade Runner 2049',
  year:          '2017',
  imdbRating:    '8.0',
  rated:         'R',
  runtime:       '164 min',
  genres:        ['Drama', 'Mystery', 'Sci-Fi', 'Thriller'],
  descriptionUz: "O'ttiz yil o'tgach, yangi replikant qo'riqchisi K o'zining kashfiyoti butun jamiyatni inqirozga olib kelishi mumkin bo'lgan sir ustini ochadi.",
  descriptionRu: "Тридцать лет спустя новый охотник за репликантами К. раскрывает тайну, способную погрузить общество в хаос.",
  descriptionEn: "A new blade runner, LAPD Officer K, unearths a long-buried secret that has the potential to plunge what's left of society into chaos.",
  posterUrl:     'https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg',
  bannerUrl:     'https://image.tmdb.org/t/p/original/ilRyazdMJwN4EMgKzOWJGnFrPFt.jpg',
  galleryUrls:   [],
  cast:          [
    { name: 'Ryan Gosling',   character: 'K',               photoUrl: '' },
    { name: 'Harrison Ford',  character: 'Rick Deckard',    photoUrl: '' },
    { name: 'Ana de Armas',   character: 'Joi',             photoUrl: '' },
    { name: 'Sylvia Hoeks',   character: 'Luv',             photoUrl: '' },
    { name: 'Robin Wright',   character: 'Lieutenant Joshi',photoUrl: '' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🎬 Admin panel — BladeRunner 2049');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Trailer topish
  let trailerId: string | null = null;
  try {
    console.log('🎥 Trailer qidirilmoqda...');
    trailerId = await findYouTubeTrailer('Blade Runner 2049', '2017');
  } catch { /* ignore */ }

  // Admin panelga qo'shish
  await addMovieToAdmin({
    metadata: METADATA as any,
    s3Url:    S3_URL,
    slug:     SLUG,
    outputDir: OUT_DIR,
    trailerId,
    subtitles: SUBTITLES,
  });

  console.log('\n✅ BladeRunner 2049 admin panelga qo\'shildi!');
}

main().catch(err => {
  console.error('\n💥 Xato:', err.message);
  process.exit(1);
});
