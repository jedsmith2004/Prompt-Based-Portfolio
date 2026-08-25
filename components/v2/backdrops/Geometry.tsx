'use client';

/* ============================================================================
   Geometry — the construction plate.

   A deferent circle with three rotors rolling on it, each tracing a roulette
   (two hypocycloids, one epicycloid). The exactness is the whole point: a
   roulette with an integer cusp count touches its base circle precisely at its
   cusps, so if every rotor's cusp count divides the same master sweep, all
   three tracers land on their base circles at the SAME instants.

   At those instants several facts become true at once, and the drawing simply
   stops hiding them:
     - each tracer sits exactly on a construction circle, so the tangent drawn
       there is a real tangent rather than an approximation;
     - the two rotors sharing the deferent are concyclic with it, and the
       perpendicular bisectors of the chords through the tracers concur;
     - each roulette's full cusp set is a regular n-gon inscribed in its base
       circle, and the three of them nest.
   Nothing here is staged. The hidden figure is drawn only while it is true,
   and its opacity is a sharp power of the alignment term, so it arrives, holds
   for a beat, and leaves.

   Everything else is instrumentation: a graduated limb, compass marks, instant
   centres of rotation, one measured angle, and a detail inset holding a real
   Apollonian gasket that turns against the plate while a crest of emphasis
   travels inward through its generations.

   Around the plate, in the corners it leaves empty, sit three more
   constructions that carry themselves out and then let go: Fibonacci squares
   with their spiral and the perpendicular diagonals that locate its pole; a
   Lissajous figure whose frequency ratio drifts and dwells on simple ratios,
   closing and getting measured whenever it locks; and a straightedge and
   compass bisection of an angle that rebuilds itself at a new angle each time.
   They are placed only where the frame has room for them.

   Two structural notes.
   - The centre of the frame is punched out with a destination-out radial mask
     so the plate dissolves toward the text it sits behind. destination-out
     discards RGB entirely, so the mask introduces no colour.
   - Nothing is allocated inside the frame loop. Roulette samples, gasket
     circles, dash patterns and font strings are all built in setup or on
     resize.
   ========================================================================== */

import { useEffect, useRef } from 'react';
import type { BackdropProps, BackdropPalette } from './types';
import { backdropDpr } from './types';

const TAU = Math.PI * 2;

/** Samples per roulette. Enough that an 8-lobed epicycloid keeps sharp cusps. */
const SAMPLES = 560;
/** Length, in samples, of the brighter "just traced" tail behind each tracer. */
const TAIL = 86;

/** Hard ceiling on gasket circles. Recursion also stops on radius and depth. */
const MAX_CIRCLES = 640;
const GASKET_DEPTH = 6;
/** Below this unit radius a gasket circle is sub-pixel in the inset. */
const GASKET_MIN_R = 0.011;

/** Base angular rate of the master sweep, radians per second. */
const BASE_SPIN = 0.30;

/* Dash patterns are preallocated: setLineDash copies its argument, so passing a
   literal every frame would allocate one array per call. */
const DASH_NONE: number[] = [];
const DASH_FINE: number[] = [2, 5];
const DASH_LONG: number[] = [9, 6];

/* Alpha-only stops for the centre mask. The colour is discarded by
   destination-out; only the alpha channel does any work. */
const MASK_0 = 'rgba(0,0,0,0.99)';
const MASK_1 = 'rgba(0,0,0,0.90)';
const MASK_2 = 'rgba(0,0,0,0.22)';
const MASK_3 = 'rgba(0,0,0,0)';

const LIMB_LABELS = ['0', '90', '180', '270'];

/* --------------------------------------------------------------------------
   Corner artefacts. Three further constructions, pinned around the plate in
   the space it leaves empty. Same register as the plate: hairlines, ticks,
   measured angles, nothing shaded.
   -------------------------------------------------------------------------- */

/** Quarter turns in the Fibonacci spiral. Seven gives a 21 x 34 rectangle. */
const SPIRAL_STEPS = 7;
const FIB = [1, 1, 2, 3, 5, 8, 13];
/* The spiral's k-th arc starts at angle PI + k*PI/2, so its unit direction is
   always an axis. Held exactly rather than taken from a cosine. */
const QX = [-1, 0, 1, 0];
const QY = [0, -1, 0, 1];

/** Samples along the Lissajous. It is re-evaluated every frame, so stay lean. */
const LISS_SAMPLES = 240;
/** Two turns of the slow term closes every ratio with a denominator of 1 or 2. */
const LISS_SPAN = Math.PI * 4;
/** The simple ratios the drifting figure is allowed to lock onto. */
const LOCKS = [1, 1.5, 2, 2.5, 3];
const LOCK_LABELS = ['1:1', '3:2', '2:1', '5:2', '3:1'];
/** Half the gap between adjacent locks. The drift dwells inside this. */
const LOCK_HALF = 0.25;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

interface RotorSpec {
  /** Cusp count. Every cusp lies exactly on this rotor's base circle. */
  n: number;
  /** Rolling outside (epicycloid) rather than inside (hypocycloid). */
  epi: boolean;
  /** Direction of travel along the roulette. */
  dir: number;
  /**
   * Which cusp the rotor sits on at alignment. An INTEGER offset keeps the
   * cusp-touch times common to every rotor, which is what makes the alignment
   * real; a fractional offset would break it.
   */
  off: number;
  /**
   * Radius of this rotor's own base circle as a fraction of the deferent. A
   * rotor on an inner base still cusps at exactly the same instants, so the
   * alignment stays simultaneous while the outward-rolling one stays inside
   * the plate instead of sprawling past the graduated limb.
   */
  base: number;
  colour: keyof BackdropPalette;
}

/* 3, 5 and 8 share no common factor beyond 1, so partial coincidences are rare
   and the full alignment feels earned. */
const ROTORS: RotorSpec[] = [
  { n: 3, epi: false, dir: 1, off: 0, base: 1, colour: 'ink' },
  { n: 5, epi: false, dir: -1, off: 1, base: 1, colour: 'accent2' },
  { n: 8, epi: true, dir: 1, off: 3, base: 0.7, colour: 'ink2' },
];

