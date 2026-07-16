import { spawnSync, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ─── Turlar ───────────────────────────────────────────────────────────────────
export interface StreamInfo {
  index: number;
  codec_type: 'video' | 'audio' | 'subtitle' | 'data' | 'attachment';
  codec_name: string;
  width?: number;
  height?: number;
  tags?: { language?: string; title?: string };
}

export interface PreparedSubtitle {
  lang: string;       // qisqa kod: 'uz', 'ru', 'en'
  label: string;      // "O'zbek", "Русский"
  vttPath: string;    // lokal .vtt fayl yo'li
}

export interface PreparedMedia {
  isUrl: boolean;             // manba URL bo'lsa Bunny fetch ishlatamiz
  sourceUrl?: string;         // isUrl=true bo'lsa
  mp4Path?: string;           // isUrl=false bo'lsa — Bunny'ga yuklanadigan MP4
  subtitles: PreparedSubtitle[];
  audioCount: number;
}

// ─── 3-harf → 2-harf til kodi (Bunny srclang + admin panel uchun) ─────────────
const LANG3TO2: Record<string, string> = {
  uzb: 'uz', uze: 'uz', rus: 'ru', eng: 'en', fra: 'fr', fre: 'fr',
  deu: 'de', ger: 'de', tur: 'tr', ara: 'ar', hin: 'hi', zho: 'zh',
  chi: 'zh', spa: 'es', kor: 'ko', jpn: 'ja', ita: 'it', por: 'pt',
};
function shortLang(lang: string): string {
  const l = lang.toLowerCase();
  return LANG3TO2[l] || l.slice(0, 2);
}

function getLangLabel(lang: string, title?: string): string {
  // Avval til xaritasidan (ishonchli). Title teg ko'pincha reliz-guruh nomi
  // bo'ladi (masalan "cinematicauz") — shuning uchun faqat til topilmasa ishlatamiz.
  const map: Record<string, string> = {
    uz: "O'zbek", ru: 'Русский', en: 'English', fr: 'Français',
    de: 'Deutsch', tr: 'Türkçe', ar: 'العربية', hi: 'हिंदी',
    zh: '中文', es: 'Español', ko: '한국어', ja: '日本語',
    it: 'Italiano', pt: 'Português',
  };
  const s = shortLang(lang);
  if (map[s]) return map[s];
  if (title && title.length < 30) return title;
  return lang.toUpperCase();
}

function isTextSubtitle(codec: string): boolean {
  return ['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text'].includes(codec.toLowerCase());
}

// ─── Hardware encoder avtomatik aniqlash (CFR re-encode uchun) ─────────────────
// GPU/iGPU bo'lsa avtomatik ishlatadi (NVENC/QSV/AMF), bo'lmasa libx264 (CPU).
type HWEncoder = 'h264_nvenc' | 'h264_qsv' | 'h264_amf' | 'libx264';
let _cachedEncoder: HWEncoder | null = null;

function detectEncoder(): HWEncoder {
  if (_cachedEncoder) return _cachedEncoder;
  // 640x360 — QSV/AMF minimal o'lcham talablarini qondiradi (128x72 juda kichik)
  for (const enc of ['h264_nvenc', 'h264_qsv', 'h264_amf'] as HWEncoder[]) {
    const r = spawnSync('ffmpeg', [
      '-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=size=640x360:rate=25',
      '-t', '0.5', '-c:v', enc, '-f', 'null', '-',
    ], { encoding: 'utf8' });
    if (r.status === 0) { _cachedEncoder = enc; return enc; }
  }
  _cachedEncoder = 'libx264';
  return 'libx264';
}

// CFR re-encode uchun encoder argumentlari (sifat ~ Bunny'ga kirish uchun yetarli)
function cfrVideoArgs(enc: HWEncoder): string[] {
  switch (enc) {
    case 'h264_nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '21', '-fps_mode', 'cfr', '-pix_fmt', 'yuv420p'];
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-global_quality', '21', '-fps_mode', 'cfr', '-pix_fmt', 'nv12'];
    case 'h264_amf':
      return ['-c:v', 'h264_amf', '-rc', 'cqp', '-qp_i', '21', '-qp_p', '21', '-quality', 'speed', '-fps_mode', 'cfr', '-pix_fmt', 'yuv420p'];
    default:
      return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-fps_mode', 'cfr', '-pix_fmt', 'yuv420p'];
  }
}

// ─── ffprobe ──────────────────────────────────────────────────────────────────
function ffprobe(input: string): { streams: StreamInfo[] } {
  const result = spawnSync('ffprobe', [
    '-v', 'quiet', '-print_format', 'json', '-show_streams', input,
  ], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });

  if (result.error) {
    throw new Error(`ffprobe topilmadi yoki ishlamadi: ${result.error.message}`);
  }
  if (!result.stdout) throw new Error('ffprobe bo\'sh natija qaytardi');
  return JSON.parse(result.stdout);
}

