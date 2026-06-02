// ============================================================
//  FARS - Banner and gallery image finder
//  Primary:  TMDB API  (if API key available)
//  Fallback: use poster as banner, no gallery
// ============================================================
import axios from 'axios';
import { TmdbSearchResult, TmdbImage } from './types';
import * as logger from './logger';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG  = 'https://image.tmdb.org/t/p/original';

interface TmdbImagesResponse {
  backdrops: TmdbImage[];
  posters: TmdbImage[];
}

interface TmdbSearchResponse {
  results: TmdbSearchResult[];
}

export interface ImageSet {
  bannerUrl: string;
  gallery: string[];
}

// ── TMDB API ──────────────────────────────────────────────────────────────────

async function fetchTmdb(title: string, year: number | undefined, apiKey: string): Promise<ImageSet> {
  try {
    // 1. Search for movie
    const searchParams: Record<string, string | number> = {
      api_key: apiKey,
      query: title,
      language: 'en-US',
      include_adult: 'false',
    };
    if (year) searchParams.primary_release_year = year;

    const searchRes = await axios.get<TmdbSearchResponse>(
      `${TMDB_BASE}/search/movie`,
      { params: searchParams, timeout: 12000 }
    );

    const results = searchRes.data.results || [];
    if (!results.length) {
      logger.warn(`TMDB: "${title}" topilmadi`);
      return { bannerUrl: '', gallery: [] };
    }

    const movie = results[0];
    logger.log(`TMDB: "${movie.title}" (ID: ${movie.id})`);

    // 2. Fetch images for that movie
    const imgRes = await axios.get<TmdbImagesResponse>(
      `${TMDB_BASE}/movie/${movie.id}/images`,
      {
        params: {
          api_key: apiKey,
          include_image_language: 'en,null',
        },
        timeout: 12000,
      }
    );

    const backdrops = imgRes.data.backdrops || [];
    const posters   = imgRes.data.posters   || [];

    // Sort backdrops by vote_average descending (best quality first)
    backdrops.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    posters.sort  ((a, b) => (b.vote_average || 0) - (a.vote_average || 0));

    // Best backdrop -> banner
    const bannerUrl = backdrops[0]
      ? `${TMDB_IMG}${backdrops[0].file_path}`
      : (movie.backdrop_path ? `${TMDB_IMG}${movie.backdrop_path}` : '');

    // Gallery: top 5 backdrops + top 3 posters (skip the banner itself)
    const galleryBackdrops = backdrops
      .slice(1, 6)   // skip index 0 (already used as banner)
      .map((b) => `${TMDB_IMG}${b.file_path}`);

    const galleryPosters = posters
      .slice(0, 3)
      .map((p) => `${TMDB_IMG}${p.file_path}`);

    // Also add movie poster if available
    const moviePoster = movie.poster_path ? `${TMDB_IMG}${movie.poster_path}` : '';
    const gallery = [...new Set([
      moviePoster,
      ...galleryBackdrops,
      ...galleryPosters,
    ])].filter(Boolean);

    return { bannerUrl, gallery };
  } catch (e: any) {
    logger.warn(`TMDB so'rov xatosi: ${e.message}`);
    return { bannerUrl: '', gallery: [] };
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Get banner and gallery images for a movie.
 * Uses TMDB if API key is provided, otherwise falls back to using
 * the poster URL as banner with an empty gallery.
 */
export async function getImages(
  title: string,
  year: number | undefined,
  posterUrl: string,
  tmdbKey?: string
): Promise<ImageSet> {
  logger.log('Rasm va banner axtarilmoqda...');

  if (tmdbKey) {
    const images = await fetchTmdb(title, year, tmdbKey);
    if (images.bannerUrl || images.gallery.length > 0) {
      logger.ok(
        `Banner: ${images.bannerUrl ? 'topildi' : 'topilmadi'}, ` +
        `Gallery: ${images.gallery.length} ta rasm`
      );
      return images;
    }
  }

  // Fallback: use poster as banner, no gallery
  logger.warn('TMDB dan rasm topilmadi. Poster ishlatiladi.');
  return {
    bannerUrl: posterUrl,
    gallery: posterUrl ? [posterUrl] : [],
  };
}