export default function Geometry({
  intensity,
  progress,
  velocity,
  palette,
  className,
}: BackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* Props are read through a ref inside the loop so that scroll-driven values
     never tear down and rebuild the construction. */
  const props = useRef({ intensity, progress, velocity, palette });
  useEffect(() => {
    props.current.intensity = intensity;
    props.current.progress = progress;
    props.current.velocity = velocity;
    props.current.palette = palette;
  });

  /* Held so the reduced-motion path can repaint on prop change without a loop. */
  const repaint = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    /* ---------------------------------------------------------------- setup */

    /** Roulette sample buffers, one per rotor, refilled on resize. */
    const curves: Float32Array[] = [];
    /** Per rotor: [rolling radius, centre distance, harmonic, base radius]. */
    const rgeo = new Float32Array(ROTORS.length * 4);
    for (let i = 0; i < ROTORS.length; i++) {
      curves.push(new Float32Array(SAMPLES * 2));
    }

    /** Gasket circles in unit space: x, y, r, depth. Built once, never resized. */
    const gasket = new Float32Array(MAX_CIRCLES * 4);
    const gasketCount = buildGasket(gasket);

    /* The gasket is walked once per generation every frame, so it is worth
       sorting by depth here: each generation then becomes one contiguous run
       instead of a filtered pass over the whole set. Counting sort, at setup. */
    const gsort = new Float32Array(MAX_CIRCLES * 4);
    const gstart = new Int32Array(GASKET_DEPTH + 2);
    {
      for (let i = 0; i < gasketCount; i++) gstart[gasket[i * 4 + 3] + 1]++;
      for (let d = 0; d <= GASKET_DEPTH; d++) gstart[d + 1] += gstart[d];
      const cur = new Int32Array(GASKET_DEPTH + 2);
      for (let d = 0; d < gstart.length; d++) cur[d] = gstart[d];
      for (let i = 0; i < gasketCount; i++) {
        const d = gasket[i * 4 + 3];
        const j = cur[d]++;
        gsort[j * 4] = gasket[i * 4];
        gsort[j * 4 + 1] = gasket[i * 4 + 1];
        gsort[j * 4 + 2] = gasket[i * 4 + 2];
        gsort[j * 4 + 3] = d;
      }
    }

    /* Corner artefacts. Everything fixed about them is resolved in layout; a
       frame only advances phases. */
    /** Per quarter turn: centre x, centre y, radius, start angle. */
    const spiral = new Float32Array(SPIRAL_STEPS * 4);
    /** Normalised cumulative arc length, so the spiral can be drawn partially. */
    const spiralCum = new Float32Array(SPIRAL_STEPS + 1);
    let spiralOn = false;
    let poleX = 0;
    let poleY = 0;
    /* Diagonal of the whole rectangle, and of the rectangle that is left once
       the largest square comes off. They are perpendicular and cross at the pole. */
    let dg0x = 0;
    let dg0y = 0;
    let dg1x = 0;
    let dg1y = 0;
    let dh0x = 0;
    let dh0y = 0;
    let dh1x = 0;
    let dh1y = 0;

    let lissOn = false;
    let lissX = 0;
    let lissY = 0;
    let lissS = 1;

    let compOn = false;
    let compX = 0;
    let compY = 0;
    let compS = 1;

    /* Scratch for the three tracer points and their radial projections. Fixed
       length, reused every frame. */
    const px = new Float64Array(3);
    const py = new Float64Array(3);
    const qx = new Float64Array(3);
    const qy = new Float64Array(3);

    let w = 1;
    let h = 1;
    let dpr = 1;
    let cx = 0;
    let cy = 0;
    let R = 1;
    let insetX = 0;
    let insetY = 0;
    let insetR = 1;
    let maskR = 1;
    let mask: CanvasGradient | null = null;
    let tickFont = '8px monospace';

    let psi = 0;
    /*
     * A SECOND CLOCK, IN REAL SECONDS, FOR THE SMALL CONSTRUCTIONS.
     *
     * Jack, twice: the smaller elements should perpetually animate. They were
     * not animating, and the reason is arithmetic rather than oversight. Every
     * phase on the plate is derived from `psi`, which advances at BASE_SPIN =
     * 0.30 rad/s when nobody is scrolling — and the corner constructions then
     * scale that down again by 0.035 to 0.107, because those factors were
     * chosen to keep them from spinning under a fast scroll. The result at
     * rest: the gasket inset took ten minutes to turn once, the Lissajous
     * phase seven, and the Fibonacci cycle one. Frozen, correctly.
     *
     * `psi` cannot simply be sped up. The alignment term, the hidden figure and
     * every concurrency claim in the header depend on the exact sweep, and the
     * whole argument of the plate is that those things are TRUE rather than
     * staged. So the small elements get their own clock and the psi terms stay
     * exactly where they are, added to rather than replaced — scrolling still
     * hurries them and reading upward still runs them backwards.
     */
    let tt = 0;
    let last = 0;
    let raf = 0;
    let running = false;
    let visible = true;
    let reduced = false;

    const mq =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    /* ------------------------------------------------- Fibonacci spiral fit */

    /**
     * Fibonacci squares and the quarter arcs they carry.
     *
     * Each arc is centred on a corner of its own square, starts exactly where
     * the previous one finished, and has the next Fibonacci radius, so the
     * whole figure follows from a single start point. Built in unit space,
     * then fitted to its slot. Called only from layout.
     */
    const buildSpiral = (atX: number, atY: number, half: number) => {
      let sx0 = 0;
      let sy0 = 0;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      /* Same, excluding the largest square: the reciprocal rectangle. */
      let rminX = Infinity;
      let rminY = Infinity;
      let rmaxX = -Infinity;
      let rmaxY = -Infinity;

      for (let k = 0; k < SPIRAL_STEPS; k++) {
        const q = k & 3;
        const d0x = QX[q];
        const d0y = QY[q];
        const d1x = QX[(q + 1) & 3];
        const d1y = QY[(q + 1) & 3];
        const r = FIB[k];
        const ccx = sx0 - r * d0x;
        const ccy = sy0 - r * d0y;
        const opx = ccx + r * (d0x + d1x);
        const opy = ccy + r * (d0y + d1y);
        spiral[k * 4] = ccx;
        spiral[k * 4 + 1] = ccy;
        spiral[k * 4 + 2] = r;
        spiral[k * 4 + 3] = Math.PI + k * Math.PI * 0.5;

        if (ccx < minX) minX = ccx;
        if (ccx > maxX) maxX = ccx;
        if (opx < minX) minX = opx;
        if (opx > maxX) maxX = opx;
        if (ccy < minY) minY = ccy;
        if (ccy > maxY) maxY = ccy;
        if (opy < minY) minY = opy;
        if (opy > maxY) maxY = opy;
        if (k < SPIRAL_STEPS - 1) {
          if (ccx < rminX) rminX = ccx;
          if (ccx > rmaxX) rmaxX = ccx;
          if (opx < rminX) rminX = opx;
          if (opx > rmaxX) rmaxX = opx;
          if (ccy < rminY) rminY = ccy;
          if (ccy > rmaxY) rmaxY = ccy;
          if (opy < rminY) rminY = opy;
          if (opy > rmaxY) rmaxY = opy;
        }

        sx0 = ccx + r * d1x;
        sy0 = ccy + r * d1y;
      }

      const bw = maxX - minX;
      const bh = maxY - minY;
      const sc = (half * 2) / Math.max(bw, bh, 1e-6);
      const ox = atX - (minX + maxX) * 0.5 * sc;
      const oy = atY - (minY + maxY) * 0.5 * sc;
      for (let k = 0; k < SPIRAL_STEPS; k++) {
        spiral[k * 4] = ox + spiral[k * 4] * sc;
        spiral[k * 4 + 1] = oy + spiral[k * 4 + 1] * sc;
        spiral[k * 4 + 2] *= sc;
      }

      /* Arc length of a quarter turn is proportional to its radius, so the
         radii themselves serve as the length measure. */
      let run = 0;
      spiralCum[0] = 0;
      for (let k = 0; k < SPIRAL_STEPS; k++) {
        run += spiral[k * 4 + 2];
        spiralCum[k + 1] = run;
      }
      const inv = run > 0 ? 1 / run : 0;
      for (let k = 1; k <= SPIRAL_STEPS; k++) spiralCum[k] *= inv;

      /* Of the four ways to pair a diagonal of the whole rectangle with one of
         the reciprocal, exactly one pair is perpendicular. That is the pair
         whose crossing is the pole of the spiral. */
      const fx0 = ox + minX * sc;
      const fy0 = oy + minY * sc;
      const fx1 = ox + maxX * sc;
      const fy1 = oy + maxY * sc;
      const gx0 = ox + rminX * sc;
      const gy0 = oy + rminY * sc;
      const gx1 = ox + rmaxX * sc;
      const gy1 = oy + rmaxY * sc;
      let best = 2;
      for (let i = 0; i < 2; i++) {
        const p0x = i === 0 ? fx0 : fx1;
        const p1x = i === 0 ? fx1 : fx0;
        for (let j = 0; j < 2; j++) {
          const q0x = j === 0 ? gx0 : gx1;
          const q1x = j === 0 ? gx1 : gx0;
          const ux = p1x - p0x;
          const uy = fy1 - fy0;
          const vx = q1x - q0x;
          const vy = gy1 - gy0;
          const lu = Math.sqrt(ux * ux + uy * uy) || 1;
          const lv = Math.sqrt(vx * vx + vy * vy) || 1;
          const c = Math.abs((ux * vx + uy * vy) / (lu * lv));
          if (c < best) {
            best = c;
            dg0x = p0x;
            dg0y = fy0;
            dg1x = p1x;
            dg1y = fy1;
            dh0x = q0x;
            dh0y = gy0;
            dh1x = q1x;
            dh1y = gy1;
          }
        }
      }

      const ux = dg1x - dg0x;
      const uy = dg1y - dg0y;
      const vx = dh1x - dh0x;
      const vy = dh1y - dh0y;
      const den = ux * vy - uy * vx;
      if (Math.abs(den) > 1e-6) {
        const t = ((dh0x - dg0x) * vy - (dh0y - dg0y) * vx) / den;
        poleX = dg0x + ux * t;
        poleY = dg0y + uy * t;
      } else {
        poleX = atX;
        poleY = atY;
      }
    };

    /* --------------------------------------------------------------- layout */

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      const nw = Math.max(1, Math.round(rect.width));
      const nh = Math.max(1, Math.round(rect.height));
      const ndpr = backdropDpr();
      if (nw === w && nh === h && ndpr === dpr && mask) return;

      w = nw;
      h = nh;
      dpr = ndpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);

      const m = Math.min(w, h);
      cx = w * 0.5;
      cy = h * 0.5;
      /* Sized so the graduated limb at 1.165R still clears the short side: the
         plate must read as a whole instrument, not a cropped arc. */
      R = m * 0.405;

      /* The enlarged-detail circle belongs beside the plate, never on top of
         it. Beside it when the frame is wide enough; below it when it is not. */
      insetR = Math.max(34, m * 0.115);
      const beside = cx + R * 1.3;
      if (beside + insetR + 10 <= w) {
        insetX = beside;
        insetY = cy + R * 0.62;
      } else {
        insetX = cx + R * 0.55;
        insetY = cy + R * 1.45;
      }
      insetX = Math.min(w - insetR - 10, Math.max(insetR + 10, insetX));
      insetY = Math.min(h - insetR - 10, Math.max(insetR + 10, insetY));

      /* --- slots for the corner artefacts --------------------------------
         Each one is placed only where it clears the graduated limb, the
         detail inset and the frame edge. On a canvas with no room they simply
         do not appear; nothing is ever pushed toward the middle to fit. */
      const slotR = Math.max(30, m * 0.115);
      const fits = (x: number, y: number, rad: number): boolean => {
        if (x - rad < 6 || y - rad < 6) return false;
        if (x + rad > w - 6 || y + rad > h - 6) return false;
        const dx = x - cx;
        const dy = y - cy;
        if (Math.sqrt(dx * dx + dy * dy) < R * 1.19 + rad * 0.8) return false;
        const ex = x - insetX;
        const ey = y - insetY;
        if (Math.sqrt(ex * ex + ey * ey) < insetR + rad + 12) return false;
        return true;
      };

      lissX = Math.max(slotR + 6, w * 0.13);
      lissY = Math.min(h - slotR - 6, h * 0.82);
      lissS = slotR * 0.7;
      lissOn = fits(lissX, lissY, slotR);

      compX = Math.min(w - slotR - 6, w * 0.865);
      compY = Math.max(slotR + 6, h * 0.17);
      compS = slotR * 0.8;
      compOn = fits(compX, compY, slotR);

      const spX = Math.max(slotR + 6, w * 0.135);
      const spY = Math.max(slotR + 6, h * 0.185);
      spiralOn = fits(spX, spY, slotR);
      if (spiralOn) buildSpiral(spX, spY, slotR * 0.92);

      maskR = m * 0.44;
      /* Built in local space around the origin; the CTM at paint time places
         and stretches it, so one gradient serves the elliptical mask. */
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, maskR);
      g.addColorStop(0, MASK_0);
      g.addColorStop(0.45, MASK_1);
      g.addColorStop(0.78, MASK_2);
      g.addColorStop(1, MASK_3);
      mask = g;

      tickFont =
        Math.max(7, Math.round(m * 0.014)) +
        'px ui-monospace, SFMono-Regular, Menlo, monospace';

      for (let i = 0; i < ROTORS.length; i++) {
        const s = ROTORS[i];
        const rb = R * s.base;
        const r = rb / s.n;
        const d = s.epi ? rb + r : rb - r;
        const k = s.epi ? s.n + 1 : s.n - 1;
        rgeo[i * 4] = r;
        rgeo[i * 4 + 1] = d;
        rgeo[i * 4 + 2] = k;
        rgeo[i * 4 + 3] = rb;
        const buf = curves[i];
        for (let j = 0; j < SAMPLES; j++) {
          const u = (j / SAMPLES) * TAU;
          const ku = k * u;
          buf[j * 2] = s.epi
            ? d * Math.cos(u) - r * Math.cos(ku)
            : d * Math.cos(u) + r * Math.cos(ku);
          buf[j * 2 + 1] = d * Math.sin(u) - r * Math.sin(ku);
        }
      }
    };

    /* ----------------------------------------------------------- primitives */

    /** Stroke a short mark from (x,y) along (ux,uy), used for ticks and legs. */
    const mark = (
      x: number,
      y: number,
      ux: number,
      uy: number,
      a: number,
      b: number
    ) => {
      ctx.moveTo(x + ux * a, y + uy * a);
      ctx.lineTo(x + ux * b, y + uy * b);
    };

    const dot = (x: number, y: number, r: number) => {
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
    };

    /** The square corner draughtsmen put where two lines meet at 90 degrees. */
    const squareMark = (
      x: number,
      y: number,
      ux: number,
      uy: number,
      s: number
    ) => {
      const vx = -uy;
      const vy = ux;
      ctx.moveTo(x + ux * s, y + uy * s);
      ctx.lineTo(x + (ux + vx) * s, y + (uy + vy) * s);
      ctx.lineTo(x + vx * s, y + vy * s);
    };

    /* -------------------------------------------------------------- drawing */

    const render = () => {
      layout();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const p = props.current;
      const I = p.intensity;
      /* Below this the plate is not merely faint, it is absent. Leaving early
         keeps eight backdrops from all costing a frame at once. */
      if (I <= 0.002 || !mask) return;
      const mk = mask; // narrowed once; `mask` is an outer-scope let

      const pal = p.palette;
      const prog = p.progress < 0 ? 0 : p.progress > 1 ? 1 : p.progress;
      const vel = p.velocity;
      const av = Math.abs(vel);

      /* Alignment: |cos(psi/2)| raised high is a flat zero with a sharp spike
         once per master turn, which is exactly the rhythm we want. Fast scroll
         lowers the exponent so the reveal blooms wider and softer — you cannot
         read a fine instrument while you are moving. */
      const sharp = Math.max(9, 32 - Math.min(22, av * 0.55));
      const align = Math.pow(Math.abs(Math.cos(psi * 0.5)), sharp);
      const a2 = align * align;
      const a3 = a2 * align;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'round';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.setLineDash(DASH_NONE);

      ctx.save();
      ctx.translate(cx, cy);
      /* Slow plate rotation carries the revealed figure with it, so the same
         secret does not appear in the same place twice. */
      const phi = prog * 0.72 + psi * 0.031;
      ctx.rotate(phi);
      /* The whole construction breathes a couple of percent with progress. */
      const breath = 0.975 + prog * 0.05;
      ctx.scale(breath, breath);

      /* --- graduated limb ------------------------------------------------ */
      ctx.strokeStyle = pal.ink2;
      ctx.lineWidth = 0.7;
      ctx.globalAlpha = 0.17 * I;
      ctx.beginPath();
      for (let i = 0; i < 72; i++) {
        if (i % 3 === 0) continue;
        const t = (i / 72) * TAU;
        const ux = Math.cos(t);
        const uy = Math.sin(t);
        mark(0, 0, ux, uy, R * 1.012, R * 1.03);
      }
      ctx.stroke();

      ctx.globalAlpha = 0.33 * I;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 24; i++) {
        const t = (i / 24) * TAU;
        const ux = Math.cos(t);
        const uy = Math.sin(t);
        mark(0, 0, ux, uy, R * 1.012, i % 6 === 0 ? R * 1.062 : R * 1.042);
      }
      ctx.stroke();

      /* --- deferent ------------------------------------------------------ */
      ctx.globalAlpha = 0.46 * I;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.stroke();

      /* Faint guide circles: the loci the rolling centres ride on. */
      ctx.globalAlpha = 0.14 * I;
      ctx.setLineDash(DASH_FINE);
      ctx.beginPath();
      for (let i = 0; i < ROTORS.length; i++) {
        const d = rgeo[i * 4 + 1];
        ctx.moveTo(d, 0);
        ctx.arc(0, 0, d, 0, TAU);
      }
      ctx.stroke();
      ctx.setLineDash(DASH_NONE);

      /* Any rotor sitting on an inner base gets that base drawn too: it is a
         real circle of the construction, not a convenience. */
      ctx.globalAlpha = 0.26 * I;
      ctx.beginPath();
      for (let i = 0; i < ROTORS.length; i++) {
        if (ROTORS[i].base >= 1) continue;
        const rb = rgeo[i * 4 + 3];
        ctx.moveTo(rb, 0);
        ctx.arc(0, 0, rb, 0, TAU);
      }
      ctx.stroke();

      /* --- limb numerals ------------------------------------------------- */
      ctx.fillStyle = pal.ink2;
      ctx.font = tickFont;
      ctx.globalAlpha = 0.27 * I;
      for (let i = 0; i < 4; i++) {
        const t = (i / 4) * TAU;
        const lx = Math.cos(t) * R * 1.095;
        const ly = Math.sin(t) * R * 1.095;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(-phi); // numerals stay upright while the plate turns
        ctx.fillText(LIMB_LABELS[i], 0, 0);
        ctx.restore();
      }

      /* --- roulettes ----------------------------------------------------- */
      for (let i = 0; i < ROTORS.length; i++) {
        const s = ROTORS[i];
        const buf = curves[i];
        const col = pal[s.colour];
        ctx.strokeStyle = col;

        ctx.globalAlpha = 0.21 * I;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(buf[0], buf[1]);
        for (let j = 1; j < SAMPLES; j++) ctx.lineTo(buf[j * 2], buf[j * 2 + 1]);
        ctx.closePath();
        ctx.stroke();

        /* The stretch just traced, brighter: the curve reads as being drawn
           right now rather than as decoration that was always there. */
        const u = s.dir * psi + (s.off * TAU) / s.n;
        const idx = Math.floor((((u % TAU) + TAU) % TAU / TAU) * SAMPLES) % SAMPLES;
        ctx.globalAlpha = 0.50 * I;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        let j = (((idx - s.dir * TAIL) % SAMPLES) + SAMPLES) % SAMPLES;
        ctx.moveTo(buf[j * 2], buf[j * 2 + 1]);
        for (let q = 0; q < TAIL; q++) {
          j = (j + s.dir + SAMPLES) % SAMPLES;
          ctx.lineTo(buf[j * 2], buf[j * 2 + 1]);
        }
        ctx.stroke();

        /* --- rolling circle, spoke, instant centre --- */
        const r = rgeo[i * 4];
        const d = rgeo[i * 4 + 1];
        const k = rgeo[i * 4 + 2];
        const rb = rgeo[i * 4 + 3];
        const cu = Math.cos(u);
        const su = Math.sin(u);
        const mcx = d * cu;
        const mcy = d * su;
        const tx = s.epi ? mcx - r * Math.cos(k * u) : mcx + r * Math.cos(k * u);
        const ty = mcy - r * Math.sin(k * u);
        /* Contact with the base circle is the instantaneous centre of rotation:
           the tracer's velocity is perpendicular to the line from here. */
        const conx = rb * cu;
        const cony = rb * su;

        px[i] = tx;
        py[i] = ty;
        const len = Math.sqrt(tx * tx + ty * ty) || 1;
        qx[i] = (tx / len) * rb;
        qy[i] = (ty / len) * rb;

        ctx.strokeStyle = pal.ink2;
        ctx.globalAlpha = 0.30 * I;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(mcx + r, mcy);
        ctx.arc(mcx, mcy, r, 0, TAU);
        ctx.stroke();

        ctx.globalAlpha = 0.23 * I;
        ctx.setLineDash(DASH_FINE);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(mcx, mcy);
        ctx.moveTo(mcx, mcy);
        ctx.lineTo(tx, ty);
        ctx.moveTo(conx, cony);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash(DASH_NONE);

        /* Tangent to the traced path: perpendicular to the instant-centre line. */
        const ix = tx - conx;
        const iy = ty - cony;
        const il = Math.sqrt(ix * ix + iy * iy) || 1;
        const tux = -iy / il;
        const tuy = ix / il;
        ctx.globalAlpha = 0.27 * I;
        ctx.lineWidth = 1;
        ctx.beginPath();
        mark(tx, ty, tux, tuy, -R * 0.11, R * 0.11);
        ctx.stroke();

        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.62 * I;
        ctx.lineWidth = 1;
        ctx.beginPath();
        dot(tx, ty, 2.4);
        ctx.stroke();
        ctx.globalAlpha = 0.40 * I;
        ctx.beginPath();
        dot(mcx, mcy, 1.4);
        dot(conx, cony, 1.4);
        ctx.stroke();
      }

      /* --- one measured angle, read off the limb ------------------------- */
      {
        const u0 = ((ROTORS[0].dir * psi) % TAU + TAU) % TAU;
        const ar = R * 1.13;
        ctx.strokeStyle = pal.accent2;
        ctx.globalAlpha = 0.29 * I;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(0, 0, ar, 0, u0);
        mark(0, 0, 1, 0, R * 1.075, R * 1.165);
        mark(0, 0, Math.cos(u0), Math.sin(u0), R * 1.075, R * 1.165);
        ctx.stroke();
        ctx.globalAlpha = 0.19 * I;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (let t = 0; t < u0; t += Math.PI / 18) {
          mark(0, 0, Math.cos(t), Math.sin(t), ar, ar + R * 0.016);
        }
        ctx.stroke();
      }

      /* --- the alignment reveal ------------------------------------------ */
      if (align > 0.004) {
        /* Inscribed regular polygons: each roulette's complete cusp set, on its
           own base circle. These are only meaningful when the tracers are
           actually on those circles, which is exactly when `align` is near one. */
        ctx.strokeStyle = pal.accent;
        ctx.globalAlpha = 0.44 * a2 * I;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < ROTORS.length; i++) {
          const n = ROTORS[i].n;
          const rb = rgeo[i * 4 + 3];
          ctx.moveTo(rb, 0);
          for (let j = 1; j <= n; j++) {
            const t = (j / n) * TAU;
            ctx.lineTo(rb * Math.cos(t), rb * Math.sin(t));
          }
        }
        ctx.stroke();

        /* Chords through the three tracers, and the tangents at those points.
           A tangent only means anything once its tracer has actually landed on
           its base circle. */
        ctx.strokeStyle = pal.ink;
        ctx.globalAlpha = 0.36 * align * I;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px[0], py[0]);
        ctx.lineTo(px[1], py[1]);
        ctx.lineTo(px[2], py[2]);
        ctx.closePath();
        ctx.stroke();

        ctx.strokeStyle = pal.accent;
        ctx.globalAlpha = 0.26 * a2 * I;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const rb = rgeo[i * 4 + 3] || 1;
          mark(qx[i], qy[i], -qy[i] / rb, qx[i] / rb, -R * 0.52, R * 0.52);
        }
        ctx.stroke();

        /* Perpendicular bisectors of the chords. They concur at the centre
           precisely when the three points are concyclic; off alignment you can
           watch them miss. */
        ctx.strokeStyle = pal.ink2;
        ctx.globalAlpha = 0.24 * a2 * I;
        ctx.lineWidth = 0.8;
        ctx.setLineDash(DASH_LONG);
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const j = (i + 1) % 3;
          const mx = (px[i] + px[j]) * 0.5;
          const my = (py[i] + py[j]) * 0.5;
          let ux = -(py[j] - py[i]);
          let uy = px[j] - px[i];
          const l = Math.sqrt(ux * ux + uy * uy) || 1;
          ux /= l;
          uy /= l;
          /* Point it at the centre so the concurrency is the visible event. */
          if (ux * -mx + uy * -my < 0) {
            ux = -ux;
            uy = -uy;
          }
          const reach = Math.sqrt(mx * mx + my * my) * 1.2 + R * 0.05;
          mark(mx, my, ux, uy, 0, reach);
        }
        ctx.stroke();
        ctx.setLineDash(DASH_NONE);

        ctx.globalAlpha = 0.3 * a3 * I;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const j = (i + 1) % 3;
          const mx = (px[i] + px[j]) * 0.5;
          const my = (py[i] + py[j]) * 0.5;
          let ux = px[j] - px[i];
          let uy = py[j] - py[i];
          const l = Math.sqrt(ux * ux + uy * uy) || 1;
          squareMark(mx, my, ux / l, uy / l, R * 0.022);
        }
        ctx.stroke();

        /* A held ring at the top of the pulse: the moment the plate agrees. */
        ctx.strokeStyle = pal.accent;
        ctx.globalAlpha = 0.24 * a3 * I;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, TAU);
        ctx.stroke();
      }

      ctx.restore();

      /* ====================================================================
         Corner artefacts.

         These sit in page space rather than on the plate, so they do not turn
         with it: they read as separate figures pinned around the instrument.
         Each is a construction that carries itself out and then lets go.
         ==================================================================== */

      /* One slow clock for everything that completes and resets. It runs off
         the same sweep as the plate, so scrolling hurries these constructions
         and reading upward runs them backwards. The offset puts the static
         reduced-motion frame partway through rather than on an empty beat. */
      const cyc = 0.42 + psi * 0.055 + prog * 0.5 + tt * 0.07;

      /* --- golden section: Fibonacci squares carrying their spiral -------- */
      if (spiralOn) {
        const ph = cyc * 0.62;
        const f = ph - Math.floor(ph);
        /* Drawn across two thirds of the cycle, held, then released. */
        const sp = f < 0.66 ? f / 0.66 : 1;
        const life = f < 0.05 ? f / 0.05 : f > 0.9 ? (1 - f) / 0.1 : 1;
        const A = I * clamp01(life);

        if (A > 0.004) {
          /* Squares first, each appearing as the arc reaches it. */
          ctx.strokeStyle = pal.ink2;
          ctx.lineWidth = 0.7;
          ctx.setLineDash(DASH_FINE);
          for (let k = 0; k < SPIRAL_STEPS; k++) {
            const g = clamp01((sp - spiralCum[k]) * 4.5);
            if (g <= 0) break;
            const q = k & 3;
            const ccx = spiral[k * 4];
            const ccy = spiral[k * 4 + 1];
            const r = spiral[k * 4 + 2];
            const opx = ccx + r * (QX[q] + QX[(q + 1) & 3]);
            const opy = ccy + r * (QY[q] + QY[(q + 1) & 3]);
            ctx.globalAlpha = 0.17 * g * A;
            ctx.beginPath();
            ctx.rect(Math.min(ccx, opx), Math.min(ccy, opy), r, r);
            ctx.stroke();
          }
          ctx.setLineDash(DASH_NONE);

          /* Then the spiral: one quarter turn per square, each starting where
             the last finished. */
          ctx.strokeStyle = pal.accent;
          ctx.globalAlpha = 0.32 * A;
          ctx.lineWidth = 1.05;
          ctx.beginPath();
          for (let k = 0; k < SPIRAL_STEPS; k++) {
            const c0 = spiralCum[k];
            if (sp <= c0) break;
            const t = clamp01((sp - c0) / (spiralCum[k + 1] - c0));
            const a0 = spiral[k * 4 + 3];
            const r = spiral[k * 4 + 2];
            ctx.moveTo(
              spiral[k * 4] + r * Math.cos(a0),
              spiral[k * 4 + 1] + r * Math.sin(a0)
            );
            ctx.arc(spiral[k * 4], spiral[k * 4 + 1], r, a0, a0 + t * Math.PI * 0.5);
          }
          ctx.stroke();

          /* Last, the claim the figure makes: the diagonal of the whole
             rectangle and the diagonal of what remains once the largest
             square is taken off are perpendicular, and they cross at the pole
             the spiral converges on. */
          const dsh = sp > 0.72 ? clamp01((sp - 0.72) / 0.18) : 0;
          if (dsh > 0.01) {
            ctx.strokeStyle = pal.ink;
            ctx.globalAlpha = 0.18 * dsh * A;
            ctx.lineWidth = 0.8;
            ctx.setLineDash(DASH_LONG);
            ctx.beginPath();
            ctx.moveTo(dg0x, dg0y);
            ctx.lineTo(dg1x, dg1y);
            ctx.moveTo(dh0x, dh0y);
            ctx.lineTo(dh1x, dh1y);
            ctx.stroke();
            ctx.setLineDash(DASH_NONE);

            let ux = dg1x - poleX;
            let uy = dg1y - poleY;
            const ul = Math.sqrt(ux * ux + uy * uy) || 1;
            ux /= ul;
            uy /= ul;
            let vx = dh1x - poleX;
            let vy = dh1y - poleY;
            const vl = Math.sqrt(vx * vx + vy * vy) || 1;
            vx /= vl;
            vy /= vl;
            /* squareMark opens along its axis and that axis turned left, so
               hand it whichever diagonal puts the corner in the live quadrant. */
            const useU = ux * vy - uy * vx >= 0;
            ctx.strokeStyle = pal.accent;
            ctx.globalAlpha = 0.3 * dsh * A;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            squareMark(
              poleX,
              poleY,
              useU ? ux : vx,
              useU ? uy : vy,
              spiral[2] * 1.1
            );
            dot(poleX, poleY, 1.7);
            ctx.stroke();
          }
        }
      }

      /* --- a Lissajous drifting through simple ratios --------------------- */
      if (lissOn) {
        /* The raw drift is a plain sine over 1..3. The map below compresses it
           near each simple ratio, so the figure slows as it approaches one,
           closes on it, holds for a beat, and then moves on. */
        const raw = 2 + Math.sin(psi * 0.107 + prog * 1.6 + tt * 0.16);
        let li = Math.round((raw - 1) / (LOCK_HALF * 2));
        if (li < 0) li = 0;
        else if (li >= LOCKS.length) li = LOCKS.length - 1;
        const lc = LOCKS[li];
        const e = (raw - lc) / LOCK_HALF;
        const eased = e < 0 ? -Math.pow(-e, 2.6) : Math.pow(e, 2.6);
        const ratio = lc + eased * LOCK_HALF;
        const lock = 1 - (eased < 0 ? -eased : eased);
        const l3 = lock * lock * lock;
        /* Wrapped, so the phase stays useful however far psi has run. */
        const dphi = (psi * 0.05 + tt * 0.55) % TAU;

        ctx.save();
        ctx.translate(lissX, lissY);

        ctx.strokeStyle = pal.accent2;
        ctx.globalAlpha = (0.15 + 0.13 * l3) * I;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        for (let j = 0; j <= LISS_SAMPLES; j++) {
          const t = (j / LISS_SAMPLES) * LISS_SPAN;
          const lx = lissS * Math.sin(ratio * t + dphi);
          const ly = lissS * Math.sin(t);
          if (j === 0) ctx.moveTo(lx, ly);
          else ctx.lineTo(lx, ly);
        }
        ctx.stroke();

        if (l3 > 0.02) {
          /* Locked. The trace closes, so the frame it is inscribed in and the
             points where it touches that frame become worth marking, and the
             ratio can be named. */
          ctx.strokeStyle = pal.ink2;
          ctx.globalAlpha = 0.2 * l3 * I;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.rect(-lissS, -lissS, lissS * 2, lissS * 2);
          ctx.stroke();

          ctx.strokeStyle = pal.accent;
          ctx.globalAlpha = 0.3 * l3 * I;
          ctx.lineWidth = 1;
          ctx.beginPath();
          /* The slow term reaches its extremes at t = pi/2 + n*pi: those are
             the touches on the top and bottom edges. */
          for (let n = 0; n < 4; n++) {
            const t = Math.PI * 0.5 + n * Math.PI;
            if (t > LISS_SPAN) break;
            const tx = lissS * Math.sin(ratio * t + dphi);
            mark(tx, n & 1 ? -lissS : lissS, 0, 1, -0.09 * lissS, 0.09 * lissS);
          }
          /* And the fast term likewise, for the left and right edges. */
          for (let n = 0; n < 20; n++) {
            const t = (Math.PI * 0.5 + n * Math.PI - dphi) / ratio;
            if (t < 0) continue;
            if (t > LISS_SPAN) break;
            const ty = lissS * Math.sin(t);
            const tx = Math.sin(ratio * t + dphi) > 0 ? lissS : -lissS;
            mark(tx, ty, 1, 0, -0.09 * lissS, 0.09 * lissS);
          }
          ctx.stroke();

          ctx.fillStyle = pal.ink2;
          ctx.font = tickFont;
          ctx.globalAlpha = 0.34 * l3 * I;
          ctx.fillText(LOCK_LABELS[li], 0, lissS * 1.42);
        }
        ctx.restore();
      }

      /* --- straightedge and compass: bisecting an angle ------------------- */
      if (compOn) {
        const ph = cyc * 0.5;
        const cyi = Math.floor(ph);
        const f = ph - cyi;
        /* A different angle every cycle, stepped by the golden fraction so no
           two consecutive constructions repeat a spacing. */
        const seq = (((cyi * 0.61803399) % 1) + 1) % 1;
        const span = 0.72 + seq * 1.15;
        const halfA = span * 0.5;
        const th0 = -Math.PI * 0.5 - halfA + (seq - 0.5) * 1.2;
        const sh = Math.sin(halfA);
        const chh = Math.cos(halfA);
        const rr = compS;
        /* The second compass setting has to be wide enough for the two arcs to
           actually meet, which is what fixes the crossing on the bisector. */
        let rr2 = (sh * 1.18 > 0.72 ? sh * 1.18 : 0.72) * rr;
        if (rr2 > rr * 1.05) rr2 = rr * 1.05;
        const hh = Math.sqrt(Math.max(0, rr2 * rr2 - rr * rr * sh * sh));
        const dvx = rr * chh + hh;
        const bl = dvx * 1.18;
        const bdx = Math.cos(th0 + halfA);
        const bdy = Math.sin(th0 + halfA);
        /* Centre the finished figure on the slot rather than its vertex. */
        const vx0 = compX - bdx * bl * 0.5;
        const vy0 = compY - bdy * bl * 0.5;
        const c0x = Math.cos(th0);
        const c0y = Math.sin(th0);
        const c1x = Math.cos(th0 + span);
        const c1y = Math.sin(th0 + span);
        const p1x = vx0 + c0x * rr;
        const p1y = vy0 + c0y * rr;
        const p2x = vx0 + c1x * rr;
        const p2y = vy0 + c1y * rr;
        const ixx = vx0 + bdx * dvx;
        const ixy = vy0 + bdy * dvx;

        const life = f < 0.05 ? f / 0.05 : f > 0.9 ? (1 - f) / 0.1 : 1;
        const A = I * clamp01(life);
        const s1 = clamp01(f / 0.15);
        const s2 = clamp01((f - 0.13) / 0.19);
        const s3 = clamp01((f - 0.33) / 0.23);
        const s4 = clamp01((f - 0.57) / 0.2);
        const s5 = clamp01((f - 0.75) / 0.12);

        if (A > 0.004) {
          /* The two legs. */
          ctx.strokeStyle = pal.ink2;
          ctx.globalAlpha = 0.22 * A;
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          mark(vx0, vy0, c0x, c0y, 0, rr * 1.28 * s1);
          mark(vx0, vy0, c1x, c1y, 0, rr * 1.28 * s1);
          ctx.stroke();

          /* One compass setting swung across both of them. */
          if (s2 > 0) {
            ctx.strokeStyle = pal.accent2;
            ctx.globalAlpha = 0.26 * A;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(p1x, p1y);
            ctx.arc(vx0, vy0, rr, th0, th0 + span * s2);
            ctx.stroke();
            if (s2 >= 1) {
              /* Equal radii, ticked as such. */
              ctx.globalAlpha = 0.3 * A;
              ctx.lineWidth = 1;
              ctx.beginPath();
              mark(p1x, p1y, -c0y, c0x, -rr * 0.05, rr * 0.05);
              mark(p2x, p2y, -c1y, c1x, -rr * 0.05, rr * 0.05);
              ctx.stroke();
            }
          }

          /* Two more arcs of one equal setting, from those crossings. They
             meet on the bisector, which is the whole point of the method. */
          if (s3 > 0) {
            const a1 = Math.atan2(ixy - p1y, ixx - p1x);
            const a2 = Math.atan2(ixy - p2y, ixx - p2x);
            ctx.strokeStyle = pal.accent;
            ctx.globalAlpha = 0.24 * A;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(
              p1x + rr2 * Math.cos(a1 - 0.5),
              p1y + rr2 * Math.sin(a1 - 0.5)
            );
            ctx.arc(p1x, p1y, rr2, a1 - 0.5, a1 - 0.5 + s3);
            ctx.moveTo(
              p2x + rr2 * Math.cos(a2 - 0.5),
              p2y + rr2 * Math.sin(a2 - 0.5)
            );
            ctx.arc(p2x, p2y, rr2, a2 - 0.5, a2 - 0.5 + s3);
            ctx.stroke();
            if (s3 >= 1) {
              ctx.globalAlpha = 0.42 * A;
              ctx.lineWidth = 1;
              ctx.beginPath();
              dot(ixx, ixy, 1.8);
              ctx.stroke();
            }
          }

          /* The bisector itself, straightedge only. */
          if (s4 > 0) {
            ctx.strokeStyle = pal.accent;
            ctx.globalAlpha = 0.3 * A;
            ctx.lineWidth = 1;
            ctx.beginPath();
            mark(vx0, vy0, bdx, bdy, 0, bl * s4);
            ctx.stroke();
          }

          /* And the assertion: these two angles are the same one. */
          if (s5 > 0) {
            const ar2 = rr * 0.44;
            const m1 = th0 + halfA * 0.5;
            const m2 = th0 + halfA * 1.5;
            ctx.strokeStyle = pal.ink;
            ctx.globalAlpha = 0.26 * s5 * A;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(
              vx0 + ar2 * Math.cos(th0 + 0.07),
              vy0 + ar2 * Math.sin(th0 + 0.07)
            );
            ctx.arc(vx0, vy0, ar2, th0 + 0.07, th0 + halfA - 0.07);
            ctx.moveTo(
              vx0 + ar2 * Math.cos(th0 + halfA + 0.07),
              vy0 + ar2 * Math.sin(th0 + halfA + 0.07)
            );
            ctx.arc(vx0, vy0, ar2, th0 + halfA + 0.07, th0 + span - 0.07);
            mark(vx0, vy0, Math.cos(m1), Math.sin(m1), ar2 * 0.86, ar2 * 1.14);
            mark(vx0, vy0, Math.cos(m2), Math.sin(m2), ar2 * 0.86, ar2 * 1.14);
            ctx.stroke();
          }
        }
      }

      /* --- detail inset: Apollonian gasket -------------------------------- */
      {
        ctx.save();
        ctx.translate(insetX, insetY);

        ctx.strokeStyle = pal.ink2;
        ctx.globalAlpha = 0.30 * I;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, insetR, 0, TAU);
        ctx.stroke();

        /* Leader line back to the plate, with the ticked bracket a drawing uses
           to say "this circle is that circle, enlarged". */
        ctx.globalAlpha = 0.18 * I;
        ctx.setLineDash(DASH_FINE);
        ctx.beginPath();
        const lx = cx - insetX;
        const ly = cy - insetY;
        const ll = Math.sqrt(lx * lx + ly * ly) || 1;
        mark(0, 0, lx / ll, ly / ll, insetR, ll * 0.42);
        ctx.stroke();
        ctx.setLineDash(DASH_NONE);

        ctx.globalAlpha = 0.26 * I;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        mark(0, -insetR, 1, 0, -0.03 * insetR, 0.12 * insetR);
        mark(0, insetR, 1, 0, -0.03 * insetR, 0.12 * insetR);
        ctx.stroke();

        /* The gasket is a live construction, not a printed detail.
           Three things move, none of them fast:
             - it turns slowly against the plate, which turns the other way;
             - the recursion depth breathes, so the fringe generation is drawn
               and undrawn instead of sitting there;
             - a crest of emphasis travels from the large circles down through
               the generations, so each one is picked out in turn as though
               the eye of the draughtsman were working inward.
           `progress` biases the depth, so scrolling still deepens it. */
        const depthF =
          1 +
          (GASKET_DEPTH - 1) *
            (0.36 + 0.32 * prog + 0.32 * (0.5 + 0.5 * Math.sin(psi * 0.21 + tt * 0.5)));
        const wave = psi * 0.55 + tt * 1.1;

        ctx.save();
        ctx.rotate(psi * 0.035 + prog * 0.55 + tt * 0.06);
        for (let d = 0; d <= GASKET_DEPTH; d++) {
          let gate = depthF - d;
          if (gate <= 0) break;
          if (gate > 1) gate = 1;
          const em = 0.62 + 0.38 * Math.cos(wave - d * 0.85);
          const a = (d === 0 ? 0.38 : 0.33 - d * 0.038) * gate * em;
          if (a <= 0.004) continue;
          ctx.strokeStyle = d < 2 ? pal.ink : pal.ink2;
          ctx.globalAlpha = a * I;
          ctx.lineWidth = d < 2 ? 0.9 : 0.7;
          ctx.beginPath();
          const end = gstart[d + 1];
          for (let i = gstart[d]; i < end; i++) {
            const gr = gsort[i * 4 + 2] * insetR;
            if (gr < 0.45) continue;
            dot(gsort[i * 4] * insetR, gsort[i * 4 + 1] * insetR, gr);
          }
          ctx.stroke();
        }
        ctx.restore();
        ctx.restore();
      }

      /* --- quiet the centre ---------------------------------------------- */
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1.62, 1);
      ctx.fillStyle = mk;
      ctx.fillRect(-maskR, -maskR, maskR * 2, maskR * 2);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    };

    repaint.current = render;

    /* ------------------------------------------------------------ the loop */

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = last === 0 ? 0.016 : Math.min(0.05, (now - last) * 0.001);
      last = now;

      /* Scroll drives the sweep. It is signed, so reading upward genuinely
         runs the mechanism backwards rather than just speeding it up. */
      let drive = BASE_SPIN + props.current.velocity * 0.011;
      if (drive > 3) drive = 3;
      else if (drive < -2.4) drive = -2.4;
      psi += dt * drive;
      if (psi > 1e6 || psi < -1e6) psi = 0; // keep float precision honest
      /* Real seconds, forward only. The small constructions are meant to be
         alive whether or not anyone is scrolling, which is the whole point of
         separating them from the sweep. */
      tt += dt;
      if (tt > 1e6) tt = 0;
      render();
    };

    const start = () => {
      if (running || reduced || !visible || document.hidden) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
    };

    const applyMotionPref = () => {
      reduced = !!(mq && mq.matches);
      if (reduced) {
        stop();
        /* One good static frame: parked just off full alignment, where the
           reveal is legible but the construction still reads as in motion. */
        psi = 0.55;
        tt = 3.1; // land the static frame partway through the small cycles too
        render();
      } else {
        start();
      }
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else if (visible) start();
    };

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        if (visible && !document.hidden) start();
        else stop();
      },
      { threshold: 0 }
    );
    io.observe(canvas);

    const ro = new ResizeObserver(() => {
      layout();
      if (reduced || !running) render();
    });
    ro.observe(canvas);

    layout();
    applyMotionPref();

    document.addEventListener('visibilitychange', onVisibility);
    if (mq) {
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', applyMotionPref);
      } else if (typeof mq.addListener === 'function') {
        mq.addListener(applyMotionPref);
      }
    }

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
        name: 'geometry',
        frames: (n = 1) => {
          layout();
          for (let i = 0; i < n; i++) frame(i * 16.667);
          cancelAnimationFrame(raf);
          raf = 0;
        }
      };
    }

    return () => {
      stop();
      repaint.current = null;
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      if (mq) {
        if (typeof mq.removeEventListener === 'function') {
          mq.removeEventListener('change', applyMotionPref);
        } else if (typeof mq.removeListener === 'function') {
          mq.removeListener(applyMotionPref);
        }
      }
      /* No loseContext: React remounts this very canvas node in StrictMode and
         a lost context never comes back. */
    };
  }, []);

  /* Under reduced motion there is no loop to pick up new props, so repaint on
     the values that actually change what is drawn. */
  useEffect(() => {
    const mq =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    if (mq && mq.matches && repaint.current) repaint.current();
  }, [intensity, progress, palette]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
      }}
    />
  );
}

