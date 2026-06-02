// ============================================================
//  FARS v2 — MKV → HLS → S3
//  TypeScript replacement for convert-and-upload.ps1
//
//  Chiqish strukturasi (PowerShell script bilan mos):
//    hls_output/{slug}/
//      master.m3u8
//      stream_0/         ← video
//        playlist.m3u8
//        seg_000.ts ...
//      stream_Uzbek/     ← audio (har bir til uchun)
//        playlist.m3u8
//        seg_000.ts ...
//      sub_uzb.vtt       ← subtitle VTT
//      sub_uzb.m3u8      ← subtitle playlist
// ============================================================

import { spawn }        from 'child_process';
import * as fs          from 'fs';
import * as path        from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import pLimit           from 'p-limit';
import * as logger      from './logger';
import { FarsConfig, StreamInfo, AudioStreamInfo, SubStreamInfo, HlsOutput, HlsSubtitle, ParsedFileName } from './types';

// ── File-name parser ──────────────────────────────────────────────────────────

/**
 * Parse MKV file name into { name, year, slug }.
 *
 * Handles:
 *   "Onegin1999.mkv"              → name="Onegin"         year="1999"
 *   "Onegin.1999.mkv"             → name="Onegin"         year="1999"
 *   "Onegin (1999).mkv"           → name="Onegin"         year="1999"
 *   "The.Dark.Knight.2008.mkv"    → name="The Dark Knight" year="2008"
 *   "Parasite.2019.1080p.WEB.mkv" → name="Parasite"       year="2019"
 */
