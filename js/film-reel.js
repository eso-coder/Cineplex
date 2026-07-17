/* ═══════════════════════════════════════════════════════════════════
   CINEPLEX — 3D FILM REEL (Yangi chiqmalar)
   phantom.land uslubidagi immersiv galereya: filmlar 35mm plyonka
   lentalari ichida "kadr" bo'lib, 3D fazoda egilgan bir nechta lenta
   bo'ylab cheksiz aylanadi.

   Arxitektura:
   - Three.js (CDN, ES module). Har lenta — silindr yoyi (drum) bo'ylab
     joylashgan kadr-slotlar. Slot burchagi wrap qilinadi (modulo) —
     choksiz cheksiz aylanish. Lentalar turli chuqurlik/og'ish/tezlikda.
   - Har kadr qatlamlari: media (treyler video-texture yoki poster),
     old tomonda tile overlay (qora katak + nozik grid chizig'i + kichik
     sprocket teshiklari — umumiy canvas-textura) va katak ichidagi
     pastki barda mayda sarlavha/reyting yozuvi.
   - Video: faqat to'g'ridan-to'g'ri fayl (mp4/webm) treylerlar
     (YouTube'ni WebGL texturaga olib bo'lmaydi). Bir vaqtda maksimum
     6-8 ta video o'ynaydi — ko'rinmaydiganlari pauza qilinadi.
     Poster yuklangunicha/xato bo'lsa — canvas placeholder.
   - Boshqaruv: g'ildirak / sichqoncha drag / touch-drag (gorizontal),
     inersiya (lerp damping), foydalanuvchi tegmasa sekin avto-drift.
     Sichqoncha harakati sahnani yengil parallaks qiladi.
   - Hover: kadr kattalashadi + sarlavha/reyting tooltip.
     Klik: kadr tomon zoom → watch sahifasiga o'tish.
   - CP_LITE, WebGL yo'q yoki xato — init false qaytaradi, sahifadagi
     oddiy band o'z joyida qoladi.
   ═══════════════════════════════════════════════════════════════════ */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const FilmReel = (() => {
  'use strict';

  /* ── O'lchamlar (world birlikda) — phantom.land'dagidek zich grid:
     kataklar bir-biriga tegib turadi (gap yo'q), media katak ichida,
     pastda yozuv bar'i, tepada/pastda kichik sprocket teshiklari ── */
  const CELL_W  = 3.6;    /* katak eni (slot bilan bir xil) */
  const CELL_H  = 2.6;    /* katak balandligi */
  const WIN_W   = 3.26;   /* media oynasi */
  const WIN_H   = 1.83;   /* ~16:9 */
  const WIN_OFF = 0.12;   /* oyna markazdan tepaga siljigan (pastda label joyi) */
  const SEGS    = 24;     /* egri sirt silliqligi */

  /* ── Katak (tile) overlay texturasi (umumiy, bir marta chiziladi):
     qora fon, chekkada nozik grid chizig'i, media oynasi shaffof teshik,
     oyna tepa/pastida KICHIK sprocket teshiklari — plyonka identiteti
     saqlangan, lekin phantom'dagi kabi minimal ── */
  function makeCelluloidTexture() {
    const W = 512, H = Math.round(512 * CELL_H / CELL_W);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    /* Qora tile asosi */
    x.fillStyle = '#0b0b0d';
    x.fillRect(0, 0, W, H);
    /* Kataklararo nozik ajratuvchi chiziq (grid) */
    x.strokeStyle = 'rgba(255, 255, 255, 0.09)';
    x.lineWidth = 2;
    x.strokeRect(1, 1, W - 2, H - 2);
    /* Media oynasi — markazdan biroz tepada (pastda label joyi) */
    const winW = W * WIN_W / CELL_W, winH = H * WIN_H / CELL_H;
    const wx = (W - winW) / 2;
    const wy = H * (0.5 - WIN_OFF / CELL_H) - winH / 2;
    x.clearRect(wx, wy, winW, winH);
    /* Oyna atrofida juda nozik iliq kant (backlit plyonka hissi) */
    x.strokeStyle = 'rgba(255, 180, 105, 0.16)';
    x.lineWidth = 2;
    x.strokeRect(wx + 1, wy + 1, winW - 2, winH - 2);
    /* KICHIK sprocket teshiklari — oynaning bevosita tepa va pastida,
       bilinar-bilinmas iliq tusda */
    const holeW = 13, holeH = 9, r = 2, n = 12;
    const drawHoles = (cy) => {
      for (let i = 0; i < n; i++) {
        const hx = wx + (i + 0.5) * (winW / n) - holeW / 2;
        x.beginPath();
        x.roundRect(hx, cy - holeH / 2, holeW, holeH, r);
        x.fillStyle = 'rgba(255, 185, 115, 0.20)';
        x.fill();
      }
    };
    drawHoles(wy - 10);
    drawHoles(wy + winH + 10);
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
    g.addColorStop(0, '#26221e');
    g.addColorStop(1, '#0f0d0b');
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

  /* Teksturani 16:9 oynaga "cover" qilib kesish (poster 2:3 bo'lsa ham) */
  function coverCrop(tex, mediaW, mediaH) {
    if (!mediaW || !mediaH) return;
    const winA = WIN_W / WIN_H, mediaA = mediaW / mediaH;
    tex.matrixAutoUpdate = true;
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

  /* Silindr yoyi bo'ylab egilgan plane geometriyasi — ICHKI sirt.
     Lokal x → drum burchagi; markaz pivotdan R masofada (z=+R).
     x MANFIY sin bilan akslantiriladi: bu winding'ni teskarilab old
     yuzni silindr ichiga qaratadi (kamera ichkarida) va ichkaridan
     qaraganda tekstura to'g'ri (ko'zgusiz) o'qiladi. */
  function curvedPlane(w, h, R, segs) {
    const geo = new THREE.PlaneGeometry(w, h, segs, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const a = px / R;
      pos.setX(i, -Math.sin(a) * R);
      pos.setZ(i, Math.cos(a) * R);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  const isDirectVideo = (url) =>
    /\.(mp4|webm|mov)(\?|#|$)/i.test(String(url || ''));

  /* ═══════════════ INIT ═══════════════ */
  function init(wrapEl, tooltipEl, fadeEl, movies, opts) {
    opts = opts || {};
    if (!wrapEl || !movies || !movies.length) return false;
    if (window.CP_LITE) return false;

    const isMobile = window.innerWidth <= 640;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Bir film bir nechta slotda takrorlanadi — rasm fayllari keshdan olinadi */
    THREE.Cache.enabled = true;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (_) { return false; }

    const MAX_VIDEOS = isMobile ? 3 : 7;
    const DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 1.75);

    renderer.setPixelRatio(DPR);
    renderer.setClearColor(0x0a0a0a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    wrapEl.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0a0a, 10, 21); /* yon/orqa kadrlar asta so'nadi */

    /* POV — silindr ICHIDA: drum o'qi z=0 da, kamera markazdan old
       devorga surilgan (z=+5.2, R=13 dan kichik). Old kataklar yaqin va
       katta, yon kataklar tomoshabinni o'rab oladi — ichidan qarash. */
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 60);
    camera.position.set(0, 0, 6.4);
    const CAM_Z = 6.4;
    const LOOK = new THREE.Vector3(0, 0, 12);

    const celluloidTex = makeCelluloidTexture();

    /* ── EGILGAN DEVOR (phantom.land uslubi) ──
       Kadrlar silindrning ICHKI sirtida, to'liq 360° drum — chok yo'q.
       Kataklar bir-biriga TEGIB turadi (gap yo'q, faqat teksturadagi
       nozik grid chizig'i), qatorlar tekis (vertikal og'ish yo'q) —
       zich devor, gorizontal curve esa to'liq saqlangan. */
    const R = 13;
    const ROW_H = CELL_H + 0.01; /* qatorlar ham deyarli tegib turadi */
    const ROWS = isMobile
      ? [
          { y:  ROW_H / 2, dim: 1.0 },
          { y: -ROW_H / 2, dim: 1.0 },
        ]
      : [
          { y:  ROW_H, dim: 0.9 },
          { y:  0,     dim: 1.0 },
          { y: -ROW_H, dim: 0.9 },
        ];

    const frames = [];   /* barcha kadrlar (video boshqaruvi uchun) */
    const rayCells = []; /* raycast nishonlari (oldindan yig'ilgan) */
    const videoEls = [];

    /* To'liq aylana: qadam soni butun bo'lishi uchun step moslanadi,
       katak geometriyasi esa aynan slot kengligida — qo'shni kataklar
       chok-choka tegib turadi */
    const count = Math.round((2 * Math.PI) / (CELL_W / R));
    const step = (2 * Math.PI) / count;
    const span = 2 * Math.PI;
    const slotW = step * R;

    /* Radiuslar: kamera silindr ICHIDA — KICHIKROQ radius kameraga
       yaqinroq. Katak (R) media oynasidan (R+0.03) oldinda turadi. */
    const winGeo = curvedPlane(WIN_W, WIN_H, R + 0.03, SEGS);
    const cellGeo = curvedPlane(slotW, CELL_H, R, SEGS);
    const labelGeo = new THREE.PlaneGeometry(CELL_W * 0.88, 0.2);

    /* Har film uchun placeholder/label texturalari keshlanadi
       (bir film devorda bir necha marta takrorlanadi) */
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

    ROWS.forEach((cfg, ri) => {
      /* Drum o'qi z=0 — kamera shu silindr ichida turadi */
      const group = new THREE.Group();
      group.position.set(0, cfg.y, 0);
      scene.add(group);

      for (let i = 0; i < count; i++) {
        const m = nextMovie();
        const pivot = new THREE.Object3D();
        group.add(pivot);

        /* Media (poster / video) — oyna markazdan biroz tepada */
        const mediaMat = new THREE.MeshBasicMaterial({
          map: placeholderFor(m),
          fog: true,
        });
        mediaMat.color.setScalar(cfg.dim);
        const media = new THREE.Mesh(winGeo, mediaMat);
        media.position.y = WIN_OFF;
        pivot.add(media);

        /* Seluloid overlay — old tomonda */
        const cell = new THREE.Mesh(
          cellGeo,
          new THREE.MeshBasicMaterial({ map: celluloidTex, transparent: true, fog: true })
        );
        pivot.add(cell);

        /* Mayda yozuv — katak ICHIDA, pastki barda (phantom'dagi kabi) */
        const label = new THREE.Mesh(
          labelGeo,
          new THREE.MeshBasicMaterial({
            map: labelFor(m), transparent: true, fog: true,
            opacity: cfg.dim,
          })
        );
        /* Flat plane +z ga qaragan — ichki POV uchun 180° buriladi
           (rotation ko'zgu emas, matn to'g'ri o'qiladi) */
        label.position.set(0, -(CELL_H / 2 - 0.19), R - 0.02);
        label.rotation.y = Math.PI;
        pivot.add(label);

        const frame = {
          movie: m, pivot, media, mediaMat, cell,
          /* qo'shni qatorlar yarim katak surilgan (shaxmat) */
          base: (i + (ri % 2) * 0.5) * step,
          span, step, R, speed: 1, dim: cfg.dim,
          angle: 0, scale: 1, targetScale: 1,
          video: null, videoTex: null, posterLoaded: false,
        };
        media.userData.frame = frame;
        cell.userData.frame = frame;
        frames.push(frame);
        rayCells.push(cell);

        /* Poster texturasi (CORS ruxsat bersa) */
        if (m.img) {
          new THREE.TextureLoader().setCrossOrigin('anonymous').load(
            m.img,
            (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace;
              tex.anisotropy = 4;
              coverCrop(tex, tex.image.width, tex.image.height);
              if (!frame.videoPlaying) { mediaMat.map = tex; mediaMat.needsUpdate = true; }
              frame.posterTex = tex; frame.posterLoaded = true;
            },
            undefined, () => {} /* xato — placeholder qoladi */
          );
        }

        /* Treyler video (faqat to'g'ridan-to'g'ri fayl URL) */
        const tUrl = m.trailerS3Url || '';
        if (isDirectVideo(tUrl)) frame.trailerUrl = tUrl;
      }
    });

    /* ── Video hayot sikli: ko'rinadigan eng yaqin kadrlar o'ynaydi ── */
    function ensureVideo(frame) {
      if (frame.video) return;
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true;
      v.crossOrigin = 'anonymous';
      v.preload = 'metadata';
      v.src = frame.trailerUrl;
      v.addEventListener('loadeddata', () => {
        const tex = new THREE.VideoTexture(v);
        tex.colorSpace = THREE.SRGBColorSpace;
        coverCrop(tex, v.videoWidth, v.videoHeight);
        frame.videoTex = tex;
      });
      v.addEventListener('error', () => { frame.trailerUrl = null; frame.video = null; });
      frame.video = v;
      videoEls.push(v);
    }
    function updateVideos() {
      /* |angle| bo'yicha eng markazdagi treylerlik kadrlar */
      const withT = frames.filter(f => f.trailerUrl);
      withT.sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle));
      withT.forEach((f, rank) => {
        const shouldPlay = rank < MAX_VIDEOS && Math.abs(f.angle) < 0.9 && running;
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

    /* ── Scroll holati ── */
    let scroll = 0, vel = 0, lastInput = 0;
    const DRIFT = reduced ? 0 : 0.0016;

    /* ── Kirish (input) ── */
    const el = renderer.domElement;
    el.style.touchAction = 'pan-y'; /* vertikal touch — sahifa scroll'i */
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      vel += (e.deltaY + e.deltaX) * 0.00012;
      lastInput = performance.now();
    }, { passive: false });

    let dragging = false, dragX = 0, dragDist = 0;
    el.addEventListener('pointerdown', (e) => {
      dragging = true; dragX = e.clientX; dragDist = 0;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      mouseNdc(e);
      if (!dragging) return;
      const dx = e.clientX - dragX;
      dragX = e.clientX;
      dragDist += Math.abs(dx);
      vel = -dx * 0.00055;
      scroll += -dx * 0.0011;
      lastInput = performance.now();
    });
    el.addEventListener('pointerup', () => { dragging = false; });
    el.addEventListener('pointercancel', () => { dragging = false; });

    /* ── Parallaks + hover raycast ── */
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2(10, 10);
    let mouseX = 0, mouseY = 0;
    function mouseNdc(e) {
      const r = el.getBoundingClientRect();
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      mouseX = ndc.x; mouseY = ndc.y;
      lastPointer = { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    let lastPointer = null, hovered = null;
    el.addEventListener('pointerleave', () => { ndc.set(10, 10); setHover(null); });

    function setHover(frame) {
      if (hovered === frame) return;
      if (hovered) hovered.targetScale = 1;
      hovered = frame;
      if (frame) {
        frame.targetScale = 1.12;
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
      /* Mobilda hover bo'lmaydi — bosilgan nuqtada to'g'ridan-to'g'ri raycast */
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
      /* Kamera hozirgi joyidan kadr tomon uchadi — kadr old yuzasidan
         2 birlik berida to'xtaydigan nuqtaga (ichki POV'da har qanday
         burchakdagi kadr uchun to'g'ri ishlaydi) */
      const cam0 = camera.position.clone();
      const wp = new THREE.Vector3();
      target.media.getWorldPosition(wp);
      const dest3 = wp.clone().add(cam0.clone().sub(wp).normalize().multiplyScalar(2.0));
      if (fadeEl) fadeEl.classList.add('on');
      const tick = (now) => {
        const t = Math.min(1, (now - start) / DUR);
        const e = 1 - Math.pow(1 - t, 3); /* ease-out cubic */
        camera.position.lerpVectors(cam0, dest3, e);
        camera.lookAt(wp);
        target.targetScale = 1.12 + e * 0.5;
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

    const wrap = (a, span) => a - Math.round(a / span) * span;

    function loop(now) {
      if (!running) { cancelAnimationFrame(rafId); return; }
      rafId = requestAnimationFrame(loop);

      /* Inersiya + avto-drift */
      if (!dragging) {
        vel *= 0.93;
        if (Math.abs(vel) < 0.00035 && now - lastInput > 1600) {
          scroll += DRIFT * 0.016;
        }
        scroll += vel;
      }

      /* Parallaks — kamera sichqonchaga yengil ergashadi */
      if (!zooming) {
        camera.position.x += ((mouseX * 0.55) - camera.position.x) * 0.05;
        camera.position.y += ((mouseY * 0.35) - camera.position.y) * 0.05;
        camera.position.z += (CAM_Z - camera.position.z) * 0.05;
        camera.lookAt(LOOK);
      }

      /* Kadrlar joylashuvi */
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        f.angle = wrap(f.base + scroll * f.speed * (12 / f.R), f.span);
        /* +angle: kamera endi +z tomonga qaraydi (gorizontal ko'zgu) —
           drag yo'nalishi tabiiy qolishi uchun ishora ham teskarilanadi */
        f.pivot.rotation.y = f.angle;
        f.scale += (f.targetScale - f.scale) * 0.14;
        if (Math.abs(f.scale - 1) > 0.001) {
          /* Pivot masshtabi radiusni ham kattartirardi (ichki POV'da bu
             kadrni UZOQlashtiradi) — markaz joyida qolishi uchun pivot
             drum o'qi bo'ylab kompensatsiya qilinadi; katta kadr endi
             qo'shnilar USTIDA, kameraga yaqinroq chiqadi */
          const off = (1 - f.scale) * (f.R + 4); /* +4 — hover'da kameraga yaqinlashish */
          f.pivot.scale.setScalar(f.scale);
          f.pivot.position.set(Math.sin(f.angle) * off, 0, Math.cos(f.angle) * off);
        } else if (f.pivot.position.z !== 0) {
          f.pivot.scale.setScalar(1);
          f.pivot.position.set(0, 0, 0);
        }
      }

      /* Hover raycast (faqat pointer canvas ustida) */
      if (ndc.x < 5 && !zooming && !isMobile) {
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(rayCells, false);
        setHover(hits.length ? hits[0].object.userData.frame : null);
        if (hovered && tooltipEl && lastPointer) {
          tooltipEl.style.transform =
            'translate(' + (lastPointer.x + 16) + 'px,' + (lastPointer.y + 18) + 'px)';
        }
      }

      /* Videolarni sekundiga ~2 marta qayta baholash */
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
