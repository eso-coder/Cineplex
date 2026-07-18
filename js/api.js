/* ═══════════════════════════════════════════════════════
   CINEPLEX — Frontend API Client  (backend: localhost:5000)
═══════════════════════════════════════════════════════ */

/* API base:
   - When opened on localhost (dev machine) → talk to the backend on port 5000.
   - When served from any other host (ngrok / LAN IP / deployed) → use the SAME
     origin, because backend/src/app.js serves both the frontend files and the
     /api routes from one server. This is what makes remote devices work. */
const API_BASE = (function () {
  try {
    var h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '') {
      return 'http://localhost:5000/api';
    }
    return window.location.origin + '/api';
  } catch (e) {
    return 'http://localhost:5000/api';
  }
})();

/* ─── Token helpers ─── */
const Auth = {
  getToken()    { return localStorage.getItem('cp_token'); },
  setToken(t)   { localStorage.setItem('cp_token', t); },
  removeToken() { localStorage.removeItem('cp_token'); localStorage.removeItem('cp_user'); },
  getUser()     { try { return JSON.parse(localStorage.getItem('cp_user') || 'null'); } catch { return null; } },
  setUser(u)    { localStorage.setItem('cp_user', JSON.stringify(u)); },
  isLoggedIn()  { return !!this.getToken(); },
  isAdmin()     { const u = this.getUser(); return u && u.role === 'admin'; }
};

/* ─── Lightweight client cache (stale-while-revalidate) ───────────────────
   Saqlaydi: trending/new ro'yxati, hero filmlar, har bir film detali.
   Maqsad: qayta kirishda API javobini kutmasdan DARHOL ko'rsatish (qora ekran 0).
   Ishlash: avval cache'dan chizamiz, keyin fonda yangisini olib cache'ni yangilaymiz. */
const CPCache = {
  get(key) {
    try {
      const raw = localStorage.getItem('cpc_' + key);
      return raw ? JSON.parse(raw) : null; // { t, v }
    } catch { return null; }
  },
  set(key, v) {
    try { localStorage.setItem('cpc_' + key, JSON.stringify({ t: Date.now(), v })); }
    catch {
      // localStorage to'lib qolgan bo'lsa — eski film cache'larini tozalab qayta urinamiz
      try {
        Object.keys(localStorage).filter(k => k.startsWith('cpc_movie_')).slice(0, 50)
          .forEach(k => localStorage.removeItem(k));
        localStorage.setItem('cpc_' + key, JSON.stringify({ t: Date.now(), v }));
      } catch {}
    }
  },
  fresh(entry, maxAgeMs) { return !!entry && (Date.now() - entry.t) < maxAgeMs; }
};
if (typeof window !== 'undefined') window.CPCache = CPCache;

/* ─── Silent token refresh (singleton — avoids duplicate refresh calls) ───
   Backend refresh token'ni ROTATSIYA qiladi (har chaqiruvda eskisi
   bekor qilinib, yangisi qo'yiladi). Bir nechta tab ochiq bo'lsa, ikkala
   tab deyarli bir vaqtda o'z refresh so'rovini yuborishi mumkin — birinchisi
   muvaffaqiyatli bo'lib cookie'ni yangilaydi, ikkinchisi esa ALLAQACHON
   ESKIRGAN tokenni yuborib 401 oladi. Bunday holatda darhol chiqib
   ketish (logout) o'rniga, boshqa tab yangilagan cookie ulgurishi uchun
   qisqa kutib BIR MARTA qayta urinamiz. ── */
