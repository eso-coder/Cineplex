// ============================================================
//  FARS v2 — Admin panel automation
//
//  Ikki xil usul:
//    1. API mode    — to'g'ridan-to'g'ri REST API (tez, ishonchli)
//    2. Playwright  — brauzer orqali to'ldirish (vizual, screenshot)
//
//  Default: ADMIN_MODE=playwright (eng aniq)
//  Fallback: ADMIN_MODE=api
// ============================================================

import axios, { AxiosInstance } from 'axios';
import FormData                  from 'form-data';
import { chromium, Browser, Page } from 'playwright';
import { MovieData, Genre, FarsConfig, SubtitleTrack } from './types';
import * as logger from './logger';

// ── Direct API client (fallback) ─────────────────────────────────────────────

export class AdminAPIClient {
  private http: AxiosInstance;
  private token = '';

  constructor(private cfg: FarsConfig) {
    this.http = axios.create({ baseURL: cfg.apiBase, timeout: 30000 });
  }

  async login(): Promise<void> {
    const res = await this.http.post('/auth/login', {
      email: this.cfg.adminEmail,
      password: this.cfg.adminPassword,
    });
    this.token = res.data?.data?.accessToken || '';
    if (!this.token) throw new Error('API login muvaffaqiyatsiz');
    this.http.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
    logger.ok(`API: admin tizimga kirdi (${this.cfg.adminEmail})`);
  }

  async getGenres(): Promise<Genre[]> {
    const res = await this.http.get('/admin/genres');
    return res.data?.data || [];
  }

  matchGenreIds(names: string[], genres: Genre[]): string[] {
    const ids: string[] = [];
    for (const n of names) {
      const low = n.toLowerCase().trim();
      const g = genres.find(
        x => x.name.toLowerCase() === low ||
             x.slug === low.replace(/\s/g, '-') ||
             x.name.toLowerCase().includes(low) ||
             low.includes(x.name.toLowerCase())
      );
      if (g) { ids.push(g._id); }
      else   { logger.warn(`  Janr topilmadi: "${n}"`); }
    }
    return [...new Set(ids)];
  }

  async createMovie(data: MovieData, genreIds: string[]): Promise<string> {
    const fd = buildFD(data, genreIds);
    const res = await this.http.post('/admin/movies', fd, { headers: fd.getHeaders() });
    return res.data?.data?._id?.toString() || res.data?.data?.id?.toString() || '';
  }

  async updateMovie(id: string, data: Partial<MovieData>, genreIds?: string[]): Promise<void> {
    const fd = buildFD(data as MovieData, genreIds || []);
    await this.http.patch(`/admin/movies/${id}`, fd, { headers: fd.getHeaders() });
  }

  async findExisting(title: string, year: number): Promise<string | null> {
    try {
      const res = await this.http.get('/movies', {
        params: { search: title, limit: 10, page: 1 },
      });
      const movies: any[] = res.data?.data || [];
      const m = movies.find(
        x => x.title?.toLowerCase() === title.toLowerCase() &&
             (x.releaseYear === year || x.year === year)
      );
      return m?._id?.toString() || m?.id?.toString() || null;
    } catch { return null; }
  }

  getToken(): string { return this.token; }
}

// ── Playwright client (primary) ───────────────────────────────────────────────

export class PlaywrightAdminClient {
  private browser: Browser | null = null;
  private page:    Page    | null = null;
  private apiClient: AdminAPIClient;

  constructor(private cfg: FarsConfig) {
    this.apiClient = new AdminAPIClient(cfg);
  }

