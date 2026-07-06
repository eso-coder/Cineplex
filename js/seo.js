/* ═══════════════════════════════════════════════════════
   CINEPLEX — SEO meta/JSON-LD injector (client-side)
   ----------------------------------------------------------------
   Muhim eslatma: bu skript sahifa yuklangandan KEYIN, JS orqali <head>
   ga meta teglar qo'shadi. Google botga yetarli (u JS'ni ijro etadi),
   lekin ijtimoiy tarmoq preview botlari (Facebook/Telegram/Twitter)
   ko'pincha JS ijro etmaydi — shuning uchun ularga OG teglar to'liq
   ishlamasligi mumkin. Haqiqiy server-side render/pre-render qilingan
   OG teglar kerak bo'lsa, bu alohida (backend) ish talab qiladi.
═══════════════════════════════════════════════════════ */
const SEO = {
  _setMeta(name, content) {
    if (!content) return;
    let el = document.querySelector(`meta[name="${name}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  },

  _setOg(property, content) {
    if (!content) return;
    let el = document.querySelector(`meta[property="${property}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('property', property);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  },

  setCanonical(url) {
    let el = document.querySelector('link[rel="canonical"]');
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', 'canonical');
      document.head.appendChild(el);
    }
    el.setAttribute('href', url);
  },

  /* Sahifada hali <h1> bo'lmasa — ko'rinmas (sr-only) <h1> yaratadi.
     Agar sahifada allaqachon haqiqiy ko'rinadigan <h1> bo'lsa, shuni
     ishlatib matnini yangilaydi (ikkinchi h1 qo'shilmaydi). */
  setH1(text) {
    if (!text) return;
    let el = document.querySelector('h1');
    if (!el) {
      el = document.createElement('h1');
      el.className = 'sr-only';
      el.setAttribute('data-seo-generated', '');
      document.body.insertBefore(el, document.body.firstChild);
    }
    if (el.hasAttribute('data-seo-generated')) el.textContent = text;
  },

  setJsonLd(data) {
    let el = document.querySelector('script[data-seo-jsonld]');
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.setAttribute('data-seo-jsonld', '');
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
  },

  setTitle(title) {
    if (title) document.title = title;
  },

  setDescription(desc) {
    this._setMeta('description', desc);
  },

  /* Umumiy (statik) sahifalar uchun: title/description/canonical/h1 */
  applyPage({ title, description, h1, url }) {
    this.setTitle(title);
    this.setDescription(description);
    this.setCanonical(url || window.location.href.split('?')[0].split('#')[0]);
    this.setH1(h1 || title);
  },

  /* Film/serial sahifasi uchun: to'liq meta + OG + schema.org JSON-LD */
  applyMovie(movie) {
    if (!movie) return;
    const isSeries = movie.type === 'series';
    const title = `${movie.title}${movie.year ? ' (' + movie.year + ')' : ''} — CINEPLEX'da tomosha qiling`;
    const desc = (movie.description || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    const image = movie.banner_img || movie.bannerUrl || movie.img || '';
    const url = window.location.href.split('#')[0];

    this.setTitle(title);
    this.setDescription(desc);
    this.setCanonical(url);
    this.setH1(movie.title);

    this._setOg('og:title', title);
    this._setOg('og:description', desc);
    this._setOg('og:image', image);
    this._setOg('og:url', url);
    this._setOg('og:type', isSeries ? 'video.tv_show' : 'video.movie');

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': isSeries ? 'TVSeries' : 'Movie',
      name: movie.title,
      description: movie.description || '',
      image: image || undefined,
      datePublished: movie.year ? String(movie.year) : undefined,
      genre: (movie.genre && movie.genre.length) ? movie.genre : undefined,
    };
    if (movie.rating) {
      jsonLd.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: movie.rating,
        bestRating: 10,
        worstRating: 0,
        ratingCount: movie.ratingsCount || 1,
      };
    }
    this.setJsonLd(jsonLd);
  },
};
