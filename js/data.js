/* ═══════════════════════════════════════════════════════
   CInemaplex — localStorage holat helperlari (favorites,
   watchlist, likes, toast). Kontent to'liq API'dan keladi.
═══════════════════════════════════════════════════════ */

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
