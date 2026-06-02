// ============================================================
//  FARS v2 — Full Pipeline Orchestrator
//
//  MKV fayl → HLS segments → S3 upload
//           → IMDB/TMDB ma'lumot
//           → YouTube trailer
//           → Admin panel auto-fill → Publish
//
//  Ishlatish:
//    # To'liq pipeline (MKV fayldan):
//    npx ts-node src/index.ts "C:\Films\Onegin1999.mkv"
//
//    # Faqat ma'lumot + admin (S3 da allaqachon bor):
//    npx ts-node src/index.ts "https://...s3.../onegin1999/master.m3u8"
//    npx ts-node src/index.ts onegin1999 --title "Onegin" --year 1999
//
//    # Mavjud filmni yangilash:
//    npx ts-node src/index.ts onegin1999 --update 6a1935c91db6caec27d3ae6e
//
//    # Ma'lumotlarni ko'rish (qo'shmasdan):
//    npx ts-node src/index.ts Onegin1999.mkv --dry-run
// ============================================================

import * as dotenv from 'dotenv';
dotenv.config();

import * as path  from 'path';
import * as fs    from 'fs';

import { parseInput, buildVideoUrl }        from './parser';
import { parseFileName, convertAndUpload }  from './convert-upload';
import { fetchFromOmdb, fetchFromTmdb, searchImdbId, scrapeImdbPage, estimateAgeRating } from './imdb';
import { findTrailer }                       from './youtube';
import { getImages }                         from './images';
import { AdminAPIClient, PlaywrightAdminClient, ratedToAge } from './automation';
import { FarsConfig, MovieData, CliArgs }    from './types';
import * as logger                           from './logger';

// ── Config loader ─────────────────────────────────────────────────────────────

function loadConfig(): FarsConfig {
  return {
    apiBase:          process.env.API_BASE         || 'http://localhost:5000/api',
    adminUrl:         process.env.ADMIN_URL        || 'http://localhost:5000',
    adminEmail:       process.env.ADMIN_EMAIL      || '',
    adminPassword:    process.env.ADMIN_PASSWORD   || '',
    adminMode:        (process.env.ADMIN_MODE as 'api' | 'playwright') || 'playwright',
    headless:         process.env.HEADLESS         !== 'false',
    s3Bucket:         process.env.S3_BUCKET        || 'cine-plex-uz',
    s3Region:         process.env.AWS_REGION       || 'eu-north-1',
    awsAccessKeyId:   process.env.AWS_ACCESS_KEY_ID    || '',
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    outputDir:        process.env.OUTPUT_DIR       || path.join(process.cwd(), 'hls_output'),
    ffmpegPath:       process.env.FFMPEG_PATH      || 'ffmpeg',
    ffprobePath:      process.env.FFPROBE_PATH     || 'ffprobe',
    omdbKey:          process.env.OMDB_API_KEY     || undefined,
    tmdbKey:          process.env.TMDB_API_KEY     || undefined,
    youtubeKey:       process.env.YOUTUBE_API_KEY  || undefined,
  };
}

// ── CLI parser ────────────────────────────────────────────────────────────────

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const r: CliArgs = { input: '', dryRun: false, skipConvert: false, skipTrailer: false, skipImages: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--title':         r.titleOverride = argv[++i]; break;
      case '--year':          r.yearOverride  = parseInt(argv[++i]); break;
      case '--update':        r.updateId      = argv[++i]; break;
      case '--dry-run':       r.dryRun        = true; break;
      case '--skip-convert':  r.skipConvert   = true; break;
      case '--skip-trailer':  r.skipTrailer   = true; break;
      case '--skip-images':   r.skipImages    = true; break;
      default:
        if (!r.input && !argv[i].startsWith('--')) r.input = argv[i];
    }
  }
  return r;
}

