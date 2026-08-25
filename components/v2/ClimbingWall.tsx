'use client';

/* ============================================================================
   ClimbingWall — a bouldering panel drawn entirely in monospace glyphs.

   Four systems, kept apart on purpose:

   1. ATLAS     every character of the ramp is rasterised once per tone into a
                single offscreen sheet, then blitted cell by cell. A grid of
                DOM spans would be several thousand nodes and would jank on
                every frame; a glyph atlas is one texture and one drawImage per
                dirty cell.
   2. WALL      holds are organic blobs on a jittered field, not circles. A
                subset of them is generated FIRST as an ascending line, and the
                scatter is laid around it, so the route is guaranteed climbable
                rather than hoped to be. The route carries vermilion.
   3. CLIMBER   a stick figure in the same grid. Limbs are rasterised as glyph
                lines from shoulder to hand and hip to foot, so a reach really
                is a reach. It ascends, sometimes slips, falls, starts again.
                Holds it has touched stay marked, this attempt in vermilion and
                earlier attempts in blue, so progress accumulates on the wall.
   4. BLIT      compose into two typed arrays (glyph, tone), diff against what
                is already on the canvas, and repaint only the cells that
                changed. Idle shimmer touches a few hundred cells a frame, the
                climber a few dozen; a full grid repaint would be pointless
                work at sixty hertz.

   The fall is the whole point of the section, so the slip probability climbs
   with height: falls happen near the top of the route, where they read.
   ========================================================================== */

import { useEffect, useRef } from 'react';

export interface ClimbingWallProps {
  /** Plate height. A number is taken as px. */
  height?: number | string;
  /** Glyph ramp, light to dense. Spaces are treated as empty cells. */
  ramp?: string;
  className?: string;
  /** Change to regenerate the wall and its route. */
  seed?: number;
}

/* -------------------------------------------------------------------------- */
/* constants                                                                   */
/* -------------------------------------------------------------------------- */

const CELL_W = 8;
const CELL_H = 16;

const DEFAULT_RAMP = ' .:-=+*x#%@';

/** Glyphs the figure and the dust need, appended to the ramp in the atlas. */
const FIGURE_CHARS = ['o', 'O', '|', '-', '/', '\\', '+', '*', '.', ':', '^'];

/* tone table. Index into this is what the tone array stores. */
const T_WALL_FAINT = 0;
const T_WALL = 1;
const T_WALL_LIT = 2;
const T_HOLD_RIM = 3;
const T_HOLD_CORE = 4;
const T_ROUTE_GHOST = 5;
const T_ROUTE = 6;
const T_ROUTE_LIVE = 7;
const T_CHALKED = 8;
const T_CLIMBER = 9;
const T_DUST_NEAR = 10;
const T_DUST_FAR = 11;

const TONES: ReadonlyArray<{ token: string; fallback: string; alpha: number }> = [
  { token: '--ink', fallback: '#17140F', alpha: 0.11 },
  { token: '--ink', fallback: '#17140F', alpha: 0.19 },
  { token: '--ink', fallback: '#17140F', alpha: 0.3 },
  { token: '--ink', fallback: '#17140F', alpha: 0.38 },
  { token: '--ink', fallback: '#17140F', alpha: 0.58 },
  { token: '--verm', fallback: '#B5402F', alpha: 0.18 },
  { token: '--verm', fallback: '#B5402F', alpha: 0.42 },
  { token: '--verm', fallback: '#B5402F', alpha: 1 },
  { token: '--blue', fallback: '#2A4C7D', alpha: 0.55 },
  { token: '--ink', fallback: '#17140F', alpha: 0.94 },
  { token: '--ink', fallback: '#17140F', alpha: 0.34 },
  { token: '--ink', fallback: '#17140F', alpha: 0.15 }
];

/** Rows per second squared. Deliberately under real gravity: a fall that takes
    a beat and a half is legible, one that takes a fifth of a second is a
    dropped frame. */
const FALL_GRAV = 46;
const DUST_GRAV = 3.4;
const DUST_MAX = 72;

/**
 * How far below the hands the centre of mass hangs, in rows, and where the
 * rest of the figure sits relative to it. Every gap here is exactly one row,
 * because two parts a fraction of a row apart round into the same cell and the
 * figure loses its head. Literally.
 */
const STANCE_DROP = 2.7;
const HEAD_ROW = -1.7;
const SHOULDER_ROW = -0.7;
const HIP_ROW = 0.3;
const FOOT_ROW = 2.3;

type Phase = 'settle' | 'reach' | 'commit' | 'fall' | 'ground' | 'top';

