'use client';

/* ============================================================================
   Celestial — the navigation plate.

   A navigator's working surface rather than a planetarium: a graduated star
   plate pinned in the upper left, the sea horizon running low across the frame
   with a slow swell on it, rhumb lines fanning from a plotted position fix, and
   a sextant in the corner holding a sight on one named star.

   The node the rhumb lines radiate from carries a fix rather than a compass
   rose. A rose is map decoration — it says which way is north, which nothing
   else on this plate needed telling. Three position lines crossed at the node,
   leaving the small triangle they fail to close, say instead that somebody
   worked out where they were, which is what every other mark here is doing.

   The geometry is real, which is what keeps it from looking decorative:

   - Stars are unit vectors on a sphere in equatorial coordinates. Each frame
     they are rotated by local sidereal time (about the celestial pole) and then
     by the observer's latitude, and projected zenith-equidistant, so plate
     centre is the zenith and the limb is the horizon. That single transform
     buys everything: the sky wheels about the pole rather than about the middle
     of the disc, stars set through the limb instead of vanishing, and moving
     latitude genuinely lifts new figures over the edge.
   - Scroll velocity integrates into a latitude offset that decays back to a
     progress-driven base, so a hard scroll sails the observer north or south
     and different constellations come into view before it settles again. The
     same velocity rolls the sea horizon a fraction of a degree, like a deck.
   - The graduated bezel turns slowly against a fixed altitude/azimuth
     graticule. Instrument versus observer: that contrast is the whole idea.

   Legibility comes first. The disc is sized and placed so its limb never
   reaches the middle of the frame, the instruments sit at the edges, and every
   mark is additionally scaled by a quiet mask that collapses alpha through the
   central band where text lives.

   Palette discipline: nothing here glows. Brightness is carried by ink density
   and mark size, not by additive light, so the plate reads on white paper as
   well as it does on dark ink. Colour only ever comes from the five given
   values, resolved once into a table of pre-built rgba strings so that varying
   alpha per star costs a lookup rather than a string allocation.

   Two things keep the frame cost down, both measured rather than assumed:

   1. The sextant's graduated limb is a fixed drawing — only its index arm
      actually moves. It is painted once into a SMALL offscreen canvas sized to
      its own bounding box and blitted per frame. That turned the most expensive
      block in the frame into one drawImage call, at a cost of a few hundred KB
      rather than the tens of MB a full-size offscreen layer would have taken.
      The fix stayed inline: a dozen hairlines is cheaper to stroke than to
      store, and unlike the rose it has no rotation to be blitted through.
   2. Faint stars are the bulk of the field, and a canvas pays to re-parse a
      colour string every time fillStyle changes. So they are bucketed by
      colour and quantised alpha and emitted as one path per bucket: a few
      dozen fillStyle changes instead of several hundred.
   ========================================================================== */

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { BackdropProps } from './types';
import { toRgb, rgba, mulberry32 } from './types';

/* -------------------------------------------------------------------------- */
/* constants                                                                   */
/* -------------------------------------------------------------------------- */

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const DEG_PER_RAD = 180 / Math.PI;

const MAX_DPR = 2;

const N_SKY = 520; // stars carried on the celestial sphere
const N_LOOSE = 130; // stray screen-space stars, so the frame is sky not poster
const N_FIG = 9; // constellation figures
const FIG_MAX = 7; // segments budgeted per figure

const LEVELS = 128; // alpha quantisation for the pre-built colour table
const CYCLE = 15.5; // seconds: one figure draws in, holds, fades, rests
const FROZEN_T = 7.2; // the instant reduced-motion is served as a still

/** Indices into the colour table, mirroring BackdropPalette's field order. */
const C_SURFACE = 0;
const C_INK = 1;
const C_INK2 = 2;
const C_ACCENT = 3;
const C_ACCENT2 = 4;

/** Faint-star batching: 4 colour rows by 16 alpha steps over the faint range. */
const FAINT_MAX = 0.7;
const N_BUCKET = 16;
const N_BATCH = 4 * N_BUCKET;
const BRIGHT = 255; // sentinel: this star is drawn individually, not batched

/** Latitude sweep across the section, in radians. Roughly 58N down to 6N. */
const PHI_HI = 1.02;
const PHI_LO = 0.11;

const R1 = 32; // rhumb lines from the fix
const R2 = 16; // ...and from the secondary node

const CANVAS_STYLE: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: '100%',
  height: '100%',
  display: 'block',
  pointerEvents: 'none',
};

/* -------------------------------------------------------------------------- */
/* pure helpers — none of these allocate                                       */
/* -------------------------------------------------------------------------- */

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Quantise an alpha to a table row. Bit-or truncation beats Math.round here. */
function lv(a: number): number {
  const i = (a * (LEVELS - 1) + 0.5) | 0;
  return i < 0 ? 0 : i > LEVELS - 1 ? LEVELS - 1 : i;
}

/**
 * Resolve the palette into rgba strings once per theme swap. Five colours by
 * 128 alpha steps is a few hundred short strings — paid once, so that the frame
 * loop can vary opacity per star without ever building a string.
 */
