'use client';

import { useEffect, useRef } from 'react';
import type { BackdropProps } from './types';
import { backdropDpr } from './types';

/* --------------------------------------------------------------------------
 * Watercolour — loose botanical studies, already on the sheet.
 *
 * The subject is plants: a stalk laid in as one confident stroke, leaves and
 * petals as lobed washes, a few committing ink marks, a scatter of stamens.
 * Nothing is abstract; every mark belongs to something that grew.
 *
 * Three ideas do the work.
 *
 * 1. THE SHEET IS NEVER BLANK. Setup paints two and a half passes into the
 *    buffer before the first frame is composited, so a reader arriving mid-page
 *    finds a painting, not an empty page. `progress` then revises it: fresh
 *    passes are laid over the top of the old ones, which is why the sheet keeps
 *    a history rather than resetting.
 *
 * 2. EVERY WASH IS A SHAPE WITH A SPINE. A petal or a leaf is generated as an
 *    outline paired with the centre line it hangs off, and it is painted the way
 *    a loaded brush is actually swept — in passes running *along* the length,
 *    between spine and outline. The outermost of those passes is the outline
 *    itself, drawn at several times the strength of the fill: pigment collecting
 *    at the boundary is the whole difference between watercolour and airbrush,
 *    so the edge is deliberately the boldest thing in the mark.
 *
 * 3. OVERLAPS DARKEN. Washes composite in multiply on a light ground and screen
 *    on a dark one, so wet colour over dry colour reads as a third, deeper value
 *    and you can see the order the painting was made in. Which way round to go
 *    is decided from the surface luminance, never hardcoded.
 *
 * The buffer is persistent and never cleared per frame; each frame only lays
 * down the few millimetres of stroke the hand got through since the last one.
 * Nothing is allocated once the loop is running.
 * -------------------------------------------------------------------------- */

const MAX_MARKS = 76;
const MAX_PTS = 56;
const STRIDE = 4; // per point: outline x, outline y, spine x, spine y
const PLANTS = 3;
const PLANT_F = 10; // hx, hy, gx, gy, cx, cy, petalCol, leafCol, headR, seed

const KIND_PENCIL = 0;
const KIND_WASH = 1;
const KIND_STEM = 2;
const KIND_INK = 3;
const KIND_DOT = 4;

const DAB = 72; // px of each pre-rendered pigment sprite
const GRAIN = 128; // px of the repeating paper-tooth tile
const MAX_SEG_PER_FRAME = 340; // hard ceiling so a scroll fling cannot stall a frame
const MAX_BUFFER_PX = 3.1e6; // caps fill cost on very large / very dense displays

/* Two disagreeing probe values used only to test whether a palette string parsed.
   Neither is ever a drawing colour and neither reaches the visible canvas; they
   exist purely so a silently-rejected fillStyle can be detected. See readColours. */
const PROBE_A = '#000000';
const PROBE_B = '#ffffff';

/** Smooth 1-D value noise. Hand-drawn lines wander at low frequency, not per-pixel. */
function hashi(i: number, s: number): number {
  const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return v - Math.floor(v);
}
function vnoise(x: number, s: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hashi(i, s);
  const b = hashi(i + 1, s);
  return a + (b - a) * u;
}

/**
 * Pressure along a stroke. A brush is dry as it lands, floods through the middle
 * and unloads before the hand lifts — never a constant width, never a clean stop.
 */
function pressure(u: number, seed: number): number {
  const uu = u < 0 ? 0 : u > 1 ? 1 : u;
  const env = Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + uu * 0.97)), 0.45);
  return env * (0.68 + 0.58 * vnoise(uu * 5 + seed * 7, seed));
}

