'use client';

/* ============================================================================
   Topography — THE GROUND.

   A topographic survey that redraws itself. The terrain is a real scalar field
   (Perlin fBm plus a ridged octave plus a summit that follows the reader), and
   the contours come out of real MARCHING SQUARES over that field. That matters:
   concentric ellipses would read as a logo, whereas marching squares over land
   genuinely branches, closes, and forms saddles, because those are properties
   of the field rather than of the drawing code.

   Everything is scan-order and preallocated. Nothing in the frame loop
   allocates: the field, the segment buffer, the label slots and the spot
   heights are all sized once at setup.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import type { BackdropProps } from './types';
import { toRgb, rgba, mulberry32, backdropDpr } from './types';

/* --- survey constants ---------------------------------------------------- */

const MAX_COLS = 170;
const MAX_ROWS = 140;
const MIN_CELL = 15; // field sample spacing in CSS px; smaller = smoother lines
const MAX_SEG = 60000;
const SEG_STRIDE = 5; // ax, ay, bx, by, levelIndex

const LEVELS = 46;
const LEVEL_MIN = -1.1;
const LEVEL_STEP = 0.11;
const INDEX_EVERY = 5; // heavier line every fifth contour, as on a real sheet

/** Contour interval in metres, and the elevation of level 0. */
const INTERVAL_M = 20;
const BASE_M = 100;

const MAX_LABELS = 6;
const MAX_SPOTS = 4;
const LABEL_GAP = 21; // radius of the break burned into the line for a figure

/** World units per CSS pixel. Tuned so ~6 landform features span a frame. */
const WSCALE = 0.005;
const GRATICULE = 148;

/* Number strings are built once so that drawing a figure never allocates. */
const NUM_STR: string[] = [];
for (let i = 0; i < 1600; i++) NUM_STR.push(String(i));

/* Index-contour labels are fixed per level, so resolve them once too. */
const LEVEL_LABEL: string[] = [];
for (let k = 0; k < LEVELS; k++) LEVEL_LABEL.push(String(BASE_M + k * INTERVAL_M));

const FONT_CONTOUR = '500 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const FONT_SPOT = '500 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const FONT_BEARING = '600 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/* --- noise --------------------------------------------------------------- */