  // Launch browser and authenticate via token injection
  async launch(): Promise<void> {
    // When headless:false, Playwright's bundled Chromium may fail with SxS errors
    // on some Windows machines. Use system Chrome (channel:'chrome') as primary;
    // fall back to headless bundled Chromium if system Chrome is not found.
    const launchOpts = this.cfg.headless
      ? { headless: true as const }
      : { headless: false as const, channel: 'chrome' as const };

    logger.log(this.cfg.headless
      ? 'Headless Chromium ishga tushirilmoqda...'
      : 'Chrome (tizim) ishga tushirilmoqda...');

    try {
      this.browser = await chromium.launch(launchOpts);
    } catch (e: any) {
      // Fallback: headless bundled Chromium
      logger.warn(`Ko'rinadigan brauzer ishlamadi (${e.message.split('\n')[0]}), headless rejimga o'tilmoqda...`);
      this.browser = await chromium.launch({ headless: true });
    }
    this.page    = await this.browser.newPage();
    this.page.setDefaultTimeout(20_000);

    // Login via API to get token
    await this.apiClient.login();
    const token = this.apiClient.getToken();

    // Navigate to admin panel and inject token
    const adminUrl = `${this.cfg.adminUrl}/pages/admin.html`;
    await this.page.goto(adminUrl, { waitUntil: 'domcontentloaded' });
    await this.page.evaluate((t) => {
      localStorage.setItem('cp_token',       t);
      localStorage.setItem('cp_admin_token', t);
    }, token);
    await this.page.reload({ waitUntil: 'networkidle' });

    // Wait until login screen is hidden (auth succeeded)
    await this.page.waitForFunction(() => {
      const ls = document.getElementById('login-screen');
      return ls && ls.style.display === 'none';
    }, { timeout: 15_000 });

    // Navigate to movies section so #add-movie-btn becomes visible
    await this.page.click('.nav-item[data-page="movies"]');
    await this.page.waitForSelector('#add-movie-btn', { state: 'visible', timeout: 8_000 });
    logger.ok('Admin panel yuklandi.');
  }

  async getGenres(): Promise<Genre[]> {
    return this.apiClient.getGenres();
  }

  matchGenreIds(names: string[], genres: Genre[]): string[] {
    return this.apiClient.matchGenreIds(names, genres);
  }

  async fillAndSave(data: MovieData, genreIds: string[]): Promise<string> {
    const page = this.page!;

    // Open "Film qo'shish" drawer
    await page.click('#add-movie-btn');
    await page.waitForSelector('#mf-title', { state: 'visible', timeout: 8_000 });

    // Build the form data object that matches fillDrawerForm(m) signature
    const durationStr = formatDuration(data.duration);
    const formObj = {
      title:       data.title,
      type:        data.type || 'movie',
      img:         data.posterUrl || '',
      year:        String(data.year),
      rating:      String(data.rating),
      age:         String(data.ageRating ?? 12),
      duration:    durationStr,
      seasons:     String(data.seasons  || ''),
      episodes:    String(data.episodes || ''),
      description: data.description || '',
      video_url:   data.videoUrl    || '',
      trailer_id:  data.trailerId   || '',
      banner_img:  data.bannerUrl   || '',
      // These override the Set-based state in admin panel JS:
      genre:   genreIds,
      cast:    data.cast    || [],
      gallery: data.gallery || [],
    };

    // Call admin panel's own fillDrawerForm() — fills all fields + sets state
    // (openDrawer is already called via the button click above; calling again resets properly)
    await page.evaluate((m) => {
      if (typeof (window as any).fillDrawerForm === 'function') {
        (window as any).fillDrawerForm(m);  // fills form
      }
    }, formObj);

    // Small delay so UI updates
    await page.waitForTimeout(400);

    // ── Tab 0: Asosiy Ma'lumot (title, type, year, rating, age, duration, poster, banner) ──
    await page.evaluate(() => { (window as any).switchDrawerTab?.(0); });
    await page.waitForTimeout(200);
    await page.fill('#mf-title', data.title);
    await page.selectOption('#mf-type', data.type || 'movie');
    await page.fill('#mf-year',   String(data.year));
    await page.fill('#mf-rating', String(data.rating ?? 0));
    await page.selectOption('#mf-age', String(data.ageRating ?? 12));
    if (data.duration) await page.fill('#mf-duration', formatDuration(data.duration));
    if (data.posterUrl) await page.fill('#mf-img',    data.posterUrl);
    if (data.bannerUrl) await page.fill('#mf-banner', data.bannerUrl);

    // ── Tab 1: Kontent (description, video_url, trailer_id, gallery) ──
    await page.evaluate(() => { (window as any).switchDrawerTab?.(1); });
    await page.waitForTimeout(200);
    // Backend validator: description max 2000 chars
    const descText = (data.description || ' ').slice(0, 1990);
    await page.fill('#mf-desc', descText);
    if (data.videoUrl)   await page.fill('#mf-video-url',  data.videoUrl);
    if (data.trailerId)  await page.fill('#mf-trailer-id', data.trailerId);

    // Add subtitles via admin panel's renderSubtitleRows()
    if (data.subtitles && data.subtitles.length > 0) {
      await page.evaluate((subs) => {
        (window as any).renderSubtitleRows?.(subs);
      }, data.subtitles.map(s => ({ lang: s.lang, label: s.label, url: s.url })));
    }

    // Switch back to Tab 0 so save button is accessible
    await page.evaluate(() => { (window as any).switchDrawerTab?.(0); });
    await page.waitForTimeout(300);

    // Click Save
    await page.click('#drawer-save-btn');

    // Wait for any toast to appear (success OR error), then react
    logger.log('Saqlanmoqda...');
    try {
      await page.waitForFunction(() => {
        const toast = document.getElementById('admin-toast');
        return toast && toast.style.opacity !== '0' && (toast.textContent?.trim().length ?? 0) > 0;
      }, { timeout: 15_000 });

      // Check if it's an error toast
      const toastText = await page.$eval('#admin-toast', (el: any) => el?.textContent?.trim() || '').catch(() => '');
      const isError = toastText.toLowerCase().includes('xato') ||
                      toastText.toLowerCase().includes('error') ||
                      toastText.toLowerCase().includes('shart') ||
                      toastText.toLowerCase().includes('validation') ||
                      toastText.toLowerCase().includes('failed');
      if (isError) {
        throw new Error(`Admin panel xatosi: ${toastText}`);
      }
      logger.ok(`Toast: ${toastText}`);
    } catch (toastErr: any) {
      if (toastErr.message?.startsWith('Admin panel xatosi')) throw toastErr;
      // Toast may have faded — no error means success
      logger.warn('Toast kuzatilmadi (timeout), davom etilmoqda...');
    }

    // Screenshot
    const ssPath = `screenshot_${data.title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.png`;
    await page.screenshot({ path: ssPath, fullPage: false });
    logger.ok(`Screenshot: ${ssPath}`);

    // Try to get the created movie ID from URL or recent movies list
    const movieId = await this.getLatestMovieId(data.title, data.year);
    return movieId;
  }

