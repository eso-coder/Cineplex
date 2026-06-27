import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { parseFilename } from './parser';
import { prepareMedia } from './converter';
import { uploadToBunny } from './bunny';
import { fetchMetadata } from './metadata';
import { translateDescriptions } from './translate';
import { findYouTubeTrailer } from './trailer';
import { addMovieToAdmin } from './admin';

const HR = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
function log(msg: string) { console.log(msg); }
function step(n: string, title: string) { console.log(`\n[${n}] ${title}`); }

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('❌ Foydalanish:');
    console.error('   Lokal:  npx ts-node src/index.ts "C:\\Movies\\Inception.2010.mkv"');
    console.error('   URL:    npx ts-node src/index.ts "https://example.com/Inception.2010.mkv"');
    process.exit(1);
  }

  const isUrl = /^https?:\/\//i.test(input);

  // ── Fayl nomi / slug ──────────────────────────────────────────────────────────
  let filename: string;
  if (isUrl) {
    try {
      filename = decodeURIComponent(new URL(input).pathname.split('/').pop() || 'video.mkv');
    } catch { filename = 'video.mkv'; }
  } else {
    const absolutePath = path.resolve(input);
    if (!fs.existsSync(absolutePath)) {
      console.error(`❌ Fayl topilmadi: ${absolutePath}`);
      process.exit(1);
    }
    filename = path.basename(absolutePath);
  }

  const { title, year, slug } = parseFilename(filename);

  // Ish papkasi: lokal bo'lsa fayl yonida, URL bo'lsa temp
  const workDir = isUrl
    ? path.join(os.tmpdir(), 'fars-v3', slug)
    : path.join(path.dirname(path.resolve(input)), slug);

  console.log('\n🎬 FARS v3 Pipeline (Bunny Stream)');
  console.log(HR);
  log(`📁 Manba: ${filename}${isUrl ? ' (URL)' : ''}`);
  log(`🎯 Slug: ${slug}`);
  log(`📂 Work: ${workDir}`);
  log('');

  let videoUrl = '';
  let subtitleUrlList: Array<{ lang: string; label: string; url: string }> = [];

  // ── BOSQICH 1: Manbani tayyorlash (probe + MP4 remux + subtitle) ─────────────
  step('1/4', '🔍 Manba tahlil va tayyorlash (encode YO\'Q)...');
  let prep;
  try {
    prep = await prepareMedia(isUrl ? input : path.resolve(input), workDir);
  } catch (e) {
    console.error(`\n💥 Tayyorlash xato: ${(e as Error).message}`);
    process.exit(1);
  }

  // ── BOSQICH 2: Bunny Stream'ga joylash (encode bulutda) ──────────────────────
  step('2/4', '⬆  Bunny Stream\'ga joylash (3 sifat + audio bulutda)...');
  try {
    const res = await uploadToBunny(`${title} (${year})`, prep);
    videoUrl = res.playlistUrl;
    subtitleUrlList = res.subtitleUrls;
  } catch (e) {
    console.error(`\n💥 Bunny joylash xato: ${(e as Error).message}`);
    console.error('   Admin panelga buzuq URL saqlanmaydi. MP4 saqlanib qoldi — qayta urinish mumkin:');
    if (prep.mp4Path) console.error(`   ${prep.mp4Path}`);
    process.exit(1);  // buzuq kino admin'ga qo'shilmasin
  }

  // Lokal vaqtinchalik fayllarni tozalash (MP4 + vtt) — Bunny'da hammasi bor
  if (!prep.isUrl && prep.mp4Path) {
    try { fs.rmSync(prep.mp4Path, { force: true }); } catch { /* ignore */ }
  }
  for (const s of prep.subtitles) {
    try { fs.rmSync(s.vttPath, { force: true }); } catch { /* ignore */ }
  }

  // ── BOSQICH 3: Metadata ──────────────────────────────────────────────────────
  step('3/4', '📡 Metadata va trailer...');
  let metadata;
  try {
    metadata = await fetchMetadata(title, year);
    if (!metadata.descriptionUz || !metadata.descriptionRu) {
      if (metadata.descriptionEn) {
        const tr = await translateDescriptions(metadata.descriptionEn);
        if (!metadata.descriptionUz && tr.uz) metadata.descriptionUz = tr.uz;
        if (!metadata.descriptionRu && tr.ru) metadata.descriptionRu = tr.ru;
      }
    }
  } catch (e) {
    console.log(`  ⚠️  Metadata xato: ${(e as Error).message}`);
    metadata = { title, year, imdbRating: '7.0', rated: '', runtime: '', genres: [], galleryUrls: [], cast: [] } as any;
  }

  let trailerId: string | null = null;
  try { trailerId = await findYouTubeTrailer(title, year); } catch { /* ignore */ }

  log('');
  log(`  📽  ${metadata.title} (${metadata.year})`);
  log(`  ⭐  IMDB: ${metadata.imdbRating} | ${metadata.rated}`);
  log(`  🎭  Janrlar: ${metadata.genres.join(', ') || '—'}`);
  log(`  👥  Aktyorlar: ${metadata.cast.length} ta`);
  if (trailerId) log(`  🎥  Trailer: ${trailerId}`);
  if (subtitleUrlList.length) log(`  💬  Subtitlelar: ${subtitleUrlList.map(s => s.lang).join(', ')}`);

  // ── BOSQICH 4: Admin panel ───────────────────────────────────────────────────
  step('4/4', '🤖 Admin panel avtomatlash...');
  try {
    await addMovieToAdmin({
      metadata,
      s3Url: videoUrl,        // endi Bunny HLS URL (maydon nomi o'zgarmadi)
      slug,
      outputDir: workDir,
      trailerId,
      subtitles: subtitleUrlList,
    });
  } catch (e) {
    console.error(`\n⚠️  Admin panel xato: ${(e as Error).message}`);
    console.log('\n  Qo\'lda qo\'shish uchun:');
    console.log(`  videoUrl: ${videoUrl}`);
    if (subtitleUrlList.length) console.log('  subtitles:', JSON.stringify(subtitleUrlList, null, 2));
  }

  console.log('\n' + HR);
  console.log(`🎉 TUGADI! ${metadata.title} (${metadata.year}) qo'shildi.`);
  console.log(HR);
  console.log(`  🌐 HLS URL: ${videoUrl}`);
  console.log('');
}

main().catch(err => {
  console.error('\n💥 Kritik xato:', err.message);
  process.exit(1);
});