export function parseFileName(filePath: string): ParsedFileName {
  const base = path.basename(filePath, path.extname(filePath));

  // Remove common quality/source tags (case-insensitive)
  const cleaned = base
    .replace(/\b(1080p|720p|480p|2160p|4k|uhd|bluray|blu-ray|bdrip|webrip|web-dl|web|hdtv|dvdrip|dvd|hdrip|hevc|x264|x265|avc|xvid|ac3|dts|aac|multi|extended|repack|proper|internal|readnfo|retail|limited)\b/gi, '')
    .replace(/\[.*?\]/g, '')   // remove [text]
    .replace(/\((?!\d{4}\))[^)]*\)/g, '') // remove (text) but NOT (1999)
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Find 4-digit year
  const yearRe = /[.\s_\-\(]?(\d{4})[.\s_\-\)]?/g;
  let year = '';
  let yearPos = -1;
  let m: RegExpExecArray | null;

  while ((m = yearRe.exec(cleaned)) !== null) {
    const y = parseInt(m[1]);
    if (y >= 1900 && y <= 2030) {
      year = m[1];
      yearPos = m.index;
      break;
    }
  }

  // Everything before the year is the name
  let namePart = yearPos >= 0 ? cleaned.slice(0, yearPos) : cleaned;

  // Replace separators with spaces
  namePart = namePart
    .replace(/[.\-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Capitalise first letter of each word
  const name = namePart
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  // Slug: lowercase letters/digits only, with dashes
  const slugBase = namePart.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const slug = year ? `${slugBase}${year}` : slugBase;

  return { name, year, slug, originalPath: filePath };
}

// ── Language helpers ──────────────────────────────────────────────────────────

function langName(code: string): string {
  const map: Record<string, string> = {
    uzb: 'Uzbek', uz: 'Uzbek',
    eng: 'English', en: 'English',
    rus: 'Russian', ru: 'Russian',
    tur: 'Turkish', tr: 'Turkish',
    kaz: 'Kazakh', tgk: 'Tajik',
    ara: 'Arabic', fra: 'French', fre: 'French',
    spa: 'Spanish', deu: 'German', ger: 'German',
    kor: 'Korean', jpn: 'Japanese',
    zho: 'Chinese', chi: 'Chinese',
  };
  return map[code] || (code ? code.toUpperCase() : 'Audio');
}

function langLabel(code: string): string {
  const map: Record<string, string> = {
    uz: "O'zbek", ru: 'Rus', en: 'Ingliz', tr: 'Turk',
    kz: 'Qozoq', ar: 'Arab', fr: 'Frantsuz',
    de: 'Nemis', ko: 'Koreys', ja: 'Yapon', zh: 'Xitoy',
  };
  const short = code.slice(0, 2).toLowerCase();
  return map[short] || code.toUpperCase();
}

// Estimate bandwidth from video height
function estimateBandwidth(h: number): number {
  if (h >= 2160) return 15_000_000;
  if (h >= 1080) return  8_000_000;
  if (h >=  720) return  5_000_000;
  if (h >=  480) return  2_500_000;
  return 1_500_000;
}

// ── FFprobe ───────────────────────────────────────────────────────────────────

export async function getStreamInfo(mkvPath: string, cfg: FarsConfig): Promise<StreamInfo> {
  const json = await runCmd(cfg.ffprobePath, [
    '-v', 'quiet', '-print_format', 'json', '-show_streams', mkvPath,
  ]);
  const probe = JSON.parse(json);
  const streams: any[] = probe.streams || [];

  const video = streams.find(s => s.codec_type === 'video');
  if (!video) throw new Error('Video stream topilmadi');

  const rawAudio = streams.filter(s => s.codec_type === 'audio');
  if (!rawAudio.length) throw new Error('Audio stream topilmadi');

  const SUBTITLE_CODECS = ['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'hdmv_pgs_subtitle'];
  const rawSub = streams.filter(s => s.codec_type === 'subtitle' && SUBTITLE_CODECS.includes(s.codec_name));

  // Build audio list with dedup names
  const usedNames: Record<string, number> = {};
  const audioStreams: AudioStreamInfo[] = rawAudio.map((s, i) => {
    const code = s.tags?.language || 'und';
    let nm = langName(code);
    if (usedNames[nm] != null) {
      usedNames[nm]++;
      nm = `${nm}_${usedNames[nm]}`;
    } else {
      usedNames[nm] = 0;
    }
    return { index: i, langCode: code, langName: nm, codecName: s.codec_name };
  });

  const usedSubNames: Record<string, number> = {};
  const subStreams: SubStreamInfo[] = rawSub.map((s, i) => {
    const code = s.tags?.language || 'und';
    let nm = langName(code);
    if (usedSubNames[nm] != null) {
      usedSubNames[nm]++;
      nm = `${nm}_${usedSubNames[nm]}`;
    } else {
      usedSubNames[nm] = 0;
    }
    return { index: i, langCode: code, langName: nm, codecName: s.codec_name };
  });

  const vW = video.width  || 1920;
  const vH = video.height || 1080;

  // Duration: try video stream, then any stream
  const durRaw = parseFloat(video.duration || streams[0]?.duration || '0');
  const durationSec = isNaN(durRaw) ? 7200 : Math.ceil(durRaw);

  return {
    durationSec,
    videoWidth: vW,
    videoHeight: vH,
    audioStreams,
    subStreams,
    bandwidth: estimateBandwidth(vH),
  };
}

// ── FFmpeg HLS conversion ─────────────────────────────────────────────────────

export async function convertToHls(
  mkvPath: string,
  outDir: string,
  info: StreamInfo,
  cfg: FarsConfig,
  onProgress?: (pct: number, speed: string, eta: string) => void
): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true });

  // Build -map args
  const mapArgs = ['-map', '0:v:0'];
  info.audioStreams.forEach(a => mapArgs.push('-map', `0:a:${a.index}`));

  // Build var_stream_map
  const varParts = ['v:0,agroup:aud'];
  info.audioStreams.forEach((a, i) => {
    const def = i === 0 ? ',default:yes' : '';
    const langPart = a.langCode && a.langCode !== 'und' ? `,language:${a.langCode}` : '';
    varParts.push(`a:${i},agroup:aud${langPart},name:${a.langName}${def}`);
  });
  const varStreamMap = varParts.join(' ');

  const segPattern = path.join(outDir, 'stream_%v', 'seg_%03d.ts');
  const plPattern  = path.join(outDir, 'stream_%v', 'playlist.m3u8');

  const args = [
    '-y', '-i', mkvPath,
    ...mapArgs,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
    '-f', 'hls',
    '-hls_time', '6',
    '-hls_playlist_type', 'vod',
    '-master_pl_name', 'master.m3u8',
    '-var_stream_map', varStreamMap,
    '-hls_segment_filename', segPattern,
    plPattern,
  ];

  logger.log(`FFmpeg ishga tushirilmoqda...`);
  logger.log(`Audio: ${info.audioStreams.map(a => a.langName).join(', ')}`);

  await runFfmpeg(cfg.ffmpegPath, args, info.durationSec, onProgress);
}

