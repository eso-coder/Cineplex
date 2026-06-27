import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import axios from 'axios';
import * as tus from 'tus-js-client';
import { PreparedMedia } from './converter';

const API_BASE = 'https://video.bunnycdn.com';

interface BunnyCfg { libraryId: string; apiKey: string; cdn: string; }

function cfg(): BunnyCfg {
  const libraryId = process.env.BUNNY_LIBRARY_ID;
  const apiKey    = process.env.BUNNY_API_KEY;
  const cdn       = process.env.BUNNY_CDN_HOSTNAME;
  if (!libraryId) throw new Error('BUNNY_LIBRARY_ID .env da yo\'q');
  if (!apiKey)    throw new Error('BUNNY_API_KEY .env da yo\'q');
  if (!cdn)       throw new Error('BUNNY_CDN_HOSTNAME .env da yo\'q');
  return { libraryId, apiKey, cdn: cdn.replace(/^https?:\/\//, '').replace(/\/$/, '') };
}

function headers(apiKey: string, json = true) {
  return {
    AccessKey: apiKey,
    accept: 'application/json',
    ...(json ? { 'content-type': 'application/json' } : {}),
  };
}

export interface BunnyResult {
  guid: string;
  playlistUrl: string;        // master HLS (admin #mf-video-url ga)
  subtitleUrls: Array<{ lang: string; label: string; url: string }>;
}

// ─── 1. Video yozuvini yaratish (GUID olish) ──────────────────────────────────
async function createVideo(c: BunnyCfg, title: string): Promise<string> {
  const r = await axios.post(
    `${API_BASE}/library/${c.libraryId}/videos`,
    { title },
    { headers: headers(c.apiKey) },
  );
  const guid = r.data?.guid;
  if (!guid) throw new Error('Bunny createVideo: guid qaytmadi');
  return guid;
}

// ─── 2a. Lokal MP4 ni yuklash — TUS resumable (uzilsa davom etadi + retry) ────
async function uploadFile(c: BunnyCfg, guid: string, filePath: string, title: string): Promise<void> {
  const total = fs.statSync(filePath).size;
  // Bunny TUS imzosi: sha256(libraryId + apiKey + expire + videoGuid)
  const expire = Math.floor(Date.now() / 1000) + 24 * 3600;  // 24 soat amal qiladi
  const signature = crypto.createHash('sha256')
    .update(c.libraryId + c.apiKey + expire + guid)
    .digest('hex');

  // Resume uchun: upload URL'ni diskda saqlaymiz (jarayon o'lsa, qayta ishga
  // tushganda shu fingerprint bo'yicha topib davom etadi)
  const storePath = path.join(path.dirname(filePath), '.tus-store.json');

  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    let lastPct = -1;
    const upload = new tus.Upload(stream, {
      endpoint: 'https://video.bunnycdn.com/tusupload',
      // Uzilganda avtomatik qayta urinish (EPROTO/tarmoq uzilishi uchun)
      retryDelays: [0, 3000, 5000, 10000, 20000, 30000, 60000, 60000, 120000],
      headers: {
        AuthorizationSignature: signature,
        AuthorizationExpire: String(expire),
        VideoId: guid,
        LibraryId: c.libraryId,
      },
      chunkSize: 25 * 1024 * 1024,   // 25MB bo'laklar — uzilsa shu bo'lakdan davom (beqaror internet uchun kichikroq)
      uploadSize: total,
      metadata: { filetype: 'video/mp4', title },
      // ── Cross-process resume ──
      urlStorage: new (tus as any).FileUrlStorage(storePath),
      fingerprint: () => Promise.resolve(`bunny-${guid}`),
      storeFingerprintForResuming: true,
      removeFingerprintOnSuccess: true,
      onError: (err: Error) => reject(new Error(`TUS upload xato: ${err.message.slice(0, 120)}`)),
      onProgress: (sent: number, totalBytes: number) => {
        const pct = Math.floor((sent / totalBytes) * 100);
        if (pct !== lastPct) {
          lastPct = pct;
          process.stdout.write(`\r  ⬆ Bunny'ga upload: ${pct}% (${(sent/1048576).toFixed(0)}/${(totalBytes/1048576).toFixed(0)} MB)   `);
        }
      },
      onSuccess: () => { process.stdout.write('\n'); resolve(); },
    });

    // Avvalgi yarim upload bo'lsa — o'sha joydan davom ettir
    upload.findPreviousUploads().then((prev) => {
      if (prev.length > 0) {
        upload.resumeFromPreviousUpload(prev[0]);
        console.log('  ♻️  Avvalgi upload topildi — o\'sha joydan davom etilmoqda...');
      }
      upload.start();
    }).catch(() => upload.start());
  });
}

// ─── 2b. URL'dan fetch (server-to-server, lokal upload yo'q) ──────────────────
async function fetchFromUrl(c: BunnyCfg, guid: string, url: string): Promise<void> {
  await axios.post(
    `${API_BASE}/library/${c.libraryId}/videos/${guid}/fetch`,
    { url },
    { headers: headers(c.apiKey) },
  );
}

