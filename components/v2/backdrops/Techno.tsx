'use client';

/* ============================================================================
   Techno — a mission console, rendered as a character grid.

   The world is a telemetry room seen from the far side: mostly dark panel,
   a few instruments actually running. Everything you see is one <canvas>
   painted as a grid of monospace cells, so the whole thing reads as terminal
   output rather than as graphics — which is the point. It is a printed,
   technical surface that happens to be computing.

   WHY A GLYPH ATLAS
   fillText is the single most expensive call in a text renderer, and a grid
   this size wants thousands of characters per frame. So every character is
   baked ONCE into an offscreen atlas — one row per (colour, brightness) pair,
   one column per glyph — and the frame loop only ever blits sub-rectangles of
   that atlas. Brightness is baked into the atlas rather than applied with
   globalAlpha per cell, so the entire frame draws at a single alpha (the
   backdrop's `intensity`) with no state changes at all.

   WHY THE INSTRUMENTS ARE REAL
   Faked telemetry looks faked. The network here runs an actual forward pass:
   fixed random weights, tanh units, real activations, a real argmax at the
   output. The arithmetic happens the instant a pass begins; what takes eight
   seconds is the *display* of it — the wavefront is choreographed across the
   gaps so a reader can follow one signal from input to decision instead of
   watching cells flicker. The satellite follows a real ground track (inclined circular orbit over a
   rotating earth, so the trace walks west each pass). The radar's afterglow is
   an exponential in the angular distance behind the beam, and contacts light
   only when the beam actually sweeps their bearing. The numbers on the panels
   are read out of those same simulations.

   LEGIBILITY
   This sits behind body text. A precomputed per-cell mask crushes brightness
   in the middle of the frame and lets it up at the margins, so the instruments
   live in the gutters and the centre stays close to empty no matter what the
   simulation does.

   PERFORMANCE CONTRACT
   Everything — buffers, geometry, rasterised edge paths, radar cell tables,
   label glyph arrays — is allocated in setup or on resize. The frame loop
   allocates nothing: no strings (numbers are emitted digit by digit with
   integer maths), no arrays, no objects. DPR is capped at 2, there is exactly
   one rAF, and it is cancelled outright when the canvas leaves the viewport or
   the document hides.
   ========================================================================== */

import { useEffect, useRef } from 'react';
import type { BackdropProps } from './types';
import { mulberry32 } from './types';

/* -------------------------------------------------------------------------
   Glyph set. Index 0 is the blank, indices 1..9 are a density ramp, so a
   brightness can be turned into a character with one multiply.
   ------------------------------------------------------------------------- */
const GLYPHS =
  ' .:-=+*#%@' + // 0..9   blank + density ramp
  '0123456789' + // 10..19 digits
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + // 20..45
  '/\\|_<>[]()' + // 46..55
  ",;'" + // 56..58
  '°±×·' + // 59..62  degree, plus-minus, times, middot
  '│─┼'; // 63..65  box drawing

const CHAR_INDEX: { [k: string]: number | undefined } = {};
for (let ci = 0; ci < GLYPHS.length; ci++) CHAR_INDEX[GLYPHS.charAt(ci)] = ci;

const I_DOT = 1;
const I_COLON = 2;
const I_MINUS = 3;
const I_EQ = 4;
const I_PLUS = 5;
const I_D0 = 10;

/** Glyph index for a character, falling back to a dot for anything unmapped. */
function gi(c: string): number {
  const v = CHAR_INDEX[c];
  return v === undefined ? I_DOT : v;
}

const I_MID = gi('·');
const I_VBAR = gi('│');
const I_HBAR = gi('─');
const I_AT = gi('@');
const I_HASH = gi('#');
const I_STAR = gi('*');
/* Node furniture. A unit is drawn as a bracketed cell, so it reads as a node
   with a body rather than as one more lit character in the grid. */
const I_LPAR = gi('(');
const I_RPAR = gi(')');
const I_LBRK = gi('[');
const I_RBRK = gi(']');
const I_LT = gi('<');

/** Labels are constant, so their glyph indices are resolved once at module load. */
function encode(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = gi(s.charAt(i));
  return out;
}

const T_HDR = encode('TELEMETRY');
const T_LINK = encode('LINK');
const T_NOMINAL = encode('NOMINAL');
const T_BUS = encode('BUS');
const T_V = encode('V');
const T_TEMP = encode('TEMP');
const T_C = encode('C');
const T_SIG = encode('SIG');
const T_MET = encode('MET');
const T_NEURAL = encode('NEURAL CORE');
const T_IN = encode('IN');
const T_H1 = encode('H1');
const T_H2 = encode('H2');
const T_OUT = encode('OUT');
const T_PASS = encode('PASS');
const T_GND = encode('GND TRACK');
const T_ALT = encode('ALT');
const T_KM = encode('KM');
const T_LAT = encode('LAT');
const T_LON = encode('LON');
const T_INC = encode('INC');
const T_SWEEP = encode('SWEEP');
const T_AZ = encode('AZ');
const T_RNG = encode('RNG');
const T_TRK = encode('TRK');

/* Brightness quantisation. Six steps is enough that ramps read as smooth and
   few enough that the atlas stays small. */
const LEVELS = 6;
const ALPHAS = [0.07, 0.13, 0.22, 0.35, 0.55, 0.85];

const C_DIM = 0; // ink2  — structure, graticules, dead cells
const C_INK = 1; // ink   — labels and live readouts
const C_HOT = 2; // accent — the thing that is happening right now
const C_COOL = 3; // accent2 — signal, positive activation
const NCOL = 4;

const TAU = Math.PI * 2;

function ss(a: number, b: number, x: number): number {
  const d = b - a;
  const t = Math.min(1, Math.max(0, (x - a) / (d === 0 ? 1e-6 : d)));
  return t * t * (3 - 2 * t);
}

function wrapTau(a: number): number {
  let v = a % TAU;
  if (v < 0) v += TAU;
  return v;
}

/* Network topology: input, two hidden layers, output. Deliberately small — the
   plate has to read as a diagram of a network, and a fully connected graph of
   this size is the largest one that stays legible on a character grid. Every
   connection is drawn, so the shape itself says "neural network" before any of
   it lights up. */
const NET_SIZES = [4, 6, 5, 3];
const NET_L = NET_SIZES.length;
const NET_OFFS = [0, 4, 10, 15];
const NET_TOTAL = 18;
const NET_WCOUNT = 4 * 6 + 6 * 5 + 5 * 3; // 69 connections, all of them drawn
const NET_BCOUNT = 6 + 5 + 3;
const EDGE_STRIDE = 80; // cells reserved per rasterised connection

