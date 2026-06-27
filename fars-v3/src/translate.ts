import axios from 'axios';

// Google Translate ning bepul, API kalitsiz endpointi
const TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';

export async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text || text.trim().length < 10) return text;
  try {
    const response = await axios.get(TRANSLATE_URL, {
      params: {
        client: 'gtx',
        sl: 'en',
        tl: targetLang,
        dt: 't',
        q: text,
      },
      timeout: 15_000,
    });

    // Natijani yig'ish
    const data = response.data;
    if (!Array.isArray(data) || !Array.isArray(data[0])) return text;

    const translated = data[0]
      .filter(Array.isArray)
      .map((chunk: string[]) => chunk[0] || '')
      .join('');

    return translated || text;
  } catch (e) {
    console.log(`  ⚠️  Tarjima xato (${targetLang}): ${(e as Error).message}`);
    return text;
  }
}

// OMDB Plot ni uzbek va ruscha tarjima qilish
export async function translateDescriptions(
  englishText: string | undefined
): Promise<{ uz?: string; ru?: string }> {
  if (!englishText) return {};

  console.log('  🌐 Tavsifni tarjima qilish (EN → UZ, RU)...');

  const [uz, ru] = await Promise.all([
    translateText(englishText, 'uz'),
    translateText(englishText, 'ru'),
  ]);

  return { uz, ru };
}
