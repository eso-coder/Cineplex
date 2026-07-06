const { getSignedCookies } = require('@aws-sdk/cloudfront-signer');
const { cloudfront } = require('../config/env');

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

const isConfigured = () =>
  !!(cloudfront.domain && cloudfront.keyPairId && cloudfront.privateKey);

// S3 videoUrl'dan "{movieFolder}" segmentini ajratib oladi:
// https://cine-plex-uz.s3.eu-north-1.amazonaws.com/the-princess-bride1987/master.m3u8
//   -> "the-princess-bride1987"
function extractMovieFolder(s3Url) {
  if (!s3Url) return null;
  const match = s3Url.match(/amazonaws\.com\/([^/]+)\//);
  return match ? match[1] : null;
}

// S3 videoUrl'ni bir xil path bilan CloudFront domeniga almashtiradi.
// isConfigured() false bo'lsa — o'zgarishsiz (S3) qaytaradi (graceful fallback).
function toCloudFrontUrl(s3Url) {
  if (!s3Url || !isConfigured()) return s3Url;
  try {
    const u = new URL(s3Url);
    return `https://${cloudfront.domain}${u.pathname}`;
  } catch {
    return s3Url;
  }
}

// 6 soatlik CloudFront signed cookie'larni javobga qo'shadi. Cookie policy
// {movieFolder}/* ostidagi HAMMA narsaga (master.m3u8, variant playlist'lar,
// .ts segmentlar, subtitr) ruxsat beradi — shuning uchun signed URL emas,
// aynan signed COOKIE ishlatiladi (HLS ko'p faylli bo'lgani uchun).
function issueVideoCookies(res, movieFolder) {
  if (!isConfigured()) {
    throw new Error(
      'CloudFront konfiguratsiyasi to\'liq emas (CF_DOMAIN / CF_KEY_PAIR_ID / CF_PRIVATE_KEY). ' +
      'SETUP_CLOUDFRONT.md ga qarang.'
    );
  }

  const expiresAt = new Date(Date.now() + SIX_HOURS_MS);
  const resourceUrl = `https://${cloudfront.domain}/${movieFolder}/*`;

  const cookies = getSignedCookies({
    url: resourceUrl,
    keyPairId: cloudfront.keyPairId,
    privateKey: cloudfront.privateKey,
    dateLessThan: expiresAt.toISOString(),
  });

  const cookieOpts = {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'none', // CDN alohida (sub)domenda bo'lgani uchun kerak
    expires: expiresAt,
    ...(cloudfront.cookieDomain ? { domain: cloudfront.cookieDomain } : {}),
  };

  Object.entries(cookies).forEach(([name, value]) => {
    res.cookie(name, value, cookieOpts);
  });

  return { expiresAt };
}

module.exports = { issueVideoCookies, extractMovieFolder, toCloudFrontUrl, isConfigured };
