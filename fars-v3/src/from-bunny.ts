/**
 * FARS v3 — Bunny kodidan avtomat pipeline (3/4 + 4/4).
 *
 * Video ALLAQACHON Bunny Stream'da tayyor bo'lsa (qo'lda yuklangan yoki avval
 * yuklab qo'yilgan), uni qaytadan yuklamasdan: metadata topadi, subtitlelarni
 * joyiga qo'yadi va admin panelga to'liq qo'shadi.
 *
 * Foydalanish:
 *   npx ts-node src/from-bunny.ts "https://player.mediadelivery.net/play/703419/<guid>"
 *   npx ts-node src/from-bunny.ts "<guid>"
 *
 * Qo'shimcha (subtitr qolib ketmasligi uchun):
 *   --source "C:\Movies\Film.mkv"      manba fayldan subtitlelarni ajratib Bunny'ga yuklaydi
 *   --sub "C:\Film.uz.srt:uz"          tashqi subtitle faylni yuklaydi (fayl:til)
 *   --title "The Green Mile"           Bunny sarlavhasi noto'g'ri bo'lsa
 *   --year 1999
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { parseFilename } from './parser';
import { probeAndExtractSubtitles, convertSubtitleFile, PreparedSubtitle } from './converter';
import {
  parseBunnyRef, getVideoInfo, waitForBunnyEncoding,
  uploadCaptionsToVideo, bunnyCaptionUrl, bunnyLibraryId,
} from './bunny';
import { fetchMetadata } from './metadata';
import { translateDescriptions } from './translate';
import { findYouTubeTrailer } from './trailer';
import { addMovieToAdmin } from './admin';

const HR = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

// Bunny caption tili → ko'rinadigan yorliq
const LABELS: Record<string, string> = {
  uz: "O'zbek", ru: 'Русский', en: 'English', fr: 'Français',
  de: 'Deutsch', tr: 'Türkçe', ar: 'العربية', es: 'Español',
};

// ─── Argumentlarni o'qish ─────────────────────────────────────────────────────
interface Args {
  ref: string;
  source?: string;
  subs: Array<{ file: string; lang: string }>;
  title?: string;
  year?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { ref: '', subs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source')      out.source = argv[++i];
    else if (a === '--title')  out.title  = argv[++i];
    else if (a === '--year')   out.year   = argv[++i];
    else if (a === '--sub') {
      const v = argv[++i] || '';
      // "C:\path\film.uz.srt:uz" — oxirgi ":" til ajratuvchisi (drayv harfi C: ni buzmaslik uchun)
      const idx = v.lastIndexOf(':');
      if (idx <= 1) throw new Error(`--sub formati: "fayl:til" (masalan "C:\\Film.uz.srt:uz"), berildi: "${v}"`);
      out.subs.push({ file: v.slice(0, idx), lang: v.slice(idx + 1) });
    }
    else if (!out.ref) out.ref = a;
  }
  return out;
}

// Bunny sarlavhasidan nom+yil: "The Green Mile (1999)" → title "The Green Mile", year "1999"
function titleFromBunny(bunnyTitle: string): { title: string; year: string; slug: string } {
  // Qavslarni bo'shliqqa aylantiramiz — parser qavs ichidagi yilni ham topsin
  const cleaned = bunnyTitle.replace(/[()\[\]]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return parseFilename(cleaned);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ref) {
    console.error('❌ Foydalanish:');
    console.error('   npx ts-node src/from-bunny.ts "https://player.mediadelivery.net/play/703419/<guid>"');
    console.error('   npx ts-node src/from-bunny.ts "<guid>" --source "C:\\Movies\\Film.mkv"');
    process.exit(1);
  }

  console.log('\n🐰 FARS v3 — Bunny kodidan avtomat qo\'shish');
  console.log(HR);

  // ── BOSQICH 1: Bunny videosini topish ───────────────────────────────────────
  console.log('\n[1/4] 🔍 Bunny videosini topish...');
  const { guid, libraryId } = parseBunnyRef(args.ref);
  const envLib = bunnyLibraryId();
  if (libraryId && libraryId !== envLib) {
    console.error(`\n💥 Library mos emas: URL'da ${libraryId}, .env da ${envLib}.`);
    console.error('   API kaliti library\'ga bog\'liq — .env dagi BUNNY_LIBRARY_ID/BUNNY_API_KEY ni tekshiring.');
    process.exit(1);
  }

  let info;
  try {
    info = await getVideoInfo(guid);
  } catch (e) {
    console.error(`\n💥 Bunny'dan video olinmadi: ${(e as Error).message}`);
    process.exit(1);
  }
  console.log(`  ✅ Topildi: "${info.title}"`);
  console.log(`  📺 ${info.width}x${info.height} | ${info.availableResolutions} | ${Math.floor(info.length / 60)}m`);

  // Multi-audio tashlab yuborilgan bo'lsa — ogohlantiramiz (VFR muammosi)
  for (const m of info.transcodingMessages) {
    if (m.message) console.log(`  ⚠️  Bunny: ${m.message}`);
  }

  // ── BOSQICH 2: Encode holati + subtitlelar ──────────────────────────────────
  console.log('\n[2/4] 🎞  Encode holati va subtitlelar...');
  if (info.status === 5 || info.status === 6) {
    console.error(`\n💥 Bunny encode xato holatida (status ${info.status}) — admin panelga qo'shilmaydi.`);
    process.exit(1);
  }
  if (info.status !== 4) {
    console.log(`  ⏳ Encode hali tugamagan (${info.encodeProgress}%) — kutamiz...`);
    await waitForBunnyEncoding(guid);
    info = await getVideoInfo(guid);
  }
  console.log('  ✅ Encode tayyor');

  const workDir = path.join(os.tmpdir(), 'fars-v3', guid);
  fs.mkdirSync(workDir, { recursive: true });

  // 2a. Bunny'da allaqachon turgan captionlar
  const subtitleUrlList: Array<{ lang: string; label: string; url: string }> = info.captions.map(c => ({
    lang:  c.srclang,
    label: c.label || LABELS[c.srclang] || c.srclang.toUpperCase(),
    url:   bunnyCaptionUrl(guid, c.srclang),
  }));
  if (subtitleUrlList.length) {
    console.log(`  ✅ Bunny'da mavjud caption: ${subtitleUrlList.map(s => s.lang).join(', ')}`);
  }

  // 2b. Manba fayl berilgan bo'lsa — ichidagi subtitlelarni ajratib Bunny'ga yuklaymiz
  const toUpload: PreparedSubtitle[] = [];
  if (args.source) {
    console.log(`  🔎 Manbadan subtitle ajratilmoqda: ${path.basename(args.source)}`);
    try {
      const extracted = await probeAndExtractSubtitles(args.source, workDir);
      toUpload.push(...extracted);
    } catch (e) {
      console.log(`  ⚠️  Manbadan subtitle ajratilmadi: ${(e as Error).message.slice(0, 80)}`);
    }
  }

  // 2c. Tashqi --sub fayllar
  for (const s of args.subs) {
    try {
      toUpload.push(await convertSubtitleFile(s.file, workDir, s.lang, LABELS[s.lang]));
      console.log(`  ✅ Tashqi subtitle tayyor: ${s.lang}`);
    } catch (e) {
      console.log(`  ⚠️  Tashqi subtitle xato (${s.file}): ${(e as Error).message.slice(0, 60)}`);
    }
  }

  // Bunny'da allaqachon bor tillarni qayta yuklamaymiz
  const have = new Set(subtitleUrlList.map(s => s.lang));
  const fresh = toUpload.filter(s => !have.has(s.lang));
  if (toUpload.length > fresh.length) {
    console.log(`  ℹ️  Bunny'da bor tillar o'tkazib yuborildi: ${toUpload.filter(s => have.has(s.lang)).map(s => s.lang).join(', ')}`);
  }
  if (fresh.length) {
    const uploaded = await uploadCaptionsToVideo(guid, fresh);
    subtitleUrlList.push(...uploaded);
  }
  for (const s of toUpload) { try { fs.rmSync(s.vttPath, { force: true }); } catch { /* ignore */ } }

  if (!subtitleUrlList.length) {
    console.log('  ⚠️  SUBTITLE YO\'Q — bu videoda hech qanday caption topilmadi.');
    console.log('     Manba fayl bo\'lsa: --source "C:\\Movies\\Film.mkv" bilan qayta ishga tushiring');
    console.log('     yoki tashqi srt bo\'lsa: --sub "C:\\Film.uz.srt:uz"');
  } else {
    console.log(`  💬 Jami subtitle: ${subtitleUrlList.map(s => s.lang).join(', ')}`);
  }

  // ── BOSQICH 3: Metadata ─────────────────────────────────────────────────────
  console.log('\n[3/4] 📡 Metadata va trailer...');
  const parsed = titleFromBunny(args.title ? `${args.title} ${args.year || ''}` : info.title);
  const title = args.title || parsed.title;
  const year  = args.year  || parsed.year;
  const slug  = parsed.slug;
  console.log(`  🎯 Qidiruv: "${title}" (${year}) | slug: ${slug}`);

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
    console.error(`\n💥 Metadata xato: ${(e as Error).message}`);
    process.exit(1);
  }

  let trailerId: string | null = null;
  try { trailerId = await findYouTubeTrailer(title, year); } catch { /* ignore */ }

  console.log('');
  console.log(`  📽  ${metadata.title} (${metadata.year})`);
  console.log(`  ⭐  IMDB: ${metadata.imdbRating} | ${metadata.rated || '—'}`);
  console.log(`  🎭  Janrlar: ${metadata.genres.join(', ') || '—'}`);
  console.log(`  🖼  Gallereya: ${metadata.galleryUrls.length} rasm`);
  console.log(`  👥  Aktyorlar: ${metadata.cast.length} ta`);
  console.log(`  📝  Tavsif: UZ=${metadata.descriptionUz ? '✓' : '✗'} RU=${metadata.descriptionRu ? '✓' : '✗'} EN=${metadata.descriptionEn ? '✓' : '✗'}`);
  if (trailerId) console.log(`  🎥  Trailer: ${trailerId}`);

  // ── BOSQICH 4: Admin panel ──────────────────────────────────────────────────
  console.log('\n[4/4] 🤖 Admin panel avtomatlash...');
  try {
    await addMovieToAdmin({
      metadata,
      s3Url: info.playlistUrl,   // Bunny HLS URL (maydon nomi eski)
      slug,
      outputDir: workDir,
      trailerId,
      subtitles: subtitleUrlList,
    });
  } catch (e) {
    console.error(`\n⚠️  Admin panel xato: ${(e as Error).message}`);
    console.log('\n  Qo\'lda qo\'shish uchun:');
    console.log(`  videoUrl: ${info.playlistUrl}`);
    if (subtitleUrlList.length) console.log('  subtitles:', JSON.stringify(subtitleUrlList, null, 2));
    process.exit(1);
  }

  console.log('\n' + HR);
  console.log(`🎉 TUGADI! ${metadata.title} (${metadata.year}) admin panelga qo'shildi.`);
  console.log(`  🌐 HLS: ${info.playlistUrl}`);
  console.log('');
}

main().catch(err => {
  console.error('\n💥 Kritik xato:', err.message);
  process.exit(1);
});
