'use client';

/* ============================================================================
   NeuralPlayground — a handwritten digit classifier you can draw into, with
   the network drawn as the picture rather than hidden behind it.

   It really classifies. The weights in lib/v2/digit-weights.json were trained
   by scripts/train-digits.js (784 -> 64 ReLU -> 10 softmax, plain SGD) on
   synthesised stroke renderings of the digits, and the forward pass below is
   the whole model: two matrix multiplies, a ReLU and a softmax. Nothing is
   faked, nothing is fetched, and the confidence printed under the pad is the
   number the softmax actually produced.

   Three things carry the weight of this file:

   1. PREPROCESS is the load-bearing step. A drawn digit is cropped to its ink,
      scaled so the long side is 20px, and shifted so its centre of mass sits
      at the centre of a 28x28 field. Training saw exactly this, so the pad is
      invariant to where and how large you draw. It is a twin of the function
      in scripts/train-digits.js and the two must change together.

   2. THE LINKS ARE REAL. Every wire drawn is a weight that exists, picked by
      how much it contributed to this input: vermilion where the weight is
      positive, ink blue where it is negative. Only the strongest few per
      neuron are drawn, because 50,176 hairlines is a smudge, not a diagram.

   3. INFERENCE RUNS ON STROKE END, never on pointermove, so drawing stays at
      pointer rate. The render loop only spins while something is still moving
      and stops itself the moment the plate has settled.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { withAlpha } from '@/lib/v2/colour';
import { onPaletteChange, paletteTokens, type PaletteTokens } from '@/lib/v2/paletteWatch';

/* -------------------------------------------------------------------------- */
/* model                                                                       */
/* -------------------------------------------------------------------------- */

const NIN = 784;
const NH = 64;
const NOUT = 10;

/** Offscreen resolution the pad is rasterised at before normalisation. Fixed
    so inference does not depend on the element size or the device pixel ratio. */
const RASTER = 168;

/** Stroke width as a fraction of the pad. Matches the range training saw. */
const STROKE_RATIO = 0.075;
/* Middle of the stroke-to-box range the network was trained on. */
const STROKE_RATIO_TARGET = 0.105;

/** Below this the pad counts as empty, so a stray tap is not given a verdict. */
const MIN_INK = 40;

const TAU = Math.PI * 2;

interface DigitWeights {
  arch: number[];
  accuracy: { train: number; holdout: number; stress: number };
  samples: { train: number; holdout: number; stress: number };
  w1: number[];
  b1: number[];
  w2: number[];
  b2: number[];
}

interface Net {
  w1: Float32Array;
  b1: Float32Array;
  w2: Float32Array;
  b2: Float32Array;
  holdout: number;
}

/* ------------------------------------------------------- MNIST normalisation
   Twin of preprocess() in scripts/train-digits.js. Returns null for an empty
   field rather than a field of zeros, so the caller can tell the difference
   between "nothing drawn" and "drawn, and the answer is 0". */

function preprocess(
  src: Float32Array,
  w: number,
  h: number,
  out: Float32Array
): boolean {
  const T = 0.06;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (src[y * w + x] > T) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return false;

  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const k = 20 / Math.max(bw, bh);
  const nw = Math.max(1, Math.min(20, Math.round(bw * k)));
  const nh = Math.max(1, Math.min(20, Math.round(bh * k)));

  /* area average: the right filter for a downscale, and it keeps the soft
     edge a canvas stroke arrives with instead of aliasing it away */
  const box = new Float32Array(nw * nh);
  for (let ty = 0; ty < nh; ty++) {
    const sy0 = y0 + (ty * bh) / nh;
    const sy1 = y0 + ((ty + 1) * bh) / nh;
    for (let tx = 0; tx < nw; tx++) {
      const sx0 = x0 + (tx * bw) / nw;
      const sx1 = x0 + ((tx + 1) * bw) / nw;
      let acc = 0;
      let n = 0;
      const yEnd = Math.max(Math.ceil(sy1), Math.floor(sy0) + 1);
      const xEnd = Math.max(Math.ceil(sx1), Math.floor(sx0) + 1);
      for (let y = Math.floor(sy0); y < yEnd; y++) {
        if (y < 0 || y >= h) continue;
        for (let x = Math.floor(sx0); x < xEnd; x++) {
          if (x < 0 || x >= w) continue;
          acc += src[y * w + x];
          n++;
        }
      }
      box[ty * nw + tx] = n ? acc / n : 0;
    }
  }

  let mass = 0;
  let mx = 0;
  let my = 0;
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const v = box[y * nw + x];
      mass += v;
      mx += v * (x + 0.5);
      my += v * (y + 0.5);
    }
  }
  if (mass <= 0) return false;

  const offX = Math.round(14 - mx / mass);
  const offY = Math.round(14 - my / mass);

  out.fill(0);
  for (let y = 0; y < nh; y++) {
    const dy = y + offY;
    if (dy < 0 || dy > 27) continue;
    for (let x = 0; x < nw; x++) {
      const dx = x + offX;
      if (dx < 0 || dx > 27) continue;
      out[dy * 28 + dx] = box[y * nw + x];
    }
  }
  return true;
}

