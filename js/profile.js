/* ═══════════════════════════════════════════════════════
   CINEPLEX — Profile page controller (Letterboxd-style)
   Loads the signed-in user's profile when available; otherwise
   falls back to a rich demo profile so the page is never empty.
═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Image resize utility ──────────────────────────────────────────────────
     Canvas yordamida rasmni kichraytiradi va JPEG data URL qaytaradi.
     Vercel'da file upload ishlamagani uchun data URL DB'ga saqlanadi.         */
  function resizeImage(file, maxW, maxH, cb) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        var ratio = Math.min(maxW / w, maxH / h, 1);
        var canvas = document.createElement('canvas');
        canvas.width  = Math.round(w * ratio);
        canvas.height = Math.round(h * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        cb(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  App.initNavbar('', '../');

  var ICON = {
    pin: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    link: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    at: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>',
    heart: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  };

  /* ── Demo dataset (mirrors the reference design) ── */
  var DEMO = {
    isDemo: true,
    user: {
      name: 'lorie',
      isPatron: true,
      location: 'cottage',
      website: 'folklore.com',
      socialHandle: 'tsfolklore',
      avatarUrl: '',
      coverImageUrl: '',
    },
    stats: { films: 1954, thisYear: 274, lists: 121, following: 343, followers: '30K' },
    favourites: [
      { title: 'Pride & Prejudice', year: 2005 },
      { title: 'Carol', year: 2015 },
      { title: 'Brokeback Mountain', year: 2005 },
      { title: 'Marriage Story', year: 2019 },
      { title: 'Little Women', year: 2019 },
      { title: 'Emma', year: 2020 },
      { title: 'Princess Mononoke', year: 1997 },
      { title: 'Peter Pan', year: 2003 },
      { title: 'The Lord of the Rings', year: 2001 },
    ],
    activity: [
      { title: "The Children's Hour", year: 1961, rating: 4, liked: true },
      { title: 'Emma', year: 2020, rating: 4.5, liked: true },
      { title: 'Peter Pan', year: 2003, rating: 4, liked: false },
      { title: 'Princess Mononoke', year: 1997, rating: 5, liked: true },
      { title: 'The Lord of the Rings', year: 2001, rating: 4.5, liked: false },
    ],
  };

  var current = null;     // { user, stats }
  var allFavourites = []; // full favourites list
  var favExpanded = false;
  var isDemo = false;

  /* ── Render helpers ── */
  function fmtStat(n) {
    if (typeof n === 'string') return n;          // pre-formatted (e.g. "30K")
    if (n == null) return '0';
    return Number(n).toLocaleString('en-US');     // 1954 → "1,954"
  }

  function stars(rating) {
    rating = rating || 0;
    var full = Math.floor(rating);
    var half = rating - full >= 0.5;
    var out = '';
    for (var i = 0; i < 5; i++) {
      if (i < full) {
        out += '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
      } else if (i === full && half) {
        out += '<svg width="12" height="12" viewBox="0 0 24 24"><defs><linearGradient id="h' + i + '"><stop offset="50%" stop-color="currentColor"/><stop offset="50%" stop-color="transparent"/></linearGradient></defs><path fill="url(#h' + i + ')" stroke="currentColor" stroke-width="1" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
      } else {
        out += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.3"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
      }
    }
    return out;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  // A single poster card. `film` = { id, title, year, posterUrl }
  function posterCard(film, opts) {
    opts = opts || {};
    var href = film.id ? "App.go('movie.html?id=" + film.id + "')" : '';
    var img = film.posterUrl
      ? '<img src="' + esc(film.posterUrl) + '" alt="' + esc(film.title) + '" loading="lazy" onload="this.style.opacity=1" onerror="this.style.display=\'none\'">'
      : '';
    return '' +
      '<div class="pf2-poster" ' + (href ? 'onclick="' + href + '"' : '') + ' style="animation-delay:' + (opts.delay || 0) + 'ms">' +
        '<div class="pf2-poster-fallback"><span class="pf-fb-title">' + esc(film.title) + '</span><span class="pf-fb-year">' + esc(film.year || '') + '</span></div>' +
        img +
        '<div class="pf2-poster-hover"><div class="ph-title">' + esc(film.title) + '</div><div class="ph-year">' + esc(film.year || '') + '</div></div>' +
      '</div>';
  }

  /* ── Identity / meta / stats ── */
  function renderHeader(user, stats) {
    document.getElementById('pf2-username').textContent = user.name || 'User';
    document.getElementById('pf2-patron').style.display = user.isPatron ? '' : 'none';

    // avatar
    var avFb = document.getElementById('pf2-av-fallback');
    avFb.textContent = (user.name || '?').trim().charAt(0).toUpperCase();
    if (user.avatarUrl) setAvatar(user.avatarUrl);

    // cover
    if (user.coverImageUrl) setCover(user.coverImageUrl);

    // meta row
    var meta = [];
    if (user.location) meta.push('<span class="pf2-meta-item">' + ICON.pin + esc(user.location) + '</span>');
    if (user.website) {
      var url = /^https?:\/\//.test(user.website) ? user.website : 'https://' + user.website;
      meta.push('<span class="pf2-meta-item">' + ICON.link + '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(user.website) + '</a></span>');
    }
    if (user.socialHandle) meta.push('<span class="pf2-meta-item">' + ICON.at + esc(user.socialHandle) + '</span>');
    document.getElementById('pf2-meta').innerHTML = meta.join('');

    // stats
    var s = stats || {};
    var statDefs = [
      ['films', 'Films'], ['thisYear', 'This Year'], ['lists', 'Lists'],
      ['following', 'Following'], ['followers', 'Followers'],
    ];
    document.getElementById('pf2-stats').innerHTML = statDefs.map(function (d) {
      return '<div class="pf2-stat"><div class="pf2-stat-num">' + fmtStat(s[d[0]] != null ? s[d[0]] : 0) + '</div><div class="pf2-stat-label">' + d[1] + '</div></div>';
    }).join('');
  }

  function setAvatar(url) {
    var av = document.getElementById('pf2-avatar');
    var img = av.querySelector('img.pf2-av-photo');
    if (!img) {
      img = document.createElement('img');
      img.className = 'pf2-av-photo';
      av.insertBefore(img, av.querySelector('.pf2-av-overlay'));
    }
    img.onerror = function () { img.remove(); };
    img.src = url;
    document.getElementById('pf2-av-fallback').style.display = 'none';
  }

  function setCover(url) {
    var img = document.getElementById('pf2-cover-img');
    img.onload = function () { img.classList.add('loaded'); };
    img.onerror = function () { img.classList.remove('loaded'); };
    img.src = url;
  }

  /* ── Favourites ── */
  function renderFavourites() {
    var grid = document.getElementById('pf2-fav-grid');
    var list = favExpanded ? allFavourites : allFavourites.slice(0, 5);
    if (!list.length) {
      grid.innerHTML = '<div class="pf2-empty" style="grid-column:1/-1">No favourite films yet.</div>';
      return;
    }
    var html = list.map(function (f, i) {
      var card = posterCard(f, { delay: i * 40 });
      // 5th card (index 4) gets the "Show more" affordance when collapsed and there are more.
      if (!favExpanded && i === 4 && allFavourites.length > 5) {
        return '<div class="pf2-showmore-wrap">' +
          '<button class="pf2-showmore" id="pf2-showmore">Show more</button>' + card + '</div>';
      }
      return card;
    }).join('');
    grid.innerHTML = html;

    var btn = document.getElementById('pf2-showmore');
    if (btn) btn.addEventListener('click', function () { favExpanded = true; renderFavourites(); });
  }

  /* ── Recent activity ── */
  function renderActivity(items) {
    var grid = document.getElementById('pf2-act-grid');
    if (!items.length) {
      grid.innerHTML = '<div class="pf2-empty" style="grid-column:1/-1">No recent activity.</div>';
      return;
    }
    grid.innerHTML = items.slice(0, 5).map(function (f, i) {
      // Card wrapper stays visible; only the inner poster plays the entrance.
      return '<div class="pf2-act-card" style="opacity:1;transform:none;animation:none">' +
        posterCard(f, { delay: i * 40 }) +
        '<div class="pf2-meta-under">' +
          '<span class="pf2-stars">' + stars(f.rating) + '</span>' +
          '<span class="pf2-like' + (f.liked ? '' : ' off') + '">' + ICON.heart + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ── Settings tab actions ── */
  function wireSettings() {
    // Profilni tahrirlash → profil rasmini almashtirish (mavjud edit imkoniyati)
    var edit = document.getElementById('set-edit');
    if (edit) edit.addEventListener('click', function () {
      var av = document.getElementById('pf2-avatar');
      if (av) av.click();
    });

    // Parolni o'zgartirish
    var pass = document.getElementById('set-password');
    if (pass) pass.addEventListener('click', function () {
      if (typeof Auth === 'undefined' || !Auth.isLoggedIn()) {
        if (window.AuthModal) AuthModal.open('signin');
        return;
      }
      var current = window.prompt('Joriy parolingiz:');
      if (!current) return;
      var next = window.prompt('Yangi parol (kamida 6 belgi):');
      if (!next) return;
      if (next.length < 6) { if (window.showToast) showToast('Parol kamida 6 belgi bo\'lishi kerak'); return; }
      AuthAPI.changePassword(current, next)
        .then(function () { if (window.showToast) showToast('Parol o\'zgartirildi ✓'); })
        .catch(function (e) { if (window.showToast) showToast(e.message || 'Xato yuz berdi'); });
    });

    // Chiqish
    var logout = document.getElementById('set-logout');
    if (logout) logout.addEventListener('click', function () {
      if (typeof AuthAPI !== 'undefined') AuthAPI.logout();
      else { localStorage.removeItem('cp_token'); localStorage.removeItem('cp_user'); window.location.href = '../index.html'; }
    });
  }

  /* ── Tabs ── */
  function setTab(tab) {
    document.querySelectorAll('.pf2-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    var profileView = document.getElementById('view-profile');
    var genericView = document.getElementById('view-generic');
    var settingsView = document.getElementById('view-settings');

    // hide all
    profileView.style.display = 'none';
    genericView.style.display = 'none';
    if (settingsView) settingsView.style.display = 'none';

    if (tab === 'profile') {
      profileView.style.display = '';
      return;
    }
    if (tab === 'settings') {
      if (settingsView) settingsView.style.display = '';
      return;
    }
    genericView.style.display = '';
    renderGeneric(tab);
  }

  function renderGeneric(tab) {
    var titleEl = document.getElementById('pf2-generic-title');
    var grid = document.getElementById('pf2-generic-grid');
    var empty = document.getElementById('pf2-generic-empty');
    var titles = { films: 'Films', activity: 'Activity', reviews: 'Reviews', watchlist: 'Watchlist', likes: 'Likes' };
    titleEl.textContent = titles[tab] || 'Films';

    var data = genericData(tab);
    if (!data.length) {
      grid.innerHTML = '';
      empty.style.display = '';
      empty.textContent = tab === 'reviews' ? 'No reviews yet.' : 'Nothing here yet.';
      return;
    }
    empty.style.display = 'none';
    grid.innerHTML = data.map(function (f, i) { return posterCard(f, { delay: i * 30 }); }).join('');
  }

  function genericData(tab) {
    if (!current) return [];
    if (tab === 'films') return current.films || allFavourites;
    if (tab === 'activity') return (current.activity || []);

    if (tab === 'watchlist') {
      // localStorage watchlist (cp_watchlist) — to'liq kino obyektlari saqlanadi
      var wlStored = [];
      try { wlStored = JSON.parse(localStorage.getItem('cp_watchlist') || '[]'); } catch (e) {}
      if (wlStored.length) {
        return wlStored.map(function (m) {
          return { id: m.id || m._id, title: m.title, year: m.year, posterUrl: m.posterUrl || m.img || m.poster || '' };
        });
      }
      // backend watchlist fallback
      return (current.watchlist || []);
    }

    if (tab === 'likes') {
      var likeStored = [];
      try { likeStored = JSON.parse(localStorage.getItem('cp_likes') || '[]'); } catch (e) {}
      if (likeStored.length) {
        return likeStored.map(function (m) {
          return { id: m.id, title: m.title, year: m.year, posterUrl: m.posterUrl || m.img || '' };
        });
      }
      // demo mode fallback: activity liked items
      return (current.activity || []).filter(function (f) { return f.liked; });
    }

    if (tab === 'reviews') return [];
    return [];
  }

  /* ── Uploads ── */
  function wireUploads() {
    var avInput = document.getElementById('pf2-avatar-input');
    var coverInput = document.getElementById('pf2-cover-input');

    document.getElementById('pf2-avatar').addEventListener('click', function () { avInput.click(); });
    document.getElementById('pf2-cover-edit').addEventListener('click', function () { coverInput.click(); });

    avInput.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      resizeImage(file, 400, 400, function (dataUrl) {
        setAvatar(dataUrl); // ko'rsat
        if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
          AuthAPI.saveAvatarUrl(dataUrl)
            .then(function (url) {
              if (url) setAvatar(url);
              if (App && App.refreshNavbarUser) App.refreshNavbarUser();
              showToast('Profil rasm saqlandi ✓');
            })
            .catch(function (err) { showToast('Xato: ' + err.message); });
        } else {
          showToast("Saqlash uchun tizimga kiring");
        }
      });
    });

    coverInput.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      resizeImage(file, 1400, 500, function (dataUrl) {
        setCover(dataUrl);
        if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
          AuthAPI.saveCoverUrl(dataUrl)
            .then(function (url) { if (url) setCover(url); showToast('Cover saqlandi ✓'); })
            .catch(function (err) { showToast('Xato: ' + err.message); });
        } else {
          showToast("Saqlash uchun tizimga kiring");
        }
      });
    });
  }

  /* ── Boot ── */
  function applyDemo() {
    isDemo = true;
    current = { user: DEMO.user, stats: DEMO.stats, activity: DEMO.activity, films: DEMO.favourites, watchlist: [] };
    allFavourites = DEMO.favourites.slice();
    var badge = document.getElementById('pf2-demo');
    badge.style.display = '';
    badge.addEventListener('click', function () { if (window.AuthModal) AuthModal.open('signin'); });
    renderHeader(DEMO.user, DEMO.stats);
    renderFavourites();
    renderActivity(DEMO.activity);
  }

  async function loadReal() {
    var cached = Auth.getUser();
    var user = cached;
    try { user = await AuthAPI.me(); } catch (e) { if (!user) throw e; }
    var userId = user._id || user.id;

    renderHeader(user, {}); // paint identity immediately

    var stats = {}, activity = [], favourites = [];
    try {
      var results = await Promise.all([
        ProfileAPI.stats(userId).catch(function () { return {}; }),
        ActivityAPI.get(userId, 5).catch(function () { return []; }),
        FavouritesAPI.get(userId).catch(function () { return []; }),
      ]);
      stats = results[0] || {};
      activity = results[1] || [];
      favourites = results[2] || [];
    } catch (e) { /* keep defaults */ }

    current = { user: user, stats: stats, activity: activity, films: favourites, watchlist: [] };
    allFavourites = favourites;

    // Load watchlist for the Watchlist tab (best-effort)
    if (typeof WatchlistAPI !== 'undefined') {
      WatchlistAPI.get().then(function (movies) {
        current.watchlist = (movies || []).map(function (m) {
          return { id: m.id, title: m.title, year: m.year, posterUrl: m.img };
        });
      }).catch(function () {});
    }

    renderHeader(user, stats);
    renderFavourites();
    renderActivity(activity);
  }

  function boot() {
    wireUploads();

    document.getElementById('pf2-tabs').addEventListener('click', function (e) {
      var t = e.target.closest('.pf2-tab');
      if (t) setTab(t.dataset.tab);
    });
    document.getElementById('pf2-activity-all').addEventListener('click', function () { setTab('activity'); });

    wireSettings();

    // Deep-link: profile.html#settings ochilsa to'g'ridan settings tab
    if (window.location.hash === '#settings') setTab('settings');

    if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
      loadReal().catch(function () { applyDemo(); });
    } else {
      applyDemo();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
