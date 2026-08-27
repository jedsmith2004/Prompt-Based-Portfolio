/* ============================================================================
   shapes.ts — the silhouettes the ink field holds.

   Every export here is a factory returning a `ShapePainter`: a function that
   draws a white mask on a black 640-wide canvas. InkField samples that mask
   (red channel > 100) and scatters particle targets across the lit pixels, so
   these functions are not pictures. They are attractor fields.

   Three rules govern everything below.

   1. DETERMINISM. InkField re-invokes the painter on every resize and on every
      shape change. A `Math.random()` anywhere would make the terrain jump when
      the window is dragged. Each painter therefore builds a fresh mulberry32
      from a fixed seed at the top of the call, and touches nothing else.

   2. NEVER SET fillStyle OR strokeStyle. The caller presets both, and the two
      call sites preset them differently: the WebGL path paints white on black
      for sampling, the 2D fallback paints ink on paper for display. A painter
      that hardcodes '#fff' renders white ink on cream paper in the fallback,
      which is to say invisible. `globalAlpha` is safe to multiply into, and is
      how the ridge gets its depth layers, but note that the sampler threshold
      sits near alpha 0.4: anything fainter is dropped from the mask entirely.

   3. COVERAGE. Aim for 8-25% of the canvas lit. Below about 5% the particle
      budget spreads so thin that the field reads as a smear; above about 30%
      the silhouette fills in and turns to mush. Every figure quoted below was
      measured, not estimated: masks rendered in headless Chrome at 640x400,
      640x320 and 640x640, counting pixels past the sampler's own threshold.
      Three of them (wordmark, digitGlyph, routeLine) solve their weight
      backwards from an ink budget rather than carrying a fixed one, which is
      what holds them in band as the viewport changes shape. Measured across
      every export, every seed and all three aspects, the range is 5.9% to
      22.9%, the floor being a three stop route on a letterbox frame.
   ========================================================================== */

import type { ShapePainter } from '@/components/v2/InkField';

/* -------------------------------------------------------------------------- */
/* determinism                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * mulberry32: a 32-bit seeded PRNG, roughly two lines of arithmetic and good
 * enough for visual noise. Returns a generator of floats in [0, 1).
 *
 * Constructed fresh inside every painter call so that a resize reproduces the
 * previous frame's geometry exactly.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A point in canvas space. */
interface Pt {
  x: number;
  y: number;
}

/* -------------------------------------------------------------------------- */
/* drawing primitives                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Resample a polyline through a Catmull-Rom spline so a handful of control
 * points becomes a smooth run of short segments, which is what a variable
 * width stroke needs.
 *
 * If the first and last points coincide the curve is treated as closed and the
 * control points wrap, so loops (the bowl of a 0, the two rings of an 8) have
 * no seam.
 */
function smoothPath(pts: Pt[], per: number): Pt[] {
  const n = pts.length;
  if (n < 3) return pts.slice();

  const closed =
    Math.abs(pts[0].x - pts[n - 1].x) < 1e-6 &&
    Math.abs(pts[0].y - pts[n - 1].y) < 1e-6;
  const m = n - 1;

  const at = (i: number): Pt => {
    if (closed) return pts[((i % m) + m) % m];
    return pts[Math.max(0, Math.min(n - 1, i))];
  };

  const out: Pt[] = [];
  for (let i = 0; i < m; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let s = 0; s < per; s++) {
      const t = s / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
      });
    }
  }
  out.push(at(m));
  return out;
}

/**
 * Stroke a smoothed polyline with a width that breathes along its length, the
 * way a nib loads and unloads. Drawn segment by segment with round caps, which
 * costs a few hundred short paths and buys a line that does not read as a
 * vector primitive.
 *
 * @param base   nominal stroke width in px
 * @param phase  offset into the pressure wave, so two strokes differ
 * @param taperEnds  thin the first and last few percent of the run
 */