let _refreshInFlight = null;
function _requestRefresh() {
  return fetch(`${API_BASE}/auth/refresh-token`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
    .then(r => r.json().catch(() => ({})))
    .then(d => {
      if (d.success && d.data && d.data.accessToken) {
        Auth.setToken(d.data.accessToken);
        return true;
      }
      return false;
    })
    .catch(() => false);
}
async function _silentRefresh() {
  if (!_refreshInFlight) {
    _refreshInFlight = _requestRefresh()
      .then(async (ok) => {
        if (ok) return true;
        // Boshqa tab ulgurib rotatsiya qilgan bo'lishi mumkin — biroz kutib qayta urinamiz
        await new Promise(r => setTimeout(r, 400));
        return _requestRefresh();
      })
      .finally(() => { _refreshInFlight = null; });
  }
  return _refreshInFlight;
}

/* ─── Base fetch wrapper ─── */
async function apiFetch(path, opts = {}) {
  const token = Auth.getToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers, credentials: 'include' });
  const data = await res.json().catch(() => ({}));

  // Access token muddati tugagan — refresh token (cookie) orqali yangilash
  if (res.status === 401 && !path.startsWith('/auth/refresh')) {
    const refreshed = await _silentRefresh();
    if (refreshed) {
      const retryHeaders = { ...headers, 'Authorization': `Bearer ${Auth.getToken()}` };
      const retry = await fetch(`${API_BASE}${path}`, { ...opts, headers: retryHeaders, credentials: 'include' });
      const retryData = await retry.json().catch(() => ({}));
      if (!retry.ok) throw Object.assign(new Error(retryData.message || 'Xato yuz berdi'), { status: retry.status, data: retryData });
      return retryData;
    }
    // Refresh ham muddati tugagan — qayta kirish kerak
    Auth.removeToken();
  }

  if (!res.ok) throw Object.assign(new Error(data.message || 'Xato yuz berdi'), { status: res.status, data });
  return data;
}

