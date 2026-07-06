# CloudFront orqali video segmentlarini himoyalash — sozlash qo'llanmasi

Bu qadamlar **AWS Console orqali qo'lda** bajariladi — kod ularni avtomatlashtira olmaydi
(AWS akkaunti, to'lov usuli va konsolga kirish talab qilinadi). Kod tomoni
(`backend/src/services/videoAccess.js`, `POST /api/watch/:id/start`, frontend) allaqachon
tayyor va quyida ko'rsatilgan environment o'zgaruvchilarini kutmoqda.

Joriy holat: video `.ts`/`.m3u8` fayllar ochiq S3 URL orqali hech qanday
autentifikatsiyasiz yuklanadi. Maqsad — bu fayllarni faqat bizning saytimiz orqali,
tizimga kirgan foydalanuvchi uchun, 6 soatlik signed cookie bilan ochiladigan qilish.

---

## 1-qadam — S3 bucket'ni CloudFront uchun tayyorlash

1. AWS Console → **S3** → `cine-plex-uz` bucket'ini oching.
2. **Permissions** → **Block public access** → hozircha **tegmang** (keyingi qadamda
   CloudFront Origin Access Control sozlangandan so'ng, bucket policy shu OAC'ga
   ruxsat beradigan qilib almashtiriladi, shundan keyingina "Block all public access"
   ni yoqasiz — aks holda distribution sozlanmasdan turib video butunlay ishlamay qoladi).

## 2-qadam — CloudFront Distribution yaratish

1. AWS Console → **CloudFront** → **Create distribution**.
2. **Origin domain**: `cine-plex-uz.s3.eu-north-1.amazonaws.com` ni tanlang.
3. **Origin access**: **Origin access control settings (recommended)** → **Create control
   setting** → default sozlamalar bilan yarating (Sign requests — "Sign requests (recommended)").
4. **Viewer protocol policy**: **Redirect HTTP to HTTPS**.
5. **Restrict viewer access**: **Yes** ni tanlang (bu — signed cookie talab qilish degani).
   - **Trusted authorization type**: **Trusted key groups** ni tanlang (Trusted signers emas —
     Key Groups zamonaviy va tavsiya etiladigan usul).
   - Key Group hali yo'q bo'lsa, keyingi qadamda yaratib, shu yerga qaytib bog'laysiz.
6. **Create distribution** tugmasini bosing. Yaratilgandan keyin CloudFront sizga
   domen beradi, masalan: `d111111abcdef8.cloudfront.net`.
7. (Ixtiyoriy, tavsiya etiladi) **Alternate domain name (CNAME)** qo'shib, masalan
   `cdn.cineplex.uz` ni ulang va SSL sertifikat (ACM, `us-east-1` mintaqasida)
   biriktiring — bu keyinchalik cookie domenini API bilan bir xil asosiy domenga
   (`cineplex.uz`) bog'lash uchun zarur (pastga qarang: "Domenlar haqida muhim eslatma").
8. Distribution yaratilgandan keyin S3 bucket policy'ni CloudFront o'zi taklif qiladi
   ("Copy policy" tugmasi) — shuni bucket'ning **Permissions → Bucket policy**'ga
   joylashtiring. Shundan KEYIN, agar xohlasangiz, **Block all public access**'ni yoqing
   — endi faqat CloudFront (OAC orqali) S3'ga murojaat qila oladi, to'g'ridan-to'g'ri
   `https://cine-plex-uz.s3...amazonaws.com/...` URL'lari ishlamay qoladi (aynan shu
   maqsad qilingan edi).

## 3-qadam — Key Group va Public/Private Key juftligini yaratish

Signed cookie ishlab chiqarish uchun RSA kalit juftligi kerak.

1. Terminalda (mahalliy kompyuteringizda, xavfsiz joyda) RSA kalit yarating:
   ```bash
   openssl genrsa -out cineplex_cf_private.pem 2048
   openssl rsa -pubout -in cineplex_cf_private.pem -out cineplex_cf_public.pem
   ```
2. AWS Console → **CloudFront** → chap menyuda **Key management** → **Public keys** →
   **Create public key** → `cineplex_cf_public.pem` faylining ichini joylashtiring.
3. **Key management** → **Key groups** → **Create key group** → yuqorida yaratilgan
   public key'ni shu guruhga qo'shing.