/** Shuffled once at module load; a fixed seed keeps the land stable on resize. */
const PERM = (function buildPerm(): Uint8Array {
  const src = new Uint8Array(256);
  for (let i = 0; i < 256; i++) src[i] = i;
  const rnd = mulberry32(20260824);
  for (let i = 255; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = src[i];
    src[i] = src[j];
    src[j] = t;
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = src[i & 255];
  return p;
})();

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Four diagonal gradients. Cheaper than a dot product and visually identical here. */
function grad2(h: number, x: number, y: number): number {
  const g = h & 3;
  if (g === 0) return x + y;
  if (g === 1) return y - x;
  if (g === 2) return x - y;
  return -x - y;
}

function perlin(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const X = xi & 255;
  const Y = yi & 255;
  const u = fade(xf);
  const v = fade(yf);
  const pa = PERM[X] + Y;
  const pb = PERM[X + 1] + Y;
  const n00 = grad2(PERM[pa], xf, yf);
  const n10 = grad2(PERM[pb], xf - 1, yf);
  const n01 = grad2(PERM[pa + 1], xf, yf - 1);
  const n11 = grad2(PERM[pb + 1], xf - 1, yf - 1);
  const a = n00 + u * (n10 - n00);
  const b = n01 + u * (n11 - n01);
  return a + v * (b - a);
}

/* Per-octave drift vectors: the land evolves by sliding each octave in its own
   direction, which is far cheaper than a third noise dimension and reads the
   same at these speeds. */
const OCT_F = [1.0, 2.03, 4.11, 8.27];
const OCT_DX = [0.11, -0.07, 0.05, -0.03];
const OCT_DY = [-0.05, 0.09, -0.12, 0.06];

function terrain(x: number, y: number, td: number): number {
  let s = 0;
  let a = 0.6;
  for (let o = 0; o < 4; o++) {
    const f = OCT_F[o];
    s += a * perlin(x * f + OCT_DX[o] * td, y * f + OCT_DY[o] * td);
    a *= 0.44;
  }
  // A ridged octave adds crest lines. Without it the contours read as blobs;
  // with it they read as land, because real ground has arêtes and spurs.
  const r = 1 - Math.abs(perlin(x * 1.15 + 4.3 + 0.04 * td, y * 1.15 - 2.1));
  return s + 0.2 * (r * r - 0.55);
}

/* ========================================================================== */

export default function Topography({
  intensity,
  progress,
  velocity,
  palette,
  className,
}: BackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Latest props without re-running the effect; the loop reads these each frame.
  const intensityRef = useRef(intensity);
  const progressRef = useRef(progress);
  const velocityRef = useRef(velocity);
  intensityRef.current = intensity;
  progressRef.current = progress;
  velocityRef.current = velocity;

  const staticDrawRef = useRef<(() => void) | null>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (): void => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const { surface, ink, ink2, accent, accent2 } = palette;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cSurf = toRgb(surface);
    const cInk = toRgb(ink);
    const cInk2 = toRgb(ink2);
    const cAcc = toRgb(accent);
    const cAcc2 = toRgb(accent2);

    /* --- preallocation. Nothing below this point is allocated per frame. --- */
    const fld = new Float32Array((MAX_COLS + 1) * (MAX_ROWS + 1));
    const seg = new Float32Array(MAX_SEG * SEG_STRIDE);
    const labX = new Float32Array(MAX_LABELS);
    const labY = new Float32Array(MAX_LABELS);
    const labA = new Float32Array(MAX_LABELS);
    const labK = new Int32Array(MAX_LABELS);
    const slotUsed = new Uint8Array(9);
    const spotX = new Float32Array(MAX_SPOTS);
    const spotY = new Float32Array(MAX_SPOTS);
    const spotV = new Float32Array(MAX_SPOTS);

    let cssW = 0;
    let cssH = 0;
    let cell = MIN_CELL;
    let cols = 0;
    let rows = 0;
    let stride = 0;
    let mask: CanvasGradient | null = null;

    let segN = 0;
    let labN = 0;
    let spotN = 0;

    let t = 0;
    let last = 0;
    let velSmooth = 0;
    let lead = 0;
    let needle = 0;
    let raf = 0;
    let running = false;
    let visible = true;
    let clearedAtZero = false;
    let tick = 0;

    function resize(): void {
      const r = canvas!.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      const dpr = backdropDpr();
      cssW = w;
      cssH = h;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      // Draw in CSS pixels; the transform absorbs DPR once rather than per call.
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Butt caps rather than round: the marching-squares segments already meet
      // end to end on shared cell edges, so caps buy nothing visible at these
      // line widths and cost about twice as much to raster.
      ctx!.lineCap = 'butt';
      ctx!.lineJoin = 'bevel';

      // Grow the sample spacing rather than the buffers, so the field never
      // outruns the memory reserved for it on a very large display.
      cell = Math.max(MIN_CELL, Math.ceil(w / MAX_COLS), Math.ceil(h / MAX_ROWS));
      cols = Math.min(MAX_COLS, Math.ceil(w / cell) + 1);
      rows = Math.min(MAX_ROWS, Math.ceil(h / cell) + 1);
      stride = cols + 1;

      // The reading column runs down the middle, so the whole survey is erased
      // back there after drawing. Cheaper and more even than masking per stroke.
      const g = ctx!.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, rgba(cSurf, 0));
      g.addColorStop(0.2, rgba(cSurf, 0));
      g.addColorStop(0.36, rgba(cSurf, 0.5));
      g.addColorStop(0.5, rgba(cSurf, 0.62));
      g.addColorStop(0.64, rgba(cSurf, 0.5));
      g.addColorStop(0.8, rgba(cSurf, 0));
      g.addColorStop(1, rgba(cSurf, 0));
      mask = g;
      clearedAtZero = false;
      tick = 0;
    }

    function pushSeg(ax: number, ay: number, bx: number, by: number, k: number): void {
      if (segN >= MAX_SEG) return;
      const o = segN * SEG_STRIDE;
      seg[o] = ax;
      seg[o + 1] = ay;
      seg[o + 2] = bx;
      seg[o + 3] = by;
      seg[o + 4] = k;
      segN++;
    }

    function nearLabel(x: number, y: number): boolean {
      for (let q = 0; q < labN; q++) {
        const dx = labX[q] - x;
        const dy = labY[q] - y;
        if (dx * dx + dy * dy < LABEL_GAP * LABEL_GAP) return true;
      }
      return false;
    }

    /** Sample the terrain onto the grid. Returns the highest value found. */
    function buildField(td: number, offX: number, offY: number, sx: number, sy: number, sr: number): number {
      const inv = 1 / (sr * sr);
      let mx = -1e9;
      for (let j = 0; j <= rows; j++) {
        const py = j * cell;
        const wy = (py + offY) * WSCALE;
        const dy = py - sy;
        const dy2 = dy * dy;
        // A gentle regional tilt keeps the sheet from reading as a flat sea.
        const tilt = (py / cssH - 0.5) * 0.34;
        const row = j * stride;
        for (let i = 0; i <= cols; i++) {
          const px = i * cell;
          const dx = px - sx;
          const q = (dx * dx + dy2) * inv;
          // Broad shoulder plus a tight cone: the summit that tracks the reader.
          const bump = 0.92 * Math.exp(-q * 1.5) + 0.38 * Math.exp(-q * 6);
          fld[row + i] = terrain((px + offX) * WSCALE, wy, td) + bump - tilt;
          if (fld[row + i] > mx) mx = fld[row + i];
        }
      }
      return mx;
    }

    /** Marching squares, one pass over the cells, all crossed levels per cell. */
    function march(): void {
      segN = 0;
      for (let j = 0; j < rows; j++) {
        const ra = j * stride;
        const rb = ra + stride;
        const y0 = j * cell;
        for (let i = 0; i < cols; i++) {
          const v0 = fld[ra + i];
          const v1 = fld[ra + i + 1];
          const v2 = fld[rb + i + 1];
          const v3 = fld[rb + i];

          let mn = v0;
          let mx = v0;
          if (v1 < mn) mn = v1;
          if (v1 > mx) mx = v1;
          if (v2 < mn) mn = v2;
          if (v2 > mx) mx = v2;
          if (v3 < mn) mn = v3;
          if (v3 > mx) mx = v3;

          // Only levels that actually cross this cell are considered, which
          // turns cells x levels into cells x ~1.3 and is what makes 46 levels
          // affordable at full frame rate.
          let k0 = Math.ceil((mn - LEVEL_MIN) / LEVEL_STEP);
          let k1 = Math.floor((mx - LEVEL_MIN) / LEVEL_STEP);
          if (k0 < 0) k0 = 0;
          if (k1 > LEVELS - 1) k1 = LEVELS - 1;
          if (k1 < k0) continue;

          const x0 = i * cell;
          const ctr = (v0 + v1 + v2 + v3) * 0.25;

          for (let k = k0; k <= k1; k++) {
            const L = LEVEL_MIN + k * LEVEL_STEP;
            const c =
              (v0 > L ? 8 : 0) | (v1 > L ? 4 : 0) | (v2 > L ? 2 : 0) | (v3 > L ? 1 : 0);
            if (c === 0 || c === 15) continue;

            const xT = x0 + cell * ((L - v0) / (v1 - v0));
            const yT = y0;
            const xR = x0 + cell;
            const yR = y0 + cell * ((L - v1) / (v2 - v1));
            const xB = x0 + cell * ((L - v3) / (v2 - v3));
            const yB = y0 + cell;
            const xL = x0;
            const yL = y0 + cell * ((L - v0) / (v3 - v0));

            switch (c) {
              case 1:
              case 14:
                pushSeg(xL, yL, xB, yB, k);
                break;
              case 2:
              case 13:
                pushSeg(xB, yB, xR, yR, k);
                break;
              case 3:
              case 12:
                pushSeg(xL, yL, xR, yR, k);
                break;
              case 4:
              case 11:
                pushSeg(xT, yT, xR, yR, k);
                break;
              case 6:
              case 9:
                pushSeg(xT, yT, xB, yB, k);
                break;
              case 7:
              case 8:
                pushSeg(xL, yL, xT, yT, k);
                break;
              // The two ambiguous cases are the saddles. Resolving them with the
              // cell average (rather than always the same way) is what lets
              // ridges join and cols form instead of pinching off arbitrarily.
              case 5:
                if (ctr > L) {
                  pushSeg(xL, yL, xT, yT, k);
                  pushSeg(xB, yB, xR, yR, k);
                } else {
                  pushSeg(xL, yL, xB, yB, k);
                  pushSeg(xT, yT, xR, yR, k);
                }
                break;
              case 10:
                if (ctr > L) {
                  pushSeg(xT, yT, xR, yR, k);
                  pushSeg(xL, yL, xB, yB, k);
                } else {
                  pushSeg(xL, yL, xT, yT, k);
                  pushSeg(xB, yB, xR, yR, k);
                }
                break;
              default:
                break;
            }
          }
        }
      }
    }

    /** Pick label anchors on index contours, one per coarse slot, centre column left free. */
    function chooseLabels(): void {
      labN = 0;
      for (let s = 0; s < 9; s++) slotUsed[s] = 0;
      const m = 30;
      const cw = cssW / 3;
      const ch = cssH / 3;
      for (let s = 0; s < segN && labN < MAX_LABELS; s++) {
        const o = s * SEG_STRIDE;
        const k = seg[o + 4];
        if (k % INDEX_EVERY !== 0) continue;
        const ax = seg[o];
        const ay = seg[o + 1];
        const bx = seg[o + 2];
        const by = seg[o + 3];
        const mx = (ax + bx) * 0.5;
        const my = (ay + by) * 0.5;
        if (mx < m || mx > cssW - m || my < m || my > cssH - m) continue;
        let sc = (mx / cw) | 0;
        let sr = (my / ch) | 0;
        if (sc > 2) sc = 2;
        if (sr > 2) sr = 2;
        if (sc === 1) continue; // never set a figure in the reading column
        const slot = sr * 3 + sc;
        if (slotUsed[slot]) continue;
        slotUsed[slot] = 1;
        let a = Math.atan2(by - ay, bx - ax);
        if (a > Math.PI / 2) a -= Math.PI;
        else if (a < -Math.PI / 2) a += Math.PI;
        labX[labN] = mx;
        labY[labN] = my;
        labA[labN] = a;
        labK[labN] = k | 0;
        labN++;
      }
    }

    /** Local maxima of the field, taken at stride 2 and kept well separated. */
    function findSpots(): void {
      spotN = 0;
      for (let j = 2; j < rows - 1; j += 2) {
        const row = j * stride;
        const up = (j - 2) * stride;
        const dn = (j + 2) * stride;
        for (let i = 2; i < cols - 1; i += 2) {
          const v = fld[row + i];
          if (
            v <= fld[row + i - 2] ||
            v <= fld[row + i + 2] ||
            v <= fld[up + i] ||
            v <= fld[dn + i] ||
            v <= fld[up + i - 2] ||
            v <= fld[up + i + 2] ||
            v <= fld[dn + i - 2] ||
            v <= fld[dn + i + 2]
          ) {
            continue;
          }
          const px = i * cell;
          const py = j * cell;
          let near = -1;
          for (let q = 0; q < spotN; q++) {
            const dx = spotX[q] - px;
            const dy = spotY[q] - py;
            if (dx * dx + dy * dy < 150 * 150) {
              near = q;
              break;
            }
          }
          if (near >= 0) {
            // Same hill: keep only its true top.
            if (v > spotV[near]) {
              spotX[near] = px;
              spotY[near] = py;
              spotV[near] = v;
            }
            continue;
          }
          if (spotN < MAX_SPOTS) {
            spotX[spotN] = px;
            spotY[spotN] = py;
            spotV[spotN] = v;
            spotN++;
          } else {
            let weak = 0;
            for (let q = 1; q < spotN; q++) if (spotV[q] < spotV[weak]) weak = q;
            if (v > spotV[weak]) {
              spotX[weak] = px;
              spotY[weak] = py;
              spotV[weak] = v;
            }
          }
        }
      }
    }

    /** Field value to a whole number of metres, clamped into the string table. */
    function metres(v: number): string {
      let e = Math.round(BASE_M + ((v - LEVEL_MIN) / LEVEL_STEP) * INTERVAL_M);
      if (e < 0) e = 0;
      else if (e > 1599) e = 1599;
      return NUM_STR[e];
    }

    function strokePass(
      colour: string,
      width: number,
      kMin: number,
      kMax: number,
      indexOnly: number,
      skipLabels: boolean
    ): void {
      const c = ctx!;
      c.beginPath();
      let any = false;
      for (let s = 0; s < segN; s++) {
        const o = s * SEG_STRIDE;
        const k = seg[o + 4];
        if (k < kMin || k > kMax) continue;
        if (indexOnly === 1 && k % INDEX_EVERY !== 0) continue;
        if (indexOnly === 2 && k % INDEX_EVERY === 0) continue;
        const ax = seg[o];
        const ay = seg[o + 1];
        const bx = seg[o + 2];
        const by = seg[o + 3];
        if (skipLabels && nearLabel((ax + bx) * 0.5, (ay + by) * 0.5)) continue;
        c.moveTo(ax, ay);
        c.lineTo(bx, by);
        any = true;
      }
      if (!any) return;
      c.strokeStyle = colour;
      c.lineWidth = width;
      c.stroke();
    }

    function render(td: number, p: number, inten: number): void {
      const c = ctx;
      if (!c || cssW === 0) return;

      if (inten <= 0.004) {
        if (!clearedAtZero) {
          c.clearRect(0, 0, cssW, cssH);
          clearedAtZero = true;
        }
        return;
      }
      clearedAtZero = false;
      c.clearRect(0, 0, cssW, cssH);

      // Scroll drives a viewing window across the land; velocity adds a lead
      // that springs back, so a flick throws the window a little further ahead.
      const offX = td * 60 + p * 190;
      const offY = p * 900 + lead;

      // The summit tracks the reader down the section and swings across it, so
      // the land keeps reorganising itself around where they are looking.
      const sx = cssW * (0.5 + 0.34 * Math.cos(p * 2.3 + 0.7));
      const sy = cssH * (0.12 + 0.74 * p) + lead * 0.15;
      const sr = Math.min(cssW, cssH) * 0.34;

      const fmax = buildField(td, offX, offY, sx, sy, sr);
      march();
      // Figures and spot heights are re-sited a few times a second rather than
      // every frame. Re-picking them at 60Hz makes them twitch between equally
      // good anchors, and a survey sheet's annotation should sit still.
      if (tick % 5 === 0) {
        chooseLabels();
        findSpots();
      }
      tick++;

      // Levels near the top of the sheet get the warm accent: on a real map the
      // summit rings are the thing your eye goes to first.
      let kHigh = Math.floor((fmax - LEVEL_MIN) / LEVEL_STEP) - 5;
      if (kHigh < 0) kHigh = 0;

      /* graticule ------------------------------------------------------- */
      c.beginPath();
      const gx = -(((offX % GRATICULE) + GRATICULE) % GRATICULE);
      for (let x = gx; x <= cssW; x += GRATICULE) {
        c.moveTo(x, 0);
        c.lineTo(x, cssH);
      }
      const gy = -(((offY % GRATICULE) + GRATICULE) % GRATICULE);
      for (let y = gy; y <= cssH; y += GRATICULE) {
        c.moveTo(0, y);
        c.lineTo(cssW, y);
      }
      c.strokeStyle = rgba(cInk2, 0.075 * inten);
      c.lineWidth = 0.6;
      c.stroke();

      /* contours -------------------------------------------------------- */
      strokePass(rgba(cInk2, 0.11 * inten), 0.8, 0, LEVELS - 1, 2, false);
      strokePass(rgba(cInk, 0.34 * inten), 1.5, 0, LEVELS - 1, 1, true);
      strokePass(rgba(cAcc, 0.32 * inten), 1.1, kHigh, LEVELS - 1, 0, true);

      /* the survey redrawing itself: a sweep band re-inks as it passes ---- */
      const span = cssH + 260;
      const sweep = (((td * 300 + p * 320) % span) + span) % span - 130;
      c.beginPath();
      let swept = false;
      for (let s = 0; s < segN; s++) {
        const o = s * SEG_STRIDE;
        const ay = seg[o + 1];
        const d = ay - sweep;
        if (d < -26 || d > 26) continue;
        c.moveTo(seg[o], ay);
        c.lineTo(seg[o + 2], seg[o + 3]);
        swept = true;
      }
      if (swept) {
        c.strokeStyle = rgba(cAcc2, 0.26 * inten);
        c.lineWidth = 1;
        c.stroke();
      }
      c.beginPath();
      c.moveTo(0, sweep);
      c.lineTo(cssW, sweep);
      c.strokeStyle = rgba(cAcc2, 0.1 * inten);
      c.lineWidth = 0.8;
      c.stroke();

      /* elevation figures, set into the breaks left in the index lines ---- */
      c.font = FONT_CONTOUR;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = rgba(cInk, 0.42 * inten);
      for (let q = 0; q < labN; q++) {
        c.save();
        c.translate(labX[q], labY[q]);
        c.rotate(labA[q]);
        c.fillText(LEVEL_LABEL[labK[q]], 0, 0);
        c.restore();
      }

      /* spot heights ------------------------------------------------------ */
      c.font = FONT_SPOT;
      c.textAlign = 'left';
      for (let q = 0; q < spotN; q++) {
        const x = spotX[q];
        const y = spotY[q];
        c.beginPath();
        c.moveTo(x - 3.5, y);
        c.lineTo(x + 3.5, y);
        c.moveTo(x, y - 3.5);
        c.lineTo(x, y + 3.5);
        c.strokeStyle = rgba(cAcc, 0.55 * inten);
        c.lineWidth = 1.1;
        c.stroke();
        // A faint ground-coloured pad keeps the figure readable over its own rings.
        c.fillStyle = rgba(cSurf, 0.45 * inten);
        c.fillRect(x + 6, y - 6, 26, 12);
        c.fillStyle = rgba(cInk, 0.5 * inten);
        c.fillText(metres(spotV[q]), x + 8, y);
      }

      /* bearing arrow ----------------------------------------------------- */
      const bx = cssW - 54;
      const by = cssH - 62;
      const ang = -Math.PI / 2 + needle;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      c.beginPath();
      c.moveTo(bx - ca * 20, by - sa * 20);
      c.lineTo(bx + ca * 18, by + sa * 18);
      c.strokeStyle = rgba(cInk2, 0.4 * inten);
      c.lineWidth = 1;
      c.stroke();
      const hx = bx + ca * 22;
      const hy = by + sa * 22;
      c.beginPath();
      c.moveTo(hx, hy);
      c.lineTo(hx - ca * 8 - sa * 3.6, hy - sa * 8 + ca * 3.6);
      c.lineTo(hx - ca * 8 + sa * 3.6, hy - sa * 8 - ca * 3.6);
      c.closePath();
      c.fillStyle = rgba(cAcc, 0.5 * inten);
      c.fill();
      c.font = FONT_BEARING;
      c.textAlign = 'center';
      c.fillStyle = rgba(cInk2, 0.45 * inten);
      c.fillText('N', bx + ca * 33, by + sa * 33);

      /* hold the middle of the frame quiet for the text that sits over it -- */
      if (mask) {
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = mask;
        c.fillRect(0, 0, cssW, cssH);
        c.globalCompositeOperation = 'source-over';
      }
    }

    function frame(now: number): void {
      raf = requestAnimationFrame(frame);
      const dt = last === 0 ? 0.016 : Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;

      const v = velocityRef.current;
      velSmooth += (v - velSmooth) * 0.08;
      lead += velSmooth * 0.35;
      lead *= 0.94; // springs back, so the window leads the scroll then settles

      // The needle behaves like a compass being carried: it swings, then damps.
      const target = velSmooth * 0.0035;
      needle += (Math.max(-0.28, Math.min(0.28, target)) - needle) * 0.05;

      render(t * 0.09, progressRef.current, intensityRef.current);
    }

    function start(): void {
      if (running || reduced) return;
      running = true;
      last = 0;
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

    // Under reduced motion the sheet is a still survey: frozen clock, frozen
    // window, no loop at all. Only intensity may still change it, so that the
    // page can fade it in and out without ever animating the land.
    function drawStill(): void {
      tick = 0;
      render(0, 0.5, intensityRef.current);
    }

    resize();

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) drawStill();
    });
    ro.observe(canvas);

    const io = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
      sync();
    });
    io.observe(canvas);

    const onVis = (): void => sync();
    document.addEventListener('visibilitychange', onVis);

    if (reduced) {
      staticDrawRef.current = drawStill;
      drawStill();
    } else {
      staticDrawRef.current = null;
      sync();
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
        name: 'topography',
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
      staticDrawRef.current = null;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      // Deliberately no loseContext: React can remount this canvas and the
      // context must survive that.
    };
  }, [surface, ink, ink2, accent, accent2, reduced]);

  // Reduced motion has no loop, so the fade has to be pushed in from outside.
  useEffect(() => {
    if (reduced) staticDrawRef.current?.();
  }, [reduced, intensity]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: 'none',
      }}
    />
  );
}
