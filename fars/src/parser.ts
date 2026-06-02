// ============================================================
//  FARS - Input parser
//  Accepts: S3 URL, movie slug, or "name year" string
// ============================================================
import { ParsedInput } from './types';

/**
 * Parse user input into a structured form.
 *
 * Accepted inputs:
 *   "https://cine-plex-uz.s3.eu-north-1.amazonaws.com/dwprada/master.m3u8"
 *   "dwprada"
 *   "the-dark-knight-2008"
 *   "inception 2010"
 */
export function parseInput(input: string): ParsedInput {
  input = input.trim();
  let videoUrl = '';
  let slug = input;

  // --- Extract slug from S3 URL ---
  if (input.startsWith('http')) {
    videoUrl = input;
    // https://bucket.s3.region.amazonaws.com/{slug}/master.m3u8
    const s3Match = input.match(/amazonaws\.com\/([^/]+)\/[^/]+\.m3u8/);
    if (s3Match) {
      slug = s3Match[1];
    } else {
      // Generic: second-to-last path segment before file
      const parts = input.split('/').filter(Boolean);
      slug = parts.length >= 2 ? parts[parts.length - 2] : parts[parts.length - 1];
    }
  }

  const slugName = slug;

  // --- Extract year from end of slug/string ---
  // Handles: "the-dark-knight-2008", "inception 2010", "onegin1999"
  // 1) Year preceded by separator:   "title-2008"  "title_2008"  "title 2008"
  // 2) Year directly concatenated:   "onegin1999"  (remaining name >= 3 chars)
  let year: number | undefined;
  let namePart = slug;

  const sepMatch = slug.match(/^(.*?)[-_\s](\d{4})$/);
  const noSepMatch = slug.match(/^(.{3,})(\d{4})$/);
  const match = sepMatch || noSepMatch;

  if (match) {
    const y = parseInt(match[2]);
    if (y >= 1900 && y <= 2030) {
      year = y;
      namePart = match[1];
    }
  }

  // --- Convert slug to human-readable query ---
  // "the-dark-knight" -> "the dark knight"
  // "dwprada" -> "dwprada" (single word, keep as-is)
  const movieName = namePart
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return { videoUrl, movieName, slugName, year };
}

/**
 * Build a standard S3 HLS URL from a movie slug.
 * Used when user provides only the slug (e.g., "dwprada").
 */
export function buildVideoUrl(
  slug: string,
  bucket = 'cine-plex-uz',
  region = 'eu-north-1'
): string {
  // Clean the slug (strip year if present at end)
  const clean = slug.trim().replace(/[-_]?\d{4}$/, '').trim();
  return `https://${bucket}.s3.${region}.amazonaws.com/${clean}/master.m3u8`;
}
