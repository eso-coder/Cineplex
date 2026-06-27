import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { MovieMetadata } from './metadata';
import { mapAgeRating, formatRuntime } from './parser';

export interface AdminPayload {
  metadata:    MovieMetadata;
  s3Url:       string;
  slug:        string;
  outputDir:   string;
  trailerId:   string | null;
  subtitles:   Array<{ lang: string; label: string; url: string }>;
}

// OMDB/TMDB inglizcha janrlari → admin panel chip yorliqlari (mos kelishi mumkin bo'lganlar)
const GENRE_LABEL_MAP: Record<string, string[]> = {
  'action':          ['Action', 'Jangari', 'Jangovar', 'Boevik'],
  'adventure':       ['Action', 'Sarguzasht', 'Jangari'],
  'drama':           ['Drama'],
  'comedy':          ['Komediya', 'Comedy'],
  'thriller':        ['Triller', 'Thriller'],
  'sci-fi':          ['Ilmiy Fantastika', 'Fantastika', 'Sci-Fi', 'Science Fiction'],
  'science fiction': ['Ilmiy Fantastika', 'Fantastika', 'Sci-Fi'],
  'fantasy':         ['Fantaziya', 'Fantasy'],
  'history':         ['Tarixiy', 'History'],
  'horror':          ["Qo'rqinchli", 'Horror', 'Dahshat'],
  'animation':       ['Animatsiya', 'Animation', 'Multfilm'],
  'romance':         ['Romantik', 'Romance', 'Romantika'],
  'crime':           ['Kriminal', 'Crime', 'Jinoyat'],
  'mystery':         ['Sirli', 'Mystery'],
  'war':             ['Tarixiy', 'Urush'],
  'biography':       ['Tarixiy', 'Biografiya'],
  'family':          ['Animatsiya', 'Oilaviy'],
  'music':           ['Komediya', 'Musiqiy'],
  'musical':         ['Komediya', 'Musiqiy'],
  'western':         ['Action', 'Vestern'],
  'documentary':     ['Hujjatli'],
};