export default function Watercolour({ intensity, progress, velocity, palette, className }: BackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Live props, read by the loop. Kept in a ref so prop churn never restarts setup.
  const live = useRef({ intensity, progress, velocity, palette });
  const staticMode = useRef(false);
  const repaint = useRef<(() => void) | null>(null);

  useEffect(() => {
    const p = live.current;
    p.intensity = intensity;
    p.progress = progress;
    p.velocity = velocity;
    p.palette = palette;
    // Under reduced motion there is no loop, so React is the only thing that can
    // re-composite when intensity or palette move.
    if (staticMode.current) repaint.current?.();
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /* ---------------- persistent surfaces ---------------- */

    const buf = document.createElement('canvas');
    const bctx = buf.getContext('2d');
    if (!bctx) return;

    const grainTile = document.createElement('canvas');
    grainTile.width = GRAIN;
    grainTile.height = GRAIN;
    const gctx = grainTile.getContext('2d');
    if (!gctx) return;

    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    if (!pctx) return;

    const dabs: HTMLCanvasElement[] = [];
    const dabCtx: CanvasRenderingContext2D[] = [];
    for (let i = 0; i < 5; i++) {
      const c = document.createElement('canvas');
      c.width = DAB;
      c.height = DAB;
      const cc = c.getContext('2d');
      if (!cc) return;
      dabs.push(c);
      dabCtx.push(cc);
    }

    /* ---------------- preallocated plan storage ----------------
     * Everything the composition needs lives here. Rebuilding a pass overwrites
     * these in place; not one byte is allocated once the loop is running. */

    const pts = new Float32Array(MAX_MARKS * MAX_PTS * STRIDE);
    const curv = new Float32Array(MAX_MARKS * MAX_PTS);
    const markN = new Int32Array(MAX_MARKS);
    const markSeg = new Int32Array(MAX_MARKS);
    const markKind = new Uint8Array(MAX_MARKS);
    const markCol = new Uint8Array(MAX_MARKS);
    const markW = new Float32Array(MAX_MARKS);
    const markA = new Float32Array(MAX_MARKS);
    const markRim = new Float32Array(MAX_MARKS);
    const markCost = new Float32Array(MAX_MARKS);
    const markSeed = new Float32Array(MAX_MARKS);
    const plant = new Float32Array(PLANTS * PLANT_F);
    const rgb = new Uint8Array(15);
    // Placeholders only. readColours() overwrites all five from the palette before
    // anything is drawn, and resize() calls it before the first mark is laid down.
    const colStr: string[] = ['#000', '#000', '#000', '#000', '#000'];
    const lastPal: string[] = ['', '', '', '', ''];

    let alphaScale = 1;
    // Which way wet-over-dry has to go for overlaps to read as *more* pigment.
    let blendOp: GlobalCompositeOperation = 'multiply';
    let markCount = 0;
    let passCost = 1;
    let cur = 0; // mark being laid down
    let pos = 0; // float segment position within it
    let passIndex = 0;
    let veilFrames = 0;

    let W = 0;
    let H = 0;
    let scale = 1;
    let grainPattern: CanvasPattern | null = null;

    let raf = 0;
    let visible = true;
    let running = false;
    let last = 0;
    let prevProgress = live.current.progress;
    let smoothVel = 0;
    let dirBias = 0;
    let parX = 0;
    let parY = 0;

    // Scratch outputs for the curve helpers, so sampling a stem allocates nothing.
    let qpx = 0;
    let qpy = 0;
    let qang = 0;

    /* ---------------- cheap non-allocating PRNG ---------------- */
    let rstate = 1;
    const seedRnd = (n: number) => {
      rstate = (n >>> 0) || 1;
    };
    const rnd = () => {
      rstate = (Math.imul(rstate, 1664525) + 1013904223) >>> 0;
      return rstate / 4294967296;
    };

    /* ---------------- palette ---------------- */

    const src: string[] = ['', '', '', '', ''];

    /**
     * Resolve the five palette strings to numeric channels.
     *
     * Called only on setup, resize and theme swap — never from a frame — because
     * getImageData allocates and the loop is required not to.
     *
     * The two-sentinel dance is load bearing. Canvas silently ignores a fillStyle
     * it cannot parse, leaving whatever was set before, so assigning the palette
     * string proves nothing about whether it took. Writing two *different* probe
     * values first and checking both reads agree is the only way to know the entry
     * really applied. That matters more here than usual: a silent failure would
     * not degrade, it would paint every mark in a colour outside the palette, on
     * a page whose whole contract is that it re-themes.
     */
    function readColours(): void {
      const p = live.current.palette;
      src[0] = p.surface;
      src[1] = p.ink;
      src[2] = p.ink2;
      src[3] = p.accent;
      src[4] = p.accent2;
      for (let i = 0; i < 5; i++) {
        pctx!.clearRect(0, 0, 1, 1);
        pctx!.fillStyle = PROBE_A;
        pctx!.fillStyle = src[i];
        pctx!.fillRect(0, 0, 1, 1);
        const d1 = pctx!.getImageData(0, 0, 1, 1).data;
        const r1 = d1[0];
        const g1 = d1[1];
        const b1 = d1[2];
        pctx!.clearRect(0, 0, 1, 1);
        pctx!.fillStyle = PROBE_B;
        pctx!.fillStyle = src[i];
        pctx!.fillRect(0, 0, 1, 1);
        const d2 = pctx!.getImageData(0, 0, 1, 1).data;
        const ok = d2[0] === r1 && d2[1] === g1 && d2[2] === b1;
        // An unparseable entry falls back to the surface colour rather than to
        // any invented one: a mark drawn in the ground is merely invisible, which
        // is the only failure a backdrop is allowed to have.
        rgb[i * 3] = ok ? r1 : rgb[0];
        rgb[i * 3 + 1] = ok ? g1 : rgb[1];
        rgb[i * 3 + 2] = ok ? b1 : rgb[2];
        colStr[i] = ok ? 'rgb(' + r1 + ',' + g1 + ',' + b1 + ')' : colStr[0];
        // Always the string we were handed, never the substitute: this is what
        // paletteChanged() diffs against, and recording anything else would make
        // it report a change on every single frame.
        lastPal[i] = src[i];
      }
      // A pale wash that reads clearly on paper all but disappears on a dark
      // ground, so pigment is laid on more heavily the darker the sheet is.
      const lum = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) / 255;
      alphaScale = 1 + 0.8 * (1 - lum) * (1 - lum);
      // On paper, a second wash over a first should go darker; on a dark sheet
      // the marks are the light thing, so accumulating pigment has to go lighter
      // or every overlap would punch a hole in the painting.
      blendOp = lum > 0.5 ? 'multiply' : 'screen';
    }

    function paletteChanged(): boolean {
      const p = live.current.palette;
      return (
        lastPal[0] !== p.surface ||
        lastPal[1] !== p.ink ||
        lastPal[2] !== p.ink2 ||
        lastPal[3] !== p.accent ||
        lastPal[4] !== p.accent2
      );
    }

    /** Pigment sprites: a soft radial load with its rim eaten away, so every dab
     *  lands with the uneven, granular edge of pigment settling into tooth. */
    function buildDabs(): void {
      for (let i = 0; i < 5; i++) {
        const g = dabCtx[i];
        const r = rgb[i * 3];
        const gr = rgb[i * 3 + 1];
        const b = rgb[i * 3 + 2];
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'source-over';
        g.clearRect(0, 0, DAB, DAB);
        const c = DAB * 0.5;
        // Flat through the middle rather than gaussian: a gaussian dab stacks up
        // into airbrush, and watercolour is flat pigment with a broken edge.
        const grad = g.createRadialGradient(c, c, 0, c, c, c);
        grad.addColorStop(0, 'rgba(' + r + ',' + gr + ',' + b + ',0.9)');
        grad.addColorStop(0.52, 'rgba(' + r + ',' + gr + ',' + b + ',0.78)');
        grad.addColorStop(0.84, 'rgba(' + r + ',' + gr + ',' + b + ',0.34)');
        grad.addColorStop(1, 'rgba(' + r + ',' + gr + ',' + b + ',0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, DAB, DAB);

        g.globalCompositeOperation = 'destination-out';
        seedRnd(9173 + i * 77);
        // Bite lumps out of the rim, then freckle the interior, so pigment sits
        // in tooth instead of covering evenly.
        for (let k = 0; k < 130; k++) {
          const a = rnd() * Math.PI * 2;
          const rr = c * (0.68 + 0.42 * rnd());
          g.globalAlpha = 0.35 + rnd() * 0.65;
          g.beginPath();
          g.arc(c + Math.cos(a) * rr, c + Math.sin(a) * rr, 2 + rnd() * 7, 0, Math.PI * 2);
          g.fill();
        }
        for (let k = 0; k < 300; k++) {
          const a = rnd() * Math.PI * 2;
          const rr = c * 0.75 * Math.sqrt(rnd());
          g.globalAlpha = 0.06 + rnd() * 0.24;
          g.beginPath();
          g.arc(c + Math.cos(a) * rr, c + Math.sin(a) * rr, 0.8 + rnd() * 2.6, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
    }

    /** Paper tooth. Two-tone speckle so the grain reads as fibre, not as noise. */
    function buildGrain(): void {
      gctx!.setTransform(1, 0, 0, 1, 0, 0);
      gctx!.clearRect(0, 0, GRAIN, GRAIN);
      seedRnd(4421);
      for (let k = 0; k < 2600; k++) {
        const i = rnd() < 0.62 ? 2 : 0;
        gctx!.fillStyle = colStr[i];
        gctx!.globalAlpha = 0.06 + rnd() * 0.5;
        const x = rnd() * GRAIN;
        const y = rnd() * GRAIN;
        const w = 0.6 + rnd() * 1.9;
        gctx!.fillRect(x, y, w, w * (0.6 + rnd() * 0.9));
      }
      gctx!.globalAlpha = 1;
      grainPattern = ctx!.createPattern(grainTile, 'repeat');
    }

    /* ---------------- where a mark is allowed to be loud ---------------- */

    /**
     * The reading zone. Text runs as a tall column through the middle of the
     * frame, so pigment is suppressed right across that band rather than merely
     * thinned overall — the plants grow in the margins and only their outermost
     * leaves drift inward, dissolving as they go. Everything multiplies by this.
     */
    function centreFade(x: number, y: number): number {
      const dx = Math.abs(x / W - 0.5) * 2;
      const dy = Math.abs(y / H - 0.5) * 2;
      const ex = (dx - 0.4) / 0.46;
      const ey = (dy - 0.74) / 0.26;
      let f = ex > ey ? ex : ey;
      if (f < 0) f = 0;
      else if (f > 1) f = 1;
      return 0.05 + 0.95 * (f * f * (3 - 2 * f));
    }

    /**
     * How far into the side margins a point sits, ignoring height. Ink is the only
     * mark here with real contrast, so it is allowed to commit only out at the
     * left and right edges — never in the vertical band the text column runs
     * through, including the strips above and below it.
     */
    function marginFade(x: number): number {
      let f = (Math.abs(x / W - 0.5) * 2 - 0.52) / 0.3;
      if (f < 0) f = 0;
      else if (f > 1) f = 1;
      return f * f * (3 - 2 * f);
    }

    /* ---------------- geometry helpers ---------------- */

    /** Point on the quadratic a stalk is built from. Writes qpx/qpy. */
    function quadAt(
      x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, t: number
    ): void {
      const it = 1 - t;
      qpx = it * it * x0 + 2 * it * t * cx + t * t * x1;
      qpy = it * it * y0 + 2 * it * t * cy + t * t * y1;
    }

    /** Heading of that stalk at t, so a leaf knows which way is "out". Writes qang. */
    function quadAngle(
      x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, t: number
    ): void {
      const dx = 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx);
      const dy = 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy);
      qang = Math.atan2(dy, dx);
    }

    function wobble(base: number, n: number, amp: number, freq: number, seed: number): void {
      for (let k = 0; k < n; k++) {
        const p = k > 0 ? k - 1 : k;
        const q = k < n - 1 ? k + 1 : k;
        let tx = pts[base + q * STRIDE] - pts[base + p * STRIDE];
        let ty = pts[base + q * STRIDE + 1] - pts[base + p * STRIDE + 1];
        const L = Math.sqrt(tx * tx + ty * ty) || 1;
        tx /= L;
        ty /= L;
        const d =
          (vnoise(k * freq + seed * 13, seed) - 0.5) * 2 * amp +
          (vnoise(k * freq * 3.9 + seed * 29, seed) - 0.5) * amp * 0.4;
        pts[base + k * STRIDE] -= ty * d;
        pts[base + k * STRIDE + 1] += tx * d;
      }
    }

    function computeCurvature(m: number, n: number): void {
      const base = m * MAX_PTS * STRIDE;
      const cb = m * MAX_PTS;
      for (let k = 0; k < n; k++) {
        if (k === 0 || k === n - 1) {
          curv[cb + k] = 0;
          continue;
        }
        const ax = pts[base + k * STRIDE] - pts[base + (k - 1) * STRIDE];
        const ay = pts[base + k * STRIDE + 1] - pts[base + (k - 1) * STRIDE + 1];
        const bx = pts[base + (k + 1) * STRIDE] - pts[base + k * STRIDE];
        const by = pts[base + (k + 1) * STRIDE + 1] - pts[base + k * STRIDE + 1];
        const la = Math.sqrt(ax * ax + ay * ay) || 1;
        const lb = Math.sqrt(bx * bx + by * by) || 1;
        let dot = (ax * bx + ay * by) / (la * lb);
        if (dot > 1) dot = 1;
        else if (dot < -1) dot = -1;
        curv[cb + k] = Math.acos(dot);
      }
    }

    /** The hand carries past where it meant to stop. */
    function overshoot(base: number, n: number, amt: number): void {
      if (n < 2) return;
      let dx = pts[base + (n - 1) * STRIDE] - pts[base + (n - 2) * STRIDE];
      let dy = pts[base + (n - 1) * STRIDE + 1] - pts[base + (n - 2) * STRIDE + 1];
      const L = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= L;
      dy /= L;
      pts[base + (n - 1) * STRIDE] += dx * amt;
      pts[base + (n - 1) * STRIDE + 1] += dy * amt;
    }

    function finish(
      m: number, n: number, kind: number, col: number, width: number,
      alpha: number, rim: number, cost: number, seed: number
    ): void {
      markN[m] = n;
      markSeg[m] = kind === KIND_DOT ? n : n - 1;
      markKind[m] = kind;
      markCol[m] = col;
      markW[m] = width;
      markA[m] = alpha;
      markRim[m] = rim;
      markCost[m] = cost;
      markSeed[m] = seed;
      passCost += cost;
    }

    /* ---------------- the things that grow ---------------- */

    /**
     * A blade: petal, leaf or bud. Generated as a closed lobe around a bending
     * centre line, and every outline point remembers the spine point it belongs
     * to — that pairing is what lets the painter fill inward and edge outward
     * from the same walk.
     *
     * `skew` above 1 pushes the widest part toward the tip, which is a petal;
     * at 1 it sits in the middle, which is a leaf.
     */
    function pushBlade(
      col: number, s: number, ox: number, oy: number, ang: number,
      len: number, wid: number, curl: number, skew: number,
      n: number, wob: number, brush: number, alpha: number, rim: number, cost: number
    ): void {
      if (markCount >= MAX_MARKS) return;
      const m = markCount++;
      const base = m * MAX_PTS * STRIDE;
      const nn = n > MAX_PTS ? MAX_PTS : n < 8 ? 8 : n;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      for (let k = 0; k < nn; k++) {
        const u = k / (nn - 1);
        const side = u < 0.5 ? 1 : -1;
        let t = u < 0.5 ? u * 2 : (1 - u) * 2;
        if (t > 1) t = 1;
        const bend = curl * len * t * t;
        const sx = ox + ca * len * t - sa * bend;
        const sy = oy + sa * len * t + ca * bend;
        const db = curl * len * 2 * t;
        let tx = ca * len - sa * db;
        let ty = sa * len + ca * db;
        const L = Math.sqrt(tx * tx + ty * ty) || 1;
        tx /= L;
        ty /= L;
        const q = Math.pow(t, skew);
        const w = wid * Math.pow(Math.sin(Math.PI * q), 0.7);
        pts[base + k * STRIDE] = sx - ty * w * side;
        pts[base + k * STRIDE + 1] = sy + tx * w * side;
        pts[base + k * STRIDE + 2] = sx;
        pts[base + k * STRIDE + 3] = sy;
      }
      wobble(base, nn, wob, 0.62, s);
      finish(m, nn, KIND_WASH, col, brush, alpha, rim, cost, s);
      computeCurvature(m, nn);
    }

    /** One travelled line: a stalk, a midrib, a pencil search line, an ink mark. */
    function pushStroke(
      kind: number, col: number, s: number,
      x0: number, y0: number, x1: number, y1: number, bow: number,
      n: number, wob: number, width: number, alpha: number, cost: number
    ): void {
      if (markCount >= MAX_MARKS) return;
      const m = markCount++;
      const base = m * MAX_PTS * STRIDE;
      const nn = n > MAX_PTS ? MAX_PTS : n < 4 ? 4 : n;
      let dx = x1 - x0;
      let dy = y1 - y0;
      const L = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= L;
      dy /= L;
      const cx = (x0 + x1) * 0.5 - dy * bow;
      const cy = (y0 + y1) * 0.5 + dx * bow;
      for (let k = 0; k < nn; k++) {
        quadAt(x0, y0, cx, cy, x1, y1, k / (nn - 1));
        pts[base + k * STRIDE] = qpx;
        pts[base + k * STRIDE + 1] = qpy;
        pts[base + k * STRIDE + 2] = qpx;
        pts[base + k * STRIDE + 3] = qpy;
      }
      wobble(base, nn, wob, 0.5, s);
      overshoot(base, nn, wob * 2.2);
      finish(m, nn, kind, col, width, alpha, 0, cost, s);
      computeCurvature(m, nn);
    }

    /** An elliptical arc, for the graphite that gropes around a flower head. */
    function pushArc(
      kind: number, col: number, s: number, cx: number, cy: number,
      rx: number, ry: number, rot: number, a0: number, a1: number,
      n: number, wob: number, width: number, alpha: number, cost: number
    ): void {
      if (markCount >= MAX_MARKS) return;
      const m = markCount++;
      const base = m * MAX_PTS * STRIDE;
      const nn = n > MAX_PTS ? MAX_PTS : n < 4 ? 4 : n;
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      for (let k = 0; k < nn; k++) {
        const th = a0 + (a1 - a0) * (k / (nn - 1));
        const ox = Math.cos(th) * rx;
        const oy = Math.sin(th) * ry;
        const x = cx + ox * cr - oy * sr;
        const y = cy + ox * sr + oy * cr;
        pts[base + k * STRIDE] = x;
        pts[base + k * STRIDE + 1] = y;
        pts[base + k * STRIDE + 2] = x;
        pts[base + k * STRIDE + 3] = y;
      }
      wobble(base, nn, wob, 0.55, s);
      overshoot(base, nn, wob * 1.8);
      finish(m, nn, kind, col, width, alpha, 0, cost, s);
      computeCurvature(m, nn);
    }

    /** Stamens and seeds: a tight scatter of separate touches of the brush tip. */
    function pushDots(
      col: number, s: number, cx: number, cy: number, r: number,
      n: number, size: number, alpha: number, cost: number
    ): void {
      if (markCount >= MAX_MARKS) return;
      const m = markCount++;
      const base = m * MAX_PTS * STRIDE;
      const nn = n > MAX_PTS ? MAX_PTS : n < 2 ? 2 : n;
      for (let k = 0; k < nn; k++) {
        const a = rnd() * Math.PI * 2;
        const rr = r * Math.sqrt(rnd());
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr * 0.85;
        pts[base + k * STRIDE] = x;
        pts[base + k * STRIDE + 1] = y;
        pts[base + k * STRIDE + 2] = x;
        pts[base + k * STRIDE + 3] = y;
      }
      finish(m, nn, KIND_DOT, col, size, alpha, 0, cost, s);
    }

    /**
     * Build one pass: three plants, painted the way a study is painted. Graphite
     * first across the whole sheet, then the leaves, then the stalks, then the
     * flower heads over the top of both, then stamens, then the few ink marks
     * that commit. Marks are emitted in that order because the buffer composites
     * in the order they are laid down, which is what makes the layering legible.
     */
    function buildPass(): void {
      markCount = 0;
      cur = 0;
      pos = 0;
      passCost = 0;
      const p = live.current;
      seedRnd(1013 + passIndex * 7919 + Math.floor(p.progress * 977) * 31);
      const S = Math.min(W, H);
      const flip = passIndex & 1;

      for (let i = 0; i < PLANTS; i++) {
        // Plants stand in the margins, never in the reading column, and swap
        // sides between passes so no one edge is worked every time.
        const side = ((i + flip) & 1) === 0 ? -1 : 1;
        const slot = (i + (passIndex % PLANTS)) % PLANTS;
        const hx = W * 0.5 + side * W * (0.32 + rnd() * 0.16);
        const hy = H * (0.08 + slot * 0.3 + rnd() * 0.18) + dirBias * H * 0.04;
        // The stalk comes up from below and outboard, so it runs off the sheet
        // rather than starting from a visible full stop.
        const gx = hx + side * W * (0.02 + rnd() * 0.11);
        const gy = hy + H * (0.34 + rnd() * 0.42);
        const bow = (rnd() - 0.5) * S * 0.16;
        let dx = hx - gx;
        let dy = hy - gy;
        const L = Math.sqrt(dx * dx + dy * dy) || 1;
        dx /= L;
        dy /= L;
        const petalCol = ((i + passIndex) & 1) === 0 ? 3 : 4;
        plant[i * PLANT_F] = hx;
        plant[i * PLANT_F + 1] = hy;
        plant[i * PLANT_F + 2] = gx;
        plant[i * PLANT_F + 3] = gy;
        plant[i * PLANT_F + 4] = (hx + gx) * 0.5 - dy * bow;
        plant[i * PLANT_F + 5] = (hy + gy) * 0.5 + dx * bow;
        plant[i * PLANT_F + 6] = petalCol;
        // Leaves take the colour the flower did not, so a warm head sits against
        // cool foliage instead of every element sharing one muddy hue.
        plant[i * PLANT_F + 7] = petalCol === 3 ? 4 : 2;
        plant[i * PLANT_F + 8] = S * (0.062 + rnd() * 0.032) * (rnd() < 0.32 ? 0.6 : 1);
        plant[i * PLANT_F + 9] = rnd() * 100;
      }

      // 1 — graphite. A circle groped at around each head and a line for each
      //     stalk, faint enough to survive under everything laid on top.
      for (let i = 0; i < PLANTS; i++) {
        const hx = plant[i * PLANT_F];
        const hy = plant[i * PLANT_F + 1];
        const gx = plant[i * PLANT_F + 2];
        const gy = plant[i * PLANT_F + 3];
        const hr = plant[i * PLANT_F + 8];
        const a0 = rnd() * Math.PI * 2;
        pushArc(
          KIND_PENCIL, 2, rnd() * 100,
          hx + (rnd() - 0.5) * hr * 0.3, hy + (rnd() - 0.5) * hr * 0.3,
          hr * (1.05 + rnd() * 0.45), hr * (0.95 + rnd() * 0.45), rnd() * 3,
          a0, a0 + 2.4 + rnd() * 3.4, 26, S * 0.009, 1.3 * scale, 0.3, 0.34
        );
        pushStroke(
          KIND_PENCIL, 2, rnd() * 100, gx, gy, hx, hy,
          (rnd() - 0.5) * S * 0.2, 22, S * 0.012, 1.15 * scale, 0.2, 0.3
        );
      }
      // Two long gesture arcs — the sweep of the arm before the wrist gets
      // involved. They tie three separate studies into one sheet.
      for (let k = 0; k < 2; k++) {
        const a = Math.PI * 0.25 + (flip + k * 2) * Math.PI * 0.5 + rnd() * 0.6;
        const a0 = rnd() * Math.PI * 2;
        pushArc(
          KIND_PENCIL, 2, rnd() * 100,
          W * 0.5 + Math.cos(a) * W * 0.4, H * 0.5 + Math.sin(a) * H * 0.4,
          S * (0.5 + rnd() * 0.45), S * (0.45 + rnd() * 0.5), rnd() * 3,
          a0, a0 + 0.7 + rnd() * 1.2, 30, S * 0.016, 1.1 * scale, 0.1, 0.4
        );
      }

      // 2 — foliage, wet into the underdrawing.
      for (let i = 0; i < PLANTS; i++) {
        const hx = plant[i * PLANT_F];
        const hy = plant[i * PLANT_F + 1];
        const gx = plant[i * PLANT_F + 2];
        const gy = plant[i * PLANT_F + 3];
        const cx = plant[i * PLANT_F + 4];
        const cy = plant[i * PLANT_F + 5];
        const leafCol = plant[i * PLANT_F + 7];
        const leaves = 2 + ((rnd() * 2) | 0);
        for (let k = 0; k < leaves; k++) {
          const t = 0.18 + 0.62 * ((k + 0.25 + rnd() * 0.5) / leaves);
          quadAt(gx, gy, cx, cy, hx, hy, t);
          const lx = qpx;
          const ly = qpy;
          quadAngle(gx, gy, cx, cy, hx, hy, t);
          const out = (k & 1) === 0 ? 1 : -1;
          const ang = qang + out * (0.72 + rnd() * 0.62);
          const len = S * (0.12 + rnd() * 0.12);
          const wid = len * (0.17 + rnd() * 0.1);
          pushBlade(
            leafCol, rnd() * 100, lx, ly, ang, len,
            wid, out * (0.25 + rnd() * 0.6), 0.95,
            34, S * 0.005, wid * 0.62,
            leafCol === 2 ? 0.055 : 0.088, leafCol === 2 ? 2.1 : 2.6, 0.72
          );
          // The midrib, dropped in while the blade is still wet.
          pushStroke(
            KIND_STEM, 2, rnd() * 100, lx, ly,
            lx + Math.cos(ang) * len * 0.94, ly + Math.sin(ang) * len * 0.94,
            out * len * 0.14, 12, S * 0.004, 2 * scale, 0.2, 0.16
          );
        }
      }

      // 3 — the stalks. One stroke each, no second attempt.
      for (let i = 0; i < PLANTS; i++) {
        const hx = plant[i * PLANT_F];
        const hy = plant[i * PLANT_F + 1];
        const gx = plant[i * PLANT_F + 2];
        const gy = plant[i * PLANT_F + 3];
        const cx = plant[i * PLANT_F + 4];
        const cy = plant[i * PLANT_F + 5];
        let dx = hx - gx;
        let dy = hy - gy;
        const L = Math.sqrt(dx * dx + dy * dy) || 1;
        const bow = ((cx - (hx + gx) * 0.5) * -dy + (cy - (hy + gy) * 0.5) * dx) / L;
        pushStroke(
          KIND_STEM, 2, rnd() * 100, gx, gy, hx, hy, bow,
          32, S * 0.005, 4.4 * scale, 0.34, 0.5
        );
      }

      // 4 — the heads, laid over stalk and leaf so the flower sits in front.
      for (let i = 0; i < PLANTS; i++) {
        const hx = plant[i * PLANT_F];
        const hy = plant[i * PLANT_F + 1];
        const hr = plant[i * PLANT_F + 8];
        const col = plant[i * PLANT_F + 6];
        const petals = 4 + ((rnd() * 3) | 0);
        const base = rnd() * Math.PI * 2;
        for (let k = 0; k < petals; k++) {
          const a = base + (k / petals) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
          const len = hr * (1.2 + rnd() * 0.65);
          const wid = len * (0.24 + rnd() * 0.12);
          pushBlade(
            col, rnd() * 100,
            hx + Math.cos(a) * hr * 0.3, hy + Math.sin(a) * hr * 0.3, a,
            len, wid, (rnd() - 0.5) * 0.6, 1.25,
            30, hr * 0.03, wid * 0.62,
            0.095 + rnd() * 0.055, 2.4, 0.42
          );
        }
      }

      // 5 — stamens.
      for (let i = 0; i < PLANTS; i++) {
        pushDots(
          ((i + passIndex) & 1) === 0 ? 1 : 2, rnd() * 100,
          plant[i * PLANT_F], plant[i * PLANT_F + 1],
          plant[i * PLANT_F + 8] * 0.24, 7 + ((rnd() * 5) | 0),
          plant[i * PLANT_F + 8] * 0.05, 0.3, 0.24
        );
      }

      // 6 — ink. Two marks a plant, short and committed, and the only
      //     high-contrast thing on the sheet.
      for (let i = 0; i < PLANTS; i++) {
        const hx = plant[i * PLANT_F];
        const hy = plant[i * PLANT_F + 1];
        const gx = plant[i * PLANT_F + 2];
        const gy = plant[i * PLANT_F + 3];
        const cx = plant[i * PLANT_F + 4];
        const cy = plant[i * PLANT_F + 5];
        const hr = plant[i * PLANT_F + 8];
        const a0 = rnd() * Math.PI * 2;
        pushArc(
          KIND_INK, 1, rnd() * 100, hx, hy,
          hr * (1.35 + rnd() * 0.7), hr * (1.3 + rnd() * 0.7), rnd() * 3,
          a0, a0 + 0.8 + rnd() * 1.3, 18, hr * 0.05, 2.6 * scale, 0.44, 0.3
        );
        // A short accent on the stalk, where a real hand would firm the line up.
        const t = 0.3 + rnd() * 0.4;
        quadAt(gx, gy, cx, cy, hx, hy, t);
        const sx = qpx;
        const sy = qpy;
        quadAt(gx, gy, cx, cy, hx, hy, t + 0.16);
        pushStroke(
          KIND_INK, 1, rnd() * 100, sx, sy, qpx, qpy,
          (rnd() - 0.5) * hr * 0.3, 12, hr * 0.02, 2.2 * scale, 0.4, 0.2
        );
      }
      if (passCost <= 0) passCost = 1;
    }

    /* ---------------- mark drawing ---------------- */

    let segBudget = 0;
    let dryness = 0; // 0 wet and pooling, 1 fast and broken

    function dab(col: number, x: number, y: number, r: number, a: number): void {
      if (a <= 0.0015 || r <= 0.2) return;
      const s = a * alphaScale;
      bctx!.globalAlpha = s > 1 ? 1 : s;
      bctx!.drawImage(dabs[col], x - r, y - r, r * 2, r * 2);
    }

    function drawSegPart(m: number, i: number, u0: number, u1: number): void {
      const base = m * MAX_PTS * STRIDE;
      const kind = markKind[m];
      const seg = markSeg[m];
      const seed = markSeed[m];
      const col = markCol[m];
      const o = base + i * STRIDE;
      segBudget++;

      if (kind === KIND_DOT) {
        const x = pts[o];
        const y = pts[o + 1];
        const f = centreFade(x, y) * (0.45 + 0.55 * marginFade(x));
        dab(col, x, y, markW[m] * (0.55 + rnd() * 0.95), markA[m] * f * (0.4 + rnd() * 0.8));
        return;
      }

      const o2 = o + STRIDE;
      const x0 = pts[o];
      const y0 = pts[o + 1];
      const x1 = pts[o2];
      const y1 = pts[o2 + 1];
      const ax = x0 + (x1 - x0) * u0;
      const ay = y0 + (y1 - y0) * u0;
      const bx = x0 + (x1 - x0) * u1;
      const by = y0 + (y1 - y0) * u1;
      const mid = (u0 + u1) * 0.5;
      const u = (i + mid) / seg;
      const mx = (ax + bx) * 0.5;
      const my = (ay + by) * 0.5;

      const fade = centreFade(mx, my);
      const pr = pressure(u, seed);
      // Fast scrolling drags the brush dry; slow scrolling lets pigment sit.
      const wet = 1 - dryness;
      const bend = curv[m * MAX_PTS + i];

      if (kind === KIND_WASH) {
        // Both ends of the spine this bit of outline hangs off. Everything a
        // blade is made of is painted *along* its length, between the spine and
        // the outline — the way a loaded brush is actually swept down a petal —
        // rather than scrubbed across it.
        const s0x = pts[o + 2];
        const s0y = pts[o + 3];
        const s1x = pts[o2 + 2];
        const s1y = pts[o2 + 3];
        const pax = s0x + (s1x - s0x) * u0;
        const pay = s0y + (s1y - s0y) * u0;
        const pbx = s0x + (s1x - s0x) * u1;
        const pby = s0y + (s1y - s0y) * u1;
        const load = 0.5 + 0.8 * vnoise(u * 3.4 + seed * 3, seed + 11);

        bctx!.globalCompositeOperation = blendOp;
        bctx!.strokeStyle = colStr[col];

        // The brush works down the blade in two lanes and swaps between them as
        // it goes, wandering a little so the swap never lands on a grid. A round
        // cap is wider than a segment is long, so the two lanes weave into full
        // cover at half the strokes, leaving the mottling of a real second coat.
        const aFill = markA[m] * fade * load * (0.5 + 0.55 * pr) * (0.7 + 0.4 * wet);
        if (aFill > 0.002 && rnd() > 0.06 + 0.2 * dryness) {
          const sa = aFill * alphaScale;
          const f = ((i & 1) === 0 ? 0.32 : 0.7) + (vnoise(u * 9.1 + seed, seed + 17) - 0.5) * 0.26;
          bctx!.globalAlpha = sa > 1 ? 1 : sa;
          bctx!.lineWidth = markW[m] * (0.95 + 0.35 * pr);
          bctx!.beginPath();
          bctx!.moveTo(pax + (ax - pax) * f, pay + (ay - pay) * f);
          bctx!.lineTo(pbx + (bx - pbx) * f, pby + (by - pby) * f);
          bctx!.stroke();
        }

        // THE EDGE. Water retreats to the boundary and leaves its pigment there,
        // and that dark decisive rim is the whole difference between watercolour
        // and an airbrush — so it is drawn as a line, several times the strength
        // of the fill, and it is allowed to break up where the brush ran dry.
        const pool = vnoise(u * 5.7 + seed * 5, seed + 2);
        const rimA = markA[m] * markRim[m] * fade * (0.16 + 1.5 * pool) * (0.75 + 0.35 * wet);
        if (rimA > 0.002 && rnd() > 0.08 * dryness) {
          const s = rimA * alphaScale;
          bctx!.globalAlpha = s > 1 ? 1 : s;
          bctx!.lineWidth = (1 + 2.6 * pool * pr) * scale;
          bctx!.beginPath();
          bctx!.moveTo(ax, ay);
          bctx!.lineTo(bx, by);
          bctx!.stroke();
          // Granulation sitting in the tooth right along that line.
          if (rnd() < 0.55) dab(col, bx, by, (2.1 + rnd() * 2.6) * scale, rimA * 0.85);
          // A tip or a sharp turn is where the last of the water gathers.
          if (bend > 0.22) dab(col, bx, by, (3 + bend * 4) * scale, rimA * 0.8);
        }
        // A rare backrun: water pushed back into a drying wash, lifting a bloom.
        if (rnd() < 0.02) {
          dab(col, pbx, pby, markW[m] * (0.5 + rnd() * 0.5), markA[m] * fade * 0.55 * wet);
        }

        bctx!.globalCompositeOperation = 'source-over';
        return;
      }

      if (kind === KIND_PENCIL) {
        const w = markW[m] * (0.4 + 0.8 * pr);
        const a =
          markA[m] * fade * (0.5 + 0.6 * vnoise(u * 17 + seed, seed + 3)) *
          (0.4 + 0.6 * marginFade(mx));
        const px = -(by - ay);
        const py = bx - ax;
        const pl = Math.sqrt(px * px + py * py) || 1;
        const nx = (px / pl) * w * 0.8;
        const ny = (py / pl) * w * 0.8;
        bctx!.globalAlpha = Math.min(1, a * alphaScale);
        bctx!.strokeStyle = colStr[col];
        bctx!.lineWidth = w;
        // Two offset passes: graphite searches for the line rather than finding it.
        bctx!.beginPath();
        bctx!.moveTo(ax, ay);
        bctx!.lineTo(bx, by);
        bctx!.stroke();
        if (rnd() < 0.55) {
          bctx!.globalAlpha = Math.min(1, a * alphaScale * 0.55);
          bctx!.beginPath();
          bctx!.moveTo(ax + nx, ay + ny);
          bctx!.lineTo(bx + nx * 0.6, by + ny * 0.6);
          bctx!.stroke();
        }
        return;
      }

      if (kind === KIND_STEM) {
        if (rnd() < 0.11 * dryness) return; // the brush skips when hurried
        const w = markW[m] * (0.22 + 1.2 * pr);
        const a = markA[m] * fade * (0.45 + 0.55 * marginFade(mx)) * (0.65 + 0.45 * wet);
        bctx!.globalAlpha = Math.min(1, a * alphaScale);
        bctx!.strokeStyle = colStr[col];
        bctx!.lineWidth = w;
        bctx!.beginPath();
        bctx!.moveTo(ax, ay);
        bctx!.lineTo(bx, by);
        bctx!.stroke();
        // Pigment pools where the stroke turns or where the hand slowed.
        if (bend > 0.16) dab(col, bx, by, w * 0.85, a * bend * 1.6);
        return;
      }

      // KIND_INK — the committing line. Widest swing in width, and knocked back
      // hardest toward the centre because it is the only thing here with contrast.
      const w = markW[m] * (0.22 + 1.5 * pr);
      const inkFade = fade * marginFade(mx);
      const a = markA[m] * inkFade;
      bctx!.globalAlpha = Math.min(1, a * alphaScale);
      bctx!.strokeStyle = colStr[col];
      bctx!.lineWidth = w;
      bctx!.beginPath();
      bctx!.moveTo(ax, ay);
      bctx!.lineTo(bx, by);
      bctx!.stroke();
      if (bend > 0.14) dab(col, bx, by, w * 0.9, a * 0.5 * bend * 4);
    }

    function drawSpan(m: number, from: number, to: number): void {
      let a = from;
      let guard = 0;
      while (a < to && guard++ < 512) {
        const i = Math.floor(a);
        if (i >= markSeg[m]) break;
        const b = Math.min(to, i + 1);
        drawSegPart(m, i, a - i, b - i);
        a = b;
        if (segBudget > MAX_SEG_PER_FRAME) return;
      }
    }

    function endOfMark(m: number): void {
      const kind = markKind[m];
      if (kind !== KIND_WASH && kind !== KIND_INK) return;
      const base = m * MAX_PTS * STRIDE;
      const n = markN[m];
      const x = pts[base + (n - 1) * STRIDE];
      const y = pts[base + (n - 1) * STRIDE + 1];
      // The brush lifts and leaves what it was still carrying.
      if (kind === KIND_WASH) {
        bctx!.globalCompositeOperation = blendOp;
        dab(markCol[m], x, y, markW[m] * 0.42, markA[m] * markRim[m] * centreFade(x, y) * 1.2);
        bctx!.globalCompositeOperation = 'source-over';
      } else {
        dab(markCol[m], x, y, markW[m] * 1.0, markA[m] * centreFade(x, y) * marginFade(x) * 0.85);
      }
    }

    function advance(units: number): void {
      if (markCount <= 0) return;
      let budget = units;
      let guard = 0;
      while (budget > 0 && guard++ < 28 && segBudget <= MAX_SEG_PER_FRAME) {
        const m = cur;
        const seg = markSeg[m];
        if (seg <= 0) {
          cur = (cur + 1) % markCount;
          pos = 0;
          continue;
        }
        const cost = markCost[m] || 1;
        const remaining = (1 - pos / seg) * cost;
        const dots = markKind[m] === KIND_DOT;
        if (budget < remaining) {
          const next = pos + (budget / cost) * seg;
          if (dots) {
            let done = Math.floor(pos);
            const target = Math.floor(next);
            while (done < target && done < seg) {
              drawSegPart(m, done, 0, 1);
              done++;
              if (segBudget > MAX_SEG_PER_FRAME) break;
            }
          } else {
            drawSpan(m, pos, next);
          }
          pos = next;
          budget = 0;
        } else {
          if (dots) {
            let done = Math.floor(pos);
            while (done < seg) {
              drawSegPart(m, done, 0, 1);
              done++;
              if (segBudget > MAX_SEG_PER_FRAME) break;
            }
          } else {
            drawSpan(m, pos, seg);
          }
          endOfMark(m);
          budget -= remaining;
          cur++;
          pos = 0;
          if (cur >= markCount) {
            passIndex++;
            buildPass();
            // Scrolling back never erases; a new pass simply works over the top,
            // and the sheet pales a little so it can keep taking pigment.
            // Jack: "This is beautiful. Maybe they should fade faster?" — so
            // the pass boundary lifts about 38% rather than 24%.
            veilFrames = 34;
          }
        }
      }
    }

    /**
     * Age the whole sheet by a touch. Removal rather than a coat of the surface
     * colour, so it means the same thing on paper and on ink — under
     * destination-out only the alpha is read, and the fill colour is ignored.
     */
    function veilOnce(a: number): void {
      bctx!.setTransform(1, 0, 0, 1, 0, 0);
      bctx!.globalCompositeOperation = 'destination-out';
      bctx!.globalAlpha = a;
      bctx!.fillStyle = colStr[0];
      bctx!.fillRect(0, 0, W, H);
      bctx!.globalCompositeOperation = 'source-over';
      bctx!.globalAlpha = 1;
    }

    /**
     * Paint the sheet up front, before anyone looks at it.
     *
     * A backdrop that starts empty and fills in over a long scroll is a blank
     * page to most readers, so setup runs several whole passes at once with the
     * same ageing between them that the loop would have applied. What arrives on
     * the first frame is a painting several layers deep; scrolling then revises
     * it rather than starting it.
     */
    function prepaint(passes: number, tail: number): void {
      const saved = dryness;
      dryness = 0.18;
      for (let p = 0; p < passes; p++) {
        const target = passIndex + 1;
        let guard = 0;
        while (passIndex < target && guard++ < 3000) {
          segBudget = 0;
          advance(0.6);
        }
        if (p < passes - 1) veilOnce(0.26);
      }
      let left = passCost * tail;
      let guard2 = 0;
      while (left > 0 && guard2++ < 3000) {
        segBudget = 0;
        const u = left < 0.6 ? left : 0.6;
        advance(u);
        left -= u;
      }
      dryness = saved;
      veilFrames = 0;
      bctx!.globalAlpha = 1;
      bctx!.globalCompositeOperation = 'source-over';
    }

    /* ---------------- composite ---------------- */

    /**
     * The only repaint reduced motion gets. A theme flip has to be caught here:
     * the buffer is full of pigment mixed from the old palette, and simply
     * recompositing it would show the previous theme's painting for good.
     */
    function repaintStatic(): void {
      if (paletteChanged()) {
        readColours();
        buildDabs();
        buildGrain();
        rebuildSheet();
      }
      composite();
    }

    function composite(): void {
      const p = live.current;
      ctx!.setTransform(1, 0, 0, 1, 0, 0);
      ctx!.clearRect(0, 0, W, H);
      const it = p.intensity < 0 ? 0 : p.intensity > 1 ? 1 : p.intensity;
      if (it <= 0.002) return;

      const ov = 16 * scale;
      ctx!.globalAlpha = it;
      // Drawn slightly oversized so the parallax offset never exposes an edge.
      ctx!.drawImage(buf, -ov + parX, -ov + parY, W + ov * 2, H + ov * 2);

      if (grainPattern) {
        ctx!.globalAlpha = it * 0.05;
        ctx!.translate(parX * 0.5, parY * 0.5);
        ctx!.fillStyle = grainPattern;
        ctx!.fillRect(-parX * 0.5, -parY * 0.5, W, H);
        ctx!.setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx!.globalAlpha = 1;
    }
    repaint.current = repaintStatic;

    /* ---------------- sizing ---------------- */

    function rebuildSheet(): void {
      bctx!.setTransform(1, 0, 0, 1, 0, 0);
      bctx!.globalCompositeOperation = 'source-over';
      bctx!.globalAlpha = 1;
      bctx!.clearRect(0, 0, W, H);
      passIndex = 0;
      veilFrames = 0;
      buildPass();
      prepaint(staticMode.current ? 3 : 2, 0.55);
    }

    function resize(): void {
      const r = host!.getBoundingClientRect();
      const cw = Math.max(1, Math.round(r.width));
      const ch = Math.max(1, Math.round(r.height));
      let s = backdropDpr();
      const overBudget = cw * ch * s * s;
      if (overBudget > MAX_BUFFER_PX) s = Math.max(1, s * Math.sqrt(MAX_BUFFER_PX / overBudget));
      const nw = Math.max(1, Math.round(cw * s));
      const nh = Math.max(1, Math.round(ch * s));
      if (nw === W && nh === H && scale === s) return;
      W = nw;
      H = nh;
      scale = s;
      canvas!.width = W;
      canvas!.height = H;
      buf.width = W;
      buf.height = H;
      bctx!.lineCap = 'round';
      bctx!.lineJoin = 'round';
      readColours();
      buildDabs();
      buildGrain();
      rebuildSheet();
      composite();
    }

    /** Reduced motion: the sheet is already painted, so simply stop here. */
    function drawStatic(): void {
      rebuildSheet();
      composite();
    }

    /* ---------------- loop ---------------- */

    function frame(now: number): void {
      raf = requestAnimationFrame(frame);
      const p = live.current;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1; // a backgrounded tab must not dump a minute of painting
      if (dt < 0) dt = 0;

      if (paletteChanged()) {
        // Baked pigment belongs to the old palette, so the sheet is repainted
        // from scratch — and repainted *full*, never left blank while it fills.
        readColours();
        buildDabs();
        buildGrain();
        rebuildSheet();
      }

      const dProgress = p.progress - prevProgress;
      prevProgress = p.progress;
      smoothVel += (p.velocity - smoothVel) * 0.12;
      const speed = Math.min(Math.abs(smoothVel), 90);
      dryness += (Math.min(1, speed / 70) - dryness) * 0.08;
      dirBias += ((smoothVel > 0 ? 1 : -1) * Math.min(1, speed / 24) - dirBias) * 0.03;

      parX += (Math.sin(now * 0.00013) * 3 * scale - parX) * 0.05;
      parY += (-smoothVel * 0.14 * scale - parY) * 0.08;
      const pmax = 11 * scale;
      if (parY > pmax) parY = pmax;
      else if (parY < -pmax) parY = -pmax;

      if (veilFrames > 0) {
        veilFrames--;
        veilOnce(0.0135);
      }

      if (p.intensity > 0.02) {
        segBudget = 0;
        // Idle alone keeps the hand moving at a visible rate; scrolling drives it
        // hard, which is what makes reading the page feel like watching it painted.
        let units = dt * 3.1 + Math.abs(dProgress) * 13 + speed * dt * 0.05;
        // A fling must not burn through several compositions in one frame.
        if (units > 0.45) units = 0.45;
        advance(units);
        /*
         * AMBIENT AGEING. Jack: "This is beautiful. Maybe they should fade
         * faster?"
         *
         * Before this, the sheet only paled at a pass BOUNDARY, so a mark laid
         * early in a pass sat at full strength until the whole composition
         * finished — on a slow read, minutes. Now it ages continuously.
         *
         * Tied to `units` rather than to dt on purpose. It makes the fade
         * self-balancing: pigment and time are then spent in the same currency,
         * so the sheet reaches an equilibrium density instead of either
         * silting up under a fast scroll or bleaching out while a reader sits
         * still on one section. It also means a page nobody is reading cannot
         * quietly erase itself.
         */
        veilOnce(units * 0.012);
        bctx!.globalAlpha = 1;
        bctx!.globalCompositeOperation = 'source-over';
      }

      composite();
    }

    function start(): void {
      if (running || staticMode.current) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function stop(): void {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    }
    function sync(): void {
      if (visible && !document.hidden) start();
      else stop();
    }

    /* ---------------- wiring ---------------- */

    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => {
      staticMode.current = mql.matches;
      if (staticMode.current) {
        stop();
        drawStatic();
      } else {
        sync();
      }
    };
    staticMode.current = mql.matches;

    resize();

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[entries.length - 1].isIntersecting;
        sync();
      },
      { threshold: 0 }
    );
    io.observe(canvas);

    const ro = new ResizeObserver(() => resize());
    ro.observe(host);

    const onVis = () => sync();
    document.addEventListener('visibilitychange', onVis);
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onMotion);
    else mql.addListener(onMotion);

    // resize() has already laid the sheet down, and start() refuses to run under
    // reduced motion, so this only ever starts the live loop.
    sync();

    /*
     * Dev-only handle, identical across every world.
     *
     * The Browser pane reports `document.hidden`, never composites, and never
     * fires rAF OR ResizeObserver, and the IntersectionObserver reports the
     * canvas as never on screen. Without a way to drive a frame by hand there
     * is no way to find out what a world actually draws — which is exactly how
     * Fluid came to be shipped invisible. See docs/spec.md section 8.
     *
     * `frames` RE-MEASURES FIRST. That is not tidiness: the pane has no
     * viewport, so `inset: 0` resolves to nothing and every world sits at 1x1
     * until something calls resize. A reviewer who gives the canvas a real box
     * and then asks for frames would otherwise read back a single pixel and
     * conclude the world draws nothing, which is the same wrong answer by a
     * different route.
     */
    if (process.env.NODE_ENV !== 'production') {
      (canvas as unknown as Record<string, unknown>).__world = {
        name: 'watercolour',
        frames: (n = 1) => {
          resize();
          for (let i = 0; i < n; i++) frame(i * 16.667);
          cancelAnimationFrame(raf);
          raf = 0;
        }
      };
    }

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', onMotion);
      else mql.removeListener(onMotion);
      repaint.current = null;
      grainPattern = null;
      // Release the offscreen surfaces we own. The visible canvas belongs to
      // React, so it is left untouched.
      buf.width = 0;
      buf.height = 0;
      grainTile.width = 0;
      grainTile.height = 0;
      probe.width = 0;
      probe.height = 0;
      for (let i = 0; i < dabs.length; i++) {
        dabs[i].width = 0;
        dabs[i].height = 0;
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
}