// ─── 3. Encode tugashini kutish (status polling) ──────────────────────────────
// Bunny status: 0=Created 1=Uploaded 2=Processing 3=Transcoding 4=Finished 5=Error 6=UploadFailed
async function waitForEncoding(c: BunnyCfg, guid: string): Promise<void> {
  const start = Date.now();
  let lastMsg = '';
  while (true) {
    const r = await axios.get(
      `${API_BASE}/library/${c.libraryId}/videos/${guid}`,
      { headers: headers(c.apiKey) },
    );
    const status = r.data?.status as number;
    const progress = r.data?.encodeProgress ?? 0;
    const mins = Math.floor((Date.now() - start) / 60000);

    if (status === 4) { process.stdout.write('\n'); return; }       // Finished
    if (status === 5 || status === 6) {
      process.stdout.write('\n');
      throw new Error(`Bunny encode xato (status ${status})`);
    }
    const stLabel = status <= 1 ? 'qabul qilindi' : status === 2 ? 'tayyorlanmoqda' : 'encode';
    const msg = `\r  🎞  Bunny ${stLabel}: ${progress}% (${mins}m o'tdi)        `;
    if (msg !== lastMsg) { process.stdout.write(msg); lastMsg = msg; }

    await new Promise(res => setTimeout(res, 5_000));
  }
}

// ─── 4. Caption (subtitle) yuklash ────────────────────────────────────────────
async function uploadCaption(c: BunnyCfg, guid: string, srclang: string, label: string, vttPath: string): Promise<void> {
  const captionsFile = fs.readFileSync(vttPath).toString('base64');
  await axios.post(
    `${API_BASE}/library/${c.libraryId}/videos/${guid}/captions/${srclang}`,
    { srclang, label, captionsFile },
    { headers: headers(c.apiKey) },
  );
}

// ─── ASOSIY: tayyorlangan media'ni Bunny'ga joylash ───────────────────────────
export async function uploadToBunny(title: string, prep: PreparedMedia): Promise<BunnyResult> {
  const c = cfg();

  // State fayl: GUID'ni saqlaymiz — qayta ishga tushganda yangi video
  // yaratmasdan, o'sha videoga upload'ni davom ettiramiz
  const statePath = prep.mp4Path ? path.join(path.dirname(prep.mp4Path), '.bunny-state.json') : null;

  // 1. Video yaratish (yoki avvalgisini davom ettirish)
  let guid = '';
  if (statePath && fs.existsSync(statePath)) {
    try {
      const st = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (st.guid) { guid = st.guid; console.log(`  ♻️  Avvalgi Bunny video topildi: ${guid} — davom etamiz`); }
    } catch { /* ignore */ }
  }
  if (!guid) {
    guid = await createVideo(c, title);
    console.log(`  ✅ Bunny video yaratildi: ${guid}`);
    if (statePath) { try { fs.writeFileSync(statePath, JSON.stringify({ guid })); } catch { /* ignore */ } }
  }

  // 2. Manbani berish: lokal → upload, URL → fetch
  if (prep.isUrl && prep.sourceUrl) {
    await fetchFromUrl(c, guid, prep.sourceUrl);
    console.log('  ✅ Bunny URL fetch boshlandi (lokal upload yo\'q)');
  } else if (prep.mp4Path) {
    await uploadFile(c, guid, prep.mp4Path, title);
    console.log('  ✅ MP4 Bunny\'ga yuklandi');
  } else {
    throw new Error('Bunny: na mp4Path na sourceUrl bor');
  }

  // 3. Encode tugashini kutish (3 sifat + audio treklar bulutda tayyorlanadi)
  await waitForEncoding(c, guid);
  console.log('  ✅ Bunny encode tugadi (3 sifat + audio tayyor)');

  // 4. Subtitlelarni caption qilib yuklash
  const subtitleUrls: BunnyResult['subtitleUrls'] = [];
  for (const s of prep.subtitles) {
    try {
      await uploadCaption(c, guid, s.lang, s.label, s.vttPath);
      subtitleUrls.push({
        lang: s.lang,
        label: s.label,
        url: `https://${c.cdn}/${guid}/captions/${s.lang}.vtt`,
      });
      console.log(`  ✅ Subtitle yuklandi: ${s.lang}`);
    } catch (e) {
      console.log(`  ⚠️  Subtitle ${s.lang} yuklash xato: ${(e as Error).message.slice(0, 80)}`);
    }
  }

  // Muvaffaqiyat — resume state fayllarini tozalaymiz
  if (statePath) {
    try { fs.rmSync(statePath, { force: true }); } catch { /* ignore */ }
    try { fs.rmSync(path.join(path.dirname(statePath), '.tus-store.json'), { force: true }); } catch { /* ignore */ }
  }

  const playlistUrl = `https://${c.cdn}/${guid}/playlist.m3u8`;
  console.log(`  ✅ HLS URL: ${playlistUrl}`);

  return { guid, playlistUrl, subtitleUrls };
}