// ─── Screenshot ───────────────────────────────────────────────────────────────
async function screenshot(page: Page, outputDir: string, name: string) {
  try {
    const screenshotDir = path.join(outputDir, 'screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), fullPage: false });
  } catch { /* ignore */ }
}

// ─── Xavfsiz fill ─────────────────────────────────────────────────────────────
async function fill(page: Page, selector: string, value: string) {
  try {
    await page.waitForSelector(selector, { timeout: 5_000 });
    await page.fill(selector, value);
  } catch (e) {
    console.log(`  ⚠️  Fill xato (${selector}): ${(e as Error).message.slice(0, 60)}`);
  }
}

// ─── Tab almashtirish ─────────────────────────────────────────────────────────
async function switchTab(page: Page, tabIndex: number) {
  await page.click(`.dtab[data-tab="${tabIndex}"]`);
  await page.waitForTimeout(400);
}

// ─── ASOSIY ───────────────────────────────────────────────────────────────────
export async function addMovieToAdmin(payload: AdminPayload): Promise<void> {
  // ADMIN_URL to'liq sahifa URL bo'lishi mumkin (https://cineplex.uz/pages/admin.html)
  // yoki faqat base URL (https://cineplex.uz) — ikkalasini ham ko'taramiz
  const rawAdminUrl = process.env.ADMIN_URL || 'http://localhost:5000';
  const adminUrl = rawAdminUrl.replace(/\/pages\/admin\.html$/i, '');  // agar to'liq URL bo'lsa, base ajratib olamiz
  const email     = process.env.ADMIN_EMAIL    || '';
  const password  = process.env.ADMIN_PASSWORD || '';

  if (!email || !password) {
    console.log('  ⚠️  ADMIN_EMAIL / ADMIN_PASSWORD yo\'q, admin panel skip');
    return;
  }

  // O'rnatilgan Google Chrome'ni ishlat (Playwright Chromium SxS xatosidan qochish uchun)
  const CHROME_PATHS = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  ];
  const chromeExe = CHROME_PATHS.find(p => { try { return require('fs').existsSync(p); } catch { return false; } });

  const browser: Browser = await chromium.launch({
    headless: false,
    slowMo: 60,
    ...(chromeExe ? { executablePath: chromeExe } : {}),
  });
  const page: Page = await browser.newPage();
  page.setDefaultTimeout(30_000);

  try {
    // ── 1. Login ──────────────────────────────────────────────────────────────
    await page.goto(`${adminUrl}/pages/admin.html`, { waitUntil: 'networkidle' });

    const loginVisible = await page.isVisible('#login-screen');
    if (loginVisible) {
      await fill(page, '#l-email', email);
      await fill(page, '#l-pass', password);
      await page.click('#login-btn');
      await page.waitForSelector('#page-movies, #page-dashboard', { timeout: 15_000 });
      await page.waitForTimeout(800);
      console.log('  ✅ Login muvaffaqiyatli');
    }

    // ── Movies sahifasiga o'tish ──────────────────────────────────────────────
    await page.click('[data-page="movies"]');
    await page.waitForTimeout(600);

    // ── 2. "Film qo'shish" ────────────────────────────────────────────────────
    await page.click('#add-movie-btn');
    await page.waitForSelector('.drawer.open, #movie-drawer.open', { timeout: 8_000 });
    await page.waitForTimeout(500);
    console.log('  ✅ Drawer ochildi');

    // ── TAB 0: Asosiy Ma'lumot ────────────────────────────────────────────────
    const { metadata: m, s3Url, trailerId, subtitles } = payload;

    // Poster URL
    if (m.posterUrl) {
      await fill(page, '#mf-img', m.posterUrl);
      await page.waitForTimeout(300);
    }

    // Sarlavhalar
    await fill(page, '#mf-title', m.title);
    if (m.titleRu)  await fill(page, '#mf-title-ru', m.titleRu);
    if (m.titleEn)  await fill(page, '#mf-title-en', m.titleEn);

    // Tur: har doim "movie" (kino, serial emas)
    try {
      await page.selectOption('#mf-type', 'movie');
      console.log('  ✅ Tur: Film (movie) tanlandi');
    } catch {
      // Fallback: string shaklida evaluate (TS window/document xatosidan qochadi)
      await page.evaluate('var s = document.getElementById("mf-type"); if(s) s.value = "movie";');
      console.log('  ✅ Tur: Film (movie) — JS orqali o\'rnatildi');
    }

    // Yil
    await fill(page, '#mf-year', m.year);

    // IMDB reyting
    await fill(page, '#mf-rating', m.imdbRating);

    // Yosh chegarasi
    const ageLabel = mapAgeRating(m.rated);
    await page.selectOption('#mf-age', { label: ageLabel }).catch(async () => {
      // value bo'yicha ham sinab ko'r
      await page.selectOption('#mf-age', ageLabel).catch(() => {});
    });

    // Davomiyligi
    const dur = formatRuntime(m.runtime);
    if (dur) await fill(page, '#mf-duration', dur);

    // Banner URL
    if (m.bannerUrl) {
      await fill(page, '#mf-banner', m.bannerUrl);
      await page.waitForTimeout(300);
    }

    await screenshot(page, payload.outputDir, 'tab0');
    console.log('  ✅ Tab 1 (Asosiy) to\'ldirildi');

    // ── TAB 1: Kontent ────────────────────────────────────────────────────────
    await switchTab(page, 1);

    // Tavsiflar — #mf-desc MAJBURIY maydon, shuning uchun eng yaxshi mavjudini ishlatamiz
    const baseDesc = m.descriptionUz || m.descriptionRu || m.descriptionEn || '';
    if (baseDesc)        await fill(page, '#mf-desc',    baseDesc);
    if (m.descriptionRu) await fill(page, '#mf-desc-ru', m.descriptionRu);
    if (m.descriptionEn) await fill(page, '#mf-desc-en', m.descriptionEn);
    if (!baseDesc) console.log('  ⚠️  Tavsif topilmadi — saqlash rad etilishi mumkin!');

    // Streaming URL
    await fill(page, '#mf-video-url', s3Url);

    // Trailer ID
    if (trailerId) await fill(page, '#mf-trailer-id', trailerId);

    // Janrlar — inglizcha OMDB/TMDB janrlarini admin chip yorliqlariga moslab bosamiz
    if (m.genres.length) {
      try {
        const clicked = await page.evaluate(`(function(){
          var wanted = ${JSON.stringify(m.genres)};
          var MAP = ${JSON.stringify(GENRE_LABEL_MAP)};
          var hits = 0;
          wanted.forEach(function(g){
            var key = String(g).toLowerCase().trim();
            var cands = (MAP[key] || [g]).map(function(s){ return String(s).toLowerCase().trim(); });
            // Har safar yangidan so'rab olamiz (bosilganda chiplar qayta render bo'ladi)
            var chips = Array.prototype.slice.call(document.querySelectorAll('.genre-chip'));
            var chip = chips.find(function(c){
              var t = (c.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
              return cands.indexOf(t) !== -1;
            });
            if (chip && chip.className.indexOf('selected') === -1) { chip.click(); hits++; }
          });
          return hits;
        })()`);
        console.log(`  ✅ ${clicked}/${m.genres.length} janr tanlandi (${m.genres.join(', ')})`);
      } catch (e) {
        console.log(`  ⚠️  Janr tanlash xato: ${(e as Error).message.slice(0, 60)}`);
      }
    }

    // Lang kodi mapping: ffprobe 3-harf → admin panel 2-harf
    const LANG_MAP: Record<string, string> = {
      uzb: 'uz', rus: 'ru', eng: 'en', fre: 'fr', fra: 'fr',
      ger: 'de', deu: 'de', ara: '',  // admin panelda arab yo'q — skip
    };
    const ADMIN_LANGS = new Set(['uz', 'ru', 'en', 'fr', 'de']);

    // Subtitlelar
    for (const sub of subtitles) {
      // Lang kodni mapping qilish
      const mappedLang = LANG_MAP[sub.lang] ?? (ADMIN_LANGS.has(sub.lang) ? sub.lang : '');
      if (!mappedLang) {
        console.log(`  ⚠️  Subtitle "${sub.lang}" admin panelda yo'q — skip`);
        continue;
      }
      try {
        // Subtitle "Qo'shish" tugmasini onclick orqali topamiz (text matching ishonchsiz)
        const addBtn = await page.$('button[onclick="addSubtitleRow()"]');
        if (!addBtn) {
          // Fallback: JS orqali to'g'ridan-to'g'ri chaqiramiz (string — TS window xatosidan qochish)
          await page.evaluate('addSubtitleRow()');
        } else {
          await addBtn.scrollIntoViewIfNeeded();
          await addBtn.click();
        }
        await page.waitForTimeout(300);

        // So'nggi subtitle qator
        const rows = await page.$$('#subtitle-rows > div');
        const lastRow = rows[rows.length - 1];
        if (!lastRow) continue;

        // Til tanlash (mapped 2-harf kod)
        await lastRow.$('select.sub-lang').then(el => el?.selectOption(mappedLang)).catch(() => {});

        // Label
        await lastRow.$('input.sub-label').then(el => el?.fill(sub.label)).catch(() => {});

        // URL
        await lastRow.$('input.sub-url').then(el => el?.fill(sub.url)).catch(() => {});

        await page.waitForTimeout(200);
        console.log(`  ✅  Subtitle qo'shildi: ${sub.lang} → ${mappedLang}`);
      } catch (e) {
        console.log(`  ⚠️  Subtitle qo'shish xato (${sub.lang}): ${(e as Error).message.slice(0, 60)}`);
      }
    }

    // Gallereya — kamida 6 ta rasm. galleryImages massivini to'g'ridan-to'g'ri o'rnatamiz.
    const galleryToAdd = m.galleryUrls.slice(0, 10);
    if (galleryToAdd.length) {
      try {
        await page.evaluate(`(function(){
          if (typeof galleryImages !== 'undefined') {
            galleryImages = ${JSON.stringify(galleryToAdd)};
            if (typeof renderGallery === 'function') renderGallery();
          }
        })()`);
        await page.waitForTimeout(400);
        const count = await page.$$eval('#gallery-list .gallery-url-input', els => els.length).catch(() => 0);
        console.log(`  ✅ Gallereya: ${count} rasm qo'shildi`);
        if (count < 6) console.log(`  ⚠️  Gallereyada 6 tadan kam rasm (${count}) — TMDB da rasm yetarli emas`);
      } catch (e) {
        console.log(`  ⚠️  Gallereya xato: ${(e as Error).message.slice(0, 60)}`);
      }
    } else {
      console.log('  ⚠️  Gallereya uchun rasm topilmadi');
    }

    await screenshot(page, payload.outputDir, 'tab1');
    console.log('  ✅ Tab 2 (Kontent) to\'ldirildi');

    // ── TAB 2: Aktyorlar ──────────────────────────────────────────────────────
    await switchTab(page, 2);

    let actorsAdded = 0;
    for (const actor of m.cast) {
      try {
        // Qidiruv
        await page.fill('#actor-picker-search', actor.name);
        await page.waitForTimeout(700);

        // Natijani kutish
        const actorCard = await page.waitForSelector(
          `#actor-picker-grid .actor-card:not(.selected)`,
          { timeout: 3_000 }
        ).catch(() => null);

        if (actorCard) {
          // Ism mos kelishini tekshir
          const cardName = await actorCard.innerText();
          if (cardName.toLowerCase().includes(actor.name.split(' ')[0].toLowerCase())) {
            await actorCard.click();
            actorsAdded++;
            await page.waitForTimeout(300);
          } else {
            // Barcha kartalar orasidan qidirish
            const allCards = await page.$$('#actor-picker-grid .actor-card');
            for (const card of allCards) {
              const t = await card.innerText();
              if (t.toLowerCase().includes(actor.name.split(' ')[0].toLowerCase())) {
                await card.click();
                actorsAdded++;
                break;
              }
            }
          }
        }

        // Qidiruvni tozalash
        await page.fill('#actor-picker-search', '');
        await page.waitForTimeout(300);
      } catch {
        // Actor topilmasa skip
      }
    }

    console.log(`  ✅ ${actorsAdded} aktyor qo'shildi`);

    await screenshot(page, payload.outputDir, 'tab2');

    // ── Saqlash ───────────────────────────────────────────────────────────────
    await page.click('#drawer-save-btn');

    // Success YOKI error toastni kutamiz — haqiqiy natijani aniqlash uchun
    const toastEl = await page.waitForSelector('#admin-toast.show', { timeout: 15_000 }).catch(() => null);
    await screenshot(page, payload.outputDir, 'saved');

    if (!toastEl) {
      throw new Error('Saqlash natijasi aniqlanmadi — toast chiqmadi (API javob bermadimi?)');
    }
    const toastCls = (await toastEl.getAttribute('class')) || '';
    const toastTxt = ((await toastEl.textContent()) || '').trim();
    if (toastCls.includes('success')) {
      console.log(`  ✅ Kino saqlandi: ${toastTxt}`);
    } else if (toastCls.includes('error')) {
      // Haqiqiy xato sababini ko'rsatamiz (masalan "Tavsif kiritilishi shart")
      throw new Error(`Admin saqlash rad etildi: "${toastTxt}"`);
    } else {
      console.log(`  ℹ️  Toast: ${toastTxt}`);
    }

  } finally {
    await page.waitForTimeout(1_500);
    await browser.close();
  }
}
