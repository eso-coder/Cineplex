export interface ParsedFilename {
  title: string;
  year: string;
  slug: string;
}

export function parseFilename(filename: string): ParsedFilename {
  // Kengaytmani olib tashlash
  const name = filename.replace(/\.(mkv|mp4|avi|mov|wmv|flv|ts|m4v|webm)$/i, '');

  // ── Yilni topish (1900-2099) — string oxirida ham, o'rtasida ham ─────────────
  // Barcha yil-ko'rinishidagi tokenlarni topamiz (raqam bilan o'ralmagan).
  // Relizlarda yil odatda OXIRGI token bo'ladi: "Blade Runner 2049 2017" → 2017.
  // "AnnaKarenina.2012" kabi oxirida turgan yilni ham to'g'ri topadi.
  const yearRe = /(?<![0-9])(19|20)\d{2}(?![0-9])/g;
  const matches = [...name.matchAll(yearRe)];

  let year = new Date().getFullYear().toString();
  let titleRaw = name;

  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    year = last[0];
    // Sarlavha = oxirgi yil tokenidan oldingi hamma narsa
    if (last.index !== undefined && last.index > 0) {
      titleRaw = name.substring(0, last.index);
    }
  }

  // ── Nomni tozalash ───────────────────────────────────────────────────────────
  let title = titleRaw
    .replace(/[._]/g, ' ')           // nuqta/pastki chiziq → bo'shliq
    .replace(/\[.*?\]/g, '')         // [...] olib tashlash
    .replace(/\(.*?\)/g, '')         // (...) olib tashlash
    .replace(/\b(1080p|720p|480p|2160p|4K|UHD|HDR10?|SDR|BluRay|Blu-Ray|BDRip|BRRip|WEBRip|WEB-DL|WEBDL|WEB|HDTV|DVDRip|DVD|HDRip|CAMRip|x264|x265|h264|h265|HEVC|AVC|AAC|AC3|EAC3|DD5|DDP5|DTS|TrueHD|ATMOS|REMUX|PROPER|REPACK|EXTENDED|THEATRICAL|DIRECTORS|CUT|UNRATED|IMAX|MULTI|DUAL|RARBG|YTS|YIFG|YIFY)\b/gi, '')
    .replace(/-[A-Za-z0-9]+$/, '')   // oxiridagi -GROUP nomini olib tashlash
    .replace(/\s{2,}/g, ' ')
    .trim();

  // camelCase → bo'shliq: "AnnaKarenina" → "Anna Karenina"
  // (ajratuvchisiz yozilgan nomlar uchun — OMDB/TMDB qidiruvi to'g'ri ishlashi uchun)
  title = title
    .replace(/([a-z])([A-Z])/g, '$1 $2')   // anna|Karenina
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // ABCWord → ABC Word
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Slug: kichik harf, faqat a-z0-9
  const slug = (title + ' ' + year)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '')
    .substring(0, 50);

  return { title, year, slug };
}

// Runtime "97 min" → "1h 37m" formatiga o'girish
export function formatRuntime(runtime: string | undefined): string {
  if (!runtime) return '';
  const match = runtime.match(/(\d+)/);
  if (!match) return runtime;
  const mins = parseInt(match[1]);
  if (isNaN(mins) || mins <= 0) return runtime;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// OMDB yosh cheklovi → admin panel opsiyasi
export function mapAgeRating(rated: string | undefined): string {
  if (!rated) return 'Barchaga';
  const r = rated.toUpperCase();
  if (r === 'G' || r === 'TV-G') return 'Barchaga';
  if (r === 'PG' || r === 'TV-PG') return 'Barchaga';
  if (r.includes('13') || r === 'TV-14') return '12+';
  if (r === 'R' || r === 'TV-MA') return '16+';
  if (r.includes('17') || r.includes('NC-17')) return '18+';
  return 'Barchaga';
}