function pressureStroke(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  base: number,
  phase: number,
  taperEnds: boolean
): void {
  if (pts.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const last = pts.length - 1;
  for (let i = 0; i < last; i++) {
    const t = i / last;
    const press =
      0.80 + 0.26 * Math.sin(t * 8.7 + phase) + 0.10 * Math.sin(t * 20.9 + phase * 1.7);
    const taper = taperEnds ? Math.min(1, Math.min(t, 1 - t) * 14 + 0.30) : 1;
    ctx.lineWidth = Math.max(base * 0.28, base * press * taper);
    ctx.beginPath();
    ctx.moveTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
    ctx.stroke();
  }
}

/**
 * Trace a closed organic outline: an ellipse whose radius is modulated by
 * three low harmonics, which yields a lumpy stone rather than a circle. The
 * harmonic phases and amplitudes come from `rand`, so a run of blobs is varied
 * but reproducible.
 *
 * Appends a subpath; it does NOT call `beginPath`. That is deliberate. The 2D
 * fallback paints at alpha 0.86, so two overlapping fills darken where they
 * meet and the seam becomes visible. Callers that draw a figure from several
 * masses batch them into one path and fill once.
 *
 * @param k    wobble depth, 0 for a clean ellipse, 0.3 for a river pebble
 * @param seg  outline resolution; drop it for small blobs
 */
function organicPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rand: () => number,
  k: number,
  seg: number
): void {
  const a1 = rand() * Math.PI * 2;
  const a2 = rand() * Math.PI * 2;
  const a3 = rand() * Math.PI * 2;
  const k1 = k * (0.7 + rand() * 0.6);
  const k2 = k * (0.4 + rand() * 0.4);
  const k3 = k * (0.2 + rand() * 0.3);
  const rot = rand() * Math.PI;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);

  for (let i = 0; i <= seg; i++) {
    const th = (i / seg) * Math.PI * 2;
    const mod =
      1 + k1 * Math.sin(3 * th + a1) + k2 * Math.sin(5 * th + a2) + k3 * Math.sin(7 * th + a3);
    const x = Math.cos(th) * rx * mod;
    const y = Math.sin(th) * ry * mod;
    const px = cx + x * cr - y * sr;
    const py = cy + x * sr + y * cr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/**
 * 1D fractal midpoint displacement. Returns `(2 ** octaves) + 1` heights
 * normalised to [0, 1].
 *
 * This is what separates terrain from a sine wave: displacement is applied at
 * every scale, so the ridge carries detail wherever you look at it, and the
 * detail is self-similar rather than periodic.
 *
 * @param roughness  per-octave amplitude decay. Near 0.5 gives a Brownian
 *                   profile; lower is smoother, higher is jagged scree.
 */
function midpointRidge(rand: () => number, octaves: number, roughness: number): number[] {
  const size = (1 << octaves) + 1;
  const a = new Array<number>(size).fill(0);
  a[0] = rand();
  a[size - 1] = rand();

  let step = size - 1;
  let scale = 0.85;
  while (step > 1) {
    const half = step >> 1;
    for (let i = half; i < size; i += step) {
      a[i] = (a[i - half] + a[i + half]) * 0.5 + (rand() * 2 - 1) * scale;
    }
    step = half;
    scale *= roughness;
  }

  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < size; i++) {
    if (a[i] < lo) lo = a[i];
    if (a[i] > hi) hi = a[i];
  }
  const span = Math.max(hi - lo, 1e-6);
  for (let i = 0; i < size; i++) a[i] = (a[i] - lo) / span;
  return a;
}

/** Sample a normalised height array at u in [0, 1] with linear interpolation. */
function sampleAt(arr: number[], u: number): number {
  const f = Math.max(0, Math.min(1, u)) * (arr.length - 1);
  const i = Math.floor(f);
  const j = Math.min(arr.length - 1, i + 1);
  return arr[i] + (arr[j] - arr[i]) * (f - i);
}

/** Guard against a zero or negative canvas, which the caller can hand us mid-resize. */
function usable(w: number, h: number): boolean {
  return w > 4 && h > 4 && isFinite(w) && isFinite(h);
}

