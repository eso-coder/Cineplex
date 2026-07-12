const logger = require('./logger');

// Bepul (kalitsiz) Google Translate endpoint'i orqali matnni tarjima qiladi.
// npm paketlari (masalan @vitalets/google-translate-api) ESM/CJS dual-package
// muammosi tufayli Vercel serverless bundle'da ishlamay qoldi — shu sababli
// to'g'ridan-to'g'ri Google'ning oddiy HTTP endpoint'iga fetch qilamiz (bir xil
// mexanizm, lekin bundling muammosisiz).
async function translateText(text, targetLang) {
  if (!text || !text.trim()) return '';
  try {
    const url = 'https://translate.googleapis.com/translate_a/single'
      + '?client=gtx&sl=auto&tl=' + encodeURIComponent(targetLang)
      + '&dt=t&q=' + encodeURIComponent(text);
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return (data[0] || []).map((chunk) => chunk[0] || '').join('');
  } catch (err) {
    logger.warn(`[translate] ${targetLang} tarjimasi muvaffaqiyatsiz: ${err.message}`);
    return '';
  }
}

// Film uchun yetishmayotgan title_ru/title_en/description_ru/description_en
// maydonlarini asl (uz) matndan avtomatik tarjima qiladi.
// `fields` — mavjud/yangi qiymatlar: { title, description, title_ru, title_en, description_ru, description_en }
// Qaytadi: faqat YANGI hisoblangan maydonlarni o'z ichiga olgan obyekt (mavjudlarga tegmaydi).
async function autoTranslateMovieFields(fields) {
  const result = {};
  const tasks = [];

  if (fields.title && !fields.title_ru) {
    tasks.push(translateText(fields.title, 'ru').then((t) => { if (t) result.title_ru = t; }));
  }
  if (fields.title && !fields.title_en) {
    tasks.push(translateText(fields.title, 'en').then((t) => { if (t) result.title_en = t; }));
  }
  if (fields.description && !fields.description_ru) {
    tasks.push(translateText(fields.description, 'ru').then((t) => { if (t) result.description_ru = t; }));
  }
  if (fields.description && !fields.description_en) {
    tasks.push(translateText(fields.description, 'en').then((t) => { if (t) result.description_en = t; }));
  }

  await Promise.all(tasks);
  return result;
}

module.exports = { translateText, autoTranslateMovieFields };
