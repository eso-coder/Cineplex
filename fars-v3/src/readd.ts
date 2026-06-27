/**
 * FARS Re-add — konversiyasiz, faqat admin panelga qayta qo'shish.
 *
 * Video allaqachon HLS ga aylantirilgan va S3 ga yuklangan bo'lsa,
 * uni qaytadan aylantirmasdan (40+ daqiqa tejaladi) to'g'ri metadata bilan
 * admin panelga qo'shadi.
 *
 * Foydalanish:
 *   npx ts-node src/readd.ts "Anna Karenina" 2012 annakarenina20122026 "C:\Users\user\Desktop\films\annakarenina20122026"
 */
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { fetchMetadata } from './metadata';
import { translateDescriptions } from './translate';
import { findYouTubeTrailer } from './trailer';
import { addMovieToAdmin } from './admin';
import { buildSubtitleUrls } from './uploader';

// Subtitle til kodi → ko'rinadigan yorliq (converter bilan bir xil)
const LABELS: Record<string, string> = {
  uzb: "O'zbek", uz: "O'zbek", rus: 'Русский', ru: 'Русский',
  eng: 'English', en: 'English', fre: 'Français', fra: 'Français', fr: 'Français',
  ger: 'Deutsch', deu: 'Deutsch', de: 'Deutsch', ara: 'العربية', tur: 'Türkçe', spa: 'Español',
};

async function main() {
  const title     = process.argv[2];
  const year      = process.argv[3];
  const slug      = process.argv[4];
  const outputDir = process.argv[5];

  if (!title || !year || !slug || !outputDir) {
    console.error('❌ Foydalanish:');
    console.error('   npx ts-node src/readd.ts "Anna Karenina" 2012 annakarenina20122026 "C:\\Users\\user\\Desktop\\films\\annakarenina20122026"');
    process.exit(1);
  }

  const region = process.env.AWS_REGION || 'eu-north-1';
  const bucket = process.env.S3_BUCKET  || '';
  const s3Url  = `https://${bucket}.s3.${region}.amazonaws.com/${slug}/master.m3u8`;

  console.log('\n🔁 FARS Re-add (konversiyasiz)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  📂 Output: ${outputDir}`);
  console.log(`  🌐 S3:     ${s3Url}`);

  // ── Subtitllarni output papkadan aniqlaymiz (sub_*.vtt) ──────────────────────
  const subs = fs.existsSync(outputDir)
    ? fs.readdirSync(outputDir)
        .filter(f => /^sub_.+\.vtt$/i.test(f))
        .map(f => {
          const lang = f.replace(/^sub_/i, '').replace(/\.vtt$/i, '');
          return { lang, label: LABELS[lang] || lang, filename: f };
        })
    : [];
  const subtitleUrlList = buildSubtitleUrls(slug, subs);
  console.log(`  💬 Subtitlelar: ${subs.map(s => s.lang).join(', ') || '—'}`);

  // ── Metadata (OMDB + TMDB) ───────────────────────────────────────────────────
  console.log('\n📡 Metadata olinmoqda...');
  const metadata = await fetchMetadata(title, year);

  // Tavsifni tarjima qilish (uz/ru bo'lmasa, en dan)
  if (!metadata.descriptionUz || !metadata.descriptionRu) {
    if (metadata.descriptionEn) {
      try {
        const tr = await translateDescriptions(metadata.descriptionEn);
        if (!metadata.descriptionUz && tr.uz) metadata.descriptionUz = tr.uz;
        if (!metadata.descriptionRu && tr.ru) metadata.descriptionRu = tr.ru;
      } catch (e) {
        console.log(`  ⚠️  Tarjima xato: ${(e as Error).message}`);
      }
    }
  }

  // Trailer
  let trailerId: string | null = null;
  try { trailerId = await findYouTubeTrailer(title, year); } catch { /* ignore */ }

  console.log(`\n  📽  ${metadata.title} (${metadata.year})`);
  console.log(`  ⭐  IMDB: ${metadata.imdbRating} | ${metadata.rated || '—'}`);
  console.log(`  🎭  Janrlar: ${metadata.genres.join(', ') || '—'}`);
  console.log(`  🖼  Gallereya: ${metadata.galleryUrls.length} rasm`);
  console.log(`  👥  Aktyorlar: ${metadata.cast.length} ta`);
  if (trailerId) console.log(`  🎥  Trailer: ${trailerId}`);
  console.log(`  📝  Tavsif: UZ=${metadata.descriptionUz ? '✓' : '✗'} RU=${metadata.descriptionRu ? '✓' : '✗'} EN=${metadata.descriptionEn ? '✓' : '✗'}`);

  // ── Admin panel ──────────────────────────────────────────────────────────────
  console.log('\n🤖 Admin panel avtomatlash...');
  await addMovieToAdmin({
    metadata, s3Url, slug, outputDir, trailerId, subtitles: subtitleUrlList,
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🎉 TUGADI! ${metadata.title} (${metadata.year}) admin panelga qo'shildi.`);
}

main().catch(err => {
  console.error('\n💥 Xato:', err.message);
  process.exit(1);
});
