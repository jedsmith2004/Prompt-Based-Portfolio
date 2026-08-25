/* ============================================================================
   train-digits.js — makes the weights that lib/v2/digit-weights.json ships.

   Run:  node scripts/train-digits.js
   This is a build-time tool, not part of the Next build. Plain CommonJS, no
   dependencies, deterministic (seeded RNG), so re-running gives the same file.

   WHY it synthesises its own data: shipping MNIST into the repo is 11MB of
   someone else's binary, and rendering digits from a font makes the training
   set depend on which fonts the build machine happens to have. Hand-authored
   strokes cost nothing, live in this file, and are the same everywhere.

   WHY the augmentation is aggressive: the visitor draws with a mouse, badly,
   at a random size, tilted. The only way a stroke-synthesised model survives
   that is if training saw the same abuse. Rotation, shear, aspect, stroke
   weight and a low-frequency wobble are all jittered per sample.

   WHY preprocess() is duplicated in components/v2/NeuralPlayground.tsx: the
   browser must see exactly the distribution training saw. The two copies are
   the same algorithm and must be changed together. This is the load-bearing
   step; without it a stroke model reads real handwriting as noise.
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

/* ----------------------------------------------------------------- seeded rng */

function mulberry32(a) {
  return function rnd() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRandom(seed) {
  const u = mulberry32(seed);
  let spare = null;
  return {
    uniform(lo, hi) {
      return lo + u() * (hi - lo);
    },
    /* Box-Muller, cached second draw. Jitter that is gaussian rather than flat
       keeps most samples near the canonical glyph and a few far from it. */
    normal(mu, sigma) {
      if (spare !== null) {
        const v = spare;
        spare = null;
        return mu + sigma * v;
      }
      let a = 0;
      let b = 0;
      while (a === 0) a = u();
      while (b === 0) b = u();
      const mag = Math.sqrt(-2 * Math.log(a));
      spare = mag * Math.sin(2 * Math.PI * b);
      return mu + sigma * mag * Math.cos(2 * Math.PI * b);
    },
    int(n) {
      return Math.floor(u() * n) % n;
    },
    unit: u
  };
}

/* ----------------------------------------------------------- stroke authoring */

/** Straight segment as a two point polyline. */
function L(ax, ay, bx, by) {
  return [[ax, ay], [bx, by]];
}

/** Quadratic bezier, sampled. n segments, n+1 points. */
function Q(ax, ay, cx, cy, bx, by, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = 1 - t;
    pts.push([
      s * s * ax + 2 * s * t * cx + t * t * bx,
      s * s * ay + 2 * s * t * cy + t * t * by
    ]);
  }
  return pts;
}