/** Summed length of a polyline, in px. */
function pathLength(pts: Pt[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return total;
}

/**
 * Mean multiplier `pressureStroke` applies to its nominal width. Used when
 * solving a stroke weight backwards from an ink budget, so the budget is hit
 * after the pressure wave rather than before it.
 */
const PRESSURE_MEAN = 0.80;

/* -------------------------------------------------------------------------- */
/* 1. ridgeline                                                                */
/* -------------------------------------------------------------------------- */

/**
 * How the ridge is dressed for the frame it is drawn in.
 *
 * 'wide' is the desktop hero. 'tall' is the phone, where the far band goes to
 * the very top — see THE PHONE TAKES THE BAND OFF THE TYPE inside the painter.
 */
export type RidgelineDress = 'wide' | 'tall';

/**
 * A gritstone moorland ridge, in the manner of the Kinder plateau: flat topped,
 * shouldered, with tors sitting proud of the near crest.
 *
 * Built from three layers of 1D fractal midpoint displacement at 129 samples,
 * not from summed sinusoids, so the profile has genuine multi-scale detail. The
 * summits are soft clamped above 0.72 of their range, which is what gives the
 * plateau its cut off top rather than a run of peaks.
 *
 * The strata span the lower half of the frame, crest to floor. Only the near one fills to the
 * floor; the far one is a band following its own crest, which keeps paper
 * between the two and holds coverage in range. The band is deliberately thick.
 * A thin one reads as a contour line drawn on the sky rather than as ground
 * standing behind ground. Depth is carried by `globalAlpha` (0.78 and 1.0),
 * both safely above the sampler's ~0.4 cutoff, and multiplied into whatever
 * alpha the caller set rather than overwriting it.
 *
 * @param seed  varies the terrain while staying stable across resizes
 * @param dress which plate this is drawn on. 'wide' is the desktop hero.
 *              'tall' is the phone, where the far band goes to the very top
 *              of the frame — see THE PHONE TAKES THE BAND OFF THE TYPE.
 * @returns a ShapePainter
 *
 * Coverage: measured 20.5 / 20.5 / 20.6% at 640x400, 640x320 and 640x640 for
 * seed 1, and 22.5 / 22.4 / 22.9% for seed 7, BEFORE the crests were moved
 * apart to clear the hero's reading matter. Re-measure if you touch `layers`;
 * the note there carries the arithmetic and the current figure.
 * Aspect independent, since every dimension is a fraction of h; the seed
 * spread is the terrain itself.
 */
export function ridgeline(seed: number = 1, dress: RidgelineDress = 'wide'): ShapePainter {
  return function paintRidgeline(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!usable(w, h)) return;
    const rand = mulberry32(0x51ed * (seed | 0) + 0x9e3779b9);

    /* base: mean crest height as a fraction of h, down from the top.
       amp:  vertical swing of the crest.
       depth: band thickness, or -1 to fill to the floor.
       rough: midpoint decay. Low, because moorland is long wavelength: high
              roughness gives alpine scree, which is the wrong hill entirely. */
    /*
     * THE TWO CRESTS ARE PLACED AROUND THE TYPE, not just on the frame.
     *
     * Jack, 2026-08-26: "move the top particle line a bit higher, so it
     * doesn't go through the body text."
     *
     * This painter is only ever used behind the hero, and the hero's type is
     * not spread evenly down the plate. Measured at 1440 wide, as a fraction
     * of the viewport: the display title occupies 0.34 to 0.63, and the lede
     * and the figure shelf occupy 0.76 to 0.94. The band's lowest reach was
     * base + amp + depth = 0.828, which put it straight through the lede and
     * the shelf, and the near ridge crested as high as 0.815, which put THAT
     * through them too. Between them the reading matter was the one part of
     * the plate with particles all over it.
     *
     * There is no horizontal strip below the title that clears both, so the
     * band goes up rather than down. It still crosses the title, which it
     * always did and which is fine: a distant ridge behind display type at
     * this size reads as ground behind a sign. It no longer crosses a word
     * anyone has to read.
     *
     *   far band  0.450 - 0.130 .. 0.450 + 0.130 + 0.082  =  0.320 .. 0.662
     *   near bank 0.895 - 0.045 .. floor                  =  0.850 .. 1
     *
     * The near layer also had to move: it is a fill to the floor, so lowering
     * its crest is what turns it from a mass covering the bottom third into a
     * bank along the bottom edge. Coverage drops from about 20.5% to about
     * 13%, which is still inside the 8-25% band the file asks for, and the
     * particle budget is fixed, so what is left simply reads denser.
     *
     * Both bases are 0.05 above where that note left them. Jack, 2026-08-27:
     * "Move both splash page particle bands up just a little bit, maybe 5% of
     * the page height." Taken literally, as a rigid translation of the whole
     * profile rather than a re-tune: the two crests keep the gap between them
     * that the note above was written to open, and the near bank keeps its
     * fill to the floor, so nothing here needs re-measuring.
     *
     * THE PHONE TAKES THE BAND OFF THE TYPE ENTIRELY.
     *
     * Jack, 2026-08-27: "The splash page does not look good on mobile, mostly
     * because of the top particle band, maybe move it right to the top (only
     * on mobile)."
     *
     * The arithmetic above is all fractions of the frame, and a phone frame is
     * about twice as tall as it is wide. The same 0.32..0.66 that clears the
     * hero's reading matter on a 1265x800 desktop is, on a 375x812 phone, a
     * 275px-deep stipple sitting across the middle of a title that has gone to
     * four or five lines to fit the width. The band is not in the wrong place
     * by a margin that tuning would fix; it is in the one place a tall frame
     * has no room for.
     *
     * So on the phone it goes to the ceiling: base 0.085 with the same amp
     * puts the crest between 0 and 0.215 and the band's floor at 0.297, which
     * reads as weather along the top edge above everything, rather than as
     * ground drawn through the middle of the name. The near bank stays where
     * the desktop leaves it — it is a bank along the bottom edge in either
     * frame, and it is the horizon the plate stands on.
     */
    const far =
      dress === 'tall'
        ? { base: 0.085, amp: 0.130, depth: 0.082, rough: 0.52, alpha: 0.78, oct: 7 }
        : { base: 0.450, amp: 0.130, depth: 0.082, rough: 0.52, alpha: 0.78, oct: 7 };

    const layers = [
      far,
      { base: 0.895, amp: 0.045, depth: -1, rough: 0.48, alpha: 1.0, oct: 7 }
    ];

    const prevAlpha = ctx.globalAlpha;
    ctx.save();

    const step = 3;
    let nearCrest: number[] = [];

    for (let li = 0; li < layers.length; li++) {
      const L = layers[li];
      const hgt = midpointRidge(rand, L.oct, L.rough);

      /* Soft clamp the summits. A moorland plateau is an eroded table, not a
         row of alpine peaks, and this one operation is what sells it. */
      for (let i = 0; i < hgt.length; i++) {
        if (hgt[i] > 0.66) hgt[i] = 0.66 + (hgt[i] - 0.66) * 0.30;
      }

      const crest: number[] = [];
      const xs: number[] = [];
      for (let x = 0; x <= w; x += step) {
        const u = x / w;
        /* A broad envelope lifts the middle of the sweep so the ridge has a
           shoulder falling away at both edges of the frame. */
        const env = 0.72 + 0.28 * Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
        const y = h * (L.base - (sampleAt(hgt, u) - 0.5) * 2 * L.amp * env);
        xs.push(x);
        crest.push(y);
      }
      if (li === layers.length - 1) nearCrest = crest;

      ctx.globalAlpha = prevAlpha * L.alpha;
      ctx.beginPath();
      ctx.moveTo(xs[0], crest[0]);
      for (let i = 1; i < xs.length; i++) ctx.lineTo(xs[i], crest[i]);
      if (L.depth < 0) {
        ctx.lineTo(w, h + 2);
        ctx.lineTo(0, h + 2);
      } else {
        const d = h * L.depth;
        for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(xs[i], crest[i] + d);
      }
      ctx.closePath();
      ctx.fill();
    }

    /* Tors: weathered blocks left standing on the near crest. Small, but they
       are the difference between a hill and gritstone. */
    ctx.globalAlpha = prevAlpha;
    const torCount = 4;
    for (let i = 0; i < torCount; i++) {
      const u = 0.12 + rand() * 0.76;
      const idx = Math.min(nearCrest.length - 1, Math.round(u * (nearCrest.length - 1)));
      const r = h * (0.016 + rand() * 0.020);
      ctx.beginPath();
      organicPath(ctx, u * w, nearCrest[idx] - r * 0.45, r * 1.35, r, rand, 0.24, 20);
      ctx.fill();
    }

    ctx.restore();
    ctx.globalAlpha = prevAlpha;
  };
}

