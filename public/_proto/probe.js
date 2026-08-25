/* ============================================================================
   probe.js — eyes, for an environment that has none.

   The Browser pane reports `document.hidden === true` and never composites, so
   screenshots time out and every CSS transition is frozen mid-flight. That has
   already produced four separate rounds of invented findings in this project
   (see docs/spec.md section 8). This file is the countermeasure: it reads
   pixels back out of a canvas and prints them as text, which is the only way
   to actually LOOK at anything drawn here.

   Under public/_proto/, which .gitignore excludes. Load with:
     const s = document.createElement('script');
     s.src = '/_proto/probe.js'; document.head.appendChild(s);
   ========================================================================== */
(function () {
  const P = {};

  /**
   * A canvas whose pixels cannot be read.
   *
   * `getContext('2d')` returns null on a canvas that already holds a WebGL
   * context, and reading a GL canvas back after it has composited returns
   * garbage anyway (no preserveDrawingBuffer) — which produced one of the four
   * rounds of invented findings this project has already had. So say so
   * instead of guessing.
   */
  function ctx2d(src) {
    try {
      return src.getContext('2d');
    } catch (e) {
      return null;
    }
  }

  /**
   * A canvas as text.
   *
   * `gain` multiplies the ink value before it is quantised onto the ramp, so a
   * faint plate can be pushed up into visibility without changing the plate.
   * Anything above 1 is a contrast stretch and is a READING aid, not a
   * measurement — take numbers from P.stats, not from counting characters.
   */
  P.ascii = function (src, opts) {
    if (!ctx2d(src)) return '[webgl canvas: pixels not readable — see probe.js]';
    const o = opts || {};
    const cols = o.cols || 92;
    const gain = o.gain == null ? 1.6 : o.gain;
    const ramp = o.ramp || ' .:-=+*#%@';
    /* Text cells are about twice as tall as they are wide; without this a
       square object prints as a tall rectangle and every judgement made from
       it is wrong. */
    const aspect = o.aspect || 2.05;
    const w = src.width;
    const h = src.height;
    const cw = w / cols;
    const ch = cw * aspect;
    const rows = Math.max(1, Math.round(h / ch));
    const d = ctx2d(src).getImageData(0, 0, w, h).data;
    const out = [];
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let c = 0; c < cols; c++) {
        const x0 = Math.floor(c * cw);
        const x1 = Math.min(w, Math.ceil((c + 1) * cw));
        const y0 = Math.floor(r * ch);
        const y1 = Math.min(h, Math.ceil((r + 1) * ch));
        let s = 0;
        let n = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * w + x) * 4;
            const a = d[i + 3] / 255;
            const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
            /* ink = opaque AND dark, so a transparent canvas reads as blank
               rather than as black, which is the mistake the glyph atlas made */
            s += a * (1 - lum);
            n++;
          }
        }
        const v = n ? s / n : 0;
        const gi = Math.round(v * (ramp.length - 1) * gain);
        line += ramp[Math.max(0, Math.min(ramp.length - 1, gi))];
      }
      out.push(line);
    }
    return out.join('\n');
  };

  /** Ink coverage, bounding box and tone histogram. Measurement, not reading. */
  P.stats = function (src) {
    const g = ctx2d(src);
    if (!g) return { webgl: true, px: src.width + 'x' + src.height };
    const w = src.width;
    const h = src.height;
    const d = g.getImageData(0, 0, w, h).data;
    let n = 0;
    let x0 = 1e9;
    let y0 = 1e9;
    let x1 = -1;
    let y1 = -1;
    const hist = new Array(8).fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] <= 8) continue;
        n++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
        hist[Math.min(7, Math.floor(lum * 8))]++;
      }
    }
    return {
      px: w + 'x' + h,
      inkPct: +((100 * n) / (w * h)).toFixed(2),
      bbox: x1 < 0 ? null : { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0 + 1, h: y1 - y0 + 1 },
      /* share of drawn pixels in each eighth of the luminance range */
      lumHist: hist.map(function (v) {
        return n ? +((100 * v) / n).toFixed(1) : 0;
      })
    };
  };

  /*
   * NEVER CALL getContext('webgl2') TO ASK WHETHER A CANVAS IS WebGL.
   *
   * It CREATES one on any canvas that has no context yet, so the question
   * changes the answer — and worse, it burns a slot from the browser's 8-16
   * live-context budget, which is the pool this project has already been bitten
   * by. Counting "GL canvases" that way on /v2 reported three when the true
   * answer is one.
   *
   * The non-destructive test is the other way round: getContext('2d') returns
   * null on a GL-bound canvas, and creating a 2D context on an unused canvas
   * costs nothing. That is what ctx2d above does.
   */

  /** Every canvas on the page, with whichever dev handle it carries. */
  P.canvases = function () {
    return [].slice.call(document.querySelectorAll('canvas')).map(function (c, i) {
      const r = c.getBoundingClientRect();
      return {
        i: i,
        cls: c.getAttribute('class') || '',
        px: c.width + 'x' + c.height,
        css: Math.round(r.width) + 'x' + Math.round(r.height),
        docY: Math.round(r.top + window.scrollY),
        handle: c.__reel ? '__reel' : c.__bird ? '__bird' : c.__ink ? '__ink' : c.__world ? '__world' : ''
      };
    });
  };

  /**
   * Force every reveal transition to its end state.
   *
   * Reveals are driven by IntersectionObserver, which reports nothing in a
   * pane that never composites, so without this most of the page is at
   * opacity 0 and every measurement taken from it is a measurement of
   * nothing. This is the single most common way to get a false reading here.
   */
  P.reveal = function () {
    let n = 0;
    document.querySelectorAll('*').forEach(function (el) {
      const cl = el.getAttribute('class') || '';
      if (cl.indexOf('v2-') < 0) return;
      if (getComputedStyle(el).opacity === '1') return;
      el.classList.add('is-in');
      n++;
    });
    return n;
  };

  /**
   * One colour parser, and there is exactly one for a reason.
   *
   * `color-mix()` computes to `color(srgb r g b / a)` with channels in 0..1,
   * not 0..255. Reading those as bytes makes every translucent surface look
   * near-black. This project has now been bitten by it twice: once in the
   * contrast helper, where it reported the nav mark at 1.14:1 against a true
   * 13.81:1 and produced nine phantom failures at once — and then AGAIN in the
   * background walker written to fix a different phantom, where it turned a
   * 66% paper panel into ink and reported the neural pad's hint at 1.28:1
   * against a true 6.9:1.
   *
   * Fixing it in two places was the mistake. It is fixed in one now.
   *
   * Returns [r, g, b, a] with r/g/b in 0..255, or null.
   */
  P.parseColour = function (css) {
    const str = String(css);
    const m = str.match(/[\d.]+(?:e[-+]?\d+)?/gi);
    if (!m || m.length < 3) return null;
    let r = +m[0];
    let g = +m[1];
    let b = +m[2];
    const a = m.length > 3 ? +m[3] : 1;
    if (str.indexOf('color(') === 0 && r <= 1 && g <= 1 && b <= 1) {
      r *= 255;
      g *= 255;
      b *= 255;
    }
    return [r, g, b, a];
  };

  /**
   * Is this element actually rendered?
   *
   * `getComputedStyle(el).display` is the element's OWN display, so a span
   * inside an `ol { display: none }` still reports `inline` and every check
   * that filters on it walks straight into auditing invisible text. That is
   * how the nav rail's plate numbers were reported as eight contrast failures
   * at mobile width, where the whole rail collapses to a 3px progress bar and
   * the numbers are not drawn at all.
   *
   * `getClientRects()` is empty for anything inside a display:none subtree, so
   * it answers the question that was actually being asked.
   */
  P.visible = function (el) {
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.5) return false;
    return true;
  };

  /**
   * Every text-bearing element that is really on screen, with its contrast and
   * the AA threshold for its size. One place, so a probe cannot get it wrong
   * differently each time.
   */
  P.audit = function (root) {
    const bad = [];
    let n = 0;
    (root || document.body).querySelectorAll('*').forEach(function (el) {
      let has = false;
      el.childNodes.forEach(function (x) {
        if (x.nodeType === 3 && x.textContent.trim()) has = true;
      });
      if (!has || !P.visible(el)) return;
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      const c = P.contrast(cs.color, P.bgOf(el));
      if (c == null) return;
      n++;
      const large = size >= 18 || (size >= 14 && parseInt(cs.fontWeight, 10) >= 700);
      const need = large ? 3 : 4.5;
      if (c < need) {
        bad.push({
          cls: (el.getAttribute('class') || (el.parentElement && el.parentElement.getAttribute('class')) || '?').slice(0, 30),
          size: size,
          c: c,
          need: need,
          txt: el.textContent.trim().slice(0, 20)
        });
      }
    });
    return { checked: n, failures: bad };
  };

  /**
   * The colour actually BEHIND an element, with translucency composited.
   *
   * Walking up for the first non-transparent background and using it raw is
   * wrong whenever that background has an alpha, and it is wrong in the
   * alarming direction: a 16% black tint over paper reads as near-black and
   * every label on it looks like a contrast failure. The mobile nav rail is
   * exactly that, and it reported 2.61:1 where the composited answer is 3.83.
   *
   * So: collect every layer up to the root, then composite them back down.
   * Returns an opaque `rgb()` string.
   */
  P.bgOf = function (el) {
    const layers = [];
    let e = el;
    while (e && e !== document.documentElement) {
      const L = P.parseColour(getComputedStyle(e).backgroundColor);
      if (L && L[3] > 0.001) {
        layers.push(L);
        if (L[3] >= 0.999) break;
      }
      e = e.parentElement;
    }
    const root = P.parseColour(getComputedStyle(document.documentElement).backgroundColor);
    let r = root ? root[0] : 255;
    let g = root ? root[1] : 255;
    let b2 = root ? root[2] : 255;
    /* back to front: the last layer collected is the furthest back */
    for (let i = layers.length - 1; i >= 0; i--) {
      const L = layers[i];
      r = L[0] * L[3] + r * (1 - L[3]);
      g = L[1] * L[3] + g * (1 - L[3]);
      b2 = L[2] * L[3] + b2 * (1 - L[3]);
    }
    return 'rgb(' + Math.round(r) + ', ' + Math.round(g) + ', ' + Math.round(b2) + ')';
  };

  /** WCAG contrast of two computed colours, both as `rgb()` strings. */
  P.contrast = function (fg, bg) {
    function lin(v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    function L(css) {
      const c = P.parseColour(css);
      if (!c) return null;
      return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    }
    const a = L(fg);
    const b = L(bg);
    if (a == null || b == null) return null;
    return +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2);
  };

  window.P = P;
  window.__probeReady = true;
})();
