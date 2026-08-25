'use client';

/* ============================================================================
   Scrapbook — the travelling world.

   An album page: polaroids, torn scraps, ticket stubs, a postmark, strips of
   tape with the fibre showing through, and a stitched route threading between
   them. The route is Jack's real hitchhike, Split to Tagounite, twenty stops
   through six countries, each frontier marked where the thread crosses it.

   Two decisions shape the whole file.

   1. EVERY ITEM IS PRE-RENDERED ONCE INTO ITS OWN OFFSCREEN CANVAS.
      Torn deckle edges, tape fibres and handwriting marks are expensive paths,
      and none of them change once the page is laid out. Baking them means the
      frame loop is ~30 drawImage calls plus one hairline route, and it lets the
      detail be as fine as paper deserves without paying for it every frame.
      The only thing that varies per frame is a transform and an alpha, which is
      exactly what "a page being handled" is anyway.

   2. FADING IS DONE WITH ctx.globalAlpha, NEVER BY BUILDING rgba() STRINGS.
      Building a colour string per draw would allocate on every frame. All
      colours are resolved to strings once, in setup, and modulated by alpha.
      ========================================================================== */

import { useEffect, useRef } from 'react';
import type { BackdropProps } from './types';
import { mulberry32, rgba, toRgb } from './types';

/* ---------------------------------------------------------------------------
   The route. Latitude/longitude pairs lifted verbatim from
   public/context.json -> hitchhikeRoute.stops, flattened.

   Inlined rather than fetched: a backdrop must be able to draw its first frame
   immediately, and a network round trip would either pop in late or force an
   async path through setup for twenty numbers that will never change.
   --------------------------------------------------------------------------- */
const ROUTE: number[] = [
  43.514, 16.443, // Split, Croatia
  43.803, 15.802, // Sibenik, Croatia
  44.136, 15.207, // Zadar, Croatia
  45.842, 15.808, // Zagreb, Croatia
  47.802, 12.978, // Salzburg, Austria
  47.285, 11.296, // Innsbruck, Austria
  47.265, 9.603, // Swiss border, Austria
  47.554, 7.553, // Basel, Switzerland
  46.954, 7.353, // Bern, Switzerland
  46.519, 6.164, // Lausanne, Switzerland
  46.204, 6.122, // Geneva, Switzerland
  45.758, 4.793, // Lyon, France
  43.832, 4.26, // Nimes, France
  41.392, 2.057, // Barcelona, Spain
  39.407, -0.443, // Valencia, Spain
  37.991, -1.16, // Murcia, Spain
  36.718, -4.49, // Malaga, Spain
  35.763, -5.916, // Tangier, Morocco
  31.634, -8.09, // Marrakesh, Morocco
  29.978, -5.593, // Tagounite, Morocco
];

/* ---------------------------------------------------------------------------
   Frontiers. Six countries, in the order they were crossed. Each entry is the
   index of the first stop inside that country, so the crossing itself is the
   middle of the leg that arrives there — index 0 is the departure rather than a
   border, and gets the same mark because it is where the first country begins.

   Deliberately the smallest possible statement of "which country is this":
   a hairline and a name, not an outline and a fill. Territories drawn as tinted
   regions turn the page into a map, and a map behind body copy is a fight.
   --------------------------------------------------------------------------- */
const BORDER_AT = [0, 4, 7, 11, 13, 17];
const BORDERS = BORDER_AT.length;
/** Split once, at module scope: the frame loop sets type a character at a time
    so the names can be tracked out, and it must never allocate to do it. */
const COUNTRY_CH: string[][] = [
  'CROATIA',
  'AUSTRIA',
  'SWITZERLAND',
  'FRANCE',
  'SPAIN',
  'MOROCCO',
].map(function toChars(s: string): string[] {
  return s.split('');
});
/** Candidate placements for a name: multiples of the stand-off along the
    frontier's normal, and of a step along the thread, with a small penalty so
    that the plainest placement wins whenever it happens to be clear. */
const CAND_N = [1, -1, 2.3, -2.3, 1.4, -1.4, 1.4, -1.4];
const CAND_T = [0, 0, 0, 0, 1, 1, -1, -1];
const CAND_PEN = [0, 0, 0.6, 0.6, 0.9, 0.9, 0.9, 0.9];

const STOPS = ROUTE.length / 2;
const LEGS = STOPS - 1;
/** Samples per leg of the journey. One chunk per leg keeps the reveal honest. */
const PER_LEG = 12;
const FINE = LEGS * PER_LEG + 1;

/** Item kinds. Plain consts rather than an enum: isolatedModules is on. */
const K_POLAROID = 0;
const K_SCRAP = 1;
const K_TICKET = 2;
const K_POSTMARK = 3;
const K_NOTE = 4;

/** Bleed room around each baked item for tape overhang and its shadow. */
const PAD = 26;
/** How long, in progress units, one item takes to settle once it starts. */
const SETTLE = 0.16;
/** The whole layer is a backdrop, not a poster. Nothing here goes loud. */
const MASTER = 0.86;

const DEG = Math.PI / 180;

type Rgb = [number, number, number];
type Ctx = CanvasRenderingContext2D;

/** Resolved palette, every string built once so the frame loop never allocates. */
interface Ink {
  card: string;
  cardEdge: string;
  shade: string;
  window: string;
  tape: string;
  tapeEdge: string;
  fibre: string;
  hand: string;
  handFaint: string;
  rule: string;
  warm: string;
  warmSoft: string;
  warmGhost: string;
  cool: string;
  coolSoft: string;
  coolGhost: string;
  routeBase: string;
  routeDone: string;
  pageEdge: string;
  surface: string;
  ink2Solid: string;
}

interface Item {
  cv: HTMLCanvasElement;
  cw: number;
  ch: number;
  x: number;
  y: number;
  rot: number;
  flick: number;
  depth: number;
  appear: number;
  alpha: number;
  sway: number;
  stop: number;
}

/* ---------------------------------------------------------------------------
   Small maths helpers. All pure, all used in setup.
   --------------------------------------------------------------------------- */

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - 3 * p2 + p3 - p0) * t3)
  );
}

