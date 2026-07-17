/* ═══════════════════════════════════════════════════════════════════
   CINEPLEX — 3D FILM GLOBE (Yangi chiqmalar)
   phantom.land uslubidagi immersiv galereya — endi TO'LIQ SFERA:
   tomoshabin (kamera) yadroda, kartalar yer po'stlog'idek atrofni
   qoplaydi. Istalgan tomonga (gorizontal + vertikal) trackball kabi
   aylantiriladi — sfera yopiq bo'lgani uchun har yo'nalishda cheksiz.

   Tuzilish:
   - Kenglik (latitude) halqalari: har halqada aylana uzunligiga qarab
     kartalar soni (qutbga yaqin kamroq). Hammasi bitta qattiq `globe`
     guruhida — kirish (drag/wheel) guruhni world-o'qlar atrofida
     buradi (rotateOnWorldAxis) → chin globus his.
   - Karta: qora tile, YUMALOQLANGAN burchakli media oynasi (treyler
     video-texture yoki poster), pastki barda mayda sarlavha/reyting.
     Kartalar orasida juda kichik masofa (tile chetidagi qora hoshiya).
   - Video: to'g'ridan-to'g'ri mp4/webm HAMDA HLS (.m3u8 — hls.js
     CDN'dan kerak bo'lganda yuklanadi; Safari'da native). YouTube'ni
     WebGL texturaga olib bo'lmaydi — ularda poster. Bir vaqtda maks
     6-8 video, markazdan uzoqlari pauza.
   - Hover: kattalashish + tooltip; klik/tap: kamera kadr tomon zoom +
     fade → watch sahifasi. CP_LITE/WebGL yo'q — init false, sahifada
     oddiy band fallback qoladi.
   ═══════════════════════════════════════════════════════════════════ */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const FilmReel = (() => {
  'use strict';

  /* ── O'lchamlar (world birlikda) — KATTA kartalar, gap nol:
     oyna katakni deyarli to'liq egallaydi (faqat pastda label bar),
     kenglik halqalari oralig'i aynan CELL_H ga teng — qatorlar tegib
     turadi, gorizontalda slot kengligi tile'ga teng ── */
  const R       = 10;     /* sfera radiusi (kamera markazda) */
  const CELL_W  = 4.4;    /* karta katagi eni (slot) */
  const WIN_W   = 4.36;   /* media oynasi — katakni to'liq egallaydi */
  const WIN_H   = 2.45;   /* 16:9 */
  const LABELBAR = 0.36;  /* pastdagi yozuv bar'i */
  const CELL_H  = WIN_H + LABELBAR; /* 2.81 */
  const WIN_OFF = LABELBAR / 2;     /* oyna tepaga surilgan */
  const CORNER  = 0.13;   /* oyna burchak radiusi (world) — yumaloq */
  const SEGS    = 24;

  /* ── Tile overlay texturasi: qora katak + yumaloqlangan shaffof oyna.
     Sprocket/plyonka elementlari YO'Q — minimal phantom estetikasi. ── */
  function makeTileTexture() {
    const W = 512, H = Math.round(512 * CELL_H / CELL_W);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#0a0a0c';
    x.fillRect(0, 0, W, H);
    /* Yumaloqlangan media oynasi — shaffof teshik */
    const winW = W * WIN_W / CELL_W, winH = H * WIN_H / CELL_H;
    const wx = (W - winW) / 2;
    const wy = H * (0.5 - WIN_OFF / CELL_H) - winH / 2;
    const r = W * CORNER / CELL_W;
    x.save();
    x.globalCompositeOperation = 'destination-out';
    x.beginPath();
    x.roundRect(wx, wy, winW, winH, r);
    x.fill();
    x.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  /* ── Poster yo'q/yuklanmasa — sarlavhali placeholder ── */
  function makePlaceholderTexture(title) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 288;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 512, 288);
    g.addColorStop(0, '#222024');
    g.addColorStop(1, '#0e0d10');
    x.fillStyle = g;
    x.fillRect(0, 0, 512, 288);
    x.fillStyle = 'rgba(255,255,255,0.85)';
    x.font = '700 34px Outfit, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const t = String(title || 'CINEPLEX');
    x.fillText(t.length > 22 ? t.slice(0, 21) + '…' : t, 256, 144);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* Teksturani oynaga "cover" qilib kesish (poster 2:3 bo'lsa ham) */
  function coverCrop(tex, mediaW, mediaH) {
    if (!mediaW || !mediaH) return;
    const winA = WIN_W / WIN_H, mediaA = mediaW / mediaH;
    if (mediaA > winA) {
      const rx = winA / mediaA;
      tex.repeat.set(rx, 1);
      tex.offset.set((1 - rx) / 2, 0);
    } else {
      const ry = mediaA / winA;
      tex.repeat.set(1, ry);
      tex.offset.set(0, (1 - ry) / 2);
    }
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  }

  /* Silindr yoyi bo'ylab egilgan plane — ICHKI sirt (kamera ichkarida).
     x manfiy sin bilan: winding teskarilanadi (old yuz ichkariga) va
     tekstura ichkaridan to'g'ri (ko'zgusiz) o'qiladi. */
  function curvedPlane(w, h, radius, segs) {
    const geo = new THREE.PlaneGeometry(w, h, segs, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const a = px / radius;
      pos.setX(i, -Math.sin(a) * radius);
      pos.setZ(i, Math.cos(a) * radius);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  const isPlayableVideo = (url) =>
    /\.(mp4|webm|mov|m3u8)(\?|#|$)/i.test(String(url || ''));
  const isHls = (url) => /\.m3u8(\?|#|$)/i.test(String(url || ''));

  /* hls.js — faqat kerak bo'lganda, bir marta yuklanadi */
  let hlsLoader = null;
  function loadHlsLib() {
    if (window.Hls) return Promise.resolve();
    if (hlsLoader) return hlsLoader;
    hlsLoader = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    return hlsLoader;
  }

  /* ═══════════════ INIT ═══════════════ */
  function init(wrapEl, tooltipEl, fadeEl, movies, opts) {
    opts = opts || {};
    if (!wrapEl || !movies || !movies.length) return false;
    if (window.CP_LITE) return false;

    const isMobile = window.innerWidth <= 640;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (_) { return false; }

    THREE.Cache.enabled = true;
    const MAX_VIDEOS = isMobile ? 3 : 7;
    const DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 1.75);

    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x0a0a0a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    wrapEl.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0a0a, R + 1.5, R + 9); /* chetlar asta so'nadi */

    /* Kamera — sfera YADROsida */
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 60);
    camera.position.set(0, 0, 0);
    const LOOK = new THREE.Vector3(0, 0, R);

    const tileTex = makeTileTexture();

    /* ── GLOBUS: kenglik halqalari ── */
    /* Halqalar oralig'i AYNAN karta balandligi (arc) — qatorlar orasida
       masofa nol. ±4 halqa ≈ ±64°; qutblar qorong'i qoladi. */
    const dLat = CELL_H / R;
    const K = isMobile ? 3 : 4;
    const LATS = [];
    for (let k = -K; k <= K; k++) LATS.push(k * dLat);

    const globe = new THREE.Group();
    scene.add(globe);

    const frames = [];
    const rayCells = [];

    /* Media tile teshigidan ozgina kattaroq — chetlarda yoriq qolmasin */
    const winGeo = curvedPlane(WIN_W + 0.06, WIN_H + 0.06, R + 0.03, SEGS);
    const labelGeo = new THREE.PlaneGeometry(CELL_W * 0.88, 0.2);

    /* Har film uchun placeholder/label texturalari keshlanadi */
    const phCache = {}, labelCache = {};
    const placeholderFor = (m) =>
      phCache[m.id] || (phCache[m.id] = makePlaceholderTexture(m.title));
    function labelFor(m) {
      if (labelCache[m.id]) return labelCache[m.id];
      const c = document.createElement('canvas');
      c.width = 1024; c.height = 76;
      const x = c.getContext('2d');
      x.font = '600 30px Outfit, sans-serif';
      x.textBaseline = 'middle';
      x.fillStyle = 'rgba(255,255,255,0.5)';
      const t = String(m.title || '').toUpperCase();
      x.fillText(t.length > 30 ? t.slice(0, 29) + '…' : t, 8, 40);
      x.textAlign = 'right';
      x.fillStyle = 'rgba(255,255,255,0.34)';
      x.fillText([m.year, m.rating ? '★ ' + m.rating : ''].filter(Boolean).join('   '), 1016, 40);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return (labelCache[m.id] = tex);
    }

    let movieIdx = 0;
    const nextMovie = () => movies[movieIdx++ % movies.length];

    /* Halqadagi katak geometriyalari keshlanadi (halqa radiusiga qarab) */
    const cellGeoCache = {};

    LATS.forEach((lat, ri) => {
      const ringR = R * Math.cos(lat);
      const count = Math.max(3, Math.round((2 * Math.PI * ringR) / CELL_W));
      const step = (2 * Math.PI) / count;
      const slotW = Math.min(step * ringR, CELL_W + 0.6);
      const geoKey = Math.round(slotW * 100);
      const cellGeo = cellGeoCache[geoKey]
        || (cellGeoCache[geoKey] = curvedPlane(slotW, CELL_H, R, SEGS));

      for (let i = 0; i < count; i++) {
        const m = nextMovie();
        const lon = (i + (ri % 2) * 0.5) * step;
        const dim = 1 - Math.abs(lat) / (Math.PI / 2) * 0.3;

        /* pivot(lon, Y-o'q) → latP(lat, X-o'q) → meshlar z=+R da:
           natijada karta sferaning (lat, lon) nuqtasida, markazga qaragan */
        const pivot = new THREE.Object3D();
        pivot.rotation.y = lon;
        const latP = new THREE.Object3D();
        latP.rotation.x = -lat;
        pivot.add(latP);
        globe.add(pivot);

        /* Yumaloq burchaklar tile overlay orqali: media to'rtburchak,
           lekin tile'ning yumaloqlangan teshigi tashqarisi opaq qora —
           burchaklar shu bilan yashiriladi (alphaMap kerak emas, u
           coverCrop uv-transformi bilan to'qnashardi) */
        const mediaMat = new THREE.MeshBasicMaterial({
          map: placeholderFor(m),
          fog: true,
        });
        mediaMat.color.setScalar(dim);
        const media = new THREE.Mesh(winGeo, mediaMat);
        media.position.y = WIN_OFF;
        latP.add(media);

        const cell = new THREE.Mesh(
          cellGeo,
          new THREE.MeshBasicMaterial({ map: tileTex, transparent: true, fog: true })
        );
        latP.add(cell);

        const label = new THREE.Mesh(
          labelGeo,
          new THREE.MeshBasicMaterial({
            map: labelFor(m), transparent: true, fog: true, opacity: dim,
          })
        );
        label.position.set(0, -(CELL_H / 2 - 0.19), R - 0.02);
        label.rotation.y = Math.PI;
        latP.add(label);

        const frame = {
          movie: m, pivot, latP, media, mediaMat, cell,
          cosA: -1, scale: 1, targetScale: 1,
          video: null, videoTex: null, hls: null,
        };
        media.userData.frame = frame;
        cell.userData.frame = frame;
        frames.push(frame);
        rayCells.push(cell);

        if (m.img) {
          new THREE.TextureLoader().setCrossOrigin('anonymous').load(
            m.img,
            (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.anisotropy = 4;
              coverCrop(tex, tex.image.width, tex.image.height);
              if (!frame.videoPlaying) { mediaMat.map = tex; mediaMat.needsUpdate = true; }
              frame.posterTex = tex;
            },
            undefined, () => {}
          );
        }

        const tUrl = m.trailerS3Url || '';
        if (isPlayableVideo(tUrl)) frame.trailerUrl = tUrl;
      }
    });

    /* ── Video hayot sikli — markazga eng yaqin treylerli kadrlar ── */
    function ensureVideo(frame) {
      if (frame.video || frame.videoFailed) return;
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true;
      v.crossOrigin = 'anonymous';
      v.preload = 'metadata';
      frame.video = v;
      const onReady = () => {
        const tex = new THREE.VideoTexture(v);
        tex.colorSpace = THREE.SRGBColorSpace;
        coverCrop(tex, v.videoWidth, v.videoHeight);
        frame.videoTex = tex;
      };
      v.addEventListener('loadeddata', onReady);
      v.addEventListener('error', () => { frame.videoFailed = true; frame.trailerUrl = null; });
      if (isHls(frame.trailerUrl)) {
        if (v.canPlayType('application/vnd.apple.mpegurl')) {
          v.src = frame.trailerUrl;
        } else {
          loadHlsLib().then(() => {
            if (!window.Hls || !window.Hls.isSupported()) { frame.videoFailed = true; return; }
            const h = new window.Hls({ maxBufferLength: 8, capLevelToPlayerSize: true });
            h.loadSource(frame.trailerUrl);
            h.attachMedia(v);
            frame.hls = h;
          }).catch(() => { frame.videoFailed = true; });
        }
      } else {
        v.src = frame.trailerUrl;
      }
    }
    const COS_PLAY = Math.cos(0.85); /* markazdan ~49° ichida o'ynaydi */
    function updateVideos() {
      const withT = frames.filter(f => f.trailerUrl);
      withT.sort((a, b) => b.cosA - a.cosA);
      withT.forEach((f, rank) => {
        const shouldPlay = rank < MAX_VIDEOS && f.cosA > COS_PLAY && running;
        if (shouldPlay) {
          ensureVideo(f);
          if (f.video && f.video.paused) f.video.play().catch(() => {});
          if (f.videoTex && f.mediaMat.map !== f.videoTex) {
            f.mediaMat.map = f.videoTex; f.mediaMat.needsUpdate = true;
            f.videoPlaying = true;
          }
        } else if (f.video && !f.video.paused) {
          f.video.pause();
          if (f.posterTex) { f.mediaMat.map = f.posterTex; f.mediaMat.needsUpdate = true; }
          f.videoPlaying = false;
        }
      });
    }

    /* ── Trackball kirish: gorizontal + vertikal aylantirish ── */
    const AX_X = new THREE.Vector3(1, 0, 0);
    const AX_Y = new THREE.Vector3(0, 1, 0);
    let yawVel = 0, pitchVel = 0, lastInput = 0;
    const DRIFT = reduced ? 0 : 0.00055;

    const el = renderer.domElement;
    /* Seksiya to'liq ekran — sahifa "qamalib" qolmasligi kerak:
       - desktop: drag to'liq 2D trackball; g'ildirakning GORIZONTAL
         harakati globusni buraydi, VERTIKAL g'ildirak esa sahifani
         odatdagidek scroll qiladi (chiqish yo'li).
       - mobil: vertikal svayp sahifani scroll qiladi (pan-y),
         gorizontal svayp globusni buraydi. */
    el.style.touchAction = isMobile ? 'pan-y' : 'none';
    /* G'ildirak ikkala o'qda ham globusni buraydi (foydalanuvchi so'rovi).
       Sahifaning qolgan qismiga scrollbar/klaviatura yoki galereya
       tashqarisidan scroll bilan o'tiladi. */
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      yawVel += e.deltaX * 0.00009;
      pitchVel -= e.deltaY * 0.00009; /* wheel-down → kontent yuqoriga */
      lastInput = performance.now();
    }, { passive: false });

    let dragging = false, dragX = 0, dragY = 0, dragDist = 0;
    el.addEventListener('pointerdown', (e) => {
      dragging = true; dragX = e.clientX; dragY = e.clientY; dragDist = 0;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      mouseNdc(e);
      if (!dragging) return;
      const dx = e.clientX - dragX, dy = e.clientY - dragY;
      dragX = e.clientX; dragY = e.clientY;
      dragDist += Math.abs(dx) + Math.abs(dy);
      /* kontent barmoqqa ergashadi */
      yawVel = -dx * 0.00030;
      pitchVel = dy * 0.00030;
      globe.rotateOnWorldAxis(AX_Y, -dx * 0.0022);
      globe.rotateOnWorldAxis(AX_X, dy * 0.0022);
      lastInput = performance.now();
    });
    el.addEventListener('pointerup', () => { dragging = false; });
    el.addEventListener('pointercancel', () => { dragging = false; });

    /* ── Parallaks + hover raycast ── */
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2(10, 10);
    let mouseX = 0, mouseY = 0;
    let lastPointer = null, hovered = null;
    function mouseNdc(e) {
      const r = el.getBoundingClientRect();
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      mouseX = ndc.x; mouseY = ndc.y;
      lastPointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    el.addEventListener('pointerleave', () => { ndc.set(10, 10); setHover(null); });

    function setHover(frame) {
      if (hovered === frame) return;
      if (hovered) hovered.targetScale = 1;
      hovered = frame;
      if (frame) {
        frame.targetScale = 1.1;
        el.style.cursor = 'pointer';
        if (tooltipEl) {
          const m = frame.movie;
          tooltipEl.textContent = m.title + (m.rating ? '  ★ ' + m.rating : '');
          tooltipEl.classList.add('on');
        }
      } else {
        el.style.cursor = 'grab';
        if (tooltipEl) tooltipEl.classList.remove('on');
      }
    }

    /* ── Klik/tap → zoom → watch sahifasi ── */
    let zooming = false;
    el.addEventListener('click', (e) => {
      if (zooming || dragDist > 6) return;
      let target = hovered;
      if (!target) {
        mouseNdc(e);
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(rayCells, false);
        if (hits.length) target = hits[0].object.userData.frame;
      }
      if (!target) return;
      zooming = true;
      const start = performance.now(), DUR = 520;
      const cam0 = camera.position.clone();
      const wp = new THREE.Vector3();
      target.media.getWorldPosition(wp);
      const dest3 = wp.clone().add(cam0.clone().sub(wp).normalize().multiplyScalar(2.2));
      if (fadeEl) fadeEl.classList.add('on');
      const tick = (now) => {
        const t = Math.min(1, (now - start) / DUR);
        const ease = 1 - Math.pow(1 - t, 3);
        camera.position.lerpVectors(cam0, dest3, ease);
        camera.lookAt(wp);
        target.targetScale = 1.1 + ease * 0.4;
        if (t < 1) requestAnimationFrame(tick);
        else {
          const root = opts.root || '../';
          const dest = target.movie.watchUrl
            || (root + 'pages/watch.html?id=' + encodeURIComponent(target.movie.id));
          if (window.App && App.go) App.go(dest); else location.href = dest;
        }
      };
      requestAnimationFrame(tick);
    });

    /* ── O'lcham ── */
    function resize() {
      const w = wrapEl.clientWidth, h = wrapEl.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    /* ── Faqat ko'rinayotganda ishlash ── */
    let running = false, rafId = 0, lastVideoCheck = 0;
    const io = new IntersectionObserver((es) => {
      const vis = es[0].isIntersecting && !document.hidden;
      if (vis && !running) { running = true; loop(performance.now()); }
      else if (!vis) { running = false; updateVideos(); }
    }, { threshold: 0.05 });
    io.observe(wrapEl);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { running = false; updateVideos(); }
      else { io.unobserve(wrapEl); io.observe(wrapEl); }
    });

    const tmpV = new THREE.Vector3();

    function loop(now) {
      if (!running) { cancelAnimationFrame(rafId); return; }
      rafId = requestAnimationFrame(loop);

      /* Inersiya + avto-drift */
      if (!dragging) {
        yawVel *= 0.93; pitchVel *= 0.93;
        if (Math.abs(yawVel) + Math.abs(pitchVel) < 0.0004 && now - lastInput > 1600) {
          globe.rotateOnWorldAxis(AX_Y, DRIFT);
        }
        if (yawVel) globe.rotateOnWorldAxis(AX_Y, yawVel);
        if (pitchVel) globe.rotateOnWorldAxis(AX_X, pitchVel);
      }

      /* Parallaks — kamera yadro atrofida yengil siljiydi */
      if (!zooming) {
        camera.position.x += ((mouseX * 0.35) - camera.position.x) * 0.05;
        camera.position.y += ((mouseY * 0.25) - camera.position.y) * 0.05;
        camera.position.z += (0 - camera.position.z) * 0.05;
        camera.lookAt(LOOK);
      }

      /* Kadr holati: markazga yaqinlik (cosA) + hover masshtabi */
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        f.media.getWorldPosition(tmpV);
        f.cosA = tmpV.z / tmpV.length(); /* +z (qarash yo'nalishi) bilan cos */
        f.scale += (f.targetScale - f.scale) * 0.14;
        if (Math.abs(f.scale - 1) > 0.001) {
          /* latP masshtabi radiusni kattartiradi (uzoqlashtiradi) —
             kompensatsiya + kameraga yengil yaqinlashish */
          const s = f.scale;
          f.latP.scale.setScalar(s);
          f.latP.position.z = (1 - s) * (R + 3);
        } else if (f.latP.position.z !== 0) {
          f.latP.scale.setScalar(1);
          f.latP.position.z = 0;
        }
      }

      /* Hover raycast */
      if (ndc.x < 5 && !zooming && !isMobile) {
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(rayCells, false);
        setHover(hits.length ? hits[0].object.userData.frame : null);
        if (hovered && tooltipEl && lastPointer) {
          tooltipEl.style.transform =
            'translate(' + (lastPointer.x + 16) + 'px,' + (lastPointer.y + 18) + 'px)';
        }
      }

      if (now - lastVideoCheck > 480) { lastVideoCheck = now; updateVideos(); }

      renderer.render(scene, camera);
    }

    el.style.cursor = 'grab';
    return true;
  }

  return { init };
})();

window.FilmReel = FilmReel;
document.dispatchEvent(new Event('filmreel:ready'));
