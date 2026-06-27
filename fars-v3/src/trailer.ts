import axios from 'axios';

// ─── YouTube Data API v3 orqali ───────────────────────────────────────────────
async function findViaApi(title: string, year: string): Promise<string | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;

  try {
    const query = `${title} ${year} official trailer`;
    const res = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: 3,
        key,
      },
      timeout: 10_000,
    });

    const items = res.data?.items || [];
    const videoId = items[0]?.id?.videoId;
    return videoId || null;
  } catch {
    return null;
  }
}

// ─── HTML scraping (API kalit bo'lmasa) ──────────────────────────────────────
async function findViaScraping(title: string, year: string): Promise<string | null> {
  try {
    const query = encodeURIComponent(`${title} ${year} official trailer`);
    const url = `https://www.youtube.com/results?search_query=${query}`;

    const res = await axios.get(url, {
      timeout: 15_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    // ytInitialData dan video ID topish
    const match = res.data.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ─── Asosiy funksiya ──────────────────────────────────────────────────────────
export async function findYouTubeTrailer(title: string, year: string): Promise<string | null> {
  // Avval API orqali sinab ko'r
  const apiResult = await findViaApi(title, year);
  if (apiResult) {
    console.log(`  ✅ YouTube trailer ID (API): ${apiResult}`);
    return apiResult;
  }

  // Keyin scraping
  const scrapeResult = await findViaScraping(title, year);
  if (scrapeResult) {
    console.log(`  ✅ YouTube trailer ID (scraping): ${scrapeResult}`);
    return scrapeResult;
  }

  console.log('  ⚠️  YouTube trailer topilmadi, bo\'sh qoladi');
  return null;
}