/* ---------------------------------------------------------------------------
   Palette resolution.

   The five given colours are the only source. Card stock is `surface` nudged
   toward `ink`, which reads as "paper on paper" in both directions: on the
   light palette the card goes slightly darker than the ground, on the dark one
   `ink` is pale so the card goes slightly lighter. Either way it separates
   without ever being a hardcoded white.
   --------------------------------------------------------------------------- */
function buildInk(p: BackdropProps['palette']): Ink {
  const s = toRgb(p.surface);
  const i1 = toRgb(p.ink);
  const i2 = toRgb(p.ink2);
  const ac = toRgb(p.accent);
  const a2 = toRgb(p.accent2);

  const card = mix(s, i1, 0.085);
  const win = mix(s, i2, 0.16);

  return {
    card: rgba(card, 1),
    cardEdge: rgba(i1, 0.16),
    shade: rgba(i1, 0.075),
    window: rgba(win, 1),
    tape: rgba(mix(s, i2, 0.14), 0.5),
    tapeEdge: rgba(i2, 0.16),
    fibre: rgba(i2, 0.09),
    hand: rgba(i1, 0.4),
    handFaint: rgba(i1, 0.22),
    rule: rgba(i2, 0.13),
    warm: rgba(ac, 0.55),
    warmSoft: rgba(ac, 0.26),
    warmGhost: rgba(ac, 0.1),
    cool: rgba(a2, 0.5),
    coolSoft: rgba(a2, 0.24),
    coolGhost: rgba(a2, 0.09),
    routeBase: rgba(i2, 1),
    routeDone: rgba(ac, 1),
    pageEdge: rgba(i2, 1),
    surface: rgba(s, 1),
    ink2Solid: rgba(i2, 1),
  };
}

/* ---------------------------------------------------------------------------
   Paper primitives.
   --------------------------------------------------------------------------- */

/** arcTo rather than roundRect: roundRect is still missing on older Safari. */
function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Rectangle whose edges are torn rather than cut. `torn` is a bitmask,
 * 1 top / 2 right / 4 bottom / 8 left. Cut edges still get a hair of jitter so
 * nothing in the collage is mechanically straight.
 */
