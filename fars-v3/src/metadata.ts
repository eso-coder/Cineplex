import axios from 'axios';

export interface MovieMetadata {
  // Asosiy
  title:       string;   // Canonical title (TMDB/OMDB)
  titleRu?:    string;
  titleEn?:    string;
  year:        string;
  imdbRating:  string;
  rated:       string;   // G, PG, PG-13, R, NC-17
  runtime:     string;   // "97 min"
  genres:      string[]; // ["Crime", "Drama"]
  imdbId?:     string;
  director?:   string;

  // Tavsiflar
  descriptionUz?: string;
  descriptionRu?: string;
  descriptionEn?: string;

  // Rasmlar
  posterUrl?:  string;
  bannerUrl?:  string;
  galleryUrls: string[];

  // Aktyorlar
  cast: Array<{
    name:        string;
    character:   string;
    profileUrl?: string;
    tmdbId?:     number;
  }>;

  tmdbId?: number;
}

const TMDB_IMG   = 'https://image.tmdb.org/t/p';
const TMDB_BASE  = 'https://api.themoviedb.org/3';

// ─── Yordamchi: TMDB search (bir nechta strategiya bilan) ──────────────────────
async function tmdbSearch(
  tmdbKey: string,
  title: string,
  year: string
): Promise<{ id: number; title: string; year: string } | null> {
  // Qidiruv variantlari — eng aniqdan eng kengga
  const camelSplit = title.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  const queries: Array<{ q: string; y?: string }> = [
    { q: title, y: year },
    { q: title },
  ];
  if (camelSplit !== title) {
    queries.push({ q: camelSplit, y: year });
    queries.push({ q: camelSplit });
  }

  for (const { q, y } of queries) {
    try {
      const res = await axios.get(`${TMDB_BASE}/search/movie`, {
        params: { query: q, ...(y ? { year: y } : {}), api_key: tmdbKey, language: 'en-US', include_adult: false },
        timeout: 10_000,
      });
      const results: Array<{ id: number; title: string; release_date?: string; popularity?: number }> =
        res.data?.results || [];
      if (results.length) {
        // Yil mos kelsa shuni, aks holda eng mashhurini tanlaymiz
        let best = results[0];
        if (y) {
          const exact = results.find(r => (r.release_date || '').startsWith(y));
          if (exact) best = exact;
        }
        return {
          id: best.id,
          title: best.title,
          year: (best.release_date || '').slice(0, 4) || year,
        };
      }
    } catch (e) {
      console.log(`  ⚠️  TMDB qidiruv xato ("${q}"): ${(e as Error).message}`);
    }
  }
  return null;
}