/** The entire model. Skips zero inputs; a normalised digit lights about a
    seventh of the field, so most of the first matrix multiply is not needed. */
function forward(net: Net, x: Float32Array, hAct: Float32Array, probs: Float32Array) {
  for (let j = 0; j < NH; j++) hAct[j] = net.b1[j];
  for (let i = 0; i < NIN; i++) {
    const v = x[i];
    if (v <= 0) continue;
    const base = i;
    for (let j = 0; j < NH; j++) hAct[j] += net.w1[j * NIN + base] * v;
  }
  for (let j = 0; j < NH; j++) if (hAct[j] < 0) hAct[j] = 0;

  let max = -Infinity;
  for (let o = 0; o < NOUT; o++) {
    let s = net.b2[o];
    const base = o * NH;
    for (let j = 0; j < NH; j++) s += net.w2[base + j] * hAct[j];
    probs[o] = s;
    if (s > max) max = s;
  }
  let sum = 0;
  for (let o = 0; o < NOUT; o++) {
    const e = Math.exp(probs[o] - max);
    probs[o] = e;
    sum += e;
  }
  for (let o = 0; o < NOUT; o++) probs[o] /= sum;
}

/* -------------------------------------------------------------------------- */
/* small helpers                                                               */
/* -------------------------------------------------------------------------- */

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/*
 * Delegates. It used to parse `#RRGGBB` by hand and fall back to near-black,
 * which is how this plate lost its accent: the palette tokens are registered
 * with `@property`, so getComputedStyle hands back `rgb(181, 64, 47)` and the
 * hex path silently produced ink. See lib/v2/colour.ts.
 */
function rgba(css: string, alpha: number): string {
  return withAlpha(css, alpha);
}

function token(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = style.getPropertyValue(name);
  return v && v.trim() ? v.trim() : fallback;
}

/* -------------------------------------------------------------------------- */
/* link tables                                                                 */
/* -------------------------------------------------------------------------- */

/* Which wires get drawn. Recomputed once per inference, never per frame, into
   buffers allocated once. Layout is [a, b, strength 0..1, sign]. */
const HID_SHOWN = 10; /* strongest hidden units that get their inputs drawn */
const IN_PER_HID = 3;
const OUT_PER_CLASS = 4;
const LINKS_IN_MAX = HID_SHOWN * IN_PER_HID;
const LINKS_OUT_MAX = NOUT * OUT_PER_CLASS;

interface Links {
  inBuf: Float32Array;
  inCount: number;
  outBuf: Float32Array;
  outCount: number;
  /** True while the input is untouched; used to style the quiet output side. */
  resting: boolean;
}

/** Strongest contributions into the strongest hidden units, and out of them
    into each class. Contribution, not raw weight: what actually fired. */
function computeLinks(
  net: Net,
  x: Float32Array,
  hAct: Float32Array,
  order: Int32Array,
  links: Links
) {
  for (let j = 0; j < NH; j++) order[j] = j;
  order.sort((a, b) => hAct[b] - hAct[a]);

  /* --- input -> hidden --- */
  let n = 0;
  let maxIn = 1e-6;
  for (let k = 0; k < HID_SHOWN; k++) {
    const j = order[k];
    if (hAct[j] <= 0) break;
    const base = j * NIN;
    /* top few contributions, insertion sorted into a window of three */
    const bi = [-1, -1, -1];
    const bv = [0, 0, 0];
    for (let i = 0; i < NIN; i++) {
      const v = x[i];
      if (v <= 0.04) continue;
      const c = net.w1[base + i] * v;
      const m = c < 0 ? -c : c;
      if (m <= bv[2]) continue;
      if (m > bv[0]) {
        bv[2] = bv[1]; bi[2] = bi[1];
        bv[1] = bv[0]; bi[1] = bi[0];
        bv[0] = m; bi[0] = i;
      } else if (m > bv[1]) {
        bv[2] = bv[1]; bi[2] = bi[1];
        bv[1] = m; bi[1] = i;
      } else {
        bv[2] = m; bi[2] = i;
      }
    }
    for (let t = 0; t < IN_PER_HID; t++) {
      if (bi[t] < 0) continue;
      const p = n * 4;
      links.inBuf[p] = bi[t];
      links.inBuf[p + 1] = j;
      links.inBuf[p + 2] = bv[t];
      links.inBuf[p + 3] = net.w1[base + bi[t]] < 0 ? -1 : 1;
      if (bv[t] > maxIn) maxIn = bv[t];
      n++;
    }
  }
  for (let i = 0; i < n; i++) links.inBuf[i * 4 + 2] = clamp01(links.inBuf[i * 4 + 2] / maxIn);
  links.inCount = n;

  /* --- hidden -> output --- */
  let m = 0;
  let maxOut = 1e-6;
  for (let o = 0; o < NOUT; o++) {
    const base = o * NH;
    const bi = [-1, -1, -1, -1];
    const bv = [0, 0, 0, 0];
    for (let j = 0; j < NH; j++) {
      const a = hAct[j];
      if (a <= 0) continue;
      const c = net.w2[base + j] * a;
      const mag = c < 0 ? -c : c;
      if (mag <= bv[OUT_PER_CLASS - 1]) continue;
      let s = OUT_PER_CLASS - 1;
      while (s > 0 && mag > bv[s - 1]) {
        bv[s] = bv[s - 1];
        bi[s] = bi[s - 1];
        s--;
      }
      bv[s] = mag;
      bi[s] = j;
    }
    for (let t = 0; t < OUT_PER_CLASS; t++) {
      if (bi[t] < 0) continue;
      const p = m * 4;
      links.outBuf[p] = bi[t];
      links.outBuf[p + 1] = o;
      links.outBuf[p + 2] = bv[t];
      links.outBuf[p + 3] = net.w2[base + bi[t]] < 0 ? -1 : 1;
      if (bv[t] > maxOut) maxOut = bv[t];
      m++;
    }
  }
  for (let i = 0; i < m; i++) links.outBuf[i * 4 + 2] = clamp01(links.outBuf[i * 4 + 2] / maxOut);
  links.outCount = m;
  links.resting = false;
}