function showUsage(): void {
  console.log('');
  console.log('  Ishlatish:');
  console.log('    npx ts-node src/index.ts <input> [opsiyalar]');
  console.log('');
  console.log('  Input turlari:');
  console.log('    MKV fayl  : "C:\\Films\\Onegin1999.mkv"');
  console.log('    S3 URL    : https://...amazonaws.com/onegin1999/master.m3u8');
  console.log('    Slug      : onegin1999');
  console.log('');
  console.log('  Opsiyalar:');
  console.log('    --title "Onegin"    Sarlavhani qo\'lda kiriting');
  console.log('    --year 1999         Yilni qo\'lda kiriting');
  console.log('    --update <id>       Mavjud filmni yangilash');
  console.log('    --dry-run           Ma\'lumotlarni ko\'rish (qo\'shmasdan)');
  console.log('    --skip-convert      FFmpeg konvertatsiyasini o\'tkazib yuborish');
  console.log('    --skip-trailer      YouTube qidiruvini o\'tkazib yuborish');
  console.log('    --skip-images       TMDB rasm qidiruvini o\'tkazib yuborish');
  console.log('');
}

// ── Determine input type ──────────────────────────────────────────────────────

type InputType = 'mkv' | 's3url' | 'slug';

function detectInputType(input: string): InputType {
  if (input.toLowerCase().endsWith('.mkv') || fs.existsSync(input)) return 'mkv';
  if (input.startsWith('http')) return 's3url';
  return 'slug';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.banner();

  const args   = parseArgs();
  const config = loadConfig();

  if (!args.input) { showUsage(); process.exit(1); }
  if (!config.adminEmail || !config.adminPassword) {
    logger.error('ADMIN_EMAIL va ADMIN_PASSWORD .env faylida bolishi shart');
    process.exit(1);
  }

  const inputType = detectInputType(args.input);
  logger.log(`Input turi  : ${inputType}`);
  logger.log(`Admin rejim : ${config.adminMode}${config.adminMode === 'playwright' ? (config.headless ? ' (headless)' : ' (ko\'rinadigan)') : ''}`);

  let videoUrl = '';
  let slug     = '';
  let subtitleTracks: Array<{ lang: string; label: string; url: string }> = [];

  // ════════════════════════════════════════════════════
  // QADAM 1: Convert + Upload  (faqat MKV input uchun)
  // ════════════════════════════════════════════════════
  if (inputType === 'mkv' && !args.skipConvert) {
    logger.step('1/5', 'MKV → HLS → S3');

    if (!config.awsAccessKeyId || !config.awsSecretAccessKey) {
      logger.error('AWS_ACCESS_KEY_ID va AWS_SECRET_ACCESS_KEY .env da bolishi shart');
      process.exit(1);
    }

    const parsed = parseFileName(args.input);
    slug = parsed.slug;

    logger.log(`Film     : ${parsed.name} (${parsed.year})`);
    logger.log(`Slug     : ${slug}`);
    logger.log(`Chiqim   : ${config.outputDir}\\${slug}`);

    const result = await convertAndUpload(args.input, slug, config);
    videoUrl       = result.s3Url;
    subtitleTracks = result.subtitles;

    logger.ok(`S3: ${videoUrl}`);
    if (subtitleTracks.length) {
      logger.ok(`Subtitlelar: ${subtitleTracks.map(s => s.lang).join(', ')}`);
    }

    // Override title/year from filename if not explicitly provided
    if (!args.titleOverride) args.titleOverride = parsed.name;
    if (!args.yearOverride && parsed.year) args.yearOverride = parseInt(parsed.year);

  } else if (inputType === 'mkv' && args.skipConvert) {
    // MKV given but skip convert — build S3 URL from filename
    const parsed = parseFileName(args.input);
    slug     = parsed.slug;
    videoUrl = buildVideoUrl(slug, config.s3Bucket, config.s3Region);
    if (!args.titleOverride) args.titleOverride = parsed.name;
    if (!args.yearOverride && parsed.year) args.yearOverride = parseInt(parsed.year);
    logger.step('1/5', 'KONVERTATSIYA O\'TKAZIB YUBORILDI');
    logger.log(`Video URL: ${videoUrl}`);
  } else {
    // S3 URL or slug
    logger.step('1/5', 'INPUT TAHLIL');
    const parsed = parseInput(args.input);
    slug     = parsed.slugName;
    videoUrl = parsed.videoUrl || buildVideoUrl(slug, config.s3Bucket, config.s3Region);
    // NOTE: Don't set titleOverride from parser — parser gives lowercase "onegin",
    // OMDB/TMDB will return proper capitalized "Onegin". Only use parser as search query.
    if (!args.yearOverride && parsed.year) args.yearOverride = parsed.year;
    logger.log(`Video URL  : ${videoUrl}`);
    logger.log(`Qidiruv    : "${parsed.movieName}"${parsed.year ? ` (${parsed.year})` : ''}`);
  }

  // searchTitle: use explicit --title override, OR parsed movie name for search
  const searchTitle = args.titleOverride ||
    (args.input.startsWith('http') || !args.input.toLowerCase().endsWith('.mkv')
      ? (() => { const p = parseInput(args.input); return p.movieName || slug; })()
      : slug);
  const searchYear  = args.yearOverride;

  // ════════════════════════════════════════════════════
  // QADAM 2: Film ma'lumotlari  (parallel + fallback)
  // ════════════════════════════════════════════════════
  logger.step('2/5', 'FILM MA\'LUMOTLARI (OMDB / TMDB / IMDB)');

  const partial: Partial<MovieData> = {
    videoUrl,
    subtitles: subtitleTracks,
    type: 'movie',
    ageRating: 12,
    gallery: [],
  };

  // Try sources in order
  if (config.omdbKey) {
    logger.log('OMDB API orqali qidirilmoqda...');
    const { fetchFromOmdb: omdbFn } = await import('./imdb');
    const res = await omdbFn(searchTitle, searchYear, config.omdbKey);
    if (res) {
      Object.assign(partial, res);
      if ((res as any)._rated) partial.ageRating = ratedToAge((res as any)._rated);
      logger.ok(`OMDB: "${partial.title}" (${partial.year}) — ${partial.rating}/10`);
    }
  }

  if (!partial.title && config.tmdbKey) {
    logger.log('TMDB API orqali qidirilmoqda...');
    const res = await fetchFromTmdb(searchTitle, searchYear, config.tmdbKey);
    if (res) Object.assign(partial, res);
  }

  if (!partial.title) {
    logger.log('IMDB orqali qidirilmoqda...');
    const imdbId = await searchImdbId(searchTitle, searchYear);
    if (imdbId) {
      const res = await scrapeImdbPage(imdbId);
      if (res) Object.assign(partial, res);
    }
  }

  if (!partial.title) {
    logger.warn('Ma\'lumot topilmadi — asosiy ma\'lumotlar bilan davom etiladi.');
    partial.title       = args.titleOverride || searchTitle;
    partial.year        = searchYear || new Date().getFullYear();
    partial.description = '';
    partial.rating      = 0;
    partial.genres      = [];
    partial.cast        = [];
    partial.posterUrl   = '';
    partial.duration    = 0;
  }

  // Apply CLI overrides — only if explicitly passed via --title / --year flags
  // (not auto-derived from parser, which gives lowercase)
  if (args.titleOverride && process.argv.includes('--title')) partial.title = args.titleOverride;
  if (args.yearOverride  && process.argv.includes('--year'))  partial.year  = args.yearOverride;
  if (!partial.ageRating && partial.genres?.length) {
    partial.ageRating = estimateAgeRating(partial.genres);
  }

  // ════════════════════════════════════════════════════
  // QADAM 3: Parallel — Trailer + Rasmlar
  // ════════════════════════════════════════════════════
  logger.step('3/5', 'TRAILER + RASMLAR  (parallel)');

  const [trailerId, images] = await Promise.all([
    args.skipTrailer ? Promise.resolve<string | null>(null)
      : findTrailer(partial.title!, partial.year || 0, config.youtubeKey),

    args.skipImages ? Promise.resolve({ bannerUrl: '', gallery: [] as string[] })
      : getImages(partial.title!, partial.year, partial.posterUrl || '', config.tmdbKey),
  ]);

  if (trailerId) partial.trailerId = trailerId;
  if (images.bannerUrl) partial.bannerUrl = images.bannerUrl;
  if (images.gallery.length) partial.gallery = images.gallery;

  // ════════════════════════════════════════════════════
  // QADAM 4: Summary
  // ════════════════════════════════════════════════════
  logger.step('4/5', 'YIG\'ILGAN MA\'LUMOTLAR');
  logger.summary({
    title:        partial.title || '',
    year:         partial.year  || 0,
    rating:       partial.rating || 0,
    genres:       partial.genres || [],
    cast:         partial.cast  || [],
    duration:     partial.duration || 0,
    trailerId:    partial.trailerId,
    hasBanner:    !!partial.bannerUrl,
    galleryCount: (partial.gallery || []).length,
    videoUrl,
  });
  if (subtitleTracks.length) {
    logger.info('Subtitle', subtitleTracks.map(s => `${s.lang} (${s.label})`).join(', '));
  }

  if (args.dryRun) {
    logger.warn('--dry-run: Admin panelga YUBORILMADI.');
    return;
  }

  // ════════════════════════════════════════════════════
  // QADAM 5: Admin panelga qo'shish
  // ════════════════════════════════════════════════════
  logger.step('5/5', `ADMIN PANELGA QO'SHISH  (${config.adminMode})`);

  const fullData: MovieData = {
    title:       partial.title       || 'Unknown',
    year:        partial.year        || 0,
    description: partial.description || '',
    duration:    partial.duration    || 0,
    rating:      partial.rating      || 0,
    genres:      partial.genres      || [],
    cast:        partial.cast        || [],
    posterUrl:   partial.posterUrl   || '',
    bannerUrl:   partial.bannerUrl,
    gallery:     partial.gallery     || [],
    trailerId:   partial.trailerId,
    videoUrl,
    subtitles:   subtitleTracks,
    type:        partial.type        || 'movie',
    ageRating:   partial.ageRating   ?? 12,
    imdbId:      partial.imdbId,
    seasons:     partial.seasons,
    episodes:    partial.episodes,
  };

  const adminUrl = `${config.adminUrl}/pages/admin.html`;

  if (config.adminMode === 'playwright') {
    // ── Playwright mode ──────────────────────────────
    const pw = new PlaywrightAdminClient(config);
    try {
      await pw.launch();

      const genres    = await pw.getGenres();
      const genreIds  = pw.matchGenreIds(fullData.genres, genres);
      logger.ok(`${genreIds.length} ta janr moshlashtirildi`);

      if (args.updateId) {
        // Use API for update (more reliable)
        const api = new AdminAPIClient(config);
        await api.login();
        await api.updateMovie(args.updateId, fullData, genreIds);
        logger.ok(`Film yangilandi: ${args.updateId}`);
      } else {
        const existing = await pw.findExisting(fullData.title, fullData.year);
        if (existing) {
          logger.warn(`"${fullData.title}" allaqachon mavjud: ${existing}`);
          logger.warn(`Yangilash: --update ${existing}`);
          await pw.close();
          return;
        }
        const newId = await pw.fillAndSave(fullData, genreIds);
        if (newId) logger.ok(`Film yaratildi — ID: ${newId}`);
        else       logger.ok('Film yaratildi (ID aniqlanmadi — admin panelda tekshiring)');
      }
    } finally {
      await pw.close();
    }

  } else {
    // ── API mode ─────────────────────────────────────
    const api = new AdminAPIClient(config);
    await api.login();

    const genres   = await api.getGenres();
    const genreIds = api.matchGenreIds(fullData.genres, genres);
    logger.ok(`${genreIds.length} ta janr moshlashtirildi`);

    if (args.updateId) {
      await api.updateMovie(args.updateId, fullData, genreIds);
      logger.ok(`Film yangilandi: ${args.updateId}`);
    } else {
      const existing = await api.findExisting(fullData.title, fullData.year);
      if (existing) {
        logger.warn(`"${fullData.title}" allaqachon mavjud: ${existing}`);
        logger.warn(`Yangilash: --update ${existing}`);
        return;
      }
      const newId = await api.createMovie(fullData, genreIds);
      if (newId) logger.ok(`Film yaratildi — ID: ${newId}`);
    }
  }

  logger.done(videoUrl, adminUrl);
}

// ── Entry point ───────────────────────────────────────────────────────────────

main().catch((e: any) => {
  logger.error(`Xato: ${e.message}`);
  if (process.env.DEBUG === 'true') console.error(e.stack);
  process.exit(1);
});