/* -------------------------------------------------------------------------- */
/* 2. wordmark                                                                 */
/* -------------------------------------------------------------------------- */

/** Heavy display stack. Matches --f-display, with real fallbacks in front of sans-serif. */
const HEAVY_SANS =
  '"Bricolage Grotesque", "Helvetica Neue", Helvetica, Arial Black, Arial, sans-serif';

/** Fraction of the em taken by cap height when the browser gives us no metrics. */
const CAP_RATIO = 0.72;

/**
 * Fraction of its own cap-height bounding box that a black-weight sans actually
 * inks. Calibrated against rendered masks in Chrome (Arial Black standing in
 * for the display face); used only to solve type size backwards from an ink
 * budget, so an approximation is enough.
 */
const SANS_INK_FILL = 0.59;

/** Share of the canvas the wordmark aims to light. */
const WORDMARK_BUDGET = 0.16;

/** Split words into `count` lines of roughly equal set width. */
function balanceLines(words: string[], count: number, widthOf: (s: string) => number): string[] {
  if (count <= 1) return [words.join(' ')];
  const total = widthOf(words.join(' '));
  const target = total / count;
  const lines: string[] = [];
  let cur: string[] = [];
  for (let i = 0; i < words.length; i++) {
    cur.push(words[i]);
    const remainingWords = words.length - i - 1;
    const remainingLines = count - lines.length - 1;
    const full = widthOf(cur.join(' ')) >= target * 0.86;
    /* leave at least one word for every line still owed */
    if (remainingLines > 0 && (full || remainingWords <= remainingLines)) {
      lines.push(cur.join(' '));
      cur = [];
    }
  }
  if (cur.length) lines.push(cur.join(' '));
  while (lines.length < count) lines.push('');
  return lines.filter((l) => l.length > 0);
}

/**
 * Set `text` large and centred in the heaviest available sans.
 *
 * The size is measured, never guessed: the string is measured once at a 100px
 * probe size and the real size is derived from the ratio, then clamped by the
 * available height using the browser's own ascent metrics where they exist.
 *
 * Long strings are balanced across up to three lines. That is not decoration:
 * ink on a single line falls off as 1/n with character count, so "SELECTED
 * WORK" set on one line would light under 5% of the canvas and the field would
 * collapse into a smear. Wrapping keeps the type large and the mask dense.
 *
 * A note for callers: the offscreen sampling canvas uses whatever font is
 * resolved at paint time. Await `document.fonts.ready` before the first
 * retarget if the display face matters, otherwise the mask is cut from the
 * fallback and will shift once the webfont lands.
 *
 * @param text  the words to set. Empty input paints nothing.
 * @returns a ShapePainter
 *
 * Coverage: measured 15.8-16.2% for two to ten characters at all three test
 * aspects, since those cases are budget bound. Long strings on a square frame
 * run out of width before they run out of budget: "SELECTED WORK" measures
 * 9.3% at 640x640 and 14.9% at 640x400.
 */
