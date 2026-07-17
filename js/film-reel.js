/* ═══════════════════════════════════════════════════════════════════
   CINEPLEX — 3D FILM WALL (Yangi chiqmalar)
   phantom.land uslubidagi immersiv galereya.

   Geometriya: vertikal o'qli silindr (drum) ichidan qaraladi — kamera
   QO'ZG'ALMAS, kartalar hamisha TIK (qiyshaymaydi).
   - GORIZONTAL: kartalar drum bo'ylab aylanadi — to'liq 360°, choksiz.
   - VERTIKAL: qatorlar yuqoriga/pastga siljiydi va modulo bilan
     O'RAB KELADI — ekrandan chiqqan qator narigi tomondan qaytib
     kiradi (wrap nuqtasi ko'rinish maydonidan tashqarida). Natija:
     har ikki o'qda cheksiz "devor", kamera POV o'zgarmaydi.

   Karta: qora tile, yumaloqlangan burchakli media oynasi (treyler
   video-texture yoki poster), pastki barda mayda sarlavha/reyting.
   Kartalar orasida masofa yo'q (qator balandligi = karta balandligi,
   slot kengligi = tile kengligi).

   Video: to'g'ridan-to'g'ri mp4/webm hamda HLS (.m3u8 — hls.js CDN'dan
   kerak bo'lganda; Safari'da native). YouTube WebGL texturaga olinmaydi
   — ularda poster. Bir vaqtda maks 6-8 video, markazdan uzoqlari pauza.

   CP_LITE / WebGL yo'q — init false, sahifadagi band fallback qoladi.
   ═══════════════════════════════════════════════════════════════════ */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const FilmReel = (() => {
  'use strict';

  /* ── O'lchamlar (world birlikda) ── */
  const R        = 12;    /* drum radiusi */
  const CAM_Z    = 6.0;   /* kamera drum ichida, old devorga surilgan */
  const CELL_W   = 3.8;   /* karta nominal eni (slot shunga moslanadi) */
  const MARGIN   = 0.34;  /* oyna atrofidagi qora hoshiya — kartalar
                             bir-biriga xalaqit qilmasligi uchun */
  const CORNER   = 0.13;  /* oyna burchak radiusi — yumaloq */
  const SEGS     = 24;
  const N_ROWS   = 6;     /* vertikal wrap halqasidagi qatorlar soni */

  /* Slotga bog'liq o'lchamlar init'da hisoblanadi (step butun bo'lishi
     uchun); bu modul-darajali o'zgaruvchilar texture chizishda kerak */
  let SLOT_W = CELL_W, WIN_W = CELL_W - MARGIN, WIN_H = 1.95, CELL_H = 2.25;

  /* ── Tile overlay: qora katak + markazda yumaloqlangan shaffof oyna.
     Oyna slotdan aniq kichik — har tomonda qora hoshiya, hech narsa
     qo'shni katakka chiqmaydi. ── */
  function makeTileTexture() {
    const W = 512, H = Math.round(512 * CELL_H / SLOT_W);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#0a0a0c';
    x.fillRect(0, 0, W, H);
    const winW = W * WIN_W / SLOT_W, winH = H * WIN_H / CELL_H;
    const wx = (W - winW) / 2;
    const wy = (H - winH) / 2;
    const r = W * CORNER / SLOT_W;
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

  /* Teksturani oynaga "cover" qilib kesish */
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
     x manfiy sin: winding teskarilanadi (old yuz ichkariga qaraydi),
     tekstura ichkaridan to'g'ri o'qiladi. */
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
    scene.fog = new THREE.Fog(0x0a0a0a, 7.5, 19);

    /* Kamera QO'ZG'ALMAS — drum o'qi z=0, kamera ichkarida */
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 60);
    camera.position.set(0, 0, CAM_Z);
    const LOOK = new THREE.Vector3(0, 0, R);

    /* ── Slot hisoblari: to'liq aylanaga butun son katak ── */
    const count = Math.round((2 * Math.PI * R) / CELL_W);
    const step = (2 * Math.PI) / count;
    SLOT_W = step * R;
    WIN_W = SLOT_W - MARGIN;
    WIN_H = WIN_W * 9 / 16;
    CELL_H = WIN_H + MARGIN; /* vertikal ham xuddi shunday hoshiya */
    const ROW_H = CELL_H;
    const TOTAL_H = N_ROWS * ROW_H; /* vertikal wrap davri */

    const tileTex = makeTileTexture();

    const frames = [];
    const rayCells = [];

    const winGeo = curvedPlane(WIN_W + 0.06, WIN_H + 0.06, R + 0.03, SEGS);
    const cellGeo = curvedPlane(SLOT_W, CELL_H, R, SEGS);

    const phCache = {};
    const placeholderFor = (m) =>
      phCache[m.id] || (phCache[m.id] = makePlaceholderTexture(m.title));

    for (let ri = 0; ri < N_ROWS; ri++) {
      for (let i = 0; i < count; i++) {
        /* Qator boshiga 7 qadam siljish — bir xil film vertikal/diagonal
           qo'shni kataklarga tushib "ulanib ketgan"day ko'rinmasin */
        const m = movies[(i + ri * 7) % movies.length];
        const pivot = new THREE.Object3D();
        scene.add(pivot);

        const mediaMat = new THREE.MeshBasicMaterial({
          map: placeholderFor(m),
          fog: true,
        });
        const media = new THREE.Mesh(winGeo, mediaMat);
        pivot.add(media);

        const cell = new THREE.Mesh(
          cellGeo,
          new THREE.MeshBasicMaterial({ map: tileTex, transparent: true, fog: true })
        );
        pivot.add(cell);

        const frame = {
          movie: m, pivot, media, mediaMat, cell,
          /* qo'shni qatorlar yarim slot shaxmat surilgan */
          baseA: (i + (ri % 2) * 0.5) * step,
          baseY: (ri - (N_ROWS - 1) / 2) * ROW_H,
          cosA: -1, scale: 1, targetScale: 1,
          video: null, videoTex: null,
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
    }

    /* ── Video hayot sikli ── */
    function ensureVideo(frame) {
      if (frame.video || frame.videoFailed) return;
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true;
      v.crossOrigin = 'anonymous';
      v.preload = 'metadata';
      frame.video = v;
      v.addEventListener('loadeddata', () => {
        const tex = new THREE.VideoTexture(v);
        tex.colorSpace = THREE.SRGBColorSpace;
        coverCrop(tex, v.videoWidth, v.videoHeight);
        frame.videoTex = tex;
      });
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
    const COS_PLAY = Math.cos(0.85);
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

    /* ── Kirish: gorizontal = drum aylanishi, vertikal = qatorlar
       siljishi (wrap). Kamera hech qachon qo'zg'almaydi. ── */
    let scrollA = 0, scrollY = 0;     /* joriy holat */
    let velA = 0, velY = 0, lastInput = 0;
    const DRIFT = reduced ? 0 : 0.00045;

    const el = renderer.domElement;
    /* G'ildirak SAHIFANI scroll qiladi (hijack yo'q — galereyadan pastga
       bemalol tushiladi); devor faqat chap tugma bilan sudrab (drag)
       boshqariladi. Mobilda vertikal svayp sahifa, gorizontal — devor. */
    el.style.touchAction = isMobile ? 'pan-y' : 'none';

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
      scrollA += -dx * 0.0018;
      scrollY += -dy * 0.012;
      velA = -dx * 0.00028;
      velY = -dy * 0.0020 * 60 * 0.016; /* sekundiga moslashgan inersiya */
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
        frame.targetScale = 1.06;
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

    /* ── Klik/tap → zoom → watch ── */
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
        target.targetScale = 1.06 + ease * 0.4;
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

    const wrapC = (a, span) => a - Math.round(a / span) * span; /* [-span/2, span/2] */
    const tmpV = new THREE.Vector3();

    function loop(now) {
      if (!running) { cancelAnimationFrame(rafId); return; }
      rafId = requestAnimationFrame(loop);

      if (!dragging) {
        velA *= 0.93; velY *= 0.93;
        if (Math.abs(velA) + Math.abs(velY) * 0.01 < 0.0004 && now - lastInput > 1600) {
          scrollA += DRIFT;
        }
        scrollA += velA;
        scrollY += velY;
      }

      /* Parallaks — juda yengil, kamera pozitsiyasi deyarli qotgan */
      if (!zooming) {
        camera.position.x += ((mouseX * 0.3) - camera.position.x) * 0.05;
        camera.position.y += ((mouseY * 0.2) - camera.position.y) * 0.05;
        camera.position.z += (CAM_Z - camera.position.z) * 0.05;
        camera.lookAt(LOOK);
      }

      /* Kadr holati: gorizontal burchak + vertikal siljish, ikkalasi wrap */
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        const ang = wrapC(f.baseA + scrollA, 2 * Math.PI);
        const y = wrapC(f.baseY + scrollY, TOTAL_H);
        f.pivot.rotation.y = ang;
        f.pivot.position.y = y;

        /* markazga yaqinlik (video reytingi uchun) */
        f.media.getWorldPosition(tmpV);
        f.cosA = tmpV.z / tmpV.length();

        f.scale += (f.targetScale - f.scale) * 0.14;
        if (Math.abs(f.scale - 1) > 0.001) {
          const s = f.scale;
          f.pivot.scale.setScalar(s);
          /* masshtab radiusni kattartiradi (uzoqlashtiradi) — markaz
             joyida qolib kameraga yengil yaqinlashishi uchun pivot
             radial yo'nalishda kompensatsiya qilinadi */
          const off = (1 - s) * (R + 3);
          f.pivot.position.x = Math.sin(ang) * off;
          f.pivot.position.z = Math.cos(ang) * off;
        } else if (f.pivot.scale.x !== 1) {
          f.pivot.scale.setScalar(1);
          f.pivot.position.x = 0;
          f.pivot.position.z = 0;
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