// ── Subtitle extraction ───────────────────────────────────────────────────────

export async function extractSubtitles(
  mkvPath: string,
  outDir: string,
  info: StreamInfo,
  cfg: FarsConfig
): Promise<HlsSubtitle[]> {
  if (!info.subStreams.length) {
    logger.log('Subtitle topilmadi — o\'tkazib yuborildi.');
    return [];
  }

  const results: HlsSubtitle[] = [];
  const usedLangs: Record<string, number> = {};

  for (const sub of info.subStreams) {
    const code = sub.langCode;
    const lk = usedLangs[code] != null
      ? `${code}_${++usedLangs[code]}`
      : (usedLangs[code] = 0, code);

    const vttName  = `sub_${lk}.vtt`;
    const m3u8Name = `sub_${lk}.m3u8`;
    const vttPath  = path.join(outDir, vttName);
    const m3u8Path = path.join(outDir, m3u8Name);

    logger.log(`Subtitle [${sub.index}] ${code} → ${vttName}`);

    let ok = await tryExtractSub(mkvPath, sub.index, vttPath, cfg.ffmpegPath);

    // Retry with CP1251 for Cyrillic SRT
    if (!ok) {
      logger.warn(`CP1251 bilan qayta urinilmoqda...`);
      ok = await tryExtractSub(mkvPath, sub.index, vttPath, cfg.ffmpegPath, true);
    }

    if (!ok) {
      logger.warn(`${vttName} yaratilmadi — o\'tkazib yuborildi.`);
      continue;
    }

    // Write companion .m3u8 playlist
    const dur = info.durationSec;
    const m3u8Content = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      `#EXT-X-TARGETDURATION:${dur}`,
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      `#EXTINF:${dur}.000,`,
      vttName,
      '#EXT-X-ENDLIST',
      '',
    ].join('\n');
    fs.writeFileSync(m3u8Path, m3u8Content, 'ascii');

    results.push({
      lang: lk,
      langName: langName(code),
      langCode: code,
      vttPath,
      m3u8Path,
      vttKey: ``, // filled later
      m3u8Key: ``,
    });

    logger.ok(`${vttName}  (${(fs.statSync(vttPath).size / 1024).toFixed(1)} KB)`);
  }

  logger.ok(`${results.length} ta subtitle tayyor.`);
  return results;
}

async function tryExtractSub(
  mkvPath: string,
  idx: number,
  outPath: string,
  ffmpeg: string,
  cp1251 = false
): Promise<boolean> {
  try {
    const args = ['-y', '-i', mkvPath, '-map', `0:s:${idx}`];
    if (cp1251) args.push('-sub_charenc', 'CP1251');
    args.push(outPath);
    await runCmd(ffmpeg, args);
    return fs.existsSync(outPath) && fs.statSync(outPath).size > 20;
  } catch {
    return false;
  }
}

// ── Master M3U8 generator ─────────────────────────────────────────────────────