function buildTable(hexes: string[]): string[][] {
  const out: string[][] = [];
  for (let c = 0; c < hexes.length; c++) {
    const rgb = toRgb(hexes[c]);
    const row: string[] = new Array(LEVELS);
    for (let i = 0; i < LEVELS; i++) row[i] = rgba(rgb, i / (LEVELS - 1));
    out.push(row);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* component                                                                   */
/* -------------------------------------------------------------------------- */

export default function Celestial({
  intensity,
  progress,
  velocity,
  palette,
  className,
}: BackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tableRef = useRef<string[][] | null>(null);
  const redrawRef = useRef<((t: number, dt: number) => void) | null>(null);
  const reducedRef = useRef(false);

  // Live props are read per frame through a ref so that scrolling never tears
  // down or reallocates anything. Written during render rather than in an
  // effect so the very next frame already sees the current scroll state.
  const propsRef = useRef({ intensity, progress, velocity });
  propsRef.current.intensity = intensity;
  propsRef.current.progress = progress;
  propsRef.current.velocity = velocity;

  // Declared before the main effect so that on mount the table exists before
  // the first frame runs, and so a theme swap rebuilds it in place.
  useEffect(() => {
    tableRef.current = buildTable([
      palette.surface,
      palette.ink,
      palette.ink2,
      palette.accent,
      palette.accent2,
    ]);
  }, [palette.surface, palette.ink, palette.ink2, palette.accent, palette.accent2]);

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const context = node.getContext('2d', { alpha: true });
    if (!context) return;
    // Re-bound with non-nullable types: narrowing does not survive into the
    // nested frame functions, and a null check per draw call is not free.
    const canvas: HTMLCanvasElement = node;
    const ctx: CanvasRenderingContext2D = context;

    /* ---------------------------------------------------------------- sky */

    const rng = mulberry32(0x5eed17);

    const eqx = new Float32Array(N_SKY);
    const eqy = new Float32Array(N_SKY);
    const eqz = new Float32Array(N_SKY);
    const mag = new Float32Array(N_SKY);
    // Perceptual weight. Raw magnitude is cubed-uniform, which is right for how
    // many stars there are but useless as a drawing parameter: it leaves the
    // median star at 0.12 and therefore invisible. This is the curve the mark
    // size and opacity are actually built from.
    const wgt = new Float32Array(N_SKY);
    const scol = new Uint8Array(N_SKY);
    const tph = new Float32Array(N_SKY);
    const trt = new Float32Array(N_SKY);

    for (let i = 0; i < N_SKY; i++) {
      // Uniform on the sphere: z uniform, then a ring at that height. Anything
      // simpler clumps at the poles and the wheeling gives it away instantly.
      const z = rng() * 2 - 1;
      const th = rng() * TAU;
      const s = Math.sqrt(Math.max(0, 1 - z * z));
      eqx[i] = s * Math.cos(th);
      eqy[i] = s * Math.sin(th);
      eqz[i] = z;

      // Cubed uniform approximates a luminosity function: a great many faint
      // stars, a handful worth naming.
      const b = rng() * rng() * rng();
      mag[i] = b;
      wgt[i] = Math.pow(b, 0.55);

      const u = rng();
      scol[i] =
        b > 0.55
          ? u < 0.12
            ? C_ACCENT
            : u < 0.3
              ? C_ACCENT2
              : C_INK
          : b > 0.18
            ? u < 0.1
              ? C_ACCENT2
              : C_INK
            : C_INK2;

      tph[i] = rng() * TAU;
      trt[i] = 1.1 + rng() * 2.6;
    }

    /* ----------------------------------------------------------- figures */

    // Figures are grown, not tabulated: seed on a bright unused star, then
    // repeatedly attach the best nearby unused star, sometimes branching off an
    // earlier node. Branching is what makes the result read as a drawn figure
    // rather than a polyline.
    const segA = new Int16Array(N_FIG * FIG_MAX);
    const segB = new Int16Array(N_FIG * FIG_MAX);
    const segStart = new Int32Array(N_FIG);
    const segCount = new Int32Array(N_FIG);
    const figPhase = new Float32Array(N_FIG);
    const figCol = new Uint8Array(N_FIG);
    const used = new Uint8Array(N_SKY);
    const nodes = new Int32Array(FIG_MAX + 1);

    const order: number[] = [];
    for (let i = 0; i < N_SKY; i++) order.push(i);
    order.sort((a, b) => mag[b] - mag[a]);

    const cosSep = Math.cos(0.34); // wider than this stops reading as one figure
    let segPtr = 0;
    let cursor = 0;

    for (let f = 0; f < N_FIG; f++) {
      segStart[f] = segPtr;
      segCount[f] = 0;
      figPhase[f] = rng() * CYCLE;
      figCol[f] = rng() < 0.22 ? C_ACCENT2 : C_INK2;

      let seed = -1;
      while (cursor < N_SKY) {
        const c = order[cursor++];
        if (!used[c] && mag[c] > 0.24) {
          seed = c;
          break;
        }
      }
      if (seed < 0) break;

      used[seed] = 1;
      nodes[0] = seed;
      let n = 1;
      const want = 3 + ((rng() * 4) | 0);

      for (let k = 0; k < want && n <= FIG_MAX; k++) {
        const from = nodes[rng() < 0.3 ? (rng() * n) | 0 : n - 1];
        const fx = eqx[from];
        const fy = eqy[from];
        const fz = eqz[from];
        let best = -1;
        let bestScore = -1;
        for (let j = 0; j < N_SKY; j++) {
          if (used[j]) continue;
          const d = fx * eqx[j] + fy * eqy[j] + fz * eqz[j];
          if (d < cosSep) continue;
          const score = mag[j] * 0.7 + (d - cosSep) * 0.9;
          if (score > bestScore) {
            bestScore = score;
            best = j;
          }
        }
        if (best < 0) break;
        used[best] = 1;
        nodes[n++] = best;
        segA[segPtr] = from;
        segB[segPtr] = best;
        segPtr++;
        segCount[f]++;
      }

      if (segCount[f] < 2) {
        // Too sparse to read as a figure; hand the stars back to the field.
        segPtr = segStart[f];
        segCount[f] = 0;
        for (let q = 0; q < n; q++) used[nodes[q]] = 0;
      }
    }

    /* ------------------------------------------------- per-frame scratch */

    const px = new Float32Array(N_SKY);
    const py = new Float32Array(N_SKY);
    const pa = new Float32Array(N_SKY);
    const prd = new Float32Array(N_SKY);
    const pup = new Float32Array(N_SKY);
    const pbk = new Uint8Array(N_SKY);

    const lux = new Float32Array(N_LOOSE);
    const luy = new Float32Array(N_LOOSE);
    const lub = new Float32Array(N_LOOSE);
    const lup = new Float32Array(N_LOOSE);
    const lax = new Float32Array(N_LOOSE);
    const lay = new Float32Array(N_LOOSE);
    const lbk = new Uint8Array(N_LOOSE);
    for (let i = 0; i < N_LOOSE; i++) {
      lux[i] = rng();
      luy[i] = rng();
      lub[i] = rng() * rng();
      lup[i] = rng() * TAU;
    }

    const r1c = new Float32Array(R1);
    const r1s = new Float32Array(R1);
    for (let i = 0; i < R1; i++) {
      const a = (i / R1) * TAU;
      r1c[i] = Math.cos(a);
      r1s[i] = Math.sin(a);
    }
    const r2c = new Float32Array(R2);
    const r2s = new Float32Array(R2);
    for (let i = 0; i < R2; i++) {
      const a = (i / R2) * TAU + 0.11;
      r2c[i] = Math.cos(a);
      r2s[i] = Math.sin(a);
    }

    // The three position lines of the fix. Bearings chosen to cut each other
    // at wide angles — a fix from three lines that nearly agree in direction is
    // a bad fix, and it looks like one. The offsets are what leaves the cocked
    // hat: three sights never quite meet, and a navigator plots the triangle
    // rather than pretending it away.
    const fixC = new Float32Array(3);
    const fixS = new Float32Array(3);
    const FIX_OFF = new Float32Array([-2.2, 2.7, -1.1]);
    {
      const bearings = [0.26, 1.33, 2.36];
      for (let i = 0; i < 3; i++) {
        fixC[i] = Math.cos(bearings[i]);
        fixS[i] = Math.sin(bearings[i]);
      }
    }

    // Numerals are pre-built for every value they can take, because a sextant
    // readout that allocates a string per frame is not worth having.
    const NUM: string[] = [];
    const DEGS: string[] = [];
    for (let i = 0; i <= 90; i++) {
      NUM.push(String(i));
      DEGS.push(i + '°');
    }
    const MINS: string[] = [];
    for (let i = 0; i < 60; i++) MINS.push((i < 10 ? '0' : '') + i + "'");

    const DASH = [2.5, 5];
    const SOLID: number[] = [];

    // Buckets are spaced by the square root of alpha, so the faint end — where
    // nearly every star lives — keeps its resolution instead of collapsing
    // into one or two indistinguishable steps.
    const bucketLv = new Int32Array(N_BUCKET);
    for (let k = 0; k < N_BUCKET; k++) {
      const t = (k + 0.5) / N_BUCKET;
      bucketLv[k] = lv(t * t * FAINT_MAX);
    }
    function bucketOf(a: number): number {
      const k = (Math.sqrt(a / FAINT_MAX) * N_BUCKET) | 0;
      return k < 0 ? 0 : k > N_BUCKET - 1 ? N_BUCKET - 1 : k;
    }

    // The four colour rows the batched star fills can use, in bucket order.
    const batchRow = new Int32Array([C_INK, C_INK2, C_ACCENT, C_ACCENT2]);
    function rowOf(c: number): number {
      return c === C_INK ? 0 : c === C_INK2 ? 1 : c === C_ACCENT ? 2 : 3;
    }

    /* ------------------------------------------------- offscreen furniture */

    const sextCan = document.createElement('canvas');
    const sextCtx = sextCan.getContext('2d');

    /* ------------------------------------------------------------ layout */

    let dpr = 1;
    let W = 0;
    let H = 0;
    let cx = 0;
    let cy = 0;
    let RAD = 0;
    let hy = 0; // sea horizon baseline
    let sxp = 0; // sextant pivot
    let syp = 0;
    let sra = 0; // sextant arc radius
    let rox = 0; // the fix, and the node the rhumb lines fan from
    let roy = 0;
    let ror = 0;
    let n2x = 0; // secondary rhumb node
    let n2y = 0;
    let fontSmall = '10px monospace';
    let fontTiny = '9px monospace';
    let hN = 0;
    let hxs = new Float32Array(1);
    let swl = new Float32Array(1);

    let sextL = 0; // pivot offset inside the sextant offscreen
    let sextT = 0;
    let sextW = 0;
    let sextH = 0;

    let furnTable: string[][] | null = null; // table the furniture was painted with
    let furnDirty = true;

    const arc0 = Math.PI * 1.02;
    const arc1 = Math.PI * 1.42;

    function layout(): void {
      const rect = canvas.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width));
      H = Math.max(1, Math.round(rect.height));
      dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);

      cx = W * 0.26;
      cy = H * 0.3;
      // The limb is the densest ring on the plate, so it must never sweep
      // through the middle of the frame where the text sits. Size caps alone
      // do not guarantee that on square-ish viewports, so the radius is also
      // held clear of the frame centre by an explicit margin.
      const dxc = W * 0.5 - cx;
      const dyc = H * 0.5 - cy;
      RAD = Math.min(W * 0.34, H * 0.36, Math.sqrt(dxc * dxc + dyc * dyc) * 0.86);

      hy = H * 0.8;

      sra = clamp(Math.min(W, H) * 0.185, 58, 150);
      sxp = W - sra * 0.34;
      syp = H * 0.895;

      ror = clamp(Math.min(W, H) * 0.055, 20, 46);
      // Derived from where the sextant's limb actually ends rather than from a
      // fixed fraction: on a narrow frame a fraction puts the fix inside the
      // arc, and the two instruments then read as one broken object.
      rox = clamp(sxp - sra - ror * 2.2, W * 0.36, W * 0.66);
      roy = hy + ror * 0.9;
      n2x = -W * 0.06;
      n2y = hy - Math.min(W, H) * 0.02;

      const fs = clamp(Math.round(Math.min(W, H) * 0.0145), 8, 12);
      fontSmall = fs + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
      fontTiny = Math.max(7, fs - 2) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';

      // 16px sampling still gives a dozen points across the shortest swell
      // harmonic, and halves the polyline cost of five stacked wave strokes.
      const want = Math.max(2, Math.ceil(W / 16) + 1);
      if (want !== hN) {
        hN = want;
        hxs = new Float32Array(hN);
        swl = new Float32Array(hN);
      }
      for (let i = 0; i < hN; i++) hxs[i] = (i / (hN - 1)) * W;

      sextL = sra + 22;
      sextT = sra + 22;
      sextW = Math.ceil(sextL + 18);
      sextH = Math.ceil(sextT + 22);
      sextCan.width = Math.round(sextW * dpr);
      sextCan.height = Math.round(sextH * dpr);

      furnDirty = true;
    }

    /**
     * Central legibility mask. Text lives in the middle band, so everything is
     * scaled down there and allowed to be itself out at the edges.
     */
    function quiet(x: number, y: number): number {
      const nx = Math.abs(x / W - 0.5) / 0.4;
      const ny = Math.abs(y / H - 0.5) / 0.46;
      let d = Math.sqrt(nx * nx * 0.9 + ny * ny * 1.1);
      if (d > 1) d = 1;
      return 0.26 + 0.74 * d * d;
    }

    /**
     * Paint the fixed instrument. Everything here depends only on layout and
     * palette, so it is repainted on resize or theme change and blitted the
     * rest of the time. Intensity is deliberately NOT baked in — it is applied
     * by the main context's globalAlpha at blit time.
     */
    function paintFurniture(): void {
      const T = tableRef.current;
      if (!T || !sextCtx) return;
      const INK2 = T[C_INK2];

      /* the sextant's graduated limb and frame; the index arm stays live */
      const qs = quiet(sxp, syp);
      sextCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sextCtx.clearRect(0, 0, sextW, sextH);
      sextCtx.lineJoin = 'round';
      sextCtx.strokeStyle = INK2[lv(0.34 * qs)];
      sextCtx.lineWidth = 1.1;
      sextCtx.beginPath();
      sextCtx.arc(sextL, sextT, sra, arc0, arc1);
      sextCtx.stroke();

      sextCtx.strokeStyle = INK2[lv(0.24 * qs)];
      sextCtx.lineWidth = 0.8;
      sextCtx.beginPath();
      for (let i = 0; i <= 30; i++) {
        const a = arc0 + ((arc1 - arc0) * i) / 30;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const inr = i % 5 === 0 ? sra * 0.9 : sra * 0.945;
        sextCtx.moveTo(sextL + ca * sra, sextT + sa * sra);
        sextCtx.lineTo(sextL + ca * inr, sextT + sa * inr);
      }
      // A sextant is a triangle, so show two sides of it.
      sextCtx.moveTo(sextL, sextT);
      sextCtx.lineTo(sextL + Math.cos(arc0) * sra, sextT + Math.sin(arc0) * sra);
      sextCtx.moveTo(sextL, sextT);
      sextCtx.lineTo(sextL + Math.cos(arc1) * sra, sextT + Math.sin(arc1) * sra);
      sextCtx.stroke();

      sextCtx.font = fontTiny;
      sextCtx.textAlign = 'center';
      sextCtx.textBaseline = 'middle';
      sextCtx.fillStyle = INK2[lv(0.3 * qs)];
      for (let i = 0; i <= 3; i++) {
        const t = i / 3;
        const a = arc0 + (arc1 - arc0) * t;
        sextCtx.fillText(
          NUM[(t * 90) | 0],
          sextL + Math.cos(a) * (sra + 11),
          sextT + Math.sin(a) * (sra + 11)
        );
      }

      furnTable = T;
      furnDirty = false;
    }

    /**
     * Stroke one swell line in chunks so its alpha can follow the quiet mask.
     * A single polyline would have to pick one opacity for its whole length,
     * and the horizon is the one mark that crosses the full width of the text.
     * Chunks overlap by a sample so the steps leave no gap.
     */
    function strokeWave(
      off: number,
      damp: number,
      alpha: number,
      row: string[],
      rollT: number,
      width: number,
      chunks: number
    ): void {
      ctx.lineWidth = width;
      const per = Math.max(1, Math.ceil((hN - 1) / chunks));
      for (let s = 0; s < hN - 1; s += per) {
        const e = Math.min(hN - 1, s + per);
        const midX = hxs[(s + e) >> 1];
        const a = alpha * quiet(midX, hy + off);
        if (a < 0.008) continue;
        ctx.strokeStyle = row[lv(a)];
        ctx.beginPath();
        for (let i = s; i <= e; i++) {
          const x = hxs[i];
          const y = hy + off + swl[i] * damp + (x - W * 0.5) * rollT;
          if (i === s) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    /* ------------------------------------------------------ frame state */

    let latOff = 0; // scroll-driven latitude excursion, decays home
    let rollS = 0; // smoothed deck roll
    let markIdx = -1; // the star the sextant is holding
    let markAt = -1e9;

    function draw(tSec: number, dt60: number): void {
      const T = tableRef.current;
      if (!T || W <= 0 || H <= 0) return;
      const p = propsRef.current;
      const inten = clamp(p.intensity, 0, 1);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (inten <= 0.002) return;

      if (furnDirty || furnTable !== T) paintFurniture();

      // One global multiply is the cleanest guarantee that intensity 0 leaves a
      // genuinely clear canvas, whatever any individual mark asks for.
      ctx.globalAlpha = inten;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'butt';

      const INK = T[C_INK];
      const INK2 = T[C_INK2];
      const ACC = T[C_ACCENT];
      const ACC2 = T[C_ACCENT2];
      const SURF = T[C_SURFACE];

      /* -- observer state ------------------------------------------------ */

      latOff += p.velocity * 0.0003 * dt60;
      latOff *= 1 - 0.015 * dt60;
      latOff = clamp(latOff, -0.55, 0.55);

      const phi = clamp(PHI_HI - p.progress * (PHI_HI - PHI_LO) + latOff, -0.42, 1.32);
      const lst = tSec * 0.0135 + p.progress * 1.15;
      const twist = tSec * 0.0045;

      rollS += (clamp(-p.velocity * 0.00035, -0.03, 0.03) - rollS) * 0.06 * dt60;

      const cosL = Math.cos(lst);
      const sinL = Math.sin(lst);
      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);

      /* -- project the sphere -------------------------------------------- */

      for (let i = 0; i < N_SKY; i++) {
        const x = eqx[i];
        const y = eqy[i];
        const z = eqz[i];
        // Rotate the frame by sidereal time about the pole...
        const qx = x * cosL + y * sinL;
        const qy = -x * sinL + y * cosL;
        // ...then tilt the pole to the observer's latitude. uz is altitude.
        const ux = qx * sinP - z * cosP;
        const uz = qx * cosP + z * sinP;
        pup[i] = uz;
        if (uz < -0.035) {
          pa[i] = 0;
          continue;
        }

        const alt = Math.asin(uz > 1 ? 1 : uz);
        const r = RAD * (1 - alt / HALF_PI);
        const az = Math.atan2(qy, ux) + twist;
        const sx = cx + r * Math.cos(az);
        const sy = cy + r * Math.sin(az);
        px[i] = sx;
        py[i] = sy;

        if (sx < -8 || sx > W + 8 || sy < -8 || sy > H + 8) {
          pa[i] = 0;
          continue;
        }

        // Scintillation is strongest at low altitude, which also happens to
        // animate the crowded limb where the eye is already looking.
        const low = uz < 0 ? 1 : uz > 1 ? 0 : 1 - uz;
        const g = wgt[i];
        let tw = 1 + (0.06 + 0.34 * low) * Math.sin(tSec * trt[i] + tph[i]);
        if (tw < 0.25) tw = 0.25;

        const a = (0.13 + 0.8 * g) * tw * smoothstep(-0.035, 0.06, uz) * quiet(sx, sy);
        pa[i] = a;
        prd[i] = 0.55 + 1.9 * g * g;
        // Only the top fifth of the field is worth an individual mark; the rest
        // batches, which is both far cheaper and, at these sizes, identical.
        pbk[i] =
          a < 0.008 ? BRIGHT : g > 0.72 ? BRIGHT : rowOf(scol[i]) * N_BUCKET + bucketOf(a);
      }

      /* -- loose sky ------------------------------------------------------ */

      for (let i = 0; i < N_LOOSE; i++) {
        const x = lux[i] * W + Math.sin(tSec * 0.05 + lup[i]) * 6;
        const y = luy[i] * H * 0.94;
        lax[i] = x;
        lay[i] = y;
        if (y > hy - 2) {
          lbk[i] = BRIGHT;
          continue;
        }
        const tw = 1 + 0.28 * Math.sin(tSec * (1.4 + lub[i] * 2) + lup[i]);
        const a = (0.1 + 0.4 * lub[i]) * tw * quiet(x, y);
        lbk[i] = a < 0.008 ? BRIGHT : bucketOf(a);
      }
      for (let k = 0; k < N_BUCKET; k++) {
        let any = false;
        for (let i = 0; i < N_LOOSE; i++) {
          if (lbk[i] !== k) continue;
          if (!any) {
            ctx.beginPath();
            any = true;
          }
          ctx.rect(lax[i] - 0.55, lay[i] - 0.55, 1.1, 1.1);
        }
        if (any) {
          ctx.fillStyle = INK2[bucketLv[k]];
          ctx.fill();
        }
      }

      /* -- sea ------------------------------------------------------------ */

      // Three harmonics at incommensurate rates: the swell never repeats on any
      // interval a reader could notice.
      for (let i = 0; i < hN; i++) {
        const x = hxs[i];
        swl[i] =
          Math.sin(x * 0.0062 + tSec * 0.21) * 5 +
          Math.sin(x * 0.0143 - tSec * 0.13) * 2.6 +
          Math.sin(x * 0.0291 + tSec * 0.34) * 1.2;
      }
      const rollT = Math.tan(rollS);

      ctx.beginPath();
      ctx.moveTo(0, hy + swl[0] - W * 0.5 * rollT);
      for (let i = 1; i < hN; i++) {
        ctx.lineTo(hxs[i], hy + swl[i] + (hxs[i] - W * 0.5) * rollT);
      }
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fillStyle = INK2[lv(0.05)];
      ctx.fill();

      /* -- rhumb lines ---------------------------------------------------- */

      // Bands of decreasing alpha stand in for a fade along each line, and the
      // longer bands drop the steeply upward bearings so the top of the frame
      // stays empty.
      const far = Math.max(W, H) * 1.5;
      ctx.lineWidth = 0.7;
      for (let band = 0; band < 3; band++) {
        const r0 = band === 0 ? ror * 1.45 : band === 1 ? far * 0.17 : far * 0.42;
        const rEnd = band === 0 ? far * 0.17 : band === 1 ? far * 0.42 : far;
        // Rhumb lines are chart furniture and the chart is the water, so no
        // band is allowed to fan up into the sky; the long bands additionally
        // thin to every other bearing.
        const limit = band === 0 ? -0.1 : band === 1 ? 0.02 : 0.06;
        const step = band === 2 ? 2 : 1;
        ctx.strokeStyle = INK2[lv(band === 0 ? 0.055 : band === 1 ? 0.036 : 0.024)];
        ctx.beginPath();
        for (let i = 0; i < R1; i += step) {
          if (r1s[i] < limit) continue;
          ctx.moveTo(rox + r1c[i] * r0, roy + r1s[i] * r0);
          ctx.lineTo(rox + r1c[i] * rEnd, roy + r1s[i] * rEnd);
        }
        for (let i = 0; i < R2; i++) {
          if (r2s[i] < limit) continue;
          ctx.moveTo(n2x + r2c[i] * r0 * 0.7, n2y + r2s[i] * r0 * 0.7);
          ctx.lineTo(n2x + r2c[i] * rEnd * 0.7, n2y + r2s[i] * rEnd * 0.7);
        }
        ctx.stroke();
      }

      /* -- swell contours and the horizon itself -------------------------- */

      for (let c = 0; c < 3; c++) {
        const off = 18 + c * 26;
        if (hy + off > H + 4) break;
        strokeWave(off, 0.7 - c * 0.17, 0.16 - c * 0.04, INK2, rollT, 0.8, 5);
      }
      strokeWave(0, 1, 0.36, INK, rollT, 1, 8);

      /* -- position fix ---------------------------------------------------- */

      // Three position lines crossed at the node the rhumbs already fan from,
      // with the cocked hat they leave, and the fix ringed inside it. Fixed to
      // the earth while the plate above turns with the sky: the whole plate is
      // one worked sight, and this is where it came out.
      const qf = quiet(rox, roy);
      const lopLen = ror * 1.45;
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = INK2[lv(0.2 * qf)];
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const ca = fixC[i];
        const sa = fixS[i];
        // Offset along the line's own normal, so each sight passes to one side
        // of the true position rather than through it.
        const ox = -sa * FIX_OFF[i];
        const oy = ca * FIX_OFF[i];
        ctx.moveTo(rox + ox - ca * lopLen, roy + oy - sa * lopLen);
        ctx.lineTo(rox + ox + ca * lopLen, roy + oy + sa * lopLen);
        // The single cross-tick a plotted bearing carries near its outer end.
        const tx = rox + ox + ca * lopLen * 0.66;
        const ty = roy + oy + sa * lopLen * 0.66;
        ctx.moveTo(tx + sa * 2.6, ty - ca * 2.6);
        ctx.lineTo(tx - sa * 2.6, ty + ca * 2.6);
      }
      ctx.stroke();

      const fixR = Math.max(3.4, ror * 0.2);
      ctx.strokeStyle = ACC[lv(0.34 * qf)];
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(rox + fixR, roy);
      ctx.arc(rox, roy, fixR, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = ACC[lv(0.4 * qf)];
      ctx.beginPath();
      ctx.arc(rox, roy, 1.3, 0, TAU);
      ctx.fill();

      /* -- plate: graticule, then the turning bezel ------------------------ */

      ctx.strokeStyle = INK2[lv(0.055)];
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx + RAD / 3, cy);
      ctx.arc(cx, cy, RAD / 3, 0, TAU);
      ctx.moveTo(cx + (RAD * 2) / 3, cy);
      ctx.arc(cx, cy, (RAD * 2) / 3, 0, TAU);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * RAD, cy + Math.sin(a) * RAD);
      }
      ctx.stroke();

      ctx.strokeStyle = INK[lv(0.16)];
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(cx + RAD, cy);
      ctx.arc(cx, cy, RAD, 0, TAU);
      ctx.moveTo(cx + RAD * 1.035, cy);
      ctx.arc(cx, cy, RAD * 1.035, 0, TAU);
      ctx.stroke();

      ctx.strokeStyle = INK2[lv(0.19)];
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 0; i < 72; i++) {
        const a = twist * 0.55 + (i / 72) * TAU;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const out = i % 3 === 0 ? RAD * 1.062 : RAD * 1.035;
        ctx.moveTo(cx + ca * RAD, cy + sa * RAD);
        ctx.lineTo(cx + ca * out, cy + sa * out);
      }
      ctx.stroke();

      /* -- constellation figures ------------------------------------------- */

      ctx.lineWidth = 0.85;
      for (let f = 0; f < N_FIG; f++) {
        const n = segCount[f];
        if (n < 2) continue;
        const u = ((tSec + figPhase[f]) % CYCLE) / CYCLE;
        if (u >= 0.84) continue;
        const amp = u < 0.62 ? 1 : 1 - (u - 0.62) / 0.22;
        const reveal = u < 0.3 ? u / 0.3 : 1;
        const base = segStart[f];
        const row = figCol[f] === C_ACCENT2 ? ACC2 : INK2;

        for (let s = 0; s < n; s++) {
          const ia = segA[base + s];
          const ib = segB[base + s];
          if (pa[ia] <= 0 || pa[ib] <= 0) continue;
          let lt = reveal * n - s;
          if (lt <= 0) continue;
          if (lt > 1) lt = 1;
          lt = lt * lt * (3 - 2 * lt);

          const ax = px[ia];
          const ay = py[ia];
          const bx = ax + (px[ib] - ax) * lt;
          const by = ay + (py[ib] - ay) * lt;
          const a = amp * 0.3 * quiet((ax + bx) * 0.5, (ay + by) * 0.5);
          if (a < 0.008) continue;
          ctx.strokeStyle = row[lv(a)];
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }

      /* -- the stars ------------------------------------------------------- */

      // Faint stars first, one path per colour and alpha bucket. Overlapping
      // rects inside a single fill composite once, which is also more correct
      // than stacking separate fillRects.
      for (let k = 0; k < N_BATCH; k++) {
        let any = false;
        for (let i = 0; i < N_SKY; i++) {
          if (pbk[i] !== k) continue;
          if (!any) {
            ctx.beginPath();
            any = true;
          }
          // Floor the mark at a whole pixel: below that the rect lands between
          // sample points and the star simply disappears.
          const side = Math.max(1, prd[i] * 1.2);
          ctx.rect(px[i] - side * 0.5, py[i] - side * 0.5, side, side);
        }
        if (any) {
          ctx.fillStyle = T[batchRow[(k / N_BUCKET) | 0]][bucketLv[k % N_BUCKET]];
          ctx.fill();
        }
      }

      // Then the named stars, which are few enough to deserve their own marks.
      for (let i = 0; i < N_SKY; i++) {
        if (pbk[i] !== BRIGHT) continue;
        const a = pa[i];
        if (a < 0.008) continue;
        const x = px[i];
        const y = py[i];
        const r = prd[i];
        const ci = scol[i];
        const row = ci === C_ACCENT ? ACC : ci === C_ACCENT2 ? ACC2 : ci === C_INK2 ? INK2 : INK;

        ctx.fillStyle = row[lv(a)];
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();

        // A drawn cross rather than a halo. On white paper a halo is invisible;
        // a cross is a mark either way.
        if (wgt[i] > 0.88) {
          const sp = r * 3.4;
          ctx.strokeStyle = row[lv(a * 0.42)];
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(x - sp, y);
          ctx.lineTo(x + sp, y);
          ctx.moveTo(x, y - sp);
          ctx.lineTo(x, y + sp);
          ctx.stroke();
        }
      }

      /* -- the sight ------------------------------------------------------- */

      // Re-choose the star under observation only every few seconds, and only
      // when the current one is well clear of the horizon, so the sextant holds
      // a sight instead of twitching between candidates.
      if (markIdx < 0 || pa[markIdx] <= 0 || pup[markIdx] < 0.16 || tSec - markAt > 6.5) {
        let best = -1;
        let bestScore = 0.2;
        for (let i = 0; i < N_SKY; i++) {
          if (pa[i] <= 0 || pup[i] < 0.3) continue;
          const s = mag[i] + (px[i] > W * 0.1 ? 0.05 : 0);
          if (s > bestScore) {
            bestScore = s;
            best = i;
          }
        }
        if (best >= 0) {
          markIdx = best;
          markAt = tSec;
        }
      }

      let altDeg = 0;
      const qs = quiet(sxp, syp);

      if (markIdx >= 0 && pa[markIdx] > 0) {
        const mx = px[markIdx];
        const my = py[markIdx];
        altDeg = clamp(Math.asin(clamp(pup[markIdx], -1, 1)) * DEG_PER_RAD, 0, 90);

        // The sight runs toward the star but is cut back to a stub: drawn in
        // full it would rule a diagonal straight through the column of text.
        const dx = mx - sxp;
        const dy = my - syp;
        const dLen = Math.sqrt(dx * dx + dy * dy) || 1;
        const stub = Math.min(dLen * 0.4, sra * 2.1);
        ctx.setLineDash(DASH);
        ctx.strokeStyle = ACC2[lv(0.24 * qs)];
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(sxp, syp);
        ctx.lineTo(sxp + (dx / dLen) * stub, syp + (dy / dLen) * stub);
        ctx.stroke();
        ctx.setLineDash(SOLID);

        const ring = 5 + prd[markIdx] * 1.6;
        ctx.strokeStyle = ACC2[lv(0.34 * quiet(mx, my))];
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(mx, my, ring, 0, TAU);
        ctx.moveTo(mx - ring * 1.9, my);
        ctx.lineTo(mx - ring * 1.25, my);
        ctx.moveTo(mx + ring * 1.25, my);
        ctx.lineTo(mx + ring * 1.9, my);
        ctx.stroke();
      }

      /* -- sextant --------------------------------------------------------- */

      if (sextCan.width > 0) ctx.drawImage(sextCan, sxp - sextL, syp - sextT, sextW, sextH);

      const armA = arc0 + (arc1 - arc0) * (altDeg / 90);
      const armC = Math.cos(armA);
      const armS = Math.sin(armA);
      ctx.strokeStyle = ACC[lv(0.42 * qs)];
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sxp, syp);
      ctx.lineTo(sxp + armC * sra * 1.02, syp + armS * sra * 1.02);
      ctx.stroke();

      ctx.fillStyle = ACC[lv(0.42 * qs)];
      ctx.beginPath();
      ctx.arc(sxp, syp, 2.4, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sxp + armC * sra * 0.62, syp + armS * sra * 0.62, 1.8, 0, TAU);
      ctx.fill();

      const dInt = altDeg | 0;
      const mInt = clamp(((altDeg - dInt) * 60) | 0, 0, 59);

      // Surface, used once, as a hairline reserve under the readout: it lifts
      // the numerals off whatever the swell is doing behind them.
      ctx.strokeStyle = SURF[lv(0.3 * qs)];
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      // Below the pivot and clear of the index arm, clamped so the readout
      // never falls off a short frame.
      const ry = Math.min(syp + 22, H - 7);
      ctx.moveTo(sxp - 62, ry + 4);
      ctx.lineTo(sxp - 4, ry + 4);
      ctx.stroke();

      ctx.font = fontSmall;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = INK[lv(0.34 * qs)];
      ctx.fillText(DEGS[dInt], sxp - 26, ry);
      ctx.fillStyle = INK2[lv(0.28 * qs)];
      ctx.fillText(MINS[mInt], sxp - 4, ry);

      ctx.globalAlpha = 1;
    }

    redrawRef.current = draw;

    /* --------------------------------------------------------- lifecycle */

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedRef.current = mq.matches;

    let raf = 0;
    let running = false;
    let last = 0;
    let clock = 0;
    let onScreen = true;

    function frame(now: number): void {
      raf = requestAnimationFrame(frame);
      const dtMs = last ? Math.min(50, now - last) : 16.7;
      last = now;
      clock += dtMs / 1000;
      draw(clock, dtMs / 16.7);
    }

    function stop(): void {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    }

    function sync(): void {
      const want = onScreen && !document.hidden && !reducedRef.current;
      if (want && !running) {
        running = true;
        last = 0;
        raf = requestAnimationFrame(frame);
      } else if (!want) {
        stop();
        // A backdrop that is merely paused must still be correct on screen.
        if (onScreen && reducedRef.current) draw(FROZEN_T, 0);
      }
    }

    layout();
    draw(reducedRef.current ? FROZEN_T : 0, 0);

    const onVis = (): void => sync();
    document.addEventListener('visibilitychange', onVis);

    const onMq = (): void => {
      reducedRef.current = mq.matches;
      sync();
    };
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onMq);
    else mq.addListener(onMq);

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          onScreen = entries[entries.length - 1].isIntersecting;
          sync();
        },
        { rootMargin: '96px' }
      );
      io.observe(canvas);
    }

    let ro: ResizeObserver | null = null;
    const onResize = (): void => {
      layout();
      if (!running) draw(reducedRef.current ? FROZEN_T : clock, 0);
    };
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onResize);
      ro.observe(canvas);
    } else {
      window.addEventListener('resize', onResize);
    }

    sync();

    /*
     * Dev-only handle, identical across every world.
     *
     * The Browser pane reports `document.hidden` and never composites, so rAF
     * never fires and the IntersectionObserver reports the canvas as never on
     * screen. Without a way to drive a frame by hand there is no way to find
     * out what a world actually draws — which is exactly how Fluid came to be
     * shipped invisible. See docs/spec.md section 8.
     */
    if (process.env.NODE_ENV !== 'production') {
      (canvas as unknown as Record<string, unknown>).__world = {
        name: 'celestial',
        frames: (n = 1) => {
          for (let i = 0; i < n; i++) frame(i * 16.667);
          cancelAnimationFrame(raf);
          raf = 0;
        }
      };
    }

    return () => {
      stop();
      redrawRef.current = null;
      document.removeEventListener('visibilitychange', onVis);
      if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onMq);
      else mq.removeListener(onMq);
      if (io) io.disconnect();
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', onResize);
      // Release the offscreen backing store; it is ours alone, unlike the
      // visible canvas, which React may remount.
      sextCan.width = 0;
      sextCan.height = 0;
      // Deliberately no loseContext(): React reuses the visible node across a
      // StrictMode double mount and a lost context never comes back.
    };
  }, []);

  // Under reduced motion there is no loop, so the still frame is re-rendered
  // when props change. That keeps the fade between backdrops working without
  // putting any motion on screen.
  useEffect(() => {
    if (!reducedRef.current) return;
    const redraw = redrawRef.current;
    if (redraw) redraw(FROZEN_T, 0);
  });

  return <canvas ref={canvasRef} className={className} style={CANVAS_STYLE} aria-hidden="true" />;
}
