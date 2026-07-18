# 3D galereya: har cardda treyler, 5 qator, 95 unikal yangi film

**Sana:** 2026-07-18
**Fayllar:** `js/film-reel.js`, `js/api.js`, `pages/new.html`

## Maqsad

"Yangi chiqmalar" sahifasidagi 3D film devorida:

1. Ekranda ko'rinayotgan barcha cardlar treyler oynatsin (hozir faqat markazdagi 3–7 ta).
2. Vertikal qatorlar soni 6 → **5**.
3. Cardlar takror emas — devordagi ~95 slotning har biri **alohida eng yangi filmga** tegishli bo'lsin (bazada yetarli film bo'lsa).
4. Yangi kino qo'shilganda ro'yxat avtomatik yangilansin — sahifa ochilganda API'dan `sort: newest` bilan olinadi (mavjud mexanizm, qo'shimcha kod kerak emas).

## Qarorlar (foydalanuvchi bilan kelishilgan)

- **Video usuli:** kameraga qarab turgan ko'rinayotgan cardlar haqiqiy treyler oynatadi, orqadagilar poster/pauza. Barcha ~95 videoni birdan oynatish rad etildi (brauzer dekoder limiti ~16). Bunny animatsion preview varianti ham rad etildi.
- **Card soni:** API limit 20 → 100; slotlar ketma-ket unikal to'ldiriladi, film yetmasa takrorlanadi (devorda teshik qolmaydi).
- **Yangilanish:** faqat sahifa ochilganda (jonli polling rad etildi).

## O'zgarishlar

### `js/film-reel.js`

- `N_ROWS`: 6 → 5.
- Slot to'ldirish: `movies[(i + ri * 7) % movies.length]` → `movies[(ri * count + i) % movies.length]` — har slot unikal film (yetarli bo'lsa).
- `MAX_VIDEOS`: desktop 7 → 16, mobil 3 → 4.
- `COS_PLAY`: `cos(0.85)` → `cos(1.15)` — oynash sektori butun ko'rinish maydonini qamraydi; `rank < MAX_VIDEOS` cheklovi baribir eng yaqinlarini tanlaydi.
- **Video pool cheklovi (yangi):** hozir yaratilgan `<video>` element abadiy saqlanadi — 95 unikal treyler bilan xotira oshib ketadi. `updateVideos()`da markazdan uzoqlik bo'yicha rank ≥ 24 bo'lgan videolar to'liq yo'q qilinadi (pause, HLS destroy, `src` bo'shatish, `videoTex.dispose()`); kerak bo'lganda `ensureVideo` qayta yaratadi. 16 < rank < 24 oralig'i gisterezis — scroll paytida yaratish/o'chirish tebranishi bo'lmasligi uchun.

### `js/api.js`

- `newMovies()` → `newMovies(limit = 20)` — default 20, mavjud chaqiruvchilar buzilmaydi.

### `pages/new.html`

- `MoviesAPI.newMovies(100)` chaqiriladi.
- Devorga `newList` to'liq beriladi (hozirgi `slice(0, 20)` o'rniga `slice(0, 100)`).
- Pastdagi katalog grid va hero band **o'zgarmaydi** — grid avvalgidek faqat dastlabki 20 tani ko'rsatadi (sahifa xatti-harakati o'zgarmasin).
- Keshbuster `?v=9` → `?v=10`.

## O'zgarmaydiganlar

Drag/scroll boshqaruvi, klik-zoom (1050ms), tooltip, WebGL-yo'q fallback (featured band), mobil svayp, `CP_LITE` tekshiruvi.

## Xavflar

- 16 ta parallel video kuchsiz qurilmalarda og'ir bo'lishi mumkin — mobilda 4 ta cheklov saqlanadi, HLS'da `capLevelToPlayerSize` past sifatni tanlaydi.
- Bazada 95+ film bo'lmasa takrorlash qaytadi — bu kutilgan xatti-harakat.