// ─── FFmpeg progress bilan ishga tushirish ────────────────────────────────────
function runFFmpeg(args: string[], label: string, stallSec = 300, outPath?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn('ffmpeg', ['-y', ...args]);
    let lastErr = '';
    let lastProgressAt = Date.now();
    let lastTickAt = Date.now();
    let lastSize = 0;

    const watchdog = setInterval(() => {
      const now = Date.now();
      // Uyqu (Modern Standby) aniqlash: interval ticklari orasida katta sakrash
      // bo'lsa — tizim uxlagan, ffmpeg ham muzlatilgan edi. Bu qotish EMAS,
      // taymerni tiklaymiz (aks holda uyg'onishda darhol noto'g'ri o'ldiradi).
      if (now - lastTickAt > 30_000) lastProgressAt = now;
      lastTickAt = now;

      // Chiqish fayli o'sayotgan bo'lsa — bu ham progress (stderr kechiksa ham)
      if (outPath) {
        try {
          const size = fs.statSync(outPath).size;
          if (size > lastSize) { lastSize = size; lastProgressAt = now; }
        } catch { /* fayl hali yaratilmagan */ }
      }

      const idle = Math.floor((now - lastProgressAt) / 1000);
      if (idle >= stallSec) {
        clearInterval(watchdog);
        proc.kill('SIGKILL');
        reject(new Error(`FFmpeg "${label}" ${stallSec}s progress yo'q — to'xtatildi`));
      }
    }, 5_000);

    proc.stderr?.on('data', (buf: Buffer) => {
      const line = buf.toString();
      lastErr = line;
      const t = line.match(/time=(\d+:\d+:\d+)/);
      const sp = line.match(/speed=\s*([\d.]+)x/);
      if (t) {
        lastProgressAt = Date.now();
        const speed = sp ? ` | ${sp[1]}x` : '';
        process.stdout.write(`\r  ⣾ ${label}: ${t[1]}${speed}          `);
      }
    });

    proc.on('close', (code) => {
      clearInterval(watchdog);
      process.stdout.write('\n');
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg xato (kod ${code}): ${lastErr.slice(-200)}`));
    });
    proc.on('error', (err) => {
      clearInterval(watchdog);
      reject(new Error(`FFmpeg ishga tushmadi: ${err.message}`));
    });
  });
}

// ─── VFR (variable frame rate) aniqlash ───────────────────────────────────────
// Bunny VFR + ko'p audio bo'lsa qo'shimcha audio treklarni TASHLAYDI.
// Shuning uchun ko'p audioli VFR manbalarni CFR'ga re-encode qilishimiz kerak.
// Birinchi ~400 video paketning vaqt oralig'ini o'lchaymiz (decode yo'q — tez).
function isVFR(input: string): boolean {
  // Fayl bo'ylab bir necha nuqtadan paket vaqtlarini olamiz (decode yo'q — tez)
  const r = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'packet=pts_time',
    '-read_intervals', '%+#250,00:15:00%+#200,00:35:00%+#200,00:55:00%+#200',
    '-of', 'csv=p=0', input,
  ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 60_000 });
  if (r.status !== 0 || !r.stdout) return false;
  const times = r.stdout.trim().split('\n')
    .map(parseFloat).filter(n => !isNaN(n)).sort((a, b) => a - b);
  if (times.length < 50) return false;

  // Frame oraliqlarini ms aniqlikda yaxlitlab, eng ko'p uchragan qiymatning
  // ulushini hisoblaymiz. Toza CFR'da bitta oraliq ~100% bo'ladi; VFR'da
  // ikki yoki undan ko'p oraliq almashinadi (Bunny ham shuni VFR deb biladi).
  const freq: Record<string, number> = {};
  let n = 0;
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d > 0 && d < 1) { freq[d.toFixed(3)] = (freq[d.toFixed(3)] || 0) + 1; n++; }
  }
  if (n < 30) return false;
  const top = Math.max(...Object.values(freq));
  // Eng ko'p oraliq 90%dan kam bo'lsa → VFR (bir xil emas)
  return top / n < 0.90;
}

// ─── Subtitle ajratish (.vtt) ──────────────────────────────────────────────────
function extractSubtitle(input: string, subIdx: number, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawnSync('ffmpeg', [
      '-y', '-i', input, '-map', `0:s:${subIdx}`, outPath,
    ], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, timeout: 120_000 });
    if (proc.error) return reject(proc.error);
    if (proc.status !== 0) return reject(new Error(proc.stderr?.slice(-160) || 'subtitle xato'));
    resolve();
  });
}

// ─── ASOSIY: manbani Bunny uchun tayyorlash ────────────────────────────────────
// Lokal fayl  → MP4 remux (video copy, audio AAC — ENCODE YO'Q) + subtitle .vtt
// URL         → Bunny fetch (video bulutda), subtitle URL'dan best-effort
export async function prepareMedia(input: string, outputDir: string): Promise<PreparedMedia> {
  fs.mkdirSync(outputDir, { recursive: true });
  const isUrl = /^https?:\/\//i.test(input);

  console.log('  🔍 Manba tahlil qilinmoqda...');
  let probe: { streams: StreamInfo[] };
  try {
    probe = ffprobe(input);
  } catch (e) {
    if (isUrl) {
      // URL probe ishlamasa — Bunny fetch baribir ishlaydi, subtitlesiz davom etamiz
      console.log(`  ⚠️  URL tahlili o'tmadi (${(e as Error).message.slice(0, 60)}) — Bunny fetch davom etadi, subtitle qo'lda kerak bo'lishi mumkin`);
      return { isUrl: true, sourceUrl: input, subtitles: [], audioCount: 0 };
    }
    throw e;
  }

  const videoStreams = probe.streams.filter(s => s.codec_type === 'video' && !['mjpeg', 'png', 'bmp'].includes(s.codec_name));
  const audioStreams = probe.streams.filter(s => s.codec_type === 'audio');
  const subStreams   = probe.streams.filter(s => s.codec_type === 'subtitle');
  const textSubs     = subStreams.filter(s => isTextSubtitle(s.codec_name));

  if (!videoStreams.length) throw new Error('Video stream topilmadi');

  const v = videoStreams[0];
  console.log(`  ✅ Video: ${v.width || '?'}x${v.height || '?'} | ${v.codec_name.toUpperCase()}`);
  console.log(`  ✅ Audio: ${audioStreams.length} ta (${audioStreams.map(a => a.tags?.language || 'unk').join(', ')})`);
  console.log(`  ℹ️  Subtitle: ${subStreams.length} ta (matn: ${textSubs.length}, rasm: ${subStreams.length - textSubs.length})`);

  // ── 1. Subtitlelarni .vtt ga ajratish ──────────────────────────────────────
  const subtitles: PreparedSubtitle[] = [];
  let subIdx = 0;
  for (const s of subStreams) {
    if (isTextSubtitle(s.codec_name)) {
      const raw = s.tags?.language || `sub${subIdx}`;
      const lang = shortLang(raw);
      const vttPath = path.join(outputDir, `sub_${lang}_${subIdx}.vtt`);
      try {
        await extractSubtitle(input, subIdx, vttPath);
        if (fs.existsSync(vttPath) && fs.statSync(vttPath).size > 0) {
          subtitles.push({ lang, label: getLangLabel(raw, s.tags?.title), vttPath });
          console.log(`  ✅ Subtitle: ${raw} → ${lang}`);
        }
      } catch (e) {
        console.log(`  ⚠️  Subtitle ${raw} skip (${(e as Error).message.slice(0, 50)})`);
      }
    } else {
      console.log(`  ⚠️  Subtitle ${s.tags?.language || '?'} skip (${s.codec_name} — rasm formatida)`);
    }
    subIdx++;
  }

  // URL bo'lsa: subtitle ajratdik (agar ffprobe o'tgan bo'lsa), videoni Bunny fetch qiladi
  if (isUrl) {
    return { isUrl: true, sourceUrl: input, subtitles, audioCount: audioStreams.length };
  }

  // ── 2. Lokal fayl: MP4 ga remux (video COPY = encode yo'q, audio AAC) ───────
  // Bunny baribir o'zi 3 sifatga encode qiladi — bizning vazifamiz toza,
  // ko'p-audioli MP4 berish. Video qayta encode QILINMAYDI (faqat copy).
  const mp4Path = path.join(outputDir, 'source.mp4');

  // Qayta urinish: mavjud to'liq MP4 bo'lsa, remux'ni o'tkazib yuboramiz
  if (fs.existsSync(mp4Path) && fs.statSync(mp4Path).size > 0) {
    try {
      const p2 = ffprobe(mp4Path);
      if (p2.streams.some(s => s.codec_type === 'video')) {
        const sizeMB = (fs.statSync(mp4Path).size / 1048576).toFixed(0);
        console.log(`\n  ♻️  Mavjud MP4 topildi (${sizeMB} MB) — remux o'tkazib yuborildi`);
        return { isUrl: false, mp4Path, subtitles, audioCount: audioStreams.length };
      }
    } catch { /* buzuq — qayta remux qilamiz */ }
  }

  // VFR + ko'p audio → Bunny qo'shimcha audio'ni tashlaydi. Shu holdagina
  // videoni CFR'ga re-encode qilamiz (multi-audio saqlanishi uchun). Aks holda copy.
  const multiAudio = audioStreams.length >= 2;
  const needsCfr = multiAudio && isVFR(input);

  let videoArgs: string[];
  if (needsCfr) {
    const enc = detectEncoder();
    videoArgs = cfrVideoArgs(enc);
    const label = enc === 'libx264' ? 'libx264 (CPU)' : `${enc} (GPU ⚡)`;
    console.log('\n  ⚠️  VFR + ko\'p audio aniqlandi → video CFR\'ga re-encode qilinadi');
    console.log(`     Encoder: ${label} (multi-audio saqlanishi uchun shart)`);
  } else {
    videoArgs = ['-c:v', 'copy'];
    console.log('\n  📦 MP4 remux (video copy — encode yo\'q)...');
  }

  const remuxArgs = [
    '-i', input,
    '-map', '0:v:0',
    '-map', '0:a',            // BARCHA audio treklar
    ...videoArgs,             // copy YOKI CFR re-encode (VFR+multi-audio bo'lsa)
    '-c:a', 'aac', '-b:a', '192k',  // audio AAC (tez, MP4-mos, Bunny ham AAC kutadi)
    '-movflags', '+faststart',
    mp4Path,
  ];
  try {
    await runFFmpeg(remuxArgs, needsCfr ? 'CFR re-encode' : 'MP4 remux', 300, mp4Path);
  } catch (e) {
    // Ba'zi video kodeklar MP4 ga copy bo'lmaydi (masalan VP9/AV1) — fallback: faqat audio bilan to'liq remux ham urinib ko'rmaymiz, xato beramiz
    throw new Error(`MP4 remux xato: ${(e as Error).message.slice(0, 120)}`);
  }
  const sizeMB = (fs.statSync(mp4Path).size / 1048576).toFixed(0);
  console.log(`  ✅ MP4 tayyor: ${sizeMB} MB (${audioStreams.length} audio trek)`);

  return { isUrl: false, mp4Path, subtitles, audioCount: audioStreams.length };
}