/* ============================================================================
   Apollonian gasket, in unit space, built once at module scope cost.

   Four mutually tangent circles admit a second solution for each triple, and
   Descartes' theorem gives it without a square root once you already have four:
       k' = 2(k1 + k2 + k3) - k4
     z'k' = 2(z1k1 + z2k2 + z3k3) - z4k4
   The outer circle carries negative curvature, which is what makes the whole
   family close up inside it.
   ========================================================================== */
function buildGasket(out: Float32Array): number {
  let count = 0;

  const push = (k: number, x: number, y: number, d: number): boolean => {
    if (count >= MAX_CIRCLES) return false;
    const i = count * 4;
    out[i] = x;
    out[i + 1] = y;
    out[i + 2] = 1 / k;
    out[i + 3] = d;
    count++;
    return true;
  };

  const step = (
    k1: number, x1: number, y1: number,
    k2: number, x2: number, y2: number,
    k3: number, x3: number, y3: number,
    k4: number, x4: number, y4: number,
    depth: number
  ): void => {
    if (depth > GASKET_DEPTH || count >= MAX_CIRCLES) return;
    const k5 = 2 * (k1 + k2 + k3) - k4;
    /* k5 <= 0 means we regenerated the enclosing circle, not a new one. */
    if (k5 <= 0 || 1 / k5 < GASKET_MIN_R) return;
    const x5 = (2 * (k1 * x1 + k2 * x2 + k3 * x3) - k4 * x4) / k5;
    const y5 = (2 * (k1 * y1 + k2 * y2 + k3 * y3) - k4 * y4) / k5;
    if (!push(k5, x5, y5, depth)) return;
    step(k1, x1, y1, k2, x2, y2, k5, x5, y5, k3, x3, y3, depth + 1);
    step(k1, x1, y1, k3, x3, y3, k5, x5, y5, k2, x2, y2, depth + 1);
    step(k2, x2, y2, k3, x3, y3, k5, x5, y5, k1, x1, y1, depth + 1);
  };

  /* Three equal circles inscribed in the unit circle and mutually tangent:
     (1 - r) * sqrt(3) = 2r. */
  const rs = 2 * Math.sqrt(3) - 3;
  const ks = 1 / rs;
  const dc = 1 - rs;
  const sx = [0, 0, 0];
  const sy = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const t = -Math.PI / 2 + (i * TAU) / 3;
    sx[i] = dc * Math.cos(t);
    sy[i] = dc * Math.sin(t);
    push(ks, sx[i], sy[i], 0);
  }

  /* Outer circle: curvature -1, centred at the origin. */
  const ko = -1;
  step(ks, sx[0], sy[0], ks, sx[1], sy[1], ks, sx[2], sy[2], ko, 0, 0, 1);
  step(ko, 0, 0, ks, sx[1], sy[1], ks, sx[2], sy[2], ks, sx[0], sy[0], 1);
  step(ko, 0, 0, ks, sx[0], sy[0], ks, sx[2], sy[2], ks, sx[1], sy[1], 1);
  step(ko, 0, 0, ks, sx[0], sy[0], ks, sx[1], sy[1], ks, sx[2], sy[2], 1);

  return count;
}
