const { translate } = require('@vitalets/google-translate-api');
const logger = require('./logger');

// Bepul (kalitsiz) Google Translate orqali matnni tarjima qiladi.
// Xato bo'lsa (tarmoq/rate-limit) bo'sh qator qaytaradi — chaqiruvchi
// tomon buni "tarjima hali yo'q" deb talqin qiladi va asl (uz) matnga
// zaxira qiladi (frontend allaqachon shunday fallback qiladi).
async function translateText(text, targetLang) {
  if (!text || !text.trim()) return '';
  try {
    const res = await translate(text, { to: targetLang });
    return res.text;
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
