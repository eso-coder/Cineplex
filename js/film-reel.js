/* ═══════════════════════════════════════════════════════════════════
   CINEPLEX — 3D FILM REEL (Yangi chiqmalar)
   phantom.land uslubidagi immersiv galereya: filmlar 35mm plyonka
   lentalari ichida "kadr" bo'lib, 3D fazoda egilgan bir nechta lenta
   bo'ylab cheksiz aylanadi.

   Arxitektura:
   - Three.js (CDN, ES module). Har lenta — silindr yoyi (drum) bo'ylab
     joylashgan kadr-slotlar. Slot burchagi wrap qilinadi (modulo) —
     choksiz cheksiz aylanish. Lentalar turli chuqurlik/og'ish/tezlikda.
   - Har kadr 3 qatlam: (1) orqada iliq "backlit" glow (additive),
     (2) media (treyler video-texture yoki poster), (3) old tomonda
     seluloid overlay (qora hoshiya + perforatsiya teshiklari) —
     hammasi bitta umumiy canvas-texturadan.
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

  /* ── O'lchamlar (world birlikda) ── */
  const CELL_W = 3.05;   /* bitta kadr katagi (oraliq bilan) */
  const CELL_H = 2.35;   /* seluloid balandligi */
  const WIN_W  = 2.78;   /* media oynasi */
  const WIN_H  = 1.56;   /* ~16:9 */
  const SEGS   = 24;     /* egri sirt silliqligi */

  /* ── Seluloid overlay texturasi (umumiy, bir marta chiziladi) ── */
  function makeCelluloidTexture() {
    const W = 512, H = Math.round(512 * CELL_H / CELL_W);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    /* To'liq qoraytirilgan plyonka asosi */
    x.fillStyle = '#100e0c';
    x.fillRect(0, 0, W, H);
    /* Media oynasi — shaffof teshik */
    const winW = W * WIN_W / CELL_W, winH = H * WIN_H / CELL_H;
    const wx = (W - winW) / 2, wy = (H - winH) / 2;
    x.clearRect(wx, wy, winW, winH);
    /* Oyna atrofida ingichka iliq kant (backlit his) */
    x.strokeStyle = 'rgba(255, 186, 110, 0.28)';
    x.lineWidth = 3;
    x.strokeRect(wx + 1.5, wy + 1.5, winW - 3, winH - 3);
    /* Perforatsiya (sprocket) teshiklari — tepa va pastki hoshiyada.
       Teshiklar orqadan yoritilgandek iliq rangda. */
    const holeW = W / 16, holeH = wy * 0.44, r = 3;
    const drawHoles = (cy) => {
      for (let i = 0; i < 8; i++) {
        const hx = (i + 0.5) * (W / 8) - holeW / 2;
        x.beginPath();
        x.roundRect(hx, cy - holeH / 2, holeW, holeH, r);
        x.fillStyle = 'rgba(255, 190, 120, 0.30)';
        x.fill();
        x.strokeStyle = 'rgba(0,0,0,0.55)';
        x.lineWidth = 1.5;
        x.stroke();
      }
    };
    drawHoles(wy / 2);
    drawHoles(H - wy / 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  /* ── Iliq glow texturasi (kadr ortidagi nur) ── */
  function makeGlowTexture() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.5);
    g.addColorStop(0, 'rgba(255, 196, 130, 0.55)');
    g.addColorStop(0.5, 'rgba(255, 160, 90, 0.18)');
    g.addColorStop(1, 'rgba(255, 140, 70, 0)');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(c);
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

  /* Silindr yoyi bo'ylab egilgan plane geometriyasi.
     Lokal x → drum burchagi; markaz pivotdan R masofada (z=+R). */
  function curvedPlane(w, h, R, segs) {
    const geo = new THREE.PlaneGeometry(w, h, segs, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const a = px / R;
      pos.setX(i, Math.sin(a) * R);
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
    scene.fog = new THREE.Fog(0x0a0a0a, 9, 22); /* chuqurlik hissi (DOF o'rnida) */

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 60);
    camera.position.set(0, 0, 7.2);

    const celluloidTex = makeCelluloidTexture();
    const glowTex = makeGlowTexture();

    /* ── Lenta konfiguratsiyasi — spiral/tunel kompozitsiya ── */
    const STRIPS = isMobile
      ? [
          { y:  1.35, R: 11, z:  0.2, tz: -0.07, tx: 0.04, speed: 1.0,  dim: 1.0 },
          { y: -1.35, R: 12, z: -1.6, tz:  0.09, tx: -0.03, speed: 0.72, dim: 0.72 },
        ]
      : [
          { y:  2.75, R: 12.5, z: -1.2, tz: -0.11, tx:  0.06, speed: 1.18, dim: 0.88 },
          { y:  0.0,  R: 12.0, z:  0.3, tz:  0.05, tx:  0.00, speed: 1.0,  dim: 1.0 },
          { y: -2.75, R: 13.0, z: -2.2, tz: -0.07, tx: -0.05, speed: 0.78, dim: 0.72 },
          { y:  0.35, R: 15.5, z: -6.5, tz:  0.14, tx:  0.10, speed: 0.55, dim: 0.42 },
        ];

    const frames = [];   /* barcha kadrlar (video boshqaruvi uchun) */
    const rayCells = []; /* raycast nishonlari (oldindan yig'ilgan) */
    const videoEls = [];

    const cellGeoCache = {}, winGeoCache = {};
    const geoFor = (cache, w, h) => (R) =>
      cache[R] || (cache[R] = curvedPlane(w, h, R, SEGS));
    const cellGeo = geoFor(cellGeoCache, CELL_W - 0.14, CELL_H);
    const winGeo = geoFor(winGeoCache, WIN_W, WIN_H);
    const glowGeo = new THREE.PlaneGeometry(CELL_W * 1.65, CELL_H * 1.5);

    let movieIdx = 0;
    const nextMovie = () => movies[movieIdx++ % movies.length];

    STRIPS.forEach((cfg, si) => {
      const group = new THREE.Group();
      group.position.set(0, cfg.y, cfg.z - cfg.R);
      group.rotation.z = cfg.tz;
      group.rotation.x = cfg.tx || 0;
      scene.add(group);

      const step = CELL_W / cfg.R; /* burchak qadam shu R uchun */
      const count = Math.max(11, Math.ceil((Math.PI * 0.95) / step)); /* span ≥ ~170° */
      const span = count * step;

      for (let i = 0; i < count; i++) {
        const m = nextMovie();
        const pivot = new THREE.Object3D();
        group.add(pivot);

        /* Glow — kadr ortida, additive */
        const glow = new THREE.Mesh(
          glowGeo,
          new THREE.MeshBasicMaterial({
            map: glowTex, transparent: true, blending: THREE.AdditiveBlending,
            depthWrite: false, opacity: 0.5 * cfg.dim,
          })
        );
        glow.position.z = cfg.R - 0.22;
        pivot.add(glow);

        /* Media (poster / video) */
        const mediaMat = new THREE.MeshBasicMaterial({
          map: makePlaceholderTexture(m.title),
          fog: true,
        });
        mediaMat.color.setScalar(cfg.dim);
        const media = new THREE.Mesh(winGeo(cfg.R + 0.02), mediaMat);
        pivot.add(media);

        /* Seluloid overlay — old tomonda */
        const cell = new THREE.Mesh(
          cellGeo(cfg.R + 0.04),
          new THREE.MeshBasicMaterial({ map: celluloidTex, transparent: true, fog: true })
        );
        pivot.add(cell);

        const frame = {
          movie: m, pivot, media, mediaMat, cell, glow,
          strip: si, base: (i - count / 2 + 0.5) * step,
          span, step, R: cfg.R, speed: cfg.speed, dim: cfg.dim,
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
        if (isDirectVideo(tUrl) && videoEls.length < MAX_VIDEOS * 2) {
          frame.trailerUrl = tUrl;
        }
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
      const camZ0 = camera.position.z;
      const wp = new THREE.Vector3();
      target.media.getWorldPosition(wp);
      if (fadeEl) fadeEl.classList.add('on');
      const tick = (now) => {
        const t = Math.min(1, (now - start) / DUR);
        const e = 1 - Math.pow(1 - t, 3); /* ease-out cubic */
        camera.position.z = camZ0 + (wp.z + 2.1 - camZ0) * e;
        camera.position.x = wp.x * e * 0.9;
        camera.position.y = wp.y * e * 0.9;
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
        camera.lookAt(0, 0, -2);
      }

      /* Kadrlar joylashuvi */
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        f.angle = wrap(f.base + scroll * f.speed * (12 / f.R), f.span);
        f.pivot.rotation.y = -f.angle;
        f.scale += (f.targetScale - f.scale) * 0.14;
        if (Math.abs(f.scale - 1) > 0.001) f.pivot.scale.setScalar(f.scale);
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
