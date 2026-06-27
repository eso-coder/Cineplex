import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import pLimit from 'p-limit';

// ─── Content-Type xaritasi ────────────────────────────────────────────────────
function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.m3u8': return 'application/vnd.apple.mpegurl';
    case '.ts':   return 'video/mp2t';
    case '.vtt':  return 'text/vtt';
    case '.srt':  return 'text/plain';
    default:      return 'application/octet-stream';
  }
}

// ─── Papkadagi barcha fayllarni rekursiv olish ────────────────────────────────
function getAllFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...getAllFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

// ─── ASOSIY UPLOAD ────────────────────────────────────────────────────────────
export async function uploadToS3(outputDir: string, slug: string): Promise<string> {
  const region  = process.env.AWS_REGION  || 'eu-north-1';
  const bucket  = process.env.S3_BUCKET   || '';

  if (!bucket) throw new Error('S3_BUCKET .env da ko\'rsatilmagan');
  if (!process.env.AWS_ACCESS_KEY_ID) throw new Error('AWS_ACCESS_KEY_ID .env da yo\'q');
  if (!process.env.AWS_SECRET_ACCESS_KEY) throw new Error('AWS_SECRET_ACCESS_KEY .env da yo\'q');

  const client = new S3Client({
    region,
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const allFiles = getAllFiles(outputDir);
  const total = allFiles.length;
  let done = 0;

  // Parallel upload: bir vaqtda 10 ta
  const limit = pLimit(10);

  const tasks = allFiles.map(filePath =>
    limit(async () => {
      const relative = path.relative(outputDir, filePath).replace(/\\/g, '/');
      const s3Key = `${slug}/${relative}`;
      const body = fs.readFileSync(filePath);
      const contentType = getContentType(filePath);

      await client.send(new PutObjectCommand({
        Bucket:      bucket,
        Key:         s3Key,
        Body:        body,
        ContentType: contentType,
        CacheControl: contentType === 'video/mp2t' ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      }));

      done++;
      const pct = Math.round((done / total) * 100);
      process.stdout.write(`\r  ⬆ Yuklanyapti: ${done}/${total} (${pct}%)`);
    })
  );

  await Promise.all(tasks);
  process.stdout.write('\n');

  const masterUrl = `https://${bucket}.s3.${region}.amazonaws.com/${slug}/master.m3u8`;
  console.log(`  ✅ S3 URL: ${masterUrl}`);
  return masterUrl;
}

// ─── Subtitle URL larni qaytarish ─────────────────────────────────────────────
export function buildSubtitleUrls(
  slug: string,
  subtitles: Array<{ lang: string; label: string; filename: string }>
): Array<{ lang: string; label: string; url: string }> {
  const region = process.env.AWS_REGION || 'eu-north-1';
  const bucket = process.env.S3_BUCKET  || '';
  return subtitles.map(s => ({
    lang:  s.lang,
    label: s.label,
    url:   `https://${bucket}.s3.${region}.amazonaws.com/${slug}/${s.filename}`,
  }));
}