/* ─── YouTube URL → embed URL converter ─── */
function getYouTubeEmbedUrl(url) {
  if (!url) return null;
  url = url.trim().replace(/^["']+|["']+$/g, '');
  // Already a bare 11-char ID
  if (/^[A-Za-z0-9_-]{11}$/.test(url)) return `https://www.youtube-nocookie.com/embed/${url}`;
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/
  );
  return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : null;
}

/* ─── Extract YouTube video ID from any YouTube URL or bare ID ─── */
function extractYouTubeId(url) {
  const embedUrl = getYouTubeEmbedUrl(url);
  if (!embedUrl) return null;
  const m = embedUrl.match(/\/embed\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/* ─── Field normalizer: maps backend shape → frontend expected field names ─── */
function normalizeMovie(m) {
  if (!m) return m;
  m.id          = (m._id || m.id || '').toString();
  m.img         = m.img || m.poster?.url || '';
  m.gallery     = m.gallery || [];
  // Banner uchun: avval haqiqiy bannerUrl, keyin gallereyadagi backdrop (posterdan
  // farqli, textsiz sahna), va faqat oxirgi chora sifatida poster. Bu hero rasm
  // poster bilan bir xil bo'lib, ustidagi yozuv logo bilan ikkilanib qolmasligi uchun.
  m.banner_img  = m.banner_img || m.bannerUrl || (m.gallery && m.gallery[0]) || m.img;
  m.rating      = m.rating != null ? m.rating : (m.imdbRating || m.averageRating || 0);
  m.year        = m.year || m.releaseYear || '';
  m.genre       = m.genre || (m.genres || []).map(g => (typeof g === 'object' ? g.name : g).toLowerCase());
  m.cast        = m.cast || [];
  m.description = m.description || '';
  m.type        = m.type || 'movie';
  // Multilingual: choose title/description for the active language, falling back to uz base
  (function () {
    var lang;
    try { lang = localStorage.getItem('cp_lang') || 'uz'; } catch (e) { lang = 'uz'; }
    m.title_uz = m.title || '';
    m.description_uz = m.description || '';
    if (lang === 'ru') {
      m.title = m.title_ru || m.title;
      m.description = m.description_ru || m.description;
    } else if (lang === 'en') {
      m.title = m.title_en || m.title;
      m.description = m.description_en || m.description;
    }
  })();
  m.age         = m.age != null ? m.age : (m.ageRating || 0);
  // Seriallar qismlari: [{season, number, title, videoUrl, duration, thumb}]
  m.episodeList = (m.episodeList || []).filter(e => e && e.videoUrl);
  m.seasons     = m.seasons || (m.episodeList.length ? new Set(m.episodeList.map(e => e.season || 1)).size : 0);
  m.episodes    = m.episodes || m.episodeList.length || 0;
  // Convert duration from minutes (number) → "2h 30m" string
  if (typeof m.duration === 'number' && m.duration > 0) {
    const h = Math.floor(m.duration / 60);
    const min = m.duration % 60;
    m.duration = h > 0 ? (min > 0 ? `${h}h ${min}m` : `${h}h`) : `${min}m`;
  }
  // Normalize trailer: handle both camelCase (trailerUrl) and snake_case (trailer_url)
  // Also handle bare YouTube IDs stored directly in the field
  if (!m.trailer_id) {
    const rawTrailer = m.trailerUrl || m.trailer_url || m.trailerID || '';
    if (rawTrailer) {
      const id = extractYouTubeId(rawTrailer);
      if (id) {
        m.trailer_id = id;
      } else if (/^https?:\/\//.test(rawTrailer)) {
        // S3 yoki to'g'ridan-to'g'ri video URL
        m.trailerS3Url = rawTrailer;
      } else {
        console.warn('[Trailer] Could not extract YouTube ID from:', rawTrailer);
      }
    }
  }
  // Strip surrounding quotes that may have been saved to DB accidentally
  if (m.videoUrl) m.videoUrl = m.videoUrl.trim().replace(/^["']+|["']+$/g, '');
  // Subtitle tracks: [{lang, label, url}]
  m.subtitles = (m.subtitles || []).filter(s => s && s.url);
  return m;
}

function normalizeUser(u) {
  if (!u) return u;
  if (u.avatar && typeof u.avatar === 'object') u.avatar = u.avatar.url || '';
  return u;
}

/* ─── Auth API ─── */
function _persistSession(resp) {
  if (resp && resp.data && resp.data.accessToken) {
    Auth.setToken(resp.data.accessToken);
    const user = normalizeUser(resp.data.user);
    if (user) Auth.setUser(user);
  }
  return resp;
}

const AuthAPI = {
  async register(name, email, password) {
    const resp = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    Auth.setToken(resp.data.accessToken);
    const user = normalizeUser(resp.data.user);
    Auth.setUser(user);
    return resp;
  },

  /* ── New Letterboxd-style auth ── */
  // Step 1: submit signup details → server emails a 6-digit OTP.
  async signup({ firstName, lastName, email, phone, password }) {
    const resp = await apiFetch('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ firstName, lastName, email, phone, password }),
    });
    return resp.data; // { email, otpSent, delivered, devCode? }
  },

  // Step 2: verify the OTP → account is created and a session is returned.
  async verifyOtp(email, code) {
    const resp = await apiFetch('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, code }) });
    return _persistSession(resp);
  },

  async resendOtp(email) {
    const resp = await apiFetch('/auth/resend-otp', { method: 'POST', body: JSON.stringify({ email }) });
    return resp.data; // { email, delivered, devCode? }
  },

  async signin(email, password) {
    const resp = await apiFetch('/auth/signin', { method: 'POST', body: JSON.stringify({ email, password }) });
    return _persistSession(resp);
  },

  // Public OAuth config — qaysi providerlar (Google/Apple) yoqilganini qaytaradi
  async oauthConfig() {
    const resp = await apiFetch('/auth/config');
    return resp.data; // { google:{clientId,enabled}, apple:{clientId,enabled} }
  },

  // OAuth — pass a real provider token, or an email for stub mode.
  async google({ token, email, firstName, lastName } = {}) {
    const resp = await apiFetch('/auth/google', { method: 'POST', body: JSON.stringify({ token, email, firstName, lastName }) });
    return _persistSession(resp);
  },

  async apple({ token, credential, email, firstName, lastName } = {}) {
    const resp = await apiFetch('/auth/apple', { method: 'POST', body: JSON.stringify({ token, credential, email, firstName, lastName }) });
    return _persistSession(resp);
  },

  async login(email, password) {
    const resp = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    Auth.setToken(resp.data.accessToken);
    const user = normalizeUser(resp.data.user);
    Auth.setUser(user);
    return resp;
  },

  async me() {
    const resp = await apiFetch('/auth/me');
    const user = normalizeUser(resp.data);
    Auth.setUser(user);
    return user;
  },

  // Accepts either a plain name string (legacy) or a fields object.
  async updateProfile(fields) {
    const body = typeof fields === 'string' ? { name: fields } : (fields || {});
    const resp = await apiFetch('/auth/update-profile', { method: 'PATCH', body: JSON.stringify(body) });
    const user = normalizeUser(resp.data);
    Auth.setUser(user);
    return user;
  },

  async changePassword(current, newPassword) {
    return apiFetch('/auth/change-password', { method: 'PATCH', body: JSON.stringify({ currentPassword: current, newPassword }) });
  },

  // Save avatar as URL or base64 data URL (no file upload needed — works on Vercel)
  async saveAvatarUrl(dataUrl) {
    const resp = await apiFetch('/auth/avatar-url', { method: 'PATCH', body: JSON.stringify({ avatarUrl: dataUrl }) });
    const url = resp.data?.avatarUrl || dataUrl;
    const user = Auth.getUser() || {};
    user.avatar = url;
    Auth.setUser(user);
    return url;
  },

  async saveCoverUrl(dataUrl) {
    const resp = await apiFetch('/auth/cover-url', { method: 'PATCH', body: JSON.stringify({ coverUrl: dataUrl }) });
    const url = resp.data?.coverImageUrl || dataUrl;
    const user = Auth.getUser() || {};
    user.coverImageUrl = url;
    Auth.setUser(user);
    return url;
  },

  async uploadAvatar(file) {
    const token = Auth.getToken();
    const form  = new FormData();
    form.append('avatar', file);
    const res  = await fetch(`${API_BASE}/auth/upload-avatar`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || 'Upload failed'), { status: res.status });
    const raw = data.data && data.data.avatar;
    const url = raw ? (typeof raw === 'object' ? raw.url : raw) : null;
    if (url) {
      const user = Auth.getUser() || {};
      user.avatar = url;
      Auth.setUser(user);
    }
    return url;
  },

  async uploadCover(file) {
    const token = Auth.getToken();
    const form = new FormData();
    form.append('cover', file);
    const res = await fetch(`${API_BASE}/auth/upload-cover`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.message || 'Upload failed'), { status: res.status });
    const url = data.data && (data.data.coverImageUrl || (data.data.coverImage && data.data.coverImage.url));
    if (url) {
      const user = Auth.getUser() || {};
      user.coverImageUrl = url;
      Auth.setUser(user);
    }
    return url;
  },

  logout() {
    apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    Auth.removeToken();
    window.location.href = '/index.html';
  }
};

/* ─── Profile / Activity / Favourites API ─── */
const ProfileAPI = {
  async get(userId) {
    const resp = await apiFetch(`/profile/${userId}`);
    return resp.data; // { user, stats }
  },
  async stats(userId) {
    const resp = await apiFetch(`/profile/${userId}/stats`);
    return resp.data;
  },
};

const ActivityAPI = {
  async get(userId, limit = 5) {
    const resp = await apiFetch(`/activity/${userId}?limit=${limit}`);
    return resp.data || [];
  },
};

const FavouritesAPI = {
  async get(userId) {
    const resp = await apiFetch(`/favourites/${userId}`);
    return resp.data || [];
  },
  async add(filmId) {
    const resp = await apiFetch('/favourites', { method: 'POST', body: JSON.stringify({ filmId }) });
    return resp.data;
  },
  async remove(filmId) {
    const resp = await apiFetch(`/favourites/${filmId}`, { method: 'DELETE' });
    return resp.data;
  },
};

/* ─── Movies API ─── */
const MoviesAPI = {
  async list(params = {}) {
    if (!params.page) params.page = 1;
    const resp = await apiFetch('/movies?' + new URLSearchParams(params));
    if (Array.isArray(resp.data)) resp.data = resp.data.map(normalizeMovie);
    return resp;
  },

  async trending() {
    const resp = await apiFetch('/movies/trending');
    return (resp.data || []).map(normalizeMovie);
  },

  /* Yangi chiqmalar — sessiya keshi bilan: bir marta 100 talik ro'yxat
     olinadi va 5 daqiqa sessionStorage'da turadi. Istalgan sahifadan
     kelgan so'rov shu keshdan kesib olinadi — new sahifasi (3D devor)
     ochilganda tarmoq kutilmaydi. */
  async newMovies(limit = 20) {
    const KEY = 'cp_new100';
    try {
      const c = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (c && Date.now() - c.t < 5 * 60 * 1000 && c.data.length >= Math.min(limit, c.total)) {
        return c.data.slice(0, limit).map(normalizeMovie);
      }
    } catch (e) {}
    const resp = await apiFetch('/movies?' + new URLSearchParams({ sort: 'newest', limit: Math.max(limit, 100), page: 1 }));
    const raw = resp.data || [];
    try {
      const total = (resp.pagination && resp.pagination.total) || raw.length;
      sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), total, data: raw }));
    } catch (e) {}
    return raw.slice(0, limit).map(normalizeMovie);
  },

  async getById(id) {
    const resp = await apiFetch(`/movies/${id}`);
    // Increment view counter in background
    apiFetch(`/movies/${id}/view`, { method: 'POST' }).catch(() => {});
    const related = Array.isArray(resp.data.related) ? resp.data.related.map(normalizeMovie) : [];
    return { movie: normalizeMovie(resp.data), related };
  },

  async search(q) {
    const resp = await apiFetch('/movies?' + new URLSearchParams({ search: q, limit: 20, page: 1 }));
    if (Array.isArray(resp.data)) resp.data = resp.data.map(normalizeMovie);
    return resp;
  },

  async byGenre(genre) {
    const resp = await apiFetch('/movies?' + new URLSearchParams({ genre, limit: 50, page: 1 }));
    if (Array.isArray(resp.data)) resp.data = resp.data.map(normalizeMovie);
    return resp;
  },

  // Admin
  create(data)   { return apiFetch('/admin/movies', { method: 'POST', body: JSON.stringify(data) }); },
  update(id, d)  { return apiFetch(`/admin/movies/${id}`, { method: 'PATCH', body: JSON.stringify(d) }); },
  delete(id)     { return apiFetch(`/admin/movies/${id}`, { method: 'DELETE' }); }
};