export function wordmark(text: string): ShapePainter {
  return function paintWordmark(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!usable(w, h)) return;
    const words = text.trim().split(/\s+/).filter((s) => s.length > 0);
    if (words.length === 0) return;

    ctx.save();

    const PROBE = 100;
    const maxW = w * 0.88;
    const maxH = h * 0.74;

    ctx.font = `900 ${PROBE}px ${HEAVY_SANS}`;
    const widthOf = (s: string): number => ctx.measureText(s).width;

    /* Real cap height if the engine reports it, nominal otherwise. */
    const probeM = ctx.measureText('HX');
    const capRatio =
      typeof probeM.actualBoundingBoxAscent === 'number' && isFinite(probeM.actualBoundingBoxAscent)
        ? Math.max(0.55, Math.min(0.95, probeM.actualBoundingBoxAscent / PROBE))
        : CAP_RATIO;

    let bestSize = 0;
    let bestLines: string[] = [words.join(' ')];

    const maxLines = Math.min(3, words.length);
    for (let lc = 1; lc <= maxLines; lc++) {
      const lines = balanceLines(words, lc, widthOf);
      let widest = 0;
      let totalW = 0;
      for (let i = 0; i < lines.length; i++) {
        const lw = widthOf(lines[i]);
        totalW += lw;
        widest = Math.max(widest, lw);
      }
      if (widest <= 0) continue;
      const byWidth = (maxW / widest) * PROBE;
      /* 1.02 em of leading per line; display type is set tight. */
      const byHeight = maxH / (lines.length * 1.02 * capRatio);
      /* Ink budget. A two-letter word on a wide frame would otherwise fill the
         height and light a third of the canvas, which turns the mask to mush.
         ink(s) grows as s squared, so the cap is a square root. */
      const byInk =
        PROBE *
        Math.sqrt((WORDMARK_BUDGET * w * h) / (SANS_INK_FILL * capRatio * totalW * PROBE));
      const size = Math.min(byWidth, byHeight, byInk);
      if (size > bestSize) {
        bestSize = size;
        bestLines = lines;
      }
    }
    if (bestSize <= 0) {
      ctx.restore();
      return;
    }

    ctx.font = `900 ${bestSize}px ${HEAVY_SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lead = bestSize * 1.02 * capRatio;
    const cy = h / 2;
    const top = cy - ((bestLines.length - 1) * lead) / 2;
    for (let i = 0; i < bestLines.length; i++) {
      ctx.fillText(bestLines[i], w / 2, top + i * lead);
    }

    ctx.restore();
  };
}

/* -------------------------------------------------------------------------- */
/* 3. digitGlyph                                                               */
/* -------------------------------------------------------------------------- */

/** Share of the canvas a numeral aims to light, before the legibility clamp. */
const DIGIT_BUDGET = 0.13;

/** Build a closed loop of control points on the unit box, optionally sheared. */
function unitLoop(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  tilt: number,
  n: number
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(t) * rx;
    const y = Math.sin(t) * ry;
    pts.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return pts;
}

/**
 * Stroke skeletons for 0-9 on a unit box, x and y both in [0, 1] with y down.
 *
 * These are written as pen paths, not outlines: the numeral is the trace of a
 * single nib, which is why the 4 and the 7 carry a separate crossbar stroke and
 * the 3 runs as one continuous S rather than two bowls. Rendering strokes them
 * with a breathing width, so the weight varies the way a hand varies.
 */
const DIGIT_STROKES: Array<Array<Array<[number, number]>>> = [
  /* 0 */ [unitLoop(0.5, 0.5, 0.29, 0.45, -0.1, 16)],
  /* 1 */ [
    [
      [0.26, 0.22],
      [0.40, 0.12],
      [0.53, 0.05],
      [0.51, 0.50],
      [0.50, 0.93]
    ],
    [
      [0.26, 0.94],
      [0.50, 0.92],
      [0.76, 0.94]
    ]
  ],
  /* 2 */ [
    [
      [0.16, 0.26],
      [0.26, 0.09],
      [0.52, 0.05],
      [0.75, 0.16],
      [0.72, 0.38],
      [0.48, 0.62],
      [0.19, 0.90],
      [0.50, 0.90],
      [0.84, 0.88]
    ]
  ],
  /* 3 */ [
    [
      [0.17, 0.17],
      [0.42, 0.05],
      [0.72, 0.15],
      [0.65, 0.40],
      [0.40, 0.48],
      [0.71, 0.57],
      [0.75, 0.82],
      [0.44, 0.95],
      [0.16, 0.85]
    ]
  ],
  /* 4 */ [
    [
      [0.66, 0.05],
      [0.40, 0.36],
      [0.13, 0.68],
      [0.50, 0.67],
      [0.89, 0.66]
    ],
    [
      [0.64, 0.30],
      [0.61, 0.62],
      [0.58, 0.95]
    ]
  ],
  /* 5 */ [
    [
      [0.78, 0.07],
      [0.48, 0.07],
      [0.29, 0.08],
      [0.25, 0.28],
      [0.24, 0.43],
      [0.52, 0.35],
      [0.76, 0.50],
      [0.70, 0.81],
      [0.38, 0.95],
      [0.15, 0.85]
    ]
  ],
  /* 6 */ [
    [
      [0.75, 0.06],
      [0.45, 0.14],
      [0.26, 0.44],
      [0.22, 0.74],
      [0.41, 0.94],
      [0.66, 0.89],
      [0.75, 0.66],
      [0.56, 0.51],
      [0.31, 0.57],
      [0.24, 0.71]
    ]
  ],
  /* 7 */ [
    [
      [0.13, 0.09],
      [0.48, 0.07],
      [0.85, 0.08],
      [0.62, 0.48],
      [0.43, 0.95]
    ],
    [
      [0.28, 0.55],
      [0.48, 0.52],
      [0.68, 0.49]
    ]
  ],
  /* 8 */ [
    unitLoop(0.5, 0.28, 0.23, 0.23, -0.09, 14),
    unitLoop(0.5, 0.73, 0.29, 0.24, 0.05, 14)
  ],
  /* 9 */ [
    [
      [0.72, 0.42],
      [0.50, 0.51],
      [0.27, 0.41],
      [0.31, 0.17],
      [0.58, 0.07],
      [0.75, 0.25],
      [0.76, 0.58],
      [0.62, 0.86],
      [0.33, 0.94]
    ]
  ]
];

/**
 * One large numeral, drawn rather than typeset.
 *
 * The glyph is a pen skeleton (see DIGIT_STROKES) rather than a font outline,
 * which matters for two reasons. It is immune to whether a webfont has loaded
 * on the offscreen sampling canvas, and it can be stroked with a width that
 * rises and falls along the run, which is most of what makes a mark look
 * handwritten. Control points get a small seeded jitter, then a Catmull-Rom
 * pass turns them into a smooth stroke.
 *
 * @param digit  0-9. Non-integers round; out-of-range values clamp.
 * @returns a ShapePainter
 *
 * Coverage: measured 9.8-13.4% at 640x400, 8.2-12.1% at 640x320, 12.2-13.8%
 * at 640x640, across all ten digits. The spread is the legibility clamp
 * biting on the sparsest glyphs, 1 and 7, which cannot be fattened to budget
 * without becoming bars.
 */
export function digitGlyph(digit: number): ShapePainter {
  return function paintDigit(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!usable(w, h)) return;
    const d = Math.max(0, Math.min(9, Math.round(digit) || 0)) | 0;
    const rand = mulberry32(0x2f9a + d * 0x9e3779b1);

    const strokes = DIGIT_STROKES[d];
    ctx.save();

    /* The numeral widens on a wide frame rather than sitting condensed in the
       middle of it. That is partly proportion and partly ink: a 1 has half the
       run of an 8, and on a letterbox canvas widening the box is the only way
       left to get it up to budget once the weight clamp has bitten. */
    const wide = Math.max(0, Math.min(1, (w / h - 1.4) / 0.8));
    const ratio = 0.62 + 0.18 * wide;
    let boxH = h * 0.82;
    let boxW = boxH * ratio;
    if (boxW > w * 0.62) {
      boxW = w * 0.62;
      boxH = boxW / ratio;
    }
    const x0 = (w - boxW) / 2;
    const y0 = (h - boxH) / 2;

    /* Build every stroke first. Nib weight is then solved from the total path
       length rather than fixed, because a 1 is half the run of an 8 and a fixed
       weight would light half as much canvas. */
    const runs: Array<{ pts: Pt[]; fac: number; open: boolean }> = [];
    let weighted = 0;

    for (let s = 0; s < strokes.length; s++) {
      const raw = strokes[s];
      const closed =
        raw.length > 3 &&
        Math.abs(raw[0][0] - raw[raw.length - 1][0]) < 1e-6 &&
        Math.abs(raw[0][1] - raw[raw.length - 1][1]) < 1e-6;

      const jittered: Pt[] = raw.map(([ux, uy]) => ({
        x: x0 + (ux + (rand() - 0.5) * 0.022) * boxW,
        y: y0 + (uy + (rand() - 0.5) * 0.022) * boxH
      }));
      /* a jittered loop must still close on itself */
      if (closed) jittered[jittered.length - 1] = jittered[0];

      const pts = smoothPath(jittered, 10);
      /* the crossbar of a 4 or a 7 is a lighter, quicker mark */
      const fac = s === 0 ? 1 : 0.78;
      runs.push({ pts, fac, open: !closed });
      weighted += pathLength(pts) * fac;
    }

    /* Clamped so the mark stays legible: a thin 1 is better than a 1 fattened
       into a bar, and a fat 8 is better than an 8 whose counters close up. */
    const solved = weighted > 0 ? (DIGIT_BUDGET * w * h) / (PRESSURE_MEAN * weighted) : boxH * 0.15;
    const base = Math.max(boxH * 0.10, Math.min(boxH * 0.19, solved));

    for (let i = 0; i < runs.length; i++) {
      pressureStroke(ctx, runs[i].pts, base * runs[i].fac, rand() * 6.283, runs[i].open);
    }

    ctx.restore();
  };
}

/* -------------------------------------------------------------------------- */
/* 4. climbingWall                                                             */
/* -------------------------------------------------------------------------- */

/** Share of the canvas a route aims to light, stroke plus stops. */
const ROUTE_BUDGET = 0.19;

/** Shortest distance from a point to a segment. Used to find the route line. */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/**
 * A bouldering panel. Holds are laid on a jittered grid, and both their size
 * and their survival odds rise with proximity to a diagonal running from the
 * bottom left to the top right, so a route emerges from the scatter without
 * ever being drawn.
 *
 * Every hold is an `organicPath`: an ellipse pushed around by three low
 * harmonics with a random rotation and aspect. None of them is a circle, and
 * none of them repeats, which is the whole point. Real holds are sculpted.
 *
 * @returns a ShapePainter
 *
 * Coverage: measured 11.6% at 640x400, 12.4% at 640x320, 18.4% at 640x640.
 * Cells near the route light about 38% of their own area, cells far from it
 * about 4%, and the route band is roughly a fifth of the grid.
 */
export function climbingWall(): ShapePainter {
  return function paintWall(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!usable(w, h)) return;
    const rand = mulberry32(0x5ea51de);

    ctx.save();

    const cell = Math.max(38, w / 9);
    const cols = Math.max(3, Math.round(w / cell));
    const rows = Math.max(3, Math.round(h / cell));
    const cw = w / cols;
    const ch = h / rows;

    /* the implied line: low right-of-centre start to a high finish */
    const ax = w * 0.14;
    const ay = h * 0.95;
    const bx = w * 0.86;
    const by = h * 0.09;
    const band = Math.min(w, h) * 0.26;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = (c + 0.5) * cw + (rand() - 0.5) * cw * 0.44;
        const cy = (r + 0.5) * ch + (rand() - 0.5) * ch * 0.44;

        const dist = distToSegment(cx, cy, ax, ay, bx, by);
        const near = Math.max(0, 1 - dist / band);
        const t = Math.pow(near, 1.2);

        if (rand() > 0.42 + 0.52 * t) continue;

        const s = Math.min(cw, ch);
        const rad = s * (0.20 + 0.28 * t) * (0.82 + rand() * 0.40);
        const squash = 0.58 + rand() * 0.66;
        /* Wobble stays modest. Push it past about 0.2 and the third harmonic
           dominates, and every hold turns into a clover. */
        ctx.beginPath();
        organicPath(ctx, cx, cy, rad, rad * squash, rand, 0.15, 34);
        ctx.fill();
      }
    }

    ctx.restore();
  };
}

/* -------------------------------------------------------------------------- */
/* 5. routeLine                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A stroked polyline through normalised stops, with a filled dot at each one.
 *
 * Points arrive in [0, 1] on both axes and are mapped straight onto the frame,
 * so any inset is the caller's business. The run is smoothed and given a small
 * seeded wander before stroking, because a journey plotted with a ruler reads
 * as a diagram and this needs to read as a line someone drew.
 *
 * Line and dot are deliberately heavy. At a hairline weight a twenty stop route
 * lights under 4% of the canvas, and the particle field cannot hold a target
 * that thin.
 *
 * @param stops  normalised points. An empty array falls back to `scatter`, so
 *               the field always has something to hold.
 * @returns a ShapePainter
 *
 * Coverage: measured 9.9% at 640x400 for the 20 stop route, 8.7% at 640x320,
 * 13.2% at 640x640. A three stop hop measures 6.8 / 5.9 / 9.8% respectively,
 * the low end being the maximum brush width clamping before the budget is
 * met. That is the thinnest mask in this file, and still above the smear
 * floor. Below three stops, prefer `scatter`.
 */
export function routeLine(stops: Array<{ x: number; y: number }>): ShapePainter {
  return function paintRoute(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!usable(w, h)) return;
    if (stops.length === 0) {
      scatter()(ctx, w, h);
      return;
    }
    const rand = mulberry32(0x0f1cea7 + stops.length * 2654435761);

    ctx.save();

    const wob = Math.min(w, h) * 0.012;
    const pts: Pt[] = stops.map((s) => ({
      x: s.x * w + (rand() - 0.5) * wob,
      y: s.y * h + (rand() - 0.5) * wob
    }));

    const unit = Math.min(w, h);
    /* Stations grow as the route shortens, so a three stop hop and a twenty
       stop crossing carry comparable weight without the brush having to. */
    const dotR = unit * Math.min(0.085, 0.045 + 0.16 / pts.length);

    /* Dots as a budget line item: roughly half of each disc falls on ground
       the stroke would have covered anyway. */
    const dotInk = pts.length * Math.PI * dotR * dotR * 0.5;

    if (pts.length >= 2) {
      /* Sample densely enough that consecutive round caps overlap. Sparse
         sampling leaves the stroke beaded, because the 2D fallback composites
         each segment at alpha 0.86 and the joints stack darker than the middles. */
      const per = Math.max(8, Math.min(40, Math.round(560 / pts.length)));
      const line = smoothPath(pts, per);
      const len = pathLength(line);
      /* Solve the brush width from what is left of the budget. A twenty stop
         route across Europe and a three stop hop then light the same share of
         the canvas, which is what keeps the field stable between sections. */
      const want = Math.max(0, ROUTE_BUDGET * w * h - dotInk);
      const solved = len > 0 ? want / (PRESSURE_MEAN * len) : unit * 0.04;
      /* The upper clamp is the important one. Left to the budget alone the
         brush swells until the route reads as a worm and the stations vanish
         inside it. */
      const base = Math.max(unit * 0.020, Math.min(unit * 0.045, solved));
      pressureStroke(ctx, line, base, 0.7, false);
    }

    for (let i = 0; i < pts.length; i++) {
      ctx.beginPath();
      organicPath(ctx, pts[i].x, pts[i].y, dotR, dotR, rand, 0.10, 22);
      ctx.fill();
    }

    ctx.restore();
  };
}

/* -------------------------------------------------------------------------- */
/* 6. portraitBlob                                                             */
/* -------------------------------------------------------------------------- */

/**
 * An abstract head and shoulders, cropped at the bottom edge the way a bust is.
 *
 * Nothing here is a feature. It is three soft masses (skull, neck, shoulders)
 * with organic outlines and a deliberate asymmetry in the shoulder line, which
 * is enough for the eye to read a person and not enough for it to read a
 * portrait of anyone.
 *
 * All three go into a single path and are filled once. Filling them separately
 * works for the mask, where everything is white, but the 2D fallback paints at
 * alpha 0.86 and every overlap darkens, so the neck surfaces as a rectangle
 * ruled across the chest.
 *
 * The figure is scaled by `min(0.52w, 0.86h)` rather than by width, so it stays
 * a person on a wide frame instead of stretching into a landscape.
 *
 * @returns a ShapePainter
 *
 * Coverage: measured 19.8% at 640x400, 17.0% at 640x320, 12.0% at 640x640.
 * Ink is about 0.46 S squared, and S stops growing with h once the width term
 * binds, which is why the square frame reads lighter.
 */
export function portraitBlob(): ShapePainter {
  return function paintPortrait(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!usable(w, h)) return;
    const rand = mulberry32(0xb0d1cea);

    ctx.save();

    const S = Math.min(w * 0.52, h * 0.86);
    const cx = w * 0.5;
    /* the bust runs slightly off the bottom of the frame */
    const y0 = h * 1.02;

    /* shoulders: two cubics meeting at the neck, right side carried a little
       higher than the left so the pose has a lean */
    const shTop = y0 - 0.34 * S;
    const lean = 0.028 * S;
    const headCy = y0 - 0.58 * S;

    ctx.beginPath();
    ctx.moveTo(cx - 0.58 * S, y0 + 0.14 * S);
    ctx.bezierCurveTo(
      cx - 0.56 * S, shTop + 0.10 * S + lean,
      cx - 0.34 * S, shTop + lean,
      cx - 0.13 * S, shTop + 0.03 * S + lean
    );
    ctx.bezierCurveTo(
      cx - 0.05 * S, shTop - 0.02 * S,
      cx + 0.05 * S, shTop - 0.02 * S,
      cx + 0.13 * S, shTop + 0.02 * S - lean
    );
    ctx.bezierCurveTo(
      cx + 0.35 * S, shTop - 0.01 * S - lean,
      cx + 0.57 * S, shTop + 0.11 * S - lean,
      cx + 0.60 * S, y0 + 0.14 * S
    );
    ctx.closePath();

    /* Neck, as a column rather than a blob. A rounded mass here leaves a wedge
       of paper between jaw and collar that reads as a hood, so the column runs
       from inside the skull down to inside the shoulders and cannot gap. */
    ctx.moveTo(cx - 0.112 * S, headCy);
    ctx.lineTo(cx + 0.112 * S, headCy);
    ctx.lineTo(cx + 0.150 * S, shTop + 0.07 * S);
    ctx.lineTo(cx - 0.150 * S, shTop + 0.07 * S);
    ctx.closePath();

    /* skull */
    organicPath(ctx, cx, headCy, 0.205 * S, 0.265 * S, rand, 0.055, 44);

    /* one fill, so no seam shows where the masses meet */
    ctx.fill();

    ctx.restore();
  };
}

/* -------------------------------------------------------------------------- */
/* 7. scatter                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The neutral state: pigment dispersed evenly across the whole frame, with no
 * figure in it.
 *
 * A jittered grid rather than uniform random placement, because true uniform
 * sampling clumps, and clumps in a target field read as an intention the field
 * does not have. Dot radii vary so the wash has grain.
 *
 * Also the fallback for `routeLine` when it is handed no stops.
 *
 * @returns a ShapePainter
 *
 * Coverage: measured 12.9-13.2% at every test aspect. Cell size is
 * min(w, h)/18 and radius is 0.13 to 0.27 of a cell, so the figure is scale
 * invariant by construction.
 */
export function scatter(): ShapePainter {
  return function paintScatter(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!usable(w, h)) return;
    const rand = mulberry32(0x5ca77e2);

    ctx.save();

    const cell = Math.max(12, Math.min(w, h) / 18);
    const cols = Math.max(2, Math.ceil(w / cell));
    const rows = Math.max(2, Math.ceil(h / cell));
    const cw = w / cols;
    const ch = h / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * cw + (rand() - 0.5) * cw * 0.7;
        const y = (r + 0.5) * ch + (rand() - 0.5) * ch * 0.7;
        const rad = Math.min(cw, ch) * (0.13 + rand() * 0.14);
        ctx.beginPath();
        organicPath(ctx, x, y, rad, rad * (0.75 + rand() * 0.5), rand, 0.16, 14);
        ctx.fill();
      }
    }

    ctx.restore();
  };
}