4. Distribution'ning **Behaviors** sozlamasiga qaytib, **Restrict viewer access**
   qismida shu Key Group'ni tanlang (agar 2-qadamda tanlanmagan bo'lsa).
5. `cineplex_cf_private.pem` faylini **hech qachon** git'ga commit qilmang — u faqat
   backend serverning environment o'zgaruvchisiga (`CF_PRIVATE_KEY`) yoziladi.

## 4-qadam — Environment o'zgaruvchilarini serverga qo'yish

Backend joylashgan platformada (Render/Vercel — dashboard orqali) quyidagilarni qo'shing
(qiymatlar `.env.example` faylida ham izohlangan):

| O'zgaruvchi | Qiymat |
|---|---|
| `CF_DOMAIN` | CloudFront domeni, masalan `cdn.cineplex.uz` yoki `d111111abcdef8.cloudfront.net` |
| `CF_KEY_PAIR_ID` | Yaratilgan **Public key**'ning ID'si (Key management → Public keys → ID ustuni) |
| `CF_PRIVATE_KEY` | `cineplex_cf_private.pem` faylining TO'LIQ matni. Ko'p qatorli bo'lgani uchun har bir qator orasiga literal `\n` qo'yib, bitta qatorga yozing (kod buni avtomatik haqiqiy newline'ga aylantiradi) |
| `CF_COOKIE_DOMAIN` | Pastga qarang — odatda `.cineplex.uz` |

## Domenlar haqida muhim eslatma

CloudFront signed cookie ishlashi uchun **bizning API serverimiz o'rnatgan cookie**
brauzer tomonidan **CloudFront'ga so'rov yuborilganda ham yuborilishi** kerak. Cookie'lar
faqat bir xil (yoki umumiy ота) domen ostida ulashiladi — shuning uchun:

- API qayerda: masalan `www.cineplex.uz` yoki `api.cineplex.uz`
- CloudFront qayerda: masalan `cdn.cineplex.uz` (2-qadam, 7-band — CNAME orqali)
- Ikkalasi ham **bitta asosiy domenning** (`cineplex.uz`) sub-domenlari bo'lishi kerak,
  va `CF_COOKIE_DOMAIN=.cineplex.uz` qilib qo'yilishi kerak — shundagina cookie
  ikkalasiga ham yuboriladi.

Agar CloudFront'ni default `*.cloudfront.net` domenida qoldirsangiz (CNAME
ulanmasa), signed cookie ISHLAMAYDI — chunki `cineplex.uz` cookie'si
`cloudfront.net`ga hech qachon yuborilmaydi (butunlay boshqa domen). Shuning
uchun 2-qadamning 7-bandi (custom domen + SSL) MAJBURIY, ixtiyoriy emas.

## 5-qadam — Tekshirish

1. Serverni qayta ishga tushiring (yangi env o'zgaruvchilar bilan).
2. Saytga kiring, biror filmni oching va tomosha qilishni boshlang.
3. Brauzer DevTools → **Application/Storage → Cookies** → `CloudFront-Policy`,
   `CloudFront-Signature`, `CloudFront-Key-Pair-Id` cookie'lari mavjudligini tekshiring.
4. **Network** tabida video segmentlari (`.ts`) endi `CF_DOMAIN` orqali (S3 emas)
   yuklanayotganini tasdiqlang.
5. Cookie'larni brauzerdan qo'lda o'chirib, xuddi shu video segment URL'ini
   to'g'ridan-to'g'ri manzil qatoriga kiritib ochib ko'ring — **Access Denied**
   xatosi chiqishi kerak (himoya ishlayotganining isboti).

## Kod tomonidan avtomatik ishlaydigan qism (allaqachon tayyor)

- `backend/src/services/videoAccess.js` — `issueVideoCookies()`, 6 soatlik signed
  cookie generatsiya qiladi (`@aws-sdk/cloudfront-signer`).
- `POST /api/watch/:id/start` — tizimga kirgan foydalanuvchi uchun cookie beradi
  va videoUrl'ni CloudFront domeniga qayta yo'naltirib qaytaradi.
- `pages/watch.html` — pleer ishga tushishidan oldin shu endpoint'ga so'rov yuboradi;
  CloudFront hali sozlanmagan yoki xato yuz bergan holatda **avtomatik ravishda**
  eski (to'g'ridan-to'g'ri S3) manzilga qaytadi — sayt hech qachon sinmaydi.
