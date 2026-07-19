/* ═══════════════════════════════════════════════════════
   CINEPLEX — PERF LITE rejimi (kuchsiz qurilmalar uchun)

   Muammo: Smart TV va kuchsiz telefonlarda sayt qotib qolardi —
   asosiy sabab 160+ backdrop-filter/blur, har kartadagi glow-rasm,
   cheksiz animatsiyalar va hero'dagi autoplay treyler.

   Yechim: qurilma kuchsiz deb topilsa <html> ga .perf-lite klassi
   qo'yiladi (CSS og'ir effektlarni o'chiradi) va window.CP_LITE=true
   bo'ladi (JS treyler/glow kabi og'ir ishlarni o'tkazib yuboradi).

   Aniqlash tartibi (birinchi mos kelgani g'olib):
     1) URL:  ?lite=1 majburiy yoqadi, ?lite=0 o'chiradi (saqlanadi)
     2) localStorage cp_lite3 ('1'/'0') — faqat qo'lda ?lite= tanlovi
     3) Smart TV user-agent / kam RAM (<=2GB) / kam yadro (<=2)
     4) FPS zond: sahifa yuklangach ~2s davomida o'rtacha FPS < 22
        bo'lsa — lite yoqiladi va SHU SESSIYA uchun saqlanadi
        (abadiy emas — bitta sekin yuklanish qamab qo'ymasin).

   MUHIM: bu fayl <head> ichida, CSS'dan OLDIN sinxron yuklanadi —
   shunda birinchi paint'dan boshlab yengil rejim amal qiladi.
═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var root = document.documentElement;

  function enable() {
    window.CP_LITE = true;
    root.classList.add('perf-lite');
  }

  /* MIGRATSIYA: eski 'cp_lite' va 'cp_lite2' kalitlari FPS zond tufayli
     kuchli qurilmalarda ham noto'g'ri '1' bo'lib qolgan bo'lishi mumkin
     (bir marta sekin yuklanish → abadiy lite → treyler yo'q) — ularga
     ishonmaymiz, o'chiramiz. Yangi kalit 'cp_lite3' FAQAT qo'lda
     (?lite=1/0) tanlovni saqlaydi; haqiqiy kuchsiz qurilmalar quyida
     har safar qaytadan to'g'ri aniqlanadi. */
  try { localStorage.removeItem('cp_lite'); localStorage.removeItem('cp_lite2'); } catch (e) {}

  /* 1) URL bilan majburlash (test/qo'lda boshqarish uchun) */
  var q = String(location.search || '');
  var forced = null;
  if (/[?&]lite=1\b/.test(q)) forced = true;
  else if (/[?&]lite=0\b/.test(q)) forced = false;
  if (forced !== null) {
    try { localStorage.setItem('cp_lite3', forced ? '1' : '0'); } catch (e) {}
  }

  /* 2) Saqlangan qaror (faqat qo'lda ?lite= bilan tanlangani doimiy;
     FPS zond xulosasi SESSIYAGA tegishli — quyida sessionStorage) */
  var stored = null;
  try { stored = localStorage.getItem('cp_lite3'); } catch (e) {}
  var fpsVerdict = null;
  try { fpsVerdict = sessionStorage.getItem('cp_lite_fps'); } catch (e) {}

  var ua = navigator.userAgent || '';
  var isTV = /SmartTV|SMART-TV|Tizen|Web0S|WebOS|NetCast|HbbTV|CrKey|BRAVIA|GoogleTV|Android TV|AFT[A-Z]|Roku|VIDAA|Viera|Opera TV|POV_TV|TV Bro/i.test(ua);
  /* Desktop kompyuter (Windows/Mac/ChromeOS/Linux) va TV emas — FPS zond
     BUNDAY qurilmalarga umuman qo'llanmaydi: zond aslida "kuchli"
     ko'rinib yolg'on gapiradigan TV brauzerlari uchun edi. Desktop'da
     bitta sekin moment (batareya tejash, og'ir yuklanish) sessiyani
     lite'ga qamab qo'yardi — sessionStorage F5'da ham saqlanadi, shuning
     uchun bir tab'da treyler "abadiy" yo'qolib qolardi. */
  var isDesktop = !isTV && /Windows NT|Macintosh|CrOS|X11; Linux/i.test(ua);
  if (isDesktop) {
    /* Eski sessiyada noto'g'ri qo'yilgan qamoqni ochamiz */
    try { sessionStorage.removeItem('cp_lite_fps'); } catch (e) {}
    fpsVerdict = null;
  }

  var lite = false;
  var decided = false; /* aniq qaror bormi (FPS zond kerak emasmi) */

  if (forced !== null) { lite = forced; decided = true; }
  else if (stored === '1') { lite = true; decided = true; }
  else if (stored === '0') { lite = false; decided = true; }
  else if (fpsVerdict === '1') { lite = true; decided = true; }
  else {
    /* 3) Qurilma belgilariga qarab avtomatik */
    var mem = navigator.deviceMemory || 0;          /* GB (Chrome'da bor) */
    var cores = navigator.hardwareConcurrency || 0;
    lite = isTV || (mem > 0 && mem <= 2) || (cores > 0 && cores <= 2);
    if (lite) decided = true;
    else if (isDesktop) decided = true; /* desktop'da FPS zond o'tkazilmaydi */
  }

  window.CP_LITE = lite;
  if (lite) enable();

  /* 4) FPS zond — belgilar bo'yicha "kuchli" ko'ringan, lekin aslida
     sekin qurilmalarni ushlaydi (masalan, 4 yadro deb yolg'on aytadigan
     TV brauzerlari). Sahifa to'liq yuklangach 1.2s kutib, ~2s o'lchaymiz —
     yuklanish paytidagi tabiiy sekinlik noto'g'ri trigger bermasin. */
  if (!decided) {
    var probe = function () {
      setTimeout(function () {
        var frames = 0, start;
        var tick = function (t) {
          /* Fon tabda brauzer kadrlarni ataylab sekinlatadi — o'lchov
             yolg'on chiqib, kuchli qurilma abadiy lite'ga tushib qolardi.
             Tab ko'ringuncha o'lchovni qayta boshlab turamiz. */
          if (document.hidden) { start = undefined; frames = 0; requestAnimationFrame(tick); return; }
          if (start === undefined) start = t;
          frames++;
          if (t - start < 2000) { requestAnimationFrame(tick); return; }
          var fps = frames / ((t - start) / 1000);
          if (fps < 22) {
            enable();
            /* MUHIM: sessionStorage — bitta sekin yuklanish qurilmani
               ABADIY lite'ga (treylersiz) qamab qo'ymasligi uchun.
               Haqiqiy kuchsiz qurilma keyingi sessiyada ham qayta
               aniqlanadi (UA/RAM/yadro yoki yana FPS zond orqali). */
            try { sessionStorage.setItem('cp_lite_fps', '1'); } catch (e) {}
          }
        };
        requestAnimationFrame(tick);
      }, 1200);
    };
    if (document.readyState === 'complete') probe();
    else window.addEventListener('load', probe);
  }
})();