/** Ellipse arc, sampled. Angles in radians, y down. */
function E(cx, cy, rx, ry, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

/** Concatenate polylines that share an endpoint into one continuous stroke. */
function join() {
  const out = [];
  for (let i = 0; i < arguments.length; i++) {
    const seg = arguments[i];
    for (let j = 0; j < seg.length; j++) {
      if (out.length && j === 0) continue; /* drop the duplicated joint */
      out.push(seg[j]);
    }
  }
  return out;
}

const TAU = Math.PI * 2;

/* Each digit gets several hand-authored forms, because people write them
   several ways: 7 with and without a bar, 4 open and closed, 1 with and
   without a flag. Coordinates are normalised to a [0,1] box, y down. */
const GLYPHS = [
  /* 0 */ [
    [E(0.5, 0.5, 0.28, 0.42, 0, TAU, 44)],
    [E(0.5, 0.5, 0.23, 0.44, 0, TAU, 44)],
    [E(0.5, 0.5, 0.31, 0.40, 0, TAU, 44)]
  ],
  /* 1 */ [
    [L(0.5, 0.08, 0.5, 0.92)],
    [join(Q(0.32, 0.26, 0.40, 0.19, 0.5, 0.08, 8), L(0.5, 0.08, 0.5, 0.92))],
    [
      join(Q(0.32, 0.26, 0.40, 0.19, 0.5, 0.08, 8), L(0.5, 0.08, 0.5, 0.92)),
      L(0.28, 0.92, 0.72, 0.92)
    ],
    [L(0.44, 0.08, 0.56, 0.92)]
  ],
  /* 2 */ [
    [
      join(
        Q(0.20, 0.30, 0.22, 0.10, 0.46, 0.09, 10),
        Q(0.46, 0.09, 0.72, 0.08, 0.74, 0.30, 10),
        Q(0.74, 0.30, 0.74, 0.50, 0.22, 0.90, 12),
        L(0.22, 0.90, 0.82, 0.90)
      )
    ],
    [
      join(
        Q(0.22, 0.26, 0.30, 0.07, 0.52, 0.10, 10),
        Q(0.52, 0.10, 0.72, 0.14, 0.66, 0.36, 10),
        Q(0.66, 0.36, 0.58, 0.56, 0.20, 0.88, 12),
        L(0.20, 0.88, 0.80, 0.88)
      )
    ]
  ],
  /* 3 */ [
    [
      join(
        Q(0.22, 0.18, 0.34, 0.05, 0.54, 0.08, 10),
        Q(0.54, 0.08, 0.74, 0.12, 0.70, 0.30, 10),
        Q(0.70, 0.30, 0.66, 0.44, 0.44, 0.47, 8),
        Q(0.44, 0.47, 0.76, 0.46, 0.78, 0.66, 10),
        Q(0.78, 0.66, 0.80, 0.92, 0.44, 0.92, 10),
        Q(0.44, 0.92, 0.30, 0.92, 0.22, 0.83, 8)
      )
    ],
    [
      join(
        L(0.26, 0.09, 0.72, 0.09),
        Q(0.72, 0.09, 0.60, 0.30, 0.46, 0.45, 8),
        Q(0.46, 0.45, 0.78, 0.45, 0.78, 0.68, 10),
        Q(0.78, 0.68, 0.78, 0.92, 0.42, 0.91, 10),
        Q(0.42, 0.91, 0.30, 0.90, 0.24, 0.82, 6)
      )
    ]
  ],
  /* 4 */ [
    [[[0.66, 0.08], [0.16, 0.62], [0.86, 0.62]], L(0.64, 0.10, 0.64, 0.92)],
    [[[0.60, 0.10], [0.20, 0.60], [0.84, 0.60]], L(0.64, 0.32, 0.64, 0.92)],
    [[[0.62, 0.09], [0.18, 0.64], [0.82, 0.64]], L(0.60, 0.09, 0.68, 0.92)]
  ],
  /* 5 */ [
    [
      join(
        L(0.72, 0.10, 0.30, 0.10),
        L(0.30, 0.10, 0.26, 0.42),
        Q(0.26, 0.42, 0.58, 0.33, 0.72, 0.52, 10),
        Q(0.72, 0.52, 0.83, 0.78, 0.52, 0.90, 10),
        Q(0.52, 0.90, 0.34, 0.93, 0.22, 0.84, 8)
      )
    ],
    [
      L(0.70, 0.10, 0.28, 0.10),
      join(
        L(0.28, 0.10, 0.24, 0.46),
        Q(0.24, 0.46, 0.62, 0.38, 0.74, 0.58, 10),
        Q(0.74, 0.58, 0.82, 0.84, 0.48, 0.91, 10),
        Q(0.48, 0.91, 0.32, 0.92, 0.22, 0.85, 6)
      )
    ],
    /* the bowl left open at the bottom, which is how a lot of people
       actually finish a 5 in one quick stroke */
    [
      join(
        L(0.74, 0.11, 0.28, 0.10),
        L(0.28, 0.10, 0.24, 0.44),
        Q(0.24, 0.44, 0.66, 0.39, 0.75, 0.62, 10),
        Q(0.75, 0.62, 0.79, 0.88, 0.46, 0.93, 10)
      )
    ],
    [
      join(
        Q(0.76, 0.13, 0.50, 0.08, 0.30, 0.12, 8),
        L(0.30, 0.12, 0.27, 0.48),
        Q(0.27, 0.48, 0.70, 0.42, 0.76, 0.66, 10),
        Q(0.76, 0.66, 0.78, 0.90, 0.52, 0.92, 10)
      )
    ]
  ],
  /* 6 */ [
    [
      join(
        Q(0.66, 0.10, 0.40, 0.15, 0.30, 0.40, 10),
        Q(0.30, 0.40, 0.22, 0.60, 0.24, 0.72, 8),
        Q(0.24, 0.72, 0.26, 0.50, 0.50, 0.50, 10),
        Q(0.50, 0.50, 0.76, 0.50, 0.76, 0.71, 10),
        Q(0.76, 0.71, 0.76, 0.92, 0.50, 0.92, 10),
        Q(0.50, 0.92, 0.27, 0.92, 0.24, 0.73, 8)
      )
    ],
    [
      join(
        Q(0.70, 0.09, 0.36, 0.20, 0.28, 0.52, 10),
        Q(0.24, 0.66, 0.26, 0.78, 0.30, 0.85, 6),
        Q(0.38, 0.94, 0.62, 0.94, 0.70, 0.82, 10),
        Q(0.78, 0.68, 0.68, 0.54, 0.50, 0.54, 10),
        Q(0.36, 0.54, 0.28, 0.62, 0.26, 0.70, 8)
      )
    ]
  ],
  /* 7 */ [
    [[[0.18, 0.10], [0.80, 0.10], [0.38, 0.92]]],
    [[[0.18, 0.10], [0.80, 0.10], [0.38, 0.92]], L(0.32, 0.53, 0.66, 0.49)],
    [[[0.20, 0.12], [0.78, 0.09], [0.46, 0.92]]],
    [join(L(0.20, 0.11, 0.80, 0.11), Q(0.80, 0.11, 0.56, 0.48, 0.40, 0.92, 10))]
  ],
  /* 8 */ [
    [E(0.5, 0.27, 0.22, 0.20, 0, TAU, 32), E(0.5, 0.71, 0.27, 0.22, 0, TAU, 32)],
    [E(0.5, 0.28, 0.19, 0.22, 0, TAU, 32), E(0.5, 0.72, 0.25, 0.21, 0, TAU, 32)],
    [E(0.48, 0.26, 0.24, 0.21, 0, TAU, 32), E(0.52, 0.72, 0.26, 0.23, 0, TAU, 32)]
  ],
  /* 9 */ [
    [
      join(
        E(0.5, 0.30, 0.24, 0.23, 0, TAU, 32),
        Q(0.74, 0.30, 0.73, 0.66, 0.58, 0.86, 10),
        Q(0.58, 0.86, 0.52, 0.92, 0.42, 0.93, 6)
      )
    ],
    [E(0.5, 0.29, 0.22, 0.22, 0, TAU, 32), L(0.72, 0.29, 0.66, 0.92)],
    [
      join(
        E(0.52, 0.28, 0.25, 0.21, 0, TAU, 32),
        Q(0.77, 0.28, 0.76, 0.72, 0.60, 0.92, 12)
      )
    ]
  ]
];

/* ------------------------------------------------------------- rasterisation */

const RAST = 72;   /* render resolution before the MNIST-style normalisation */
const PAD = 10;    /* keeps a rotated glyph inside the buffer */
const SPAN = RAST - 2 * PAD;

/** Soft disc stamped with max(), so overlapping stamps do not build up. */
function stamp(buf, x, y, r) {
  const x0 = Math.max(0, Math.floor(x - r - 1));
  const x1 = Math.min(RAST - 1, Math.ceil(x + r + 1));
  const y0 = Math.max(0, Math.floor(y - r - 1));
  const y1 = Math.min(RAST - 1, Math.ceil(y + r + 1));
  for (let iy = y0; iy <= y1; iy++) {
    const dy = iy + 0.5 - y;
    for (let ix = x0; ix <= x1; ix++) {
      const dx = ix + 0.5 - x;
      const d = Math.sqrt(dx * dx + dy * dy);
      let v = r + 0.5 - d; /* one pixel of feather, like canvas antialiasing */
      if (v <= 0) continue;
      if (v > 1) v = 1;
      const k = iy * RAST + ix;
      if (v > buf[k]) buf[k] = v;
    }
  }
}

function rasterise(strokes, radius) {
  const buf = new Float32Array(RAST * RAST);
  for (let s = 0; s < strokes.length; s++) {
    const pts = strokes[s];
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = PAD + pts[i][0] * SPAN;
      const ay = PAD + pts[i][1] * SPAN;
      const bx = PAD + pts[i + 1][0] * SPAN;
      const by = PAD + pts[i + 1][1] * SPAN;
      const len = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(1, Math.ceil(len / 0.6));
      for (let t = 0; t <= steps; t++) {
        const f = t / steps;
        stamp(buf, ax + (bx - ax) * f, ay + (by - ay) * f, radius);
      }
    }
  }
  return buf;
}