/* ─── Watchlist API ─── */
const WatchlistAPI = {
  async get() {
    const resp = await apiFetch('/movies/user/watchlist');
    return (resp.data || []).map(normalizeMovie);
  },

  async toggle(movieId) {
    const resp = await apiFetch(`/movies/${movieId}/watchlist`, { method: 'POST' });
    const added = !!(resp.message && resp.message.toLowerCase().includes('added'));
    return { added, message: resp.message };
  },

  remove(movieId) { return this.toggle(movieId); }
};

/* ─── Watch progress / history ("davom ettirish" + ko'rilganlar tarixi) ─── */
const ProgressAPI = {
  async get(movieId) {
    if (typeof Auth === 'undefined' || !Auth.isLoggedIn()) return { progress: 0, duration: 0 };
    try {
      const resp = await apiFetch(`/movies/${movieId}/progress`);
      return resp.data;
    } catch { return { progress: 0, duration: 0 }; }
  },

  save(movieId, progress, duration) {
    if (typeof Auth === 'undefined' || !Auth.isLoggedIn()) return Promise.resolve();
    return apiFetch(`/movies/${movieId}/progress`, {
      method: 'POST',
      body: JSON.stringify({ progress, duration }),
    }).catch(() => {});
  },

  async history() {
    if (typeof Auth === 'undefined' || !Auth.isLoggedIn()) return [];
    try {
      const resp = await apiFetch('/movies/user/history');
      return (resp.data || []).map(normalizeMovie);
    } catch { return []; }
  },
};
if (typeof window !== 'undefined') window.ProgressAPI = ProgressAPI;

