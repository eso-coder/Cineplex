/* ═══════════════════════════════════════════════════════
   CINEPLEX — i18n (UZ / RU / EN)
   Main UI labels. Movie content is localized in api.js.
═══════════════════════════════════════════════════════ */
(function () {
  const LANGS = ['uz', 'ru', 'en'];

  const STRINGS = {
    // key : { uz, ru, en }
    'nav.home':       { uz: 'Bosh sahifa', ru: 'Главная',     en: 'Home' },
    'nav.new':        { uz: 'Yangi',       ru: 'Новинки',     en: 'New' },
    'nav.movies':     { uz: 'Filmlar',     ru: 'Фильмы',      en: 'Movies' },
    'nav.series':     { uz: 'Seriallar',   ru: 'Сериалы',     en: 'Series' },
    'nav.actors':     { uz: 'Aktyorlar',   ru: 'Актёры',      en: 'Actors' },
    'nav.categories': { uz: 'Janrlar',     ru: 'Жанры',       en: 'Genres' },
    'nav.search_ph':  { uz: 'Film qidiring…', ru: 'Поиск фильма…', en: 'Search movies…' },
    'nav.login':      { uz: 'Kirish',      ru: 'Войти',       en: 'Sign in' },
    'nav.register':   { uz: "Ro'yxatdan o'tish", ru: 'Регистрация', en: 'Sign up' },
    'nav.profile':    { uz: 'Profil',      ru: 'Профиль',     en: 'Profile' },
    'nav.saved':      { uz: 'Saqlangan',   ru: 'Сохранённое', en: 'Saved' },
    'nav.search':     { uz: 'Qidiruv',     ru: 'Поиск',       en: 'Search' },
    'nav.settings':   { uz: 'Sozlamalar',  ru: 'Настройки',   en: 'Settings' },
    'nav.support':    { uz: "Qo'llab-quvvatlash", ru: 'Поддержка', en: 'Support' },
    'nav.logout':     { uz: 'Chiqish',     ru: 'Выйти',       en: 'Log out' },

    'btn.watch':      { uz: "Ko'rish",     ru: 'Смотреть',    en: 'Watch' },
    'btn.details':    { uz: 'Batafsil',    ru: 'Подробнее',   en: 'Details' },
    'btn.seeall':     { uz: "Barchasini ko'rish", ru: 'Показать все', en: 'See all' },

    'sec.trending':   { uz: 'Trendda',     ru: 'В тренде',    en: 'Trending' },
    'sec.new':        { uz: 'Yangi chiqmalar', ru: 'Новинки', en: 'New releases' },
    'sec.studios':    { uz: "Dunyoning yetakchi studiyalaridan strim", ru: 'Стриминг от ведущих студий мира', en: 'Streaming from the world’s leading studios' },
  };

  function getLang() {
    try {
      const l = localStorage.getItem('cp_lang');
      return LANGS.indexOf(l) !== -1 ? l : 'uz';
    } catch (e) { return 'uz'; }
  }

  function t(key) {
    const entry = STRINGS[key];
    if (!entry) return key;
    const lang = getLang();
    return entry[lang] || entry.uz || key;
  }

  function setLang(lang) {
    if (LANGS.indexOf(lang) === -1) return;
    try { localStorage.setItem('cp_lang', lang); } catch (e) {}
    document.documentElement.setAttribute('lang', lang);
    window.location.reload();
  }

  function applyStatic(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
  }

  window.I18N = { LANGS: LANGS, getLang: getLang, t: t, setLang: setLang, applyStatic: applyStatic };

  document.addEventListener('DOMContentLoaded', function () {
    document.documentElement.setAttribute('lang', getLang());
    applyStatic();
  });
})();