/* --------------------------------------------------------------- augmentation */

/** Copy a glyph with a smooth wobble, an affine warp, and a stroke weight.
    `k` scales every jitter at once, so the stress set can be generated by the
    same code as the training set rather than by a second, hand-tuned one. */
function warp(strokes, rng, k) {
  const th = Math.max(-0.42, Math.min(0.42, rng.normal(0, 0.17 * k))); /* radians */
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const shear = rng.normal(0, 0.15 * k);
  const sx = 1 + (rng.uniform(-0.26, 0.20) * k);
  const sy = 1 + (rng.uniform(-0.20, 0.18) * k);
  const tx = rng.normal(0, 0.02);
  const ty = rng.normal(0, 0.02);

  /* low frequency wobble: the pen wanders along the stroke rather than
     shaking, which is what human handwriting actually does */
  const f1 = rng.uniform(1.2, 3.4);
  const f2 = rng.uniform(2.0, 5.0);
  const p1 = rng.uniform(0, TAU);
  const p2 = rng.uniform(0, TAU);
  const a1 = rng.uniform(0.0, 0.046) * k;
  const a2 = rng.uniform(0.0, 0.028) * k;
  const grain = 0.007 * k; /* pointer-sampling chatter */

  const out = [];
  for (let s = 0; s < strokes.length; s++) {
    let src = strokes[s];
    /* people undershoot and overshoot the end of a stroke */
    if (src.length > 8 && rng.unit() < 0.3 * k) {
      const cut = 1 + rng.int(Math.max(1, Math.round(src.length * 0.07)));
      src = rng.unit() < 0.5 ? src.slice(cut) : src.slice(0, src.length - cut);
    }
    const dst = new Array(src.length);
    for (let i = 0; i < src.length; i++) {
      const u = src.length > 1 ? i / (src.length - 1) : 0;
      let x = src[i][0] + a1 * Math.sin(f1 * u * TAU + p1) + rng.normal(0, grain);
      let y = src[i][1] + a2 * Math.sin(f2 * u * TAU + p2) + rng.normal(0, grain);

      x -= 0.5;
      y -= 0.5;
      x += shear * -y;      /* italic lean */
      x *= sx;
      y *= sy;
      const rx = x * cos - y * sin;
      const ry = x * sin + y * cos;
      dst[i] = [rx + 0.5 + tx, ry + 0.5 + ty];
    }
    out[s] = dst;
  }
  return out;
}