export function generateMaster(
  outDir: string,
  info: StreamInfo,
  subtitles: HlsSubtitle[]
): void {
  const lines: string[] = ['#EXTM3U', '#EXT-X-VERSION:3', ''];

  // Audio media entries
  info.audioStreams.forEach((a, i) => {
    const def = i === 0 ? 'YES' : 'NO';
    const langAttr = a.langCode && a.langCode !== 'und' ? `,LANGUAGE="${a.langCode}"` : '';
    lines.push(
      `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="${a.langName}",` +
      `DEFAULT=${def},AUTOSELECT=YES${langAttr},CHANNELS="2",` +
      `URI="stream_${a.langName}/playlist.m3u8"`
    );
  });

  // Subtitle media entries
  let subAttr = '';
  if (subtitles.length > 0) {
    subAttr = ',SUBTITLES="sub"';
    subtitles.forEach(s => {
      const code = s.langCode && s.langCode !== 'und' ? `,LANGUAGE="${s.langCode}"` : '';
      lines.push(
        `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub",NAME="${s.langName}",` +
        `DEFAULT=NO,AUTOSELECT=YES${code},URI="sub_${s.lang}.m3u8"`
      );
    });
  }

  lines.push('');

  // Video stream-inf
  const bw = info.bandwidth;
  const res = `${info.videoWidth}x${info.videoHeight}`;
  lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bw},RESOLUTION=${res},AUDIO="aud"${subAttr}`);
  lines.push('stream_0/playlist.m3u8');

  const masterPath = path.join(outDir, 'master.m3u8');
  fs.writeFileSync(masterPath, lines.join('\n') + '\n', 'ascii');
  logger.ok(`master.m3u8 tayyor  (${res}, ${(bw / 1_000_000).toFixed(1)} Mbps, ${info.audioStreams.length} audio, ${subtitles.length} sub)`);
}

// ── S3 Upload ─────────────────────────────────────────────────────────────────

function getContentType(filename: string): string {
  if (filename.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (filename.endsWith('.ts'))   return 'video/mp2t';
  if (filename.endsWith('.vtt'))  return 'text/vtt';
  return 'application/octet-stream';
}

function walkDir(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      files.push(...walkDir(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

export async function uploadToS3(
  outDir: string,
  slug: string,
  cfg: FarsConfig,
  onProgress?: (done: number, total: number) => void
): Promise<string> {
  const client = new S3Client({
    region: cfg.s3Region,
    credentials: {
      accessKeyId: cfg.awsAccessKeyId,
      secretAccessKey: cfg.awsSecretAccessKey,
    },
  });

  // First, delete old files at this prefix
  logger.log(`S3: ${slug}/ papkasi tozalanmoqda...`);
  const { S3Client: _, ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  const listCmd = new ListObjectsV2Command({ Bucket: cfg.s3Bucket, Prefix: `${slug}/` });
  const existing = await client.send(listCmd);
  if (existing.Contents && existing.Contents.length > 0) {
    const delCmd = new DeleteObjectsCommand({
      Bucket: cfg.s3Bucket,
      Delete: { Objects: existing.Contents.map(o => ({ Key: o.Key! })) },
    });
    await client.send(delCmd);
    logger.log(`  ${existing.Contents.length} ta eski fayl o'chirildi.`);
  }

  // Collect all output files
  const allFiles = walkDir(outDir);
  const total = allFiles.length;
  let done = 0;

  logger.log(`S3 ga ${total} ta fayl yuklanmoqda (10 ta parallel)...`);
  const limit = pLimit(10);

  const tasks = allFiles.map(localPath =>
    limit(async () => {
      // S3 key = slug/ + relative path from outDir (use forward slashes)
      const rel = path.relative(outDir, localPath).replace(/\\/g, '/');
      const key = `${slug}/${rel}`;
      const ct  = getContentType(path.basename(localPath));

      await client.send(new PutObjectCommand({
        Bucket: cfg.s3Bucket,
        Key: key,
        Body: fs.createReadStream(localPath),
        ContentType: ct,
        CacheControl: ct === 'application/vnd.apple.mpegurl' ? 'no-cache' : 'max-age=31536000',
      }));

      done++;
      if (onProgress) onProgress(done, total);

      // Inline progress every 10 files
      if (done % 10 === 0 || done === total) {
        process.stdout.write(`\r   Yuklanmoqda... ${done}/${total} fayl`);
      }
    })
  );

  await Promise.all(tasks);
  process.stdout.write('\n');

  const url = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${slug}/master.m3u8`;
  return url;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function convertAndUpload(
  mkvPath: string,
  slug: string,
  cfg: FarsConfig
): Promise<{ s3Url: string; subtitles: Array<{ lang: string; label: string; url: string }> }> {
  const outDir = path.join(cfg.outputDir, slug);

  if (fs.existsSync(outDir)) {
    logger.log(`Eski chiqim papkasi tozalanmoqda: ${outDir}`);
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Probe
  logger.step('A/3', 'MKV TAHLIL');
  const info = await getStreamInfo(mkvPath, cfg);
  logger.ok(`Video  : ${info.videoWidth}x${info.videoHeight}`);
  logger.ok(`Audio  : ${info.audioStreams.length} ta (${info.audioStreams.map(a => a.langName).join(', ')})`);
  logger.ok(`Sub    : ${info.subStreams.length} ta`);
  logger.ok(`Davom. : ${Math.floor(info.durationSec / 60)} daqiqa`);

  // 2. Convert to HLS
  logger.step('B/3', 'HLS KONVERTATSIYA  (bir necha daqiqa kutish mumkin)');

  let lastPct = -1;
  await convertToHls(mkvPath, outDir, info, cfg, (pct, speed, eta) => {
    const p = Math.floor(pct);
    if (p !== lastPct && p % 5 === 0) {
      process.stdout.write(`\r   Progress: ${p}%  speed: ${speed}  qoldi: ${eta}    `);
      lastPct = p;
    }
  });
  process.stdout.write('\n');
  logger.ok('HLS segmentlar tayyor.');

  // 3. Subtitles
  logger.step('C/3', 'SUBTITLE CHIQARISH');
  const subs = await extractSubtitles(mkvPath, outDir, info, cfg);

  // Overwrite master.m3u8 with our custom one (includes audio + subtitle tracks)
  generateMaster(outDir, info, subs);

  // 4. Upload
  logger.step('D/3', 'S3 GA YUKLASH');
  const s3Url = await uploadToS3(outDir, slug, cfg);
  logger.ok(`S3 URL: ${s3Url}`);

  // Build subtitle track objects for the movie record
  const subtitleTracks = subs.map(s => ({
    lang: s.langCode.slice(0, 2),
    label: langLabel(s.langCode),
    url: `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${slug}/sub_${s.lang}.vtt`,
  }));

  return { s3Url, subtitles: subtitleTracks };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function runCmd(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const proc = spawn(bin, args);
    proc.stdout.on('data', d => chunks.push(d));
    proc.stderr.on('data', () => {}); // suppress
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`${bin} exit code ${code}`));
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    proc.on('error', reject);
  });
}

function parseFfmpegTime(line: string): number | null {
  const m = line.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
  if (!m) return null;
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 100;
}

function formatEta(seconds: number): string {
  if (seconds < 0 || !isFinite(seconds)) return '?';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}s ${m}d`;
  if (m > 0) return `${m}d ${s}s`;
  return `${s}s`;
}

function runFfmpeg(
  bin: string,
  args: string[],
  totalSec: number,
  onProgress?: (pct: number, speed: string, eta: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    let stderr = '';

    proc.stderr.on('data', (chunk: Buffer) => {
      const line = chunk.toString();
      stderr += line;

      if (onProgress && totalSec > 0) {
        const currentSec = parseFfmpegTime(line);
        if (currentSec !== null) {
          const pct = Math.min((currentSec / totalSec) * 100, 99.9);
          const speedM = line.match(/speed=\s*(\S+)/);
          const speed = speedM ? speedM[1] : '?';
          const speedVal = parseFloat(speed);
          const remaining = isNaN(speedVal) || speedVal <= 0
            ? 0
            : (totalSec - currentSec) / speedVal;
          onProgress(pct, speed, formatEta(remaining));
        }
      }
    });

    proc.on('close', code => {
      if (code !== 0) {
        const msg = stderr.slice(-500);
        return reject(new Error(`FFmpeg xatosi (exit ${code}):\n${msg}`));
      }
      resolve();
    });
    proc.on('error', reject);
  });
}