  private async getLatestMovieId(title: string, year: number): Promise<string> {
    try {
      return await this.apiClient.findExisting(title, year) || '';
    } catch {
      return '';
    }
  }

  async findExisting(title: string, year: number): Promise<string | null> {
    return this.apiClient.findExisting(title, year);
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
    this.page    = null;
  }
}

// ── FormData builder (for API mode) ──────────────────────────────────────────

function buildFD(data: MovieData, genreIds: string[]): FormData {
  const fd = new FormData();

  fd.append('title',       data.title);
  fd.append('description', data.description || ' ');
  fd.append('releaseYear', String(data.year));
  fd.append('type',        data.type        || 'movie');
  fd.append('ageRating',   String(data.ageRating  ?? 12));
  fd.append('imdbRating',  String(data.rating     ?? 0));
  fd.append('isFeatured',  'false');

  if (data.duration)   fd.append('duration',   String(data.duration));
  if (data.posterUrl)  fd.append('posterUrl',  data.posterUrl);
  if (data.bannerUrl)  fd.append('bannerUrl',  data.bannerUrl);
  if (data.videoUrl)   fd.append('videoUrl',   data.videoUrl);
  if (data.trailerId)  fd.append('trailerUrl', `https://www.youtube.com/watch?v=${data.trailerId}`);

  if (data.gallery?.length)  fd.append('gallery',   JSON.stringify(data.gallery));
  if (data.subtitles?.length) fd.append('subtitles', JSON.stringify(data.subtitles));
  else                        fd.append('subtitles', '[]');
  if (genreIds.length)       fd.append('genres',    genreIds.join(','));
  if (data.cast?.length)     fd.append('cast',      data.cast.join(','));

  if (data.type === 'series') {
    if (data.seasons)  fd.append('seasons',  String(data.seasons));
    if (data.episodes) fd.append('episodes', String(data.episodes));
  }

  return fd;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

// Age rating mapper from OMDB "Rated" field
export function ratedToAge(rated: string): number {
  switch (rated?.toUpperCase()) {
    case 'G':                    return 0;
    case 'PG':                   return 6;
    case 'PG-13': case 'TV-PG': return 12;
    case 'R':     case 'TV-14': return 16;
    case 'NC-17': case 'TV-MA': return 18;
    default:                     return 12;
  }
}