interface Hold {
  col: number;
  row: number;
  route: boolean;
  /** Cell indices this hold covers, precomputed so re-marking is a memcpy. */
  cells: Int32Array;
  /** 0 untouched, 1 touched this attempt, 2 chalked on an earlier attempt. */
  state: number;
}

interface Pt {
  c: number;
  r: number;
}

/* -------------------------------------------------------------------------- */
/* small helpers                                                               */
/* -------------------------------------------------------------------------- */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeInOut(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
}

/** `#RRGGBB` plus alpha, tolerant of the whitespace getPropertyValue leaves. */
function rgba(hex: string, alpha: number): string {
  const h = hex.trim().replace('#', '');
  const full =
    h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return `rgba(23,20,15,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/* -------------------------------------------------------------------------- */
/* component                                                                   */
/* -------------------------------------------------------------------------- */

export default function ClimbingWall({
  height = 560,
  ramp = DEFAULT_RAMP,
  className,
  seed = 0x1b0c17
}: ClimbingWallProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let disposed = false;

    /* ---- palette, read from the live tokens so the plate follows the sheet -- */
    const rootStyle = getComputedStyle(document.documentElement);
    const toneColors = TONES.map((t) => {
      const v = rootStyle.getPropertyValue(t.token);
      return rgba(v && v.trim() ? v : t.fallback, t.alpha);
    });
    const monoStack =
      rootStyle.getPropertyValue('--f-mono').trim() ||
      '"JetBrains Mono", ui-monospace, Menlo, monospace';

    /* ---- character table -------------------------------------------------- */
    /* The ramp drives the wall texture and the holds; the figure chars are
       appended so the climber and the dust share one atlas. Spaces never enter
       the atlas: an empty cell is glyph 0 and is simply not drawn. */
    const rampChars = Array.from(ramp.length ? ramp : DEFAULT_RAMP);
    const chars: string[] = [];
    const charIndex = new Map<string, number>();
    const addChar = (ch: string) => {
      if (ch === ' ' || charIndex.has(ch)) return;
      charIndex.set(ch, chars.length);
      chars.push(ch);
    };
    rampChars.forEach(addChar);
    FIGURE_CHARS.forEach(addChar);

    /** Glyph value for a literal character. 0 means "leave the cell empty". */
    function gv(ch: string): number {
      const i = charIndex.get(ch);
      return i === undefined ? 0 : i + 1;
    }
    /** Glyph value for a position on the ramp, 0..1 light to dense. */
    function rampGlyph(f: number): number {
      const i = Math.max(
        0,
        Math.min(rampChars.length - 1, Math.round(clamp01(f) * (rampChars.length - 1)))
      );
      return gv(rampChars[i]);
    }

    const G_HEAD = gv('O');
    const G_BODY = gv('|');
    const G_FLAT = gv('-');
    const G_UP = gv('/');
    const G_DOWN = gv('\\');
    const G_HAND = gv('o');
    const G_DUST = [gv('*'), gv('+'), gv(':'), gv('.')];
    const G_TEXTURE = gv('.') || rampGlyph(0.12);
    const G_TEXTURE_LIT = gv(':') || rampGlyph(0.22);

    /* ---- grid state, all reallocated on layout, never per frame ----------- */
    let cols = 0;
    let rows = 0;
    let cw = CELL_W;
    let ch = CELL_H;
    let baseG = new Uint8Array(0);
    let baseT = new Uint8Array(0);
    let curG = new Uint8Array(0);
    let curT = new Uint8Array(0);
    let prevG = new Uint8Array(0);
    let prevT = new Uint8Array(0);
    let twinkleIdx = new Int32Array(0);
    let twinklePh = new Float32Array(0);
    let holds: Hold[] = [];
    let route: Hold[] = [];
    let atlas: HTMLCanvasElement | null = null;

    /* ---- dust, struct of arrays so a puff allocates nothing --------------- */
    const dC = new Float32Array(DUST_MAX);
    const dR = new Float32Array(DUST_MAX);
    const dVC = new Float32Array(DUST_MAX);
    const dVR = new Float32Array(DUST_MAX);
    const dLife = new Float32Array(DUST_MAX);
    const dMax = new Float32Array(DUST_MAX);
    let dCursor = 0;

    /* The WALL is seeded, so the same panel comes back on every reload and on
       every resize. The ASCENT is not: a seeded stream consumes a near constant
       number of draws per move, which made the climber slip off the same hold
       on every attempt. A performance that repeats is worse than one that is
       not reproducible. */
    const rnd = Math.random;

    function puff(col: number, row: number, count: number, strength: number): void {
      for (let k = 0; k < count; k++) {
        /* Round robin rather than a search: an old mote losing its slot to a
           fresh one is invisible, and this stays O(1). */
        const i = dCursor;
        dCursor = (dCursor + 1) % DUST_MAX;
        dC[i] = col + (rnd() - 0.5) * 1.2;
        dR[i] = row + (rnd() - 0.5) * 0.7;
        dVC[i] = (rnd() - 0.5) * 5.2 * strength;
        dVR[i] = -(0.5 + rnd() * 2.1) * strength;
        const life = 0.75 + rnd() * 0.95;
        dLife[i] = life;
        dMax[i] = life;
      }
    }

    /* ---- the climber ------------------------------------------------------ */
    const hands: Pt[] = [
      { c: 0, r: 0 },
      { c: 0, r: 0 }
    ];
    const footOff: Pt[] = [
      { c: -1.7, r: 2.2 },
      { c: 1.7, r: 2.2 }
    ];
    const footTo: Pt[] = [
      { c: -1.7, r: 2.2 },
      { c: 1.7, r: 2.2 }
    ];

    const cl = {
      phase: 'settle' as Phase,
      t: 0,
      dur: 0.5,
      /** index into `route` of the hold each hand is on */
      top: 0,
      next: 1,
      /** which hand reaches next */
      active: 0,
      bc: 0,
      br: 0,
      vr: 0,
      drift: 0,
      sway: 0,
      dustT: 0,
      fromC: 0,
      fromR: 0,
      toC: 0,
      toR: 0,
      bFromC: 0,
      bFromR: 0,
      bToC: 0,
      bToR: 0
    };

    let time = 0;

    /* ---------------------------------------------------------------------- */
    /* atlas                                                                   */
    /* ---------------------------------------------------------------------- */

    function buildAtlas(): void {
      const c = document.createElement('canvas');
      c.width = Math.max(1, chars.length * cw);
      c.height = Math.max(1, TONES.length * ch);
      const x = c.getContext('2d');
      if (!x) return;
      /* A mono advance is about 0.6em, so this sizes the glyph to the cell
         width and only then clamps to the cell height. */
      const fontPx = Math.max(6, Math.min(ch * 0.84, cw / 0.6));
      x.font = `${fontPx}px ${monoStack}`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      for (let t = 0; t < TONES.length; t++) {
        x.fillStyle = toneColors[t];
        const y = t * ch + ch / 2;
        for (let g = 0; g < chars.length; g++) {
          x.fillText(chars[g], g * cw + cw / 2, y);
        }
      }
      atlas = c;
    }

    /* ---------------------------------------------------------------------- */
    /* wall generation                                                         */
    /* ---------------------------------------------------------------------- */

    function markHold(
      col: number,
      row: number,
      rx: number,
      ry: number,
      isRoute: boolean,
      rand: () => number
    ): Hold {
      /* An ellipse pushed around by three low harmonics. Real holds are
         sculpted, so none of these is a circle and none repeats. Wobble stays
         modest: past about 0.2 the third harmonic turns everything into a
         clover. */
      const p1 = rand() * Math.PI * 2;
      const p2 = rand() * Math.PI * 2;
      const p3 = rand() * Math.PI * 2;
      const c0 = Math.max(0, Math.floor(col - rx - 1));
      const c1 = Math.min(cols - 1, Math.ceil(col + rx + 1));
      const r0 = Math.max(0, Math.floor(row - ry - 1));
      const r1 = Math.min(rows - 1, Math.ceil(row + ry + 1));
      const found: number[] = [];

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const nx = (c - col) / rx;
          const ny = (r - row) / ry;
          const th = Math.atan2(ny, nx);
          const wob =
            1 +
            0.17 * Math.sin(3 * th + p1) +
            0.11 * Math.sin(2 * th + p2) +
            0.06 * Math.sin(5 * th + p3);
          const d = Math.hypot(nx, ny) / Math.max(0.35, wob);
          if (d > 1) continue;
          const i = r * cols + c;
          found.push(i);
          baseG[i] = rampGlyph(0.34 + 0.66 * (1 - d));
          baseT[i] = isRoute ? T_ROUTE : d < 0.55 ? T_HOLD_CORE : T_HOLD_RIM;
        }
      }
      return { col, row, route: isRoute, cells: Int32Array.from(found), state: 0 };
    }

    function buildWall(): void {
      const rand = mulberry32(seed);
      baseG.fill(0);
      baseT.fill(0);
      holds = [];
      route = [];

      /* --- paper tooth: a sparse field the shimmer later breathes through --- */
      const n = cols * rows;
      for (let i = 0; i < n; i++) {
        const v = rand();
        if (v < 0.07) {
          baseG[i] = G_TEXTURE_LIT;
          baseT[i] = T_WALL;
        } else if (v < 0.27) {
          baseG[i] = G_TEXTURE;
          baseT[i] = T_WALL_FAINT;
        }
      }

      /* --- the route, generated before the scatter so it is always a line --- */
      /* Few and far apart. Pack them any tighter and the holds merge into one
         painted stripe instead of reading as a sequence of moves. */
      const count = Math.max(5, Math.min(9, Math.round(rows / 5.5)));
      const spine = cols * 0.5 + (rand() - 0.5) * cols * 0.16;
      const amp = cols * 0.15;
      const phase = rand() * Math.PI * 2;
      /* The bottom hold leaves the standing figure room below it, the top one
         leaves its head room above. */
      const lowRow = rows - 7;
      const highRow = 2.6;
      for (let k = 0; k < count; k++) {
        const u = count > 1 ? k / (count - 1) : 0;
        const row = lowRow - u * (lowRow - highRow);
        let col = spine + Math.sin(phase + u * 3.4) * amp + (rand() - 0.5) * 2.6;
        col = Math.max(4, Math.min(cols - 5, col));
        const rx = 2.2 + rand() * 0.9;
        const ry = 1.1 + rand() * 0.55;
        route.push(markHold(col, row, rx, ry, true, rand));
      }
      holds.push(...route);

      /* --- the scatter: everything that is not on the route ----------------- */
      const scatter = Math.round((cols * rows) / 105);
      for (let k = 0; k < scatter; k++) {
        const col = 2 + rand() * (cols - 5);
        const row = 1.5 + rand() * (rows - 3);
        let clash = false;
        for (let j = 0; j < route.length; j++) {
          const h = route[j];
          if (Math.abs(h.col - col) < 4.4 && Math.abs(h.row - row) < 2.6) {
            clash = true;
            break;
          }
        }
        if (clash) continue;
        /* deliberately smaller than a route hold: the route has to win */
        const rx = 0.95 + rand() * 0.75;
        const ry = 0.6 + rand() * 0.4;
        holds.push(markHold(col, row, rx, ry, false, rand));
      }

      /* --- the ghost line between route holds ------------------------------ */
      /* Bouldering marks a route with tape, not with a drawn line. This is the
         faintest tone on the sheet and only lands on cells that are otherwise
         empty, so it reads as a hint rather than a diagram. */
      for (let k = 0; k + 1 < route.length; k++) {
        const a = route[k];
        const b = route[k + 1];
        const steps = Math.ceil(Math.hypot(b.col - a.col, (b.row - a.row) * 2) * 2);
        for (let s = 1; s < steps; s++) {
          const u = s / steps;
          const c = Math.round(a.col + (b.col - a.col) * u);
          const r = Math.round(a.row + (b.row - a.row) * u);
          if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
          const i = r * cols + c;
          if (baseG[i] !== 0 && baseT[i] > T_WALL) continue;
          baseG[i] = gv('.');
          baseT[i] = T_ROUTE_GHOST;
        }
      }

      /* --- shimmer sample: a tenth of the field, off the holds -------------- */
      const want = Math.floor(n * 0.1);
      const idx = new Int32Array(want);
      const ph = new Float32Array(want);
      let got = 0;
      let guard = 0;
      while (got < want && guard < want * 6) {
        guard++;
        const i = Math.floor(rand() * n);
        if (baseT[i] > T_WALL) continue;
        idx[got] = i;
        ph[got] = rand() * Math.PI * 2;
        got++;
      }
      twinkleIdx = idx.subarray(0, got);
      twinklePh = ph.subarray(0, got);
    }

    /* ---------------------------------------------------------------------- */
    /* the ascent                                                              */
    /* ---------------------------------------------------------------------- */

    /** Where the body hangs when the hands are on these two holds. */
    function stanceCol(a: Hold, b: Hold): number {
      return (a.col + b.col) / 2;
    }
    function stanceRow(a: Hold, b: Hold): number {
      return (a.row + b.row) / 2 + STANCE_DROP;
    }

    /** Pick something to stand on for each side, else hang the leg. */
    function planFeet(bc: number, br: number): void {
      for (let s = 0; s < 2; s++) {
        const dir = s === 0 ? -1 : 1;
        let best: Hold | null = null;
        let bd = Infinity;
        for (let i = 0; i < holds.length; i++) {
          const h = holds[i];
          const dr = h.row - br;
          if (dr < 1.2 || dr > 3.6) continue;
          const dc = (h.col - bc) * dir;
          if (dc < -0.6 || dc > 3.6) continue;
          const d = Math.hypot(dc, dr);
          if (d < bd) {
            bd = d;
            best = h;
          }
        }
        if (best) {
          footTo[s].c = best.col - bc;
          footTo[s].r = best.row - br;
          if (best.state === 0) best.state = 1;
        } else {
          footTo[s].c = dir * 1.7;
          footTo[s].r = FOOT_ROW;
        }
      }
    }

    function startAttempt(): void {
      /* Fold the finished attempt into the chalk history. Progress reads across
         attempts, which is the point of the section. */
      for (let i = 0; i < holds.length; i++) {
        if (holds[i].state === 1) holds[i].state = 2;
      }
      if (route.length < 2) return;
      const a = route[0];
      hands[0].c = a.col - 1.5;
      hands[0].r = a.row;
      hands[1].c = a.col + 1.5;
      hands[1].r = a.row;
      a.state = 1;
      cl.top = 0;
      cl.next = 1;
      cl.active = 0;
      cl.bc = a.col;
      cl.br = a.row + STANCE_DROP;
      cl.vr = 0;
      cl.drift = 0;
      planFeet(cl.bc, cl.br);
      footOff[0].c = footTo[0].c;
      footOff[0].r = footTo[0].r;
      footOff[1].c = footTo[1].c;
      footOff[1].r = footTo[1].r;
      cl.phase = 'settle';
      cl.t = 0;
      cl.dur = 0.55;
    }

    function beginReach(): void {
      const target = route[cl.next];
      if (!target) {
        cl.phase = 'top';
        cl.t = 0;
        cl.dur = 1.5;
        return;
      }
      const h = hands[cl.active];
      cl.fromC = h.c;
      cl.fromR = h.r;
      cl.toC = target.col;
      cl.toR = target.row;
      cl.bFromC = cl.bc;
      cl.bFromR = cl.br;
      /* The body only creeps during the reach. It commits afterwards, which is
         what makes the commit read as a decision rather than a slide. */
      const sc = stanceCol(target, route[cl.top]);
      const sr = stanceRow(target, route[cl.top]);
      cl.bToC = cl.bc + (sc - cl.bc) * 0.3;
      cl.bToR = cl.br + (sr - cl.br) * 0.26;
      cl.phase = 'reach';
      cl.t = 0;
      cl.dur = 0.46 + rnd() * 0.24;
    }

    /** Odds the hand pops. Zero on the first move, then rising with height. */
    function slipChance(): number {
      if (cl.next <= 1 || route.length < 3) return 0;
      const u = cl.next / (route.length - 1);
      return 0.05 + 0.2 * u;
    }

    function latch(): void {
      const target = route[cl.next];
      if (!target) return;
      hands[cl.active].c = target.col;
      hands[cl.active].r = target.row;
      if (rnd() < slipChance()) {
        puff(target.col, target.row, 11, 1.15);
        cl.phase = 'fall';
        cl.t = 0;
        cl.vr = 0.4;
        cl.drift = (rnd() - 0.5) * 1.6;
        return;
      }
      target.state = 1;
      puff(target.col, target.row, 2, 0.5);
      cl.bFromC = cl.bc;
      cl.bFromR = cl.br;
      cl.bToC = stanceCol(target, route[cl.top]);
      cl.bToR = stanceRow(target, route[cl.top]);
      planFeet(cl.bToC, cl.bToR);
      cl.phase = 'commit';
      cl.t = 0;
      cl.dur = 0.4 + rnd() * 0.18;
    }

    function endCommit(): void {
      cl.top = cl.next;
      cl.next += 1;
      cl.active = cl.active === 0 ? 1 : 0;
      if (cl.next >= route.length) {
        const t = route[cl.top];
        puff(t.col, t.row - 0.6, 5, 0.8);
        cl.phase = 'top';
        cl.t = 0;
        cl.dur = 1.6;
      } else {
        cl.phase = 'settle';
        cl.t = 0;
        /* now and then a long look at the next move, so the pace is not a
           metronome */
        cl.dur = 0.26 + rnd() * 0.55 + (rnd() < 0.18 ? 0.9 + rnd() * 0.8 : 0);
      }
    }

    function update(dt: number): void {
      time += dt;
      cl.t += dt;

      for (let i = 0; i < DUST_MAX; i++) {
        if (dLife[i] <= 0) continue;
        dLife[i] -= dt;
        dVR[i] += DUST_GRAV * dt;
        dC[i] += dVC[i] * dt;
        dR[i] += dVR[i] * dt;
      }

      switch (cl.phase) {
        case 'settle': {
          cl.sway = Math.sin(time * 1.7) * 0.1;
          if (cl.t >= cl.dur) beginReach();
          break;
        }
        case 'reach': {
          const u = clamp01(cl.t / cl.dur);
          const e = easeInOut(u);
          const h = hands[cl.active];
          h.c = cl.fromC + (cl.toC - cl.fromC) * e;
          /* the hand arcs rather than tracking a straight line to the hold */
          h.r = cl.fromR + (cl.toR - cl.fromR) * e - Math.sin(u * Math.PI) * 0.55;
          cl.bc = cl.bFromC + (cl.bToC - cl.bFromC) * e;
          cl.br = cl.bFromR + (cl.bToR - cl.bFromR) * e;
          cl.sway = Math.sin(time * 2.6) * 0.06;
          if (u >= 1) latch();
          break;
        }
        case 'commit': {
          const e = easeInOut(clamp01(cl.t / cl.dur));
          cl.bc = cl.bFromC + (cl.bToC - cl.bFromC) * e;
          cl.br = cl.bFromR + (cl.bToR - cl.bFromR) * e;
          const k = Math.min(1, dt * 7);
          for (let s = 0; s < 2; s++) {
            footOff[s].c += (footTo[s].c - footOff[s].c) * k;
            footOff[s].r += (footTo[s].r - footOff[s].r) * k;
          }
          cl.sway = 0;
          if (cl.t >= cl.dur) endCommit();
          break;
        }
        case 'fall': {
          cl.vr += FALL_GRAV * dt;
          cl.br += cl.vr * dt;
          cl.bc += cl.drift * dt;
          const k = Math.min(1, dt * 10);
          for (let s = 0; s < 2; s++) {
            const dir = s === 0 ? -1 : 1;
            /* arms above, legs under: the shape of someone who just came off */
            hands[s].c += (cl.bc + dir * 1.35 - hands[s].c) * k;
            hands[s].r += (cl.br - 2.4 - hands[s].r) * k;
            footOff[s].c += (dir * 1.15 - footOff[s].c) * k;
            footOff[s].r += (1.6 - footOff[s].r) * k;
          }
          cl.dustT -= dt;
          if (cl.dustT <= 0) {
            puff(cl.bc, cl.br - 1, 1, 0.4);
            cl.dustT = 0.1;
          }
          if (cl.br > rows + 3) {
            cl.phase = 'ground';
            cl.t = 0;
            cl.dur = 0.8;
          }
          break;
        }
        case 'ground': {
          if (cl.t >= cl.dur) startAttempt();
          break;
        }
        case 'top': {
          cl.sway = Math.sin(time * 1.4) * 0.08;
          if (cl.t >= cl.dur) startAttempt();
          break;
        }
      }
    }

    /* ---------------------------------------------------------------------- */
    /* compose                                                                 */
    /* ---------------------------------------------------------------------- */

    function put(col: number, row: number, glyph: number, tone: number): void {
      const c = Math.round(col);
      const r = Math.round(row);
      if (c < 0 || c >= cols || r < 0 || r >= rows) return;
      const i = r * cols + c;
      curG[i] = glyph;
      curT[i] = tone;
    }

    /** Rasterise a limb as glyphs, choosing the character from the real slope. */
    function stroke(c0: number, r0: number, c1: number, r1: number, tone: number): void {
      const dc = c1 - c0;
      const dr = r1 - r0;
      const px = dc * cw;
      const py = dr * ch;
      const glyph =
        Math.abs(px) > Math.abs(py) * 2.2
          ? G_FLAT
          : Math.abs(py) > Math.abs(px) * 2.2
            ? G_BODY
            : px * py < 0
              ? G_UP
              : G_DOWN;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dc), Math.abs(dr) * 1.6) * 1.6));
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        put(c0 + dc * u, r0 + dr * u, glyph, tone);
      }
    }

    function composeClimber(): void {
      const bc = cl.bc + cl.sway;
      const br = cl.br;

      /* limbs first, trunk over the top, so an arm crossing the chest never
         eats the torso */
      for (let s = 0; s < 2; s++) {
        const h = hands[s];
        const dir = h.c >= bc ? 1 : -1;
        stroke(bc + dir * 0.9, br + SHOULDER_ROW, h.c, h.r, T_CLIMBER);

        const fc = bc + footOff[s].c;
        const fr = br + footOff[s].r;
        const fdir = fc >= bc ? 1 : -1;
        stroke(bc + fdir * 0.6, br + HIP_ROW, fc, fr, T_CLIMBER);
      }

      put(bc, br + SHOULDER_ROW, G_BODY, T_CLIMBER);
      put(bc - 0.9, br + SHOULDER_ROW, G_FLAT, T_CLIMBER);
      put(bc + 0.9, br + SHOULDER_ROW, G_FLAT, T_CLIMBER);
      put(bc, br + HIP_ROW, G_BODY, T_CLIMBER);
      put(bc, br + HEAD_ROW, G_HEAD, T_CLIMBER);

      /* hands last: whichever hold they are on, the latch has to read */
      for (let s = 0; s < 2; s++) put(hands[s].c, hands[s].r, G_HAND, T_CLIMBER);
    }

    function compose(): void {
      curG.set(baseG);
      curT.set(baseT);

      /* idle shimmer: the tooth of the paper breathing, never fully still */
      for (let k = 0; k < twinkleIdx.length; k++) {
        const i = twinkleIdx[k];
        const s = Math.sin(time * 1.2 + twinklePh[k]);
        if (s > 0.58) {
          curG[i] = G_TEXTURE_LIT;
          curT[i] = T_WALL_LIT;
        } else if (s < -0.7) {
          curG[i] = 0;
        }
      }

      /* holds carrying a mark */
      for (let i = 0; i < holds.length; i++) {
        const h = holds[i];
        if (h.state === 0) continue;
        const tone = h.route
          ? h.state === 1
            ? T_ROUTE_LIVE
            : T_CHALKED
          : h.state === 1
            ? T_HOLD_CORE
            : T_CHALKED;
        const cells = h.cells;
        for (let k = 0; k < cells.length; k++) curT[cells[k]] = tone;
      }

      /* the hold being aimed at, pulsing so the sequence reads */
      const nextHold = route[cl.next];
      if (nextHold && nextHold.state === 0 && Math.sin(time * 2.4) > 0.3) {
        const cells = nextHold.cells;
        for (let k = 0; k < cells.length; k++) curT[cells[k]] = T_ROUTE_LIVE;
      }

      /* chalk */
      for (let i = 0; i < DUST_MAX; i++) {
        const life = dLife[i];
        if (life <= 0) continue;
        const f = life / dMax[i];
        const g = f > 0.68 ? G_DUST[0] : f > 0.4 ? G_DUST[1] : f > 0.18 ? G_DUST[2] : G_DUST[3];
        put(dC[i], dR[i], g, f > 0.5 ? T_DUST_NEAR : T_DUST_FAR);
      }

      composeClimber();
    }

    /* ---------------------------------------------------------------------- */
    /* blit: only the cells that actually changed                              */
    /* ---------------------------------------------------------------------- */

    function blit(): void {
      const sheet = atlas;
      if (!sheet) return;
      for (let r = 0; r < rows; r++) {
        const y = r * ch;
        const base = r * cols;
        for (let c = 0; c < cols; c++) {
          const i = base + c;
          const g = curG[i];
          const t = curT[i];
          if (g === prevG[i] && t === prevT[i]) continue;
          const x = c * cw;
          ctx!.clearRect(x, y, cw, ch);
          if (g > 0) ctx!.drawImage(sheet, (g - 1) * cw, t * ch, cw, ch, x, y, cw, ch);
          prevG[i] = g;
          prevT[i] = t;
        }
      }
    }

    function repaintAll(): void {
      prevG.fill(0);
      prevT.fill(0);
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
    }

    /* ---------------------------------------------------------------------- */
    /* layout                                                                  */
    /* ---------------------------------------------------------------------- */

    /** Park the climber mid route, for the still frame. */
    function poseStatic(): void {
      startAttempt();
      if (route.length < 3) return;
      const mid = Math.max(1, Math.floor((route.length - 1) * 0.55));
      for (let k = 0; k <= mid; k++) route[k].state = k < mid - 1 ? 2 : 1;
      const a = route[mid];
      const b = route[mid - 1];
      hands[0].c = b.col;
      hands[0].r = b.row;
      hands[1].c = a.col;
      hands[1].r = a.row;
      cl.top = mid;
      cl.next = mid + 1;
      cl.active = 0;
      cl.bc = stanceCol(a, b);
      cl.br = stanceRow(a, b);
      cl.sway = 0;
      planFeet(cl.bc, cl.br);
      footOff[0].c = footTo[0].c;
      footOff[0].r = footTo[0].r;
      footOff[1].c = footTo[1].c;
      footOff[1].r = footTo[1].r;
      cl.phase = 'settle';
      cl.t = 0;
      cl.dur = 1e9; // the static frame never advances
    }

    function layout(): void {
      const rect = host!.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = Math.max(1, Math.round(CELL_W * dpr));
      ch = Math.max(1, Math.round(CELL_H * dpr));
      /* Overshoot by a cell rather than scale the canvas: the atlas is blitted
         one to one, and a fractional scale would blur every glyph. The host
         clips the overhang. */
      const nextCols = Math.max(10, Math.ceil((w * dpr) / cw));
      const nextRows = Math.max(8, Math.ceil((h * dpr) / ch));
      if (nextCols === cols && nextRows === rows && atlas) return;

      cols = nextCols;
      rows = nextRows;
      canvas!.width = cols * cw;
      canvas!.height = rows * ch;
      canvas!.style.width = `${(cols * cw) / dpr}px`;
      canvas!.style.height = `${(rows * ch) / dpr}px`;
      ctx!.setTransform(1, 0, 0, 1, 0, 0);

      const n = cols * rows;
      baseG = new Uint8Array(n);
      baseT = new Uint8Array(n);
      curG = new Uint8Array(n);
      curT = new Uint8Array(n);
      prevG = new Uint8Array(n);
      prevT = new Uint8Array(n);
      dLife.fill(0);

      buildAtlas();
      buildWall();
      if (reduced) poseStatic();
      else startAttempt();
      repaintAll();
      compose();
      blit();
    }

    layout();

    /* Web fonts land after first paint, and an atlas rasterised in the fallback
       face has the wrong weight and the wrong width. Rebuild once, then force a
       full repaint so no stale cell survives. */
    if (typeof document.fonts !== 'undefined' && document.fonts.status !== 'loaded') {
      document.fonts.ready.then(() => {
        if (disposed) return;
        buildAtlas();
        repaintAll();
        compose();
        blit();
      });
    }

    /* ---------------------------------------------------------------------- */
    /* loop                                                                    */
    /* ---------------------------------------------------------------------- */

    let raf = 0;
    let running = false;
    let onScreen = true;
    let last = 0;

    function frame(now: number): void {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      update(dt);
      compose();
      blit();
      raf = requestAnimationFrame(frame);
    }

    function sync(): void {
      const should = onScreen && !document.hidden && !reduced;
      if (should && !running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (!should && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    }

    const io = new IntersectionObserver(
      (entries) => {
        onScreen = entries[0].isIntersecting;
        sync();
      },
      { rootMargin: '120px 0px' }
    );
    io.observe(host);

    let resizeRaf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        if (disposed) return;
        layout();
      });
    });
    ro.observe(host);

    document.addEventListener('visibilitychange', sync);
    sync();

    /* dev handle, same reasoning as InkField and Companion: the ascent has to
       be steppable without a visible tab, since a hidden one gets no frames. */
    if (process.env.NODE_ENV !== 'production') {
      (canvas as unknown as Record<string, unknown>).__wall = {
        climber: cl,
        grid: () => ({ cols, rows, cw, ch, holds: holds.length, route: route.length }),
        marks: () => route.map((h) => h.state),
        step: (n = 1, dt = 1 / 60) => {
          for (let i = 0; i < n; i++) update(dt);
          compose();
          blit();
        },
        drop: () => {
          cl.phase = 'fall';
          cl.t = 0;
          cl.vr = 0.4;
        },
        /** The composed grid as text: glyphs, or the tone index per cell. */
        dump: (tone = false) => {
          const out: string[] = [];
          for (let r = 0; r < rows; r++) {
            let s = '';
            for (let c = 0; c < cols; c++) {
              const i = r * cols + c;
              const g = curG[i];
              s += tone
                ? g === 0
                  ? ' '
                  : curT[i].toString(36)
                : g === 0
                  ? ' '
                  : chars[g - 1];
            }
            out.push(s);
          }
          return out;
        }
      };
    }

    return () => {
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(resizeRaf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', sync);
      atlas = null;
    };
  }, [ramp, seed]);

  return (
    <div
      ref={hostRef}
      className={className ? `v2-wall ${className}` : 'v2-wall'}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
      aria-hidden="true"
      /* The bird lands on the top of the wall. See THE PERCH CONTRACT in
         components/v2/Companion.tsx. The host box top is NOT the top of the
         wall: the canvas is masked with a linear ramp that only reaches full
         strength at 13% of its height, so everything above that line is a
         fade and a bird standing on it would be standing on fog. 13% is the
         first row of the plate that is drawn at full ink. Expressed as a
         percentage so it tracks the `height` prop rather than the 420px this
         happens to be given on the home page. */
      data-perch
      data-perch-inset="13%"
    >
      <canvas ref={canvasRef} className="v2-wall-canvas" />
    </div>
  );
}