/* ------------------------------------------------------- MNIST normalisation
   Crop to the ink, scale the long side to 20, then shift so the centre of mass
   sits at the centre of a 28x28 field. Twin of the browser copy. */

function preprocess(src, w, h) {
  const THRESH = 0.06;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (src[y * w + x] > THRESH) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null; /* no ink */

  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const k = 20 / Math.max(bw, bh);
  const nw = Math.max(1, Math.min(20, Math.round(bw * k)));
  const nh = Math.max(1, Math.min(20, Math.round(bh * k)));

  /* area average, which is the right filter for a downscale and matches the
     soft edges a canvas stroke arrives with */
  const box = new Float32Array(nw * nh);
  for (let ty = 0; ty < nh; ty++) {
    const sy0 = y0 + (ty * bh) / nh;
    const sy1 = y0 + ((ty + 1) * bh) / nh;
    for (let tx = 0; tx < nw; tx++) {
      const sx0 = x0 + (tx * bw) / nw;
      const sx1 = x0 + ((tx + 1) * bw) / nw;
      let acc = 0;
      let n = 0;
      for (let y = Math.floor(sy0); y < Math.max(Math.ceil(sy1), Math.floor(sy0) + 1); y++) {
        if (y < 0 || y >= h) continue;
        for (let x = Math.floor(sx0); x < Math.max(Math.ceil(sx1), Math.floor(sx0) + 1); x++) {
          if (x < 0 || x >= w) continue;
          acc += src[y * w + x];
          n++;
        }
      }
      box[ty * nw + tx] = n ? acc / n : 0;
    }
  }

  /* centre of mass of the scaled box, then place it at (14, 14) */
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
  if (mass <= 0) return null;
  const offX = Math.round(14 - mx / mass);
  const offY = Math.round(14 - my / mass);

  const out = new Float32Array(784);
  for (let y = 0; y < nh; y++) {
    const dy = y + offY;
    if (dy < 0 || dy > 27) continue;
    for (let x = 0; x < nw; x++) {
      const dx = x + offX;
      if (dx < 0 || dx > 27) continue;
      out[dy * 28 + dx] = box[y * nw + x];
    }
  }
  return out;
}