/**
 * The resting picture: strongest hidden-to-class weights only.
 *
 * Input-to-hidden wires intentionally stay absent until the reader draws. Raw
 * first-layer weights are not evidence about an empty input, and showing them
 * before a stroke made the input stage look pre-filled. Once ink exists,
 * computeLinks replaces this resting table with contribution-ranked wires.
 */
function restingLinks(net: Net, links: Links) {
  let m = 0;
  let maxOut = 1e-6;
  for (let o = 0; o < NOUT; o++) {
    const base = o * NH;
    const bi = [-1, -1, -1];
    const bv = [0, 0, 0];
    for (let j = 0; j < NH; j++) {
      const w = net.w2[base + j];
      const mag = w < 0 ? -w : w;
      if (mag <= bv[2]) continue;
      let s = 2;
      while (s > 0 && mag > bv[s - 1]) {
        bv[s] = bv[s - 1];
        bi[s] = bi[s - 1];
        s--;
      }
      bv[s] = mag;
      bi[s] = j;
    }
    for (let t = 0; t < 3; t++) {
      if (bi[t] < 0) continue;
      const p = m * 4;
      links.outBuf[p] = bi[t];
      links.outBuf[p + 1] = o;
      links.outBuf[p + 2] = bv[t];
      links.outBuf[p + 3] = net.w2[base + bi[t]] < 0 ? -1 : 1;
      if (bv[t] > maxOut) maxOut = bv[t];
      m++;
    }
  }
  for (let i = 0; i < m; i++) links.outBuf[i * 4 + 2] = clamp01(links.outBuf[i * 4 + 2] / maxOut);
  links.outCount = m;
  links.inCount = 0;
  links.resting = true;
}

/* -------------------------------------------------------------------------- */
/* component                                                                   */
/* -------------------------------------------------------------------------- */

export interface NeuralPlaygroundProps {
  /** Height of the network plate in CSS pixels. */
  height?: number;
  className?: string;
}

interface Reading {
  digit: number;
  p: number;
}

