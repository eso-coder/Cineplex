# CINEPLEX

O'zbek tilidagi onlayn kinoteatr (streaming sayt): filmlar, seriallar, aktyorlar, qidiruv, profil/watchlist. Vanilla HTML/CSS/JS frontend + Node/Express backend (MongoDB Atlas), Vercel'da hosting.

- **register:** product (dizayn xizmat qiladi — foydalanuvchi kino tanlash/ko'rish vazifasida)
- **Auditoriya:** telefon va Smart TV'da kino ko'radigan keng auditoriya; mobil ulush katta.
- **Dizayn tili:** "Liquid Glass" — iOS dark system palitrasi, monoxrom (accent = oq), Outfit font, blur/saturate shisha materiallar (`--glass-*` tokenlar `css/main.css` boshida), harakat: ease-out + yengil spring, faqat opacity/transform.
- **Muhim cheklov:** kuchsiz qurilmalar uchun `perf-lite` rejimi bor (`js/perf-lite.js`, `html.perf-lite`) — og'ir blur/glow o'chadi; yangi UI shu rejimda ham ishlashi shart.
- **Tillar:** uz (asosiy), ru, en — `js/i18n.js`, matnlar `T('key', 'fallback')` orqali.