/* ------------------------------------------------------------- dataset build */

function makeSample(digit, rng, k) {
  const forms = GLYPHS[digit];
  const strokes = warp(forms[rng.int(forms.length)], rng, k);
  const radius = rng.uniform(1.4, 4.2); /* stroke width 0.05 to 0.16 of the box */
  const img = preprocess(rasterise(strokes, radius), RAST, RAST);
  if (!img) return null;

  /* a few stray marks on some samples, so a smudge does not flip the answer */
  if (rng.unit() < 0.30) {
    const n = 2 + rng.int(6);
    for (let i = 0; i < n; i++) {
      const k = rng.int(784);
      const v = img[k] + rng.uniform(0.1, 0.45);
      img[k] = v > 1 ? 1 : v;
    }
  }
  /* global ink weight, since some people press harder than others */
  const gain = rng.uniform(0.85, 1.0);
  for (let i = 0; i < 784; i++) img[i] *= gain;
  return img;
}

function buildSet(perDigit, seed, k) {
  const rng = makeRandom(seed);
  const n = perDigit * 10;
  const X = new Float32Array(n * 784);
  const Y = new Uint8Array(n);
  let w = 0;
  for (let d = 0; d < 10; d++) {
    for (let i = 0; i < perDigit; i++) {
      let img = null;
      while (!img) img = makeSample(d, rng, k);
      X.set(img, w * 784);
      Y[w] = d;
      w++;
    }
  }
  return { X: X, Y: Y, n: n };
}

/* ------------------------------------------------------------------ the model
   784 -> 64 ReLU -> 10 softmax, cross entropy, SGD with momentum.
   The forward pass and the W1 gradient both skip zero inputs; a normalised
   digit lights maybe 15% of the field, so that is most of the work saved. */

const NIN = 784;
const NH = 64;
const NOUT = 10;

function makeModel(seed) {
  const rng = makeRandom(seed);
  const W1 = new Float32Array(NH * NIN);
  const b1 = new Float32Array(NH);
  const W2 = new Float32Array(NOUT * NH);
  const b2 = new Float32Array(NOUT);
  const s1 = Math.sqrt(2 / NIN);
  const s2 = Math.sqrt(2 / NH);
  for (let i = 0; i < W1.length; i++) W1[i] = rng.normal(0, s1);
  for (let i = 0; i < W2.length; i++) W2[i] = rng.normal(0, s2);
  return { W1: W1, b1: b1, W2: W2, b2: b2 };
}

/* scratch, allocated once */
const hPre = new Float32Array(NH);
const hAct = new Float32Array(NH);
const logits = new Float32Array(NOUT);
const probs = new Float32Array(NOUT);
const dh = new Float32Array(NH);
const nzIdx = new Int32Array(NIN);

