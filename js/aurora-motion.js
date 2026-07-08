/* ═══════════════════════════════════════════════════════
   CINEPLEX — Aurora Motion (orkestratsiya)

   Qatlam 1: Sayt introsi
     • sessiyada faqat 1 marta (sessionStorage)
     • skip tugmasi / istalgan joyga bosish / klaviatura → darhol o'tkazib yuborish
     • prefers-reduced-motion → sekvensiyasiz, faqat opacity fade
     • mobil qisqartirilgan (vaqtlar CSS --dur-* tokenlaridan o'qiladi,
       shuning uchun JS va CSS hech qachon bir-biridan farq qilmaydi)

   Keyingi qatlamlar (route / modal / card / player) shu faylga qo'shiladi.
═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var root = document.documentElement;

  function prefersReduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* CSS --dur-* tokenini millisekundga o'giradi (yagona manba — CSS) */
  function tokenMs(name, fallback) {
    try {
      var v = getComputedStyle(root).getPropertyValue(name).trim();
      if (!v) return fallback;
      if (v.indexOf('ms') > -1) return parseFloat(v);
      if (v.indexOf('s')  > -1) return parseFloat(v) * 1000;
      var n = parseFloat(v);
      return isNaN(n) ? fallback : n;
    } catch (e) { return fallback; }
  }

  var AuroraIntro = {
    _timers: [],
    _done: false,
    _exiting: false,

    /* onReveal — intro tugab, sahifa panellari ochilishi kerak bo'lgan lahza.
       Berilmasa: .animate-in panellarni stagger bilan ochamiz.
       Muhim: IntersectionObserver'ning birinchi callback'iga TAYANMAYMIZ —
       u sahifa yuklanish payti (hero/rows async chizilayotganda) ishonchsiz.
       Panellarni bevosita .visible bilan ochamiz; IO esa keyingi scroll
       reveal uchun (App.initAnimations orqali) baribir o'rnatiladi. */
    boot: function (onReveal) {
      var overlay = document.getElementById('intro-overlay');
      this._overlay = overlay;
      this._reveal = typeof onReveal === 'function' ? onReveal : function () {
        document.querySelectorAll('.animate-in').forEach(function (el) {
          el.classList.add('visible');
        });
        if (window.App && App.initAnimations) App.initAnimations();
      };

      var alreadyShown = root.classList.contains('intro-shown') || (function () {
        try { return sessionStorage.getItem('cp_intro_shown') === '1'; } catch (e) { return false; }
      })();

      /* Overlay yo'q yoki intro allaqachon ko'rsatilgan — darhol reveal */
      if (!overlay || alreadyShown) {
        if (overlay) overlay.style.display = 'none';
        root.classList.remove('intro-playing');
        this._reveal();
        return;
      }

      /* Shu sessiyada faqat 1 marta */
      try { sessionStorage.setItem('cp_intro_shown', '1'); } catch (e) {}
      root.classList.add('intro-shown', 'intro-playing');

      this._bindSkip();

      if (prefersReduced()) { this._fastReveal(); return; }
      this._play();
    },

    _play: function () {
      var self = this;
      var logo = this._overlay.querySelector('.intro-logo');

      var dDelay = tokenMs('--dur-intro-logo-delay', 150);
      var dIn    = tokenMs('--dur-intro-logo-in', 400);
      var dDwell = tokenMs('--dur-intro-dwell', 400);

      /* Logo kiradi (aurora CSS orqali mustaqil ochiladi) */
      this._t(function () { if (logo) logo.classList.add('is-in'); }, dDelay);

      /* Dwell tugagach — chiqish + panellarni ochish */
      this._t(function () { self._exit(); }, dDelay + dIn + dDwell);
    },

    _exit: function () {
      if (this._exiting || this._done) return;
      this._exiting = true;
      var self = this;
      var logo = this._overlay.querySelector('.intro-logo');
      var dOut = tokenMs('--dur-intro-out', 400);

      if (logo) { logo.classList.remove('is-in'); logo.classList.add('is-out'); }
      this._overlay.classList.add('is-hiding');

      /* Overlay ketishi bilan biroz overlap qilib panellar stagger bilan chiqadi */
      root.classList.remove('intro-playing');
      this._reveal();

      this._t(function () { self._finish(); }, dOut);
    },

    /* reduced-motion: sekvensiyasiz — faqat oddiy opacity fade */
    _fastReveal: function () {
      var self = this;
      this._overlay.classList.add('is-hiding');
      root.classList.remove('intro-playing');
      this._reveal();
      this._t(function () { self._finish(); }, tokenMs('--dur-base', 200));
    },

    _finish: function () {
      if (this._done) return;
      this._done = true;
      this._clearTimers();
      if (this._unbind) this._unbind();
      if (this._overlay) this._overlay.style.display = 'none';
      root.classList.remove('intro-playing');
    },

    /* Skip tugmasi / bosish / klaviatura */
    skip: function () {
      if (this._done || this._exiting) return;
      this._clearTimers();
      this._exit();
    },

    _bindSkip: function () {
      var self = this;
      var overlay = this._overlay;
      var btn = document.getElementById('intro-skip');

      var onClick = function () { self.skip(); };
      var onKey   = function () { self.skip(); };

      if (btn) btn.addEventListener('click', function (e) { e.stopPropagation(); self.skip(); });
      overlay.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey);

      this._unbind = function () {
        overlay.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey);
      };
    },

    _t: function (fn, ms) { var id = setTimeout(fn, ms); this._timers.push(id); return id; },
    _clearTimers: function () {
      for (var i = 0; i < this._timers.length; i++) clearTimeout(this._timers[i]);
      this._timers = [];
    }
  };

  window.AuroraIntro = AuroraIntro;
})();
