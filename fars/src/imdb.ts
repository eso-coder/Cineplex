// ============================================================
//  FARS - Movie metadata fetcher
//  Priority:
//    1. OMDB API   (omdbKey)      — structured, designed for dev use
//    2. TMDB API   (tmdbKey)      — also provides cast, overview, genres
//    3. IMDB scraping             — IMDB now blocks bots (202 empty body)
//                                   kept as last resort only
// ============================================================
import axios from 'axios';
import * as cheerio from 'cheerio';
import { MovieData, OmdbResponse } from './types';
import * as logger from './logger';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG  = 'https://image.tmdb.org/t/p/original';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// ── OMDB API ──────────────────────────────────────────────────────────────────

export async function fetchFromOmdb(
  title: string,
  year: number | undefined,
  apiKey: string
): Promise<Partial<MovieData> | null> {
  const params: Record<string, string> = { t: title, apikey: apiKey, plot: 'full' };
  if (year) params.y = String(year);

  try {
    const res = await axios.get<OmdbResponse>('https://www.omdbapi.com/', {
      params,
      timeout: 12000,
    });

    const d = res.data;
    if (d.Response === 'False') {
      logger.warn(`OMDB: ${d.Error || 'Topilmadi'} — "${title}"`);
      return null;
    }

    const duration = parseOmdbRuntime(d.Runtime);
    const genres = d.Genre.split(',').map((g) => g.trim()).filter(Boolean);
    const cast = d.Actors.split(',')
      .map((a) => a.trim())
      .filter((a) => a && a !== 'N/A');

    const result: Partial<MovieData> = {
      title: d.Title,
      year: parseInt(d.Year) || year || 0,
      description: d.Plot === 'N/A' ? '' : d.Plot,
      duration,
      rating: parseFloat(d.imdbRating) || 0,
      genres,
      cast,
      posterUrl: d.Poster === 'N/A' ? '' : d.Poster,
      type: d.Type === 'series' ? 'series' : 'movie',
      imdbId: d.imdbID,
      // Store Rated field for age-rating mapping in automation.ts
      ...(d.Rated && d.Rated !== 'N/A' ? { _rated: d.Rated } as any : {}),
    };

    if (d.Type === 'series' && d.totalSeasons) {
      result.seasons = parseInt(d.totalSeasons) || 0;
    }

    return result;
  } catch (e: any) {
    logger.warn(`OMDB so'rov xatosi: ${e.message}`);
    return null;
  }
}

