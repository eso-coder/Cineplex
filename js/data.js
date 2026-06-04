/* ═══════════════════════════════════════════════════════
   CInemaplex — Movie & Series Dataset
   All content is managed from the Admin Panel.
═══════════════════════════════════════════════════════ */

const MOVIES = [];

/* ── YouTube Trailer IDs ── */
const TRAILERS = {};

/* ── Trailer IDs (YouTube) ── */
const TRAILER_IDS = {};

/* ── Helpers ── */
function getMovieById(id) {
  return MOVIES.find(m => m.id === +id) || null;
}
function getTrending() {
  return MOVIES.filter(m => m.isTrending);
}
function getNew() {
  return MOVIES.filter(m => m.isNew);
}
function getMoviesOnly() {
  return MOVIES.filter(m => m.type === 'movie');
}
function getSeriesOnly() {
  return MOVIES.filter(m => m.type === 'series');
}
function getByGenre(genre) {
  if (!genre || genre === 'all') return MOVIES;
  return MOVIES.filter(m => m.genre.includes(genre));
}
function searchMovies(q) {
  const query = q.toLowerCase().trim();
  if (!query) return [];
  return MOVIES.filter(m => m.title.toLowerCase().includes(query) || m.genre.some(g => g.includes(query)));
}
function getRelated(movie) {
  return MOVIES.filter(m => m.id !== movie.id && m.genre.some(g => movie.genre.includes(g))).slice(0, 8);
}

/* ── Favorites / Watchlist (localStorage) ── */
function getFavorites() {
  try { return JSON.parse(localStorage.getItem('cp_favs') || '[]'); } catch { return []; }
}
function toggleFavorite(id) {
  const key = String(id);
  let favs = getFavorites().map(String);
  const i = favs.indexOf(key);
  if (i === -1) { favs.push(key); showToast('Added to Watchlist'); }
  else { favs.splice(i, 1); showToast('Removed from Watchlist'); }
  localStorage.setItem('cp_favs', JSON.stringify(favs));
  return i === -1;
}
function isFavorite(id) {
  return getFavorites().map(String).includes(String(id));
}

/* ── Watchlist with full movie objects (localStorage) ── */
function getWatchlistItems() {
  try { return JSON.parse(localStorage.getItem('cp_watchlist') || '[]'); } catch { return []; }
}
function toggleWatchlistLocal(movie) {
  if (!movie || !movie.id) return false;
  let items = getWatchlistItems();
  const idx = items.findIndex(m => String(m.id) === String(movie.id));
  let added;
  if (idx === -1) {
    items.push(movie);
    added = true;
    showToast('Added to Watchlist');
  } else {
    items.splice(idx, 1);
    added = false;
    showToast('Removed from Watchlist');
  }
  localStorage.setItem('cp_watchlist', JSON.stringify(items));
  return added;
}
function isInWatchlist(id) {
  return getWatchlistItems().some(m => String(m.id) === String(id));
}

/* ── Likes (localStorage) ── */
function getLikes() {
  try { return JSON.parse(localStorage.getItem('cp_likes') || '[]'); } catch { return []; }
}
function toggleLike(movie) {
  if (!movie || !movie.id) return false;
  let items = getLikes();
  const idx = items.findIndex(m => String(m.id) === String(movie.id));
  let added;
  if (idx === -1) {
    items.push(movie);
    added = true;
    showToast("Yoqdi ♥");
  } else {
    items.splice(idx, 1);
    added = false;
    showToast("Yoqdi ro'yxatidan olib tashlandi");
  }
  localStorage.setItem('cp_likes', JSON.stringify(items));
  return added;
}
function isLiked(id) {
  return getLikes().some(m => String(m.id) === String(id));
}

/* ── Toast ── */
function showToast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2800);
}
