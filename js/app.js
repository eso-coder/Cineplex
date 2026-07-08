/* ═══════════════════════════════════════════════════════
   CInemaplex — Shared App Utilities
═══════════════════════════════════════════════════════ */

const App = {

  go(url) {
    const isHome = /^(\.\.\/)?index\.html$|^\/$/.test(url.split('?')[0]);
    const t = document.getElementById('page-transition');
    if (t && !isHome) {
      t.classList.add('active');
      setTimeout(() => { window.location.href = url; }, 120);
    } else {
      window.location.href = url;
    }
  },

  getParam(name) {
    return new URLSearchParams(window.location.search).get(name) || '';
  },

  /* HTML-ni zararsizlantirish: sarlavha/tavsif kabi matnlar innerHTML ga
     qo'yilishidan oldin maxsus belgilarni escape qiladi. Ham xavfsizlik
     (XSS), ham to'g'ri ko'rinish (apostrof/&/< bo'lgan nomlar) uchun. */
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  },

  _navHTML(activePage, root) {
    root = root || '';
    const T = (k, fb) => (typeof I18N !== 'undefined' ? I18N.t(k) : fb);
    const links = [
      { key: 'home',       label: T('nav.home', 'Bosh sahifa'),     href: root + 'index.html' },
      { key: 'new',        label: T('nav.new', 'Yangi'),            href: root + 'pages/new.html' },
      { key: 'movies',     label: T('nav.movies', 'Filmlar'),       href: root + 'pages/movies.html' },
      { key: 'series',     label: T('nav.series', 'Seriallar'),     href: root + 'pages/series.html' },
      { key: 'actors',     label: T('nav.actors', 'Aktyorlar'),     href: root + 'pages/actors.html' },
    ];
    const curLang = (typeof I18N !== 'undefined' ? I18N.getLang() : 'uz');
    const LANG_LABELS = { uz: "O'zbekcha", ru: 'Русский', en: 'English' };
    const searchPage  = root + 'pages/search.html';
    const profilePage = root + 'pages/profile.html';

    return `<nav class="navbar" id="navbar">
  <div class="navbar-inner">
    <a href="${root}index.html" class="nav-logo" aria-label="CINEPLEX — Bosh sahifa">
      <svg class="nav-logo-icon" viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <circle cx="50" cy="50" r="42" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-dasharray="223.57 40.32" transform="rotate(42.5 50 50)"/>
        <circle cx="50" cy="50" r="33" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-dasharray="172.79 34.56" transform="rotate(35 50 50)"/>
        <circle cx="50" cy="50" r="24" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-dasharray="123.58 27.22" transform="rotate(27.5 50 50)"/>
        <circle cx="50" cy="50" r="15" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-dasharray="75.92 18.33" transform="rotate(20 50 50)"/>
        <circle cx="50" cy="50" r="7" fill="currentColor" stroke="none"/>
      </svg>
      <span class="logo-wordmark">CINE<span class="thin">PLEX</span></span>
    </a>
    <ul class="nav-links">
      ${links.map(l => `<li><a href="${l.href}" class="${activePage === l.key ? 'active' : ''}">${l.label}</a></li>`).join('')}
    </ul>
    <div class="nav-spacer"></div>
    <div class="nav-search" id="nav-search-wrap">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input type="text" id="nav-search-input" placeholder="${T('nav.search_ph', 'Film qidiring…')}">
    </div>

    <!-- Mobile hamburger (shown ≤640px) -->
    <button class="nav-burger" id="nav-burger" type="button" aria-label="Menyu">
      <span></span><span></span><span></span>
    </button>

    <!-- Language switcher -->
    <div class="lang-wrap" id="lang-wrap">
      <button class="lang-btn" id="lang-btn" type="button" title="Til / Language">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <span id="lang-cur">${curLang.toUpperCase()}</span>
      </button>
      <div class="lang-dd" id="lang-dd">
        ${I18N && I18N.LANGS ? I18N.LANGS.map(l => `<button class="lang-opt${l === curLang ? ' active' : ''}" type="button" data-lang="${l}">${LANG_LABELS[l]}</button>`).join('') : ''}
      </div>
    </div>

    <!-- Auth buttons (shown when NOT logged in) -->
    <div class="nav-auth-btns" id="nav-auth-btns" style="display:none;gap:8px;align-items:center">
      <a class="nav-login-btn" id="nav-login-btn" href="${root}pages/login.html">${T('nav.login', 'Kirish')}</a>
      <a class="nav-register-btn" id="nav-register-btn" href="${root}pages/register.html">${T('nav.register', "Ro'yxatdan o'tish")}</a>
    </div>

    <!-- Profile dropdown -->
    <div class="profile-wrap" id="profile-wrap" style="display:none">
      <a class="nav-avatar-btn" id="profile-btn" href="${profilePage}" title="Profil">
        <div class="nav-avatar">LP</div>
      </a>
      <div class="profile-dd" id="profile-dd">
        <!-- Header -->
        <div class="pdd-header">
          <div class="pdd-avatar-ring">
            <div class="pdd-avatar">LP</div>
          </div>
          <div class="pdd-userinfo">
            <div class="pdd-name">Lee Phang</div>
            <div class="pdd-email">maleyip22@gmail.com</div>
            <div class="pdd-badge">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              Premium
            </div>
          </div>
        </div>

        <!-- Quick actions -->
        <div class="pdd-quick-row">
          <a class="pdd-quick-item" href="${profilePage}">
            <div class="pdd-quick-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </div>
            <span>Saqlangan</span>
          </a>
          <a class="pdd-quick-item" href="${searchPage}">
            <div class="pdd-quick-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </div>
            <span>Qidiruv</span>
          </a>
          <div class="pdd-quick-item" id="profile-settings-btn">
            <div class="pdd-quick-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </div>
            <span>Sozlamalar</span>
          </div>
        </div>

        <div class="pdd-sep"></div>

        <!-- Nav items -->
        <a class="pdd-item" href="${profilePage}">
          <div class="pdd-item-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <span>Profil</span>
          <svg class="pdd-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
        </a>
        <a class="pdd-item" href="${profilePage}">
          <div class="pdd-item-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </div>
          <span>Saqlangan</span>
          <svg class="pdd-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
        </a>
        <a class="pdd-item" href="#">
          <div class="pdd-item-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.49 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.4 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.4a16 16 0 0 0 5.72 5.72l1.7-1.7a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 14.92z"/></svg>
          </div>
          <span>Qo'llab-quvvatlash</span>
          <svg class="pdd-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
        </a>
        <a class="pdd-item" href="#">
          <div class="pdd-item-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <span>Yordam</span>
          <svg class="pdd-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
        </a>

        <div class="pdd-sep"></div>

        <div class="pdd-item pdd-danger" id="profile-logout-btn">
          <div class="pdd-item-icon pdd-danger-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </div>
          <span>Chiqish</span>
        </div>
      </div>
    </div>

  </div>

  <!-- Mobile slide-down menu (≤640px) -->
  <div class="mobile-menu" id="mobile-menu">
    <div class="mobile-search" id="mobile-search-wrap">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input type="text" id="mobile-search-input" placeholder="${T('nav.search_ph', 'Film qidiring…')}">
    </div>
    <ul class="mobile-links">
      ${links.map(l => `<li><a href="${l.href}" class="${activePage === l.key ? 'active' : ''}">${l.label}</a></li>`).join('')}
    </ul>
    <div class="mobile-auth" id="mobile-auth" style="display:none">
      <a class="mobile-auth-login" href="${root}pages/login.html">${T('nav.login', 'Kirish')}</a>
      <a class="mobile-auth-register" href="${root}pages/register.html">${T('nav.register', "Ro'yxatdan o'tish")}</a>
    </div>
  </div>
  <div class="mobile-menu-backdrop" id="mobile-menu-backdrop"></div>
</nav>`;
  },

  initNavbar(activePage, root) {
    root = root || '';
    const placeholder = document.getElementById('navbar-placeholder');
    if (placeholder) placeholder.outerHTML = this._navHTML(activePage, root);
    else document.body.insertAdjacentHTML('afterbegin', this._navHTML(activePage, root));

    /* Search */
    const inp = document.getElementById('nav-search-input');
    if (inp) {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && inp.value.trim()) {
          this.go(root + 'pages/search.html?q=' + encodeURIComponent(inp.value.trim()));
        }
      });
    }

    /* Language switcher */
    const langWrap = document.getElementById('lang-wrap');
    const langBtn  = document.getElementById('lang-btn');
    const langDd   = document.getElementById('lang-dd');
    if (langWrap && langBtn && langDd) {
      langBtn.addEventListener('click', e => {
        e.stopPropagation();
        langDd.classList.toggle('open');
      });
      langDd.querySelectorAll('.lang-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          const l = btn.getAttribute('data-lang');
          if (typeof I18N !== 'undefined') I18N.setLang(l);
        });
      });
      document.addEventListener('click', e => {
        if (!langWrap.contains(e.target)) langDd.classList.remove('open');
      });
    }

    /* Mobile hamburger menu */
    const burger    = document.getElementById('nav-burger');
    const mMenu     = document.getElementById('mobile-menu');
    const mBackdrop = document.getElementById('mobile-menu-backdrop');
    const mSearch   = document.getElementById('mobile-search-input');
    if (burger && mMenu) {
      const closeMenu = () => {
        burger.classList.remove('open');
        mMenu.classList.remove('open');
        if (mBackdrop) mBackdrop.classList.remove('open');
        document.body.classList.remove('menu-open');
      };
      burger.addEventListener('click', e => {
        e.stopPropagation();
        const willOpen = !mMenu.classList.contains('open');
        burger.classList.toggle('open', willOpen);
        mMenu.classList.toggle('open', willOpen);
        if (mBackdrop) mBackdrop.classList.toggle('open', willOpen);
        document.body.classList.toggle('menu-open', willOpen);
      });
      if (mBackdrop) mBackdrop.addEventListener('click', closeMenu);
      mMenu.querySelectorAll('.mobile-links a').forEach(a => a.addEventListener('click', closeMenu));
      if (mSearch) {
        mSearch.addEventListener('keydown', e => {
          if (e.key === 'Enter' && mSearch.value.trim()) {
            this.go(root + 'pages/search.html?q=' + encodeURIComponent(mSearch.value.trim()));
          }
        });
      }
    }

    /* Transparent navbar on all pages — glass appears on scroll */
    const nav = document.getElementById('navbar');

    /* Profile avatar — clicking goes straight to the profile page.
       The old hover dropdown is disabled; settings/support/logout now live
       inside the profile page itself. */
    const profileDd = document.getElementById('profile-dd');
    if (profileDd) profileDd.remove();
    if (nav) {
      const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    if (!document.getElementById('page-transition')) {
      document.body.insertAdjacentHTML('afterbegin', '<div id="page-transition"></div>');
    }
    if (!document.getElementById('toast')) {
      document.body.insertAdjacentHTML('beforeend', '<div id="toast"></div>');
    }

    window.addEventListener('pageshow', function() {
      const t = document.getElementById('page-transition');
      if (t) {
        t.style.transition = 'none';
        t.classList.remove('active');
        requestAnimationFrame(() => requestAnimationFrame(() => { t.style.transition = ''; }));
      }
    });

    /* Auth modal — load CSS/JS once so the login/register buttons open the
       modal on every page that renders the navbar (Feature 1). */
    if (!document.querySelector('link[href*="auth-modal.css"]')) {
      const lk = document.createElement('link');
      lk.rel = 'stylesheet';
      lk.href = root + 'css/auth-modal.css';
      document.head.appendChild(lk);
    }
    if (typeof window.AuthModal === 'undefined' && !document.querySelector('script[src*="auth-modal.js"]')) {
      const sc = document.createElement('script');
      sc.src = root + 'js/auth-modal.js';
      document.body.appendChild(sc);
    }

    /* Apply stored user data to navbar immediately after render */
    this.refreshNavbarUser();
  },

  /* Update navbar avatar/name/email from cp_user localStorage — call after login or avatar change */
  refreshNavbarUser() {
    try {
      const user = (typeof Auth !== 'undefined') ? Auth.getUser() : null;
      const isLoggedIn = typeof Auth !== 'undefined' && Auth.isLoggedIn();

      /* Show/hide profile wrap and auth buttons based on auth state */
      const profileWrap  = document.getElementById('profile-wrap');
      const authBtns     = document.getElementById('nav-auth-btns');
      if (profileWrap) profileWrap.style.display = isLoggedIn ? '' : 'none';
      if (authBtns)    authBtns.style.display    = isLoggedIn ? 'none' : 'flex';
      const mAuth = document.getElementById('mobile-auth');
      if (mAuth) mAuth.style.display = isLoggedIn ? 'none' : 'flex';

      if (!user) return;

      /* Initials */
      const inits = (user.name || '').split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '?';

      /* Small navbar avatar (.nav-avatar) */
      const navAv = document.querySelector('.nav-avatar');
      if (navAv) {
        if (user.avatar) {
          navAv.innerHTML = `<img src="${App.esc(user.avatar)}" alt="${App.esc(user.name || '')}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        } else {
          navAv.textContent = inits;
        }
      }

      /* Dropdown avatar (.pdd-avatar) */
      const pddAv = document.querySelector('.pdd-avatar');
      if (pddAv) {
        if (user.avatar) {
          pddAv.style.overflow = 'hidden';
          pddAv.innerHTML = `<img src="${App.esc(user.avatar)}" alt="${App.esc(user.name || '')}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        } else {
          pddAv.textContent = inits;
        }
      }

      /* Name & email */
      const nameEl  = document.querySelector('.pdd-name');
      const emailEl = document.querySelector('.pdd-email');
      if (nameEl  && user.name)  nameEl.textContent  = user.name;
      if (emailEl && user.email) emailEl.textContent = user.email;
    } catch (_) {}
  },

  initAnimations() {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
      });
    }, { threshold: 0.05 });
    document.querySelectorAll('.animate-in').forEach(el => obs.observe(el));
  },

  scrollRow(id, dir) {
    const el = document.getElementById(id);
    if (el) el.scrollBy({ left: dir * (160 * 3 + 42), behavior: 'smooth' });
  },

  initGenrePills(containerId, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.addEventListener('click', e => {
      const pill = e.target.closest('.genre-pill');
      if (!pill) return;
      container.querySelectorAll('.genre-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      if (onSelect) onSelect(pill.dataset.genre || 'all');
    });
  },

  /* ── Spotify-uslubidagi rangli janr kartalari (filmlar/seriallar sahifasi tepasida) ── */
  GENRE_ORDER: ['action', 'drama', 'comedy', 'scifi', 'fantasy', 'thriller', 'historical'],
  GENRE_LABELS: { action: 'Jangovar', comedy: 'Komediya', drama: 'Drama', scifi: 'Fantastika', fantasy: 'Fantaziya', thriller: 'Triller', historical: 'Tarixiy', all: 'Barchasi' },
  GENRE_THEME: {
    action:     { color: '#a8324a', tag: 'Mashhur' },
    comedy:     { color: '#148a5f', tag: '' },
    drama:      { color: '#477d95', tag: 'Trendda' },
    scifi:      { color: '#7b2ff7', tag: '' },
    fantasy:    { color: '#503aa8', tag: '' },
    thriller:   { color: '#d9480f', tag: '' },
    historical: { color: '#8a5a2b', tag: '' },
    all:        { color: '#c2255c', tag: '' },
  },
  GENRE_FALLBACK: {
    action:'https://rwvfilm.com/uploads/media/image/0001/02/2288cbf53f90b29cd77e29cf1716fe93a730a5b3.jpg',
    comedy:'https://rwvfilm.com/uploads/media/image/0001/03/thumb_2896_image_medium.jpg',
    drama:'https://rwvfilm.com/uploads/media/image/0001/05/thumb_4051_image_medium.jpg',
    scifi:'https://rwvfilm.com/uploads/media/image/0001/03/thumb_2883_image_medium.jpg',
    fantasy:'https://rwvfilm.com/uploads/media/image/0001/04/thumb_3841_image_medium.jpg',
    thriller:'https://rwvfilm.com/uploads/media/image/0001/03/thumb_2919_image_medium.jpg',
    historical:'https://rwvfilm.com/uploads/media/image/0001/02/a4de7120d6ec56f46ee8c2b6859a8b21ac88a8c6.jpg',
    all:'https://rwvfilm.com/uploads/media/image/0001/03/thumb_2793_image_medium.jpg',
  },

  /* containerId — bo'sh div; movies — to'liq ro'yxat; unit — 'film'/'serial'; onSelect(genre) */
  buildGenreBar(containerId, movies, unit, onSelect) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const inGenre = (m, g) => (m.genre || []).includes(g);
    const posterFor = (g) => {
      const pool = g === 'all' ? movies : movies.filter(m => inGenre(m, g));
      const best = [...pool]
        .sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0))
        .find(m => m.img);
      return (best && best.img) || this.GENRE_FALLBACK[g] || '';
    };
    /* Barcha janrlar ko'rsatiladi (mavjud bo'lmaganlari ham) */
    const order = ['all', ...this.GENRE_ORDER];

    container.innerHTML = order.map(g => {
      const theme = this.GENRE_THEME[g] || { color: '#444', tag: '' };
      const count = g === 'all' ? movies.length : movies.filter(m => inGenre(m, g)).length;
      const poster = posterFor(g);
      return `
        <a class="category-card${g === 'all' ? ' selected' : ''}" data-genre="${g}" href="#"
           style="background:${theme.color}">
          <div class="cat-name">${this.GENRE_LABELS[g] || g}</div>
          <div class="cat-count">${count} ta ${unit || ''}</div>
          ${theme.tag ? `<span class="cat-tag">${theme.tag}</span>` : ''}
          ${poster ? `<img class="cat-poster" src="${poster}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
        </a>`;
    }).join('');

    container.addEventListener('click', e => {
      const card = e.target.closest('.category-card');
      if (!card) return;
      e.preventDefault();
      container.querySelectorAll('.category-card').forEach(c => c.classList.toggle('selected', c === card));
      if (onSelect) onSelect(card.dataset.genre || 'all');
    });
  },

  buildCard(m, root) {
    root = root || '';
    const href    = `${root}pages/movie.html?id=${m.id}`;
    const isSeries = m.type === 'series';
    const badge   = m.isNew
      ? '<div class="movie-poster-badge">YANGI</div>'
      : isSeries ? '<div class="movie-poster-badge serial-badge">SERIAL</div>' : '';
    const genre1  = m.genre && m.genre[0] ? m.genre[0].charAt(0).toUpperCase() + m.genre[0].slice(1) : '';
    const seriesInfo = isSeries && m.seasons
      ? `${m.seasons} mavsum · ${m.episodes} qism`
      : '';
    const E = App.esc;
    const titleAttr = E(m.title);
    return `<div class="movie-card" data-id="${E(m.id)}" data-genre="${E((m.genre||[]).join(' '))}"
onclick="App.go('${href}')">
  ${m.img ? `<img class="movie-glow" src="${E(m.img)}" alt="" aria-hidden="true" loading="lazy">` : ''}
  <div class="movie-poster">
    <img src="${E(m.img || '')}" alt="${titleAttr}" loading="lazy" ${!m.img ? 'style="display:none"' : ''}>
    ${badge}
    <div class="movie-card-overlay">
      <div class="mco-top">
        <button class="mco-like-btn${isLiked(m.id) ? ' active' : ''}" type="button"
          data-id="${E(m.id)}"
          data-title="${titleAttr}"
          data-img="${E(m.img||'')}"
          data-year="${E(m.year||'')}"
          onclick="event.stopPropagation();event.preventDefault();toggleLikeCard(this);return false;" title="Yoqdi">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
        <button class="mco-wl-btn${isInWatchlist(m.id) ? ' active' : ''}" type="button"
          data-id="${E(m.id)}"
          data-title="${titleAttr}"
          data-img="${E(m.img||'')}"
          data-year="${E(m.year||'')}"
          onclick="event.stopPropagation();event.preventDefault();toggleWatchlistCard(this);return false;" title="Watchlist">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>
      <div class="mco-center">
        <div class="mco-play">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
      <div class="mco-bottom">
        <div class="mco-title">${titleAttr}</div>
        <div class="mco-meta">
          <span class="mco-rating">★ ${E(m.rating)}</span>
          <div class="mco-dot"></div>
          <span>${E(m.year)}</span>
          ${seriesInfo ? `<div class="mco-dot"></div><span>${seriesInfo}</span>` : genre1 ? `<div class="mco-dot"></div><span>${E(genre1)}</span>` : ''}
        </div>
        ${m.description ? `<div class="mco-desc">${E(m.description)}</div>` : ''}
      </div>
    </div>
  </div>
  <div class="movie-title">${titleAttr}</div>
  ${seriesInfo ? `<div class="movie-series-row">${seriesInfo}</div>` : ''}
  <div class="movie-meta-row">
    <div class="movie-rating">
      <svg width="22" height="12" viewBox="0 0 40 20"><rect width="40" height="20" rx="4" fill="#f5c518"/><text x="20" y="14.5" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="11" fill="#000000" text-anchor="middle">IMDb</text></svg>
      ${m.rating}
    </div>
    <span>·</span>
    <span>${m.year}</span>
  </div>
</div>`;
  },

  loadCardTrailer(card, id) {
    const parent = card.parentElement;
    if (parent) {
      const allCards = [...parent.querySelectorAll('.movie-card')];
      const cardIdx  = allCards.indexOf(card);
      const cardTop  = card.getBoundingClientRect().top;

      const afterRow  = [];
      const beforeRow = [];
      allCards.forEach((sib, i) => {
        if (Math.abs(sib.getBoundingClientRect().top - cardTop) < 10) {
          if (i > cardIdx) afterRow.push(sib);
          if (i < cardIdx) beforeRow.push(sib);
        }
      });

      if (afterRow.length > 0) {
        afterRow.forEach(sib => {
          sib.style.transform = 'translateX(calc(100% + 16px))';
          sib.style.opacity   = '0';
        });
      } else if (beforeRow.length > 0) {
        const prev = beforeRow[beforeRow.length - 1];
        prev.style.transform = 'translateX(calc(-100% - 16px))';
        prev.style.opacity   = '0';
      }
    }
    if (typeof TRAILERS === 'undefined') return;
    const ytId = TRAILERS[id];
    if (!ytId) return;
    const vid = card.querySelector('.cp-video');
    if (!vid || vid.querySelector('iframe')) return;
    const iframe = document.createElement('iframe');
    iframe.className = 'cp-iframe';
    iframe.setAttribute('allow', 'autoplay; encrypted-media');
    iframe.setAttribute('allowfullscreen', '');
    iframe.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&loop=1&playlist=${ytId}&playsinline=1`;
    vid.appendChild(iframe);
  },

  unloadCardTrailer(card) {
    const parent = card.parentElement;
    if (parent) {
      [...parent.querySelectorAll('.movie-card')].forEach(sib => {
        sib.style.transform = '';
        sib.style.opacity   = '';
      });
    }
    const iframe = card.querySelector('.cp-video iframe');
    if (iframe) { iframe.src = ''; iframe.remove(); }
  },

  /* ── Intro (home only) ── */
  initCinematicIntro(durationMs) {
    durationMs = durationMs || 2600;
    const overlay = document.getElementById('intro-overlay');
    if (!overlay) return;
    setTimeout(() => {
      overlay.classList.add('hidden');
      setTimeout(() => { overlay.style.display = 'none'; }, 900);
    }, durationMs);
  },

  icons: {
    star:      '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    play:      '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    heart:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    heartFill: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    back:      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m15 18-6-6 6-6"/></svg>',
  }
};

window.scrollRow = (id, dir) => App.scrollRow(id, dir);