function parseOmdbRuntime(str: string): number {
  if (!str || str === 'N/A') return 0;
  const m = str.match(/(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

// ── TMDB Full Metadata (title + cast + genres + poster) ──────────────────────

interface TmdbMovieDetail {
  title: string;
  overview: string;
  release_date: string;   // "1999-04-16"
  runtime: number;        // minutes
  vote_average: number;
  poster_path: string | null;
  genres: Array<{ id: number; name: string }>;
  imdb_id: string | null;
  status: string;
  credits?: {
    cast: Array<{ name: string; order: number }>;
  };
}

interface TmdbSearchItem {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
}

export async function fetchFromTmdb(
  title: string,
  year: number | undefined,
  tmdbKey: string
): Promise<Partial<MovieData> | null> {
  try {
    // 1. Search
    const params: Record<string, string | number> = {
      api_key: tmdbKey,
      query: title,
      language: 'en-US',
    };
    if (year) params.primary_release_year = year;

    const searchRes = await axios.get<{ results: TmdbSearchItem[] }>(
      `${TMDB_BASE}/search/movie`,
      { params, timeout: 12000 }
    );

    const results = searchRes.data.results || [];
    if (!results.length) {
      logger.warn(`TMDB: "${title}" topilmadi`);
      return null;
    }

    // Best match: exact title + year, then first result
    let best = results[0];
    if (year) {
      const exact = results.find(
        (r) =>
          r.title.toLowerCase() === title.toLowerCase() &&
          r.release_date?.startsWith(String(year))
      );
      if (exact) best = exact;
    }

    // 2. Full details with cast
    const detailRes = await axios.get<TmdbMovieDetail>(
      `${TMDB_BASE}/movie/${best.id}`,
      {
        params: {
          api_key: tmdbKey,
          language: 'en-US',
          append_to_response: 'credits',
        },
        timeout: 12000,
      }
    );

    const d = detailRes.data;
    const releaseYear = d.release_date ? parseInt(d.release_date.slice(0, 4)) : (year || 0);
    const genres = (d.genres || []).map((g) => g.name);
    const cast = (d.credits?.cast || [])
      .sort((a, b) => a.order - b.order)
      .slice(0, 10)
      .map((a) => a.name);

    const posterUrl = d.poster_path ? `${TMDB_IMG}${d.poster_path}` : '';

    logger.ok(`TMDB: "${d.title}" (${releaseYear}) — ${d.vote_average.toFixed(1)}/10`);

    return {
      title: d.title,
      year: releaseYear,
      description: d.overview || '',
      duration: d.runtime || 0,
      rating: Math.round(d.vote_average * 10) / 10,
      genres,
      cast,
      posterUrl,
      imdbId: d.imdb_id || undefined,
    };
  } catch (e: any) {
    logger.warn(`TMDB metadata xatosi: ${e.message}`);
    return null;
  }
}

// ── IMDB Suggestion API ───────────────────────────────────────────────────────

interface ImdbSuggestionItem {
  id: string;   // "tt1375666"
  l: string;    // title
  y: number;    // year
  q: string;    // "feature" | "TV series" | "short" | ...
  i?: { imageUrl: string };
}

interface ImdbSuggestionResponse {
  d: ImdbSuggestionItem[];
}

/**
 * Use IMDB's autocomplete API to find the IMDB ID for a movie.
 * No API key required.
 */
export async function searchImdbId(
  query: string,
  year?: number
): Promise<string | null> {
  // Encode: spaces -> underscores, lowercase
  const encoded = encodeURIComponent(query.toLowerCase().replace(/\s+/g, '_'));
  const url = `https://v3.sg.media-imdb.com/suggestion/x/${encoded}.json`;

  try {
    const res = await axios.get<ImdbSuggestionResponse>(url, {
      headers: BROWSER_HEADERS,
      timeout: 10000,
    });

    const all = res.data.d || [];
    // Prefer feature films and TV series
    const features = all.filter(
      (r) => r.q === 'feature' || r.q === 'TV series' || r.q === 'TV mini-series'
    );
    const pool = features.length > 0 ? features : all;

    if (year) {
      // Exact or off-by-one year match
      const exact = pool.find((r) => Math.abs((r.y || 0) - year) <= 1);
      if (exact) return exact.id;
    }

    return pool[0]?.id || null;
  } catch (e: any) {
    logger.warn(`IMDB suggestion API xatosi: ${e.message}`);
    return null;
  }
}

// ── IMDB Page Scraper ─────────────────────────────────────────────────────────

/**
 * Scrape the IMDB title page and extract JSON-LD structured data.
 * Provides: title, year, plot, genres, cast, poster, duration, rating.
 */
export async function scrapeImdbPage(
  imdbId: string
): Promise<Partial<MovieData> | null> {
  const url = `https://www.imdb.com/title/${imdbId}/`;

  try {
    const res = await axios.get<string>(url, {
      headers: BROWSER_HEADERS,
      timeout: 18000,
    });

    const $ = cheerio.load(res.data);
    const ldText = $('script[type="application/ld+json"]').first().text();
    if (!ldText) {
      logger.warn('IMDB: JSON-LD topilmadi');
      return null;
    }

    const ld = JSON.parse(ldText);
    const duration = parseIsoDuration(ld.duration);
    const genres: string[] = Array.isArray(ld.genre)
      ? ld.genre
      : ld.genre
      ? [ld.genre]
      : [];
    const cast: string[] = (ld.actor || [])
      .slice(0, 10)
      .map((a: any) => (typeof a === 'string' ? a : a.name))
      .filter(Boolean);

    const dateStr: string = ld.datePublished || '';
    const year = dateStr ? parseInt(dateStr.slice(0, 4)) : 0;

    const type = ld['@type'] === 'TVSeries' || ld['@type'] === 'TVMiniSeries'
      ? 'series'
      : 'movie';

    return {
      title: ld.name || '',
      year,
      description: ld.description || '',
      duration,
      rating: parseFloat(ld.aggregateRating?.ratingValue) || 0,
      genres,
      cast,
      posterUrl: ld.image || '',
      type,
      imdbId,
    };
  } catch (e: any) {
    logger.warn(`IMDB sayfa scraping xatosi: ${e.message}`);
    return null;
  }
}

// Parse ISO 8601 duration: "PT148M" or "PT2H28M" -> minutes
function parseIsoDuration(iso: string): number {
  if (!iso) return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return 0;
  return (parseInt(m[1] || '0')) * 60 + parseInt(m[2] || '0');
}

// ── Age Rating Estimator ──────────────────────────────────────────────────────

/**
 * Heuristic age rating from genre names.
 * Admin panel accepts: 0, 6, 12, 16, 18
 */
export function estimateAgeRating(genres: string[]): number {
  const lower = genres.map((g) => g.toLowerCase());
  if (lower.some((g) => g.includes('family') || g.includes('animation') || g.includes('musical'))) return 6;
  if (lower.some((g) => g.includes('horror') || g.includes('thriller'))) return 16;
  if (lower.some((g) => g.includes('crime') || g.includes('war') || g.includes('western'))) return 16;
  if (lower.some((g) => g.includes('romance') || g.includes('drama') || g.includes('history'))) return 12;
  if (lower.some((g) => g.includes('comedy') || g.includes('sport') || g.includes('music'))) return 6;
  if (lower.some((g) => g.includes('action') || g.includes('adventure') || g.includes('sci-fi') || g.includes('fantasy'))) return 12;
  return 12; // default
}