/* -------------------------------------------------------------------------
   Forward-pass choreography, in seconds.

   The old plate ticked the whole network at 60 Hz and staggered the layers by
   nine ticks, which is 150 ms per hop — far too fast to follow, so it read as
   flicker. Now one pass is a discrete event with a shape: the input layer
   takes on a sample, a wavefront crosses each gap at a walking pace, the
   output settles, a winner is held, and then the console waits before the next
   input arrives. A whole pass is a little over eight seconds.
   ------------------------------------------------------------------------- */
const P_ARRIVE = 0.85; // input layer taking on the new sample
const P_TRAVEL = 1.4; // one wavefront crossing one gap
const P_SETTLE = 0.35; // the receiving layer coming up to its value
const P_STAGE = P_TRAVEL + P_SETTLE;
const P_HOLD = 1.55; // the output layer holding its winner
const P_PAUSE = 1.15; // dark before the next sample
const P_TOTAL = P_ARRIVE + (NET_L - 1) * P_STAGE + P_HOLD + P_PAUSE;

const BLIPS = 7;
const CORRUPT = 20;

export default function Techno({
  intensity,
  progress,
  velocity,
  palette,
  className,
}: BackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* Props are read per frame through a ref so that scrolling never tears down
     the grid, the atlas or the simulation. */
  const propsRef = useRef({ intensity, progress, velocity, palette });
  propsRef.current.intensity = intensity;
  propsRef.current.progress = progress;
  propsRef.current.velocity = velocity;
  propsRef.current.palette = palette;

  const atlasDirty = useRef(true);
  const redrawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    // Bound to a non-nullable local so the closures below do not each need a guard.
    const canvas: HTMLCanvasElement = node;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ===================================================================
       Simulation state — independent of canvas size, allocated once.
       =================================================================== */
    const rnd = mulberry32(0x5eed13);

    const weights = new Float32Array(NET_WCOUNT);
    const biases = new Float32Array(NET_BCOUNT);
    for (let i = 0; i < NET_WCOUNT; i++) {
      // Box–Muller would be nicer, but a triangular sum is plenty for weights
      // that only have to look like a trained layer.
      weights[i] = (rnd() + rnd() + rnd() - 1.5) * 1.35;
    }
    for (let i = 0; i < NET_BCOUNT; i++) biases[i] = (rnd() - 0.5) * 0.4;

    /** Settled activations for the pass currently in flight. */
    const acts = new Float32Array(NET_TOTAL);
    /** What is actually drawn: a layer only takes on its value once the
        wavefront has reached it, which is what makes propagation visible. */
    const dispAct = new Float32Array(NET_TOTAL);

    /* Pass state. A pass is an event, not a continuous stream. */
    let passT = 0;
    let passIndex = 0;
    let winner = 0;
    /* Derived every frame by netPose(), read by drawNet(). */
    let pulseL = 0; // gap the wavefront is crossing, 1..NET_L-1; 0 = none
    let pulseF = 0; // 0..1 along that gap
    let winGlow = 0; // how strongly the output winner is being held

    /* Every connection, in weight order, with its magnitude normalised so the
       drawn wire can show weight as density and sign as colour. */
    const eLayer = new Uint8Array(NET_WCOUNT);
    const eFrom = new Uint8Array(NET_WCOUNT);
    const eTo = new Uint8Array(NET_WCOUNT);
    const eW = new Float32Array(NET_WCOUNT);
    const eWn = new Float32Array(NET_WCOUNT);
    let edgeN = 0;
    {
      let wo = 0;
      let maxW = 1e-6;
      for (let l = 1; l < NET_L; l++) {
        const nPrev = NET_SIZES[l - 1];
        const nCur = NET_SIZES[l];
        for (let i = 0; i < nPrev; i++) {
          for (let j = 0; j < nCur; j++) {
            const w = weights[wo + i * nCur + j];
            eLayer[edgeN] = l;
            eFrom[edgeN] = i;
            eTo[edgeN] = j;
            eW[edgeN] = w;
            const m = Math.abs(w);
            if (m > maxW) maxW = m;
            edgeN++;
          }
        }
        wo += nPrev * nCur;
      }
      for (let e = 0; e < edgeN; e++) eWn[e] = Math.abs(eW[e]) / maxW;
    }

    /* Orbit. Two accumulating angles: argument of latitude and earth rotation.
       Keeping both means any past sample can be reconstructed exactly, which is
       how the trail is drawn without storing it. */
    const ORB_INC = 0.9; // ~51.6 degrees
    const ORB_RATE = 0.16;
    const EARTH_RATE = 0.011;
    let orbU = 0;
    let earthA = 0;

    let sweep = 0;
    const blipAng = new Float32Array(BLIPS);
    const blipRad = new Float32Array(BLIPS);
    const blipSpd = new Float32Array(BLIPS);
    const blipLvl = new Float32Array(BLIPS);
    const blipPrev = new Float32Array(BLIPS);
    for (let i = 0; i < BLIPS; i++) {
      blipAng[i] = rnd() * TAU;
      blipRad[i] = 0.2 + rnd() * 0.75;
      blipSpd[i] = (rnd() - 0.5) * 0.22;
      blipPrev[i] = 0;
    }

    const corIdx = new Int32Array(CORRUPT);
    const corT = new Float32Array(CORRUPT);
    const corDur = new Float32Array(CORRUPT);
    for (let i = 0; i < CORRUPT; i++) corIdx[i] = -1;

    let clock = 0;
    let noiseSeed = 0x9e3779b9;

    /** Cheap integer noise, so the frame loop never touches Math.random or allocates. */
    function nextNoise(): number {
      noiseSeed ^= noiseSeed << 13;
      noiseSeed ^= noiseSeed >>> 17;
      noiseSeed ^= noiseSeed << 5;
      return (noiseSeed >>> 0) / 4294967296;
    }

    /* ===================================================================
       Grid state — rebuilt on resize.
       =================================================================== */
    let W = 0;
    let H = 0;
    let cols = 0;
    let rows = 0;
    let cw = 0;
    let ch = 0;
    let ox = 0;
    let oy = 0;

    let levelBuf = new Uint8Array(1);
    let glyphBuf = new Uint8Array(1);
    let colorBuf = new Uint8Array(1);
    let mask = new Float32Array(1);

    let ambN = 0;
    let ambIdx = new Int32Array(1);
    let ambPh = new Float32Array(1);

    let radN = 0;
    let radIdx = new Int32Array(1);
    let radAng = new Float32Array(1);
    let radRad = new Float32Array(1);
    let radRing = new Uint8Array(1);

    const unitX = new Int16Array(NET_TOTAL);
    const unitY = new Int16Array(NET_TOTAL);
    let edgeCX = new Int16Array(1);
    let edgeCY = new Int16Array(1);
    let edgeLen = new Int16Array(1);

    let netX0 = 0;
    let netX1 = 0;
    let netY0 = 0;
    let netY1 = 0;
    /* Actual extents of the laid-out units, so the header and the layer labels
       sit against the diagram rather than against the nominal band. */
    let netTop = 0;
    let netBot = 0;
    let netBracket = false;
    let mapX0 = 0;
    let mapX1 = 0;
    let mapY0 = 0;
    let mapY1 = 0;
    let rcx = 0;
    let rcy = 0;
    let rrx = 0;
    let rry = 0;

    let showMap = false;
    let showRadar = false;
    let showPanel = false;

    const atlas = document.createElement('canvas');
    const actx = atlas.getContext('2d');
    let atlasReady = false;

    /* -------------------------------------------------------------------
       Atlas: one column per glyph, one row per (colour, level). The top
       level of each colour is the only one drawn with fillText; the dimmer
       levels are alpha copies of it, which keeps a theme swap cheap.
       ------------------------------------------------------------------- */
    function buildAtlas(): void {
      if (!actx || cw <= 0 || ch <= 0) return;
      const pal = propsRef.current.palette;
      const tints = [pal.ink2, pal.ink, pal.accent, pal.accent2];

      atlas.width = GLYPHS.length * cw;
      atlas.height = NCOL * LEVELS * ch;
      actx.setTransform(1, 0, 0, 1, 0, 0);
      actx.clearRect(0, 0, atlas.width, atlas.height);
      actx.textAlign = 'center';
      actx.textBaseline = 'middle';
      actx.font = fontSpec();

      const top = LEVELS - 1;
      for (let c = 0; c < NCOL; c++) {
        const rowY = (c * LEVELS + top) * ch;
        actx.globalAlpha = ALPHAS[top];
        actx.fillStyle = tints[c];
        for (let g = 1; g < GLYPHS.length; g++) {
          actx.fillText(GLYPHS.charAt(g), g * cw + cw * 0.5, rowY + ch * 0.5);
        }
        for (let l = 0; l < top; l++) {
          actx.globalAlpha = ALPHAS[l] / ALPHAS[top];
          actx.drawImage(
            atlas,
            0,
            rowY,
            atlas.width,
            ch,
            0,
            (c * LEVELS + l) * ch,
            atlas.width,
            ch
          );
        }
      }
      actx.globalAlpha = 1;
      atlasReady = true;
      atlasDirty.current = false;
    }

    let fontPx = 12;
    function fontSpec(): string {
      return (
        fontPx +
        'px ui-monospace, SFMono-Regular, Menlo, Consolas, "DejaVu Sans Mono", monospace'
      );
    }

    /* -------------------------------------------------------------------
       Line rasteriser for the network's connections. Paths are baked at
       layout time; the frame loop only walks the stored cells.
       ------------------------------------------------------------------- */
    function raster(e: number, x0: number, y0: number, x1: number, y1: number): void {
      const dx = Math.abs(x1 - x0);
      const sx = x0 < x1 ? 1 : -1;
      const dy = -Math.abs(y1 - y0);
      const sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      let x = x0;
      let y = y0;
      let n = 0;
      const base = e * EDGE_STRIDE;
      for (;;) {
        if (n >= EDGE_STRIDE) break;
        edgeCX[base + n] = x;
        edgeCY[base + n] = y;
        n++;
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y += sy;
        }
      }
      edgeLen[e] = n;
    }

    function layout(): void {
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(1, Math.round(rect.width));
      const cssH = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);

      W = Math.max(1, Math.round(cssW * dpr));
      H = Math.max(1, Math.round(cssH * dpr));
      canvas.width = W;
      canvas.height = H;

      /* Aim for a console-density grid rather than a fixed type size, so the
         instrument layout holds at any viewport. */
      const targetCellCss = Math.min(11, Math.max(6.5, cssW / 150));
      fontPx = Math.max(8, Math.round(targetCellCss * dpr * 1.62));
      if (actx) {
        actx.font = fontSpec();
        const adv = actx.measureText('M').width;
        cw = Math.max(4, Math.ceil(adv));
      } else {
        cw = Math.max(4, Math.round(targetCellCss * dpr));
      }
      ch = Math.max(cw + 1, Math.round(cw * 1.74));

      cols = Math.max(8, Math.floor(W / cw));
      rows = Math.max(6, Math.floor(H / ch));
      ox = Math.floor((W - cols * cw) * 0.5);
      oy = Math.floor((H - rows * ch) * 0.5);

      const n = cols * rows;
      levelBuf = new Uint8Array(n);
      glyphBuf = new Uint8Array(n);
      colorBuf = new Uint8Array(n);
      mask = new Float32Array(n);

      /* The legibility mask. Horizontal position dominates: text runs down the
         middle of the page, so the middle columns are crushed hardest. */
      for (let y = 0; y < rows; y++) {
        const my = Math.abs(y / (rows - 1 || 1) - 0.5) * 2;
        const wy = 0.68 + 0.32 * ss(0.05, 0.5, my);
        for (let x = 0; x < cols; x++) {
          const mx = Math.abs(x / (cols - 1 || 1) - 0.5) * 2;
          const wx = 0.1 + 0.9 * ss(0.26, 0.7, mx);
          mask[y * cols + x] = wx * wy;
        }
      }

      /* Ambient dust: a sparse fixed set of cells that breathe. */
      ambN = Math.max(24, Math.floor(n * 0.011));
      ambIdx = new Int32Array(ambN);
      ambPh = new Float32Array(ambN);
      const arnd = mulberry32(0x1337 + cols * 131 + rows);
      for (let i = 0; i < ambN; i++) {
        ambIdx[i] = Math.min(n - 1, Math.floor(arnd() * n));
        ambPh[i] = arnd() * TAU;
      }

      const wide = cols >= 96 && rows >= 34;
      showMap = wide;
      showRadar = cols >= 60 && rows >= 24;
      showPanel = cols >= 44;

      if (wide) {
        /* The network is the widest instrument now, because separated layers
           are the whole point. It stays inside the left gutter: the right-hand
           output column sits at ~26% of the width, where the legibility mask is
           still holding it well back from the text column. */
        netX0 = Math.round(cols * 0.03);
        netX1 = Math.round(cols * 0.225);
        netY0 = Math.max(14, Math.round(rows * 0.37));
        netY1 = Math.round(rows * 0.73);
        mapX0 = Math.round(cols * 0.685);
        mapX1 = Math.round(cols * 0.96);
        mapY0 = Math.round(rows * 0.11);
        mapY1 = Math.round(rows * 0.31);
        rcx = cols * 0.845;
        rcy = rows * 0.665;
        rrx = Math.min(cols * 0.115, rows * 0.2 * (ch / cw));
      } else {
        netX0 = Math.round(cols * 0.04);
        netX1 = Math.round(cols * 0.32);
        netY0 = Math.round(rows * 0.55);
        netY1 = Math.round(rows * 0.82);
        mapX0 = 0;
        mapX1 = 0;
        mapY0 = 0;
        mapY1 = 0;
        rcx = cols * 0.74;
        rcy = rows * 0.76;
        rrx = Math.min(cols * 0.22, rows * 0.12 * (ch / cw));
      }
      rry = rrx * (cw / ch);

      /* Network unit positions. One vertical pitch shared by every layer, each
         layer centred on the same axis: that is what makes four columns of dots
         read as an input, two hidden layers and an output rather than as four
         unrelated strips. */
      let maxN = 1;
      for (let l = 0; l < NET_L; l++) if (NET_SIZES[l] > maxN) maxN = NET_SIZES[l];
      const pitch = Math.max(2, (netY1 - netY0) / maxN);
      const midY = (netY0 + netY1) * 0.5;
      netTop = rows;
      netBot = 0;
      for (let l = 0; l < NET_L; l++) {
        const nUnits = NET_SIZES[l];
        const lx = Math.round(netX0 + (netX1 - netX0) * (l / (NET_L - 1)));
        for (let i = 0; i < nUnits; i++) {
          const ly = Math.round(midY + (i - (nUnits - 1) * 0.5) * pitch);
          unitX[NET_OFFS[l] + i] = lx;
          unitY[NET_OFFS[l] + i] = ly;
          if (ly < netTop) netTop = ly;
          if (ly > netBot) netBot = ly;
        }
      }
      /* A node is drawn three cells wide. Below that gap there is no room for
         both the body and the wire, so the brackets are dropped instead. */
      netBracket = (netX1 - netX0) / (NET_L - 1) >= 6;

      edgeCX = new Int16Array(NET_WCOUNT * EDGE_STRIDE);
      edgeCY = new Int16Array(NET_WCOUNT * EDGE_STRIDE);
      edgeLen = new Int16Array(NET_WCOUNT);
      /* Wires run between the node bodies, not through them, so a node stays a
         node and the arriving pulse visibly lands on it. */
      const inset = netBracket ? 2 : 1;
      for (let e = 0; e < edgeN; e++) {
        const l = eLayer[e];
        const a = NET_OFFS[l - 1] + eFrom[e];
        const b = NET_OFFS[l] + eTo[e];
        raster(e, unitX[a] + inset, unitY[a], unitX[b] - inset, unitY[b]);
      }

      /* Radar cell table: polar coordinates per cell, computed once. Cells are
         taller than they are wide, so the radius is normalised per axis to
         keep the disc circular on screen. */
      const bx0 = Math.max(0, Math.floor(rcx - rrx) - 1);
      const bx1 = Math.min(cols - 1, Math.ceil(rcx + rrx) + 1);
      const by0 = Math.max(0, Math.floor(rcy - rry) - 1);
      const by1 = Math.min(rows - 1, Math.ceil(rcy + rry) + 1);
      const cap = Math.max(1, (bx1 - bx0 + 1) * (by1 - by0 + 1));
      radIdx = new Int32Array(cap);
      radAng = new Float32Array(cap);
      radRad = new Float32Array(cap);
      radRing = new Uint8Array(cap);
      radN = 0;
      if (showRadar && rrx > 2) {
        for (let y = by0; y <= by1; y++) {
          for (let x = bx0; x <= bx1; x++) {
            const dx = (x - rcx) / rrx;
            const dy = (y - rcy) / rry;
            const r = Math.sqrt(dx * dx + dy * dy);
            if (r > 1.02) continue;
            radIdx[radN] = y * cols + x;
            radAng[radN] = wrapTau(Math.atan2(dy, dx));
            radRad[radN] = r;
            /* The band has to be wider than one row of normalised radius or
               the rings break up into arcs at the left and right of the disc. */
            const nearRing =
              Math.abs(r - 0.34) < 0.062 ||
              Math.abs(r - 0.67) < 0.062 ||
              Math.abs(r - 1.0) < 0.062;
            radRing[radN] = nearRing ? 1 : 0;
            radN++;
          }
        }
      }

      buildAtlas();
    }

    /* ===================================================================
       Grid writes. Brightest wins, so instruments can overlap safely.
       =================================================================== */
    function put(x: number, y: number, glyph: number, colour: number, lvl: number): void {
      if (x < 0 || y < 0 || x >= cols || y >= rows || glyph <= 0) return;
      const i = y * cols + x;
      const v = lvl * mask[i];
      if (v <= 0.02) return;
      let L = (v * LEVELS) | 0;
      if (L >= LEVELS) L = LEVELS - 1;
      if (L + 1 <= levelBuf[i]) return;
      levelBuf[i] = L + 1;
      glyphBuf[i] = glyph;
      colorBuf[i] = colour;
    }

    /** Density ramp lookup: 0 stays blank, anything above picks a ramp glyph. */
    function ramp(v: number): number {
      if (v <= 0) return 0;
      let g = 1 + ((v * 9) | 0);
      if (g > 9) g = 9;
      return g;
    }

    function putGlyphs(
      x: number,
      y: number,
      arr: Uint8Array,
      colour: number,
      lvl: number
    ): void {
      for (let i = 0; i < arr.length; i++) put(x + i, y, arr[i], colour, lvl);
    }

    const POW10 = [1, 10, 100, 1000, 10000];

    /**
     * Emit a fixed-width number without building a string — the frame loop is
     * not allowed to allocate, and toFixed would allocate once per readout.
     */
    function putNum(
      x: number,
      y: number,
      value: number,
      intD: number,
      fracD: number,
      colour: number,
      lvl: number,
      signed: boolean
    ): void {
      const neg = value < 0;
      let av = neg ? -value : value;
      if (!isFinite(av)) av = 0;
      let scaled = Math.round(av * POW10[fracD]);
      const width = intD + (fracD > 0 ? fracD + 1 : 0) + (signed ? 1 : 0);
      let cx = x + width - 1;
      for (let k = 0; k < fracD; k++) {
        put(cx, y, I_D0 + (scaled % 10), colour, lvl);
        scaled = (scaled / 10) | 0;
        cx--;
      }
      if (fracD > 0) {
        put(cx, y, I_DOT, colour, lvl);
        cx--;
      }
      for (let k = 0; k < intD; k++) {
        put(cx, y, I_D0 + (scaled % 10), colour, lvl);
        scaled = (scaled / 10) | 0;
        cx--;
      }
      if (signed) put(cx, y, neg ? I_MINUS : I_PLUS, colour, lvl);
    }

    /* ===================================================================
       Simulation
       =================================================================== */
    /**
     * Sample a new input vector and run the whole forward pass in one go.
     * The pass is computed the instant it starts; what takes eight seconds is
     * the *display* of it, layer by layer, so the arithmetic stays real while
     * the propagation becomes something a reader can follow.
     */
    function startPass(): void {
      const p = propsRef.current;
      const t = clock;
      const vN = Math.max(-1, Math.min(1, p.velocity / 45));

      acts[0] = Math.sin(t * 0.21);
      acts[1] = Math.sin(t * 0.13 + 1.1) * 0.85;
      acts[2] = vN;
      acts[3] = p.progress * 2 - 1;

      let wo = 0;
      let bo = 0;
      for (let l = 1; l < NET_L; l++) {
        const nPrev = NET_SIZES[l - 1];
        const nCur = NET_SIZES[l];
        const pOff = NET_OFFS[l - 1];
        const cOff = NET_OFFS[l];
        for (let j = 0; j < nCur; j++) {
          let s = biases[bo + j];
          for (let i = 0; i < nPrev; i++) s += weights[wo + i * nCur + j] * acts[pOff + i];
          acts[cOff + j] = Math.tanh(s);
        }
        wo += nPrev * nCur;
        bo += nCur;
      }

      /* The classification the pass actually made. */
      const off = NET_OFFS[NET_L - 1];
      let best = 0;
      for (let i = 1; i < NET_SIZES[NET_L - 1]; i++) if (acts[off + i] > acts[off + best]) best = i;
      winner = best;
      passIndex++;
    }

    /**
     * Pose the network for the current instant of the pass: which layers have
     * received their value, where the wavefront is, and whether the output is
     * being held. Writes into preallocated state; allocates nothing.
     */
    function netPose(): void {
      const t = passT;
      const holdStart = P_ARRIVE + (NET_L - 1) * P_STAGE;
      const holdEnd = holdStart + P_HOLD;
      /* Everything dims away during the pause, so the next input clearly
         arrives at a cold network rather than blending into the last one. */
      const fade = t <= holdEnd ? 1 : 1 - ss(holdEnd, P_TOTAL - 0.2, t);

      const inN = NET_SIZES[0];
      const ta = t / P_ARRIVE;
      for (let i = 0; i < inN; i++) {
        // A slight stagger down the input column: the sample loads, it does
        // not snap on.
        dispAct[i] = acts[i] * ss(i * 0.1, i * 0.1 + 0.6, ta) * fade;
      }
      for (let l = 1; l < NET_L; l++) {
        const travelEnd = P_ARRIVE + (l - 1) * P_STAGE + P_TRAVEL;
        const g = ss(travelEnd, travelEnd + P_SETTLE, t) * fade;
        const off = NET_OFFS[l];
        for (let i = 0; i < NET_SIZES[l]; i++) dispAct[off + i] = acts[off + i] * g;
      }

      pulseL = 0;
      pulseF = 0;
      const rel = t - P_ARRIVE;
      if (rel >= 0) {
        const li = (rel / P_STAGE) | 0;
        if (li < NET_L - 1) {
          const local = rel - li * P_STAGE;
          if (local < P_TRAVEL) {
            pulseL = li + 1;
            pulseF = local / P_TRAVEL;
          }
        }
      }

      winGlow =
        ss(holdStart - 0.15, holdStart + 0.4, t) * (1 - ss(holdEnd - 0.25, holdEnd + 0.25, t));
    }

    function step(dt: number): void {
      const p = propsRef.current;
      const v = Math.max(-90, Math.min(90, p.velocity));
      const vAbs = Math.abs(v) / 90;
      clock += dt;

      /* The pass advances in wall-clock seconds, so its pace is identical on a
         60 Hz and a 120 Hz display. Scrolling hurries the console along, but
         only by about half again: even flat out a pass still takes ~5s, which
         is the point of the whole change. */
      passT += dt * (1 + vAbs * 0.6);
      if (passT >= P_TOTAL) {
        passT -= P_TOTAL;
        if (passT >= P_TOTAL) passT = 0; // a very long stall should not queue passes
        startPass();
      }
      netPose();

      orbU += dt * (ORB_RATE + vAbs * 0.85);
      earthA += dt * (EARTH_RATE + vAbs * 0.06);

      /* Scroll drives the sweep, and scrolling up genuinely reverses it. */
      const omega = 0.5 + v * 0.05;
      sweep = wrapTau(sweep + dt * omega);

      for (let i = 0; i < BLIPS; i++) {
        blipAng[i] = wrapTau(blipAng[i] + dt * blipSpd[i] * (1 + vAbs * 2));
        const d = wrapTau(sweep - blipAng[i]);
        // The delta collapses from ~2pi to ~0 exactly as the beam crosses.
        if (d < blipPrev[i]) blipLvl[i] = 1;
        blipPrev[i] = d;
        blipLvl[i] *= Math.exp(-dt * 0.5);
      }

      for (let i = 0; i < CORRUPT; i++) if (corT[i] > 0) corT[i] -= dt;

      /* Corruption arrives in bursts when the reader moves fast, the way a
         real link degrades under load. */
      const spawnChance = (0.35 + vAbs * 5.5) * dt;
      if (nextNoise() < spawnChance) {
        for (let i = 0; i < CORRUPT; i++) {
          if (corT[i] <= 0) {
            corIdx[i] = Math.floor(nextNoise() * cols * rows);
            corDur[i] = 0.35 + nextNoise() * 0.9;
            corT[i] = corDur[i];
            break;
          }
        }
      }
    }

    /* ===================================================================
       Instruments
       =================================================================== */
    function drawAmbient(gate: number): void {
      for (let i = 0; i < ambN; i++) {
        const f = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(clock * 0.7 + ambPh[i]));
        const idx = ambIdx[i];
        const x = idx % cols;
        const y = (idx / cols) | 0;
        put(x, y, I_MID, C_DIM, 0.2 * f * gate);
      }
    }

    function drawChrome(gate: number): void {
      const m = 2;
      const x1 = cols - 1 - m;
      const y1 = rows - 1 - m;
      for (let k = 0; k < 5; k++) {
        put(m + k, m, I_HBAR, C_DIM, 0.3 * gate);
        put(x1 - k, m, I_HBAR, C_DIM, 0.3 * gate);
        put(m + k, y1, I_HBAR, C_DIM, 0.3 * gate);
        put(x1 - k, y1, I_HBAR, C_DIM, 0.3 * gate);
      }
      for (let k = 0; k < 2; k++) {
        put(m, m + 1 + k, I_VBAR, C_DIM, 0.3 * gate);
        put(x1, m + 1 + k, I_VBAR, C_DIM, 0.3 * gate);
        put(m, y1 - 1 - k, I_VBAR, C_DIM, 0.3 * gate);
        put(x1, y1 - 1 - k, I_VBAR, C_DIM, 0.3 * gate);
      }
      /* Edge ticks, like a plotted chart border. */
      for (let y = m + 4; y < y1 - 3; y += 4) {
        put(m, y, I_MID, C_DIM, 0.2 * gate);
        put(x1, y, I_MID, C_DIM, 0.2 * gate);
      }
    }

    /** One unit, drawn with a body so it reads as a node. */
    function drawUnit(u: number, a: number, gate: number): void {
      const m = Math.abs(a);
      const x = unitX[u];
      const y = unitY[u];
      // Sign is the colour convention throughout this plate: accent positive,
      // accent2 negative, ink2 for a unit that is not saying much.
      const colour = m < 0.14 ? C_DIM : a > 0 ? C_HOT : C_COOL;
      put(x, y, ramp(0.2 + m * 0.8), colour, (0.34 + m * 0.66) * gate);
      if (netBracket) {
        const b = (0.24 + m * 0.32) * gate;
        put(x - 1, y, I_LPAR, C_DIM, b);
        put(x + 1, y, I_RPAR, C_DIM, b);
      }
    }

    function drawNet(gate: number): void {
      if (gate <= 0.01) return;

      /* Layer plates. A faint rule down each layer's column separates the four
         layers from each other and gives the diagram some depth; the layer the
         wavefront is currently arriving at is lifted slightly. */
      for (let l = 0; l < NET_L; l++) {
        const off = NET_OFFS[l];
        const x = unitX[off];
        const top = unitY[off] - 1;
        const bot = unitY[off + NET_SIZES[l] - 1] + 1;
        const lift = pulseL === l ? 0.075 : 0;
        for (let y = top; y <= bot; y++) put(x, y, I_VBAR, C_DIM, (0.08 + lift) * gate);
      }

      /* Connections. Every weight is drawn: magnitude as glyph density and
         brightness — the closest a character grid gets to line weight — and
         sign as colour, accent for positive and accent2 for negative. Kept
         deliberately faint so 69 wires read as a mesh, not as a scribble. */
      for (let e = 0; e < edgeN; e++) {
        const len = edgeLen[e];
        if (len <= 1) continue;
        const base = e * EDGE_STRIDE;
        const wn = eWn[e];
        const colour = eW[e] > 0 ? C_HOT : C_COOL;
        const g = ramp(0.05 + wn * 0.33);
        const lvl = (0.17 + wn * 0.2) * gate;
        for (let k = 0; k < len; k++) put(edgeCX[base + k], edgeCY[base + k], g, colour, lvl);
      }

      /* The signal itself, travelling one gap at a time. Every connection out
         of the sending layer fires together, so the front is legible as a
         front; its brightness on each wire is that wire's real contribution,
         weight times source activation, so weak connections barely carry. */
      if (pulseL > 0) {
        const srcOff = NET_OFFS[pulseL - 1];
        for (let e = 0; e < edgeN; e++) {
          if (eLayer[e] !== pulseL) continue;
          const len = edgeLen[e];
          if (len <= 1) continue;
          const drive = Math.abs(eW[e] * acts[srcOff + eFrom[e]]);
          if (drive < 0.06) continue;
          const amp = Math.min(1, drive * 1.3);
          const colour = eW[e] > 0 ? C_HOT : C_COOL;
          const base = e * EDGE_STRIDE;
          const pos = pulseF * (len - 1);
          let k0 = Math.floor(pos - 2.4);
          let k1 = Math.ceil(pos + 1.2);
          if (k0 < 0) k0 = 0;
          if (k1 > len - 1) k1 = len - 1;
          for (let k = k0; k <= k1; k++) {
            const d = pos - k;
            // Asymmetric: a short leading edge and a longer tail behind it, so
            // the packet has a direction of travel.
            const f = d >= 0 ? 1 - d / 2.6 : 1 + d / 1.4;
            if (f <= 0) continue;
            const b = f * amp;
            put(
              edgeCX[base + k],
              edgeCY[base + k],
              ramp(0.32 + b * 0.68),
              colour,
              (0.2 + b * 0.68) * gate
            );
          }
        }
      }

      /* Units. A layer holds nothing until the front has reached it. */
      for (let l = 0; l < NET_L; l++) {
        const off = NET_OFFS[l];
        for (let i = 0; i < NET_SIZES[l]; i++) drawUnit(off + i, dispAct[off + i], gate);
      }

      /* The decision. For a moment at the end of the pass the winning output
         unit is boxed and pointed at, then it lets go. */
      const outOff = NET_OFFS[NET_L - 1];
      if (winGlow > 0.02) {
        const x = unitX[outOff + winner];
        const y = unitY[outOff + winner];
        const b = (0.34 + winGlow * 0.56) * gate;
        put(x, y, I_AT, C_HOT, (0.42 + winGlow * 0.52) * gate);
        put(x - 1, y, I_LBRK, C_HOT, b);
        put(x + 1, y, I_RBRK, C_HOT, b);
        put(x + 3, y, I_LT, C_HOT, winGlow * 0.6 * gate);
      }

      /* Labels: the header above the diagram, the layer names beneath their own
         columns, then the live output vector and the pass counter. */
      putGlyphs(netX0, netTop - 2, T_NEURAL, C_INK, 0.58 * gate);
      const ly = netBot + 2;
      putGlyphs(Math.max(0, netX0 - 1), ly, T_IN, C_DIM, 0.42 * gate);
      putGlyphs(Math.max(0, unitX[NET_OFFS[1]] - 1), ly, T_H1, C_DIM, 0.42 * gate);
      putGlyphs(Math.max(0, unitX[NET_OFFS[2]] - 1), ly, T_H2, C_DIM, 0.42 * gate);
      putGlyphs(Math.max(0, unitX[outOff] - 1), ly, T_OUT, C_DIM, 0.42 * gate);

      for (let i = 0; i < NET_SIZES[NET_L - 1]; i++) {
        const won = i === winner && winGlow > 0.25;
        putNum(
          netX0 + i * 7,
          ly + 1,
          dispAct[outOff + i],
          1,
          2,
          won ? C_HOT : C_INK,
          (0.4 + (won ? winGlow * 0.28 : 0)) * gate,
          true
        );
      }
      putGlyphs(netX0, ly + 2, T_PASS, C_DIM, 0.4 * gate);
      putNum(netX0 + 5, ly + 2, passIndex % 1000, 3, 0, C_INK, 0.46 * gate, false);
    }

    function drawMap(gate: number): void {
      if (!showMap || gate <= 0.01) return;
      const mw = mapX1 - mapX0;
      const mh = mapY1 - mapY0;
      if (mw < 8 || mh < 5) return;

      for (let y = mapY0; y <= mapY1; y += 2)
        for (let x = mapX0; x <= mapX1; x += 4) put(x, y, I_MID, C_DIM, 0.24 * gate);
      const eqY = mapY0 + Math.round(mh * 0.5);
      for (let x = mapX0; x <= mapX1; x++) put(x, eqY, I_HBAR, C_DIM, 0.27 * gate);

      /* Ground track. Each trail sample is the orbit reconstructed at an
         earlier time, which is why the pass walks west across the frame. */
      const TRAIL = 72;
      const du = 0.055;
      const dEarth = du * (EARTH_RATE / ORB_RATE);
      const si = Math.sin(ORB_INC);
      const cIn = Math.cos(ORB_INC);
      let satX = 0;
      let satY = 0;
      for (let k = TRAIL - 1; k >= 0; k--) {
        const u = orbU - k * du;
        const lat = Math.asin(si * Math.sin(u));
        const lonRaw = Math.atan2(cIn * Math.sin(u), Math.cos(u)) - (earthA - k * dEarth);
        let lon = lonRaw % TAU;
        if (lon < 0) lon += TAU;
        const x = mapX0 + Math.round((lon / TAU) * mw);
        const y = mapY0 + Math.round((0.5 - lat / Math.PI) * mh);
        const age = 1 - k / TRAIL;
        if (k === 0) {
          satX = x;
          satY = y;
        } else {
          put(x, y, k < 6 ? I_PLUS : I_MID, k < 6 ? C_HOT : C_DIM, (0.26 + age * 0.55) * gate);
        }
      }

      put(satX, satY, I_AT, C_HOT, 0.95 * gate);
      put(satX - 1, satY, I_MINUS, C_HOT, 0.35 * gate);
      put(satX + 1, satY, I_MINUS, C_HOT, 0.35 * gate);

      const lat = Math.asin(si * Math.sin(orbU)) * (180 / Math.PI);
      let lonDeg =
        (Math.atan2(cIn * Math.sin(orbU), Math.cos(orbU)) - earthA) % TAU;
      if (lonDeg < 0) lonDeg += TAU;
      lonDeg = lonDeg * (180 / Math.PI) - 180;
      const alt = 512 + 38 * Math.sin(orbU * 1.7);

      putGlyphs(mapX0, mapY0 - 2, T_GND, C_INK, 0.58 * gate);
      const ry = mapY1 + 2;
      putGlyphs(mapX0, ry, T_LAT, C_DIM, 0.46 * gate);
      putNum(mapX0 + 4, ry, lat, 2, 2, C_INK, 0.5 * gate, true);
      putGlyphs(mapX0 + 13, ry, T_LON, C_DIM, 0.46 * gate);
      putNum(mapX0 + 17, ry, lonDeg, 3, 2, C_INK, 0.5 * gate, true);
      putGlyphs(mapX0, ry + 1, T_ALT, C_DIM, 0.46 * gate);
      putNum(mapX0 + 4, ry + 1, alt, 3, 1, C_INK, 0.5 * gate, false);
      putGlyphs(mapX0 + 10, ry + 1, T_KM, C_DIM, 0.38 * gate);
      putGlyphs(mapX0 + 13, ry + 1, T_INC, C_DIM, 0.46 * gate);
      putNum(mapX0 + 17, ry + 1, ORB_INC * (180 / Math.PI), 2, 1, C_INK, 0.5 * gate, false);
    }

    function drawRadar(gate: number): void {
      if (!showRadar || gate <= 0.01 || radN === 0) return;

      for (let i = 0; i < radN; i++) {
        const d = wrapTau(sweep - radAng[i]);
        const r = radRad[i];
        // Range rings, over a diagonal stipple (cell index plus row, mod 3)
        // that gives the disc a faint ground without filling it in.
        const stipple = (radIdx[i] + ((radIdx[i] / cols) | 0)) % 3 === 0;
        let lvl = radRing[i] ? 0.34 : stipple ? 0.11 : 0;
        let glyph = lvl > 0 ? I_MID : 0;
        const glow = Math.exp(-d * 1.55) * (0.66 - 0.3 * r);
        if (glow > lvl) {
          lvl = glow;
          glyph = ramp(0.25 + glow * 1.1);
        }
        if (lvl > 0.02) put(radIdx[i] % cols, (radIdx[i] / cols) | 0, glyph, C_DIM, lvl * gate);
      }

      /* The leading edge of the beam, drawn brighter than its own afterglow. */
      const ca = Math.cos(sweep);
      const sa = Math.sin(sweep);
      const steps = Math.max(4, Math.round(rrx));
      for (let s = 1; s <= steps; s++) {
        const f = s / steps;
        const x = Math.round(rcx + ca * f * rrx);
        const y = Math.round(rcy + sa * f * rry);
        put(x, y, ramp(0.9 - f * 0.35), C_HOT, (0.88 - f * 0.32) * gate);
      }
      put(Math.round(rcx), Math.round(rcy), I_PLUS, C_INK, 0.45 * gate);

      let contacts = 0;
      for (let i = 0; i < BLIPS; i++) {
        const lv = blipLvl[i];
        if (lv < 0.05) continue;
        contacts++;
        const x = Math.round(rcx + Math.cos(blipAng[i]) * blipRad[i] * rrx);
        const y = Math.round(rcy + Math.sin(blipAng[i]) * blipRad[i] * rry);
        put(x, y, lv > 0.6 ? I_HASH : I_STAR, lv > 0.35 ? C_HOT : C_DIM, (0.35 + lv * 0.65) * gate);
      }

      // Pinned so the widest readout below the disc always fits on the grid.
      const lx = Math.max(1, Math.min(cols - 20, Math.round(rcx - rrx)));
      const ly = Math.round(rcy + rry) + 2;
      putGlyphs(lx, Math.round(rcy - rry) - 2, T_SWEEP, C_INK, 0.58 * gate);
      putGlyphs(lx, ly, T_AZ, C_DIM, 0.46 * gate);
      putNum(lx + 3, ly, sweep * (180 / Math.PI), 3, 1, C_INK, 0.5 * gate, false);
      putGlyphs(lx + 10, ly, T_RNG, C_DIM, 0.46 * gate);
      putNum(lx + 14, ly, 4200 + 900 * Math.sin(clock * 0.4), 5, 0, C_INK, 0.5 * gate, false);
      putGlyphs(lx, ly + 1, T_TRK, C_DIM, 0.46 * gate);
      putNum(lx + 4, ly + 1, contacts, 2, 0, C_INK, 0.5 * gate, false);
    }

    function drawPanel(gate: number, prog: number, vAbs: number): void {
      if (!showPanel || gate <= 0.01) return;
      const x = Math.round(cols * 0.045);
      let y = Math.max(2, Math.round(rows * 0.1));

      putGlyphs(x, y, T_HDR, C_INK, 0.7 * gate);
      /* The header underscore doubles as the section progress bar. */
      const barW = Math.min(22, Math.round(cols * 0.16));
      const fill = Math.round(prog * barW);
      for (let k = 0; k < barW; k++) {
        put(
          x + k,
          y + 1,
          k < fill ? I_EQ : I_MINUS,
          k < fill ? C_HOT : C_DIM,
          (k < fill ? 0.45 : 0.2) * gate
        );
      }
      y += 3;

      putGlyphs(x, y, T_LINK, C_DIM, 0.44 * gate);
      putGlyphs(x + 7, y, T_NOMINAL, C_COOL, (0.48 + 0.2 * Math.sin(clock * 2.2)) * gate);
      y++;
      putGlyphs(x, y, T_BUS, C_DIM, 0.44 * gate);
      putNum(x + 7, y, 27.4 + 0.9 * Math.sin(clock * 0.63), 2, 2, C_INK, 0.58 * gate, false);
      putGlyphs(x + 13, y, T_V, C_DIM, 0.38 * gate);
      y++;
      putGlyphs(x, y, T_TEMP, C_DIM, 0.44 * gate);
      putNum(x + 7, y, -38.5 + 6 * Math.sin(clock * 0.21 + 1.4), 2, 1, C_INK, 0.58 * gate, true);
      putGlyphs(x + 13, y, T_C, C_DIM, 0.38 * gate);
      y++;
      putGlyphs(x, y, T_SIG, C_DIM, 0.44 * gate);
      putNum(
        x + 7,
        y,
        0.62 + 0.3 * (1 - vAbs) * Math.abs(dispAct[NET_OFFS[NET_L - 1] + winner]),
        1,
        3,
        C_INK,
        0.58 * gate,
        false
      );
      y++;

      /* Mission elapsed time is the reader's own progress through the section. */
      const secs = Math.floor(prog * 10800);
      putGlyphs(x, y, T_MET, C_DIM, 0.44 * gate);
      putNum(x + 7, y, (secs / 3600) | 0, 2, 0, C_INK, 0.58 * gate, false);
      put(x + 9, y, I_COLON, C_DIM, 0.44 * gate);
      putNum(x + 10, y, ((secs / 60) | 0) % 60, 2, 0, C_INK, 0.58 * gate, false);
      put(x + 12, y, I_COLON, C_DIM, 0.44 * gate);
      putNum(x + 13, y, secs % 60, 2, 0, C_INK, 0.58 * gate, false);
    }

    /* Corruption runs last so it can only ever damage cells an instrument has
       already lit — a dropout in the link, not a random speck on the panel. */
    function applyCorruption(): void {
      const total = cols * rows;
      for (let i = 0; i < CORRUPT; i++) {
        if (corT[i] <= 0) continue;
        const idx = corIdx[i];
        if (idx < 0 || idx >= total || levelBuf[idx] === 0) continue;
        colorBuf[idx] = C_HOT;
        if (corT[i] / corDur[i] > 0.35) {
          // Scrambling: hold a wrong glyph, swapped a few times a second.
          const roll = ((clock * 14 + i * 3.1) | 0) % 36;
          glyphBuf[idx] = I_D0 + (roll < 0 ? roll + 36 : roll);
          levelBuf[idx] = Math.min(LEVELS, levelBuf[idx] + 2);
        } else {
          // Resolving: the true glyph is back, still hot for a moment.
          levelBuf[idx] = Math.min(LEVELS, levelBuf[idx] + 1);
        }
      }
    }

    /* ===================================================================
       Frame
       =================================================================== */
    function draw(): void {
      if (!ctx) return;
      if (atlasDirty.current) buildAtlas();

      const p = propsRef.current;
      const inten = Math.max(0, Math.min(1, p.intensity));

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (inten <= 0.004 || !atlasReady) return;

      const prog = Math.max(0, Math.min(1, p.progress));
      const vAbs = Math.min(1, Math.abs(p.velocity) / 90);

      levelBuf.fill(0);

      /* Instruments come online as the reader moves through the section, so the
         console boots rather than simply existing. */
      const gAmb = ss(0.0, 0.08, prog);
      const gNet = ss(0.02, 0.2, prog);
      const gMap = ss(0.16, 0.38, prog);
      const gRad = ss(0.3, 0.52, prog);

      drawAmbient(gAmb);
      drawChrome(gAmb);
      drawNet(gNet);
      drawMap(gMap);
      drawRadar(gRad);
      drawPanel(gAmb, prog, vAbs);
      applyCorruption();

      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = inten;
      let i = 0;
      for (let y = 0; y < rows; y++) {
        const py = oy + y * ch;
        for (let x = 0; x < cols; x++, i++) {
          const l = levelBuf[i];
          if (l === 0) continue;
          ctx.drawImage(
            atlas,
            glyphBuf[i] * cw,
            (colorBuf[i] * LEVELS + (l - 1)) * ch,
            cw,
            ch,
            ox + x * cw,
            py,
            cw,
            ch
          );
        }
      }
      ctx.globalAlpha = 1;
    }

    /* ===================================================================
       Lifecycle
       =================================================================== */
    let raf = 0;
    let last = 0;
    /* Start optimistic, as every other backdrop does. IntersectionObserver only
       delivers its first callback after observe(), so gating the very first draw
       on it leaves the console blank until then, and completely blank anywhere
       IO never fires. The observer below still parks it the moment it is
       genuinely offscreen. */
    let onScreen = true;
    let pageVisible = !document.hidden;

    function frame(now: number): void {
      raf = requestAnimationFrame(frame);
      let dt = last === 0 ? 1 / 60 : (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;
      if (dt < 0) dt = 0;
      step(dt);
      draw();
    }

    function start(): void {
      if (reduce || raf !== 0 || !onScreen || !pageVisible) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    }

    function stop(): void {
      if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    /* A single repaint for the cases where the loop is not running: reduced
       motion, an offscreen section, or a theme swap between frames. */
    function redraw(): void {
      if (raf !== 0 || !onScreen || !pageVisible) return;
      draw();
    }
    redrawRef.current = redraw;

    /* A pass has to exist before the first paint, or the diagram is a dead
       graph on frame one. */
    startPass();
    netPose();

    layout();

    if (reduce) {
      // Warm the simulation so the single static frame shows a console that has
      // been running, not one that just powered on.
      for (let i = 0; i < 240; i++) step(1 / 60);
      /* Then park the network mid-flight: the one frame reduced motion gets
         should show a wavefront crossing the last gap, which is the moment
         that explains what the plate is. */
      passT = P_ARRIVE + (NET_L - 2) * P_STAGE + P_TRAVEL * 0.62;
      netPose();
    }

    const ro = new ResizeObserver(() => {
      layout();
      if (reduce || raf === 0) redraw();
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(
      (entries) => {
        for (let i = 0; i < entries.length; i++) onScreen = entries[i].isIntersecting;
        if (onScreen) {
          if (reduce) redraw();
          else start();
        } else {
          stop();
        }
      },
      { rootMargin: '96px' }
    );
    io.observe(canvas);

    function onVisibility(): void {
      pageVisible = !document.hidden;
      if (pageVisible) {
        if (reduce) redraw();
        else start();
      } else {
        stop();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      redrawRef.current = null;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      // Deliberately no loseContext(): React can remount this same canvas node
      // in StrictMode, and a lost context never comes back.
      atlas.width = 0;
      atlas.height = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* A theme swap changes every colour in the atlas, so it has to be rebaked. */
  useEffect(() => {
    atlasDirty.current = true;
    const fn = redrawRef.current;
    if (fn) fn();
  }, [palette.surface, palette.ink, palette.ink2, palette.accent, palette.accent2]);

  /* Under reduced motion there is no loop, so the static frame is refreshed
     when the values it depends on change. redraw() no-ops while running. */
  useEffect(() => {
    const fn = redrawRef.current;
    if (fn) fn();
  }, [intensity, progress]);

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