function forward(m, X, off) {
  let nz = 0;
  for (let i = 0; i < NIN; i++) {
    if (X[off + i] > 0) nzIdx[nz++] = i;
  }
  for (let j = 0; j < NH; j++) hPre[j] = m.b1[j];
  for (let k = 0; k < nz; k++) {
    const i = nzIdx[k];
    const v = X[off + i];
    for (let j = 0; j < NH; j++) hPre[j] += m.W1[j * NIN + i] * v;
  }
  for (let j = 0; j < NH; j++) hAct[j] = hPre[j] > 0 ? hPre[j] : 0;

  let max = -Infinity;
  for (let o = 0; o < NOUT; o++) {
    let s = m.b2[o];
    const base = o * NH;
    for (let j = 0; j < NH; j++) s += m.W2[base + j] * hAct[j];
    logits[o] = s;
    if (s > max) max = s;
  }
  let sum = 0;
  for (let o = 0; o < NOUT; o++) {
    const e = Math.exp(logits[o] - max);
    probs[o] = e;
    sum += e;
  }
  for (let o = 0; o < NOUT; o++) probs[o] /= sum;
  return nz;
}

function argmaxProbs() {
  let best = 0;
  for (let o = 1; o < NOUT; o++) if (probs[o] > probs[best]) best = o;
  return best;
}

function accuracy(m, set) {
  let hit = 0;
  for (let s = 0; s < set.n; s++) {
    forward(m, set.X, s * 784);
    if (argmaxProbs() === set.Y[s]) hit++;
  }
  return hit / set.n;
}

function train(m, set, opts) {
  const vW1 = new Float32Array(m.W1.length);
  const vb1 = new Float32Array(m.b1.length);
  const vW2 = new Float32Array(m.W2.length);
  const vb2 = new Float32Array(m.b2.length);
  const order = new Int32Array(set.n);
  for (let i = 0; i < set.n; i++) order[i] = i;
  const rng = makeRandom(opts.seed);
  const mom = 0.9;

  for (let epoch = 0; epoch < opts.epochs; epoch++) {
    /* Fisher-Yates, so batches are not digit-ordered */
    for (let i = set.n - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }
    /* cosine decay: large steps to find the basin, small ones to settle in */
    const lr =
      opts.lr * (0.5 * (1 + Math.cos((Math.PI * epoch) / opts.epochs)) * 0.95 + 0.05);
    let loss = 0;

    for (let s = 0; s < set.n; s++) {
      const idx = order[s];
      const off = idx * 784;
      const nz = forward(m, set.X, off);
      const y = set.Y[idx];
      loss -= Math.log(Math.max(probs[y], 1e-9));

      /* dL/dlogits for softmax + cross entropy, against a smoothed target.
         Smoothing is not just regularisation here: without it the softmax
         saturates and the output bars read 100% for every input, including
         the wrong ones. The visitor is shown these numbers, so they have to
         mean something. */
      const hot = 1 - opts.smooth + opts.smooth / NOUT;
      const cold = opts.smooth / NOUT;
      for (let o = 0; o < NOUT; o++) probs[o] -= o === y ? hot : cold;

      for (let j = 0; j < NH; j++) dh[j] = 0;
      for (let o = 0; o < NOUT; o++) {
        const g = probs[o];
        if (g === 0) continue;
        const base = o * NH;
        for (let j = 0; j < NH; j++) {
          dh[j] += m.W2[base + j] * g;
          vW2[base + j] = mom * vW2[base + j] - lr * (g * hAct[j] + opts.decay * m.W2[base + j]);
        }
        vb2[o] = mom * vb2[o] - lr * g;
      }
      for (let o = 0; o < NOUT; o++) m.b2[o] += vb2[o];
      for (let i = 0; i < vW2.length; i++) m.W2[i] += vW2[i];

      for (let j = 0; j < NH; j++) {
        if (hPre[j] <= 0) dh[j] = 0; /* ReLU gate */
      }
      for (let j = 0; j < NH; j++) {
        const g = dh[j];
        vb1[j] = mom * vb1[j] - lr * g;
        m.b1[j] += vb1[j];
        if (g === 0) continue;
        const base = j * NIN;
        for (let k = 0; k < nz; k++) {
          const i = nzIdx[k];
          const gi = g * set.X[off + i];
          const w = base + i;
          vW1[w] = mom * vW1[w] - lr * gi;
          m.W1[w] += vW1[w];
        }
      }
      /* decay on W1 is applied per epoch rather than per sample: touching all
         50k weights every step would dominate the runtime for no benefit */
    }

    const keep = 1 - opts.decay * 8;
    for (let i = 0; i < m.W1.length; i++) m.W1[i] *= keep;

    if (opts.verbose) {
      process.stdout.write(
        '  epoch ' +
          String(epoch + 1).padStart(2, ' ') +
          '/' +
          opts.epochs +
          '  loss ' +
          (loss / set.n).toFixed(4) +
          '  lr ' +
          lr.toFixed(4) +
          '\n'
      );
    }
  }
}