// ─── ASOSIY ───────────────────────────────────────────────────────────────────
export async function fetchMetadata(title: string, year: string): Promise<MovieMetadata> {
  const omdbKey = process.env.OMDB_API_KEY || '';
  const tmdbKey = process.env.TMDB_API_KEY || '';

  let omdb:      OmdbResponse | null = null;
  let detailEn:  TmdbMovieDetail | null = null;
  let detailUz:  TmdbMovieDetail | null = null;
  let detailRu:  TmdbMovieDetail | null = null;
  let tmdbImages:  TmdbImages  | null = null;
  let tmdbCredits: TmdbCredits | null = null;
  let imdbId = '';
  let canonicalTitle = title;
  let canonicalYear  = year;
  let tmdbId: number | undefined;

  // ── 1. TMDB search (asosiy manba) ───────────────────────────────────────────
  if (tmdbKey) {
    const found = await tmdbSearch(tmdbKey, title, year);
    if (found) {
      tmdbId = found.id;
      canonicalTitle = found.title;
      canonicalYear  = found.year || year;
      console.log(`  ✅ TMDB topildi: "${found.title}" (${found.year}) [id:${found.id}]`);

      // Detallar + rasmlar + aktyorlar + IMDB id — parallel
      const [enRes, uzRes, ruRes, imgRes, credRes, extRes] = await Promise.allSettled([
        axios.get(`${TMDB_BASE}/movie/${found.id}`, { params: { api_key: tmdbKey, language: 'en-US' }, timeout: 10_000 }),
        axios.get(`${TMDB_BASE}/movie/${found.id}`, { params: { api_key: tmdbKey, language: 'uz-UZ' }, timeout: 10_000 }),
        axios.get(`${TMDB_BASE}/movie/${found.id}`, { params: { api_key: tmdbKey, language: 'ru-RU' }, timeout: 10_000 }),
        // include_image_language bo'sh — barcha til/null backdroplarni olamiz (ko'proq rasm)
        axios.get(`${TMDB_BASE}/movie/${found.id}/images`, { params: { api_key: tmdbKey }, timeout: 10_000 }),
        axios.get(`${TMDB_BASE}/movie/${found.id}/credits`, { params: { api_key: tmdbKey }, timeout: 10_000 }),
        axios.get(`${TMDB_BASE}/movie/${found.id}/external_ids`, { params: { api_key: tmdbKey }, timeout: 10_000 }),
      ]);

      if (enRes.status   === 'fulfilled') detailEn    = enRes.value.data;
      if (uzRes.status   === 'fulfilled') detailUz    = uzRes.value.data;
      if (ruRes.status   === 'fulfilled') detailRu    = ruRes.value.data;
      if (imgRes.status  === 'fulfilled') tmdbImages  = imgRes.value.data;
      if (credRes.status === 'fulfilled') tmdbCredits = credRes.value.data;
      if (extRes.status  === 'fulfilled') imdbId      = extRes.value.data?.imdb_id || '';
    } else {
      console.log(`  ⚠️  TMDB: "${title}" topilmadi (qidiruv variantlari tugadi)`);
    }
  } else {
    console.log('  ⚠️  TMDB_API_KEY yo\'q, skip');
  }

  // ── 2. OMDB — IMDB id orqali (eng ishonchli), aks holda title+year ──────────
  if (omdbKey) {
    try {
      const params = imdbId
        ? { i: imdbId, apikey: omdbKey }
        : { t: canonicalTitle, y: canonicalYear, apikey: omdbKey, type: 'movie' };
      const r = await axios.get('https://www.omdbapi.com/', { params, timeout: 10_000 });
      if (r.data?.Response === 'True') {
        omdb = r.data;
        console.log(`  ✅ OMDB topildi: "${omdb!.Title}" (${omdb!.Year})${imdbId ? ' [imdb:' + imdbId + ']' : ''}`);
      } else {
        console.log(`  ⚠️  OMDB: "${r.data?.Error || 'topilmadi'}"`);
      }
    } catch (e) {
      console.log(`  ⚠️  OMDB xato: ${(e as Error).message}`);
    }
  } else {
    console.log('  ⚠️  OMDB_API_KEY yo\'q, skip');
  }

  // ── 3. Ma'lumotlarni birlashtirish ──────────────────────────────────────────

  // Janrlar: OMDB (inglizcha) → bo'lmasa TMDB
  let genres = (omdb?.Genre || '').split(',').map(g => g.trim()).filter(Boolean);
  if (!genres.length && detailEn?.genres?.length) {
    genres = detailEn.genres.map(g => g.name).filter(Boolean);
  }

  // Poster: TMDB w500 → OMDB
  const posterPath = detailEn?.poster_path || detailUz?.poster_path || detailRu?.poster_path;
  const posterUrl = posterPath
    ? `${TMDB_IMG}/w500${posterPath}`
    : (omdb?.Poster && omdb.Poster !== 'N/A' ? omdb.Poster : undefined);

  // Banner + gallery: TMDB backdrops (kenglik bo'yicha saralangan, eng kattalari)
  const allBackdrops = (tmdbImages?.backdrops || [])
    .slice()
    .sort((a, b) => (b.width || 0) - (a.width || 0));
  // Banner uchun til-neytral (textsiz) backdropni afzal ko'ramiz
  const bannerPick = allBackdrops.find(b => !b.iso_639_1) || allBackdrops[0];
  const bannerUrl = bannerPick ? `${TMDB_IMG}/original${bannerPick.file_path}` : undefined;

  // Gallery: til-neytral (textsiz, sahna) backdroplarni AFZAL ko'ramiz.
  // Localized key-art (bir xil rasm + turli tildagi sarlavha) bir xil ko'rinadi,
  // shuning uchun avval iso_639_1=null (sahna) rasmlarni, keyin qolganini olamiz.
  const galleryNeutral = allBackdrops.filter(b => !b.iso_639_1 && b.file_path !== bannerPick?.file_path);
  const galleryOther   = allBackdrops.filter(b =>  b.iso_639_1 && b.file_path !== bannerPick?.file_path);
  let galleryUrls = galleryNeutral.concat(galleryOther)
    .slice(0, 11)
    .map(b => `${TMDB_IMG}/original${b.file_path}`);

  // Agar backdrop yetarli bo'lmasa — poster rasmlari bilan to'ldiramiz
  if (galleryUrls.length < 6 && tmdbImages?.posters?.length) {
    const extra = tmdbImages.posters
      .filter(p => p.file_path !== posterPath)
      .slice(0, 6 - galleryUrls.length)
      .map(p => `${TMDB_IMG}/w780${p.file_path}`);
    galleryUrls = galleryUrls.concat(extra);
  }

  // Aktyorlar: TMDB cast (rasm + ism bor bo'lganlari), eng yuqori 12 ta
  const cast = (tmdbCredits?.cast || [])
    .filter(c => c.name)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .slice(0, 12)
    .map(c => ({
      name:       c.name,
      character:  c.character || '',
      profileUrl: c.profile_path ? `${TMDB_IMG}/w185${c.profile_path}` : undefined,
      tmdbId:     c.id,
    }));

  // Tavsiflar: EN — OMDB Plot yoki TMDB en overview
  const descEn = (omdb?.Plot && omdb.Plot !== 'N/A' ? omdb.Plot : undefined)
    || (detailEn?.overview && detailEn.overview.length > 20 ? detailEn.overview : undefined);
  const descUz = detailUz?.overview && detailUz.overview.length > 20 ? detailUz.overview : undefined;
  const descRu = detailRu?.overview && detailRu.overview.length > 20 ? detailRu.overview : undefined;

  // Runtime: OMDB → TMDB
  const runtime = (omdb?.Runtime && omdb.Runtime !== 'N/A')
    ? omdb.Runtime
    : (detailEn?.runtime ? `${detailEn.runtime} min` : '');

  // Director: OMDB → TMDB crew
  const director = (omdb?.Director && omdb.Director !== 'N/A')
    ? omdb.Director
    : (tmdbCredits?.crew?.find(c => c.job === 'Director')?.name || '');

  return {
    title:      omdb?.Title || canonicalTitle || title,
    titleEn:    detailEn?.title || omdb?.Title || canonicalTitle,
    titleRu:    detailRu?.title || undefined,
    year:       (omdb?.Year && omdb.Year !== 'N/A' ? omdb.Year.slice(0, 4) : canonicalYear),
    imdbRating: omdb?.imdbRating && omdb.imdbRating !== 'N/A'
                  ? omdb.imdbRating
                  : (detailEn?.vote_average ? detailEn.vote_average.toFixed(1) : '7.0'),
    rated:      omdb?.Rated && omdb.Rated !== 'N/A' ? omdb.Rated : '',
    runtime,
    genres,
    imdbId:     imdbId || omdb?.imdbID,
    director,

    descriptionEn: descEn,
    descriptionUz: descUz,   // bo'lmasa index.ts tarjima qiladi
    descriptionRu: descRu,

    posterUrl,
    bannerUrl,
    galleryUrls,
    cast,
    tmdbId,
  };
}

// ─── Tip ta'riflari ───────────────────────────────────────────────────────────
interface OmdbResponse {
  Title: string; Year: string; Rated: string; Runtime: string;
  Genre: string; Director: string; Plot: string; Poster: string;
  imdbRating: string; imdbID: string; Response: string; Error?: string;
}
interface TmdbMovieDetail {
  id: number; title: string; overview: string;
  poster_path?: string; backdrop_path?: string;
  runtime?: number; vote_average?: number;
  genres?: Array<{ id: number; name: string }>;
}
interface TmdbImages {
  backdrops: Array<{ file_path: string; width: number; height: number; iso_639_1?: string | null }>;
  posters?:  Array<{ file_path: string; width: number; height: number; iso_639_1?: string | null }>;
}
interface TmdbCredits {
  cast: Array<{ id: number; name: string; character: string; profile_path?: string; order: number }>;
  crew?: Array<{ id: number; name: string; job: string }>;
}
