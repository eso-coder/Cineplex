// Yengil, tashqi paketsiz fuzzy (taxminiy) matn qidiruvi.
// Ilgari fuse.js ishlatilgan edi, lekin uning ESM/CJS dual-package
// muammosi Vercel serverless funksiyada butun controller modulini
// require() bosqichida qulatib qo'yardi (FUNCTION_INVOCATION_FAILED).
// Shu sababli tashqi bog'liqliksiz, oddiy Levenshtein-asosli skorlash bilan.

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, ''); // diakritik belgilarni olib tashlash
}

// Standart Levenshtein tahrirlash masofasi
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// query'ni field ichidagi eng mos so'z bilan solishtirib 0..1 oralig'ida skor beradi
// (1 = aniq mos/substring, 0 = umuman mos emas).
function scoreField(query, field) {
  const f = normalize(field);
  const q = normalize(query);
  if (!f || !q) return 0;
  if (f.includes(q)) return 1; // to'liq substring mos kelishi — eng yaxshi skor

  // Field'ni so'zlarga bo'lib, har biriga nisbatan eng yaqin masofani topamiz
  const words = f.split(/\s+/).filter(Boolean);
  let best = 0;
  words.forEach((w) => {
    const dist = levenshtein(q, w);
    const maxLen = Math.max(q.length, w.length);
    const ratio = maxLen ? 1 - dist / maxLen : 0;
    if (ratio > best) best = ratio;
  });
  // Butun field bo'yicha ham tekshiramiz (uzun tavsiflar ichida qisman mos so'z ketma-ketligi uchun)
  const wholeDist = levenshtein(q, f);
  const wholeRatio = 1 - wholeDist / Math.max(q.length, f.length);
  return Math.max(best, wholeRatio);
}

/**
 * items — obyektlar massivi
 * query — qidiruv matni
 * keys — [{ name: 'title', weight: 2 }, ...] — name nuqta bilan ('genres.name') yoki massiv bo'lishi mumkin
 * threshold — shu skordan yuqori bo'lgan natijalar qaytariladi (0..1)
 */
function fuzzySearch(items, query, keys, threshold = 0.45) {
  const q = query.trim();
  if (!q) return [];

  const getValue = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

  const scored = items.map((item) => {
    let best = 0;
    keys.forEach(({ name, weight = 1 }) => {
      let value = getValue(item, name);
      if (value == null) return;
      const values = Array.isArray(value) ? value : [value];
      values.forEach((v) => {
        const s = scoreField(q, String(v)) * Math.min(weight, 2) / 2;
        if (s > best) best = s;
      });
    });
    return { item, score: best };
  });

  return scored
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
}

module.exports = { fuzzySearch };
