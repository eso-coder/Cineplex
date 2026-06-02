// ============================================================
//  FARS - YouTube trailer finder
//  Primary:  YouTube Data API v3  (if API key available)
//  Fallback: YouTube search page scraping (no key needed)
// ============================================================
import axios from 'axios';
import * as logger from './logger';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ── YouTube Data API v3 ───────────────────────────────────────────────────────

async function searchViaApi(
  title: string,
  year: number,
  apiKey: string
): Promise<string | null> {
  const queries = [
    `${title} ${year} official trailer`,
    `${title} trailer ${year}`,
    `${title} official trailer`,
  ];

  for (const q of queries) {
    try {
      const res = await axios.get(
        'https://www.googleapis.com/youtube/v3/search',
        {
          params: {
            part: 'snippet',
            q,
            type: 'video',
            maxResults: 3,
            relevanceLanguage: 'en',
            key: apiKey,
          },
          timeout: 10000,
        }
      );
      const items: any[] = res.data.items || [];
      const videoId = items[0]?.id?.videoId || null;
      if (videoId) return videoId;
    } catch (e: any) {
      logger.warn(`YouTube API xatosi: ${e.message}`);
      break; // API key error — stop retrying
    }
  }
  return null;
}

// ── YouTube Page Scraping ─────────────────────────────────────────────────────

async function searchViaScrape(
  title: string,
  year: number
): Promise<string | null> {
  const query = `${title} ${year} official trailer`;
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

  try {
    const res = await axios.get<string>(url, {
      headers: BROWSER_HEADERS,
      timeout: 18000,
    });

    // YouTube embeds search result data as JSON in the page source.
    // Extract all videoId values that appear in that JSON blob.
    const matches = [...res.data.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)];
    if (matches.length > 0) {
      // The first occurrence is usually the top search result
      return matches[0][1];
    }
  } catch (e: any) {
    logger.warn(`YouTube scraping xatosi: ${e.message}`);
  }
  return null;
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Find the YouTube trailer video ID for a movie.
 * Returns the 11-character video ID, or null if not found.
 */
export async function findTrailer(
  title: string,
  year: number,
  apiKey?: string
): Promise<string | null> {
  logger.log(`YouTube trailer axtarilmoqda: "${title} (${year})"...`);

  // Try API first
  if (apiKey) {
    const id = await searchViaApi(title, year, apiKey);
    if (id) {
      logger.ok(`Trailer topildi (API): ${id}`);
      return id;
    }
  }

  // Fallback: scrape
  const id = await searchViaScrape(title, year);
  if (id) {
    logger.ok(`Trailer topildi (scrape): ${id}`);
  } else {
    logger.warn('Trailer topilmadi.');
  }
  return id;
}

/**
 * Validate that a YouTube video ID is actually accessible.
 * Uses the lightweight oEmbed endpoint (no API key needed).
 */
export async function validateVideoId(videoId: string): Promise<boolean> {
  try {
    const res = await axios.get(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { timeout: 8000 }
    );
    return res.status === 200;
  } catch {
    return false;
  }
}
