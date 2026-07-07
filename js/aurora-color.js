/* ═══════════════════════════════════════════════════════
   CINEPLEX — Aurora dynamic color extractor
   Watches the watch-page poster image and derives a desaturated
   dominant color for the page's aurora background. Purely additive:
   only sets a CSS custom property and toggles one class — never
   touches player/data logic. Fails silently (keeps green fallback)
   if the poster can't be read (no CORS headers, load error, etc.)
═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!document.body.classList.contains('watch-page')) return;

  var auroraLayer = document.getElementById('watch-aurora-dynamic');
  var sourceImg = document.getElementById('player-bg');
  if (!auroraLayer || !sourceImg) return;

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    if (s === 0) {
      var v = Math.round(l * 255);
      return [v, v, v];
    }
    var hue2rgb = function (p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return [
      Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      Math.round(hue2rgb(p, q, h) * 255),
      Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
    ];
  }

  var lastUrl = '';

  function applyDominantColor(url) {
    if (!url || url === lastUrl) return;
    lastUrl = url;

    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      try {
        var size = 12;
        var canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        var data = ctx.getImageData(0, 0, size, size).data;

        var r = 0, g = 0, b = 0, n = 0;
        for (var i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
        r /= n; g /= n; b /= n;

        /* Desaturate to ~35% so the poster's color reads as an ambient
           tint behind glass panels, not a competing hue against text. */
        var hsl = rgbToHsl(r, g, b);
        hsl[1] = Math.min(hsl[1], 0.35);
        var rgb = hslToRgb(hsl[0], hsl[1], hsl[2]);

        document.documentElement.style.setProperty('--aurora-rgb', rgb.join(', '));
        auroraLayer.classList.add('ready');
      } catch (e) {
        /* Tainted canvas or read failure — green fallback stays visible */
      }
    };
    img.src = url;
  }

  /* player-bg.src o'zgarishini kuzatamiz — mavjud yuklash funksiyasiga tegmasdan */
  var observer = new MutationObserver(function () {
    applyDominantColor(sourceImg.src);
  });
  observer.observe(sourceImg, { attributes: true, attributeFilter: ['src'] });

  if (sourceImg.src) applyDominantColor(sourceImg.src);
})();
