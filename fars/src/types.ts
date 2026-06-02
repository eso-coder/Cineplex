// ============================================================
//  FARS v2 — TypeScript interfaces
// ============================================================

// ── Parser ───────────────────────────────────────────────────────────────────

export interface ParsedInput {
  videoUrl: string;
  movieName: string;
  slugName: string;
  year?: number;
}

export interface ParsedFileName {
  name: string;        // "Onegin"
  year: string;        // "1999"
  slug: string;        // "onegin1999"
  originalPath: string;
}

// ── Movie data ────────────────────────────────────────────────────────────────

export interface CastMember {
  name: string;
  character?: string;
  profileUrl?: string;
}

export interface SubtitleTrack {
  lang: string;   // "uz" | "ru" | "en"
  label: string;  // "O'zbek" | "Rus" | "English"
  url: string;    // S3 .vtt URL
}

export interface MovieData {
  title: string;
  year: number;
  description: string;
  duration: number;       // minutes
  rating: number;         // 0-10 IMDB
  genres: string[];       // genre names
  cast: string[];         // actor names
  posterUrl: string;
  bannerUrl?: string;
  gallery: string[];
  trailerId?: string;     // YouTube video ID only
  videoUrl: string;       // S3 HLS master.m3u8 URL
  subtitles: SubtitleTrack[];
  type: 'movie' | 'series';
  ageRating: number;      // 0, 6, 12, 16, 18
  imdbId?: string;
  seasons?: number;
  episodes?: number;
}

export interface Genre {
  _id: string;
  name: string;
  slug: string;
}

// ── Convert + Upload ──────────────────────────────────────────────────────────

export interface StreamInfo {
  durationSec: number;
  videoWidth: number;
  videoHeight: number;
  audioStreams: AudioStreamInfo[];
  subStreams: SubStreamInfo[];
  bandwidth: number;  // estimated bits/sec
}

export interface AudioStreamInfo {
  index: number;       // ffmpeg stream index (0-based within type)
  langCode: string;    // "uzb" | "eng" | "rus" | "und"
  langName: string;    // "Uzbek" | "English" | ...
  codecName: string;
}

export interface SubStreamInfo {
  index: number;
  langCode: string;
  langName: string;
  codecName: string;
}

export interface HlsSubtitle {
  lang: string;
  langName: string;
  langCode: string;
  vttPath: string;   // local path
  m3u8Path: string;  // local path
  vttKey: string;    // S3 key
  m3u8Key: string;
}

export interface HlsOutput {
  outDir: string;
  masterPath: string;
  subtitles: HlsSubtitle[];
}

// ── OMDB API ──────────────────────────────────────────────────────────────────

export interface OmdbResponse {
  Title: string;
  Year: string;
  Rated: string;       // "PG" | "PG-13" | "R" | "G" | "N/A"
  Runtime: string;     // "148 min"
  Genre: string;       // "Action, Drama"
  Director: string;
  Actors: string;      // "Actor1, Actor2"
  Plot: string;
  Poster: string;      // URL or "N/A"
  imdbRating: string;  // "8.8" or "N/A"
  imdbID: string;      // "tt1375666"
  Type: string;        // "movie" | "series"
  totalSeasons?: string;
  Response: string;    // "True" | "False"
  Error?: string;
}

// ── TMDB ─────────────────────────────────────────────────────────────────────

export interface TmdbSearchResult {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

export interface TmdbImage {
  file_path: string;
  width: number;
  height: number;
  vote_average: number;
}

// ── Config ────────────────────────────────────────────────────────────────────

export interface FarsConfig {
  // Admin
  apiBase: string;
  adminUrl: string;
  adminEmail: string;
  adminPassword: string;
  adminMode: 'api' | 'playwright';
  headless: boolean;
  // S3
  s3Bucket: string;
  s3Region: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  outputDir: string;
  ffmpegPath: string;
  ffprobePath: string;
  // Optional API keys
  omdbKey?: string;
  tmdbKey?: string;
  youtubeKey?: string;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

export interface CliArgs {
  input: string;          // MKV path OR S3 URL OR movie slug
  titleOverride?: string;
  yearOverride?: number;
  dryRun: boolean;
  skipConvert: boolean;   // skip ffmpeg step (already on S3)
  skipTrailer: boolean;
  skipImages: boolean;
  updateId?: string;
}