export default function NeuralPlayground({ height = 340, className }: NeuralPlaygroundProps) {
  const padRef = useRef<HTMLCanvasElement | null>(null);
  const diaRef = useRef<HTMLCanvasElement | null>(null);
  const diaHostRef = useRef<HTMLDivElement | null>(null);

  /* strokes are kept in normalised pad coordinates so a resize, a redraw and
     the inference raster all agree without resampling pixels */
  const strokesRef = useRef<number[][]>([]);
  const drawingRef = useRef(false);

  const netRef = useRef<Net | null>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const rasterRef = useRef<Float32Array | null>(null);

  const inputRef = useRef(new Float32Array(NIN));
  const hiddenRef = useRef(new Float32Array(NH));
  const probsRef = useRef(new Float32Array(NOUT));
  const orderRef = useRef(new Int32Array(NH));
  const linksRef = useRef<Links>({
    inBuf: new Float32Array(LINKS_IN_MAX * 4),
    inCount: 0,
    outBuf: new Float32Array(LINKS_OUT_MAX * 4),
    outCount: 0,
    resting: true
  });

  /** Set by the plate effect; lets inference wake the render loop. */
  const kickRef = useRef<(pulse: boolean) => void>(() => {});

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [holdout, setHoldout] = useState(0);
  const [bars, setBars] = useState<number[]>(() => new Array(NOUT).fill(0));
  const [reading, setReading] = useState<Reading | null>(null);

  /* ---------------------------------------------------------------- weights */
  useEffect(() => {
    let live = true;
    /* dynamic so the weight file lands in its own chunk and never blocks the
       first paint of the page it sits on */
    import('@/lib/v2/digit-weights.json')
      .then((mod) => {
        if (!live) return;
        const raw = ((mod as unknown as { default?: DigitWeights }).default ??
          (mod as unknown as DigitWeights)) as DigitWeights;
        const net: Net = {
          w1: Float32Array.from(raw.w1),
          b1: Float32Array.from(raw.b1),
          w2: Float32Array.from(raw.w2),
          b2: Float32Array.from(raw.b2),
          holdout: raw.accuracy ? raw.accuracy.holdout : 0
        };
        netRef.current = net;
        restingLinks(net, linksRef.current);
        setHoldout(net.holdout);
        setReady(true);
        kickRef.current(false);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  /* -------------------------------------------------------------- inference */
  const runInference = useCallback(() => {
    const net = netRef.current;
    if (!net) return;

    let off = offRef.current;
    if (!off) {
      off = document.createElement('canvas');
      off.width = RASTER;
      off.height = RASTER;
      offRef.current = off;
    }
    const octx = off.getContext('2d', { willReadFrequently: true });
    if (!octx) return;

    /* The pen must scale with the DRAWN digit, not with the pad.
       Training only ever saw stroke-to-glyph-box ratios of roughly 0.05 to
       0.16. Pinning the pen to the pad meant a digit drawn small arrived at a
       ratio above 0.3, which is far outside anything the net was shown, and
       accuracy fell away sharply even though the drawing looked fine. Measure
       what was actually drawn, then set the pen from that. */
    let nx0 = 1;
    let nx1 = 0;
    let ny0 = 1;
    let ny1 = 0;
    for (let s2 = 0; s2 < strokesRef.current.length; s2++) {
      const pts = strokesRef.current[s2];
      for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i];
        const y = pts[i + 1];
        if (x < nx0) nx0 = x;
        if (x > nx1) nx1 = x;
        if (y < ny0) ny0 = y;
        if (y > ny1) ny1 = y;
      }
    }
    const spanPx = Math.max(Math.max(nx1 - nx0, ny1 - ny0) * RASTER, 6);
    const pen = Math.max(2.5, Math.min(RASTER * 0.2, spanPx * STROKE_RATIO_TARGET));

    octx.clearRect(0, 0, RASTER, RASTER);
    octx.fillStyle = '#000';
    octx.strokeStyle = '#000';
    octx.lineCap = 'round';
    octx.lineJoin = 'round';
    octx.lineWidth = pen;
    paintStrokes(octx, strokesRef.current, RASTER, pen);

    let buf = rasterRef.current;
    if (!buf) {
      buf = new Float32Array(RASTER * RASTER);
      rasterRef.current = buf;
    }
    const px = octx.getImageData(0, 0, RASTER, RASTER).data;
    let inked = 0;
    let bx0 = RASTER;
    let bx1 = -1;
    let by0 = RASTER;
    let by1 = -1;
    for (let i = 0, p = 3; i < buf.length; i++, p += 4) {
      const v = px[p] / 255;
      buf[i] = v;
      if (v > 0.06) {
        inked++;
        const x = i % RASTER;
        const y = (i / RASTER) | 0;
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (y < by0) by0 = y;
        if (y > by1) by1 = y;
      }
    }
    /* a mark no bigger than the pen is a stray click, not a digit */
    const reach = Math.max(bx1 - bx0, by1 - by0);
    const tooSmall = reach < pen * 1.6;

    const input = inputRef.current;
    const hidden = hiddenRef.current;
    const probs = probsRef.current;

    if (inked < MIN_INK || tooSmall || !preprocess(buf, RASTER, RASTER, input)) {
      input.fill(0);
      hidden.fill(0);
      probs.fill(0);
      restingLinks(net, linksRef.current);
      setBars(new Array(NOUT).fill(0));
      setReading(null);
      kickRef.current(false);
      return;
    }

    forward(net, input, hidden, probs);
    computeLinks(net, input, hidden, orderRef.current, linksRef.current);

    let best = 0;
    for (let o = 1; o < NOUT; o++) if (probs[o] > probs[best]) best = o;

    const next = new Array<number>(NOUT);
    for (let o = 0; o < NOUT; o++) next[o] = probs[o];
    setBars(next);
    setReading({ digit: best, p: probs[best] });
    kickRef.current(true);
  }, []);

  /* Once the weights arrive, grade whatever is already on the pad. */
  useEffect(() => {
    if (ready && strokesRef.current.length) runInference();
  }, [ready, runInference]);

  /* -------------------------------------------------------------- the pad */
  const repaintPad = useCallback(() => {
    const c = padRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = c.width / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const ink = paletteTokens().get('--ink', '#17140F');
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const lw = size * STROKE_RATIO;
    ctx.lineWidth = lw;
    paintStrokes(ctx, strokesRef.current, size, lw);
  }, []);

  /* The pad draws in --ink, so a plate change re-inks whatever is on it. */
  useEffect(() => onPaletteChange(repaintPad), [repaintPad]);

  useEffect(() => {
    const c = padRef.current;
    if (!c) return;
    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const box = c.getBoundingClientRect();
      const side = Math.max(1, Math.round(Math.min(box.width, box.height)));
      const want = Math.round(side * dpr);
      if (c.width !== want || c.height !== want) {
        c.width = want;
        c.height = want;
      }
      repaintPad();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  }, [repaintPad]);

  const pointAt = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = padRef.current;
    if (!c) return null;
    const box = c.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return null;
    return [
      clamp01((e.clientX - box.left) / box.width),
      clamp01((e.clientY - box.top) / box.height)
    ] as const;
  }, []);

  const onDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const p = pointAt(e);
      if (!p) return;
      /* capture can throw if the pointer went away between the event and
         here, which is not a reason to lose the stroke */
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* drawing still works, it just stops tracking outside the pad */
      }
      drawingRef.current = true;
      strokesRef.current.push([p[0], p[1]]);
      repaintPad();
    },
    [pointAt, repaintPad]
  );

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const p = pointAt(e);
      if (!p) return;
      const stroke = strokesRef.current[strokesRef.current.length - 1];
      if (!stroke) return;
      const n = stroke.length;
      /* drop points the pointer barely moved for: fewer points, same shape */
      if (n >= 2) {
        const dx = p[0] - stroke[n - 2];
        const dy = p[1] - stroke[n - 1];
        if (dx * dx + dy * dy < 0.00004) return;
      }
      stroke.push(p[0], p[1]);
      repaintPad();
    },
    [pointAt, repaintPad]
  );

  const onUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* already released */
      }
      /* the one place inference runs */
      runInference();
    },
    [runInference]
  );

  const clear = useCallback(() => {
    strokesRef.current = [];
    drawingRef.current = false;
    repaintPad();
    runInference();
  }, [repaintPad, runInference]);

  /* --------------------------------------------------------- network plate */
  useEffect(() => {
    const canvas = diaRef.current;
    const host = diaHostRef.current;
    if (!canvas || !host) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    /* Re-read on every plate change: this figure is mounted at page load, when
       the sheet is the hero's, and it is READ several plates later under a
       palette that may have inverted. See lib/v2/paletteWatch.ts. */
    const C = {
      ink: '#17140F',
      ink3: '#7C7364',
      ink4: '#A79D8B',
      verm: '#B5402F',
      blue: '#2A4C7D',
      mono: '"JetBrains Mono", ui-monospace, Menlo, monospace'
    };
    /* From the snapshot paletteWatch carries, not from the document: these
       six reads used to be six forced style recalculations of a sixteen
       thousand pixel page. `--f-mono` is not a palette token and never
       changes, so it is read once at mount and left alone. */
    const readInks = (t: PaletteTokens) => {
      C.ink = t.get('--ink', '#17140F');
      C.ink3 = t.get('--ink-3', '#7C7364');
      C.ink4 = t.get('--ink-4', '#A79D8B');
      C.verm = t.get('--verm', '#B5402F');
      C.blue = t.get('--blue', '#2A4C7D');
    };
    C.mono = token(
      getComputedStyle(document.documentElement),
      '--f-mono',
      '"JetBrains Mono", ui-monospace, Menlo, monospace'
    );
    readInks(paletteTokens());

    /* eased mirrors of the true activations, so the plate settles rather than
       snapping; the numbers under the pad are never eased */
    const hShown = new Float32Array(NH);
    const pShown = new Float32Array(NOUT);
    const xShown = new Float32Array(NIN);

    let W = 0;
    let H = 0;
    let raf = 0;
    let onScreen = true;
    let pulseStart = -1;
    let disposed = false;
    let laid = false;

    /* layout, recomputed on resize only */
    const L = {
      plateX: 0,
      plateY: 0,
      plateSize: 0,
      cell: 0,
      hidX: 0,
      hidY0: 0,
      hidDy: 0,
      barMax: 0,
      outX: 0,
      outY0: 0,
      outDy: 0,
      labelY: 0
    };

    const measure = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const box = host.getBoundingClientRect();
      /* No floor here on purpose. An element that has not been laid out yet
         must not be given a made up size: the observer will call back with
         the real one, and a backing store sized to a guess stays blurry. */
      W = Math.round(box.width);
      H = Math.round(box.height);
      laid = W >= 2 && H >= 2;
      if (!laid) return;
      const want = [Math.round(W * dpr), Math.round(H * dpr)];
      if (canvas.width !== want[0] || canvas.height !== want[1]) {
        canvas.width = want[0];
        canvas.height = want[1];
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const top = 30;
      const bottom = 10;
      const avail = H - top - bottom;
      L.labelY = 16;
      L.plateSize = Math.min(avail, W * 0.32, 152);
      L.plateX = 2;
      L.plateY = top + (avail - L.plateSize) / 2;
      L.cell = L.plateSize / 28;
      L.outX = W - 30;
      const spanFrom = L.plateX + L.plateSize;
      L.hidX = spanFrom + (L.outX - spanFrom) * 0.52;
      L.barMax = Math.min(20, (L.outX - L.hidX) * 0.24);
      L.hidY0 = top + 2;
      L.hidDy = (avail - 4) / (NH - 1);
      L.outY0 = top + 10;
      L.outDy = (avail - 20) / (NOUT - 1);
    };

    const hidY = (j: number) => {
      return L.hidY0 + j * L.hidDy;
    };
    const outY = (o: number) => {
      return L.outY0 + o * L.outDy;
    };

    const draw = (now: number) => {
      const links = linksRef.current;
      ctx.clearRect(0, 0, W, H);

      /* how far the wave has travelled, in two overlapping beats */
      let waveA = -1;
      let waveB = -1;
      if (pulseStart >= 0) {
        const t = now - pulseStart;
        if (t < 560) waveA = clamp01(t / 520);
        if (t > 380) waveB = clamp01((t - 380) / 560);
        if (t > 1000) {
          pulseStart = -1;
          waveA = -1;
          waveB = -1;
        }
      }

      /* floored, so a bank decaying to rest shrinks smoothly instead of
         renormalising itself back to full length on the way down */
      let hMax = 0.05;
      for (let j = 0; j < NH; j++) if (hShown[j] > hMax) hMax = hShown[j];

      /* ---- labels ---- */
      ctx.font = `500 9px ${C.mono}`;
      ctx.fillStyle = C.ink4;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillText('INPUT 784', L.plateX, L.labelY);
      ctx.textAlign = 'center';
      ctx.fillText('HIDDEN 64', L.hidX, L.labelY);
      ctx.textAlign = 'right';
      ctx.fillText('CLASS 10', L.outX + 22, L.labelY);

      /* ---- the input plate ---- */
      ctx.strokeStyle = rgba(C.ink, 0.42);
      ctx.lineWidth = 1;
      ctx.strokeRect(
        Math.round(L.plateX) + 0.5,
        Math.round(L.plateY) + 0.5,
        Math.round(L.plateSize),
        Math.round(L.plateSize)
      );
      for (let i = 0; i < NIN; i++) {
        const v = xShown[i];
        if (v <= 0.02) continue;
        const cx = L.plateX + (i % 28) * L.cell;
        const cy = L.plateY + Math.floor(i / 28) * L.cell;
        ctx.fillStyle = rgba(C.ink, 0.1 + 0.85 * v);
        ctx.fillRect(cx, cy, L.cell + 0.4, L.cell + 0.4);
      }

      /*
       * THE RESTING STATE IS THE STATE ALMOST EVERYONE SEES, and both layers
       * are drawn in it now. See restingLinks. Quieter than the live picture
       * on purpose: a resting wire is a weight that exists, a live one is a
       * weight that just fired, and the plate should not claim the first is
       * the second.
       */
      const resting = links.resting;

      /* ---- wires: input -> hidden ---- */
      for (let k = 0; k < links.inCount; k++) {
        const p = k * 4;
        const i = links.inBuf[p];
        const j = links.inBuf[p + 1];
        const s = links.inBuf[p + 2];
        const neg = links.inBuf[p + 3] < 0;
        const ax = L.plateX + ((i % 28) + 0.5) * L.cell;
        const ay = L.plateY + (Math.floor(i / 28) + 0.5) * L.cell;
        const by = hidY(j);
        /* 0.1 to 0.52 was the old range and it is why Jack asked where the
           colours had gone. A vermilion wire at eight percent alpha is not a
           faint vermilion wire, it is a grey one: the hue survives contact
           with the paper for about a fifth of its stated strength. */
        ctx.strokeStyle = rgba(
          neg ? C.blue : C.verm,
          resting ? 0.2 + 0.34 * s : 0.26 + 0.6 * s
        );
        ctx.lineWidth = resting ? 0.6 + 0.45 * s : 0.6 + 1.35 * s;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(L.hidX, by);
        ctx.stroke();
        if (waveA >= 0 && s > 0.3 && !resting) {
          ctx.fillStyle = rgba(neg ? C.blue : C.verm, 0.85 * (1 - waveA * 0.35));
          ctx.beginPath();
          ctx.arc(ax + (L.hidX - ax) * waveA, ay + (by - ay) * waveA, 1.7, 0, TAU);
          ctx.fill();
        }
      }

      /* ---- wires: hidden -> class ---- */
      for (let k = 0; k < links.outCount; k++) {
        const p = k * 4;
        const j = links.outBuf[p];
        const o = links.outBuf[p + 1];
        const s = links.outBuf[p + 2];
        const neg = links.outBuf[p + 3] < 0;
        const ax = L.hidX + (resting ? 0 : clamp01(hShown[j] / hMax) * L.barMax);
        const ay = hidY(j);
        const by = outY(o);
        /*
         * THE RESTING STATE IS THE STATE ALMOST EVERYONE SEES.
         *
         * Jack: "The neural nets need to be more contrastive, especially when
         * inactive." At 0.05 to 0.15 alpha the resting net was not a quiet
         * net, it was an empty rectangle with a faint smudge in it, and a
         * reader who never draws a digit never learns there is a network here
         * at all. Resting is now roughly where active used to be, and active
         * has moved up to meet it.
         */
        const a = resting ? 0.22 + 0.4 * s : 0.34 + 0.56 * s;
        ctx.strokeStyle = rgba(neg ? C.blue : C.verm, a);
        ctx.lineWidth = resting ? 0.7 + 0.5 * s : 0.6 + 1.4 * s;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(L.outX - 4, by);
        ctx.stroke();
        if (waveB >= 0 && s > 0.3 && !resting) {
          ctx.fillStyle = rgba(neg ? C.blue : C.verm, 0.85);
          ctx.beginPath();
          ctx.arc(
            ax + (L.outX - 4 - ax) * waveB,
            ay + (by - ay) * waveB,
            1.7,
            0,
            TAU
          );
          ctx.fill();
        }
      }

      /* ---- the hidden bank: 64 bars, length by activation ---- */
      const barH = Math.max(1.2, L.hidDy * 0.66);
      for (let j = 0; j < NH; j++) {
        const a = clamp01(hShown[j] / hMax);
        const y = hidY(j) - barH / 2;
        ctx.fillStyle = rgba(C.ink, 0.3);
        ctx.fillRect(L.hidX - 3, y, 3, barH);
        if (a > 0.01) {
          /*
           * The bank used to be ink until a unit passed 0.62 and then flip
           * hard to vermilion, so sixty of the sixty-four bars were grey and
           * the layer had no colour in it at all. A unit is a continuous
           * quantity and it is drawn as one: cool where it is barely firing,
           * warm where it is, crossing over in the middle. That reads as a
           * bank of activations rather than as four highlighted rows.
           */
          ctx.fillStyle = rgba(a > 0.45 ? C.verm : C.blue, 0.42 + 0.55 * a);
          ctx.fillRect(L.hidX, y, Math.max(0.8, a * L.barMax), barH);
        }
      }

      /* ---- the class column ---- */
      ctx.font = `500 10px ${C.mono}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let top = 0;
      for (let o = 1; o < NOUT; o++) if (pShown[o] > pShown[top]) top = o;
      const lit = pShown[top] > 0.02;
      for (let o = 0; o < NOUT; o++) {
        const y = outY(o);
        const p = pShown[o];
        const isTop = lit && o === top;
        /* Runners-up carry the cool accent rather than plain ink, so the
           column shows the whole distribution in colour instead of one warm
           dot and nine grey ones. */
        ctx.fillStyle = rgba(isTop ? C.verm : p > 0.02 ? C.blue : C.ink, 0.3 + 0.68 * p);
        const r = 2.4 + 4.6 * p;
        ctx.beginPath();
        ctx.arc(L.outX, y, r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = isTop ? C.verm : rgba(C.ink3, 0.72 + 0.28 * p);
        ctx.fillText(String(o), L.outX + 11, y + 0.5);
      }
    };

    const frame = (now: number) => {
      raf = 0;
      if (disposed || !laid) return;

      const hTarget = hiddenRef.current;
      const pTarget = probsRef.current;
      const xTarget = inputRef.current;
      const k = reduced ? 1 : 0.2;
      let delta = 0;

      /* scale the settle test against both ends, or decaying to rest measures
         its error against nothing and the loop runs for a hundred frames */
      let tMax = 0.05;
      for (let j = 0; j < NH; j++) {
        if (hTarget[j] > tMax) tMax = hTarget[j];
        if (hShown[j] > tMax) tMax = hShown[j];
      }
      for (let j = 0; j < NH; j++) {
        const d = hTarget[j] - hShown[j];
        hShown[j] += d * k;
        const rel = d / tMax;
        if (rel > delta) delta = rel;
        else if (-rel > delta) delta = -rel;
      }
      for (let o = 0; o < NOUT; o++) {
        const d = pTarget[o] - pShown[o];
        pShown[o] += d * k;
        if (d > delta) delta = d;
        else if (-d > delta) delta = -d;
      }
      for (let i = 0; i < NIN; i++) {
        const d = xTarget[i] - xShown[i];
        xShown[i] += d * k;
        if (d > delta) delta = d;
        else if (-d > delta) delta = -d;
      }

      draw(now);

      if (delta > 0.002 || pulseStart >= 0) raf = requestAnimationFrame(frame);
    };

    const kick = (pulse: boolean) => {
      if (disposed) return;
      if (!laid) measure();
      if (!laid) return;
      if (pulse && !reduced) pulseStart = performance.now();
      if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(frame);
    };
    kickRef.current = kick;

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    measure();
    kick(false);

    const ro = new ResizeObserver(() => {
      measure();
      kick(false);
    });
    ro.observe(host);

    const io = new IntersectionObserver(
      (entries) => {
        onScreen = entries[0].isIntersecting;
        if (onScreen) kick(false);
        else stop();
      },
      { threshold: 0.01 }
    );
    io.observe(host);

    const stopPalette = onPaletteChange((t) => {
      readInks(t);
      kick(false);
    });

    const onVis = () => {
      if (document.hidden) stop();
      else kick(false);
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      disposed = true;
      stop();
      ro.disconnect();
      io.disconnect();
      stopPalette();
      document.removeEventListener('visibilitychange', onVis);
      kickRef.current = () => {};
    };
  }, []);

  /* ------------------------------------------------------------------ view */
  const pct = reading ? Math.round(reading.p * 100) : 0;

  return (
    <div className={`v2-nn${className ? ' ' + className : ''}`}>
      <div className="v2-nn-grid">
        {/* --- the pad --- */}
        <div className="v2-nn-padcol">
          {/* the canvas itself is hidden from assistive tech: it cannot be
              driven from a keyboard, so the group label and the live verdict
              below carry the meaning instead of a lie about interactivity */}
          {/* Three perches on this plate, and all three are real lines: the
              pad's own border, the 2px rule over the verdict, and the hairline
              along the top of the probability bars. Plate 01 had exactly one
              landable surface in its figure before this, which is half of what
              Jack meant by "he struggles to find a nearby surface to land on".
              See THE PERCH CONTRACT in components/v2/Companion.tsx. */}
          <div
            className="v2-nn-padwrap"
            data-perch
            role="group"
            aria-label="Digit pad. Draw one digit with a mouse or a finger, then read the result below."
          >
            <canvas
              ref={padRef}
              className="v2-nn-pad"
              aria-hidden="true"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            />
            {!reading ? (
              <p className="v2-nn-hint" aria-hidden="true">
                draw a digit
              </p>
            ) : null}
          </div>

          <div className="v2-nn-padfoot">
            <span className="v2-data">CROP / CENTRE OF MASS / 20 IN 28</span>
            <button type="button" className="v2-nn-clear" onClick={clear}>
              Clear
            </button>
          </div>

          <div className="v2-nn-verdict" data-perch>
            <span className="v2-eyebrow">Reading</span>
            <b className={reading ? 'is-lit' : undefined}>{reading ? reading.digit : '—'}</b>
            <span className="v2-nn-conf">
              {failed
                ? 'the weights did not load'
                : !ready
                ? 'loading weights'
                : reading
                ? `${pct}% confident`
                : 'nothing on the pad yet'}
            </span>
          </div>
        </div>

        {/* --- the network --- */}
        <div className="v2-nn-net">
          <div
            className="v2-nn-plate"
            ref={diaHostRef}
            style={{ height: `${height}px` }}
          >
            <canvas ref={diaRef} className="v2-nn-diagram" aria-hidden="true" />
          </div>
          <div className="v2-nn-legend v2-data">
            <span>
              <i className="is-verm" />
              positive weight
            </span>
            <span>
              <i className="is-blue" />
              negative weight
            </span>
            <span className="v2-nn-legend-note">
              strongest connections only
            </span>
          </div>
        </div>
      </div>

      {/* --- the softmax --- */}
      <ol className="v2-nn-bars" aria-label="Class probabilities" data-perch>
        {bars.map((p, d) => (
          <li key={d} className={reading && reading.digit === d ? 'is-top' : undefined}>
            <span className="v2-nn-bar" aria-hidden="true">
              <i style={{ '--p': p } as React.CSSProperties} />
            </span>
            <b>{d}</b>
            <small>{reading ? `${Math.round(p * 100)}` : '·'}</small>
          </li>
        ))}
      </ol>

      <p className="v2-nn-foot v2-data" aria-live="polite">
        {reading
          ? `READS ${reading.digit} AT ${pct}%`
          : 'RESTING / 784 - 64 RELU - 10 SOFTMAX'}
        {holdout ? ` / ${(holdout * 100).toFixed(1)}% ON HELD OUT SYNTHETIC DIGITS` : ''}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* stroke painting, shared by the pad and the inference raster                 */
/* -------------------------------------------------------------------------- */

/** Paints normalised strokes into a square context of side `size`. A stroke of
    one point is a dot: a zero length line is not reliably drawn everywhere. */
function paintStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: number[][],
  size: number,
  lw: number
) {
  for (let s = 0; s < strokes.length; s++) {
    const pts = strokes[s];
    if (pts.length < 2) continue;
    if (pts.length === 2) {
      ctx.beginPath();
      ctx.arc(pts[0] * size, pts[1] * size, lw / 2, 0, TAU);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0] * size, pts[1] * size);
    for (let i = 2; i < pts.length; i += 2) {
      ctx.lineTo(pts[i] * size, pts[i + 1] * size);
    }
    ctx.stroke();
  }
}