/* ─── Watch session API (CloudFront signed cookie orqali video himoyasi) ───
   videoUrl — ixtiyoriy: aynan qaysi video (film yoki bitta serial qismi)
   ijro etilishini bildiradi, backend shu videoUrl S3 papkasi uchun 6 soatlik
   cookie beradi va CloudFront'ga qayta yo'naltirilgan videoUrl'ni qaytaradi.
   CloudFront sozlanmagan bo'lsa backend originalUrl'ni o'zgarishsiz qaytaradi. */
const WatchAPI = {
  async start(movieId, videoUrl) {
    return apiFetch(`/watch/${movieId}/start`, {
      method: 'POST',
      body: JSON.stringify(videoUrl ? { videoUrl } : {}),
    });
  },
};

/* ─── Reviews (Comments + Ratings) API ─── */
const ReviewsAPI = {
  async getByMovie(movieId, page = 0) {
    const resp = await apiFetch(`/comments/movie/${movieId}?page=${page + 1}&limit=20`);
    const comments = (resp.data || []).map(c => ({
      id:          (c._id || c.id || '').toString(),
      user_name:   c.user?.name || 'Foydalanuvchi',
      user_avatar: (c.user && (typeof c.user.avatar === 'object' ? c.user.avatar?.url : c.user.avatar)) || '',
      rating:      0,
      created_at:  c.createdAt || new Date().toISOString(),
      body:        c.text || '',
      helpful:     (c.likes || []).length,
    }));
    return { data: comments, total: resp.pagination?.total ?? comments.length };
  },

  async create(movieId, rating, body) {
    await Promise.all([
      apiFetch(`/comments/movie/${movieId}`, { method: 'POST', body: JSON.stringify({ text: body }) }),
      apiFetch(`/ratings/movie/${movieId}`,  { method: 'POST', body: JSON.stringify({ score: rating }) }),
    ]);
  },

  async update(id, rating, body) {
    return apiFetch(`/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ text: body }) });
  },

  delete(id)  { return apiFetch(`/comments/${id}`, { method: 'DELETE' }); },
  helpful(id) { return apiFetch(`/comments/${id}/like`, { method: 'POST' }); },

  async mine() {
    const resp = await apiFetch('/comments/user/mine');
    return (resp.data || []).map(c => ({
      id: (c._id || '').toString(),
      movieId: (c.movie?._id || '').toString(),
      title: c.movie?.title || '',
      poster: c.movie?.poster?.url || c.movie?.bannerUrl || '',
      year: c.movie?.releaseYear || '',
      body: c.text || '',
      created_at: c.createdAt || '',
    }));
  },
};

/* ─── Settings API (bosh sahifa hero konfiguratsiyasi — backend'da saqlanadi) ─── */
const SettingsAPI = {
  async hero() {
    const resp = await apiFetch('/settings/hero');
    const d = resp.data || {};
    return { items: Array.isArray(d.items) ? d.items : [], clickable: d.clickable !== false };
  },
};
if (typeof window !== 'undefined') window.SettingsAPI = SettingsAPI;

/* ─── Admin API ─── */
const AdminAPI = {
  stats()               { return apiFetch('/admin/dashboard'); },
  saveHero(cfg)         { return apiFetch('/admin/hero', { method: 'POST', body: JSON.stringify(cfg) }); },
  users(params = {})    { return apiFetch('/admin/users?' + new URLSearchParams(params)); },
  setUserRole(id, role) { return apiFetch(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) }); },
  deleteUser(id)        { return apiFetch(`/admin/users/${id}`, { method: 'DELETE' }); },
  reviews(params = {})  { return apiFetch('/admin/comments?' + new URLSearchParams(params)); },
  deleteReview(id)      { return apiFetch(`/admin/comments/${id}`, { method: 'DELETE' }); }
};

/* ─── Watchlist toggle — localStorage cp_watchlist + backend if logged in ─── */
async function toggleWatchlistCard(btn) {
  const id    = btn.dataset.id;
  const title = btn.dataset.title || '';
  const img   = btn.dataset.img   || '';
  const year  = btn.dataset.year  || '';
  const movie = { id: String(id), title, img, year, posterUrl: img };

  // Always save to localStorage so profile Watchlist tab sees it instantly
  const added = toggleWatchlistLocal(movie);
  btn.classList.toggle('active', added);

  // Also sync to backend if logged in (best-effort)
  if (Auth.isLoggedIn()) {
    WatchlistAPI.toggle(id).catch(() => {});
  }
}

/* ─── Like toggle — always localStorage (shown in profile likes tab) ─── */
function toggleLikeCard(btn) {
  const id    = btn.dataset.id;
  const title = btn.dataset.title || '';
  const img   = btn.dataset.img   || '';
  const year  = btn.dataset.year  || '';
  const movie = { id: String(id), title, img, year, posterUrl: img };
  const added = toggleLike(movie);
  btn.classList.toggle('active', added);
}

/* ─── Smart toggleFavorite — backend if logged in, localStorage fallback ─── */
async function toggleFavoriteAPI(id) {
  if (Auth.isLoggedIn()) {
    try {
      const data = await WatchlistAPI.toggle(id);
      showToast(data.added ? "Ro'yxatga qo'shildi" : "Ro'yxatdan olib tashlandi");
      return data.added;
    } catch (e) {
      showToast('Xato: ' + e.message);
      return false;
    }
  } else {
    return toggleFavorite(id);
  }
}

/* ─── Auth UI helpers ─── */
function updateNavAuth() {
  const user = Auth.getUser();
  const nameEl   = document.getElementById('profile-name');
  const avatarEl = document.getElementById('profile-avatar');

  if (user && nameEl)   nameEl.textContent = user.name;
  if (user && avatarEl && user.avatar) avatarEl.src = user.avatar;

  const loginBtn = document.getElementById('nav-login-btn');
  if (loginBtn) loginBtn.style.display = user ? 'none' : 'flex';

  const adminLink = document.getElementById('nav-admin-link');
  if (adminLink) adminLink.style.display = Auth.isAdmin() ? 'flex' : 'none';
}

document.addEventListener('DOMContentLoaded', updateNavAuth);

/* ─── Yangi chiqmalar keshini oldindan isitish ───
   Foydalanuvchi saytning istalgan sahifasiga kirganda, brauzer bo'sh
   qolganda ro'yxat + old posterlar + video manifestlari yengil prefetch
   qilinadi — new sahifasi (3D devor) ochilganda hammasi tayyor bo'ladi.
   Sessiyada bir marta; lite rejim va saveData'da o'chiq. */
(function warmNewMovies() {
  if (window.CP_LITE) return;
  try {
    if (navigator.connection && navigator.connection.saveData) return;
    if (sessionStorage.getItem('cp_warmed')) return;
  } catch (e) { return; }
  const run = () => {
    MoviesAPI.newMovies(100).then((list) => {
      try { sessionStorage.setItem('cp_warmed', '1'); } catch (e) {}
      list.slice(0, 12).forEach((m) => { if (m.img) { new Image().src = m.img; } });
      list.slice(0, 8).forEach((m) => {
        const u = m.videoUrl || '';
        if (/\.m3u8(\?|#|$)/i.test(u)) fetch(u, { priority: 'low' }).catch(() => {});
      });
    }).catch(() => {});
  };
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 6000 });
  else setTimeout(run, 2500);
})();