/* ------------------------------------------------------------------- main */

function round4(x) {
  const v = Math.round(x * 1e4) / 1e4;
  return v === 0 ? 0 : v; /* kill -0 */
}

function main() {
  const t0 = Date.now();
  process.stdout.write('synthesising strokes\n');
  const train0 = buildSet(700, 20260824, 1);
  const holdout = buildSet(150, 99117, 1);
  /* Unseen seed AND heavier distortion than anything trained on. A visitor
     with a mouse is worse than the training set, so this is the number that
     actually predicts how the pad will feel. */
  const stress = buildSet(150, 5150087, 1.6);
  process.stdout.write(
    '  train ' +
      train0.n +
      '  holdout ' +
      holdout.n +
      '  stress ' +
      stress.n +
      '  (' +
      (Date.now() - t0) +
      ' ms)\n'
  );

  process.stdout.write('training 784 -> 64 relu -> 10 softmax\n');
  const model = makeModel(4242);
  train(model, train0, { epochs: 26, lr: 0.01, decay: 2.5e-5, smooth: 0.08, seed: 7, verbose: true });

  /* Prune weights that are doing nothing. The border of the field is never
     inked once the digit is normalised into a 20x20 box, so those rows carry
     no signal, and zeros cost one byte each in the JSON. */
  let pruned = 0;
  for (let i = 0; i < model.W1.length; i++) {
    if (Math.abs(model.W1[i]) < 0.006) {
      model.W1[i] = 0;
      pruned++;
    }
  }

  const accTrain = accuracy(model, train0);
  const accHold = accuracy(model, holdout);
  const accStress = accuracy(model, stress);

  const out = {
    note:
      'Generated by scripts/train-digits.js. 784-64-10 MLP, ReLU then softmax, ' +
      'trained on synthesised stroke renderings of the digits 0-9.',
    arch: [NIN, NH, NOUT],
    accuracy: { train: round4(accTrain), holdout: round4(accHold), stress: round4(accStress) },
    samples: { train: train0.n, holdout: holdout.n, stress: stress.n },
    w1: Array.prototype.map.call(model.W1, round4),
    b1: Array.prototype.map.call(model.b1, round4),
    w2: Array.prototype.map.call(model.W2, round4),
    b2: Array.prototype.map.call(model.b2, round4)
  };

  const dest = path.join(__dirname, '..', 'lib', 'v2', 'digit-weights.json');
  fs.writeFileSync(dest, JSON.stringify(out));
  const kb = (fs.statSync(dest).size / 1024).toFixed(0);

  process.stdout.write('\n');
  process.stdout.write('train accuracy    ' + (accTrain * 100).toFixed(2) + '%\n');
  process.stdout.write('holdout accuracy  ' + (accHold * 100).toFixed(2) + '%\n');
  process.stdout.write('stress accuracy   ' + (accStress * 100).toFixed(2) + '%  (1.6x jitter)\n');
  process.stdout.write('per digit         ');
  for (let d = 0; d < 10; d++) {
    let hit = 0;
    let tot = 0;
    for (let s = 0; s < stress.n; s++) {
      if (stress.Y[s] !== d) continue;
      tot++;
      forward(model, stress.X, s * 784);
      if (argmaxProbs() === d) hit++;
    }
    process.stdout.write(d + ':' + Math.round((hit / tot) * 100) + '% ');
  }
  process.stdout.write('\n');
  process.stdout.write(
    'pruned            ' + pruned + ' / ' + model.W1.length + ' first layer weights\n'
  );
  process.stdout.write('wrote             ' + dest + '  (' + kb + ' kB)\n');
  process.stdout.write('elapsed           ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s\n');
}

main();