function tornPath(ctx: Ctx, w: number, h: number, torn: number, rnd: () => number): void {
  const steps = 13;
  ctx.beginPath();
  for (let e = 0; e < 4; e++) {
    const isTorn = (torn & (1 << e)) !== 0;
    const amp = isTorn ? 3.2 : 0.45;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // A torn edge is mostly a shallow ripple with the odd deeper bite.
      let n = (rnd() - 0.5) * 2 * amp;
      if (isTorn && rnd() < 0.14) n -= amp * 1.6;
      let x = 0;
      let y = 0;
      if (e === 0) {
        x = t * w;
        y = n;
      } else if (e === 1) {
        x = w - n;
        y = t * h;
      } else if (e === 2) {
        x = (1 - t) * w;
        y = h - n;
      } else {
        x = n;
        y = (1 - t) * h;
      }
      if (e === 0 && i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

/**
 * A stroke that reads as handwriting at backdrop scale: connected arcs of
 * varying height broken by word gaps, with the occasional ascender. Deliberately
 * not letterforms — it is the rhythm of writing, not writing.
 */
function scriptLine(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  size: number,
  colour: string,
  rnd: () => number
): void {
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(0.65, size * 0.1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const step = size * 0.44;
  let cx = x;
  ctx.moveTo(cx, y);
  while (cx < x + w) {
    const word = 3 + Math.floor(rnd() * 6);
    for (let i = 0; i < word && cx < x + w; i++) {
      const tall = rnd() < 0.16 ? 1.7 : 1;
      const up = y - size * (0.32 + rnd() * 0.45) * tall;
      ctx.quadraticCurveTo(cx + step * 0.5, up, cx + step, y - size * 0.06 * rnd());
      cx += step;
    }
    cx += step * (0.55 + rnd() * 0.8);
    if (cx < x + w) ctx.moveTo(cx, y);
  }
  ctx.stroke();
}

/** A strip of tape: translucent body, ragged torn ends, fibres running through. */
function tapeStrip(
  ctx: Ctx,
  cx: number,
  cy: number,
  len: number,
  wid: number,
  ang: number,
  C: Ink,
  rnd: () => number
): void {
  const half = len * 0.5;
  const hw = wid * 0.5;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);

  ctx.beginPath();
  ctx.moveTo(-half, -hw);
  ctx.lineTo(half - 1, -hw);
  for (let i = 1; i <= 5; i++) ctx.lineTo(half + (rnd() - 0.5) * 3.4, -hw + (wid * i) / 5);
  ctx.lineTo(-half + 1, hw);
  for (let i = 1; i <= 5; i++) ctx.lineTo(-half + (rnd() - 0.5) * 3.4, hw - (wid * i) / 5);
  ctx.closePath();
  ctx.fillStyle = C.tape;
  ctx.fill();

  ctx.strokeStyle = C.fibre;
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 6; i++) {
    const fy = -hw + (wid * (i + 0.5)) / 6 + (rnd() - 0.5) * 1.2;
    ctx.beginPath();
    ctx.moveTo(-half + 2.5, fy);
    ctx.lineTo(half - 2.5, fy + (rnd() - 0.5) * 1.4);
    ctx.stroke();
  }

  ctx.strokeStyle = C.tapeEdge;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-half + 1, -hw);
  ctx.lineTo(half - 1, -hw);
  ctx.moveTo(-half + 1, hw);
  ctx.lineTo(half - 1, hw);
  ctx.stroke();
  ctx.restore();
}

/** A pin: ring plus a dot of shadow, for the items that are not taped. */
function pin(ctx: Ctx, x: number, y: number, r: number, C: Ink): void {
  ctx.fillStyle = C.shade;
  ctx.beginPath();
  ctx.arc(x + 1, y + 1.6, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.warmSoft;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.warm;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

/** Soft drop shadow, faked with three offset fills rather than a blur filter. */
function paperShadow(ctx: Ctx, w: number, h: number, C: Ink): void {
  ctx.fillStyle = C.shade;
  ctx.fillRect(-1.5, 2.5, w + 3, h + 1.5);
  ctx.fillRect(0.5, 1.5, w + 1.5, h + 3.5);
  ctx.fillRect(2, 3, w, h);
}

/**
 * What sits inside a photo window. Never a photograph — an impression, four
 * variants, all of them washed out enough to read as a memory rather than an
 * image, because text sits over this page.
 */
function impression(ctx: Ctx, w: number, h: number, mode: number, C: Ink, rnd: () => number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();

  const g = ctx.createLinearGradient(0, 0, 0, h);
  if (mode === 3) {
    g.addColorStop(0, C.warmGhost);
    g.addColorStop(1, C.coolGhost);
  } else {
    g.addColorStop(0, C.coolGhost);
    g.addColorStop(1, C.warmGhost);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const hz = h * (0.55 + rnd() * 0.12);

  if (mode === 0) {
    // Horizon with hills, the view out of a lift's window.
    ctx.fillStyle = C.coolSoft;
    ctx.beginPath();
    ctx.moveTo(-2, hz);
    for (let i = 0; i <= 6; i++) {
      const x = (w * i) / 6;
      ctx.lineTo(x, hz - (Math.sin(i * 1.7 + rnd()) * 0.5 + 0.5) * h * 0.22);
    }
    ctx.lineTo(w + 2, hz);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.warmSoft;
    ctx.beginPath();
    ctx.arc(w * (0.2 + rnd() * 0.6), hz - h * 0.34, h * 0.09, 0, Math.PI * 2);
    ctx.fill();
  } else if (mode === 1) {
    // A road running to a vanishing point.
    const vx = w * (0.35 + rnd() * 0.3);
    ctx.strokeStyle = C.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w * 0.25, h + 2);
    ctx.lineTo(vx, hz);
    ctx.moveTo(w * 1.25, h + 2);
    ctx.lineTo(vx, hz);
    ctx.stroke();
    ctx.strokeStyle = C.warmSoft;
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 5; i++) {
      const t = i / 5;
      const y = hz + (h - hz) * t * t;
      const seg = (h - hz) * 0.05 * (0.4 + t);
      ctx.beginPath();
      ctx.moveTo(vx + (w * 0.5 - vx) * t * 0.2, y);
      ctx.lineTo(vx + (w * 0.5 - vx) * t * 0.2, y + seg);
      ctx.stroke();
    }
  } else if (mode === 2) {
    // A figure, shoulders and head, at the size a stranger is remembered.
    const fx = w * (0.34 + rnd() * 0.32);
    const fr = h * (0.1 + rnd() * 0.06);
    ctx.fillStyle = C.coolSoft;
    ctx.beginPath();
    ctx.arc(fx, h * (0.38 + rnd() * 0.12), fr, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(fx - fr * 2.4, h + 2);
    ctx.quadraticCurveTo(fx, h * 0.5, fx + fr * 2.4, h + 2);
    ctx.closePath();
    ctx.fill();
  } else {
    // An arch: a doorway, kept geometric so it stays an abstraction.
    ctx.fillStyle = C.warmSoft;
    const aw = w * (0.26 + rnd() * 0.16);
    const ax = w * (0.28 + rnd() * 0.4) - aw * 0.5;
    const ay = h * (0.26 + rnd() * 0.14);
    ctx.beginPath();
    ctx.moveTo(ax, h);
    ctx.lineTo(ax, ay + aw * 0.5);
    ctx.arc(ax + aw * 0.5, ay + aw * 0.5, aw * 0.5, Math.PI, 0);
    ctx.lineTo(ax + aw, h);
    ctx.closePath();
    ctx.fill();
  }

  // Every print has a light leak somewhere.
  ctx.fillStyle = C.warmGhost;
  ctx.beginPath();
  ctx.arc(rnd() < 0.5 ? 0 : w, h * rnd(), h * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A row of inked blocks: a date without letterforms. */
function dateStamp(ctx: Ctx, x: number, y: number, w: number, C: Ink, rnd: () => number): void {
  const n = 8;
  const bw = w / n;
  ctx.fillStyle = C.warmSoft;
  for (let i = 0; i < n; i++) {
    if (i === 2 || i === 5) continue; // separators read as the gaps in a date
    const jitter = (rnd() - 0.5) * 0.8;
    ctx.fillRect(x + i * bw + jitter, y + jitter, bw * 0.68, bw * 1.5);
  }
}

/* ---------------------------------------------------------------------------
   Item bakers. Each draws one piece of the collage into an offscreen canvas.
   Called only at layout time.
   --------------------------------------------------------------------------- */

function bakePolaroid(
  ctx: Ctx,
  w: number,
  h: number,
  variant: number,
  C: Ink,
  rnd: () => number
): void {
  paperShadow(ctx, w, h, C);
  ctx.fillStyle = C.card;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = C.cardEdge;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

  const m = w * 0.075;
  const ww = w - m * 2;
  const wh = h - m - h * 0.2;
  ctx.fillStyle = C.window;
  ctx.fillRect(m, m, ww, wh);
  ctx.save();
  ctx.translate(m, m);
  // Cycled rather than drawn at random: four impressions over a handful of
  // frames, left to chance, tends to deal the same one three times.
  impression(ctx, ww, wh, variant & 3, C, rnd);
  ctx.restore();
  ctx.strokeStyle = C.cardEdge;
  ctx.lineWidth = 0.7;
  ctx.strokeRect(m + 0.5, m + 0.5, ww - 1, wh - 1);

  // The caption everybody writes on the white strip.
  scriptLine(ctx, m + 2, h - h * 0.075, ww * (0.5 + rnd() * 0.35), h * 0.055, C.hand, rnd);
  if (rnd() < 0.45) dateStamp(ctx, w - m - w * 0.26, m + wh + h * 0.045, w * 0.26, C, rnd);
}

function bakeScrap(ctx: Ctx, w: number, h: number, C: Ink, rnd: () => number): void {
  ctx.save();
  ctx.translate(2, 3);
  tornPath(ctx, w, h, 5, rnd);
  ctx.fillStyle = C.shade;
  ctx.fill();
  ctx.restore();

  tornPath(ctx, w, h, 5, rnd);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.strokeStyle = C.cardEdge;
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.save();
  tornPath(ctx, w, h, 5, rnd);
  ctx.clip();
  ctx.strokeStyle = C.rule;
  ctx.lineWidth = 0.8;
  const gap = h / 6;
  for (let y = gap; y < h; y += gap) {
    ctx.beginPath();
    ctx.moveTo(3, y);
    ctx.lineTo(w - 3, y);
    ctx.stroke();
  }
  const lines = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < lines; i++) {
    scriptLine(ctx, 8, gap * (i + 1.75), w * (0.5 + rnd() * 0.35), gap * 0.62, C.hand, rnd);
  }
  ctx.restore();
}

function bakeTicket(ctx: Ctx, w: number, h: number, C: Ink, rnd: () => number): void {
  paperShadow(ctx, w, h, C);
  roundRectPath(ctx, 0, 0, w, h, 3);
  ctx.fillStyle = C.card;
  ctx.fill();
  ctx.strokeStyle = C.cardEdge;
  ctx.lineWidth = 1;
  ctx.stroke();

  const px = w * 0.36;
  ctx.strokeStyle = C.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = 5; y < h - 4; y += 5) {
    ctx.moveTo(px, y);
    ctx.lineTo(px, y + 2.4);
  }
  ctx.stroke();

  ctx.strokeStyle = C.warmSoft;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(w * 0.06, h * 0.28);
  ctx.lineTo(px - 6, h * 0.28);
  ctx.stroke();
  scriptLine(ctx, w * 0.06, h * 0.66, px - w * 0.14, h * 0.2, C.handFaint, rnd);

  // Barcode-ish rule field on the long half, all ticks, no glyphs.
  ctx.fillStyle = C.rule;
  let bx = px + 10;
  while (bx < w - 8) {
    const bw = 0.8 + rnd() * 2.2;
    ctx.fillRect(bx, h * 0.55, bw, h * 0.3);
    bx += bw + 1.4 + rnd() * 2;
  }
  scriptLine(ctx, px + 10, h * 0.4, w - px - 22, h * 0.17, C.hand, rnd);

  // Notches punched clean through, so the page shows.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(px, -1, 4.2, 0, Math.PI * 2);
  ctx.arc(px, h + 1, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function bakePostmark(ctx: Ctx, w: number, h: number, C: Ink, rnd: () => number): void {
  const r = Math.min(w, h) * 0.5;
  const cx = w * 0.5;
  const cy = h * 0.5;

  ctx.fillStyle = C.card;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Perforated stamp edge, bitten out of the disc.
  ctx.globalCompositeOperation = 'destination-out';
  const teeth = 22;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.strokeStyle = C.warm;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
  ctx.moveTo(cx + r * 0.64, cy);
  ctx.arc(cx, cy, r * 0.64, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = C.warmSoft;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.66, cy + Math.sin(a) * r * 0.66);
    ctx.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
    ctx.stroke();
  }

  dateStamp(ctx, cx - r * 0.5, cy - r * 0.12, r, C, rnd);
  ctx.strokeStyle = C.warmSoft;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.42, cy - r * 0.3);
  ctx.lineTo(cx + r * 0.42, cy - r * 0.3);
  ctx.moveTo(cx - r * 0.42, cy + r * 0.34);
  ctx.lineTo(cx + r * 0.42, cy + r * 0.34);
  ctx.stroke();
}

function bakeNote(ctx: Ctx, w: number, h: number, C: Ink, rnd: () => number): void {
  ctx.save();
  ctx.translate(1.5, 2.5);
  tornPath(ctx, w, h, 10, rnd);
  ctx.fillStyle = C.shade;
  ctx.fill();
  ctx.restore();

  tornPath(ctx, w, h, 10, rnd);
  ctx.fillStyle = C.card;
  ctx.fill();

  scriptLine(ctx, 7, h * 0.44, w - 16, h * 0.3, C.hand, rnd);
  scriptLine(ctx, 7, h * 0.82, (w - 16) * (0.4 + rnd() * 0.4), h * 0.26, C.handFaint, rnd);
  ctx.strokeStyle = C.warmSoft;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(7, h * 0.56);
  ctx.quadraticCurveTo(w * 0.5, h * 0.6, w * (0.45 + rnd() * 0.3), h * 0.55);
  ctx.stroke();
}

/* ---------------------------------------------------------------------------
   Composition.

   Anchors are hand placed rather than random, in a band around the frame. This
   is the whole legibility strategy: the middle of the page is where the words
   are, so nothing is ever allowed to be laid down there.
   --------------------------------------------------------------------------- */
const ANCHOR_X = [0.13, 0.4, 0.68, 0.91, 0.11, 0.37, 0.63, 0.89, 0.07, 0.09, 0.94, 0.91];
const ANCHOR_Y = [0.13, 0.09, 0.15, 0.1, 0.88, 0.92, 0.86, 0.9, 0.41, 0.68, 0.37, 0.65];
const ANCHOR_KIND = [
  K_POLAROID,
  K_TICKET,
  K_POLAROID,
  K_POSTMARK,
  K_SCRAP,
  K_POLAROID,
  K_NOTE,
  K_POLAROID,
  K_POLAROID,
  K_SCRAP,
  K_TICKET,
  K_POLAROID,
];
/** Which anchors survive on a narrow viewport, where there are no side bands.
    Chosen for spread and for one of each kind, not just the first six. */
const NARROW_SET = [0, 2, 3, 4, 6, 7];

function bakeItem(
  kind: number,
  w: number,
  h: number,
  dpr: number,
  variant: number,
  C: Ink,
  rnd: () => number
): HTMLCanvasElement {
  const cw = w + PAD * 2;
  const ch = h + PAD * 2;
  const cv = document.createElement('canvas');
  cv.width = Math.round(cw * dpr);
  cv.height = Math.round(ch * dpr);
  const ctx = cv.getContext('2d');
  if (!ctx) return cv;
  ctx.scale(dpr, dpr);
  ctx.translate(PAD, PAD);
  ctx.lineJoin = 'round';

  if (kind === K_POLAROID) bakePolaroid(ctx, w, h, variant, C, rnd);
  else if (kind === K_SCRAP) bakeScrap(ctx, w, h, C, rnd);
  else if (kind === K_TICKET) bakeTicket(ctx, w, h, C, rnd);
  else if (kind === K_POSTMARK) bakePostmark(ctx, w, h, C, rnd);
  else bakeNote(ctx, w, h, C, rnd);

  // Stuck down last, over the item's own edge, the way tape actually goes on.
  if (kind === K_POSTMARK) {
    // A postmark is licked on, not taped.
  } else if (kind === K_NOTE || rnd() < 0.3) {
    pin(ctx, w * 0.5, -3, 3.4, C);
  } else {
    tapeStrip(ctx, 0, 0, w * 0.36, 13, -Math.PI * 0.25 + (rnd() - 0.5) * 0.2, C, rnd);
    if (rnd() < 0.7) {
      tapeStrip(ctx, w, h, w * 0.32, 12, -Math.PI * 0.25 + (rnd() - 0.5) * 0.25, C, rnd);
    }
  }
  return cv;
}

/* ---------------------------------------------------------------------------
   The component.
   --------------------------------------------------------------------------- */

const FILL: React.CSSProperties = {
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

export default function Scrapbook({
  intensity,
  progress,
  velocity,
  palette,
  sectionId,
  className,
}: BackdropProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const live = useRef({ intensity: 0, progress: 0, velocity: 0 });
  const stillRef = useRef<(() => void) | null>(null);
  const reducedRef = useRef(false);

  // Mutated, never reallocated: the frame loop reads these without re-running
  // the effect on every scroll tick.
  live.current.intensity = intensity;
  live.current.progress = progress;
  live.current.velocity = velocity;

  const { surface, ink, ink2, accent, accent2 } = palette;

  /*
   * THE THREAD STANDS DOWN BEHIND THE ROAD SECTION.
   *
   * Jack: "I think this should be the main way we interact with the
   * hitchhiking, draw the map lines." So on `road` the route is drawn by
   * RouteMap, in front, where every stop is a real button you can travel with
   * the arrow keys — and this world keeps the part it is actually better at,
   * which is the album page it is pinned to: the polaroids, the torn scraps,
   * the ticket stubs, the postmark and the tape.
   *
   * Without this the same journey is drawn twice, at two different scales and
   * two different projections, one of them un-clickable. Two routes is not
   * twice as much route; it is a mistake the reader can see.
   */
  const drawThread = sectionId !== 'road';
  /* Behind a ref because the effect is keyed on the palette and must not be
     torn down and rebuilt for this; the value is fixed for a mounted world
     anyway, since a world instance belongs to exactly one section. */
  const threadRef = useRef(true);
  threadRef.current = drawThread;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const c2d = el.getContext('2d');
    if (!c2d) return;
    // Re-bound with non-null types: the closures below outlive the guard, and
    // TypeScript will not carry a narrowing into a nested function declaration.
    const canvas: HTMLCanvasElement = el;
    const ctx: Ctx = c2d;

    const C = buildInk({ surface, ink, ink2, accent, accent2 });
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    reducedRef.current = reduced;

    let W = 0;
    let H = 0;
    let dpr = 1;
    let items: Item[] = [];

    /* Preallocated route geometry. Nothing below is rebuilt per frame. */
    const stopX = new Float32Array(STOPS);
    const stopY = new Float32Array(STOPS);
    const fineX = new Float32Array(FINE);
    const fineY = new Float32Array(FINE);
    const wobble = new Float32Array(FINE);
    /* Frontier marks: position, unit normal, and the point in the journey the
       crossing is made, all resolved once per projection. */
    const brdX = new Float32Array(BORDERS);
    const brdY = new Float32Array(BORDERS);
    const brdNX = new Float32Array(BORDERS);
    const brdNY = new Float32Array(BORDERS);
    const brdAt = new Float32Array(BORDERS);
    for (let b = 0; b < BORDERS; b++) {
      const s = BORDER_AT[b];
      // The crossing is halfway along the leg that arrives in the new country.
      const fi = s === 0 ? 0 : (s - 1) * PER_LEG + (PER_LEG >> 1);
      brdAt[b] = fi / (FINE - 1);
    }
    /* Where each name is set, and whether it is set at all. Resolved once per
       layout rather than per frame: it depends on where the pieces landed, and
       the pieces do not move between layouts. */
    const brdLX = new Float32Array(BORDERS);
    const brdLY = new Float32Array(BORDERS);
    const brdShow = new Uint8Array(BORDERS);
    let labelFont = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
    let labelAdv = 6;
    let labelH = 9;
    let bHalf = 10;
    const wobRnd = mulberry32(0x1f3a77);
    for (let i = 0; i < FINE; i++) {
      // A low-frequency hand wobble so the thread is drawn, not plotted.
      wobble[i] = Math.sin(i * 0.31) * 0.6 + Math.sin(i * 0.077) * 1.5 + (wobRnd() - 0.5) * 0.5;
    }

    function projectRoute(): void {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < STOPS; i++) {
        const lat = ROUTE[i * 2] * DEG;
        const lon = ROUTE[i * 2 + 1] * DEG;
        const mx = lon;
        const my = Math.log(Math.tan(Math.PI * 0.25 + lat * 0.5)); // Mercator
        stopX[i] = mx;
        stopY[i] = my;
        if (mx < minX) minX = mx;
        if (mx > maxX) maxX = mx;
        if (my < minY) minY = my;
        if (my > maxY) maxY = my;
      }
      const pad = Math.min(W, H) * 0.16;
      const bw = Math.max(W - pad * 2, 1);
      const bh = Math.max(H - pad * 2, 1);
      const sw = Math.max(maxX - minX, 1e-6);
      const sh = Math.max(maxY - minY, 1e-6);
      const s = Math.min(bw / sw, bh / sh);
      // Fitted honestly, the journey is nearly square and lands in a narrow
      // column down the middle of the frame — the one place it must not be,
      // because that is where the words are. So the fit is stretched on the
      // slack axis, capped, until the thread actually reaches the pinned items.
      const sx = s * clamp(bw / (sw * s), 1, 1.9);
      const sy = s * clamp(bh / (sh * s), 1, 1.5);
      const ox = (W - sw * sx) * 0.5;
      const oy = (H - sh * sy) * 0.5;
      for (let i = 0; i < STOPS; i++) {
        stopX[i] = ox + (stopX[i] - minX) * sx;
        stopY[i] = oy + (maxY - stopY[i]) * sy; // north is up
      }

      let k = 0;
      for (let leg = 0; leg < LEGS; leg++) {
        const i0 = leg === 0 ? 0 : leg - 1;
        const i1 = leg;
        const i2 = leg + 1;
        const i3 = leg + 2 > STOPS - 1 ? STOPS - 1 : leg + 2;
        for (let j = 0; j < PER_LEG; j++) {
          const t = j / PER_LEG;
          fineX[k] = catmull(stopX[i0], stopX[i1], stopX[i2], stopX[i3], t);
          fineY[k] = catmull(stopY[i0], stopY[i1], stopY[i2], stopY[i3], t);
          k++;
        }
      }
      fineX[k] = stopX[STOPS - 1];
      fineY[k] = stopY[STOPS - 1];

      // Push each sample sideways by its wobble, along the local normal.
      for (let i = 0; i < FINE; i++) {
        const a = i === 0 ? 0 : i - 1;
        const b = i === FINE - 1 ? FINE - 1 : i + 1;
        const dx = fineX[b] - fineX[a];
        const dy = fineY[b] - fineY[a];
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        fineX[i] += (-dy / len) * wobble[i];
        fineY[i] += (dx / len) * wobble[i];
      }

      // Frontiers last, so they sit on the wobbled thread rather than on the
      // ideal one, and square across it wherever the hand happened to put it.
      for (let b = 0; b < BORDERS; b++) {
        const fi = Math.round(brdAt[b] * (FINE - 1));
        const a = fi === 0 ? 0 : fi - 1;
        const c = fi === FINE - 1 ? FINE - 1 : fi + 1;
        const dx = fineX[c] - fineX[a];
        const dy = fineY[c] - fineY[a];
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        brdX[b] = fineX[fi];
        brdY[b] = fineY[fi];
        brdNX[b] = -dy / len;
        brdNY[b] = dx / len;
      }
    }

    function disposeItems(): void {
      for (let i = 0; i < items.length; i++) {
        // Release the backing store rather than waiting for GC to notice.
        items[i].cv.width = 0;
        items[i].cv.height = 0;
      }
      items = [];
    }

    function layout(): void {
      disposeItems();
      const rnd = mulberry32(0x5c8ab1);
      const narrow = W < 760;
      const base = clamp(Math.min(W, H) * 0.165, 84, 168);
      const count = narrow ? NARROW_SET.length : ANCHOR_X.length;
      const taken = new Uint8Array(STOPS);
      let variant = 0;

      for (let n = 0; n < count; n++) {
        const a = narrow ? NARROW_SET[n] : n;
        const kind = ANCHOR_KIND[a];
        const scale = (narrow ? 0.82 : 1) * (0.86 + rnd() * 0.3);

        let iw = base * scale;
        let ih = iw * 1.18;
        if (kind === K_SCRAP) {
          ih = iw * 0.78;
        } else if (kind === K_TICKET) {
          iw = base * 1.15 * scale;
          ih = iw * 0.36;
        } else if (kind === K_POSTMARK) {
          iw = base * 0.6 * scale;
          ih = iw;
        } else if (kind === K_NOTE) {
          iw = base * 1.05 * scale;
          ih = iw * 0.34;
        }

        let x = ANCHOR_X[a] * W + (rnd() - 0.5) * base * 0.22;
        let y = ANCHOR_Y[a] * H + (rnd() - 0.5) * base * 0.18;
        // Items may bleed off the edge — a real album page is trimmed — but
        // never far enough that a whole piece disappears.
        const bx = iw * 0.34;
        const by = ih * 0.34;
        x = clamp(x, -bx, W + bx);
        y = clamp(y, -by, H + by);

        // Pair each piece with the nearest stop it has not already claimed, so
        // the leader lines stay short and the thread reads as one journey.
        let best = -1;
        let bestD = Infinity;
        for (let s = 0; s < STOPS; s++) {
          if (taken[s]) continue;
          const dx = stopX[s] - x;
          const dy = stopY[s] - y;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = s;
          }
        }
        if (best >= 0) taken[best] = 1;

        items.push({
          cv: bakeItem(kind, iw, ih, dpr, kind === K_POLAROID ? variant++ : 0, C, rnd),
          cw: iw + PAD * 2,
          ch: ih + PAD * 2,
          x,
          y,
          rot: (rnd() - 0.5) * (kind === K_POSTMARK ? 0.9 : 0.22),
          flick: (rnd() - 0.5) * 0.1 + 0.05,
          depth: rnd(),
          appear: 0,
          alpha: 0.76 + rnd() * 0.24,
          sway: rnd() * Math.PI * 2,
          stop: best < 0 ? 0 : best,
        });
      }

      // They go down in the order they were travelled, Croatia first.
      items.sort(function byStop(p, q) {
        return p.stop - q.stop;
      });
      const last = Math.max(items.length - 1, 1);
      for (let i = 0; i < items.length; i++) {
        items[i].appear = 0.04 + (i / last) * 0.62;
      }

      placeLabels();
    }

    /**
     * Decide where each country's name is set, and whether it is set at all.
     *
     * A name half buried under a polaroid does not read as a page that was
     * assembled in layers, it reads as a mistake, so each label is offered both
     * sides of its frontier and takes the clearer one. If a piece is sitting on
     * both sides the name is simply dropped: the hairline still says a border
     * was crossed, and six names is a nicety, not the point.
     */
    function placeLabels(): void {
      for (let b = 0; b < BORDERS; b++) {
        const wide = COUNTRY_CH[b].length * labelAdv;
        const off = bHalf + 12;
        let bestScore = Infinity;
        let bestX = 0;
        let bestY = 0;
        // Eight places a name may be written: either side of the thread, at a
        // normal stand-off or a longer one, and slid along the thread in either
        // direction. The alternatives are what let a name clear a piece of the
        // collage rather than be dropped for sitting under it.
        const tang = wide * 0.55 + 8;
        for (let k = 0; k < CAND_N.length; k++) {
          const lx = clamp(
            brdX[b] + brdNX[b] * CAND_N[k] * off + brdNY[b] * CAND_T[k] * tang,
            wide * 0.5 + 6,
            W - wide * 0.5 - 6
          );
          const ly = clamp(
            brdY[b] + brdNY[b] * CAND_N[k] * off - brdNX[b] * CAND_T[k] * tang,
            labelH + 4,
            H - labelH - 4
          );
          const hw = wide * 0.5 + 5;
          const hh = labelH * 0.9;
          let covered = 0;
          for (let i = 0; i < items.length; i++) {
            const it = items[i];
            // Axis-aligned proxy for the piece, grown a little to stand in for
            // its rotation and for the tape that hangs over its edge.
            const ix = (it.cw - PAD * 2) * 0.5 + 5;
            const iy = (it.ch - PAD * 2) * 0.5 + 5;
            if (Math.abs(it.x - lx) < ix + hw && Math.abs(it.y - ly) < iy + hh) covered++;
          }
          // Clear paper first, then the plainest placement, then whichever side
          // is further from the copy.
          const score = covered * 4 + CAND_PEN[k] + (1 - centreFade(lx, ly));
          if (score < bestScore) {
            bestScore = score;
            bestX = lx;
            bestY = ly;
          }
        }
        brdLX[b] = bestX;
        brdLY[b] = bestY;
        brdShow[b] = bestScore < 4 ? 1 : 0;
      }
    }

    let relayoutTimer = 0;

    function resize(): void {
      const rect = canvas.getBoundingClientRect();
      const nw = Math.max(Math.round(rect.width), 1);
      const nh = Math.max(Math.round(rect.height), 1);
      const nd = Math.min(window.devicePixelRatio || 1, 2); // capped, always
      if (nw === W && nh === H && nd === dpr) return;
      W = nw;
      H = nh;
      dpr = nd;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);

      // Frontier names, sized to the frame. Measured here and only here: a
      // TextMetrics object per frame would be an allocation in the loop, and
      // the advance of a monospace face is the same for every character.
      const fs = clamp(Math.round(Math.min(W, H) * 0.0125), 7, 11);
      labelFont = fs + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
      labelH = fs;
      ctx.font = labelFont;
      labelAdv = ctx.measureText('M').width * 1.34; // tracked out, plate style
      bHalf = clamp(Math.min(W, H) * 0.016, 8, 15);

      projectRoute(); // cheap, and the thread must track the frame immediately

      if (items.length === 0) {
        layout();
        return;
      }
      // Re-baking twelve offscreen canvases on every event of a resize drag
      // would stutter, and nobody can see the collage settle mid-drag anyway.
      // The old pieces keep drawing, a little out of place, until the drag ends.
      if (relayoutTimer) window.clearTimeout(relayoutTimer);
      relayoutTimer = window.setTimeout(function settleLayout() {
        relayoutTimer = 0;
        layout();
        if (reduced) render(0, true);
      }, 140);
    }

    /** Distance-from-centre falloff: the thread all but vanishes under the text. */
    function centreFade(x: number, y: number): number {
      const rx = (x - W * 0.5) / (W * 0.5);
      const ry = (y - H * 0.5) / (H * 0.5);
      const d = Math.sqrt(rx * rx + ry * ry);
      // Floored rather than cut to nothing: a thread that vanishes mid-frame
      // reads as broken. Kept continuous, just far below the text.
      return 0.34 + 0.66 * clamp((d - 0.32) / 0.4, 0, 1);
    }

    let smoothVel = 0;

    function render(now: number, still: boolean): void {
      const p = live.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const gi = clamp(p.intensity, 0, 1) * MASTER;
      if (gi <= 0.002 || W < 2) return;

      const prog = still ? 1 : clamp(p.progress, 0, 1);
      if (!still) smoothVel += (p.velocity - smoothVel) * 0.1;
      // The whole page tilts and lags a touch, the way a book does in the hand.
      const hv = still ? 0 : clamp(smoothVel / 45, -1, 1);
      const t = still ? 0 : now * 0.001;

      ctx.translate(W * 0.5, H * 0.5);
      ctx.rotate(hv * 0.005);
      ctx.translate(-W * 0.5, -H * 0.5 - hv * 3);

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      /* The album page itself, barely there. */
      ctx.globalAlpha = gi * 0.07;
      ctx.strokeStyle = C.pageEdge;
      ctx.lineWidth = 1;
      const inset = Math.min(W, H) * 0.045;
      ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);

      /* The route: one stroke per leg so each can be faded independently.
         Skipped behind `road` — see THE THREAD STANDS DOWN, above. */
      const travelled = clamp((prog - 0.03) / 0.8, 0, 1);
      const revealed = travelled * (FINE - 1);
      if (threadRef.current) {

      ctx.strokeStyle = C.routeBase;
      ctx.lineWidth = 1;
      for (let leg = 0; leg < LEGS; leg++) {
        const i0 = leg * PER_LEG;
        const mid = i0 + (PER_LEG >> 1);
        ctx.globalAlpha = gi * 0.11 * centreFade(fineX[mid], fineY[mid]);
        ctx.beginPath();
        ctx.moveTo(fineX[i0], fineY[i0]);
        for (let j = 1; j <= PER_LEG; j++) ctx.lineTo(fineX[i0 + j], fineY[i0 + j]);
        ctx.stroke();
      }

      /* The travelled part, in the warm accent, laid over the top. */
      ctx.strokeStyle = C.routeDone;
      ctx.lineWidth = 1.5;
      for (let leg = 0; leg < LEGS; leg++) {
        const i0 = leg * PER_LEG;
        if (i0 >= revealed) break;
        const mid = i0 + (PER_LEG >> 1);
        ctx.globalAlpha = gi * 0.2 * centreFade(fineX[mid], fineY[mid]);
        ctx.beginPath();
        ctx.moveTo(fineX[i0], fineY[i0]);
        for (let j = 1; j <= PER_LEG; j++) {
          const idx = i0 + j;
          if (idx > revealed) {
            // Stop exactly where the thread has got to, mid-leg.
            const f = revealed - (idx - 1);
            ctx.lineTo(
              fineX[idx - 1] + (fineX[idx] - fineX[idx - 1]) * f,
              fineY[idx - 1] + (fineY[idx] - fineY[idx - 1]) * f
            );
            break;
          }
          ctx.lineTo(fineX[idx], fineY[idx]);
        }
        ctx.stroke();
      }

      /* Cross stitches: the thread is sewn, not printed. */
      ctx.strokeStyle = C.ink2Solid;
      ctx.lineWidth = 1;
      for (let i = 4; i < FINE - 1; i += 8) {
        ctx.globalAlpha = gi * 0.11 * centreFade(fineX[i], fineY[i]);
        const dx = fineX[i + 1] - fineX[i - 1];
        const dy = fineY[i + 1] - fineY[i - 1];
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = (-dy / len) * 2.6;
        const ny = (dx / len) * 2.6;
        ctx.beginPath();
        ctx.moveTo(fineX[i] - nx, fineY[i] - ny);
        ctx.lineTo(fineX[i] + nx, fineY[i] + ny);
        ctx.stroke();
      }

      /* Stops, with the ones already reached marked in accent. */
      for (let s = 0; s < STOPS; s++) {
        const reached = travelled >= s / LEGS;
        ctx.globalAlpha = gi * (reached ? 0.34 : 0.15) * centreFade(stopX[s], stopY[s]);
        ctx.strokeStyle = reached ? C.routeDone : C.routeBase;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(stopX[s], stopY[s], reached ? 2.8 : 1.9, 0, Math.PI * 2);
        ctx.stroke();
      }
      }

      /* Frontiers. Two hairlines square across the thread where the route
         enters a new country, and the country's name set small beside them.

         The name is held to a stricter rule than anything else on the page: it
         is faded not only by distance from the centre but by a ramp that has
         already reached zero well before the middle of the frame, so on a
         crossing that happens to land behind the copy the mark stays and the
         type simply never arrives. Six words at 0.2 alpha is the entire
         gesture — any more and this becomes a map with its territories named. */
      ctx.strokeStyle = C.ink2Solid;
      ctx.fillStyle = C.ink2Solid;
      ctx.lineWidth = 0.9;
      ctx.font = labelFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let b = 0; b < BORDERS; b++) {
        // Crossed exactly when the thread reaches it, so the countries arrive
        // in the order they were travelled rather than all at once.
        const rev = clamp((travelled - brdAt[b]) / 0.05, 0, 1);
        if (rev <= 0) continue;
        const bx = brdX[b];
        const by = brdY[b];
        const nx = brdNX[b];
        const ny = brdNY[b];
        const cf = centreFade(bx, by);
        const half = bHalf * (0.7 + 0.3 * rev);
        ctx.globalAlpha = gi * 0.15 * cf * rev;
        ctx.beginPath();
        ctx.moveTo(bx - nx * half, by - ny * half);
        ctx.lineTo(bx + nx * half, by + ny * half);
        // The far side of the frontier: one short parallel, a step along the
        // direction of travel. Two lines read as a border; one reads as a tick.
        const sx = bx - ny * 3.4;
        const sy = by + nx * 3.4;
        ctx.moveTo(sx - nx * half * 0.58, sy - ny * half * 0.58);
        ctx.lineTo(sx + nx * half * 0.58, sy + ny * half * 0.58);
        ctx.stroke();

        if (!brdShow[b]) continue;
        const lx = brdLX[b];
        const ly = brdLY[b];
        const la = gi * 0.2 * rev * clamp((centreFade(lx, ly) - 0.66) / 0.22, 0, 1);
        if (la < 0.006) continue;
        const chars = COUNTRY_CH[b];
        const wide = chars.length * labelAdv;
        ctx.globalAlpha = la;
        for (let k = 0; k < chars.length; k++) {
          ctx.fillText(chars[k], lx - wide * 0.5 + labelAdv * (k + 0.5), ly);
        }
      }

      /* Leader lines from each settled piece back to its stop. */
      ctx.strokeStyle = C.ink2Solid;
      ctx.lineWidth = 0.9;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const e = clamp((prog - it.appear) / SETTLE, 0, 1);
        if (e < 0.85) continue;
        const sx = stopX[it.stop];
        const sy = stopY[it.stop];
        const dx = sx - it.x;
        const dy = sy - it.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const off = Math.min(len * 0.45, Math.min(it.cw, it.ch) * 0.42);
        ctx.globalAlpha = gi * 0.1 * centreFade((sx + it.x) * 0.5, (sy + it.y) * 0.5);
        ctx.beginPath();
        ctx.moveTo(it.x + (dx / len) * off, it.y + (dy / len) * off);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }

      /* The collage. One drawImage each, transform and alpha only. */
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const s = clamp((prog - it.appear) / SETTLE, 0, 1);
        if (s <= 0) continue;
        const inv = 1 - s;
        const e = 1 - inv * inv * inv;
        // A damped wobble as the piece is pressed down and lets go.
        const wob = still ? 0 : Math.sin(s * 9.6) * inv * inv;
        ctx.globalAlpha = gi * it.alpha * e;
        ctx.save();
        ctx.translate(
          it.x + hv * it.depth * 5,
          it.y + hv * (2 + it.depth * 7) + inv * 24
        );
        ctx.rotate(
          it.rot +
            wob * it.flick +
            hv * 0.004 * (it.depth - 0.5) +
            (still ? 0 : Math.sin(t * 0.55 + it.sway) * 0.0022)
        );
        const sc = 0.962 + 0.038 * e;
        ctx.scale(sc, sc);
        ctx.drawImage(it.cv, -it.cw * 0.5, -it.ch * 0.5, it.cw, it.ch);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
    }

    function drawStill(): void {
      resize();
      render(0, true);
    }
    stillRef.current = drawStill;

    let raf = 0;
    let onscreen = true;

    function frame(now: number): void {
      raf = requestAnimationFrame(frame);
      render(now, false);
    }

    function start(): void {
      if (raf || reduced || !onscreen || document.hidden) return;
      raf = requestAnimationFrame(frame);
    }

    function stop(): void {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    }

    function onVisibility(): void {
      if (document.hidden) stop();
      else start();
    }

    resize();

    const ro = new ResizeObserver(function onResize() {
      resize();
      if (reduced) render(0, true);
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(function onIntersect(entries) {
      onscreen = entries[0].isIntersecting;
      if (onscreen) start();
      else stop();
    });
    io.observe(canvas);

    document.addEventListener('visibilitychange', onVisibility);

    if (reduced) render(0, true);
    else start();

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
        name: 'scrapbook',
        frames: (n = 1) => {
          for (let i = 0; i < n; i++) frame(i * 16.667);
          cancelAnimationFrame(raf);
          raf = 0;
        }
      };
    }

    return function cleanup() {
      stop();
      if (relayoutTimer) window.clearTimeout(relayoutTimer);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      stillRef.current = null;
      disposeItems();
    };
  }, [surface, ink, ink2, accent, accent2]);

  // With reduced motion there is no loop, so the one static frame is redrawn
  // when the props that change its alpha change. Event driven, not animated.
  useEffect(function redrawStill() {
    if (reducedRef.current) stillRef.current?.();
  });

  return <canvas ref={canvasRef} className={className} style={FILL} aria-hidden="true" />;
}
