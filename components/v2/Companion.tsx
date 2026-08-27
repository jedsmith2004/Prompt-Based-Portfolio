'use client';

/* ============================================================================
   Companion — a pixel sparrow that lives on the page furniture.

   Four systems, kept apart on purpose:

   1. COMPOSITOR   turns the puppet in sparrowSprite.ts into pixels. Each part
                   variant and each prop is rasterised once into an offscreen
                   canvas, then blitted at an integer scale with smoothing off.
                   Positions snap to the sprite grid, because a pixel sparrow
                   drawn at a fractional offset stops being pixel art.
   2. PLAYER       samples a keyframe timeline into a PREALLOCATED pose.
                   Positions interpolate, variants snap. Never crossfade a
                   variant swap.
   3. PHYSICS      owns where the bird actually is. Its position is stored in
                   DOCUMENT space, not screen space, so scrolling genuinely
                   carries it and it has to re-perch to keep up. That is the
                   whole reason it reads as an animal rather than a cursor toy.

                   THE ONE RULE HERE IS CONTINUITY. Nothing in this file may
                   assign bird.x or bird.y a value more than one frame of
                   travel away from where it already was, with exactly two
                   sanctioned exceptions, both of which are screen-space and
                   both of which are commented at the site:
                     - a transit rides the VIEWPORT, so its document y tracks
                       scrollYNow (on screen it does not move at all);
                     - reduced-motion reseats without animating, because
                       animating is the thing being avoided.
                   Everything else — recovery from a fall, arriving at a perch,
                   walking, re-measuring the furniture underfoot — moves over
                   time. Every landing is resolved to a sub-frame crossing so
                   the last frame of a hop cannot overshoot by 16px and snap.
   4. SURFACE      the pixel-art speech bubble and chat window. Both are drawn
                   on the same canvas as the bird, from the same 5x7 font, so
                   they are made of the same material he is. Neither is a DOM
                   box. The only DOM in the chat is a transparent <input>
                   parked over the pixel input row, because reimplementing IME,
                   mobile keyboards and clipboard would be a worse idea than
                   hiding a real one.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PARTS,
  PALETTE,
  PROPS,
  DRAW_ORDER,
  ANIMATIONS,
  IDLE_TABLE,
  IDLE_REST_MS,
  IDLE_REST_JITTER_MS,
  IDLE_LOOP_MS,
  SPRITE_WIDTH,
  SPRITE_HEIGHT,
  BASELINE_Y,
  PIXEL_SCALE,
  FRAME_MS_MAX,
  TRANSIT_UP,
  TRANSIT_DOWN,
  TRANSIT_PROPS,
  JUMP_VARIANTS,
  WALKS,
  CHAT_PERCHES,
  CHAT_RESPONDING,
  CHAT_PERCH_PROPS,
  CHAT_PERCH_CYCLES,
  INTERACTIONS,
  DREAM_ITEMS,
  DREAM_BUBBLE_PARTS,
  PVZ_SEQUENCE,
  PVZ_LOOP,
  PVZ_MUZZLE,
  ZOMBIE_FRAME_MS,
  ZOMBIE_WALK,
  type AnimationName,
  type Animation,
  type PartName,
  type PropName,
  type Pose,
  type Easing,
  type TransitEntry
} from './sparrowSprite';

/* -------------------------------------------------------------------------- */
/* 0. a 5x7 pixel font                                                         */
/* -------------------------------------------------------------------------- */

/**
 * One entry per glyph: seven rows, each a five-bit mask with 0x10 leftmost.
 * The bubble and the chat window are drawn from this and nothing else, so the
 * lettering is made of the same pixels the bird is.
 *
 * Drawn at FONT_PX = 2 device px per cell, a cap is 14px tall — comfortably
 * over the 11.5px floor the readability rule sets, and pure ink on pure paper
 * so contrast is not in question.
 */
const GLYPHS: Record<string, readonly number[]> = {
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
  '"': [0x0a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00],
  '#': [0x0a, 0x1f, 0x0a, 0x0a, 0x0a, 0x1f, 0x0a],
  '&': [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  "'": [0x04, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00],
  '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  '*': [0x00, 0x0a, 0x04, 0x1f, 0x04, 0x0a, 0x00],
  '+': [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00],
  ',': [0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x08],
  '-': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04],
  '/': [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  ':': [0x00, 0x04, 0x00, 0x00, 0x00, 0x04, 0x00],
  ';': [0x00, 0x04, 0x00, 0x00, 0x04, 0x04, 0x08],
  '<': [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02],
  '=': [0x00, 0x00, 0x1f, 0x00, 0x1f, 0x00, 0x00],
  '>': [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
  '?': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
  '@': [0x0e, 0x11, 0x17, 0x15, 0x17, 0x10, 0x0e],
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x11, 0x19, 0x15, 0x13, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  a: [0x00, 0x00, 0x0e, 0x01, 0x0f, 0x11, 0x0f],
  b: [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x1e],
  c: [0x00, 0x00, 0x0e, 0x10, 0x10, 0x11, 0x0e],
  d: [0x01, 0x01, 0x0f, 0x11, 0x11, 0x11, 0x0f],
  e: [0x00, 0x00, 0x0e, 0x11, 0x1f, 0x10, 0x0e],
  f: [0x06, 0x09, 0x08, 0x1c, 0x08, 0x08, 0x08],
  g: [0x00, 0x00, 0x0f, 0x11, 0x0f, 0x01, 0x0e],
  h: [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x11],
  i: [0x04, 0x00, 0x0c, 0x04, 0x04, 0x04, 0x0e],
  j: [0x02, 0x00, 0x06, 0x02, 0x02, 0x12, 0x0c],
  k: [0x10, 0x10, 0x12, 0x14, 0x18, 0x14, 0x12],
  l: [0x0c, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  m: [0x00, 0x00, 0x1a, 0x15, 0x15, 0x15, 0x15],
  n: [0x00, 0x00, 0x1e, 0x11, 0x11, 0x11, 0x11],
  o: [0x00, 0x00, 0x0e, 0x11, 0x11, 0x11, 0x0e],
  p: [0x00, 0x00, 0x1e, 0x11, 0x1e, 0x10, 0x10],
  q: [0x00, 0x00, 0x0f, 0x11, 0x0f, 0x01, 0x01],
  r: [0x00, 0x00, 0x16, 0x19, 0x10, 0x10, 0x10],
  s: [0x00, 0x00, 0x0f, 0x10, 0x0e, 0x01, 0x1e],
  t: [0x08, 0x08, 0x1c, 0x08, 0x08, 0x09, 0x06],
  u: [0x00, 0x00, 0x11, 0x11, 0x11, 0x13, 0x0d],
  v: [0x00, 0x00, 0x11, 0x11, 0x11, 0x0a, 0x04],
  w: [0x00, 0x00, 0x11, 0x15, 0x15, 0x15, 0x0a],
  x: [0x00, 0x00, 0x11, 0x0a, 0x04, 0x0a, 0x11],
  y: [0x00, 0x00, 0x11, 0x11, 0x0f, 0x01, 0x0e],
  z: [0x00, 0x00, 0x1f, 0x02, 0x04, 0x08, 0x1f]
};

const GLYPH_W = 5;
const GLYPH_H = 7;
/** One blank column between glyphs. */
const ADVANCE = GLYPH_W + 1;
/** Baseline-to-baseline, in font cells. */
const LINE_CELLS = GLYPH_H + 3;
/** Device px per font cell. 2 puts a cap at 14px. */
const FONT_PX = 2;

/** Fold anything the font does not carry onto something it does. */
function foldChar(ch: string): string {
  if (GLYPHS[ch]) return ch;
  switch (ch) {
    case '’':
    case '‘':
      return "'";
    case '“':
    case '”':
      return '"';
    case '—':
    case '–':
      return '-';
    case '…':
      return '.';
    default:
      break;
  }
  const up = ch.toUpperCase();
  if (GLYPHS[up]) return up;
  return ' ';
}

function textCells(s: string): number {
  return s.length ? s.length * ADVANCE - 1 : 0;
}

/** Blit a string, top-left at (cx, cy) in cells. Offscreen builds only. */
function blitText(
  g: CanvasRenderingContext2D,
  s: string,
  cx: number,
  cy: number,
  px: number,
  colour: string
) {
  g.fillStyle = colour;
  for (let i = 0; i < s.length; i++) {
    const rows = GLYPHS[foldChar(s[i])];
    if (!rows) continue;
    const ox = cx + i * ADVANCE;
    for (let r = 0; r < GLYPH_H; r++) {
      const bits = rows[r];
      if (!bits) continue;
      /* Merge horizontal runs so a glyph is a handful of rects, not 35. */
      let c = 0;
      while (c < GLYPH_W) {
        if (bits & (0x10 >> c)) {
          let run = 1;
          while (c + run < GLYPH_W && bits & (0x10 >> (c + run))) run++;
          g.fillRect((ox + c) * px, (cy + r) * px, run * px, px);
          c += run;
        } else {
          c++;
        }
      }
    }
  }
}

/**
 * Greedy word wrap into `out`, reusing the array. Returns the line count and
 * writes the widest line's cell width into WRAP_WIDEST.
 */
let WRAP_WIDEST = 0;
function wrapText(text: string, maxChars: number, out: string[]): number {
  let n = 0;
  WRAP_WIDEST = 0;
  const words = text.split(' ');
  let line = '';
  const flush = () => {
    if (!line) return;
    out[n] = line;
    n++;
    const w = textCells(line);
    if (w > WRAP_WIDEST) WRAP_WIDEST = w;
    line = '';
  };
  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    if (!w) continue;
    while (w.length > maxChars) {
      flush();
      out[n] = w.slice(0, maxChars);
      n++;
      const ww = textCells(out[n - 1]);
      if (ww > WRAP_WIDEST) WRAP_WIDEST = ww;
      w = w.slice(maxChars);
    }
    if (!line) line = w;
    else if (line.length + 1 + w.length <= maxChars) line = line + ' ' + w;
    else {
      flush();
      line = w;
    }
  }
  flush();
  out.length = n;
  return n;
}

/* -------------------------------------------------------------------------- */
/* 1. compositor                                                               */
/* -------------------------------------------------------------------------- */

type VariantKey = string; // `${part}:${variant}` or `prop:${name}`

function rasterise(rows: readonly string[]): HTMLCanvasElement | null {
  const h = rows.length;
  const w = h ? rows[0].length : 0;
  if (!w || !h) return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  if (!x) return null;
  const img = x.createImageData(w, h);
  for (let r = 0; r < h; r++) {
    for (let col = 0; col < w; col++) {
      const ch = rows[r][col];
      const i = (r * w + col) * 4;
      if (ch === '.' || ch === undefined) {
        img.data[i + 3] = 0;
        continue;
      }
      const hex = (PALETTE as Record<string, string>)[ch];
      if (!hex) {
        img.data[i + 3] = 0;
        continue;
      }
      img.data[i] = parseInt(hex.slice(1, 3), 16);
      img.data[i + 1] = parseInt(hex.slice(3, 5), 16);
      img.data[i + 2] = parseInt(hex.slice(5, 7), 16);
      img.data[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

/** Rasterise every part variant AND every prop once, at 1 pixel per cell. */
function buildAtlas(): Map<VariantKey, HTMLCanvasElement> {
  const atlas = new Map<VariantKey, HTMLCanvasElement>();
  (Object.keys(PARTS) as PartName[]).forEach((part) => {
    const def = PARTS[part] as any;
    Object.keys(def.variants).forEach((variant) => {
      const c = rasterise(def.variants[variant].matrix as readonly string[]);
      if (c) atlas.set(`${part}:${variant}`, c);
    });
  });
  (Object.keys(PROPS) as PropName[]).forEach((name) => {
    const c = rasterise(PROPS[name].matrix);
    if (c) atlas.set(`prop:${name}`, c);
  });
  return atlas;
}

/* -------------------------------------------------------------------------- */
/* 2. player                                                                   */
/* -------------------------------------------------------------------------- */

interface ResolvedPart {
  dx: number;
  dy: number;
  variant: string;
}
type ResolvedPose = Record<string, ResolvedPart>;

function ease(u: number, kind: Easing | undefined): number {
  switch (kind) {
    case 'hold': return 0;
    case 'in': return u * u;
    case 'out': return 1 - (1 - u) * (1 - u);
    case 'inOut': return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
    default: return u;
  }
}

/** Durations are pure functions of the data, so memoise rather than re-add. */
const DURATIONS = new Map<Animation, number>();
function animDuration(anim: Animation): number {
  const hit = DURATIONS.get(anim);
  if (hit !== undefined) return hit;
  let total = 0;
  for (const f of anim.frames) total += f.d;
  DURATIONS.set(anim, total);
  return total;
}

/* Two scratch slots and one pose object, reused every frame. Sampling a pose
   used to allocate 11 objects and a record per frame; at 60fps that is 700
   short-lived objects a second for no reason at all. */
const SCRATCH_A: ResolvedPart = { dx: 0, dy: 0, variant: '' };
const SCRATCH_B: ResolvedPart = { dx: 0, dy: 0, variant: '' };
const POSE: ResolvedPose = {};
for (const part of DRAW_ORDER) POSE[part] = { dx: 0, dy: 0, variant: '' };

function poseInto(anim: Animation, frameIndex: number, part: PartName, out: ResolvedPart) {
  const p = (anim.frames[frameIndex].pose as Pose)[part] as
    | { dx?: number; dy?: number; variant?: string }
    | undefined;
  out.dx = p?.dx ?? 0;
  out.dy = p?.dy ?? 0;
  /* Sparse poses fall back to REST, never to the previous frame. That is the
     contract in sparrowSprite, and it is what keeps a limb from sticking. */
  out.variant = p?.variant ?? ((PARTS[part] as any).rest as string);
}

/** Which keyframe index the head is sitting in. PVZ needs this for the pea. */
let SAMPLED_FRAME = 0;

/**
 * Sample the timeline at `t` ms into POSE. Positions blend between the
 * bracketing keyframes; variants take the earlier frame's value and snap.
 */
function sampleInto(anim: Animation, t: number): boolean {
  const frames = anim.frames;
  const n = frames.length;
  const total = animDuration(anim);
  let done = false;
  let time = t;

  if (anim.loop) {
    time = total > 0 ? t % total : 0;
  } else if (t >= total) {
    time = total;
    done = true;
  }

  let i = 0;
  let acc = 0;
  while (i < n - 1 && acc + frames[i].d <= time) {
    acc += frames[i].d;
    i++;
  }
  SAMPLED_FRAME = i;
  const d = frames[i].d || 1;
  const rawU = Math.min(1, Math.max(0, (time - acc) / d));
  const u = ease(rawU, frames[i].ease);
  const nextIndex = anim.loop ? (i + 1) % n : Math.min(i + 1, n - 1);

  for (let k = 0; k < DRAW_ORDER.length; k++) {
    const part = DRAW_ORDER[k];
    poseInto(anim, i, part, SCRATCH_A);
    poseInto(anim, nextIndex, part, SCRATCH_B);
    const slot = POSE[part];
    slot.dx = SCRATCH_A.dx + (SCRATCH_B.dx - SCRATCH_A.dx) * u;
    slot.dy = SCRATCH_A.dy + (SCRATCH_B.dy - SCRATCH_A.dy) * u;
    slot.variant = SCRATCH_A.variant;
  }
  return done;
}

/**
 * Net facing flips accumulated up to time `t`. `jumpTwist` carries two, which
 * cancel; the somersaults carry none. Applied on top of bird.facing so a
 * flourish cannot leave the bird permanently backwards.
 */
function flipsBefore(anim: Animation, t: number): number {
  const total = animDuration(anim);
  let time = anim.loop ? (total > 0 ? t % total : 0) : Math.min(t, total);
  let flips = 0;
  let acc = 0;
  for (let i = 0; i < anim.frames.length; i++) {
    if (acc > time) break;
    if (anim.frames[i].flip) flips++;
    acc += anim.frames[i].d;
  }
  return flips;
}

/* -------------------------------------------------------------------------- */
/* 3. what he says                                                             */
/* -------------------------------------------------------------------------- */

/** Unprompted, section-agnostic. Kept short: a bubble is not an essay. */
const RANDOM_LINES: readonly string[] = [
  'He rewrote this three times. I watched all three.',
  'If you scroll fast enough I have to improvise.',
  'There is a CV on this page. He would like you to notice it.',
  'I live on the headings. It is a good arrangement.',
  'Ask me something. I am contractually informed.',
  'He is in Hemel Hempstead. Sometimes London. Never here.',
  'First class, Computer Science, Sheffield. He made me learn that.',
  'Something is being built that he will not let me name.',
  'I have opinions about the kerning.',
  'The bird is load-bearing.'
];

/** Fired by an event rather than a timer. */
const LINE_WALL_JUMP: readonly string[] = [
  'Parkour.',
  'Do not try that on a real wall.',
  'I meant to do that.'
];
const LINE_CURSOR_PERCH: readonly string[] = [
  'Do not move.',
  'This will do nicely.',
  'A perch is a perch.'
];
const LINE_STARTLE: readonly string[] = [
  'I was awake. Obviously.',
  'Do not do that.',
  'Who. What. Where.'
];
const LINE_CHASE: readonly string[] = [
  'Come back down here.',
  'You are drifting.',
  'Hold still, I am catching up.'
];
const LINE_PVZ: readonly string[] = ['We have a situation.', 'Lawn defence.', 'Not again.'];
const LINE_WAKE: readonly string[] = ['I was resting my eyes.', 'What did I miss?'];

/* The set pieces. One pool each, because a line that repeats inside a four
   second bit is a line the reader watches repeat. */
const LINE_CREEPER: readonly string[] = [
  'I know that sound.',
  'Oh, come on.',
  'That hissing is never a good sign.'
];
const LINE_TOTEM: readonly string[] = [
  'I had one spare.',
  'Not today.',
  'Do not tell anyone about that.'
];
const LINE_BTTF: readonly string[] = [
  "Where we're going, we don't need roads.",
  'Roads. Apparently optional.',
  'He was very committed to that solo.'
];
const LINE_LANTERN: readonly string[] = [
  'Something just went past my head.',
  'I do not care for October.',
  'It is behind me, is it not.'
];
const LINE_GIFT: readonly string[] = [
  'That one is addressed to me.',
  'Seed. It is always seed.',
  'I have been extremely good.'
];
const LINE_EGG: readonly string[] = [
  'Where did you come from?',
  'That was not my egg.',
  'Right. Off you go, then.'
];

/*
 * ANGER, IN WORDS. The client asked for the anger level to be "reflected in
 * the messages", so the drag pools are banded rather than shuffled together:
 * which pool he draws from is a readout of the same number that drives the
 * struggle amplitude and the escape odds. Three bands, because two reads as a
 * switch and four is more gradation than a one-line bubble can carry.
 */
const LINE_DRAG_CALM: readonly string[] = [
  'Put me down.',
  'This is not a handle.',
  'I was standing there.'
];
const LINE_DRAG_CROSS: readonly string[] = [
  'Let. Go.',
  'I am not a window.',
  'You are going to regret this.'
];
const LINE_DRAG_FURIOUS: readonly string[] = [
  'RIGHT.',
  'That is IT.',
  'You have made a powerful enemy.'
];
const LINE_ESCAPE: readonly string[] = [
  'Freedom.',
  'Told you.',
  'Never again.'
];
const LINE_RETALIATE: readonly string[] = [
  'I am taking this.',
  'You do not deserve a cursor.',
  'Mine now. Reflect on your choices.'
];
const LINE_RETURN: readonly string[] = [
  'Here. Behave.',
  'You may have it back.',
  'We will say no more about it.'
];
/** Thrown off the cursor by a hard mouse movement. */
const LINE_SHAKEN: readonly string[] = [
  'Rude.',
  'I was PERCHED.',
  'Steady on.'
];
/** He decided the cursor was not a career. */
const LINE_CURSOR_LEAVE: readonly string[] = [
  'That was long enough.',
  'Back to the furniture.',
  'You need that. Probably.'
];

function pickLine(pool: readonly string[]): string {
  return pool[(Math.random() * pool.length) | 0];
}

/** Which drag pool the current anger reads from. */
function angerPool(anger: number): readonly string[] {
  if (anger > 0.66) return LINE_DRAG_FURIOUS;
  if (anger > 0.33) return LINE_DRAG_CROSS;
  return LINE_DRAG_CALM;
}

/* -------------------------------------------------------------------------- */
/* 4. physics types                                                            */
/* -------------------------------------------------------------------------- */

interface Perch {
  /** null for the synthetic cursor perch. Identity is how a re-measure
      recognises furniture it has already seen. */
  el: Element | null;
  x0: number;
  x1: number;
  y: number;
  w: number;
  /**
   * True when the element is anchored to the VIEWPORT rather than to the page
   * (position: fixed, or inside something that is). Its document y is then
   * `scrollY + a constant`, re-derived every frame by `syncAnchored` instead
   * of measured. Also disqualifies it as the boot seat: the bird should open
   * on a piece of the page, not on the edge of the screen.
   */
  fixed?: boolean;
}

const GRAVITY = 2100; // px/s^2, document space

/* ==========================================================================
   THE PERCH CONTRACT
   ==========================================================================

   A perch is a HORIZONTAL VISIBLE LINE the bird can stand on: a rule, a
   border, the top of a card, the cap line of a heading. It is not a bounding
   box. Boxes carry padding, leading, tilt, and empty column to the right of
   short text — stand a bird on a box edge and he floats above the mark or
   sinks into it. Closing that gap is the whole point of what follows.

   Furniture is declared IN THE MARKUP, so a component owns its own landing
   surfaces and this file never has to know their class names:

     data-perch
         This element is landable. The perch is the top edge of its border
         box, spanning its full width. Correct for anything whose frame is the
         mark: a rule, a bordered plate, a table row, a card.

     data-perch-text
         The visible mark is the FIRST LINE OF TEXT, not the box. The span is
         narrowed to that line's actual ink, so he cannot stand on the empty
         two thirds of a column beside a short eyebrow. The vertical edge
         still comes from the content box (line-box tops are reported
         inconsistently between engines; padding and border are not), so pair
         this with an inset that names the cap line.

     data-perch-inset="6" | "0.10em" | "13%"
         How far BELOW the box top the visible edge actually is. Plain numbers
         are px; `em` multiplies this element's own computed font size, so the
         value survives a clamp(); `%` is a share of the element's height.
         Negative is legal.

         For text the target is the HIGHEST INK on the first line — the
         ascender line, not the cap line. Set him on the cap line and the
         ascenders of h, l and t pass through his feet, which reads as a bug;
         set him on the ascender line and he is a few pixels clear of the
         capitals, which reads as a bird standing on a word.

         Do not guess it. Measure it, per face and per line-height:

             const p = document.createElement('span');
             p.style.cssText =
               'display:inline-block;width:0;height:0;vertical-align:baseline';
             el.insertBefore(p, el.firstChild);
             const baseline = p.getBoundingClientRect().top;   // then remove p
             ctx.font = [fontStyle, fontWeight, fontSize, fontFamily].join(' ');
             const ink = ctx.measureText('bdfhklt').actualBoundingBoxAscent;
             inset = (baseline - ink - contentBoxTop) / fontSize;   // in em

         Every value in the v2 tree was taken that way. As a first estimate,
         for line-height L, font-size F and a face whose ascent, descent and
         ink height are A, D and I ems, it is L/2 + F(A/2 - D/2 - I) — good to
         about 0.02em on this page's faces, which is a whole pixel at display
         sizes, hence the measurement.

         Current values: 0.04em on the hero title (L = 0.86F), 0.10em on
         .v2-h2 and .v2-route-title (L = 1.02F), 0.12em on .v2-reel-title and
         .v2-foot-say (L = 1.06-1.08F), 0.33em on a lede (L = 1.62F) and
         0.38em on mono set at the base 1.68. A display line at 210px and the
         same rule at 56px do not share a pixel inset, which is exactly why em
         is accepted here.

     data-perch-side="10"
         Horizontal inset per side, px, for the rare non-text case where the
         visible mark is narrower than the box.

   Two corrections need no attribute:

     Rotation. A tilted card's bounding box is both wider and taller than the
     card, and its top is above the visible frame — which is why the polaroids
     could never have lined up from a rect alone. The top edge is rebuilt from
     the untransformed box and the computed matrix, and the span is trimmed to
     the middle of that edge so his feet stay within PERCH_TILT_SLOP of it.

     Reveals. Entrance transitions move the mark without changing layout, so
     nothing fires a resize and a perch measured at boot stays 14px low for
     the life of the page. Anything still faded out is not landable yet, and
     `transitionend` re-measures once it has arrived.

   Elements that are position: sticky, or sit inside something sticky, are
   skipped outright: their document position is only true until they stick,
   and a perch that quietly slides out from under the bird is worse than no
   perch at all.
   ========================================================================== */
const PERCH_ATTR = '[data-perch]';

/**
 * The pre-contract selector list, kept as a FALLBACK. Anything matched by both
 * is harvested once, under its data-perch treatment; anything the attributes
 * miss still lands here, so removing an attribute cannot silently strip the
 * page of everything landable.
 */
const PERCH_SELECTOR =
  '.v2-h2, .v2-shelf-cell, .v2-lede, .v2-eyebrow, .v2-hero-title, .v2-rule-hard, .v2-cue';

/** Narrower than this and his feet hang off both ends. */
const PERCH_MIN_W = 56;
/**
 * A 2px rule is a perfectly good line to stand on. The old floor of 4px threw
 * away every .v2-rule-hard on the page — all eight of them — even though the
 * selector above has always named them. Kept at 4 for the fallback list so
 * nothing it harvests today changes; declared perches get the honest floor.
 */
const PERCH_MIN_H = 0.5;
const PERCH_MIN_H_LEGACY = 4;
/** Shoulder left at each end of a perch, px. Pre-contract behaviour, kept. */
const PERCH_SHOULDER = 8;
/** How far a tilted edge may leave his feet off the line before the span is
    narrowed towards the middle of that edge, px. */
const PERCH_TILT_SLOP = 3;
/** Below this computed opacity the mark has not finished arriving. */
const PERCH_MIN_OPACITY = 0.9;

/** Middle 70% of the viewport. Outside it he starts working his way back. */
/**
 * The edge fifths.
 *
 * > "In those edge regions (top and bottom 20% maybe), he wants to jump down
 * > into the middle 60%, bit by bit."
 *
 * 0.20 rather than the 0.15 it was, so the band he settles into is Jack's
 * middle 60% exactly. This is the ONLY thing that decides where he tries to
 * stand: urgency is zero inside it and rises the further outside it he gets.
 */
const BAND_MARGIN = 0.2;

/**
 * How far past the viewport edge counts as gone, and for how long.
 *
 * Only being GONE licenses an ability — see the trigger in update(). A hop
 * arc rises up to 620px and can clip the top edge on the way somewhere
 * sensible, so this has to sit past what an ordinary hop does without sitting
 * so far out that he is visibly absent before anything happens.
 */
/**
 * How far above the baseline his head sits, in device px.
 *
 * BASELINE_Y is row 25 of a 28-row sprite and the head anchor is row 7, so the
 * head centre is about 15 sprite pixels up, times PIXEL_SCALE. Used to aim a
 * peck from his head rather than from his feet: aiming from the feet makes a
 * cursor level with his eye read as being below him, and he pecks at the floor.
 */
const HEAD_ABOVE_BASE = (BASELINE_Y - 10) * PIXEL_SCALE;

/** The parts a peck's aim re-points. Body and tail follow the pose, not the
 *  cursor: a bird turning its head is not a bird turning round. */
const AIM_PARTS = ['head', 'eye', 'beak'] as const;

const OFF_SCREEN_MARGIN = 60;
const OFF_SCREEN_SUSTAIN = 260;

/**
 * How long a transit takes, as a multiple of what the animation asks for.
 *
 * > "The going down animations are too slow and the going up animations are
 * > too fast."
 *
 * `down` shortens the scripted descents — skydive 2970ms to 1840, crash 1950
 * to 1210, rope 1820 to 1130 — and the same figure speeds their playback so
 * the frames still land with the travel. `up` is the other way: it stretches
 * the looping flap and the balloon out, because an ascent's SPEED comes from
 * the convergence below rather than from its animation.
 */
const TRANSIT_TIME = { up: 1.4, down: 0.62 };
/** Ceiling on a transit's own vertical speed, px/s, per direction. */
const TRANSIT_CAP_VY = { up: 1100, down: 1500 };
/**
 * How hard it converges on its comfortable screen height, per direction.
 *
 * Both were 7 against a 2200px/s cap, which spent the travel in the first
 * quarter of the flight and left him hovering for the rest of it. The point of
 * a flight is the travel, so the numbers are chosen to make the descent or the
 * climb last roughly half the minimum flight time and the hover the other
 * half — long enough to read as arriving rather than as stopping dead.
 */
const TRANSIT_CONVERGE = { up: 2.6, down: 4.5 };
/** No looping transit lands sooner than this, whatever its cycle length. */
const TRANSIT_MIN_MS = 900;
/** How far in from the viewport edge a wall kick happens. */
const WALL_INSET = 26;
/** One body width, in document px. The pace every walk translates at. */
const BODY_PX = 11 * PIXEL_SCALE;

/**
 * The fastest any CORRECTION may move him, in px/s.
 *
 * Clamping a position into a legal range is the classic way a rig teleports:
 * the arithmetic is right, the assignment is instant, and thirty pixels
 * vanish between two frames. Every clamp that used to be an assignment now
 * goes through `approach` at this speed, so being a little off the end of a
 * heading is walked off rather than cut away.
 */
const CORRECT_SPEED = 460;
/** Terminal velocity of a fall. See the fall case for why 1900 was wrong. */
const FALL_TERMINAL = 1250;
/** No single fall substep may travel further than this. */
const FALL_STEP_PX = 16;
/**
 * How far BELOW a perch a deliberate drop off it starts, px.
 *
 * A landing is a crossing test: the perch's y has to lie between where he was
 * last substep and where he is now. Someone standing on a perch is at exactly
 * its y, so the first substep of a fall brackets it and lands him straight
 * back on the thing he was just let go of. That is not a theory — the light
 * cord released him and he did not move a pixel.
 */
const FALL_CLEARANCE = 2;

/**
 * The tallest climb ONE hop can make, px, by urgency.
 *
 * This is not a preference, it is a hard reach. `launchTo` clamps the arc's
 * rise to it, so a leg asked for a taller climb than this has its apex BELOW
 * its own target: he does not arrive slowly, he does not arrive at all. He
 * throws himself upward, misses by however much the clamp took off, and falls
 * back down the page until gravity finds him some furniture.
 *
 * That single fact was two of the complaints. The light switch went off
 * without him because the cord hangs at the top of the screen and most of a
 * plate is further below it than 420px. And he "jumps off a wall and straight
 * off the bottom of the screen" because a wall kick splits a climb 28/72 (see
 * planTo) and a 72 that is still too tall is a leap into nothing.
 *
 * `launchTo` now asks this question BEFORE it launches, and flies the leg
 * instead of jumping it when the answer is no.
 */
const HOP_REACH = { urgent: 420, easy: 620 };
function hopReach(urgency: number): number {
  return urgency > 0.6 ? HOP_REACH.urgent : HOP_REACH.easy;
}
/**
 * The tallest climb a whole hop CHAIN can make, px.
 *
 * A wall kick splits the climb 28/72, so the binding leg is the 72 and a chain
 * reaches about a third further than one arc. A stepping-stone perch would
 * reach further still, but only when one happens to exist between here and
 * there, so it is not counted: over-estimating this costs a device the reader
 * did not need, and under-estimating it costs the entire beat.
 */
const CHAIN_REACH = HOP_REACH.urgent / 0.72;

/**
 * THE SCRAMBLE — what he does when an errand is further up than he can jump.
 *
 * > "Especially when going up, sometimes he doesn't get to the light switch in
 * > time and it goes off without him. Make him use one of his abilities like
 * > jetpack or hot air balloon to go straight to it if he is too far away."
 *
 * Both are animations he already owns, off the transit table, and both already
 * carry their own furniture: the jetpack is a `gear` variant on the puppet and
 * the balloon is a pair of props. Nothing new is drawn. What is new is that
 * they can now be flown DELIBERATELY, at a target, instead of only happening
 * to a reader who scrolls.
 *
 * Which one he reaches for is decided by the clock rather than by a coin: the
 * balloon is lovely and slow, so it only comes out when it can still make the
 * deadline, and the jetpack covers everything else. When both would do, it is
 * a coin, because the same answer twice running is a mechanism.
 */
const SCRAMBLE = {
  jetpack: { anim: 'upJetpack' as AnimationName, speed: 1180 },
  balloon: { anim: 'upBalloon' as AnimationName, speed: 430 }
};
/**
 * How much of what is left of the deadline the FLIGHT itself may spend.
 *
 * The rest pays for the landing and the errand's own bookkeeping on the far
 * end. Deliberately generous to the margin: a balloon that arrives one frame
 * after the caller gave up is worse than a jetpack that arrives early, because
 * the reader sees the whole ascent and then sees it not count.
 */
const SCRAMBLE_BUDGET = 0.78;
/* TRANSIT_VEL and TRANSIT_SUSTAIN lived here. They defined "a fast scroll",
   which is no longer what licenses an ability: being off the screen is. See
   the trigger in update(). */

/**
 * Longest step the movement integrators may take, seconds.
 *
 * `FRAME_MS_MAX` is 100ms, which is the right ceiling for "the tab was in the
 * background" but the wrong one for "that frame took a while". Integrating a
 * whole tenth of a second in one step moves him as far as six ordinary frames
 * would, all at once, and it reads as a teleport rather than as flight. Held
 * to a thirtieth, he runs slow through a stall instead of jumping through it,
 * which is what everything else on the screen is doing anyway.
 *
 * The rate ESTIMATES -- scroll velocity, pointer velocity -- still get the
 * real elapsed time. They divide a delta that accumulated over the whole
 * frame, so giving them a shorter one would report a scroll three times
 * faster than the reader's, and send him diving for cover from a gesture that
 * never happened.
 */
const UPDATE_DT_MAX = 1 / 30;

/**
 * How long the page has to stop moving before furniture is re-measured, ms.
 *
 * The reveal on a plate is forty transitions staggered across about a second,
 * and every one of them ends with a `transitionend`. Measuring on each is
 * measuring forty times while the marks are still arriving; measuring once
 * they have stopped is measuring the page the reader is actually looking at.
 * Long enough to swallow a stagger, short enough that a perch is never
 * unavailable for a noticeable beat.
 */
const MEASURE_QUIET_MS = 150;

/**
 * How fast a scroll burns the page's accrued quiet, as a multiple.
 *
 * Burning rather than zeroing. A reader who nudges the wheel once should not
 * lose eight seconds of accumulated calm and have to sit through the whole
 * wait again -- which, with a reset, is exactly what a twitchy trackpad does
 * forever. At 3x a real scroll still clears it in a third of the time it took
 * to build, so travelling through the page genuinely does disqualify.
 */
const CALM_BURN = 3;

/** Move `cur` toward `target` by at most one frame of travel. */
function approach(cur: number, target: number, dt: number, speed = CORRECT_SPEED): number {
  const d = target - cur;
  const step = speed * dt;
  if (d > step) return cur + step;
  if (d < -step) return cur - step;
  return target;
}

type Mode =
  | 'idle'
  | 'walk'
  | 'act'
  | 'hop'
  | 'wall'
  | 'land'
  | 'fall'
  | 'fly'
  | 'transit'
  | 'sleep'
  | 'chat'
  | 'pvz'
  /* a set piece is happening to him; see the bit machinery */
  | 'bit'
  /* held by the reader. He does not care for it. */
  | 'drag';

/**
 * The set pieces, by name.
 *
 * > "Give him some more fun idle easter eggs ... Figure out some more cool
 * > easter eggs, and ones for halloween, christmas, easter, etc."
 *
 * `bttf` is the long one and carries its own gate: a full minute of stillness
 * before it is even in the hat, because a ten second film is a gift to a
 * reader who has settled and an ambush to one who has not.
 */
type BitName = 'creeper' | 'bttf' | 'lantern' | 'gift' | 'egg';

/**
 * WHEN EACH SEASONAL BIT IS IN SEASON.
 *
 * Day-of-year windows, inclusive, except `egg` which follows Easter and is
 * computed rather than tabled. Halloween runs into the first of November
 * because the lantern is still funny on the morning after.
 */
const SEASON_WINDOW: Partial<Record<BitName, [number, number, number, number]>> = {
  /* [fromMonth, fromDay, toMonth, toDay], months 1-12 */
  lantern: [10, 24, 11, 1],
  gift: [12, 8, 12, 27]
};

/**
 * Jack, 2026-08-26: "put those ones in now so I can see them."
 *
 * While this is true every seasonal bit is in the hat all year, at a fraction
 * of the weight it carries in its own window. It is one line to turn off, and
 * turning it off is the only thing that has to happen for the seasons to
 * behave like seasons.
 */
const SEASON_PREVIEW = true;
/** Weight in season, and weight the rest of the year while previewing. */
const SEASON_WEIGHT = { inSeason: 22, preview: 5 };

/**
 * Easter Sunday, as a Date, by the anonymous Gregorian algorithm.
 *
 * Written out rather than approximated because "the last Sunday in March-ish"
 * is wrong by up to a month, and an egg bit that fires in the wrong week is
 * a bug that only shows up once a year and only to whoever is looking.
 */
function easterOf(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Is this bit in its own window today? Non-seasonal bits are always in. */
function inSeason(name: BitName, now: Date): boolean {
  if (name === 'egg') {
    /* The week before Easter Sunday and the two days after it. */
    const e = easterOf(now.getFullYear()).getTime();
    const day = 86400000;
    return now.getTime() >= e - 7 * day && now.getTime() <= e + 2 * day;
  }
  const win = SEASON_WINDOW[name];
  if (!win) return true;
  const [m0, d0, m1, d1] = win;
  const key = (now.getMonth() + 1) * 100 + now.getDate();
  return key >= m0 * 100 + d0 && key <= m1 * 100 + d1;
}

interface Waypoint {
  kind: 'perch' | 'wall';
  x: number;
  y: number;
  perch: Perch | null;
  side: number;
}

interface ChatMsg {
  me: boolean;
  text: string;
}

/**
 * A job the page needs the bird to physically go and do.
 *
 * There is exactly one of these so far and it is the light switch. Jack asked
 * for the change into dark to be "the bird flying up to the top of the screen
 * and pulling a light switch", which means the palette transition cannot just
 * be a transition: something has to actually happen, in the world, and the
 * page has to wait for it.
 *
 * The contract is deliberately thin, because the alternative was the page
 * reaching into the engine. The page names a target and gets told when he is
 * standing on it. It does not learn where he was, how he got there, or how
 * long it took, and the engine learns nothing about light switches.
 */
export interface CompanionErrand {
  /** Fresh per errand. Changing it is what starts one. */
  key: number;
  kind?: 'switch' | 'delivery';
  /** Optional line spoken while carrying a delivery away. */
  line?: string;
  /**
   * CSS selector for the thing to stand on. It must carry `data-perch`, and
   * it must already be in the DOM when the errand is handed over: the engine
   * re-measures on receipt, once, and does not poll for it to appear.
   */
  selector: string;
}

export interface CompanionProps {
  /** Lines the bird may say, keyed by section id. */
  whispers?: Record<string, string[]>;
  /** The section currently being read, from useSpine. */
  activeSection?: string;
  /** Live scroll velocity ref from useSpine, read per frame. */
  velocityRef?: React.MutableRefObject<number>;
  /** Answers questions about Jack. Falls back to a local table offline. */
  onAsk?: (q: string) => Promise<string>;
  /**
   * Send him somewhere. Set to null to release him: until then he will stay
   * on the target rather than drifting back into the comfort band, which he
   * otherwise would immediately, because the target is at the top of the
   * screen and the top of the screen is exactly where he does not want to be.
   */
  errand?: CompanionErrand | null;
  /** He is standing on it. */
  onErrandArrive?: () => void;
  /**
   * He cannot get there, or is not going to: no such element, no perch on it,
   * chat open, or he simply did not make it inside ERRAND_DEADLINE. The caller
   * is expected to carry on without him rather than wait.
   */
  onErrandFail?: () => void;
}

/* Small record-shaped lookups, cast once so the call sites stay clean. */
const TRANSIT_PROP_MAP = TRANSIT_PROPS as unknown as Record<string, readonly PropName[]>;
const CHAT_PROP_MAP = CHAT_PERCH_PROPS as unknown as Record<string, readonly PropName[]>;
const CHAT_CYCLE_MAP = CHAT_PERCH_CYCLES as unknown as Record<
  string,
  readonly (readonly { prop: PropName | null; d: number }[])[] | undefined
>;

/**
 * Which of a perch's CYCLED props are showing right now.
 *
 * Written into one module-level array that is cleared and refilled rather than
 * returned fresh, because this runs inside the frame loop and the loop does not
 * allocate. The caller must therefore read the result before calling again —
 * which the draw pass does, twice per frame, once for each layer.
 *
 * `t` is the bird's own clock, the same one the keyframes advance on, so the
 * fire cannot drift against the animation that is standing in front of it.
 */
const cycleScratch: PropName[] = [];
function cycledProps(perch: string, t: number): PropName[] {
  cycleScratch.length = 0;
  const cycles = CHAT_CYCLE_MAP[perch];
  if (!cycles) return cycleScratch;
  for (let c = 0; c < cycles.length; c++) {
    const steps = cycles[c];
    let total = 0;
    for (let i = 0; i < steps.length; i++) total += steps[i].d;
    if (total <= 0) continue;
    let left = t % total;
    for (let i = 0; i < steps.length; i++) {
      left -= steps[i].d;
      if (left < 0) {
        /* a null step is a deliberate gap: the page is not turning yet */
        if (steps[i].prop) cycleScratch.push(steps[i].prop as PropName);
        break;
      }
    }
  }
  return cycleScratch;
}
const EMPTY_PROPS: readonly PropName[] = [];

/**
 * Rolls one weighted entry.
 *
 * BUG 3, "the balloon animation isn't there". It was there — at two points in
 * a hundred, behind a scroll gesture that (see the transit gate in update)
 * almost never fired. Two percent of an event the reader never triggers is
 * indistinguishable from absent, and the client is right that a piece of art
 * nobody sees has not shipped.
 *
 * The authored 92:8 still governs the opening few transits, so the surprise
 * survives. After that the rare weights climb, and a rare the reader has
 * never met outranks one they have — so the balloon, the saucer, the jetpack
 * and the propeller beanie each get a turn instead of the same one repeating.
 * This is a rising probability, not a rota: there is no transit count at
 * which the reader can predict what happens next.
 */
function rareWeight(e: TransitEntry, boost: number, seen: Set<AnimationName>): number {
  if (e.rarity !== 'rare') return e.weight;
  return e.weight * boost * (seen.has(e.name) ? 1 : 2.6);
}
function rollTransit(
  table: readonly TransitEntry[],
  boost: number,
  seen: Set<AnimationName>
): TransitEntry {
  let total = 0;
  for (let i = 0; i < table.length; i++) total += rareWeight(table[i], boost, seen);
  let r = Math.random() * total;
  for (let i = 0; i < table.length; i++) {
    r -= rareWeight(table[i], boost, seen);
    if (r <= 0) return table[i];
  }
  return table[0];
}

/**
 * Plain hops carry most of the weight — a bird that somersaults every time it
 * moves is a screensaver. JUMP_VARIANTS is ordered plain-first for this.
 */
const JUMP_WEIGHTS: readonly number[] = [34, 34, 8, 7, 6, 4, 3, 3];
function rollJump(skipPlain: boolean): AnimationName {
  let total = 0;
  for (let i = skipPlain ? 2 : 0; i < JUMP_VARIANTS.length; i++) total += JUMP_WEIGHTS[i];
  let r = Math.random() * total;
  for (let i = skipPlain ? 2 : 0; i < JUMP_VARIANTS.length; i++) {
    r -= JUMP_WEIGHTS[i];
    if (r <= 0) return JUMP_VARIANTS[i];
  }
  return JUMP_VARIANTS[0];
}

function smoothstep(u: number): number {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  return t * t * (3 - 2 * t);
}

/* ==========================================================================
   THE FLIGHT RIG
   ==========================================================================

   B1: "the flying animation needs work, he looks like he's floating."

   Floating is a diagnosis, not a taste. It is what a wing cycle produces when
   two things are true, and both were true here:

     1. THE CYCLE IS SYMMETRIC. `flyFlap` spends 130ms getting the wing down
        and 140ms getting it back up. A real wingbeat is not symmetric at all:
        the downstroke is the powered half and it is FAST, the recovery is
        passive and slow, and the ratio is roughly one to two. Played at even
        speed the wing reads as waving, and a waving bird hovers.

     2. THE BODY DOES NOT MOVE. Worse than that — the authored body offset is
        IN PHASE with the wing (body 1px up when the wing is up, 1px down when
        the wing is down), which is backwards. A downstroke pushes air down
        and the animal UP. Body and wing belong in antiphase.

   The sprite file is owned elsewhere, so neither is fixed by editing the
   keyframes. Both are fixed here, in the rig, which is the right place for
   them anyway: they depend on how fast he is actually travelling, which the
   sprite cannot know.

     - the wing cycle is driven by a PHASE, and the phase is warped onto the
       animation's own timeline so the downstroke plays in FLAP_DOWN_FRAC of
       the wall clock and the recovery gets the rest;
     - the body BOBS in antiphase, at an amplitude that comfortably dominates
       the authored in-phase pixel, so the net relative motion is correct;
     - and he PITCHES forward into the direction of travel, faster flight
       meaning more pitch, because a bird that is going somewhere leans.

   This applies to sustained flight — mode 'fly' — and deliberately not to the
   scripted transits, which are set pieces with their own timing and which the
   client did not complain about.
   ========================================================================== */

/** Wall-clock period of one wingbeat in sustained flight, ms. */
const FLAP_CYCLE_MS = 290;
/** Share of that period spent on the powered downstroke. Under half. */
const FLAP_DOWN_FRAC = 0.34;
/** Peak body rise and fall, in sprite pixels. Net of the authored ±1. */
const FLAP_BOB = 2.6;
/** Peak forward pitch, in sprite pixels of head-forward / tail-back shear. */
const FLAP_PITCH = 2.1;
/** Flight speed that counts as "full pitch", px/s. */
const FLAP_PITCH_REF = 900;
/** Seconds to fade the rig in and out, so entering flight does not snap. */
const FLAP_BLEND = 0.16;

/**
 * Milliseconds into `anim` at which the wing reaches the BOTTOM of its
 * stroke — the boundary the phase warp bends around.
 *
 * Found from the data rather than hardcoded, so this keeps working if the
 * sprite owner re-times a flap: the bottom is the keyframe whose wing sits
 * lowest, preferring a keyframe that also names a spread or down variant so a
 * pose that merely drifts cannot win. Memoised, because it is a pure function
 * of an object that never changes.
 */
const WING_BOTTOM = new Map<Animation, number>();
function wingBottomMs(anim: Animation): number {
  const hit = WING_BOTTOM.get(anim);
  if (hit !== undefined) return hit;
  let best = -Infinity;
  let bestAt = -1;
  let acc = 0;
  for (let i = 0; i < anim.frames.length; i++) {
    const w = (anim.frames[i].pose as Pose).wing as
      | { dy?: number; variant?: string }
      | undefined;
    if (w) {
      const low = w.variant === 'spread' || w.variant === 'down' ? 1.5 : 0;
      const score = (w.dy ?? 0) + low;
      if (score > best) {
        best = score;
        bestAt = acc;
      }
    }
    acc += anim.frames[i].d;
  }
  const out = bestAt > 0 ? bestAt : acc * 0.5;
  WING_BOTTOM.set(anim, out);
  return out;
}

/* ==========================================================================
   THE DRAWN CURSOR
   ==========================================================================

   Job 4, which the client approved: the bird can steal your mouse pointer.

   A browser cannot move or hide the real pointer, so this is a SWAP — the
   system cursor is hidden with CSS over the page and an identical pixel one
   is drawn on the companion canvas at the pointer's own coordinates. Once the
   thing on screen is ours, he can take it.

   The swap is the single most dangerous thing in this file: a page with no
   visible pointer is a page nobody can use. Everything about it is therefore
   written to fail back to the real cursor rather than away from it. See
   `cursorWanted` and the watchdog for the full list of conditions, but the
   shape of the rule is: the class goes on only while a drawn cursor was
   actually painted in the last few frames, and comes off for anything at all.
   ========================================================================== */

/**
 * 8x12, hotspot at its top-left pixel, drawn at CURSOR_SCALE rather than
 * PIXEL_SCALE so it lands at 16x24 CSS px — the size of a real arrow. K is
 * the sprite's ink and W its brightest paper, so the outline carries it on
 * either palette without needing a theme of its own.
 */
const CURSOR_MATRIX: readonly string[] = [
  'K.......',
  'KK......',
  'KWK.....',
  'KWWK....',
  'KWWWK...',
  'KWWWWK..',
  'KWWWWWK.',
  'KWWWWWWK',
  'KWWWKKKK',
  'KWKWWK..',
  'KK.KWWK.',
  '...KKKK.'
];
/**
 * The same arrow, filled vermilion, shown over anything clickable.
 *
 * This exists because the swap used to hand the real pointer back over
 * interactive elements, and Jack reported that as a bug: "the custom mouse
 * stops when I hover over something selectable." He is right that it looks
 * broken — the cursor you are being shown vanishes exactly when you go to use
 * it. But the reason it did that was real: `cursor: pointer` is how the page
 * says "this does something", and losing that affordance would be a genuine
 * regression, not a stylistic one.
 *
 * So the affordance moves into the drawn cursor instead of being given up.
 * Same silhouette, same hotspot, same size — only the fill changes, which is
 * the strongest signal available in a two-colour sprite and needs no new
 * hotspot maths. The outline stays ink so it still reads on either palette.
 */
const CURSOR_MATRIX_OVER: readonly string[] = [
  'K.......',
  'KK......',
  'KVK.....',
  'KVVK....',
  'KVVVK...',
  'KVVVVK..',
  'KVVVVVK.',
  'KVVVVVVK',
  'KVVVKKKK',
  'KVKVVK..',
  'KK.KVVK.',
  '...KKKK.'
];
const CURSOR_SCALE = 2;
/** Class the swap puts on <html>. The rule is injected and removed with it. */
const CURSOR_SWAP_CLASS = 'v2-bird-cursor-swap';
/**
 * Anything the reader might click, type into or focus.
 *
 * This no longer hands the real cursor back — it selects the vermilion arrow
 * instead, so the affordance survives without the pointer disappearing. It is
 * still used elsewhere to keep him from perching on live controls.
 */
const INTERACTIVE_SELECTOR =
  'a,button,input,select,textarea,label,summary,option,[role="button"],' +
  '[role="link"],[role="textbox"],[contenteditable],[tabindex]:not([tabindex="-1"])';

/* ==========================================================================
   DRAG, ANGER, AND THE CURSOR PERCH
   ========================================================================== */

/** Pixels of pointer travel before a press on him becomes a drag, not a click. */
const DRAG_SLOP = 5;
/** Anger gained per pixel the pointer drags him. 620px of hauling maxes it. */
const ANGER_PER_PX = 0.0016;
/** Anger lost per second once you stop. "Comes down pretty quick." */
const ANGER_DECAY = 0.85;
/** Grace before the decay starts, so a pause mid-drag does not reset him. */
const ANGER_GRACE_MS = 240;
/** How often he tries to break free while held. */
const ESCAPE_TICK_MS = 420;
/** Above this, breaking free is not enough: he takes the cursor with him. */
const RETALIATE_ANGER = 0.62;
/** How long he keeps it, ms. Bounded on purpose — see the watchdog. */
const THEFT_MS = 3000;

/** Pointer speed he can ride out while perched on it, px/s. */
const PERCH_RIDE_SPEED = 340;
/** Sustained pointer speed that throws him off, px/s. */
const PERCH_BUCK_SPEED = 1500;
/** A single frame's pointer jump that throws him off, px. */
const PERCH_BUCK_JERK = 44;
/** How long he will stay on the cursor before leaving of his own accord. */
const PERCH_STAY_MIN_MS = 5400;
const PERCH_STAY_JITTER_MS = 9000;

/* -------------------------------------------------------------------------- */
/* 5. component                                                                */
/* -------------------------------------------------------------------------- */

export default function Companion({
  whispers,
  activeSection,
  velocityRef,
  onAsk,
  errand = null,
  onErrandArrive,
  onErrandFail
}: CompanionProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [chatting, setChatting] = useState(false);

  /* Everything the loop reads lives behind a ref so the engine effect can run
     exactly once and never be torn down by a parent re-render. */
  const whispersRef = useRef(whispers);
  whispersRef.current = whispers;
  const sectionRef = useRef(activeSection);
  sectionRef.current = activeSection;
  const velRef = useRef(velocityRef);
  velRef.current = velocityRef;
  const onAskRef = useRef(onAsk);
  onAskRef.current = onAsk;
  const errandRef = useRef(errand);
  errandRef.current = errand;
  const onErrandArriveRef = useRef(onErrandArrive);
  onErrandArriveRef.current = onErrandArrive;
  const onErrandFailRef = useRef(onErrandFail);
  onErrandFailRef.current = onErrandFail;

  const chat = useRef({
    open: false,
    busy: false,
    version: 0,
    log: [] as ChatMsg[],
    perch: CHAT_PERCHES[0]
  });
  /* Announced to screen readers, which cannot read a canvas. */
  const [srLog, setSrLog] = useState<ChatMsg[]>([]);

  const closeChat = useCallback(() => {
    if (!chat.current.open) return;
    chat.current.open = false;
    setChatting(false);
  }, []);

  const submit = useCallback(async (q: string) => {
    const c = chat.current;
    if (!q.trim() || c.busy) return;
    c.log.push({ me: true, text: q.slice(0, 240) });
    c.version++;
    c.busy = true;
    setSrLog(c.log.slice(-6));
    const el = inputRef.current;
    if (el) el.disabled = true;
    let answer: string;
    try {
      answer = onAskRef.current
        ? await onAskRef.current(q)
        : 'Ask me about MotionGen, the rasterizer, the classifier, or the road.';
    } catch {
      answer = 'That did not go through. Try me again in a moment.';
    }
    c.log.push({ me: false, text: answer });
    if (c.log.length > 40) c.log.splice(0, c.log.length - 40);
    c.version++;
    c.busy = false;
    setSrLog(c.log.slice(-6));
    const el2 = inputRef.current;
    if (el2) {
      el2.disabled = false;
      el2.focus();
    }
  }, []);

  /* ---------------------------------------------------------------------- */
  /* the engine                                                              */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pageCtx0 = canvas.getContext('2d');
    if (!pageCtx0) return;
    const pageCtx: CanvasRenderingContext2D = pageCtx0;

    /* ====================================================================
       SCROLL IS READ ONCE A FRAME

       `window.scrollY` is cheap only while layout is clean. If anything has
       dirtied it, reading it forces the browser to lay out the whole document
       before it can answer, and this document is fifteen thousand pixels
       tall. Measured here with style deliberately dirtied: 1.3us for a clean
       read against 1352us for a dirty one.

       BE HONEST ABOUT WHAT THAT IS WORTH. Measured inside this page's real
       frame at a settled scroll position, a read costs 2us — nothing has
       dirtied layout by the time the engine runs, so the eight-hundred-fold
       cliff is a hazard rather than a bill currently being paid. A sampling
       profiler attributed 1.6s of a 17s run to this function, which is what
       sent me here; driving it directly showed that attribution was the
       frame's idle wait and not the read.

       So this is a small win taken cheaply — sixty-odd reads a frame became
       one, across trackScroll, syncAnchored, projectedScreenY, bandUrgency
       and draw — and its real value is that the engine can no longer wander
       onto the expensive side of that cliff as the page grows.

       Every drive reads the copy. A frame of staleness costs nothing here: this canvas is
       already a frame behind the compositor by design (see THE SCROLL FIX
       below), which is precisely why the bird is drawn in document flow.
       Pointer handlers refresh it themselves, because they run outside the
       frame and their arithmetic is against a live cursor.
       ==================================================================== */
    let scrollXNow = 0;
    let scrollYNow = 0;
    function readScroll(): void {
      scrollXNow = window.scrollX;
      scrollYNow = window.scrollY;
    }
    readScroll();

    /* ====================================================================
       THE SCROLL FIX — a second canvas that lives in the document

       Browsers scroll on the compositor thread without waiting for the main
       thread. A rAF callback reading `scrollYNow` gets the last COMMITTED
       offset, which during a fling is behind what the compositor has already
       painted. Drawing the bird at `bird.y - scrollYNow` on a fixed canvas
       therefore puts him at a position derived from an older scroll offset
       every single frame, and he corrects on the next one. That is the lag
       Jack reported three times, and it cannot be fixed by reading scroll
       "more freshly": the main thread is structurally behind.

       The only fix is to take JS out of the scroll path, so this is a strip of
       canvas in NORMAL DOCUMENT FLOW. It scrolls with the page for free, on
       the compositor, and the draw call never reads scrollY at all.

       A full-document canvas is not an option — 13,000px at DPR 2 is ~66M
       pixels — so the strip is a band that follows him, moved with
       `translate3d` in DOCUMENT coordinates. The transform only changes when
       he moves under his own power. While he is perched it is a constant, and
       a constant transform on a composited layer is exactly what "stays where
       it is on the page" means.

       The band NEVER extends past the bottom of the document (see the clamp in
       draw), because an absolutely positioned box that hangs off the end would
       grow the scroll height, which would let him go lower, which would grow
       it again.

       What stays on the fixed viewport canvas: the chat window and the drawn
       cursor. Both are genuinely viewport-anchored and neither has a lag
       problem, because neither moves while you scroll.
       ==================================================================== */
    /** CSS px of band above his feet: sprite, tall props, bubble and tail. */
    const BAND_UP = 420;
    /** And below: the shadow, the low props, and anything that drips. */
    const BAND_DOWN = 140;
    const BAND_H = BAND_UP + BAND_DOWN;

    const band = document.createElement('div');
    band.setAttribute('aria-hidden', 'true');
    /* Styled inline rather than by class. The element is created here, so its
       appearance should not depend on a stylesheet having loaded. */
    band.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:0;z-index:39;' +
      'pointer-events:none;will-change:transform;contain:layout style;';
    const bandCanvas = document.createElement('canvas');
    bandCanvas.style.cssText =
      'position:absolute;top:0;left:0;image-rendering:pixelated;pointer-events:none;';
    band.appendChild(bandCanvas);
    document.body.appendChild(band);
    const bandCtx0 = bandCanvas.getContext('2d');
    if (!bandCtx0) {
      band.remove();
      return;
    }
    const bandCtx: CanvasRenderingContext2D = bandCtx0;

    /** Where the band's top edge sits in document space, in CSS px. */
    let bandTop = -1;
    /** Document height, re-read whenever the page is measured. */
    let docH = 0;
    /** False on a page too short to hold a band without growing it. */
    let useBand = false;

    /**
     * The context the puppet is currently being painted into.
     *
     * Deliberately the same NAME the whole draw path already used, so that
     * every blit in `drawPart`, `drawPropAt`, `drawPropInSprite` and the
     * bubble follows the surface without a single call site changing. `draw`
     * points it at the band, paints him, and points it back at the viewport
     * canvas for the chat and the cursor. It is never observable outside one
     * synchronous `draw`.
     */
    let ctx: CanvasRenderingContext2D = pageCtx;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motionQuery.matches;
    const onMotion = () => {
      reduced = motionQuery.matches;
      /* Opting into reduced motion mid-session must not leave a drawn cursor
         in charge, since under reduced motion nothing draws one. */
      if (reduced) restoreCursor();
    };
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotion);

    const atlas = buildAtlas();
    /* Mojang's unmodified 16×16 item texture. It is kept as an image rather
       than approximated in the sprite alphabet so every source pixel survives. */
    const totemTexture = new Image();
    totemTexture.decoding = 'async';
    totemTexture.src = '/v2/totem_of_undying.png';

    /* Rasterised once, like everything else the compositor draws. Null means
       the swap can never engage, which is the correct way for it to fail. */
    const cursorImg = rasterise(CURSOR_MATRIX);
    const cursorImgOver = rasterise(CURSOR_MATRIX_OVER);

    /* ---- theme -------------------------------------------------------- */
    /* The sprite palette is fixed, but the bubble and chat chrome are ours,
       so they follow the page's own tokens and flip with the theme. */
    const theme = { paper: '#F0ECE3', ink: '#17140F', ink3: '#655C4F', verm: '#9E3524' };
    function readTheme() {
      const cs = getComputedStyle(document.documentElement);
      const get = (n: string, f: string) => (cs.getPropertyValue(n) || '').trim() || f;
      theme.paper = get('--paper-hi', '#F0ECE3');
      theme.ink = get('--ink', '#17140F');
      theme.ink3 = get('--ink-3', '#655C4F');
      theme.verm = get('--verm-text', get('--verm', '#9E3524'));
      bubble.dirty = true;
      chatUi.dirty = true;
    }

    let W = 0;
    let H = 0;
    let dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      pageCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pageCtx.imageSmoothingEnabled = false;

      bandCanvas.width = Math.round(W * dpr);
      bandCanvas.height = Math.round(BAND_H * dpr);
      bandCanvas.style.width = W + 'px';
      bandCanvas.style.height = BAND_H + 'px';
      bandCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bandCtx.imageSmoothingEnabled = false;

      measureDoc();
      chatUi.dirty = true;
    }

    /**
     * How tall the document is, and therefore whether a band fits in it.
     *
     * `scrollHeight` includes the band itself, which looks circular and is
     * not: the band is clamped so its bottom edge can never pass `docH`, so
     * the measurement is a fixed point rather than a feedback loop. It cannot
     * make the page grow, so it cannot make itself grow.
     */
    function measureDoc() {
      docH = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        window.innerHeight
      );
      /* On a page shorter than the band there is nowhere to put it that does
         not add scroll height, so we keep the old viewport-canvas path. It
         lags, but a page that short cannot be scrolled far enough to see it. */
      useBand = docH >= BAND_H + 8;
      band.style.display = useBand ? '' : 'none';
    }

    /* ---- perches, measured from real page furniture ------------------- */
    /*
     * BUG 1, cause (b): re-measuring used to build brand new Perch objects.
     * The bird held a pointer to the old one, so the instant a layout shift
     * moved a heading the bird either kept standing on a ghost or was handed
     * a perch whose y had moved 200px — and since idle assigns bird.y from
     * bird.perch.y every frame, that read as a teleport.
     *
     * Now perches are keyed by their element and UPDATED IN PLACE, and the
     * delta is applied to the bird as well. The bird rides the furniture: it
     * stays exactly where it was relative to the words under its feet, which
     * is the only reading of "did not move" that a reader can perceive.
     */
    const byEl = new Map<Element, Perch>();
    let perches: Perch[] = [];
    const cursorPerch: Perch = { el: null, x0: 0, x1: 0, y: 0, w: 28 };

    /**
     * Perches on viewport-anchored furniture, with the VIEWPORT-space edge that
     * was measured for each. Their document coordinates are re-derived from the
     * scroll offset every frame by `syncAnchored` — arithmetic only, no layout
     * read and nothing allocated inside the loop.
     */
    const anchored: Array<{ p: Perch; yv: number; x0v: number; x1v: number }> = [];

    /** One Range, reused: reading a first line must not allocate per element. */
    const lineRange = document.createRange();

    /** measureEdge writes here, so harvesting allocates nothing per element. */
    const edge = { x0: 0, x1: 0, y: 0, w: 0, fixed: false };

    /**
     * True when the last pass skipped furniture that had not finished
     * revealing. Those elements are re-measured when their transition ends.
     */
    let perchesPending = false;

    /**
     * '' normally, 'fixed' when the element is anchored to the viewport,
     * 'sticky' when its document position is only true until it sticks.
     * Memoised for the length of one pass, so the walk is shared by siblings.
     */
    const anchorCache = new Map<Element, string>();
    function anchorOf(el: Element): string {
      const hit = anchorCache.get(el);
      if (hit !== undefined) return hit;
      const pos = window.getComputedStyle(el).position;
      let out = '';
      if (pos === 'fixed') out = 'fixed';
      else if (pos === 'sticky') out = 'sticky';
      else {
        const parent = el.parentElement;
        out = parent && parent !== document.body ? anchorOf(parent) : '';
      }
      anchorCache.set(el, out);
      return out;
    }

    /** One `data-perch-*` value in px. See THE PERCH CONTRACT above. */
    function readInset(raw: string | undefined, fontPx: number, basis: number): number {
      if (!raw) return 0;
      const n = parseFloat(raw);
      if (!Number.isFinite(n)) return 0;
      if (raw.indexOf('%') >= 0) return (n / 100) * basis;
      if (raw.indexOf('em') >= 0) return n * fontPx;
      return n;
    }

    /**
     * The 2x2 basis of an element's own transform, or null when it is
     * axis-aligned and the plain rect is already correct. matrix() carries six
     * numbers and matrix3d() sixteen; the 2D basis is the first two columns of
     * either.
     */
    function readTilt(t: string): { a: number; b: number; c: number; d: number } | null {
      if (!t || t === 'none') return null;
      const open = t.indexOf('(');
      if (open < 0) return null;
      const n = t.slice(open + 1, t.lastIndexOf(')')).split(',');
      const a = parseFloat(n[0]);
      const b = parseFloat(n[1]);
      const c = parseFloat(n.length > 6 ? n[4] : n[2]);
      const d = parseFloat(n.length > 6 ? n[5] : n[3]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      if (!Number.isFinite(c) || !Number.isFinite(d)) return null;
      /* pure translation and pure scale need no reconstruction */
      if (Math.abs(b) < 1e-4 && Math.abs(c) < 1e-4) return null;
      return { a, b, c, d };
    }

    /**
     * Writes the VISIBLE top edge of `el` into `edge`, in VIEWPORT space, and
     * returns false when the element cannot be stood on. `declared` is true for
     * elements carrying data-perch; the fallback selector list keeps its old,
     * blunter rules so nothing it harvests today moves.
     */
    function measureEdge(el: Element, declared: boolean): boolean {
      const cs = window.getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;

      /* Mid-entrance, or not revealed at all: the mark is not where it will be
         and the reader cannot see it either. Come back at transitionend.
         Tested BEFORE the width, because a rule revealing itself with
         scaleX(0) has no width yet — that is unrevealed, not unlandable. */
      const alpha = parseFloat(cs.opacity);
      if (Number.isFinite(alpha) && alpha < PERCH_MIN_OPACITY) {
        perchesPending = true;
        return false;
      }

      const r = el.getBoundingClientRect();
      if (r.width < 1) return false;

      const anchor = anchorOf(el);
      if (anchor === 'sticky') return false;

      const he = el as HTMLElement;
      const boxW = he.offsetWidth || r.width;
      const boxH = he.offsetHeight || r.height;
      const fontPx = parseFloat(cs.fontSize) || 16;

      let x0 = r.left;
      let x1 = r.right;
      let y = r.top;

      const m = readTilt(cs.transform);
      if (m) {
        const hw = boxW / 2;
        const hh = boxH / 2;
        /* A parallelogram's axis-aligned bounds are centred on it whatever the
           transform-origin, so the rect still gives us the centre exactly. */
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        const mid = cx - hh * m.c;
        y = cy - hh * m.d;
        const rise = Math.abs(hw * m.b);
        const half =
          Math.abs(hw * m.a) *
          (rise > PERCH_TILT_SLOP ? Math.max(0.35, PERCH_TILT_SLOP / rise) : 1);
        x0 = mid - half;
        x1 = mid + half;
      }

      if (declared && he.dataset.perchText !== undefined) {
        /*
         * The ink of the first line, not the column it happens to be set in.
         *
         * TEXT NODES ONLY. `selectNodeContents` on the element returns a rect
         * for every inline-level BOX as well as for the text, and an
         * inline-block's rect is its margin box rather than its glyphs — so
         * anything that wraps its words in a padded mask, as the kinetic plate
         * titles do, could hand this the padding instead of the ink.
         *
         * MEASURED, AND IT CHANGES NOTHING TODAY. Across all eight plate
         * titles the two methods agree to the pixel, because the mask's
         * padding sits below the baseline and the topmost rect is the text's
         * em box either way. It is kept because it is the correct reading of
         * what `data-perch-text` asks for — stand on the ink — and because the
         * next thing anyone wraps a word in will not be so considerate about
         * where it puts its padding.
         */
        let lx0 = 0;
        let lx1 = 0;
        let ltop = Infinity;
        const take = (n: Node): void => {
          if (n.nodeType === 3) {
            const v = n.nodeValue;
            if (!v || !v.trim()) return;
            lineRange.selectNodeContents(n);
            const rr = lineRange.getClientRects();
            for (let i = 0; i < rr.length; i++) {
              const q = rr[i];
              if (q.width < 1 || q.height < 1) continue;
              if (q.top < ltop - 0.5) {
                ltop = q.top;
                lx0 = q.left;
                lx1 = q.right;
              } else if (q.top < ltop + 0.5) {
                lx0 = Math.min(lx0, q.left);
                lx1 = Math.max(lx1, q.right);
              }
            }
            return;
          }
          if (n.nodeType !== 1) return;
          for (let c = n.firstChild; c; c = c.nextSibling) take(c);
        };
        take(el);
        /* No ink, or less of it than a bird is wide: not landable. Falling
           back to the box here would hand him the whole column beside a short
           eyebrow, which is the exact failure this attribute exists to fix. */
        if (!(lx1 - lx0 >= PERCH_MIN_W)) return false;
        x0 = lx0;
        x1 = lx1;
        /* content top, not the line-box top: engines disagree about the
           latter, and padding and border they do not. The drop from here to
           the ink is then the author's inset. */
        y =
          r.top +
          (parseFloat(cs.borderTopWidth) || 0) +
          (parseFloat(cs.paddingTop) || 0);
      }

      const side = readInset(he.dataset.perchSide, fontPx, boxW);
      if (side) {
        x0 += side;
        x1 -= side;
      }
      y += readInset(he.dataset.perchInset, fontPx, boxH);

      if (x1 - x0 < PERCH_MIN_W) return false;
      if (r.height < (declared ? PERCH_MIN_H : PERCH_MIN_H_LEGACY)) return false;

      edge.w = x1 - x0;
      edge.x0 = x0 + PERCH_SHOULDER;
      edge.x1 = x1 - PERCH_SHOULDER;
      edge.y = y;
      edge.fixed = anchor === 'fixed';
      return true;
    }

    function measure() {
      /*
       * Harvesting converts every VIEWPORT rect it reads into document
       * coordinates, so it needs the scroll offset to be true right now, not
       * as of the last frame. Usually it is — measure runs behind a rAF, in
       * the same batch as the loop — but it can also be reached while the
       * loop is parked (a hidden tab, a resize before the first frame), and a
       * stale offset there would place every perch on the page at the wrong
       * height. It costs one read, on an event that happens a handful of
       * times a session.
       */
      readScroll();
      const found: Perch[] = [];
      const kept = new Set<Element>();
      const visited = new Set<Element>();
      anchorCache.clear();
      anchored.length = 0;
      perchesPending = false;

      const take = (el: Element, declared: boolean) => {
        /* An element named by both the attribute and the fallback list is
           harvested once, under the attribute's treatment. */
        if (visited.has(el)) return;
        visited.add(el);
        if (!measureEdge(el, declared)) return;

        const x0 = edge.x0 + scrollXNow;
        const x1 = edge.x1 + scrollXNow;
        const y = edge.y + scrollYNow;
        let p = byEl.get(el);
        if (p) {
          if (bird.perch === p) {
            /* carry the bird with the furniture rather than under it */
            bird.x += x0 - p.x0;
            bird.y += y - p.y;
          }
          p.x0 = x0;
          p.x1 = x1;
          p.y = y;
          p.w = edge.w;
          p.fixed = edge.fixed;
        } else {
          p = { el, x0, x1, y, w: edge.w, fixed: edge.fixed };
          byEl.set(el, p);
        }
        kept.add(el);
        found.push(p);
        if (edge.fixed) anchored.push({ p, yv: edge.y, x0v: edge.x0, x1v: edge.x1 });
      };

      document.querySelectorAll(PERCH_ATTR).forEach((el) => take(el, true));
      document.querySelectorAll(PERCH_SELECTOR).forEach((el) => take(el, false));

      byEl.forEach((v, k) => {
        if (kept.has(k)) return;
        byEl.delete(k);
        /*
         * The furniture has left the page: a light switch retracting, a
         * section unmounting, a figure swapped out under him. Pruning the map
         * is not enough — `bird.perch` and the plan hold direct references, so
         * without this he goes on standing at its last y with nothing under
         * him. Found on the switch, where he was left hanging at the top of
         * the screen after the cord had gone home.
         *
         * Note this only fires when something re-measures, which is a resize
         * or a transition ending rather than every frame. It is the backstop.
         * The path that actually catches the switch is `letGoOfErrand`.
         */
        abandonPerch(v);
      });
      found.sort((a, b) => a.y - b.y);
      perches = found;
      syncAnchored();
    }

    /**
     * Fixed furniture — the section rail — sits at a SCREEN position, so its
     * document coordinates move with every scroll. Re-derived here from the
     * viewport edge measured last: arithmetic only, no layout read, nothing
     * allocated. Called once a frame from `trackScroll`, and the bird is
     * carried with it exactly as `measure` carries him.
     */
    function syncAnchored() {
      if (!anchored.length) return;
      const sx = scrollXNow;
      const sy = scrollYNow;
      for (let i = 0; i < anchored.length; i++) {
        const a = anchored[i];
        const x0 = a.x0v + sx;
        const y = a.yv + sy;
        if (bird.perch === a.p) {
          bird.x += x0 - a.p.x0;
          bird.y += y - a.p.y;
        }
        a.p.x0 = x0;
        a.p.x1 = a.x1v + sx;
        a.p.y = y;
      }
    }

    /* ---- state -------------------------------------------------------- */
    const bird = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      g: GRAVITY,
      facing: 1 as 1 | -1,
      perch: null as Perch | null,
      mode: 'idle' as Mode,
      modeT: 0,
      anim: 'breathe' as AnimationName,
      animT: 0,
      animLoopUntil: 0,
      /* One clock, accumulated from dt, in ms. Cooldowns, rests and the
         animation head all read from this. Using performance.now() for
         cooldowns while animT advanced on dt made the two disagree, and the
         bird spent almost all its time breathing instead of doing anything. */
      clock: 0,
      restUntil: 0,
      sinceMove: 0,
      settledMs: 0,
      /**
       * How long the PAGE has been quiet, in ms. Not the reader.
       *
       * `settledMs` above is the lawn's measure and it is stricter on purpose:
       * it also requires the pointer to have been still for 2.6s, so any mouse
       * movement inside that window zeroes it. For a reader sitting with a hand
       * on the mouse, which is most readers, it never accumulates at all --
       * which made the set pieces UNREACHABLE rather than rare. That is the
       * same fault the comment on the lawn's gate warns about one step up: an
       * easter egg nobody can trigger has not shipped.
       *
       * A set piece happens TO him while he stands somewhere. What it needs is
       * a page that is not moving under it, and nothing else. So this counts
       * scroll quiet only, it is accumulated OUTSIDE the mode switch so it
       * keeps running while he walks and hops, and a scroll BURNS it at 3x
       * rather than resetting it -- nudging the page should not cost a reader
       * eight seconds of accrued calm.
       */
      calmMs: 0,
      /** How long he has been off the screen, in ms. */
      strandedMs: 0,
      /** How long he has remained in an edge band without a better perch. */
      edgeMs: 0,
      /* continuous drift for locomotion idles — see BUG 1 cause (c) */
      driftVx: 0,
      driftUntil: 0,
      /* walking */
      walkVx: 0,
      walkUntil: 0,
      /* hop flourish held for the whole flight, or null for airUp/apex/down */
      jumpAnim: null as AnimationName | null,
      hopUrgency: 0,
      hopGate: 0,
      /* fly target */
      flyX: 0,
      flyY: 0,
      flySpeed: 620,
      flyPerch: null as Perch | null,
      /* queued interaction after arriving somewhere */
      queuedAct: null as AnimationName | null,
      /* how long the current fall has run, for the glide swap */
      fallMs: 0,
      /* a fall opened by being thrown: hold the tumble until this clock */
      tumbleUntil: 0,
      sleepUntil: 0,
      dreamIdx: 0,
      dreamUntil: 0,
      /**
       * How solid he is, 0..1. Only a set piece ever moves it, and every exit
       * from one puts it back to 1, so nothing else in the rig has to know it
       * exists. Applied once, around the puppet composite.
       */
      alpha: 1
    };

    /* ---- the rig ------------------------------------------------------- */
    /*
     * Everything the compositor adds ON TOP of the sampled pose. Kept in one
     * preallocated object and applied in exactly one place (`applyRig`), so
     * there is never a question of which of two systems moved a limb.
     *
     * None of this touches bird.x or bird.y. The continuity rule at the top
     * of the file is about where he IS; this is about how he is drawn, and
     * every term in it is a continuous function of time with a hard cap, so
     * it cannot produce a jump either.
     */
    const rig = {
      /** 0..1 blend of the flight rig. Eased, so entering flight is smooth. */
      flight: 0,
      /** wingbeat phase, 0..1. 0 is the top of the stroke. */
      flapPhase: 0,
      /** body offset in sprite px, +down. Antiphase to the wing. */
      bob: 0,
      /** forward shear in sprite px. Positive is toward the facing. */
      pitch: 0,
      /** 0..1 blend of the look-up gaze, and which way across it looks. */
      gaze: 0,
      gazeDir: 0,
      /** struggle shake, sprite px, applied to the whole puppet. */
      shakeX: 0,
      shakeY: 0,
      /**
       * WHERE A PECK IS AIMED, as a unit vector in SPRITE space.
       *
       * > "When he pecks you, his head should actually turn up/down if you are
       * > above/below, diagonally if your mouse is there."
       *
       * `aimX` is forward along his facing and `aimY` is down the screen, so
       * (1, 0) is the straight-ahead peck the frames were authored as and
       * nothing changes. Anything else re-points the SAME authored reach at
       * the cursor — see the aim block in applyRig, which rotates the reach
       * rather than adding to it, so a peck upward travels exactly as far as a
       * peck forward does and no pose can be driven off the sprite.
       */
      aim: 0,
      aimX: 1,
      aimY: 0
    };

    /* ---- plan (a chain of waypoints) ---------------------------------- */
    const PLAN: Waypoint[] = [
      { kind: 'perch', x: 0, y: 0, perch: null, side: 0 },
      { kind: 'perch', x: 0, y: 0, perch: null, side: 0 },
      { kind: 'perch', x: 0, y: 0, perch: null, side: 0 },
      { kind: 'perch', x: 0, y: 0, perch: null, side: 0 }
    ];
    let planLen = 0;
    let planIdx = 0;
    function beginPlan() {
      planLen = 0;
      planIdx = 0;
    }
    function pushWp(kind: 'perch' | 'wall', x: number, y: number, perch: Perch | null, side: number) {
      if (planLen >= PLAN.length) return;
      const w = PLAN[planLen];
      w.kind = kind;
      w.x = x;
      w.y = y;
      w.perch = perch;
      w.side = side;
      planLen++;
    }

    /* ---- act queue ----------------------------------------------------- */
    const ACTS: AnimationName[] = ['breathe', 'breathe', 'breathe', 'breathe', 'breathe', 'breathe'];
    let actLen = 0;
    let actIdx = 0;
    function startAct(a: AnimationName, b?: AnimationName, c?: AnimationName, d?: AnimationName) {
      actLen = 0;
      actIdx = 0;
      ACTS[actLen++] = a;
      if (b) ACTS[actLen++] = b;
      if (c) ACTS[actLen++] = c;
      if (d) ACTS[actLen++] = d;
      setMode('act');
      startAnim(ACTS[0]);
    }

    /* ---- transit ------------------------------------------------------- */
    const transit = {
      name: 'upFlap' as AnimationName,
      up: true,
      t: 0,
      /* total time in this transit, which `t` is allowed to rewind */
      held: 0,
      /* 0 for the looping ones: they run until the scroll settles. */
      dur: 0,
      /* ...but never before this, so a looping animation gets to play. */
      minMs: 0,
      sy0: 0,
      sy1: 0,
      props: EMPTY_PROPS
    };

    /* ---- the ride ---------------------------------------------------------
     *
     * A device he is flying WITH, as opposed to a transit he is flying AS.
     *
     * The distinction matters because a transit rides the VIEWPORT and ends
     * when the scroll settles, which is exactly wrong for an errand: an errand
     * has a place to be. So a ride is an ordinary `fly` — same steering, same
     * target, same landing — wearing a transit's animation and props.
     *
     * It lives for precisely one flight. `setMode` puts it away the moment he
     * is anything other than in the air, so there is no path on which he lands
     * still holding a balloon.
     * ---------------------------------------------------------------------- */
    const ride = {
      anim: null as AnimationName | null,
      props: EMPTY_PROPS as readonly PropName[]
    };

    /* ---- pvz ----------------------------------------------------------- */
    /*
     * Assembled from PVZ_SEQUENCE and PVZ_LOOP rather than spelled out, so
     * the rig carries no animation name of its own: the bracketed middle of
     * the sequence repeats once per zombie and the rest plays straight
     * through. Rebuilt in place, so a set piece costs no allocation.
     */
    const PVZ_SCRIPT: AnimationName[] = [];
    function buildPvzScript(waves: number) {
      PVZ_SCRIPT.length = 0;
      const loopAt = PVZ_SEQUENCE.indexOf(PVZ_LOOP[0]);
      const after = loopAt + PVZ_LOOP.length;
      for (let i = 0; i < loopAt; i++) PVZ_SCRIPT.push(PVZ_SEQUENCE[i]);
      for (let w = 0; w < waves; w++)
        for (let i = 0; i < PVZ_LOOP.length; i++) PVZ_SCRIPT.push(PVZ_LOOP[i]);
      for (let i = after; i < PVZ_SEQUENCE.length; i++) PVZ_SCRIPT.push(PVZ_SEQUENCE[i]);
    }
    buildPvzScript(2);
    const pvz = {
      step: 0,
      side: 1 as 1 | -1,
      floorY: 0,
      frameT: 0,
      frame: 0,
      shotFired: false,
      z0Alive: false,
      z0x: 0,
      z1Alive: false,
      z1x: 0,
      peaLive: false,
      peaX: 0,
      peaY: 0,
      splatT: 0,
      splatX: 0,
      splatY: 0,
      gate: 0
    };

    /* ---- set pieces -------------------------------------------------------
     *
     * A BIT is a scripted thing that happens TO him while he is standing
     * still: a creeper drops in and detonates, a DeLorean pulls up. The lawn
     * (pvz) is the one that existed first and it is built the other way round
     * -- a script of HIS animations that the rig walks -- which works because
     * he is the only actor in it. Once there are two actors, and one of them
     * has to keep going after he has stopped, that shape falls over.
     *
     * So a bit is a TIMELINE and nothing else. `t` is milliseconds from the
     * start, every phase is an absolute time on that clock (durations drift
     * against each other the moment anyone edits one), and the tick simply
     * asks where on it we are. Two consequences worth having:
     *
     *   1. It runs OUTSIDE the mode switch. `holds` says whether the bit
     *      currently owns the bird; when the reader interrupts, that goes
     *      false, he is handed straight back to his own behaviour, and the
     *      actors carry on and see themselves out. Which is exactly what was
     *      asked for: "pip carries on but marty (if he's out) gets back in the
     *      car and they get struck by lightning and zoom away."
     *
     *   2. Nothing is stateful except the clock, so a bit cannot get stuck
     *      half way through. There is no step counter to fall off the end of.
     * ---------------------------------------------------------------------- */
    const bit = {
      name: null as BitName | null,
      /** ms since the bit began */
      t: 0,
      /** does the bit own the bird right now */
      holds: false,
      /** the reader interrupted; the actors are seeing themselves out */
      cut: false,
      /** primary actor, document space, bottom centre */
      ax: 0,
      ay: 0,
      /** second actor, same */
      bx: 0,
      by: 0,
      /** which way the set piece arrives from. Behind him, so he turns. */
      side: 1 as 1 | -1,
      /** the line he was standing on when it started */
      floorY: 0,
      /** how far through his own part of the script he is */
      beat: 0,
      /** no bit may start before this */
      gate: 0
    };

    /* ---- speech bubble -------------------------------------------------- */
    const bubbleCanvas = document.createElement('canvas');
    const bubble = {
      text: '',
      until: 0,
      dirty: false,
      w: 0,
      h: 0,
      tailCells: 4,
      /* body size in font cells, so the live tail knows where the underside
         of the box is without measuring the canvas back */
      bodyW: 0,
      bodyH: 0
    };
    const BUBBLE_LINES: string[] = [];

    function say(text: string, ms = 5200) {
      if (!text) return;
      if (bubble.text === text && bubble.until > bird.clock) return;
      bubble.text = text;
      bubble.until = bird.clock + ms;
      bubble.dirty = true;
    }

    function buildBubble() {
      bubble.dirty = false;
      const maxChars = Math.max(
        12,
        Math.min(30, Math.floor((Math.min(W - 28, 360) / FONT_PX - 16) / ADVANCE))
      );
      const n = wrapText(bubble.text, maxChars, BUBBLE_LINES);
      if (!n) {
        bubble.w = 0;
        bubble.h = 0;
        return;
      }
      const contentW = WRAP_WIDEST;
      const contentH = n * LINE_CELLS - 3;
      const padX = 4;
      const padY = 3;
      const bodyW = contentW + padX * 2 + 2;
      const bodyH = contentH + padY * 2 + 2;
      const totalW = bodyW + 1; // +1 cell for the drop shadow
      const totalH = bodyH + 1;

      bubbleCanvas.width = Math.max(1, totalW * FONT_PX);
      bubbleCanvas.height = Math.max(1, totalH * FONT_PX);
      const g = bubbleCanvas.getContext('2d');
      if (!g) return;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, bubbleCanvas.width, bubbleCanvas.height);
      const P = FONT_PX;

      /* drop shadow, one cell down-right, so the bubble sits off the page */
      g.fillStyle = theme.ink3;
      g.globalAlpha = 0.34;
      g.fillRect(P, P, bodyW * P, bodyH * P);
      g.globalAlpha = 1;

      /* body: ink border with the corners notched, paper inside */
      g.fillStyle = theme.ink;
      g.fillRect(0, 0, bodyW * P, bodyH * P);
      g.clearRect(0, 0, P, P);
      g.clearRect((bodyW - 1) * P, 0, P, P);
      g.clearRect(0, (bodyH - 1) * P, P, P);
      g.clearRect((bodyW - 1) * P, (bodyH - 1) * P, P, P);
      g.fillStyle = theme.paper;
      g.fillRect(P, P, (bodyW - 2) * P, (bodyH - 2) * P);

      /* The cartoon tail is deliberately NOT baked in here. The body has to
         be clamped inside the viewport, and a tail baked at a fixed column
         then ends up pointing at empty paper whenever he stands near an edge.
         It is drawn live on the page canvas instead — see drawBubbleTail —
         so it always aims at him. */

      for (let i = 0; i < n; i++) {
        blitText(g, BUBBLE_LINES[i], 1 + padX, 1 + padY + i * LINE_CELLS, P, theme.ink);
      }

      bubble.w = bubbleCanvas.width;
      bubble.h = bubbleCanvas.height;
      bubble.bodyW = bodyW;
      bubble.bodyH = bodyH;
    }

    /**
     * The tail, drawn on the page canvas so it can point at him wherever the
     * body ended up. `dir` is +1 for a bubble above him (the wedge hangs down
     * off the underside) and -1 for one below (it points back up).
     */
    /**
     * @param edge which edge of the body the tail hangs off, which is also
     *   the way it points: 'down' for a bubble sitting above him, 'up' for one
     *   below, 'left' for one to his RIGHT, 'right' for one to his LEFT.
     */
    function drawBubbleTail(
      bx: number,
      by: number,
      sx: number,
      sy: number,
      edge: 'up' | 'down' | 'left' | 'right'
    ) {
      const P = FONT_PX;
      const tail = bubble.tailCells;
      ctx!.save();
      if (edge === 'up' || edge === 'down') {
        /* the TIP is the narrow end, so solve for the tip landing on him */
        const want = Math.round((sx - bx) / P) - tail + 1;
        const tx = Math.max(2, Math.min(Math.max(2, bubble.bodyW - tail - 3), want));
        for (let r = 0; r < tail; r++) {
          const wCells = tail - r + 1;
          const x = bx + (tx + r) * P;
          const y = edge === 'down' ? by + (bubble.bodyH + r) * P : by - (r + 1) * P;
          ctx!.fillStyle = theme.ink;
          ctx!.fillRect(x, y, wCells * P, P);
          if (wCells > 2) {
            ctx!.fillStyle = theme.paper;
            ctx!.fillRect(x, y, (wCells - 2) * P, P);
          }
        }
      } else {
        /* The same wedge turned through ninety degrees: rows become columns
           and the taper runs down the side instead of across the bottom. */
        const want = Math.round((sy - by) / P) - tail + 1;
        const ty = Math.max(2, Math.min(Math.max(2, bubble.bodyH - tail - 3), want));
        for (let r = 0; r < tail; r++) {
          const hCells = tail - r + 1;
          const y = by + (ty + r) * P;
          const x = edge === 'right' ? bx + (bubble.bodyW + r) * P : bx - (r + 1) * P;
          ctx!.fillStyle = theme.ink;
          ctx!.fillRect(x, y, P, hCells * P);
          if (hCells > 2) {
            ctx!.fillStyle = theme.paper;
            ctx!.fillRect(x, y, P, (hCells - 2) * P);
          }
        }
      }
      ctx!.restore();
    }

    /**
     * The props being drawn on the puppet this frame.
     *
     * The three lists were inlined in three places in `draw`; the bubble needs
     * to know the same thing, so they are one function now.
     */
    function activeProps(): readonly PropName[] {
      /* A device outranks the lot: he cannot be in a transit, asleep, or sat
         in a chat while he is hanging off a balloon. */
      if (ride.anim) return ride.props;
      if (bird.mode === 'transit') return transit.props;
      if (bird.mode === 'sleep') return DREAM_BUBBLE_PARTS;
      if (bird.mode === 'chat') {
        const list = CHAT_PROP_MAP[chat.current.perch] ?? EMPTY_PROPS;
        const cyc = cycledProps(chat.current.perch, bird.clock);
        return cyc.length ? list.concat(cyc) : list;
      }
      return EMPTY_PROPS;
    }

    /**
     * Is anything drawn in the space over his head right now?
     *
     * > "when he has an animation with something above his head like an
     * > umbrella, make the speech bubble appear to the side or below him, so
     * > it doesn't block it."
     *
     * DERIVED, not a list of animation names. A prop's `oy` is its offset from
     * the top of the 28-row sprite box, so anything negative is drawn ABOVE the
     * bird — which is exactly and only the set of things that would be covered:
     * the parachute, the umbrella, the balloon and its rope, the UFO and its
     * beam, the rope. A hand-kept list of those would be wrong the first time
     * anyone authors a seventh one.
     *
     * The propeller beanie is the exception the geometry cannot see, because it
     * is a `hat` VARIANT on the puppet rather than a prop, so it has no `oy` of
     * its own. It is named.
     */
    function headBlocked(): boolean {
      const list = activeProps();
      for (let i = 0; i < list.length; i++) {
        if (PROPS[list[i]].oy < 0) return true;
      }
      const hat = POSE.hat;
      return !!hat && (hat.variant === 'propellerA' || hat.variant === 'propellerB');
    }

    /* ---- chat window ---------------------------------------------------- */
    const chatCanvas = document.createElement('canvas');
    const CHAT_LINES: string[] = [];
    /* A sentinel no real draft can equal, so the first frame always builds.
       Written as an escape rather than as a raw control character: a literal
       NUL in the source makes every text tool treat this file as a binary
       blob, which it spent a while doing. */
    const NO_DRAFT = '\u0000';
    const chatUi = {
      dirty: true,
      /* screen-space box, frozen on open and re-clamped on resize */
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      seatX: 0,
      seatY: 0,
      /* glide from wherever he was standing into the seat, never a snap */
      glide: 0,
      fromX: 0,
      fromY: 0,
      lastVersion: -1,
      lastDraft: NO_DRAFT,
      lastBusy: false,
      caretCells: 0,
      openedAt: 0,
      /* last written <input> geometry, so the style is only touched on a
         real change rather than on every frame */
      inX: -1,
      inY: -1,
      inW: -1
    };

    function chatDraft(): string {
      const el = inputRef.current;
      return el ? el.value : '';
    }

    function layoutChat(freeze: boolean) {
      const w = Math.min(340, Math.max(220, W - 24));
      const h = Math.min(214, Math.max(150, H - 150));
      chatUi.w = w;
      chatUi.h = h;
      const sx = bird.x - scrollXNow;
      const sy = bird.y - scrollYNow;
      if (freeze) {
        chatUi.x = Math.max(12, Math.min(W - w - 12, sx - w * 0.5));
        chatUi.y = Math.max(64, Math.min(H - h - 12, sy + 2));
      } else {
        chatUi.x = Math.max(12, Math.min(W - w - 12, chatUi.x));
        chatUi.y = Math.max(64, Math.min(H - h - 12, chatUi.y));
      }
      chatUi.seatX = Math.max(chatUi.x + 30, Math.min(chatUi.x + w - 30, sx));
      chatUi.seatY = chatUi.y;
      chatUi.dirty = true;
      positionInput();
    }

    /*
     * The transparent <input> is parked over the pixel input row.
     *
     * React mounts it one frame AFTER the chat opens, so calling this once
     * from layoutChat() ran against a null ref and the input then sat at 0,0
     * until the next resize: the caret, the text selection and every mobile
     * keyboard anchor appeared in the top-left corner of the page instead of
     * inside the window. It is therefore synced every frame while the chat is
     * open, and only written when a number has genuinely changed.
     */
    function positionInput() {
      const el = inputRef.current;
      if (!el) return;
      const x = Math.round(chatUi.x + 10);
      const y = Math.round(chatUi.y + chatUi.h - 30);
      const w = Math.round(chatUi.w - 20);
      if (x === chatUi.inX && y === chatUi.inY && w === chatUi.inW) return;
      chatUi.inX = x;
      chatUi.inY = y;
      chatUi.inW = w;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.width = `${w}px`;
      el.style.height = '22px';
    }

    function buildChat() {
      chatUi.dirty = false;
      const P = FONT_PX;
      const wCells = Math.floor(chatUi.w / P);
      const hCells = Math.floor(chatUi.h / P);
      chatCanvas.width = Math.max(1, wCells * P);
      chatCanvas.height = Math.max(1, hCells * P);
      const g = chatCanvas.getContext('2d');
      if (!g) return;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, chatCanvas.width, chatCanvas.height);

      /* frame: two-cell ink border, notched corners, paper field */
      g.fillStyle = theme.ink;
      g.fillRect(0, 0, wCells * P, hCells * P);
      g.clearRect(0, 0, P, P);
      g.clearRect((wCells - 1) * P, 0, P, P);
      g.clearRect(0, (hCells - 1) * P, P, P);
      g.clearRect((wCells - 1) * P, (hCells - 1) * P, P, P);
      g.fillStyle = theme.paper;
      g.fillRect(2 * P, 2 * P, (wCells - 4) * P, (hCells - 4) * P);

      /* title rail */
      const title = 'ASK ABOUT JACK';
      blitText(g, title, 4, 4, P, theme.verm);
      blitText(g, 'ESC', wCells - 4 - textCells('ESC'), 4, P, theme.ink3);
      g.fillStyle = theme.ink;
      g.fillRect(3 * P, (4 + GLYPH_H + 3) * P, (wCells - 6) * P, P);

      /* log, newest at the bottom, oldest scrolled off the top */
      const logTop = 4 + GLYPH_H + 7;
      const inputTop = hCells - 4 - GLYPH_H - 4;
      const room = Math.max(1, Math.floor((inputTop - logTop) / LINE_CELLS));
      const maxChars = Math.max(8, Math.floor((wCells - 10) / ADVANCE));

      /* Build the display lines back to front, then draw the tail that fits. */
      const rows: Array<{ text: string; me: boolean }> = [];
      const log = chat.current.log;
      for (let i = log.length - 1; i >= 0 && rows.length < room + 8; i--) {
        const m = log[i];
        const n = wrapText(m.text, maxChars, CHAT_LINES);
        for (let k = n - 1; k >= 0; k--) rows.push({ text: CHAT_LINES[k], me: m.me });
      }
      if (chat.current.busy) rows.unshift({ text: 'thinking', me: false });
      const take = Math.min(room, rows.length);
      for (let i = 0; i < take; i++) {
        const row = rows[take - 1 - i];
        const y = logTop + i * LINE_CELLS;
        if (row.me) {
          const x = wCells - 4 - textCells(row.text);
          blitText(g, row.text, x, y, P, theme.ink);
          g.fillStyle = theme.ink3;
          g.fillRect((x - 2) * P, y * P, P, GLYPH_H * P);
        } else {
          blitText(g, row.text, 6, y, P, theme.ink);
          g.fillStyle = theme.verm;
          g.fillRect(4 * P, y * P, P, GLYPH_H * P);
        }
      }

      /* input rail */
      g.fillStyle = theme.ink;
      g.fillRect(3 * P, (inputTop - 3) * P, (wCells - 6) * P, P);
      const draft = chatDraft();
      const shown = draft.length > maxChars ? draft.slice(draft.length - maxChars) : draft;
      if (shown) {
        blitText(g, shown, 4, inputTop, P, theme.ink);
      } else if (!chat.current.busy) {
        blitText(g, 'type a question', 4, inputTop, P, theme.ink3);
      }
      chatUi.caretCells = 4 + textCells(shown) + (shown ? 1 : 0);
      /* stash where the caret goes, in cells from the box origin */
      (chatUi as any).caretY = inputTop;
    }

    /* ---- pointer -------------------------------------------------------- */
    const pointer = {
      x: -9999,
      y: -9999,
      lastX: -9999,
      lastY: -9999,
      stillMs: 0,
      seen: false,
      /*
       * B2 needs the difference between a small movement and a large one, so
       * the rig has to know how hard the pointer is being thrown about.
       *
       * `jerk` is raw travel in the last frame and is what catches a flick:
       * one frame of 60px is a flick however calm the average was. `speed` is
       * the same signal lowpassed into px/sec and is what catches a sustained
       * haul. Both are computed once per update from the sampled position,
       * never in the move handler — a trackpad can fire pointermove far more
       * often than the frame, and a per-event derivative of that is noise.
       */
      vx: 0,
      vy: 0,
      speed: 0,
      jerk: 0,
      /* Sampled EVERY frame, unlike lastX/lastY which carry a 2px deadband
         for the stillness test. A derivative taken off a deadbanded signal
         reads zero, zero, zero, three — which is a flick that never happened,
         and B2 would throw him off the cursor for it. */
      prevX: -9999,
      prevY: -9999,
      /** Set by the frame that decides whether the real cursor comes back. */
      overUi: false,
      uiCheckAt: 0
    };
    function onMove(e: PointerEvent) {
      /* outside the frame: the cursor is live, so the scroll must be too */
      readScroll();
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.seen = true;
      /*
       * THE SECOND WATCHDOG, and the one that matters most.
       *
       * The interval watchdog is the tidy version, but timers are throttled
       * hard in a backgrounded or otherwise deprioritised tab — measured here
       * at not firing AT ALL across thirteen seconds of a stalled loop, with
       * the swap left on the whole time. A timer is therefore not something
       * the "page has no visible cursor" case may depend on.
       *
       * This is: the reader moving the mouse is the exact moment they need to
       * see a pointer, the event fires in any tab that can receive input at
       * all, and the check is one subtraction. If nothing has painted a
       * cursor for a few frames, they get the real one back immediately.
       */
      if (swap.on && performance.now() - swap.paintedAt > 400) restoreCursor();
      if (drag.pressed) onDragMove();
    }
    function onPointerExit() {
      pointer.seen = false;
      pointer.x = pointer.y = pointer.prevX = pointer.prevY = -9999;
      pointer.speed = pointer.jerk = 0;
      pointer.overUi = false;
      restoreCursor();
    }
    function pointerDocX() {
      return pointer.x + scrollXNow;
    }
    function pointerDocY() {
      return pointer.y + scrollYNow;
    }
    function pointerOnScreen() {
      return pointer.seen && pointer.x > 0 && pointer.x < W && pointer.y > 0 && pointer.y < H;
    }

    /**
     * Is the pointer over something the reader might need to operate?
     *
     * This is the load-bearing safety check for the cursor swap: over a link,
     * a button, a field or anything focusable, the real pointer comes back,
     * so the site's own affordances still read and the page stays usable
     * whatever the bird is doing.
     *
     * Hit-tested rather than inferred from event targets, because the bird
     * canvas covers the viewport and swallows the hover the moment it turns
     * its own pointer-events on. Throttled to ~11 times a second: it forces
     * layout, and no reader crosses a link boundary faster than that.
     */
    function checkOverUi() {
      if (bird.clock - pointer.uiCheckAt < 90) return;
      pointer.uiCheckAt = bird.clock;
      if (!pointer.seen || !pointerOnScreen()) {
        pointer.overUi = false;
        return;
      }
      let el: Element | null = null;
      try {
        el = document.elementFromPoint(pointer.x, pointer.y);
      } catch {
        /* A hit test that throws is a hit test that cannot clear the flag. */
        pointer.overUi = true;
        return;
      }
      if (!el) {
        pointer.overUi = false;
        return;
      }
      /* Our own canvas is not a control, and it is what elementFromPoint
         returns whenever he is being hovered. Look under it. */
      if (el === canvas) {
        canvas!.style.pointerEvents = 'none';
        el = document.elementFromPoint(pointer.x, pointer.y);
        canvas!.style.pointerEvents = peOn ? 'auto' : 'none';
      }
      pointer.overUi = !!el && !!el.closest(INTERACTIVE_SELECTOR);
    }

    /* ---- drag, anger, and the stolen cursor ----------------------------- */
    /*
     * B4: "you should be able to drag him ... he has an anger level and the
     * more you drag him the more he tries to break free and do things like
     * steal your mouse ... the anger level comes down pretty quick though."
     *
     * One number, `anger`, in 0..1, and everything reads from it:
     *   - the struggle animation, which escalates through three bands;
     *   - the shake amplitude, linearly;
     *   - the odds of the escape roll, which fires every ESCAPE_TICK_MS;
     *   - which speech pool the bubble draws from;
     *   - and whether breaking free is merely an escape or a reprisal.
     *
     * It is charged by DISTANCE HAULED rather than by time held, so picking
     * him up and putting him down is forgiven and dragging him round the page
     * is not. And it decays at ANGER_DECAY a second the moment you stop,
     * which is the client's "comes down pretty quick" — about a second and a
     * quarter from furious to placid.
     */
    let anger = 0;
    let angerIdleMs = 0;

    const drag = {
      /** a press has landed on him but has not yet travelled DRAG_SLOP */
      pressed: false,
      /** the press has become a drag */
      active: false,
      /** press origin in screen space, for the slop test and the click test */
      pressX: 0,
      pressY: 0,
      pressAt: 0,
      /** where on his body he was grabbed, document space */
      grabX: 0,
      grabY: 0,
      /** total travel this drag, which is what charges the anger */
      hauled: 0,
      escapeAt: 0,
      /** cycles the struggle animation without re-rolling every frame */
      strugglePick: 0
    };

    /**
     * The cursor swap. `on` is the only thing that hides the system pointer,
     * and it is written in exactly one place, at the end of draw, from
     * evidence that a drawn cursor was actually painted this frame.
     */
    const swap = {
      /** the class is currently on <html> */
      on: false,
      /** injected with the component and removed with it */
      styleEl: null as HTMLStyleElement | null,
      /** wall-clock ms of the last frame that painted a pixel cursor */
      paintedAt: 0,
      /** where the drawn cursor is, screen space */
      cx: 0,
      cy: 0,
      /** 0 free, 1 carried by the bird, 2 being handed back */
      hold: 0,
      /** clock at which he gives it back regardless */
      holdUntil: 0,
      /** true once he has turned round and is flying it home */
      returning: false
    };

    /* ---- helpers -------------------------------------------------------- */
    function startAnim(name: AnimationName, loopMs = 0) {
      bird.anim = name;
      bird.animT = 0;
      bird.animLoopUntil = loopMs;
    }
    function setMode(m: Mode) {
      if (bird.mode === m) return;
      /* A device exists for the length of the flight carrying it and not one
         frame longer. Every exit from `fly` comes through here, so this is the
         only place that has to remember to let go of it. */
      if (m !== 'fly' && ride.anim) {
        ride.anim = null;
        ride.props = EMPTY_PROPS;
      }
      bird.mode = m;
      bird.modeT = 0;
    }
    function currentAnim(): Animation {
      return ANIMATIONS[bird.anim];
    }
    function animDone(): boolean {
      const a = currentAnim();
      const dur = bird.animLoopUntil || animDuration(a);
      return bird.animT >= dur;
    }

    /**
     * Scroll speed measured HERE, in px/sec, rather than taken only from
     * velocityRef. Two reasons: the prop is optional and is smoothed in
     * px/frame for gesture detection, and the comfort band needs a physical
     * rate it can multiply by a flight time. Both are consulted; whichever is
     * larger wins, so a host that supplies velocityRef still drives transits.
     */
    let scrollVel = 0;
    let lastScrollY = 0;
    /** How far the page moved since the last frame. A transit rides this. */
    let scrollDelta = 0;
    function trackScroll(dt: number) {
      const y = scrollYNow;
      scrollDelta = y - lastScrollY;
      const raw = dt > 0 ? scrollDelta / dt : 0;
      lastScrollY = y;
      /* viewport-anchored perches follow the screen, so their document
         coordinates are only true for the scroll offset they were taken at */
      syncAnchored();
      scrollVel += (raw - scrollVel) * Math.min(1, dt * 12);
      if (Math.abs(scrollVel) < 1) scrollVel = 0;
    }

    /** Urgency for a screen y. 0 inside the band, rising the further out. */
    function urgencyAt(sy: number): number {
      const top = H * BAND_MARGIN;
      const bot = H * (1 - BAND_MARGIN);
      if (sy < top) return Math.min(1.4, (top - sy) / Math.max(1, top));
      if (sy > bot) return Math.min(1.4, (sy - bot) / Math.max(1, H - bot));
      return 0;
    }

    /** Where a document point will appear once the current scroll plays out. */
    function projectedScreenY(docY: number, lookahead: number): number {
      return docY - scrollYNow - scrollVel * lookahead;
    }

    /** How comfortable a perch will be by the time he could get there. */
    function perchUrgency(p: Perch): number {
      return urgencyAt(projectedScreenY(p.y, 0.45));
    }

    /**
     * How badly he needs to move, looking half a second AHEAD.
     *
     * Reacting to where he is now is what made him "stay at the top of the
     * screen when you scroll, only coming down when it's too late": by the
     * time a sustained scroll had pushed him out of the band, it had also
     * moved every perch he might aim for. Taking the worse of now and
     * half-a-second-from-now means a steady scroll starts him moving while he
     * is still comfortable, which is what being prompt actually requires.
     */
    function bandUrgency(): number {
      const now = urgencyAt(bird.y - scrollYNow);
      const soon = urgencyAt(projectedScreenY(bird.y, 0.5));
      return Math.max(now, soon);
    }

    /**
     * Anything he could still land on, straight down from here and still on
     * the screen.
     *
     * The corridor is the same one the fall's crossing test uses, and that is
     * the point: this asks the landing question one frame EARLY, so a drop
     * with no ending can be turned into a glide before the reader watches him
     * leave down the bottom of the page.
     *
     * Screen-bounded on purpose. Furniture forty pixels below the fold would
     * technically catch him, but he would still have gone, and "he falls off
     * the screen" is a complaint about what it looks like.
     */
    function catchBelow(x: number, y: number): Perch | null {
      const floor = scrollYNow + H - 8;
      let best: Perch | null = null;
      for (let i = 0; i < perches.length; i++) {
        const q = perches[i];
        if (q.y <= y || q.y > floor) continue;
        if (x < q.x0 - 26 || x > q.x1 + 26) continue;
        if (!best || q.y < best.y) best = q;
      }
      return best;
    }

    function nearestPerch(): Perch | null {
      let best: Perch | null = null;
      let bd = Infinity;
      for (let i = 0; i < perches.length; i++) {
        const p = perches[i];
        const dx = (p.x0 + p.x1) * 0.5 - bird.x;
        const dy = p.y - bird.y;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      return best;
    }

    /**
     * The perch that best answers the comfort band: near the middle of the
     * viewport, not too far sideways, and not the one already underfoot. The
     * randomness shrinks as urgency rises — when he is badly out of position
     * he stops browsing and just goes.
     */
    function pickBandPerch(urgency: number): Perch | null {
      const scrollY = scrollYNow;
      let best: Perch | null = null;
      let bs = -Infinity;
      const jitter = 90 * Math.max(0, 1 - urgency);
      /* LEAD THE TARGET. A hop takes about half a second; during a 500px/s
         scroll every perch on screen travels 250px in that time. Scoring
         perches by where they are now lands him on something that has already
         left the band by the time his feet touch it, and he sets off again
         immediately — which is what the endless catch-up looked like. */
      const lead = 0.45;
      for (let i = 0; i < perches.length; i++) {
        const p = perches[i];
        const sy = projectedScreenY(p.y, lead);
        if (sy < -20 || sy > H + 20) continue;
        let s = -Math.abs(sy - H * 0.52);
        s -= Math.abs((p.x0 + p.x1) * 0.5 - bird.x) * 0.16;
        if (p === bird.perch) s -= 300;
        if (p.w > 200) s += 26;
        s += Math.random() * jitter;
        if (s > bs) {
          bs = s;
          best = p;
        }
      }
      return best ?? nearestPerch();
    }

    /**
     * The perch to come DOWN onto: the one nearly underneath him.
     *
     * > "he should slide down it until he jumps off to a perch location near
     * > underneath him. This should be a similar mechanic with the parachute,
     * > umbrella, etc."
     *
     * `pickBandPerch` scores almost entirely on vertical position — it wants
     * whatever is nearest the middle of the screen — and weights horizontal
     * distance at 0.16. That is right for a bird chasing a scrolling page and
     * completely wrong for one coming down: it sends him diagonally across the
     * whole viewport under a parachute, which is the thing Jack is describing.
     * Nothing falls sideways.
     *
     * So this inverts the weights. Horizontal distance dominates, height only
     * breaks ties, and anything ABOVE him is rejected outright: you cannot
     * descend onto it, and a descent that ends higher than it started reads as
     * the animation having failed.
     *
     * The jitter is scaled the same way as the band picker so an unhurried
     * descent still has some choice in it, but it is a quarter of the width —
     * enough that he does not always take the same perch, not enough to send
     * him across the room.
     */
    function pickDescentPerch(urgency: number): Perch | null {
      const scrollY = scrollYNow;
      const jitter = 24 * Math.max(0, 1 - urgency);
      /**
       * @param below require the perch to be at or under him
       */
      let best: Perch | null = null;
      let bs = -Infinity;
      for (let i = 0; i < perches.length; i++) {
        const p = perches[i];
        const sy = p.y - scrollY;
        if (sy < -20 || sy > H + 20) continue;
        if (p === bird.perch) continue;
        /* Standing ON the perch counts as directly underneath, so the distance
           is to the nearest point of the SPAN, not to its centre. A 1000px
           plate heading should not be penalised for being wide. */
        const dx =
          bird.x < p.x0 ? p.x0 - bird.x : bird.x > p.x1 ? bird.x - p.x1 : 0;
        const dy = p.y - bird.y;
        let s = -dx;
        /*
         * BELOW HIM IS STRONGLY PREFERRED, NOT REQUIRED, and the difference is
         * the whole design of this function.
         *
         * A hard "must be below" rule looks right and measures badly. On the
         * left of the delivery plate there is a stretch where the only things
         * under him are four narrow chips six hundred pixels to the right, and
         * the two full-width headings are a couple of hundred pixels ABOVE.
         * With the hard rule he flew the six hundred sideways — which is the
         * exact behaviour being complained about — rather than hopping up onto
         * the heading directly over his head.
         *
         * So above is allowed, at a price: a flat 60 to break ties in favour
         * of down, and then half a pixel per pixel of climb. Descending is
         * charged at 0.18. A bird that glides down and then hops up onto the
         * line it was heading for reads fine; one that crosses the room does
         * not.
         */
        s -= dy >= -24 ? Math.abs(dy) * 0.18 : 60 + -dy * 0.5;
        if (p.w > 200) s += 18;
        s += Math.random() * jitter;
        if (s > bs) {
          bs = s;
          best = p;
        }
      }
      return best ?? nearestPerch();
    }

    function targetXOn(p: Perch): number {
      const lo = p.x0 + 12;
      const hi = Math.max(lo, p.x1 - 12);
      const wobble = (Math.random() - 0.5) * (hi - lo) * 0.5;
      return Math.max(lo, Math.min(hi, (p.x0 + p.x1) * 0.5 + wobble));
    }

    /**
     * Where to put his feet when he is coming DOWN onto something.
     *
     * `targetXOn` aims at the CENTRE of the span, which is right for a bird
     * choosing a nice spot on a heading and wrong for one descending onto it.
     * It is also the reason picking a perch underneath him was not enough on
     * its own: `pickDescentPerch` would correctly choose the full-width plate
     * heading he was already above, and then this would walk him seven hundred
     * pixels sideways to its middle. Measured over twenty forced descents, the
     * median horizontal move was 291px and the worst was 699 — which is
     * exactly the "halfway across the room" that was being complained about,
     * arriving one function later than anyone was looking.
     *
     * So: land under himself, plus a hand's width of wobble so twenty descents
     * onto the same heading are not twenty identical landings.
     */
    function targetXUnder(p: Perch): number {
      const lo = p.x0 + 12;
      const hi = Math.max(lo, p.x1 - 12);
      const wobble = (Math.random() - 0.5) * 48;
      return Math.max(lo, Math.min(hi, bird.x + wobble));
    }

    /**
     * Build a hop chain to a perch. Big moves get help: an intermediate perch
     * to break the climb into two hops, or a kick off the wall behind him.
     * Both are just extra waypoints; the land handler walks the chain.
     */
    function planTo(p: Perch | null, urgency: number, underneath = false) {
      if (!p) {
        enterFall();
        return;
      }
      const tx = underneath ? targetXUnder(p) : targetXOn(p);
      const dy = p.y - bird.y;
      const dx = tx - bird.x;
      beginPlan();

      if (Math.abs(dy) > 340) {
        /* chain: land on something between, then carry on */
        let mid: Perch | null = null;
        let bd = Infinity;
        const wantY = bird.y + dy * 0.5;
        for (let i = 0; i < perches.length; i++) {
          const q = perches[i];
          if (q === p || q === bird.perch) continue;
          const between = dy > 0 ? q.y > bird.y + 40 && q.y < p.y - 40 : q.y < bird.y - 40 && q.y > p.y + 40;
          if (!between) continue;
          const d = Math.abs(q.y - wantY) + Math.abs((q.x0 + q.x1) * 0.5 - bird.x) * 0.25;
          if (d < bd) {
            bd = d;
            mid = q;
          }
        }
        /*
         * The STEPPING STONE has to obey `underneath` too. This was the last
         * 631px of sideways travel on a descent, and it was hiding one level
         * down: the descent picked a perch under him, and then the chain put
         * an intermediate stop on it using `targetXOn`, which aims at the
         * middle of a span. On the full-width plate heading that is the middle
         * of the page, and he arrived there before the final hop had a say.
         */
        if (mid) pushWp('perch', underneath ? targetXUnder(mid) : targetXOn(mid), mid.y, mid, 0);
      }

      /*
       * `urgency >= 1` is an ERRAND, and an errand does not get to be a coin
       * flip. Without the wall kick one leg reaches about 404px of climb; with
       * it the 28/72 split reaches about 560. The light cord hangs 146px from
       * the top of the screen, so from most of the plate the difference is
       * whether he arrives at all — and leaving that to `Math.random() < 0.7`
       * means the one beat that explains why the room changed colour works on
       * two readings in three and inexplicably does not on the third.
       */
      if (
        !underneath &&
        planLen === 0 &&
        urgency > 0.32 &&
        (Math.abs(dy) > 260 || Math.abs(dx) > W * 0.46) &&
        (urgency >= 1 || Math.random() < 0.7)
      ) {
        /* Wall jump. He goes to the wall BEHIND the direction of travel and
           kicks off it, which is what parkour actually looks like; going to
           the wall he is already heading for would just be a longer hop. */
        const side: 1 | -1 = dx >= 0 ? -1 : 1;
        const wallX = side === 1 ? scrollXNow + W - WALL_INSET : scrollXNow + WALL_INSET;
        const wallY = bird.y + dy * 0.28;
        pushWp('wall', wallX, wallY, null, side);
      }

      pushWp('perch', tx, p.y, p, 0);
      launchTo(PLAN[0], urgency);
    }

    /* ====================================================================
       ERRANDS

       He is on one when `errandPerch` is set. Two things change while he is:

       1. Nothing else may re-plan him. Three separate drives would otherwise
          take him straight back off the target — the band drive, the
          move-house timer, and the post-landing re-check — and all three
          would fire, because the light switch hangs from the TOP EDGE of the
          screen and the top edge is the single worst place he can stand by
          every measure the band uses. Without these gates he touches the cord
          and leaves in the same tenth of a second.

       2. There is a deadline. The caller is waiting on him and a caller
          waiting forever is a page stuck in the wrong colours, so if he has
          not arrived by then the errand is abandoned and the caller is told
          to get on without him.
       ==================================================================== */

    /**
     * Longest he is given to reach a target before the caller gives up.
     *
     * Measured rather than guessed: a flight to the light switch from the
     * far side of the page, including a wall transit on the way, takes about
     * 1250ms of engine time. This is twice that, and it is deliberately
     * SHORTER than PATIENCE_MS in LightSwitch so that the engine — which
     * knows whether he is still in the air — is the thing that decides he is
     * not coming, rather than a caller that cannot see him.
     */
    const ERRAND_DEADLINE = 2600;

    let errandKey = 0;
    let errandPerch: Perch | null = null;
    let errandDeadline = 0;
    let errandArrived = false;
    let errandDepartAt = 0;
    let deliveryPacket: HTMLElement | null = null;
    let deliveryStartX = 0;
    let deliveryStartY = 0;

    function takeDeliveryPacket(p: Perch) {
      deliveryPacket = p.el?.closest<HTMLElement>('[data-mail-packet]') ?? null;
      deliveryStartX = bird.x;
      deliveryStartY = bird.y;
      if (!deliveryPacket) return;
      deliveryPacket.style.setProperty('--mail-carry-x', '0px');
      deliveryPacket.style.setProperty('--mail-carry-y', '0px');
      deliveryPacket.style.setProperty('--mail-carry-opacity', '1');
    }

    function moveDeliveryPacket() {
      if (!deliveryPacket) return;
      deliveryPacket.style.setProperty('--mail-carry-x', (bird.x - deliveryStartX).toFixed(2) + 'px');
      deliveryPacket.style.setProperty('--mail-carry-y', (bird.y - deliveryStartY).toFixed(2) + 'px');
      if (bird.x - scrollXNow > W + 40) deliveryPacket.style.setProperty('--mail-carry-opacity', '0');
    }

    function releaseDeliveryPacket() {
      if (deliveryPacket) deliveryPacket.style.setProperty('--mail-carry-opacity', '0');
      deliveryPacket = null;
    }

    /** True while he is committed to a job and must not be re-planned. */
    function onErrand(): boolean {
      return errandPerch !== null;
    }

    /**
     * Why a `data-perch` element did not become a perch. Dev only.
     *
     * Written after the light switch spent its entire life not working. Its
     * grip was 54px wide against a PERCH_MIN_W of 56, so `measureEdge`
     * rejected it, `byEl.get` returned undefined, and the errand failed on the
     * first frame of every event — after which the cord pulled itself, on
     * time, looking exactly like a working animation. Nothing threw and
     * nothing logged.
     *
     * A caller that asks for a target it cannot have should be TOLD, because
     * the fallback here is deliberately indistinguishable from success.
     */
    function whyNotAPerch(el: Element): string {
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none') return 'display:none';
      if (cs.visibility === 'hidden') return 'visibility:hidden';
      const a = parseFloat(cs.opacity);
      if (Number.isFinite(a) && a < PERCH_MIN_OPACITY)
        return `opacity ${a}, below the ${PERCH_MIN_OPACITY} floor: still arriving`;
      const r = el.getBoundingClientRect();
      if (r.width < PERCH_MIN_W)
        return `${Math.round(r.width)}px wide, and PERCH_MIN_W is ${PERCH_MIN_W}`;
      if (r.height < PERCH_MIN_H)
        return `${Math.round(r.height)}px tall, and PERCH_MIN_H is ${PERCH_MIN_H}`;
      return 'measureEdge rejected it; check data-perch-inset / -side and the transform';
    }

    /**
     * Furniture he is ON, or on his way TO, has stopped being available.
     *
     * Two cases and they are not the same. STANDING on it, he falls off it —
     * which is the whole staging of the light switch: the caller asked for his
     * weight, so the moment it stops wanting him there he drops and the cord
     * recoils past him. HEADING for it, he gives up mid-air and drops, because
     * the alternative is what actually happened in testing: the switch gave up
     * on him while he was still crossing the page, retracted, and he flew the
     * rest of the way and stood on a perch that no longer existed, in the air,
     * at the top of the screen.
     *
     * The plan is cleared as well as the flight. A waypoint list still holding
     * a dead perch would resume on the next landing.
     *
     * Returns true when he was actually let go of.
     */
    function abandonPerch(p: Perch): boolean {
      const standing = bird.perch === p;
      let heading = bird.flyPerch === p;
      for (let i = planIdx; !heading && i < planLen; i++) heading = PLAN[i].perch === p;
      if (!standing && !heading) return false;
      beginPlan();
      bird.flyPerch = null;
      /* Clear the thing he is standing on before gravity can re-catch it.
         See FALL_CLEARANCE. */
      if (standing) bird.y = p.y + FALL_CLEARANCE;
      /* A hop is a live ballistic arc and should carry its velocity into the
         fall. Standing still, and steered flight, both start it from rest. */
      enterFall(!standing && bird.mode === 'hop');
      return true;
    }

    /** The errand is over. Let go of the target if he had any hold on it. */
    function letGoOfErrand(p: Perch | null) {
      if (p) abandonPerch(p);
      /* Released with nothing holding him there, so give him a reason to move
         rather than waiting on the idle scheduler. */
      bird.hopGate = 0;
      bird.sinceMove = 99;
    }

    function endErrand(fail: boolean) {
      const wasRunning = errandPerch !== null && !errandArrived;
      const was = errandPerch;
      errandPerch = null;
      errandArrived = false;
      errandDeadline = 0;
      errandDepartAt = 0;
      letGoOfErrand(was);
      if (fail && wasRunning) onErrandFailRef.current?.();
    }

    /**
     * Take the errand off the hop chain and fly it, when the hop chain cannot
     * have it. Returns true when it took over.
     *
     * The test is REACH, not distance: see CHAIN_REACH. A climb the chain can
     * make is better made by jumping, because he is a bird, and the device is
     * the answer to the one case where jumping is not an answer at all. Going
     * DOWN never scrambles — gravity is already the fastest thing available.
     */
    function scrambleTo(p: Perch): boolean {
      const climb = bird.y - p.y;
      if (climb <= CHAIN_REACH) return false;

      /* Straight up rather than to the middle of the span: the whole point is
         that this is the short way. A little wobble so two scrambles onto the
         same cord are not the same picture twice. */
      const lo = p.x0 + 12;
      const hi = Math.max(lo, p.x1 - 12);
      const tx = Math.max(lo, Math.min(hi, bird.x + (Math.random() - 0.5) * 40));
      const dist = Math.hypot(tx - bird.x, p.y - bird.y);

      const budget = Math.max(0, errandDeadline - bird.clock) * SCRAMBLE_BUDGET;
      const balloonFits = (dist / SCRAMBLE.balloon.speed) * 1000 <= budget;
      const kit = balloonFits && Math.random() < 0.5 ? SCRAMBLE.balloon : SCRAMBLE.jetpack;

      beginPlan();
      enterFly(tx, p.y, p, kit.speed);
      ride.anim = kit.anim;
      ride.props = TRANSIT_PROP_MAP[kit.anim] ?? EMPTY_PROPS;
      startAnim(kit.anim, 0);
      return true;
    }

    function serviceErrand() {
      const e = errandRef.current;
      const key = e ? e.key : 0;

      if (key !== errandKey) {
        errandKey = key;
        /* A new errand, or a release. Either way the old one is over, and it
           is not a failure: the caller is the one who ended it. */
        const was = errandPerch;
        releaseDeliveryPacket();
        errandPerch = null;
        errandArrived = false;
        errandDeadline = 0;
        errandDepartAt = 0;
        if (!e) {
          letGoOfErrand(was);
          return;
        }
        /* Not while he is mid-conversation. Flying off in the middle of
           answering a question to go and operate a light is worse than the
           light changing on its own. */
        if (chat.current.open) {
          onErrandFailRef.current?.();
          return;
        }
        /* The target was almost certainly added to the DOM on the frame
           before this one, so it is not in `byEl` yet. */
        measure();
        const el = document.querySelector(e.selector);
        const p = el ? byEl.get(el) : null;
        if (!p) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `[companion] errand "${e.selector}" refused: ` +
                (el ? `in the DOM but not landable — ${whyNotAPerch(el)}` : 'not in the DOM')
            );
          }
          onErrandFailRef.current?.();
          return;
        }
        /* An errand outranks whatever private performance Pip was in. Use the
           same exits as a normal interruption: cutBit lets independent scenery
           finish without keeping him attached (notably the BTTF car), while
           enterIdle clears a ride/transit and resets his authored pose before
           the route launches. */
        cutBit();
        enterIdle();
        errandPerch = p;
        errandDeadline = bird.clock + ERRAND_DEADLINE;
        onCursor = false;
        if (!scrambleTo(p)) planTo(p, 1);
        return;
      }

      if (errandArrived) {
        if (e?.kind === 'delivery' && errandDepartAt > 0 && bird.clock >= errandDepartAt) {
          const was = errandPerch;
          errandPerch = null;
          errandDepartAt = 0;
          if (bird.perch === was) bird.perch = null;
          enterFly(scrollXNow + W + 150, scrollYNow + H * 0.22, null, 900);
        }
        return;
      }
      if (!errandPerch) return;
      if (bird.clock > errandDeadline) endErrand(true);
    }

    /**
     * Cover the rest of the plan under power rather than by jumping.
     *
     * The chain is spent, not paused: the intermediate stops exist to make a
     * hop chain possible and a flight has no use for them.
     */
    function flyLeg(wp: Waypoint, urgency: number) {
      planIdx = planLen;
      enterFly(wp.x, wp.y, wp.perch, 620 + Math.min(1, urgency) * 460);
    }

    function launchTo(wp: Waypoint, urgency: number) {
      const dx = wp.x - bird.x;
      const dy = wp.y - bird.y;

      /*
       * CAN THIS ARC EVEN GET THERE?
       *
       * See HOP_REACH. A leg asking for a taller climb than one arc can make
       * is not a slow hop, it is a hop that misses, and the old code launched
       * it anyway and let the fall handler pick up the pieces. He flies those
       * instead — and flies to the END of the plan, because a wall kick or a
       * stepping stone is scaffolding for jumping, not for flying.
       *
       * The 10px is the landing test's own tolerance. An arc whose apex is
       * level with its target does not land on it.
       */
      if (-dy > hopReach(urgency) - 10 && planLen > 0) {
        flyLeg(PLAN[planLen - 1], urgency);
        return;
      }

      /* Urgency buys speed by raising the local gravity: the arc gets tighter
         and the whole flight gets shorter, which reads as hurrying. Capped at
         2x — beyond that the launch velocity passes 2000px/s and he crosses
         the viewport inside four frames, which does not read as a hurrying
         bird so much as a missing one. */
      const g = GRAVITY * (1 + Math.min(1, urgency));
      let rise = Math.max(50, Math.abs(dx) * 0.3, -dy + 44);
      rise = Math.min(rise, hopReach(urgency));
      let vUp = Math.sqrt(2 * g * rise);
      let tUp = vUp / g;
      let tDown = Math.sqrt(Math.max((2 * (rise + dy)) / g, 1e-4));
      let total = Math.max(tUp + tDown, 0.09);

      /* A long sideways hop solved for a short flight gives a horizontal
         speed of several thousand px/s, which is a streak rather than a bird.
         Buy the time back by throwing him higher instead of faster: rise goes
         roughly as total^2, so one correction pass lands close enough. */
      const MAX_VX = 1500;
      if (Math.abs(dx) / total > MAX_VX) {
        const wantTotal = Math.abs(dx) / MAX_VX;
        rise = Math.max(rise, (g * wantTotal * wantTotal) / 8);
        vUp = Math.sqrt(2 * g * rise);
        tUp = vUp / g;
        tDown = Math.sqrt(Math.max((2 * (rise + dy)) / g, 1e-4));
        total = Math.max(tUp + tDown, 0.09);
      }
      bird.vx = dx / total;
      bird.vy = -vUp;
      bird.g = g;
      if (Math.abs(dx) > 6) bird.facing = dx >= 0 ? 1 : -1;
      bird.perch = null;
      bird.hopUrgency = urgency;
      setMode('hop');

      /* JUMP FLARE: sometimes the hop is a somersault instead of a hop. */
      const short = total < 0.62 && Math.abs(dy) < 130;
      if (short && wp.kind === 'perch' && Math.random() < 0.26) {
        bird.jumpAnim = rollJump(true);
        startAnim(bird.jumpAnim);
      } else {
        bird.jumpAnim = null;
        startAnim('launch');
      }
    }

    /** Arrive. `back` rewinds the sub-frame overshoot so nothing snaps. */
    function land(p: Perch | null, ty: number, back: number) {
      if (back > 0) bird.x -= bird.vx * back;
      bird.y = ty;
      bird.vx = 0;
      bird.vy = 0;
      bird.g = GRAVITY;
      bird.jumpAnim = null;
      bird.perch = p;
      /*
       * BUG 1. This used to clamp bird.x into the perch's span on the spot.
       * The fall test accepts a touchdown up to 26px past either end of the
       * furniture, so that one line could move him 34px sideways on the very
       * frame he landed — a sideways snap at the exact moment the reader is
       * watching him arrive. He now walks the last few pixels on, over the
       * following frames, through holdPerch().
       */
      setMode('land');
      startAnim('land');

      /* The one thing the errand machine needs out of the physics. Fired from
         here rather than from the plan-complete branch because a plan can be
         cut short by a re-measure or a fall, and what the caller actually
         asked was "is he standing on it", not "did the plan finish". */
      if (p !== null && p === errandPerch && !errandArrived) {
        errandArrived = true;
        const task = errandRef.current;
        if (task?.kind === 'delivery') {
          takeDeliveryPacket(p);
          say(task.line || "I'll get it to him.", 3000);
          errandDepartAt = bird.clock + 320;
        }
        onErrandArriveRef.current?.();
      }
    }

    /**
     * Keep him honestly on the furniture, at a bounded speed. Everything that
     * used to assign `bird.y = perch.y` or clamp `bird.x` into the span calls
     * this instead, so re-measured furniture, a touchdown a little off the
     * end and a chased cursor perch all resolve as movement, not as a cut.
     */
    function holdPerch(dt: number) {
      const p = bird.perch;
      if (!p) return;
      bird.y = approach(bird.y, p.y, dt, 1400);
      const lo = p.x0 + 8;
      const hi = Math.max(lo, p.x1 - 8);
      if (bird.x < lo) bird.x = approach(bird.x, lo, dt);
      else if (bird.x > hi) bird.x = approach(bird.x, hi, dt);
    }

    function enterIdle() {
      setMode('idle');
      bird.driftVx = 0;
      bird.driftUntil = 0;
      startAnim('breathe', 300 + Math.random() * 260);
    }

    /**
     * BUG 2. `enterFall` used to leave bird.vy exactly as it found it. Called
     * out of a transit — which never touches vy — he inherited the launch
     * velocity of whatever hop the transit interrupted, so a fall could open
     * by rocketing several hundred pixels UPWARD before gravity won it back.
     * Falls now begin from rest unless the caller is a hop, which genuinely
     * is handing over a live arc.
     */
    function enterFall(keepVel = false) {
      bird.perch = null;
      bird.jumpAnim = null;
      if (!keepVel) {
        bird.vx = 0;
        bird.vy = 0;
      }
      bird.g = GRAVITY;
      bird.fallMs = 0;
      /* Callers that want a tumble set this AFTER calling in; an ordinary
         fall must never inherit one from the fall before it. */
      bird.tumbleUntil = 0;
      setMode('fall');
      startAnim('airDown');
    }

    function enterFly(tx: number, ty: number, p: Perch | null, speed = 620) {
      bird.perch = null;
      bird.jumpAnim = null;
      bird.vx = 0;
      bird.vy = 0;
      bird.flyX = tx;
      bird.flyY = ty;
      bird.flyPerch = p;
      bird.flySpeed = speed;
      /* Open the wingbeat at the TOP of the stroke, so flight begins with a
         powered downstroke rather than wherever the previous one left off. */
      rig.flapPhase = 0;
      setMode('fly');
      startAnim('flyFlap');
    }

    /* ---- drag -------------------------------------------------------------
     *
     * A press on him is ambiguous until it moves: it is a click that opens the
     * chat, or it is a grab. The chat toggle therefore waits for pointerup —
     * which is also what fixes the ambiguity honestly, rather than by guessing
     * from a timer.
     * ---------------------------------------------------------------------- */

    function angerSay(ms = 2400) {
      say(pickLine(angerPool(anger)), ms);
    }

    function beginDrag() {
      if (reduced) return;
      /* Being picked up outranks any set piece running around him. */
      cutBit();
      drag.active = true;
      drag.hauled = 0;
      drag.escapeAt = bird.clock + ESCAPE_TICK_MS;
      drag.strugglePick = 0;
      onCursor = false;
      bird.perch = null;
      bird.jumpAnim = null;
      bird.vx = 0;
      bird.vy = 0;
      if (chat.current.open) closeChat();
      setMode('drag');
      startAnim('flutter', 0);
      angerSay(2200);
    }

    /** Which struggle plays. Three bands, escalating, cycled not re-rolled. */
    function struggleAnim(): AnimationName {
      if (anger > 0.66) return drag.strugglePick % 2 === 0 ? 'jumpTwist' : 'shiver';
      if (anger > 0.33) return drag.strugglePick % 2 === 0 ? 'flutter' : 'headShake';
      return drag.strugglePick % 3 === 2 ? 'headShake' : 'flutter';
    }

    /**
     * Break free. He is thrown clear of the pointer along the line away from
     * it, with an upward bias so it reads as a wrench rather than a drop, and
     * the live velocity is handed straight to the fall — which is the same
     * continuity contract a timed-out hop uses.
     */
    function escapeDrag() {
      const px = pointerDocX();
      const py = pointerDocY();
      let dx = bird.x - px;
      let dy = bird.y - py;
      const d = Math.hypot(dx, dy);
      if (d < 1) {
        dx = bird.facing;
        dy = -0.6;
      } else {
        dx /= d;
        dy /= d;
      }
      const speed = 380 + anger * 620;
      drag.active = false;
      drag.pressed = false;
      bird.vx = dx * speed;
      bird.vy = Math.min(dy * speed, -220) - anger * 180;
      bird.facing = (dx >= 0 ? 1 : -1) as 1 | -1;
      enterFall(true);
      /* A tumble, not a stumble: hold the somersault for long enough to read
         before the fall's own glide logic takes the animation back. */
      bird.tumbleUntil = bird.clock + 460 + anger * 220;
      startAnim(dx >= 0 ? 'jumpFlipFront' : 'jumpFlipBack');
      const retaliate = anger >= RETALIATE_ANGER;
      if (retaliate) stealCursor(false);
      else say(pickLine(LINE_ESCAPE), 2400);
    }

    /** Let go of him. Not an escape: no tumble, no reprisal, just indignation. */
    function releaseDrag() {
      if (!drag.active) return;
      drag.active = false;
      drag.pressed = false;
      const p = pickBandPerch(0.6);
      if (p) enterFly(targetXOn(p), p.y, p, 700);
      else enterFall();
      if (anger > 0.4) angerSay(2200);
    }

    /* ---- the reprisal ------------------------------------------------------
     *
     * He takes the drawn cursor and flies off with it. Bounded three ways: a
     * hard time limit, a click, and the pointer reaching anything the reader
     * might actually need to operate. See `cursorWanted` — the real pointer
     * comes back the instant any of those is true, whatever the bird is doing.
     * ---------------------------------------------------------------------- */
    /** Somewhere else on screen, away from where the reader's hand is. */
    function theftAwayX(): number {
      return scrollXNow + (pointer.x < W * 0.5 ? W * 0.78 : W * 0.22);
    }
    function theftAwayY(): number {
      return scrollYNow + H * (0.22 + Math.random() * 0.34);
    }

    /**
     * @param flyNow false when the caller has just handed him a live arc it
     *   wants to keep — escapeDrag throws him into a tumble, and flying off
     *   on the same frame would replace the tumble with a flap and lose the
     *   whole read of "wrenched free, THEN swooped". The fall's own recovery
     *   picks the flight up when the tumble is done.
     */
    function stealCursor(flyNow = true) {
      if (reduced || swap.hold !== 0) return;
      swap.hold = 1;
      swap.returning = false;
      swap.holdUntil = bird.clock + THEFT_MS;
      say(pickLine(LINE_RETALIATE), 2600);
      if (flyNow) enterFly(theftAwayX(), theftAwayY(), null, 880);
    }

    function dropCursor(handBack: boolean) {
      if (swap.hold === 0) return;
      swap.hold = 0;
      swap.returning = false;
      if (handBack) say(pickLine(LINE_RETURN), 2200);
    }

    /* ---- idle scheduling ------------------------------------------------ */
    const lastPlayed = new Map<AnimationName, number>();
    const recent: AnimationName[] = [];
    /* preallocated: the picker runs on every idle change, not every frame,
       but there is no reason for it to churn arrays either. */
    const POOL: typeof IDLE_TABLE[number][] = [];

    function chooseIdle(now: number) {
      /* There are 22 stationary idles against 9 locomotion ones, so at any
         instant most of the locomotion pool is sitting on cooldown and the
         picker has little to choose from but stillness. Shortening the
         locomotion cooldowns keeps enough of them eligible for the bird to
         actually move about as often as it sits, which is the brief. */
      const LOCOMOTION_COOLDOWN_SCALE = 0.86;
      POOL.length = 0;
      for (let i = 0; i < IDLE_TABLE.length; i++) {
        const e = IDLE_TABLE[i];
        const last = lastPlayed.get(e.name) ?? -Infinity;
        const cd = e.group === 'locomotion' ? e.cooldownMs * LOCOMOTION_COOLDOWN_SCALE : e.cooldownMs;
        if (now - last < cd) continue;
        const gap = recent.indexOf(e.name);
        const minGap = e.group === 'locomotion' ? Math.min(e.minGap, 3) : e.minGap;
        if (gap !== -1 && recent.length - gap <= minGap) continue;
        POOL.push(e);
      }
      if (!POOL.length) for (let i = 0; i < IDLE_TABLE.length; i++) POOL.push(IDLE_TABLE[i]);

      /* Weights stay as authored: IDLE_TABLE already balances the two groups
         at 99 each. The only correction needed is to eligibility, above. */
      let total = 0;
      for (let i = 0; i < POOL.length; i++) total += POOL[i].weight;
      let r = Math.random() * total;
      let pick = POOL[0];
      for (let i = 0; i < POOL.length; i++) {
        r -= POOL[i].weight;
        if (r <= 0) {
          pick = POOL[i];
          break;
        }
      }
      lastPlayed.set(pick.name, now);
      recent.push(pick.name);
      if (recent.length > 8) recent.shift();

      if (pick.name === 'sleep') {
        setMode('sleep');
        bird.sleepUntil = bird.clock + 9600 + Math.random() * 7000;
        bird.dreamIdx = (Math.random() * DREAM_ITEMS.length) | 0;
        bird.dreamUntil = bird.clock + 3000 + Math.random() * 1000;
        startAnim('sleep', 0);
        return pick;
      }

      if (pick.name === 'walkCycle') {
        /* WALKING: real translation at the animation's own pace, and
           sometimes one of the two added walks instead of the original. */
        startWalk(WALKS[(Math.random() * WALKS.length) | 0]);
        return pick;
      }

      if (pick.group === 'locomotion') {
        /* JUMP FLARE on ordinary hops. */
        let name: AnimationName = pick.name;
        if ((name === 'hopInPlace' || name === 'hopForward') && Math.random() < 0.28) {
          name = rollJump(true);
        }
        const loopMs = (IDLE_LOOP_MS as Record<string, number>)[name] ?? 0;
        startAnim(name, loopMs);
        /*
         * BUG 1, cause (c): this used to be `bird.x = bird.x + dist * dir`,
         * a single assignment that teleported the bird up to 74px sideways
         * between two frames. Now the same distance is spread as a velocity
         * across the animation's own duration, so a sidestep is a sidestep.
         */
        const dist = 16 + Math.random() * 40;
        const dir: 1 | -1 = name === 'hopBackward' ? (-bird.facing as 1 | -1) : Math.random() < 0.5 ? -1 : 1;
        if (name !== 'hopInPlace' && name !== 'turnAround' && name !== 'pivot') {
          if (name !== 'hopBackward') bird.facing = dir;
          const ms = bird.animLoopUntil || animDuration(ANIMATIONS[name]);
          bird.driftVx = (dist * dir) / (ms / 1000);
          bird.driftUntil = bird.clock + ms;
        }
        return pick;
      }

      const loopMs = (IDLE_LOOP_MS as Record<string, number>)[pick.name] ?? 0;
      startAnim(pick.name, loopMs);
      return pick;
    }

    function startWalk(name: AnimationName) {
      const cycle = animDuration(ANIMATIONS[name]);
      if (cycle <= 0) {
        enterIdle();
        return;
      }
      const cycles = 1 + ((Math.random() * 3) | 0);
      /* One body width per full cycle, and BACKWARD for the moonwalk — the
         disagreement between the feet and the direction is the whole trick. */
      const dir: 1 | -1 = name === 'moonwalk' ? -1 : Math.random() < 0.5 ? -1 : 1;
      if (name !== 'moonwalk') bird.facing = dir;
      bird.walkVx = (BODY_PX / (cycle / 1000)) * (name === 'moonwalk' ? -bird.facing : dir);
      bird.walkUntil = bird.clock + cycle * cycles;
      setMode('walk');
      startAnim(name, cycle * cycles);
    }

    /* ---- interactions --------------------------------------------------- */
    const gate = {
      edgePeck: 0,
      cursorPerch: 0,
      airPeck: 0,
      lookUp: 0,
      perchFlick: 0,
      greet: 0,
      recoil: 0,
      chatter: 12000
    };
    let onCursor = false;
    /** When he intends to stop riding the cursor of his own accord. */
    let cursorPerchUntil = 0;

    /**
     * B3: "when the cursor is above him he should look upwards and jump and
     * peck at the cursor sometimes."
     *
     * The jump and the peck were already here; the LOOK UP was not, which is
     * the note. It is two things, deliberately:
     *
     *   - a CONTINUOUS gaze, driven every frame from this predicate into
     *     rig.gaze, so his head is genuinely tilted at the pointer whenever
     *     the pointer is over him, for as long as it is there. That is what
     *     "looks upwards" means as a state.
     *   - and the discrete `lookUp` animation, which now also opens the jump
     *     sequence — he looks up, THEN jumps, which is both the order the
     *     client described and the order that reads as intent rather than as
     *     a bird being startled by the ceiling.
     */
    function cursorIsAbove(px: number, py: number): boolean {
      return py < bird.y - 24 && py > bird.y - 300 && Math.abs(px - bird.x) < 170;
    }

    function tryMouseInteractions(dt: number) {
      if (chat.current.open || reduced) return;
      if (!pointerOnScreen()) return;
      const px = pointerDocX();
      const py = pointerDocY();

      /* (c0) cursor above him → look up at it. Cheap, frequent, and the
         thing that was missing: he does this on its own, not only as the
         opening beat of a jump. */
      if (
        cursorIsAbove(px, py) &&
        bird.mode === 'idle' &&
        bird.clock > gate.lookUp &&
        pointer.stillMs > 240
      ) {
        gate.lookUp = bird.clock + 4200 + Math.random() * 2600;
        bird.facing = (px >= bird.x ? 1 : -1) as 1 | -1;
        /* Sometimes it stays a look. Sometimes it becomes the jump — "jump
           and peck at the cursor SOMETIMES" is the brief, and the peck has
           its own longer cooldown so it cannot become the default. */
        if (
          bird.clock > gate.airPeck &&
          Math.abs(px - bird.x) < 62 &&
          py > bird.y - 190 &&
          Math.random() < 0.55
        ) {
          gate.airPeck = bird.clock + 8200;
          if (Math.random() < 0.5)
            startAct('lookUp', 'jumpHigh', 'peckAtCursor', 'peckAtCursor');
          else startAct('lookUp', 'jumpHigh', 'peckAtCursor');
        } else {
          startAct('lookUp');
        }
        return;
      }

      /* (a) cursor resting on an edge he can stand on → hop over and peck it */
      if (bird.clock > gate.edgePeck && pointer.stillMs > 900) {
        for (let i = 0; i < perches.length; i++) {
          const p = perches[i];
          if (py > p.y - 2 || py < p.y - 36) continue;
          if (px < p.x0 || px > p.x1) continue;
          if (p === bird.perch && Math.abs(px - bird.x) < 46) continue;
          gate.edgePeck = bird.clock + 11000;
          beginPlan();
          pushWp('perch', Math.max(p.x0 + 8, Math.min(p.x1 - 8, px)), p.y, p, 0);
          bird.queuedAct = 'peckAtCursor';
          launchTo(PLAN[0], 0.4);
          return;
        }
      }

      /*
       * (b) cursor still for a long time → he goes and lands on it.
       *
       * Jack: "Make him not perch on your mouse as often." It used to need
       * 4.5s of stillness on a 22s cooldown, which on a page you read slowly
       * is most of the time — the cursor sits while you read a paragraph, and
       * he was on it again before you had finished the next one. It became his
       * default behaviour rather than a surprise.
       *
       * Three changes, and they do different jobs. 9s of stillness means he
       * only comes when you have genuinely stopped, rather than while you are
       * reading. 80s of cooldown makes it a visit rather than a habit. And the
       * coin flip stops it being metronomic: without it, "he lands on the
       * cursor every 80 seconds" is a rule a reader works out, and a companion
       * whose rules you can recite is furniture. A refusal costs only 25s, so
       * declining does not put him away for another full cooldown.
       */
      if (
        bird.clock > gate.cursorPerch &&
        pointer.stillMs > 9000 &&
        !onCursor &&
        Math.hypot(px - bird.x, py - bird.y) > 60
      ) {
        if (Math.random() < 0.55) {
          gate.cursorPerch = bird.clock + 80000;
          perchOnPointer();
        } else {
          gate.cursorPerch = bird.clock + 25000;
        }
      }

      void dt;
    }

    /** Set the synthetic perch under the pointer and fly to it. */
    function perchOnPointer() {
      const px = pointerDocX();
      const py = pointerDocY();
      cursorPerch.x0 = px - 14;
      cursorPerch.x1 = px + 14;
      cursorPerch.y = py;
      onCursor = true;
      cursorPerchUntil = bird.clock + PERCH_STAY_MIN_MS + Math.random() * PERCH_STAY_JITTER_MS;
      say(pickLine(LINE_CURSOR_PERCH), 3600);
      enterFly(px, py, cursorPerch, 700);
    }

    /**
     * B2: "small movements can keep him on (until he decides to leave) but
     * large movements will shake him off with an appropriate animation."
     *
     * Three outcomes, and which one you get is a property of how hard you
     * move, not of how long he has been there:
     *
     *   RIDE   — under PERCH_RIDE_SPEED the perch simply chases the pointer at
     *            a capped speed and he compensates: the rig leans him against
     *            the direction of travel, and above a gentler threshold he
     *            throws in a wing flick to keep his footing. Nothing ends.
     *   BUCK   — past PERCH_BUCK_SPEED sustained, or PERCH_BUCK_JERK in a
     *            single frame, he is thrown clear: a real tumble with a spin,
     *            handed to the fall with live velocity, then a recovery flap.
     *   LEAVE  — and if you do neither he gets bored and goes, which is the
     *            "until he decides to leave" half of the note.
     */
    function trackCursorPerch(dt: number) {
      if (!onCursor) return;
      if (bird.mode === 'drag' || chat.current.open) {
        onCursor = false;
        return;
      }
      const px = pointerDocX();
      const py = pointerDocY();
      const dx = px - (cursorPerch.x0 + 14);
      const dy = py - cursorPerch.y;
      const d = Math.hypot(dx, dy);
      /* The chase speeds up when the pointer is running away, so a brisk but
         survivable movement does not simply outrun the perch and strand him.
         Still capped: following exactly would hand a teleport straight in. */
      const chase = 640 + Math.min(1400, pointer.speed * 0.9);
      const step = Math.min(d, chase * dt);
      if (d > 0.01) {
        const nx = cursorPerch.x0 + 14 + (dx / d) * step;
        const ny = cursorPerch.y + (dy / d) * step;
        if (bird.perch === cursorPerch) {
          bird.x += nx - (cursorPerch.x0 + 14);
        }
        cursorPerch.x0 = nx - 14;
        cursorPerch.x1 = nx + 14;
        cursorPerch.y = ny;
      }

      const riding = bird.perch === cursorPerch;
      const heading = bird.mode === 'fly' && bird.flyPerch === cursorPerch;
      if (!riding && !heading) {
        /*
         * Something else took him off it — a comfort-band hop, a peck at a
         * heading, a transit. `onCursor` is the flag that says the synthetic
         * perch is in use, and if it does not follow him off, the perch never
         * releases: the leave timer below is gated on riding and would never
         * fire, and he could never be sent to the cursor again for the rest
         * of the session. Measured: he could sit "on the cursor" while
         * standing on a heading, indefinitely.
         */
        onCursor = false;
        return;
      }

      /* BUCK. Only once he is actually on it — being shaken off a perch you
         have not reached yet is not a thing that can happen. */
      if (riding && (pointer.speed > PERCH_BUCK_SPEED || pointer.jerk > PERCH_BUCK_JERK)) {
        buckOff();
        return;
      }

      /* RIDE. A wing flick to keep his footing, gated so it reads as a
         correction rather than as flapping. */
      if (
        riding &&
        pointer.speed > PERCH_RIDE_SPEED &&
        bird.clock > gate.perchFlick &&
        (bird.mode === 'idle' || bird.mode === 'land')
      ) {
        gate.perchFlick = bird.clock + 900;
        startAct(Math.random() < 0.6 ? 'flutter' : 'stretchWing');
      }

      /* LEAVE. His decision, on his own clock. */
      if (!pointerOnScreen()) {
        leaveCursor(false);
        return;
      }
      if (riding && bird.clock > cursorPerchUntil) leaveCursor(true);
    }

    /** He steps off the cursor on purpose and finds real furniture. */
    function leaveCursor(sayIt: boolean) {
      if (!onCursor) return;
      onCursor = false;
      if (bird.perch !== cursorPerch) return;
      if (sayIt) say(pickLine(LINE_CURSOR_LEAVE), 2600);
      planTo(pickBandPerch(0.5), 0.5);
    }

    /**
     * Thrown off. The throw carries the pointer's own velocity, capped, so he
     * goes the way the hand went — and then tumbles, because being flung off
     * something is not a controlled dismount.
     */
    function buckOff() {
      onCursor = false;
      bird.perch = null;
      bird.jumpAnim = null;
      const vx = Math.max(-900, Math.min(900, pointer.vx * 0.45));
      bird.vx = vx;
      bird.vy = -180 - Math.min(340, pointer.speed * 0.08);
      bird.facing = (vx >= 0 ? 1 : -1) as 1 | -1;
      enterFall(true);
      bird.tumbleUntil = bird.clock + 520;
      startAnim(vx >= 0 ? 'jumpFlipFront' : 'jumpFlipBack');
      say(pickLine(LINE_SHAKEN), 2400);
    }

    /* ---- hover / click --------------------------------------------------- */
    function hitTest(cx: number, cy: number) {
      const sx = bird.x - scrollXNow;
      const sy = bird.y - scrollYNow;
      const halfW = (SPRITE_WIDTH * PIXEL_SCALE) / 2;
      const hgt = SPRITE_HEIGHT * PIXEL_SCALE;
      return cx > sx - halfW && cx < sx + halfW && cy > sy - hgt && cy < sy + 12;
    }
    function inChatBox(cx: number, cy: number) {
      return (
        chat.current.open &&
        cx >= chatUi.x &&
        cx <= chatUi.x + chatUi.w &&
        cy >= chatUi.y &&
        cy <= chatUi.y + chatUi.h
      );
    }

    let hovering = false;
    /* Cached, because writing the same inline style every frame is a style
       recalculation every frame for no change at all. */
    let peOn = false;
    let peCursorVal = '';
    function onHoverCheck() {
      const h = hitTest(pointer.x, pointer.y);
      if (h !== hovering) {
        hovering = h;
        if (h && !reduced && !chat.current.open) {
          if (bird.mode === 'sleep') {
            /* SLEEP STARTLE. startledAwake opens on the exact terminal pose
               of `sleep`, so cutting straight in is invisible — no transition
               animation, no settle, just the cut. */
            setMode('act');
            actLen = 1;
            actIdx = 0;
            ACTS[0] = 'startledAwake';
            startAnim('startledAwake');
            say(pickLine(LINE_STARTLE), 3200);
          } else if (bird.mode === 'idle' && bird.clock > gate.greet) {
            gate.greet = bird.clock + 6500;
            const r = Math.random();
            startAct(r < 0.4 ? 'greetBow' : r < 0.72 ? 'headShake' : 'showOff');
          }
        }
      }
      const wantEvents = h || inChatBox(pointer.x, pointer.y);
      if (wantEvents !== peOn) {
        peOn = wantEvents;
        canvas!.style.pointerEvents = wantEvents ? 'auto' : 'none';
      }
      /* The canvas sets its own cursor when he is hoverable, and an inline
         style on the element beats an inherited one on <html> — so while the
         swap is in force it has to name `none` itself or the real pointer
         reappears over the bird and there are two of them. */
      const want = swap.on ? 'none' : h ? 'pointer' : '';
      if (want !== peCursorVal) {
        peCursorVal = want;
        canvas!.style.cursor = want;
      }
    }

    function openChat() {
      if (chat.current.open) return;
      cutBit();
      chat.current.open = true;
      chat.current.perch = CHAT_PERCHES[(Math.random() * CHAT_PERCHES.length) | 0];
      chat.current.version++;
      chatUi.openedAt = bird.clock;
      chatUi.lastVersion = -1;
      chatUi.inX = -1;
      chatUi.glide = 0;
      chatUi.fromX = bird.x - scrollXNow;
      chatUi.fromY = bird.y - scrollYNow;
      layoutChat(true);
      bubble.until = 0;
      setMode('chat');
      startAnim(chat.current.perch, 0);
      setChatting(true);
    }

    function onDown(e: PointerEvent) {
      /* outside the frame: the cursor is live, so the scroll must be too */
      readScroll();
      /* Any click at all hands the cursor back. He is annoying, not a denial
         of service: the moment the reader tries to USE the pointer they get
         it, wherever the bird had got to with it. */
      if (swap.hold !== 0) dropCursor(false);

      if (hitTest(e.clientX, e.clientY)) {
        e.preventDefault();
        /*
         * A press on him is not yet a click. It becomes a chat toggle on
         * pointerup if it never travelled, and a drag the moment it does —
         * which is the only way to tell the two apart without a timer that
         * guesses. A1 stays fixed either way: nothing moves on open.
         */
        drag.pressed = true;
        drag.active = false;
        drag.pressX = e.clientX;
        drag.pressY = e.clientY;
        drag.pressAt = bird.clock;
        drag.grabX = bird.x - (e.clientX + scrollXNow);
        drag.grabY = bird.y - (e.clientY + scrollYNow);
        drag.hauled = 0;
        return;
      }
      /* Clicking anywhere else closes it — but not the window itself, and not
         the same gesture that opened it. */
      if (chat.current.open) {
        if (inChatBox(e.clientX, e.clientY)) {
          inputRef.current?.focus();
          return;
        }
        if (bird.clock - chatUi.openedAt > 120) closeChat();
        return;
      }
      /* A click that lands NEAR him but not on him: he flinches away from it.
         Gated hard, because the reader is mostly clicking links. */
      if (
        !reduced &&
        bird.mode === 'idle' &&
        bird.clock > gate.recoil &&
        Math.abs(e.clientX - (bird.x - scrollXNow)) < 110 &&
        Math.abs(e.clientY - (bird.y - scrollYNow)) < 90
      ) {
        gate.recoil = bird.clock + 5200;
        bird.facing = (e.clientX + scrollXNow >= bird.x ? 1 : -1) as 1 | -1;
        startAct('recoilHop');
      }
    }

    /** Called from the move handler while a press is live. */
    function onDragMove() {
      if (!drag.pressed) return;
      if (!drag.active) {
        const moved =
          Math.abs(pointer.x - drag.pressX) + Math.abs(pointer.y - drag.pressY);
        if (moved > DRAG_SLOP) beginDrag();
      }
    }

    function onUp() {
      if (!drag.pressed) return;
      if (drag.active) {
        releaseDrag();
        return;
      }
      /* Never travelled: it was a click, and a click is the chat. */
      drag.pressed = false;
      if (chat.current.open) closeChat();
      else openChat();
    }

    /** A cancelled gesture is a release, not an escape. */
    function onCancel() {
      if (!drag.pressed) return;
      if (drag.active) releaseDrag();
      drag.pressed = false;
      drag.active = false;
    }

    /* ---- whisper on arriving at a section --------------------------------- */
    let lastWhispered = '';
    function maybeWhisper() {
      const sec = sectionRef.current;
      if (!sec || sec === lastWhispered || chat.current.open) return;
      const lines = whispersRef.current?.[sec];
      if (!lines?.length) return;
      lastWhispered = sec;
      say(lines[(Math.random() * lines.length) | 0], 5400);
    }

    /* ---- pvz -------------------------------------------------------------- */
    function startPvz() {
      buildPvzScript(2);
      pvz.step = 0;
      pvz.side = bird.facing;
      pvz.floorY = bird.y;
      pvz.frame = 0;
      pvz.frameT = 0;
      pvz.shotFired = false;
      pvz.peaLive = false;
      pvz.splatT = 0;
      pvz.z0Alive = true;
      pvz.z1Alive = true;
      pvz.z0x = bird.x + pvz.side * (W * 0.46);
      pvz.z1x = bird.x + pvz.side * (W * 0.66);
      pvz.gate = bird.clock + 170000;
      setMode('pvz');
      startAnim(PVZ_SCRIPT[0]);
      say(pickLine(LINE_PVZ), 3000);
    }

    function updatePvz(dt: number) {
      const ms = dt * 1000;
      pvz.frameT += ms;
      if (pvz.frameT >= ZOMBIE_FRAME_MS) {
        pvz.frameT -= ZOMBIE_FRAME_MS;
        pvz.frame ^= 1;
      }
      /* zombies shamble in from the leading edge */
      const zs = 44 * dt * -pvz.side;
      if (pvz.z0Alive) pvz.z0x += zs;
      if (pvz.z1Alive) pvz.z1x += zs;

      const name = PVZ_SCRIPT[pvz.step];
      /* Spawn on ENTRY TO FRAME 1 of pvzShoot. Frame 2 reads as pushed, not
         fired — the muzzle has already started closing by then. */
      if (name === 'pvzShoot' && !pvz.shotFired && SAMPLED_FRAME >= 1) {
        pvz.shotFired = true;
        pvz.peaLive = true;
        const mx = pvz.side === 1 ? PVZ_MUZZLE.x : SPRITE_WIDTH - PVZ_MUZZLE.x;
        pvz.peaX = bird.x - (SPRITE_WIDTH * PIXEL_SCALE) / 2 + mx * PIXEL_SCALE;
        pvz.peaY = bird.y - (BASELINE_Y - PVZ_MUZZLE.y) * PIXEL_SCALE;
      }
      if (pvz.peaLive) {
        pvz.peaX += 320 * dt * pvz.side;
        const hit = (zx: number) => Math.abs(pvz.peaX - zx) < 16;
        if (pvz.z0Alive && hit(pvz.z0x)) {
          pvz.z0Alive = false;
          pvz.peaLive = false;
          pvz.splatT = 260;
          pvz.splatX = pvz.peaX;
          pvz.splatY = pvz.peaY;
        } else if (pvz.z1Alive && hit(pvz.z1x)) {
          pvz.z1Alive = false;
          pvz.peaLive = false;
          pvz.splatT = 260;
          pvz.splatX = pvz.peaX;
          pvz.splatY = pvz.peaY;
        } else if (Math.abs(pvz.peaX - bird.x) > W) {
          pvz.peaLive = false;
        }
      }
      if (pvz.splatT > 0) pvz.splatT -= ms;

      if (animDone()) {
        pvz.step++;
        pvz.shotFired = false;
        if (pvz.step >= PVZ_SCRIPT.length) {
          enterIdle();
          return;
        }
        /* If the lawn is already clear, skip straight to the hat coming off. */
        if (!pvz.z0Alive && !pvz.z1Alive) {
          const isLoop = PVZ_LOOP.indexOf(PVZ_SCRIPT[pvz.step]) !== -1;
          if (isLoop) pvz.step = PVZ_SCRIPT.length - 1;
        }
        startAnim(PVZ_SCRIPT[pvz.step]);
      }
    }


    /* ---- set pieces, the machinery ---------------------------------------- */

    /** Which seasonal bits there are. The order is only the order they roll. */
    const SEASONAL: readonly BitName[] = ['lantern', 'gift', 'egg'];

/* ------------------------------------------------------------------------
     * HOW OFTEN, AND THE ONE LINE THAT TURNS THE FIREHOSE OFF
     *
     * Jack, 2026-08-26: "Can you make the easter eggs more common in general,
     * and way more common right now, I want to see them and I'm waiting ages!"
     *
     * The waiting was not the odds. `settledMs` -- the measure this used to
     * gate on -- also requires 2.6s of pointer stillness, so a reader with a
     * hand on the mouse zeroed it every frame and never once qualified. See
     * bird.calmMs. The numbers below are the second half of the answer, on a
     * clock that now actually runs.
     *
     * IMPATIENT is for looking at them. It is one boolean and it multiplies
     * every gate at once, so there is exactly one thing to turn off when the
     * set is signed off rather than five numbers to remember to put back.
     * ---------------------------------------------------------------------- */

    /** Turn this off when the set pieces have been seen and signed off. */
    const BIT_IMPATIENT = true;
    /** What IMPATIENT does to the wait, the odds and the quiet after. */
    const RUSH = BIT_IMPATIENT
      ? { settle: 0.18, rate: 5, cool: 0.15, bttf: 0.1 }
      : { settle: 1, rate: 1, cool: 1, bttf: 1 };

    /**
     * How quiet the page has to have been, in ms, before any bit is in the hat.
     *
     * Was 9000 against the old measure. Halved, because the new one is a real
     * clock: 4.5s is about the time it takes to read a plate's lede, which is
     * the moment a reader is most likely to be looking at him.
     */
    const BIT_SETTLE_MS = 4500 * RUSH.settle;
    /**
     * ...and the long one still wants a whole minute.
     *
     * > "That one should only have a chance of happening if they've been idle
     * > for more than a minute."
     *
     * A minute of the page not moving is a genuinely idle reader, and unlike
     * the old measure it is a minute they can actually accumulate.
     */
    const BTTF_SETTLE_MS = 60000 * RUSH.bttf;
    /** Per-second odds once he qualifies. 0.05 was one every twenty seconds
        of quiet ON TOP of a gate nobody reached. */
    const BIT_RATE = 0.16 * RUSH.rate;
    /** Quiet afterwards, so two never run into one another. */
    const BIT_COOLDOWN = 26000 * RUSH.cool;
    const BTTF_COOLDOWN = 120000 * RUSH.bttf;
    /** Every bit fades its actors out over its own last stretch. */
    const BIT_FADE_MS = 380;

    /* The timelines. Absolute ms from the start of the bit, because a set
       piece read as a list of durations drifts against itself the first time
       anyone edits one number in the middle. */
    const CREEP = {
      land: 540,
      notice: 660,
      hiss: 1420,
      boom: 2240,
      totem: 2420,
      back: 3280,
      len: 4600
    };
    /*
     * IT ARRIVES FLYING, and the door is a gullwing.
     *
     * > "When the delorean flies in, the wheels should be facing down like in
     * >  the movie, then when it lands it should be normal."
     * > "When Marty gets out of the car, the door should open like a real
     * >  delorean."
     *
     * `land` is the touchdown and `stop` is the end of the bounce on its
     * springs. The three door marks each hold one authored angle; the shut is
     * the same three run backwards, so it closes the way it opened.
     *
     * `rise` moved from 6800 to 5100 and `gone` is gone entirely. He used to
     * be at alpha 0 for four and a half seconds, which is a long time to have
     * the mascot missing; he flickers through that stretch now instead, and
     * the first chord is what brings him back. See the fade in tickBttf.
     */
    const BTTF = {
      land: 1150,
      stop: 1500,
      fade: 1750,
      doorA: 2000,
      doorB: 2200,
      doorC: 2400,
      out: 2700,
      play: 3900,
      rise: 5100,
      knees: 5900,
      inCar: 7800,
      shut: 8260,
      line: 8500,
      strike: 9100,
      away: 9420,
      len: 10800
    };

    /**
     * Which of the five cars to draw at time t.
     *
     * Every one of them is a whole car on its own canvas and a sprite's anchor
     * is its bottom centre, so swapping between them leaves the car exactly
     * where it was. The alternative, a door drawn as a separate panel, needs a
     * hinge position in page coordinates that changes with every frame of the
     * swing and with the mirror.
     */
    function deloreanSprite(t: number): PropName {
      if (t < BTTF.land) return 'deloreanFly';
      if (t < BTTF.doorA || t >= BTTF.shut) return 'delorean';
      if (t < BTTF.doorB) return 'deloreanDoorA';
      if (t < BTTF.doorC) return 'deloreanDoorB';
      if (t < BTTF.inCar) return 'deloreanDoorC';
      const c = t - BTTF.inCar;
      return c < 160 ? 'deloreanDoorC' : c < 320 ? 'deloreanDoorB' : 'deloreanDoorA';
    }
    const LANT = { ghost: 700, startle: 1150, up: 2700, len: 4200 };
    const GIFT = { land: 1500, peck: 1950, open: 2550, len: 4400 };
    const EGGB = { peck: 900, crack: 1400, hatch: 1700, len: 4400 };
    const BIT_LEN: Record<BitName, number> = {
      creeper: CREEP.len,
      bttf: BTTF.len,
      lantern: LANT.len,
      gift: GIFT.len,
      egg: EGGB.len
    };

    function startBit(name: BitName) {
      bit.name = name;
      bit.t = 0;
      bit.holds = true;
      bit.cut = false;
      bit.beat = 0;
      bit.floorY = bird.y;
      /* It arrives BEHIND him, so the first thing he does is turn round... */
      bit.side = (bird.facing === 1 ? -1 : 1) as 1 | -1;
      /* ...unless that would put a DeLorean off the side of the page. The
         car is 224px long now rather than 180, so the room it wants grew. */
      const room = bit.side === 1 ? scrollXNow + W - bird.x : bird.x - scrollXNow;
      if (room < 320) bit.side = -bit.side as 1 | -1;
      bit.ax = bird.x;
      bit.ay = bird.y;
      bit.bx = bird.x;
      bit.by = bird.y;
      bird.alpha = 1;
      setMode('bit');
      startAnim('lookAtViewer');
    }

    function endBit() {
      const was = bit.name;
      bit.name = null;
      bit.holds = false;
      bird.alpha = 1;
      bit.gate = bird.clock + (was === 'bttf' ? BTTF_COOLDOWN : BIT_COOLDOWN);
      if (bird.mode === 'bit') enterIdle();
    }

    /**
     * The reader interrupted.
     *
     * > "if the user interrupts during the sequence (like scrolls off the page
     * > or drags pip), pip carries on but marty (if he's out) gets back in the
     * > car and they get struck by lightning and zoom away."
     *
     * Two separate things, and separate on purpose. He is handed back his own
     * behaviour on THIS frame with no wind-down, because whatever the reader
     * just did is more interesting than the film. The actors are given the
     * shortest exit that still makes sense, which for the DeLorean is the
     * ending it was always going to have, arriving early.
     */
    function cutBit() {
      if (!bit.name || bit.cut) return;
      bit.cut = true;
      bit.holds = false;
      bird.alpha = 1;
      if (bird.mode === 'bit') enterIdle();
      if (bit.name === 'bttf') {
        bit.t =
          bit.t < BTTF.out
            ? Math.max(bit.t, BTTF.strike - 300)
            : Math.max(bit.t, BTTF.inCar);
      } else {
        bit.t = Math.max(bit.t, BIT_LEN[bit.name] - BIT_FADE_MS);
      }
    }

    function tickBit(dt: number) {
      if (!bit.name) return;
      bit.t += dt * 1000;
      switch (bit.name) {
        case 'creeper':
          tickCreeper();
          break;
        case 'bttf':
          tickBttf();
          break;
        case 'lantern':
          tickLantern();
          break;
        case 'gift':
          tickGift();
          break;
        case 'egg':
          tickEgg();
          break;
      }
      if (bit.t >= BIT_LEN[bit.name]) {
        endBit();
        return;
      }
      /* He has to keep breathing through a set piece. The timeline only sets
         the beats, and a finished one-shot would otherwise hold its last frame
         for the rest of it. */
      if (bit.holds && animDone() && !currentAnim().loop) startAnim('breathe', 420);
    }

    /**
     * Where a thing that arrives from above starts, in document space.
     *
     * Off the top of the screen, but never further above him than the band
     * canvas actually reaches: the band is BAND_UP tall above his head, and
     * anything drawn higher than that is quietly clipped for the first part of
     * its fall. Which of the two binds depends on how far down the screen he
     * is standing, so both are asked and the lower one wins.
     */
    function dropCeiling(): number {
      return Math.max(scrollYNow - 140, bit.floorY - (BAND_UP - 80));
    }

    /** Turn to face whatever has just turned up. */
    function faceTheBit() {
      bird.facing = (bit.side >= 0 ? 1 : -1) as 1 | -1;
    }

    function tickCreeper() {
      const t = bit.t;
      bit.ax = bird.x + bit.side * 82;
      const from = dropCeiling();
      if (t < CREEP.land) {
        const u = t / CREEP.land;
        /* Falling, not descending: it accelerates. */
        bit.ay = from + (bit.floorY - from) * u * u;
      } else {
        bit.ay = bit.floorY;
      }
      if (!bit.holds) return;
      if (t >= CREEP.notice && bit.beat === 0) {
        bit.beat = 1;
        faceTheBit();
        startAnim('startledAwake');
        say(pickLine(LINE_CREEPER), 1500);
      } else if (t >= CREEP.hiss && bit.beat === 1) {
        bit.beat = 2;
        startAnim('shiver', CREEP.boom - CREEP.hiss);
      }
      if (t >= CREEP.boom && t < CREEP.back) bird.alpha = 0;
      if (t >= CREEP.back) {
        bird.alpha = Math.min(1, (t - CREEP.back) / 520);
        if (bit.beat === 2) {
          bit.beat = 3;
          startAnim('flutter', 0);
          say(pickLine(LINE_TOTEM), 2400);
        }
      }
    }

    function tickBttf() {
      const t = bit.t;
      /* Four marks on one line: off the page, parked, the door, and the spot
         he plays from. Everything either sits on one or moves between two. */
      const off = bird.x + bit.side * (W * 0.7 + 300);
      /* The car is 224px long at the scale it is drawn, so the mark it parks
         on has to clear the bird by more than half of that or it pulls up
         through him. */
      const park = bird.x + bit.side * 196;
      const door = park - bit.side * 34;
      const spot = park - bit.side * 122;
      bit.by = bit.floorY;

      if (t < BTTF.land) {
        /* IT FLIES IN, down and along at once, wheels turned flat under it.
           The vertical runs on the slower curve so the last thing to happen
           is the touchdown rather than the arrival. */
        const u = t / BTTF.land;
        const e = 1 - (1 - u) * (1 - u) * (1 - u);
        bit.ax = off + (park - off) * e;
        bit.ay = bit.floorY - 300 * (1 - u * u);
      } else if (t < BTTF.stop) {
        /* Onto its springs. A car that stops dead where it was going reads as
           a sprite being positioned. */
        const u = (t - BTTF.land) / (BTTF.stop - BTTF.land);
        bit.ax = park;
        bit.ay = bit.floorY - Math.sin(u * Math.PI) * 7;
      } else if (t < BTTF.away) {
        bit.ax = park;
        bit.ay = bit.floorY;
      } else {
        const u = Math.min(1, (t - BTTF.away) / (BTTF.len - BTTF.away));
        bit.ax = park + (off - park) * u * u;
        bit.ay = bit.floorY;
      }

      if (t < BTTF.out) bit.bx = door;
      else if (t < BTTF.play)
        bit.bx =
          door + (spot - door) * smoothstep(Math.min(1, (t - BTTF.out) / (BTTF.play - BTTF.out)));
      else if (t < BTTF.inCar) bit.bx = spot;
      else
        bit.bx =
          spot +
          (door - spot) * smoothstep(Math.min(1, (t - BTTF.inCar) / (BTTF.line - BTTF.inCar)));

      if (!bit.holds) return;
      if (t < BTTF.fade) {
        if (bit.beat === 0 && t > BTTF.land * 0.6) {
          bit.beat = 1;
          faceTheBit();
          startAnim('startledAwake');
        }
      } else {
        /*
         * THE PHOTOGRAPH. He does not simply go: he flickers, the way the
         * photograph in the film does, and the song is what brings him back.
         *
         * > "When the pip fades out, he should be fading in and out until
         * >  marty does his song."
         *
         * Two curves rather than one. `dip` is how far gone he is: it runs
         * 0 -> 1 up to the first chord and 1 -> 0 after it. The flicker rides
         * on top and is SCALED BY IT, so he is solid before and after and only
         * unstable in between. A flicker at constant depth would strobe him
         * for six seconds, which is a headache rather than a joke.
         */
        const dip =
          t < BTTF.play
            ? (t - BTTF.fade) / (BTTF.play - BTTF.fade)
            : Math.max(0, 1 - (t - BTTF.play) / (BTTF.rise - BTTF.play));
        const flick = 0.5 + 0.5 * Math.cos(t * 0.021);
        bird.alpha = Math.max(0, (1 - 0.82 * dip) * (1 - dip * 0.85 * flick));

        if (bit.beat === 1 && t > BTTF.fade + 950) {
          bit.beat = 2;
          /* The bubble is drawn independently of how solid he is, which is
             the whole joke: the last thing left of him is the word. */
          say('Help.', 1400);
        }
        if (bit.beat === 2 && t >= BTTF.rise) {
          bit.beat = 3;
          startAnim('lookAtViewer');
        }
        /*
         * THE LINE, said by him rather than by the car.
         *
         * The speech bubble hangs off his beak by construction: it is
         * positioned from the sprite and its tail picks an edge from where his
         * head is, so pointing one at a DeLorean means a second speech system
         * for the sake of one sentence. A bird delivering it is the better
         * trade and, on the evidence, the funnier one.
         */
        if (bit.beat === 3 && t >= BTTF.line) {
          bit.beat = 4;
          say(LINE_BTTF[0], 2600);
        }
        if (bit.beat === 4 && t >= BTTF.away + 520) {
          bit.beat = 5;
          say(LINE_BTTF[1 + ((Math.random() * (LINE_BTTF.length - 1)) | 0)], 2600);
        }
      }
    }

    function tickLantern() {
      const t = bit.t;
      bit.ax = bird.x + bit.side * 74;
      bit.ay = bit.floorY;
      /* Up out of the lantern and AWAY from him, wandering as it goes. It used
         to rise straight up into the space the speech bubble occupies, so the
         two things that happen at the same moment covered each other. */
      const u = Math.max(0, Math.min(1, (t - LANT.ghost) / (LANT.up - LANT.ghost)));
      bit.bx = bit.ax + Math.sin(u * 4.2) * 30 + bit.side * u * 34;
      bit.by = bit.floorY - u * 118;
      if (!bit.holds) return;
      if (t >= LANT.startle && bit.beat === 0) {
        bit.beat = 1;
        faceTheBit();
        startAnim('startledAwake');
        say(pickLine(LINE_LANTERN), 2000);
      }
    }

    function tickGift() {
      const t = bit.t;
      bit.ax = bird.x + bit.side * 70;
      const from = dropCeiling();
      /* Under a chute, so it comes down at a steady rate rather than falling.
         That is the whole difference between a parcel and a rock. */
      bit.ay = from + (bit.floorY - from) * Math.min(1, t / GIFT.land);
      if (!bit.holds) return;
      if (t >= GIFT.peck && bit.beat === 0) {
        bit.beat = 1;
        faceTheBit();
        startAnim('peck');
      } else if (t >= GIFT.open && bit.beat === 1) {
        bit.beat = 2;
        startAnim('showOff');
        say(pickLine(LINE_GIFT), 2400);
      }
    }

    function tickEgg() {
      const t = bit.t;
      bit.ax = bird.x + bit.side * 66;
      bit.ay = bit.floorY;
      /* The chick leaves along the same line, in a run of little arcs. */
      const ht = Math.max(0, t - EGGB.hatch);
      bit.bx = bit.ax + bit.side * ht * 0.1;
      bit.by = bit.floorY - Math.abs(Math.sin(ht * 0.011)) * 16;
      if (!bit.holds) return;
      if (t >= EGGB.peck && bit.beat === 0) {
        bit.beat = 1;
        faceTheBit();
        startAnim('peck');
      } else if (t >= EGGB.hatch && bit.beat === 1) {
        bit.beat = 2;
        startAnim('recoilHop');
      } else if (t >= EGGB.hatch + 900 && bit.beat === 2) {
        bit.beat = 3;
        startAnim('headShake');
        say(pickLine(LINE_EGG), 2400);
      }
    }

    /**
     * Which set piece, if any.
     *
     * The seasonal ones are WEIGHTED by the calendar rather than gated by it,
     * so SEASON_PREVIEW is a dial rather than a switch and the site does not
     * carry three features nobody can see for eleven months of the year.
     */
    const BIT_POOL: BitName[] = [];
    const BIT_WEIGHT: number[] = [];
    /** The last one he did. It does not get to be the next one. */
    let lastBit: BitName | null = null;
    function rollBit(): BitName | null {
      BIT_POOL.length = 0;
      BIT_WEIGHT.length = 0;
      const now = new Date();
      const push = (n: BitName, w: number) => {
        if (w <= 0) return;
        BIT_POOL.push(n);
        /* Rushing, the hat is FLAT: the point of IMPATIENT is to see all five,
           and authored odds under a five-times rate just means five creepers
           and a wait for the rest. */
        BIT_WEIGHT.push(BIT_IMPATIENT ? 10 : w);
      };
      push('creeper', 20);
      if (bird.calmMs > BTTF_SETTLE_MS) push('bttf', 9);
      for (let i = 0; i < SEASONAL.length; i++) {
        const n = SEASONAL[i];
        push(
          n,
          inSeason(n, now)
            ? SEASON_WEIGHT.inSeason
            : SEASON_PREVIEW
              ? SEASON_WEIGHT.preview
              : 0
        );
      }
      /* NEVER THE SAME ONE TWICE RUNNING, as long as there is anything else
         in the hat. A rare thing that repeats immediately is the one outcome
         that makes a set of five feel like a set of one -- and at IMPATIENT
         odds the reader sees enough rolls for it to happen constantly. */
      if (lastBit && BIT_POOL.length > 1) {
        const i = BIT_POOL.indexOf(lastBit);
        if (i >= 0) BIT_WEIGHT[i] = 0;
      }

      let total = 0;
      for (let i = 0; i < BIT_WEIGHT.length; i++) total += BIT_WEIGHT[i];
      if (total <= 0) return null;
      let r = Math.random() * total;
      let pick = BIT_POOL[0];
      for (let i = 0; i < BIT_POOL.length; i++) {
        r -= BIT_WEIGHT[i];
        if (r <= 0) {
          pick = BIT_POOL[i];
          break;
        }
      }
      lastBit = pick;
      return pick;
    }

    /* ---- transit ---------------------------------------------------------- */
    /* BUG 3 bookkeeping: how many transits since the reader last saw a rare
       one, and which rares they have already met this session. */
    const seenRare = new Set<AnimationName>();
    let sinceRare = 0;
    let pityAt = 7 + ((Math.random() * 4) | 0);

    function startTransit(up: boolean, forced?: AnimationName) {
      const table = up ? TRANSIT_UP : TRANSIT_DOWN;
      let name: AnimationName;
      let wasRare = false;
      const sinceBefore = sinceRare;
      const pityBefore = pityAt;
      if (forced) {
        name = forced;
      } else {
        /* Authored odds for the opening few, then the rares climb, and past
           the pity count they dominate. The reader always meets the balloon
           eventually, and never on a beat they can anticipate. */
        const boost =
          sinceRare >= pityAt ? 26 : sinceRare < 3 ? 1 : Math.min(12, (sinceRare - 2) * 2);
        const entry = rollTransit(table, boost, seenRare);
        name = entry.name;
        wasRare = entry.rarity === 'rare';
        if (wasRare) {
          seenRare.add(name);
          sinceRare = 0;
          pityAt = 7 + ((Math.random() * 4) | 0);
        } else {
          sinceRare++;
        }
      }
      let anim = ANIMATIONS[name];
      const startSy = bird.y - scrollYNow;
      /*
       * The three scripted descents carry a payoff and take their own sweet
       * time delivering it. Starting one from off the top of the screen means
       * the whole gag plays somewhere the reader is not looking and he is
       * merely absent for two seconds — which was the single largest slice of
       * time he spent out of frame. If he is not on screen, the common
       * looping glide gets him back into view instead, and the rare is put
       * back exactly as it was: not marked seen, and the pity clock not
       * reset, so it is still owed and comes round again shortly.
       */
      /*
       * REVISED 2026-08-25 for descents only. Jack: "The rope should come from
       * right at the top of the screen when coming down and he should slide
       * down it until he jumps off to a perch location near underneath him."
       *
       * The rule above still holds for anything going UP — a scripted ascent
       * that begins below the fold plays its payoff off the bottom of the page
       * and is simply wasted. But for a descent the fix is not to give up on
       * the animation, it is to move the START: he enters at the top edge and
       * the whole slide happens in view, which is both what was asked for and
       * a better answer than the fallback was.
       */
      const offTop = startSy < 40;
      const offBottom = startSy > H - 40;
      if (!anim.loop && !forced && (up ? offTop || offBottom : offBottom)) {
        if (wasRare) {
          seenRare.delete(name);
          sinceRare = sinceBefore + 1;
          pityAt = pityBefore;
        }
        name = table[0].name;
        anim = ANIMATIONS[name];
      }
      transit.name = name;
      transit.up = up;
      transit.t = 0;
      transit.held = 0;
      transit.props = TRANSIT_PROP_MAP[name] ?? EMPTY_PROPS;
      transit.sy0 = bird.y - scrollYNow;
      /*
       * A descent that begins above the top edge begins AT the top edge
       * instead. He is off-screen either way, so nothing a reader can see
       * moves; what changes is that the slide, the chute or the tumble now
       * starts where they can watch it rather than four hundred pixels above
       * the fold. -26 rather than 0 so he clears the edge on the way in.
       */
      if (!up && transit.sy0 < -26) {
        transit.sy0 = -26;
        bird.y = scrollYNow + transit.sy0;
      }
      if (anim.loop) {
        /* Loops cover any distance: hold for the flight, hand over to `land`. */
        transit.dur = 0;
        transit.sy1 = transit.sy0;
      } else {
        /* The scripted descents carry a payoff. Give them exactly the travel
           time their own duration asks for or the punchline lands somewhere
           the reader is not looking. */
        transit.dur = animDuration(anim) * TRANSIT_TIME.down;
        /* Coming down: aim at something underneath him. Going up: the old
           picker, which wants whatever is nearest the middle of the screen. */
        const p = up ? pickBandPerch(0.9) : pickDescentPerch(0.9);
        transit.sy1 = p ? p.y - scrollYNow : H * 0.62;
        transit.sy1 = Math.max(H * 0.24, Math.min(H * 0.82, transit.sy1));
      }
      /*
       * A LOOPING TRANSIT MAY NOT LAND BEFORE IT HAS PLAYED.
       *
       * Measured, and it was the worst thing wrong with the transits: the loop
       * branch exits at the first frame past 380ms where the scroll has
       * settled, so on a static page EVERY looping transit lasted 383ms.
       * `upBalloon` is two full seconds of authored animation and the reader
       * saw a fifth of it. The rare transits are supposed to be the easter
       * eggs and they were the ones being cut shortest, because the rarer ones
       * are the slower ones.
       *
       * The floor is one whole cycle at the direction's own pace, or 900ms,
       * whichever is longer — 900 because `upFlap` is a 270ms cycle and one
       * flap is not a flight. He tracks the viewport throughout, so holding
       * him up there costs the reader nothing.
       */
      transit.minMs = anim.loop
        ? Math.max(TRANSIT_MIN_MS, animDuration(anim) * TRANSIT_TIME[up ? 'up' : 'down'])
        : 0;
      bird.perch = null;
      bird.jumpAnim = null;
      setMode('transit');
      startAnim(name, 0);
    }

    function updateTransit(dt: number, vel: number) {
      transit.t += dt * 1000;
      const scrollY = scrollYNow;
      const scrollX = scrollXNow;

      if (transit.dur > 0) {
        const u = transit.t / transit.dur;
        /*
         * SANCTIONED SCREEN-SPACE MOVE. A transit rides the viewport: on
         * screen he holds a smooth path from sy0 to sy1 while the document
         * races past behind him. His DOCUMENT y therefore tracks scrollY,
         * which is the only place in this file that is allowed to happen.
         */
        bird.y = scrollY + transit.sy0 + (transit.sy1 - transit.sy0) * smoothstep(u);
        if (transit.t >= transit.dur) {
          /* Same rule as the one that set sy1: he steps off a descent onto
             something under him, not across the room. */
          const p = transit.up ? pickBandPerch(0.8) : pickDescentPerch(0.8);
          if (p) planTo(p, 0.8, !transit.up);
          else enterFall();
        }
      } else {
        /*
         * SANCTIONED SCREEN-SPACE MOVE, and the real fix for "he sometimes
         * stays at the top of the screen when you scroll, only coming down
         * when it's too late".
         *
         * The first line is the whole thing. His position is stored in
         * DOCUMENT space, so a page that moves 34px in a frame drags his
         * screen position 34px with it. The old code then converged on the
         * comfort band from wherever that left him — at a 36px-per-frame cap
         * against a 34px-per-frame scroll, the net progress was under three
         * pixels a frame, and he crawled back into view over several seconds
         * however high the cap went. That is the lateness the client saw, and
         * it is arithmetic, not tuning.
         *
         * Adding the scroll delta back cancels the drag: a transit RIDES the
         * viewport, exactly as the header of this file says it does. His
         * document y tracks scrollY, on screen the page moves and he does
         * not, and the convergence underneath is then his own movement at the
         * full capped rate no matter how hard the reader is scrolling.
         *
         * The cap stays, because a bare exponential approach across a 1400px
         * flick is over 3000px/s on the first frame, which reads as a streak
         * rather than as a bird.
         */
        bird.y += scrollDelta;
        const sy = bird.y - scrollY;
        const wantSy = H * (transit.up ? 0.4 : 0.58);
        /* Per direction. Coming back up used to be capped at 2200px/s with a
           dt*7 convergence, which crosses most of a viewport in four frames
           and reads as a jump cut rather than as a bird. */
        const dir = transit.up ? 'up' : 'down';
        const TRANSIT_MAX_VY = TRANSIT_CAP_VY[dir];
        const wanted = (wantSy - sy) * Math.min(1, dt * TRANSIT_CONVERGE[dir]);
        /* Ramp the cap in over the first 180ms so entering a transit is an
           acceleration rather than a step from 3px a frame to 36. */
        const ramp = Math.min(1, transit.t / 180);
        const cap = TRANSIT_MAX_VY * dt * (0.25 + 0.75 * ramp);
        bird.y += Math.max(-cap, Math.min(cap, wanted));
        bird.x += Math.sin(transit.t * 0.0017) * 16 * dt;
        transit.held += dt * 1000;
        /* Nowhere worth sitting and nothing moving: after a few seconds stop
           hovering and take whatever is nearest, so he cannot end up flapping
           in place forever over a stretch of page with no furniture on it. */
        if (transit.held > 5200) {
          const n = nearestPerch();
          if (n) planTo(n, 0.5);
          else enterFall();
          return;
        }
        /* Hold the loop until the scroll has actually settled AND he is back
           inside the band. Exiting on the scroll alone dropped him into a hop
           that the still-moving page immediately undid, which is how he ended
           up a thousand pixels above the viewport playing catch-up forever. */
        if (transit.t > transit.minMs && Math.abs(vel) < 12 && bandUrgency() < 0.25) {
          /* Land only on something worth landing on. Handing him a perch that
             is already off the top of the screen just restarts the chase, and
             one stretch of this page has no perch in view at all — there, the
             right answer is to keep flying, which is what a bird with nowhere
             to sit actually does. */
          const p = transit.up ? pickBandPerch(0.7) : pickDescentPerch(0.7);
          if (p && perchUrgency(p) < 0.3) planTo(p, 0.7, !transit.up);
          /* nothing worth landing on: hover a little longer and look again */
          else transit.t = transit.minMs - 200;
        }
      }
      bird.x = Math.max(scrollX + 40, Math.min(scrollX + W - 40, bird.x));
    }

    /* ---- update ------------------------------------------------------------ */
    /** The dt the last update ran with. draw() borrows it; see drawCursor. */
    let lastDt = 1 / 60;

    /**
     * @param dt   integration step, already clamped to UPDATE_DT_MAX
     * @param wall real elapsed time for this frame, for the rate estimates
     */
    function update(dt: number, wall: number = dt) {
      lastDt = dt;
      bird.clock += dt * 1000;
      bird.modeT += dt;
      /*
       * TRANSIT PACING. Jack, 2026-08-25: "The going down animations are too
       * slow and the going up animations are too fast."
       *
       * He is right and the asymmetry was structural rather than a tuning
       * slip. A descent is a SCRIPTED animation whose travel is stretched to
       * fill its own authored length, so `downSkydive` spent 2.97 seconds
       * covering about 260px of screen. An ascent is a LOOP, so its speed came
       * entirely from the convergence below, which was capped at 2200px/s and
       * crossed most of the viewport inside a handful of frames.
       *
       * Both ends are fixed where they are actually set: the loop cap and
       * convergence rate are now per-direction (see updateTransit), and the
       * scripted descents are shortened by TRANSIT_TIME.down. This line keeps
       * the ANIMATION in step with the travel — shortening the flight without
       * it would leave him finishing his parachute frames after he had landed.
       */
      bird.animT +=
        dt * 1000 * (bird.mode === 'transit' ? 1 / TRANSIT_TIME[transit.up ? 'up' : 'down'] : 1);

      /* Real elapsed time: scrollDelta accumulated over the whole frame, so
         dividing it by a clamped step would overstate the gesture. */
      trackScroll(wall);
      serviceErrand();
      /* velocityRef is px/frame; scrollVel is px/sec. Compare like for like
         and take whichever is reporting the faster gesture. */
      const refVel = velRef.current?.current ?? 0;
      const ownVel = scrollVel / 60;
      const vel = Math.abs(ownVel) > Math.abs(refVel) ? ownVel : refVel;

      /* pointer stillness, and how hard it is being thrown about */
      const fresh = pointer.prevX < -9000 || pointer.prevY < -9000;
      const pdx = fresh ? 0 : pointer.x - pointer.prevX;
      const pdy = fresh ? 0 : pointer.y - pointer.prevY;
      pointer.prevX = pointer.x;
      pointer.prevY = pointer.y;
      const travel = Math.hypot(pdx, pdy);
      pointer.jerk = travel;
      /* Same reasoning as trackScroll: this is a rate, not a step. */
      pointer.vx = wall > 0 ? pdx / wall : 0;
      pointer.vy = wall > 0 ? pdy / wall : 0;
      /* Lowpassed, and it decays toward zero on a still pointer rather than
         holding the last flick forever. */
      const rawSpeed = dt > 0 ? travel / dt : 0;
      pointer.speed += (rawSpeed - pointer.speed) * Math.min(1, dt * 14);
      if (pointer.speed < 3) pointer.speed = 0;
      if (Math.abs(pointer.x - pointer.lastX) + Math.abs(pointer.y - pointer.lastY) > 2) {
        pointer.lastX = pointer.x;
        pointer.lastY = pointer.y;
        pointer.stillMs = 0;
      } else {
        pointer.stillMs += dt * 1000;
      }

      /*
       * ANGER. Charged inside the drag case, spent everywhere: it decays on
       * the same clock whatever he is doing, so a bird that broke free
       * furious is placid again about a second later, which is exactly the
       * shape the client asked for.
       */
      if (drag.active) {
        angerIdleMs = 0;
      } else {
        angerIdleMs += dt * 1000;
        if (angerIdleMs > ANGER_GRACE_MS && anger > 0) {
          anger = Math.max(0, anger - ANGER_DECAY * dt);
        }
      }
      /* A press that never became a drag and never got its pointerup — the
         pointer left the window mid-gesture, say. Do not hold it forever. */
      if (drag.pressed && !drag.active && bird.clock - drag.pressAt > 2600) {
        drag.pressed = false;
      }

      /*
       * BUG 1. The drift a locomotion idle sets up used to be applied here,
       * unconditionally, in every mode. A sidestep begun on a heading went on
       * quietly adding sideways velocity through the hop that followed it,
       * through a fall, through a whole transit — a phantom shove with no
       * animation under it and no way to see where it came from. It belongs
       * to standing still, so it only runs while he is standing still.
       */
      if (bird.mode !== 'idle' && bird.mode !== 'act') {
        bird.driftVx = 0;
        bird.driftUntil = 0;
      } else if (bird.driftUntil > bird.clock) {
        bird.x += bird.driftVx * dt;
      } else {
        bird.driftVx = 0;
      }

      trackCursorPerch(dt);

      /*
       * ==================================================================
       * WHEN AN ABILITY IS ALLOWED TO FIRE
       *
       * Jack, 2026-08-25, correcting what I had built from "fast scroll":
       *
       *   "when I meant fast scroll before I meant when you scroll fast
       *   enough that he goes off the screen and can't jump down in time. In
       *   those edge regions (top and bottom 20% maybe), he wants to jump
       *   down into the middle 60%, bit by bit, but if you scroll too far and
       *   he goes off the screen, he uses one of his 'abilities' (rope, ufo,
       *   etc.) to catch up to you and come back on the screen."
       *
       * So there is exactly ONE trigger, and it is not a speed: he is off the
       * screen. Everything short of that is the comfort band's job — see the
       * idle case, where the edge fifths drive ordinary hops back toward the
       * middle three fifths, one perch at a time.
       *
       * Both of the old triggers were speed-based and both were wrong for the
       * same reason. A firm flick fired a transit while he was still sitting
       * comfortably in the middle of the screen, so the abilities read as a
       * reaction to the WHEEL rather than to his own position, and a reader
       * who scrolls hard got a parachute for no visible reason. The second
       * one, `strandedMs` against `|scrollVel| > 300`, did the same thing more
       * quietly. Both are gone, along with TRANSIT_VEL and TRANSIT_SUSTAIN.
       *
       * The 60px margin is not decoration. A hop arc rises up to 620px, so
       * from a perch near the top of the viewport he can legitimately clip
       * above the edge for a few frames on his way somewhere sensible; firing
       * an ability at 0px would interrupt his own recovery to do the same job
       * worse. 60px plus a 260ms sustain is comfortably past what an arc does
       * and comfortably inside what "he has gone" looks like.
       * ==================================================================
       */
      /* Being held is not a scroll problem. A transit fired mid-drag would
         tear him out of the reader's hand for reasons neither of them
         understands, so the drag outranks it. */
      const transitOk =
        !chat.current.open &&
        !onErrand() &&
        bird.mode !== 'transit' &&
        bird.mode !== 'pvz' &&
        bird.mode !== 'bit' &&
        bird.mode !== 'drag';

      /*
       * SET PIECES RUN OUTSIDE THE MODE SWITCH, on purpose. `holds` is what
       * says the bit currently owns the bird; the actors keep going either
       * way, which is what lets the DeLorean see itself out after the reader
       * has taken him back.
       *
       * Scrolling hard, or scrolling him off the screen, is an interrupt for
       * the same reason a drag is: the reader has stopped watching, and a set
       * piece that plays on regardless is one playing to an empty room.
       */
      /* The page's own quiet, for the set pieces. See bird.calmMs. */
      if (Math.abs(vel) < 2) bird.calmMs += dt * 1000;
      else bird.calmMs = Math.max(0, bird.calmMs - dt * 1000 * CALM_BURN);

      if (bit.name && bit.holds) {
        const bsy = bird.y - scrollYNow;
        if (Math.abs(vel) > 7 || bsy < -OFF_SCREEN_MARGIN || bsy > H + OFF_SCREEN_MARGIN) {
          cutBit();
        }
      }
      if (bit.name) tickBit(dt);

      /*
       * THE SET PIECES FIRE FROM HERE, not from inside the idle case.
       *
       * Two reasons, and both of them were costing the reader eggs. The lawn's
       * gate sits above where this used to be and `break`s on success, so the
       * lawn could quietly eat a turn. And `idle` is only one of the four modes
       * he spends time in with his feet on something: a creeper is perfectly
       * happy to drop on a bird who is mid-walk, and refusing to let it halved
       * the number of frames that could ever roll.
       *
       * `land` is left out because he is still arriving, and `sleep` because
       * waking him has its own path.
       */
      if (
        !bit.name &&
        !onErrand() &&
        !chat.current.open &&
        bird.perch &&
        (bird.mode === 'idle' || bird.mode === 'act' || bird.mode === 'walk') &&
        bird.calmMs > BIT_SETTLE_MS &&
        bird.clock > bit.gate &&
        Math.random() < dt * BIT_RATE
      ) {
        const pick = rollBit();
        if (pick) startBit(pick);
      }
      {
        const sy = bird.y - scrollYNow;
        const gone = sy < -OFF_SCREEN_MARGIN || sy > H + OFF_SCREEN_MARGIN;
        if (gone) bird.strandedMs += dt * 1000;
        else bird.strandedMs = 0;
        const edgeUrgency = urgencyAt(sy);
        if (!gone && edgeUrgency > 0.08) bird.edgeMs += dt * 1000;
        else bird.edgeMs = 0;
        if (transitOk && bird.strandedMs > OFF_SCREEN_SUSTAIN) {
          bird.strandedMs = 0;
          /* Off the TOP means the page has run on ahead of him and he has to
             come down; off the bottom means it has run back and he has to go
             up. Nothing here reads the scroll direction, only where he is. */
          startTransit(sy > H * 0.5);
        }
      }

      switch (bird.mode) {
        case 'chat': {
          if (!chat.current.open) {
            enterIdle();
            break;
          }
          /* Glide into the seat rather than snapping onto the window. The
             window is screen-fixed, so the glide is interpolated in SCREEN
             space and only then converted back to document space — blending
             a document origin toward a screen target would drift by however
             far the reader scrolled during the quarter second. */
          if (chatUi.glide < 1) {
            chatUi.glide = Math.min(1, chatUi.glide + dt / 0.26);
            const u = smoothstep(chatUi.glide);
            bird.x = scrollXNow + chatUi.fromX + (chatUi.seatX - chatUi.fromX) * u;
            bird.y = scrollYNow + chatUi.fromY + (chatUi.seatY - chatUi.fromY) * u;
          } else {
            bird.x = scrollXNow + chatUi.seatX;
            bird.y = scrollYNow + chatUi.seatY;
          }
          bird.facing = 1;
          const wantAnim = chat.current.busy ? CHAT_RESPONDING : chat.current.perch;
          if (bird.anim !== wantAnim) startAnim(wantAnim, 0);
          break;
        }

        case 'idle': {
          if (chat.current.open) {
            setMode('chat');
            break;
          }
          if (!bird.perch) {
            enterFall();
            break;
          }
          holdPerch(dt);

          /* face whatever the reader's cursor is doing, when it is close */
          const mdx = pointerDocX() - bird.x;
          if (Math.abs(mdx) > 40 && Math.abs(mdx) < 420) {
            bird.facing = mdx > 0 ? 1 : -1;
          }

          /*
           * COMFORT BAND. He wants the middle 70% of the viewport. The check
           * runs EVERY FRAME and the gate before the next hop shrinks with
           * urgency, so being carried off the top of the screen produces a
           * response in about a seventh of a second rather than whenever the
           * idle scheduler next happens to feel like moving. That lateness
           * was the complaint.
           */
          let u = bandUrgency();
          const psy = bird.perch.y - scrollYNow;
          if (psy < -30 || psy > H + 10) u = 1.4;
          if (u > 0.06 && bird.clock > bird.hopGate && !onErrand()) {
            /*
             * Only move if there is somewhere BETTER to stand. Whole stretches
             * of this page have no perch inside the comfort band at all — and
             * one stretch has no perch on screen whatsoever — so an
             * unconditional "get back in the band" drive is unsatisfiable
             * there and the bird hops frantically on the spot forever. A bird
             * that has looked around, found nothing better and settled for
             * what it has is both correct and better behaviour.
             */
            const cand = pickBandPerch(u);
            if (cand && perchUrgency(cand) < u - 0.12) {
              bird.hopGate = bird.clock + (720 - 580 * Math.min(1, u));
              bird.edgeMs = 0;
              if (u > 0.7 && Math.random() < 0.25) say(pickLine(LINE_CHASE), 2600);
              onCursor = false;
              planTo(cand, u);
              break;
            }
            /* No furniture in reach must not strand him at a screen edge. Give
               ordinary hopping a short chance, then use a transit proactively. */
            if (!cand && transitOk && u > 0.2 && bird.edgeMs > 720) {
              bird.edgeMs = 0;
              onCursor = false;
              startTransit(psy > H * 0.5);
              break;
            }
            /* Nothing better within reach. Sit tight — but look again much
               sooner the worse the position is, so a page that scrolls a good
               perch into view gets used almost at once rather than after two
               and a bit seconds of standing there being wrong. */
            bird.hopGate = bird.clock + (u > 0.8 ? 500 : 2200);
          }

          tryMouseInteractions(dt);
          if (bird.mode !== 'idle') break;

          if (animDone()) {
            if (bird.clock < bird.restUntil) {
              /* a short settle between idles, not a default state */
              startAnim('breathe', 260 + Math.random() * 220);
            } else {
              chooseIdle(bird.clock);
              /* Rest only some of the time. Resting after every single idle is
                 what buried the repertoire under breathing. */
              bird.restUntil =
                Math.random() < 0.45
                  ? bird.clock + IDLE_REST_MS * 0.5 + Math.random() * IDLE_REST_JITTER_MS * 0.4
                  : 0;
            }
          }

          /* PVZ: rare, and only once he has been genuinely settled. Settled
             means the page is still and the reader is not moving the mouse.
             Requiring the pointer to have LEFT the window meant a reader
             sitting quietly with a hand on the mouse never once qualified,
             which made the easter egg unreachable rather than rare. */
          if (Math.abs(vel) < 2 && (!pointerOnScreen() || pointer.stillMs > 2600))
            bird.settledMs += dt * 1000;
          else bird.settledMs = 0;
          if (bird.settledMs > 11000 && bird.clock > pvz.gate && Math.random() < dt * 0.02) {
            startPvz();
            break;
          }

          /* every so often, move house — roughly once every twelve seconds */
          bird.sinceMove += dt;
          if (bird.sinceMove > 7 && Math.random() < dt * 0.12 && !onErrand()) {
            const t = pickBandPerch(0);
            if (t && t !== bird.perch) {
              bird.sinceMove = 0;
              planTo(t, 0);
            }
          }

          /* unprompted chatter */
          if (bird.clock > gate.chatter && bubble.until < bird.clock) {
            gate.chatter = bird.clock + 22000 + Math.random() * 20000;
            say(pickLine(RANDOM_LINES), 5000);
          }
          break;
        }

        case 'walk': {
          if (chat.current.open) {
            setMode('chat');
            break;
          }
          if (!bird.perch) {
            enterFall();
            break;
          }
          bird.y = approach(bird.y, bird.perch.y, dt, 1400);
          bird.x += bird.walkVx * dt;
          const lo = bird.perch.x0 + 8;
          const hi = bird.perch.x1 - 8;
          if (bird.x < lo || bird.x > hi) {
            bird.x = Math.max(lo, Math.min(hi, bird.x));
            bird.walkVx = -bird.walkVx;
            if (bird.anim !== 'moonwalk') bird.facing = (bird.walkVx >= 0 ? 1 : -1) as 1 | -1;
          }
          if (bird.clock > bird.walkUntil || animDone()) enterIdle();
          break;
        }

        case 'act': {
          if (chat.current.open) {
            setMode('chat');
            break;
          }
          holdPerch(dt);
          if (animDone()) {
            actIdx++;
            if (actIdx >= actLen) {
              if (bird.anim === 'startledAwake') say(pickLine(LINE_WAKE), 3000);
              enterIdle();
            } else {
              startAnim(ACTS[actIdx]);
            }
          }
          break;
        }

        case 'hop': {
          const wp = PLAN[planIdx];
          /* Keep the arc honest if the furniture moved mid-flight: the target
             follows its element, so arrival stays where the words are. */
          if (wp.perch) {
            wp.y = wp.perch.y;
            wp.x = Math.max(wp.perch.x0 + 8, Math.min(wp.perch.x1 - 8, wp.x));
          }
          const py = bird.y;
          const px = bird.x;
          bird.vy += bird.g * dt;
          bird.x += bird.vx * dt;
          bird.y += bird.vy * dt;

          if (!bird.jumpAnim) {
            if (bird.vy < -140) {
              if (bird.anim !== 'airUp') startAnim('airUp');
            } else if (bird.vy < 140) {
              if (bird.anim !== 'airApex') startAnim('airApex');
            } else if (bird.anim !== 'airDown') startAnim('airDown');
          } else if (animDone() && bird.anim !== 'airDown') {
            startAnim('airDown');
            bird.jumpAnim = null;
          }

          if (wp.kind === 'wall') {
            const crossed =
              bird.vx > 0 ? px <= wp.x && bird.x >= wp.x : px >= wp.x && bird.x <= wp.x;
            if (crossed) {
              const span = bird.x - px;
              const f = Math.abs(span) > 1e-6 ? (wp.x - px) / span : 1;
              bird.y = py + (bird.y - py) * f;
              bird.x = wp.x;
              bird.vx = 0;
              bird.vy = 0;
              bird.jumpAnim = null;
              bird.facing = (wp.side === 1 ? -1 : 1) as 1 | -1;
              setMode('wall');
              startAnim('crouch');
              if (Math.random() < 0.45) say(pickLine(LINE_WALL_JUMP), 2400);
            }
          } else if (bird.vy > 0 && py <= wp.y && bird.y >= wp.y) {
            /*
             * BUG 1 + 2: resolve the crossing to a SUB-FRAME time. The old
             * code assigned bird.x = target and bird.y = target on whichever
             * frame first noticed it was past, which at 1000px/s is a 16px
             * jolt on landing. Here the overshoot is rewound instead.
             */
            const span = bird.y - py;
            const f = span > 1e-6 ? (wp.y - py) / span : 1;
            land(wp.perch, wp.y, dt * (1 - f));
          } else if (bird.modeT > 3.2 || bird.y > scrollYNow + H + 400) {
            /* hand the live arc over: a hop that has timed out is already a
               fall, and zeroing its velocity here would be the jolt */
            enterFall(true);
          }
          break;
        }

        case 'wall': {
          if (bird.modeT > 0.14) {
            planIdx++;
            if (planIdx < planLen) launchTo(PLAN[planIdx], bird.hopUrgency);
            else enterFall();
          }
          break;
        }

        case 'land': {
          /* Walk off any overshoot from the touchdown rather than cutting it
             away; see land() and holdPerch(). */
          holdPerch(dt);
          /* CHAINING. Still badly out of the comfort band? Do not stop to
             preen — take off again almost immediately. */
          const u = bandUrgency();
          const dwell = u > 0.25 ? 0.07 : 0.24;
          if (bird.modeT > dwell) {
            if (bird.queuedAct) {
              const a = bird.queuedAct;
              bird.queuedAct = null;
              startAct(a);
              break;
            }
            if (planIdx + 1 < planLen) {
              planIdx++;
              launchTo(PLAN[planIdx], Math.max(u, bird.hopUrgency));
              break;
            }
            /* `!onErrand()` here is the gate that matters most. The light
               switch hangs from the top edge of the screen, so the moment he
               lands on it `bandUrgency` reads about as bad as it can, and
               without this he takes off again on the same frame he arrives. */
            if (u > 0.22 && !onErrand()) {
              planTo(pickBandPerch(u), u);
              break;
            }
            setMode('idle');
            /* landing should not always dump into breathe, or arriving
               somewhere new looks like the bird has nothing to say */
            if (Math.random() < 0.6) chooseIdle(bird.clock);
            else startAnim('breathe', 260);
          }
          break;
        }

        case 'fall': {
          /*
           * BUG 2, "the falling animation is a bit glitchy". Three separate
           * faults, all of which surfaced as the same jitter.
           *
           * (a) Terminal velocity was 1900 px/s while the frame delta is
           *     clamped at FRAME_MS_MAX = 100ms, so one slow frame moved him
           *     190px — straight past two or three headings without touching
           *     any of them, because a crossing test can only see what its
           *     own step brackets. He would sail through the page and then be
           *     recovered from below, which is the glitch. The fall is now
           *     SUBSTEPPED so no step travels more than FALL_STEP_PX, and
           *     terminal velocity is low enough to read as a bird rather than
           *     as a dropped stone.
           *
           * (b) The animation swap read "if he is playing neither airDown nor
           *     downGlide, choose one" — and enterFall had already set
           *     airDown, so the condition was false on every frame of every
           *     fall and downGlide never played once. A four-hundred-pixel
           *     drop looked exactly like a stumble off a kerb.
           *
           * (c) He arrived carrying whatever velocity the previous mode had
           *     left in vy. See enterFall.
           */
          bird.fallMs += dt * 1000;
          const steps = Math.max(
            1,
            Math.min(8, Math.ceil((Math.abs(bird.vy) * dt) / FALL_STEP_PX))
          );
          const sdt = dt / steps;
          let landed = false;
          for (let s = 0; s < steps && !landed; s++) {
            const py = bird.y;
            const px = bird.x;
            bird.vy = Math.min(bird.vy + GRAVITY * sdt, FALL_TERMINAL);
            bird.y += bird.vy * sdt;
            bird.x += bird.vx * sdt;
            bird.vx *= 1 - Math.min(1, sdt * 1.6);

            /*
             * A landing is a CROSSING: the perch's y has to lie between where
             * he was last step and where he is now. The original test was
             * `p.y > bird.y - 6`, true of every perch below him, and it then
             * assigned bird.y = p.y — so a fall from the top of the page
             * finished with the bird materialising two hundred pixels lower.
             */
            let hit: Perch | null = null;
            let hitY = Infinity;
            for (let i = 0; i < perches.length; i++) {
              const p = perches[i];
              if (p.y < py || p.y > bird.y) continue;
              if (bird.x < p.x0 - 26 || bird.x > p.x1 + 26) continue;
              if (p.y < hitY) {
                hitY = p.y;
                hit = p;
              }
            }
            if (hit) {
              const span = bird.y - py;
              const f = span > 1e-6 ? (hitY - py) / span : 1;
              bird.x = px + (bird.x - px) * f;
              land(hit, hitY, 0);
              landed = true;
            }
          }
          if (landed) break;

          /*
           * TUMBLE AND RECOVERY. A fall he was thrown into — shaken off the
           * cursor, or wrenched out of the reader's hand — opens on a
           * somersault and holds it for tumbleUntil, restarting it if it runs
           * out, because a single flip is a trick and a repeated one is a
           * bird that has lost control. Then he catches himself with a
           * flutter and it becomes an ordinary fall again, which is what
           * "with an appropriate animation" has to mean if the recovery is
           * going to read at all.
           */
          if (bird.clock < bird.tumbleUntil) {
            if (animDone()) startAnim(bird.anim);
          } else if (bird.tumbleUntil > 0) {
            bird.tumbleUntil = 0;
            startAnim('flutter', 0);
            /* Made off with the cursor on the way out: that flight takes
               priority over finding somewhere to sit. */
            if (swap.hold === 1 && !swap.returning) {
              enterFly(theftAwayX(), theftAwayY(), null, 880);
              break;
            }
            /* Catch himself properly if there is anywhere to catch onto. */
            const t = pickBandPerch(0.8);
            if (t && Math.abs(t.y - bird.y) > 40) {
              enterFly(targetXOn(t), t.y, t, 820);
              break;
            }
          } else if (bird.vy > 720 && bird.fallMs > 220 && bird.anim !== 'downGlide') {
            /* A short drop is a stumble; a long one opens into a glide. */
            startAnim('downGlide', 0);
          }

          /*
           * NOTHING UNDERNEATH.
           *
           * > "Quite often he struggles to find a nearby surface to land on
           * > and falls off the screen ... he sometimes jumps off a wall and
           * > just straight off the bottom of the screen."
           *
           * The net below this is 200px PAST the bottom edge, so by the time
           * it fires the reader has already watched him go. It stays, because
           * a net belongs somewhere nothing can get past it, but it should
           * almost never be the thing that catches him now.
           *
           * A fall is only a fall if there is something at the end of it. So
           * ask the landing question one frame early, in the same corridor the
           * crossing test uses: if nothing in it is both below him and still
           * on the screen, this drop has no ending, and he opens into a glide
           * toward something that has.
           *
           * Not while he is tumbling, and not while he is making off with the
           * cursor: both of those are set pieces with their own recoveries a
           * few lines up, and this would cut them off mid-gag.
           *
           * And not until he is into the lower half of the screen. A drop is
           * a picture in its own right — it is the whole staging of the light
           * cord letting go of him — and catching him at the top of it would
           * replace a fall with a bird who never falls.
           */
          if (
            bird.fallMs > 150 &&
            bird.y > scrollYNow + H * 0.55 &&
            bird.tumbleUntil === 0 &&
            swap.hold !== 1 &&
            !catchBelow(bird.x, bird.y)
          ) {
            const t = pickBandPerch(0.9) ?? nearestPerch();
            if (t) {
              enterFly(targetXOn(t), t.y, t, 900);
              break;
            }
          }

          if (bird.y > scrollYNow + H + 200) {
            /*
             * BUG 1, cause (a): recovery used to reposition him 420px above a
             * perch in a single assignment. He now FLIES back, which is both
             * continuous and the thing a bird would actually do.
             */
            const t = pickBandPerch(1) ?? nearestPerch();
            /* Fast, because this is a recovery and not a stroll: at 780 the
               climb back from below the fold took long enough that a reader
               who kept scrolling never saw him arrive. */
            if (t) enterFly(targetXOn(t), t.y, t, 1200);
            else enterFly(scrollXNow + W * 0.5, scrollYNow + H * 0.5, null, 1200);
          }
          break;
        }

        case 'drag': {
          /*
           * B4. He is held, and he is not pleased about it.
           *
           * He does NOT go exactly where the pointer is. He is approached
           * toward the grab point at a bounded speed — bounded harder the
           * angrier he is, because a bird pulling against you does not track
           * your hand — and the difference between where the hand is and
           * where he is IS the struggle. That also keeps the continuity rule:
           * a flick of the mouse across the page cannot teleport him, it can
           * only put him behind.
           */
          const tx = pointerDocX() + drag.grabX;
          const ty = pointerDocY() + drag.grabY;
          const resist = 1 - 0.45 * anger;
          bird.x = approach(bird.x, tx, dt, 1500 * resist);
          bird.y = approach(bird.y, ty, dt, 1500 * resist);
          /*
           * Facing is taken from the direction he is being HAULED, not from
           * which side of him the pointer is on: he is held at the pointer,
           * so that difference is a couple of pixels and its sign flips every
           * other frame, which reads as a strobe rather than a struggle. He
           * faces back against the pull, which is what pulling away looks
           * like. Deadbanded so a still hand does not flip him either.
           */
          if (Math.abs(pointer.vx) > 70) {
            bird.facing = (pointer.vx < 0 ? 1 : -1) as 1 | -1;
          }

          /* Hauling him about is what charges the anger, not merely holding
             him: pick him up and put him down and he forgives you. */
          drag.hauled += pointer.jerk;
          if (pointer.jerk > 0) {
            anger = Math.min(1, anger + pointer.jerk * ANGER_PER_PX);
          }

          const want = struggleAnim();
          if (animDone()) {
            drag.strugglePick++;
            startAnim(struggleAnim(), 0);
          } else if (bird.anim !== want && bird.animT > 260) {
            drag.strugglePick++;
            startAnim(want, 0);
          }

          /* ESCAPE. Rolled on a fixed tick so the odds mean what they say —
             a per-frame roll would make the frame rate part of the design. */
          if (bird.clock > drag.escapeAt) {
            drag.escapeAt = bird.clock + ESCAPE_TICK_MS;
            if (Math.random() < 0.05 + anger * 0.74) {
              escapeDrag();
              break;
            }
            if (Math.random() < 0.35) angerSay(1800);
          }
          /* Fully furious and still held: he gets out regardless, shortly. */
          if (anger >= 0.999 && drag.hauled > 900) {
            escapeDrag();
            break;
          }
          break;
        }

        case 'fly': {
          const dx = bird.flyX - bird.x;
          const dy = bird.flyY - bird.y;
          const d = Math.hypot(dx, dy);
          /* A ride brings its own animation. Everything below this line is
             a WINGBEAT model, and a bird under a balloon is not beating
             anything, so the ordinary animation clock carries it instead. */
          if (!ride.anim && bird.anim !== 'flyFlap' && bird.anim !== 'upFlap') {
            startAnim(dy < -20 ? 'upFlap' : 'flyFlap', 0);
          }
          /*
           * B1. Sustained flight drives the wing off a PHASE rather than off
           * the animation clock, and warps that phase onto the animation's
           * own timeline: FLAP_DOWN_FRAC of the wall clock covers everything
           * up to the bottom of the stroke, and the remainder — the larger
           * remainder — covers the recovery. Same keyframes, asymmetric beat.
           *
           * bird.animT is assigned rather than accumulated here, which is
           * safe precisely because it is a display clock: `animDone` is not
           * consulted in this mode (flyFlap and upFlap both loop) and the
           * phase is monotonic, so the pose never runs backwards.
           */
          if (!ride.anim) {
            const fa = currentAnim();
            const total = animDuration(fa);
            const down = wingBottomMs(fa);
            rig.flapPhase += (dt * 1000) / FLAP_CYCLE_MS;
            rig.flapPhase -= Math.floor(rig.flapPhase);
            bird.animT =
              rig.flapPhase < FLAP_DOWN_FRAC
                ? (rig.flapPhase / FLAP_DOWN_FRAC) * down
                : down +
                  ((rig.flapPhase - FLAP_DOWN_FRAC) / (1 - FLAP_DOWN_FRAC)) * (total - down);
          }

          if (d < 7) {
            land(bird.flyPerch, bird.flyY, 0);
            break;
          }
          const step = Math.min(d, bird.flySpeed * dt);
          bird.x += (dx / d) * step;
          bird.y += (dy / d) * step;
          if (Math.abs(dx) > 8) bird.facing = dx > 0 ? 1 : -1;
          /* the target may be a moving cursor, or furniture that reflowed */
          if (bird.flyPerch) {
            bird.flyY = bird.flyPerch.y;
            bird.flyX = Math.max(bird.flyPerch.x0 + 8, Math.min(bird.flyPerch.x1 - 8, bird.flyX));
            if (bird.flyPerch === cursorPerch) {
              bird.flyX = cursorPerch.x0 + 14;
            }
          }
          break;
        }

        case 'bit': {
          if (chat.current.open) {
            cutBit();
            break;
          }
          /* He stands where he was and the timeline drives everything else.
             holdPerch is still wanted: the furniture under him can reflow
             mid-set-piece and a creeper is no reason to sink through it. */
          holdPerch(dt);
          break;
        }

        case 'transit': {
          updateTransit(dt, vel);
          break;
        }

        case 'sleep': {
          if (chat.current.open) {
            setMode('chat');
            break;
          }
          holdPerch(dt);
          if (bird.anim !== 'sleep') startAnim('sleep', 0);
          if (bird.clock > bird.dreamUntil) {
            bird.dreamUntil = bird.clock + 3000 + Math.random() * 1000;
            bird.dreamIdx = (bird.dreamIdx + 1) % DREAM_ITEMS.length;
          }
          if (bandUrgency() > 0.35 || bird.clock > bird.sleepUntil) {
            setMode('act');
            actLen = 1;
            actIdx = 0;
            ACTS[0] = 'wakeUp';
            startAnim('wakeUp');
          }
          break;
        }

        case 'pvz': {
          if (chat.current.open || Math.abs(vel) > 12) {
            enterIdle();
            break;
          }
          holdPerch(dt);
          updatePvz(dt);
          break;
        }
      }

      moveDeliveryPacket();
      updateRig(dt);
      updateTheft(dt);
      checkOverUi();
      onHoverCheck();
      maybeWhisper();
    }

    /* ---- the rig, once a frame ------------------------------------------- */
    /*
     * Everything the compositor adds on top of the sampled pose is computed
     * here and nowhere else, AFTER the mode has run, so it always describes
     * the state he actually ended the frame in.
     */
    function updateRig(dt: number) {
      /* FLIGHT. Blended in and out over FLAP_BLEND so entering and leaving
         flight cannot snap a body offset into existence. */
      /* A ride is flight without a wingbeat: blending the flap rig in would
         put a wing-driven bob and pitch on a bird who is hanging off a
         balloon by his feet. */
      const flying = bird.mode === 'fly' && !ride.anim;
      rig.flight = approach(rig.flight, flying ? 1 : 0, dt, 1 / FLAP_BLEND);

      if (rig.flight > 0.001) {
        /*
         * The bob is a cosine of the WARPED phase, which is what puts the
         * asymmetry into the body as well as the wing: the rise happens over
         * the short powered downstroke and the settle over the long recovery.
         *
         * Sign: +y is down. At phase 0 the wing is at the top of its stroke
         * and the body is at its LOWEST, so bob is +FLAP_BOB there; half a
         * cycle later the wing has driven down and the body is at its
         * highest, so bob is -FLAP_BOB. That is the antiphase relationship,
         * and it is deliberately larger than the ±1px the sprite authors in
         * the opposite sense, so the NET motion reads the right way round.
         */
        const p = rig.flapPhase;
        const dphase =
          p < FLAP_DOWN_FRAC
            ? (p / FLAP_DOWN_FRAC) * 0.5
            : 0.5 + ((p - FLAP_DOWN_FRAC) / (1 - FLAP_DOWN_FRAC)) * 0.5;
        const c = Math.cos(dphase * Math.PI * 2);
        rig.bob = c * FLAP_BOB;
        /* Pitch is mostly a function of speed, with a small flap ripple: a
           bird leans hardest into the stroke that is doing the work. */
        const spd = Math.min(1, bird.flySpeed / FLAP_PITCH_REF);
        rig.pitch = FLAP_PITCH * spd * (0.74 - 0.26 * c);
      } else {
        rig.bob = 0;
        rig.pitch = 0;
      }

      /* GAZE. B3's "look upwards", held as a state rather than fired as an
         animation, so his head is at the pointer for as long as it is over
         him. Only while he is grounded and unoccupied — a bird mid-hop is
         looking where it is going. */
      const grounded =
        bird.mode === 'idle' || bird.mode === 'act' || bird.mode === 'land' || bird.mode === 'walk';
      let wantGaze = 0;
      if (grounded && !chat.current.open && pointerOnScreen()) {
        const px = pointerDocX();
        const py = pointerDocY();
        if (cursorIsAbove(px, py)) {
          /* Full tilt when it is right overhead, tailing off as it drifts up
             and away, so the head follows rather than snapping to a bracket. */
          const up = Math.min(1, (bird.y - py) / 150);
          const across = 1 - Math.min(1, Math.abs(px - bird.x) / 170);
          wantGaze = Math.max(0, Math.min(1, up * (0.45 + 0.55 * across)));
          rig.gazeDir = px >= bird.x ? 1 : -1;
        }
      }
      rig.gaze = approach(rig.gaze, wantGaze, dt, 4.5);

      /*
       * PECK AIM. Only while a peck is actually running: outside one there is
       * no reach to re-point, and leaving it live would tilt his head during
       * every other animation that happens to move a beak.
       *
       * Measured from his HEAD rather than his feet. `bird.y` is the baseline
       * he stands on, and the head sits about 18 device pixels above it, so
       * aiming from the feet makes a cursor level with his eye read as being
       * below him and he pecks at the floor.
       */
      const pecking = bird.anim === 'peckAtCursor' || bird.anim === 'peck';
      if (pecking && pointerOnScreen()) {
        const dx = pointerDocX() - bird.x;
        const dy = pointerDocY() - (bird.y - HEAD_ABOVE_BASE);
        /* into sprite space: +x is forward along his facing */
        const fx = dx * bird.facing;
        const len = Math.hypot(fx, dy);
        if (len > 6) {
          let ux = fx / len;
          let uy = dy / len;
          /*
           * He cannot peck backwards. The sprite has no rear-facing head and
           * a negative forward component would drive the beak through the back
           * of his own skull, so the aim is clamped into the forward half and
           * the turn is left to `bird.facing`, which the interaction sets
           * before the peck starts.
           */
          if (ux < 0.08) {
            uy = uy < 0 ? -1 : 1;
            ux = 0.08;
            const n = Math.hypot(ux, uy);
            ux /= n;
            uy /= n;
          }
          rig.aimX = ux;
          /* Down is charged less than up. He is standing on something: a peck
             driven hard downward puts the head through his own feet, and the
             one animation that genuinely does that (`peck` at the floor) has
             it authored in already. */
          rig.aimY = uy < 0 ? uy : uy * 0.55;
          rig.aim = 1;
        }
      } else if (rig.aim !== 0) {
        rig.aim = approach(rig.aim, 0, dt, 9);
      }

      /* STRUGGLE SHAKE. Amplitude scales with anger, exactly as the client
         asked. Capped at three sprite pixels and driven by two incommensurate
         sines, so it is violent-looking, continuous, and cannot ever be
         mistaken for a position jump. */
      if (bird.mode === 'drag') {
        const amp = 0.7 + anger * 2.3;
        const t = bird.clock;
        rig.shakeX = Math.sin(t * 0.031) * amp;
        rig.shakeY = Math.sin(t * 0.047 + 1.1) * amp * 0.7;
      } else if (rig.shakeX !== 0 || rig.shakeY !== 0) {
        rig.shakeX = approach(rig.shakeX, 0, dt, 14);
        rig.shakeY = approach(rig.shakeY, 0, dt, 14);
      }
    }

    /* ---- the stolen cursor, once a frame ---------------------------------- */
    function updateTheft(dt: number) {
      if (swap.hold === 0) return;
      /* Time is up, or the swap is not in force at all (reduced motion, tab
         hidden, pointer over a link) — in every one of those the reader has
         their real cursor back and holding a drawn one is meaningless. */
      if (reduced || !pointer.seen || bird.clock > swap.holdUntil + 4000) {
        dropCursor(false);
        return;
      }
      if (swap.hold === 1 && !swap.returning && bird.clock > swap.holdUntil) {
        swap.returning = true;
        /* Fly it home. He aims a little above the pointer so the hand-back
           reads as putting it down rather than colliding with it. */
        enterFly(pointerDocX(), pointerDocY() - 26, null, 760);
      }
      if (swap.returning) {
        /* Keep chasing the pointer, since the reader is probably moving it. */
        if (bird.mode === 'fly') {
          bird.flyX = pointerDocX();
          bird.flyY = pointerDocY() - 26;
        }
        const near = Math.hypot(pointerDocX() - bird.x, pointerDocY() - bird.y);
        if (near < 54) {
          swap.hold = 2;
          swap.returning = false;
          say(pickLine(LINE_RETURN), 2200);
          if (bird.mode === 'fly') {
            const p = pickBandPerch(0.5);
            if (p) enterFly(targetXOn(p), p.y, p, 700);
          }
        }
      }
      void dt;
    }

    /**
     * Reduced motion: correct and legible, but nothing animates. He holds the
     * first frame of `breathe` on a perch inside the comfort band, and when
     * the page scrolls far enough that his perch leaves the viewport he is
     * RESEATED rather than flown — a discrete reposition is the point here,
     * since travelling smoothly across the screen is the exact thing being
     * opted out of. Speech and chat both still work.
     */
    function updateReduced(dt: number) {
      lastDt = dt;
      bird.clock += dt * 1000;
      trackScroll(dt);
      bird.animT = 0;
      if (chat.current.open) {
        if (bird.mode !== 'chat') {
          setMode('chat');
          chatUi.glide = 1;
        }
        bird.x = scrollXNow + chatUi.seatX;
        bird.y = scrollYNow + chatUi.seatY;
        bird.facing = 1;
        const wantAnim = chat.current.busy ? CHAT_RESPONDING : chat.current.perch;
        if (bird.anim !== wantAnim) startAnim(wantAnim, 0);
      } else {
        if (bird.mode !== 'idle') setMode('idle');
        if (bird.anim !== 'breathe') startAnim('breathe', 0);
        const sy = bird.perch ? bird.perch.y - scrollYNow : -9999;
        if (!bird.perch || sy < H * 0.1 || sy > H * 0.9) {
          const p = pickBandPerch(1);
          if (p) {
            bird.perch = p;
            bird.x = (p.x0 + p.x1) * 0.5;
            bird.y = p.y;
          }
        } else {
          bird.y = bird.perch.y;
          bird.x = Math.max(bird.perch.x0 + 8, Math.min(bird.perch.x1 - 8, bird.x));
        }
      }
      /* Reduced motion opts out of the rig entirely: a flight bob, a gaze
         tilt and a struggle shake are all motion, and there is no version of
         them that is "static but correct". Zeroed, not eased. */
      rig.flight = 0;
      rig.bob = 0;
      rig.pitch = 0;
      rig.gaze = 0;
      rig.shakeX = 0;
      rig.shakeY = 0;
      if (swap.hold !== 0) dropCursor(false);
      checkOverUi();
      onHoverCheck();
      maybeWhisper();
    }

    /* ---- draw -------------------------------------------------------------- */

    /**
     * The one place the rig touches the puppet. Runs on the sampled POSE,
     * after sampleInto and before anything is blitted.
     *
     * Only POSITIONS are written here, never variants. That is not a style
     * preference: a variant is a different drawing, and easing between two
     * drawings is a crossfade, which is the one thing pixel art cannot
     * survive. Every term below is a continuous float added to dx/dy, and the
     * draw loop rounds each part to the sprite grid on its way out — so the
     * result still lands on whole pixels and still cannot shimmer.
     */
    function applyRig() {
      if (rig.flight > 0.001) {
        const p = rig.pitch * rig.flight;
        if (p > 0.01) {
          /*
           * PITCH, faked as a shear because the compositor has no rotation
           * and a rotated pixel sparrow would not be a pixel sparrow. Head
           * and beak go forward and down, tail goes back and up: the line
           * through the animal tips toward the direction of travel, which is
           * what the eye reads as pitch. dx is in SPRITE space, so it is
           * already mirrored with the facing and is always "forwards".
           */
          POSE.head.dx += p;
          POSE.head.dy += p * 0.45;
          POSE.eye.dx += p;
          POSE.eye.dy += p * 0.45;
          POSE.beak.dx += p * 1.35;
          POSE.beak.dy += p * 0.6;
          POSE.tail.dx -= p * 0.9;
          POSE.tail.dy -= p * 0.55;
          POSE.body.dy += p * 0.2;
        }
      }
      /*
       * THE AIM, applied by ROTATING the authored reach rather than adding to
       * it. Each part's sampled `dx` is how far this frame's keyframe has
       * driven it forward in sprite space; that magnitude is preserved and
       * only its direction changes. A peck at a cursor straight ahead is
       * therefore byte-identical to what the frames say, and a peck at one
       * overhead travels the same distance upward.
       *
       * dy is scaled by 1.25 because the head is nine pixels wide and the
       * sprite twenty-eight tall: equal pixel travel reads as less movement
       * vertically than horizontally.
       */
      if (rig.aim > 0.001 && (rig.aimY !== 0 || rig.aimX !== 1)) {
        const a = rig.aim;
        const kx = 1 + (rig.aimX - 1) * a;
        const ky = rig.aimY * a * 1.25;
        for (let i = 0; i < AIM_PARTS.length; i++) {
          const part = AIM_PARTS[i];
          const p = POSE[part];
          if (!p) continue;
          const reach = p.dx;
          if (reach === 0) continue;
          p.dx = reach * kx;
          p.dy += reach * ky;
        }
      }
      if (rig.gaze > 0.001) {
        /* Head back, beak up, and turned toward the pointer across. The
           amounts are small because the head is only nine pixels wide. */
        const g = rig.gaze;
        POSE.head.dy -= g * 2;
        POSE.eye.dy -= g * 2.2;
        POSE.beak.dy -= g * 2.4;
        const across = g * rig.gazeDir * (bird.facing === 1 ? 1 : -1);
        POSE.eye.dx += across;
        POSE.beak.dx += across * 1.2;
        POSE.tail.dy += g * 0.8;
      }
    }

    /**
     * The drawn cursor, and the only writer of the swap.
     *
     * Returns true when a pixel cursor was actually painted this frame, which
     * is the ONLY evidence `syncCursorSwap` will accept for hiding the real
     * one. Everything about this function is arranged so that the failure
     * mode is a visible system cursor rather than an invisible one.
     */
    function cursorWanted(): boolean {
      if (reduced) return false;
      if (document.hidden) return false;
      if (!pointer.seen || !pointerOnScreen()) return false;
      /* NOT `if (pointer.overUi) return false` any more. The swap used to
         stand down over anything clickable; the drawn cursor now changes
         colour there instead. See CURSOR_MATRIX_OVER. */
      if (W < 2 || H < 2) return false;
      if (chat.current.open) return false;
      return true;
    }

    function drawCursor(): boolean {
      if (!cursorWanted()) {
        /* Losing the swap while he is holding it ends the theft: the reader
           is looking at their real pointer again and a second one flying
           about the page would be two cursors, not a joke. */
        if (swap.hold !== 0) dropCursor(false);
        swap.cx = pointer.x;
        swap.cy = pointer.y;
        return false;
      }
      const img = pointer.overUi ? cursorImgOver : cursorImg;
      if (!img) return false;

      /* Where it should be. Free: exactly under the real pointer, no easing —
         a cursor that lags is a cursor that is broken. Held or handing back:
         eased toward the target, because that motion is the whole point. */
      if (swap.hold === 0) {
        swap.cx = pointer.x;
        swap.cy = pointer.y;
      } else {
        let tx: number;
        let ty: number;
        if (swap.hold === 1) {
          /* In the beak. The beak sits high and forward on the puppet. */
          tx = bird.x - scrollXNow + bird.facing * 13;
          ty = bird.y - scrollYNow - 30;
        } else {
          tx = pointer.x;
          ty = pointer.y;
        }
        const dx = tx - swap.cx;
        const dy = ty - swap.cy;
        const d = Math.hypot(dx, dy);
        /* Frame-rate independent, and fast: 2600 px/s crosses a viewport in
           well under a second, so the handback never feels like a hostage
           negotiation. draw() has no dt of its own, so it borrows the one the
           update it follows was given. */
        const step = Math.min(d, 2600 * lastDt);
        if (d > 0.01) {
          swap.cx += (dx / d) * step;
          swap.cy += (dy / d) * step;
        }
        if (swap.hold === 2 && d < 5) {
          swap.hold = 0;
          swap.cx = pointer.x;
          swap.cy = pointer.y;
        }
      }

      const w = img.width * CURSOR_SCALE;
      const h = img.height * CURSOR_SCALE;
      ctx!.imageSmoothingEnabled = false;
      ctx!.drawImage(img, Math.round(swap.cx), Math.round(swap.cy), w, h);
      swap.paintedAt = performance.now();
      return true;
    }

    /**
     * Put the class on, or take it off. Called with the result of drawCursor,
     * at the end of every frame.
     *
     * The class only ever goes on off the back of a cursor that was painted
     * THIS FRAME. If the loop stalls, if the tab hides, if the component
     * unmounts, if reduced motion turns on, if the pointer crosses a link —
     * this is called with false, or is not called at all and the watchdog
     * calls `restoreCursor` instead. Both paths end in the real pointer.
     */
    function syncCursorSwap(painted: boolean) {
      if (painted === swap.on) return;
      swap.on = painted;
      document.documentElement.classList.toggle(CURSOR_SWAP_CLASS, painted);
    }

    /** The unconditional way back. Safe to call at any time, from anywhere. */
    function restoreCursor() {
      if (swap.hold !== 0) {
        swap.hold = 0;
        swap.returning = false;
      }
      if (swap.on) {
        swap.on = false;
        document.documentElement.classList.remove(CURSOR_SWAP_CLASS);
      }
    }

    function drawPropInSprite(name: PropName) {
      const img = atlas.get(`prop:${name}`);
      if (!img) return;
      const p = PROPS[name];
      ctx!.drawImage(
        img,
        p.ox * PIXEL_SCALE,
        p.oy * PIXEL_SCALE,
        img.width * PIXEL_SCALE,
        img.height * PIXEL_SCALE
      );
    }

    /** Screen-space blit for things that are not attached to the puppet. */
    function drawPropAt(name: PropName, sx: number, sy: number, mirror: boolean) {
      const img = atlas.get(`prop:${name}`);
      if (!img) return;
      const w = img.width * PIXEL_SCALE;
      const h = img.height * PIXEL_SCALE;
      const x = Math.round(sx);
      const y = Math.round(sy);
      ctx!.save();
      if (mirror) {
        ctx!.translate(x + w, y);
        ctx!.scale(-1, 1);
        ctx!.drawImage(img, 0, 0, w, h);
      } else {
        ctx!.drawImage(img, x, y, w, h);
      }
      ctx!.restore();
    }


    /**
     * A SET-PIECE ACTOR, at an arbitrary screen position.
     *
     * `sx, sy` is its BOTTOM CENTRE, because everything in a set piece either
     * stands on the line he is standing on or hangs over his head, and both of
     * those are measured from the middle of the thing rather than its corner.
     *
     * `turn` is a HORIZONTAL scale and it is how a flat sprite rotates: squash
     * it toward its own centre line, let it go through zero, and it comes back
     * showing its other side. Putting a pixel bitmap through a real rotation
     * matrix stops it being pixel art on the first frame that is not square.
     * `grow` scales both axes, for things that swell.
     */
    function drawActor(
      name: PropName,
      sx: number,
      sy: number,
      alpha = 1,
      turn = 1,
      grow = 1,
      mirror = false
    ) {
      const fallback = atlas.get(`prop:${name}`);
      const useAuthenticTotem = name === 'totem'
        && totemTexture.complete
        && totemTexture.naturalWidth > 0;
      const img = useAuthenticTotem ? totemTexture : fallback;
      if (!img || alpha <= 0.004) return;
      const sourceW = useAuthenticTotem ? totemTexture.naturalWidth : img.width;
      const sourceH = useAuthenticTotem ? totemTexture.naturalHeight : img.height;
      const w = sourceW * PIXEL_SCALE * grow;
      const h = sourceH * PIXEL_SCALE * grow;
      ctx!.save();
      ctx!.globalAlpha = Math.min(1, alpha);
      ctx!.imageSmoothingEnabled = false;
      ctx!.translate(Math.round(sx), Math.round(sy));
      ctx!.scale(turn * (mirror ? -1 : 1), 1);
      ctx!.drawImage(img, -w / 2, -h, w, h);
      ctx!.restore();
    }

    /** 1 while the bit runs, easing to 0 over its last stretch. */
    function bitFade(): number {
      if (!bit.name) return 0;
      const left = BIT_LEN[bit.name] - bit.t;
      return left >= BIT_FADE_MS ? 1 : Math.max(0, left / BIT_FADE_MS);
    }

    /** Everything in a set piece that stands behind him. */
    function drawBitBehind(offX: number, offY: number) {
      if (!bit.name) return;
      const f = bitFade();
      const x = bit.ax - offX;
      const y = bit.ay - offY;
      switch (bit.name) {
        case 'creeper': {
          if (bit.t >= CREEP.boom) break;
          const hs = (bit.t - CREEP.hiss) / (CREEP.boom - CREEP.hiss);
          let lit = false;
          let swell = 1;
          if (hs > 0) {
            /* The fuse: it flashes faster the closer it gets and swells while
               it does, which is the only part of a creeper anyone recalls. */
            const period = 230 - 160 * hs;
            lit = (bit.t - CREEP.hiss) % period < period * 0.5;
            swell = 1 + 0.18 * hs;
          }
          drawActor(lit ? 'creeperLit' : 'creeper', x, y, f, 1, swell);
          break;
        }
        case 'bttf': {
          /* The trail exists only while it is actually moving. Four stamps
             along what it has just covered, thinning as they go. */
          if (bit.t >= BTTF.away) {
            for (let i = 0; i < 4; i++) {
              drawActor(
                'deloreanFire',
                x - bit.side * (70 + i * 32),
                y - 18,
                f * (0.9 - i * 0.2),
                1,
                1 + i * 0.12,
                bit.side === -1
              );
            }
          }
          /* It arrives nose-first at him and leaves the way it came, so the
             mirror flips at the departure: a car driving off in reverse is a
             sprite that forgot to turn round. */
          const leaving = bit.t >= BTTF.away;
          /* grow 1, not 1.5. The sprite is 56 wide now rather than 30, so it
             is the same 224px of car at the bird's own pixel size instead of
             180px of visibly chunkier one. */
          drawActor(
            deloreanSprite(bit.t),
            x,
            y,
            f,
            1,
            1,
            leaving ? bit.side === -1 : bit.side === 1
          );
          if (bit.t >= BTTF.out && bit.t < BTTF.line) {
            const m: PropName =
              bit.t >= BTTF.knees && bit.t < BTTF.inCar
                ? 'martyKnee'
                : bit.t >= BTTF.play
                  ? 'martyPlay'
                  : 'martyStand';
            drawActor(m, bit.bx - offX, bit.by - offY, f, 1, 1, bit.side === 1);
          }
          break;
        }
        case 'lantern': {
          drawActor('pumpkin', x, y, f * Math.min(1, bit.t / 420), 1, 1.4);
          break;
        }
        case 'gift': {
          drawActor('present', x, y, f, 1, 1.3);
          /* Down under the chute the rig already owns. */
          if (bit.t < GIFT.land) drawActor('parachute', x, y - 46, f, 1, 1);
          break;
        }
        case 'egg': {
          drawActor(bit.t >= EGGB.crack ? 'eggCracked' : 'egg', x, y, f, 1, 1.3);
          if (bit.t >= EGGB.hatch) {
            drawActor('chick', bit.bx - offX, bit.by - offY, f, 1, 1.2, bit.side === -1);
          }
          break;
        }
      }
    }

    /** Everything in a set piece that goes over the top of him. */
    function drawBitFront(offX: number, offY: number) {
      if (!bit.name) return;
      const f = bitFade();
      const x = bit.ax - offX;
      const y = bit.ay - offY;
      switch (bit.name) {
        case 'creeper': {
          const bt = bit.t - CREEP.boom;
          if (bt >= 0 && bt < 460) {
            /* Centred between the two of them, because it takes them both. */
            const mid = (bit.ax + bird.x) * 0.5 - offX;
            const name: PropName = bt < 110 ? 'blastA' : bt < 250 ? 'blastB' : 'blastC';
            const a = bt < 250 ? f : f * Math.max(0, 1 - (bt - 250) / 210);
            drawActor(name, mid, y + 26, a, 1, 1 + bt / 520);
          }
          if (bit.t >= CREEP.totem) {
            const u = (bit.t - CREEP.totem) / (CREEP.len - CREEP.totem);
            /* A full Minecraft-style item spin. drawActor mirrors at the
               negative half-turn and compresses through an edge-on silhouette. */
            const turn = Math.cos((bit.t - CREEP.totem) * 0.0115);
            const a = f * (u < 0.7 ? 1 : Math.max(0, 1 - (u - 0.7) / 0.3));
            /* grow 1.1: the sprite went from 18 rows to 22 when the face
               was given room to be a face, and 1.3 made it taller than him. */
            drawActor('totem', bird.x - offX, bird.y - offY - 82 - u * 34, a, turn, 1.1);
          }
          break;
        }
        case 'bttf': {
          if (bit.t >= BTTF.play && bit.t < BTTF.inCar) {
            for (let i = 0; i < 3; i++) {
              const nt = (bit.t - BTTF.play + i * 430) % 1300;
              const u = nt / 1300;
              drawActor(
                'musicNote',
                bit.bx - offX - bit.side * 12 + Math.sin(u * 6.2 + i * 2) * 13,
                bit.by - offY - 70 - u * 54,
                f * (1 - u) * 0.9,
                1,
                0.68
              );
            }
          }
          const lt = bit.t - BTTF.strike;
          if (lt >= 0 && lt < 330) {
            /* Three flickers rather than one flash. A bolt that appears once
               reads as a sprite; one that stutters reads as lightning. */
            const on = lt < 90 || (lt > 150 && lt < 212) || (lt > 252 && lt < 302);
            if (on) {
              /* On the viewport surface: a bolt runs to the top of the SCREEN,
                 which is a good deal further than the band around him reaches.
                 Same reasoning as the rope, a few branches down. */
              const prev = ctx;
              ctx = pageCtx;
              const vx = bit.ax - scrollXNow;
              let by = bit.ay - scrollYNow - 74;
              for (let i = 0; i < 16 && by > -90; i++) {
                drawActor('bolt', vx + Math.sin(i * 1.7) * 11, by, f, 1, 1.5);
                by -= 68;
              }
              ctx = prev;
            }
          }
          break;
        }
        case 'lantern': {
          const u = (bit.t - LANT.ghost) / (LANT.up - LANT.ghost);
          if (u > 0) {
            const a = u < 0.75 ? Math.min(1, u * 5) : Math.max(0, 1 - (u - 0.75) / 0.25);
            drawActor('ghost', bit.bx - offX, bit.by - offY, f * a * 0.85, 1, 1.2);
          }
          break;
        }
        case 'gift': {
          if (bit.t >= GIFT.open && bit.t < GIFT.open + 720) {
            const u = (bit.t - GIFT.open) / 720;
            for (let i = 0; i < 5; i++) {
              const a2 = (i / 5) * Math.PI * 2;
              drawActor(
                'sparkle',
                x + Math.cos(a2) * u * 48,
                y - 26 + Math.sin(a2) * u * 42,
                f * (1 - u)
              );
            }
          }
          break;
        }
      }
    }

    /**
     * The snow, on the VIEWPORT surface rather than the band.
     *
     * It belongs to the screen, not to the paragraph he happens to be standing
     * on, so it goes on the fixed canvas the way the rope does. Deterministic
     * rather than stored: eighteen flakes whose whole state is the clock, so
     * this allocates nothing and survives a resize without a respawn.
     */
    function drawSnow() {
      if (bit.name !== 'gift') return;
      const prev = ctx;
      ctx = pageCtx;
      const f = bitFade();
      for (let i = 0; i < 26; i++) {
        const lane = ((i * 4423) % 977) / 977;
        const rate = 0.05 + (i % 5) * 0.014;
        const sxp = lane * W + Math.sin(bit.t * 0.0011 + i) * 24;
        const syp = ((bit.t * rate + i * 137) % (H + 70)) - 34;
        drawActor('snowflake', sxp, syp, f * 0.6, 1, 0.45 + (i % 3) * 0.15);
      }
      ctx = prev;
    }

    function draw() {
      ctx = pageCtx;
      pageCtx.clearRect(0, 0, W, H);

      const anim = currentAnim();
      sampleInto(anim, bird.animT);
      applyRig();
      const frameIndex = SAMPLED_FRAME;

      /*
       * CULLING ONLY. This is the one place in the paint path still allowed to
       * read scrollY, because a stale value here costs at worst one wasted
       * frame or one frame skipped while he is 260px outside the viewport.
       * It never decides WHERE he is drawn — see THE SCROLL FIX above.
       */
      const onScreen =
        bird.y - scrollYNow > -260 && bird.y - scrollYNow < H + 260;

      /* ---- pick the surface, and the space that comes with it ---- */
      /*
       * `docOffX/Y` is what turns a document coordinate into a coordinate on
       * whichever canvas we are painting. On the band it is the band's own
       * top edge, a number we chose, so it is exact. On the fallback path it
       * is the scroll offset, which is the thing that lags.
       *
       * scrollX is 0 on this site — `overflow-x: hidden` is set on both html
       * and body in globals.css — so the band's x needs no offset, and the
       * bubble's viewport clamp below stays correct without one.
       */
      /*
       * THE ONE EXCEPTION TO THE BAND, and it is the mirror image of the bug
       * the band was built to fix.
       *
       * The band lives in DOCUMENT flow, so the compositor scrolls it and he
       * can never lag behind the page. That is exactly right for furniture
       * that is part of the page, and exactly WRONG for furniture pinned to
       * the viewport. The light cord does not move when the page scrolls, so
       * a bird carried along with the document detaches from it by a frame of
       * scroll every frame: about 25px at a modest 1500px/s, and a quarter of
       * his own height, opening to well over 100px on a fling.
       *
       * And the switch event is TRIGGERED BY SCROLLING into the plate, so the
       * reader is nearly always still moving when he arrives. The single
       * frame the whole sequence exists to sell — his weight landing on the
       * cord — is the frame most likely to show him hovering beside it.
       *
       * On a viewport-anchored perch he goes on the fixed canvas instead,
       * where the same compositor pins him and the cord together. Included
       * while he is still on his way, so the surface is already right before
       * he lands and there is no correction on the frame he arrives.
       */
      let anchoredNow = bird.perch?.fixed === true || bird.flyPerch?.fixed === true;
      for (let i = planIdx; !anchoredNow && i < planLen; i++)
        anchoredNow = PLAN[i].perch?.fixed === true;

      let docOffX: number;
      let docOffY: number;
      if (useBand) {
        const maxTop = Math.max(0, docH - BAND_H);
        const top = Math.max(0, Math.min(maxTop, Math.round(bird.y) - BAND_UP));
        if (top !== bandTop) {
          bandTop = top;
          band.style.transform = `translate3d(0,${top}px,0)`;
        }
        /* Cleared whichever surface we then draw on, or the band keeps the
           last frame it was given while he is painted somewhere else. */
        bandCtx.clearRect(0, 0, W, BAND_H);
      }
      if (useBand && !anchoredNow) {
        docOffX = 0;
        docOffY = bandTop;
        ctx = bandCtx;
      } else {
        docOffX = scrollXNow;
        docOffY = scrollYNow;
      }
      const sx = bird.x - docOffX;
      const sy = bird.y - docOffY;

      /* ---- the lawn, behind him ---- */
      if (bird.mode === 'pvz') {
        const floor = pvz.floorY - docOffY;
        const zName = ZOMBIE_WALK[pvz.frame];
        const zImg = atlas.get(`prop:${zName}`);
        const zh = zImg ? zImg.height * PIXEL_SCALE : 0;
        const zw = zImg ? zImg.width * PIXEL_SCALE : 0;
        const mirror = pvz.side === -1; // authored facing LEFT
        if (pvz.z1Alive) drawPropAt(zName, pvz.z1x - docOffX - zw * 0.5, floor - zh, mirror);
        if (pvz.z0Alive) drawPropAt(zName, pvz.z0x - docOffX - zw * 0.5, floor - zh, mirror);
      }

      /* ---- the set piece, behind him ---- */
      drawBitBehind(docOffX, docOffY);

      if (onScreen) {
        /* Snap the whole puppet to the pixel grid. Drawn at a fractional
           offset a pixel sparrow shimmers, which undoes the entire look. */
        /*
         * THE BODY BOB AND THE STRUGGLE SHAKE, applied to the whole puppet
         * rather than part by part — they are the animal moving, not a limb.
         * Rounded to WHOLE SPRITE PIXELS before scaling, so the bird bobs up
         * the pixel grid in steps of PIXEL_SCALE and never lands between two
         * device pixels. That staircase is the correct look; a smooth one
         * would be a blurred one.
         *
         * Both are bounded by construction (FLAP_BOB, and the anger-scaled
         * shake amplitude), so neither can produce anything a reader would
         * read as a jump — which is why they are allowed to live here at all
         * rather than in the physics.
         */
        const rigX = Math.round(rig.shakeX) * PIXEL_SCALE;
        const rigY = Math.round(rig.bob * rig.flight + rig.shakeY) * PIXEL_SCALE;
        const originX = Math.round(sx) - (SPRITE_WIDTH * PIXEL_SCALE) / 2 + rigX;
        const originY = Math.round(sy) - BASELINE_Y * PIXEL_SCALE + rigY;

        /* pvzBurrow and pvzPopUp drive every part 11-14px BELOW the baseline.
           Without this clip you get a sparrow standing calmly under the floor
           instead of a sparrow underground. This is the one hard requirement
           the sprite data cannot enforce for itself. */
        /*
         * Named, not inferred. The obvious clever version of this test is
         * "clip whenever the sampled pose reaches below the baseline", and it
         * is wrong twice over: `peck` drives the head twelve pixels down to
         * reach the floor and `downCrash` nine, so a depth test clips a bird
         * who is merely bending over; and the `shadow` part is anchored at
         * row 26 with a two-row `wide` variant, so it lives below the clip
         * line by design in every animation there is. The two digs are the
         * only poses that mean "underground", and they are known by name.
         */
        const needsClip = bird.anim === 'pvzBurrow' || bird.anim === 'pvzPopUp';
        ctx!.save();
        if (needsClip) {
          ctx!.beginPath();
          ctx!.rect(0, 0, W, originY + (BASELINE_Y + 1) * PIXEL_SCALE);
          ctx!.clip();
        }

        ctx!.save();
        ctx!.imageSmoothingEnabled = false;
        /* How solid he is. Only a set piece ever moves it, and every exit from
           one puts it back, so this is the only line in the paint path that
           has to know the fade exists. */
        ctx!.globalAlpha = bird.alpha;
        const flips = flipsBefore(anim, bird.animT);
        const facing = flips % 2 === 1 ? ((-bird.facing) as 1 | -1) : bird.facing;
        if (facing === -1) {
          ctx!.translate(originX + SPRITE_WIDTH * PIXEL_SCALE, originY);
          ctx!.scale(-1, 1);
        } else {
          ctx!.translate(originX, originY);
        }

        /* props behind the puppet. One list, shared with headBlocked(), so
           the bubble can never disagree with what was actually drawn. */
        const props = activeProps();
        for (let i = 0; i < props.length; i++) {
          if (PROPS[props[i]].layer === 'behind') drawPropInSprite(props[i]);
        }

        for (let k = 0; k < DRAW_ORDER.length; k++) {
          const part = DRAW_ORDER[k];
          const p = POSE[part];
          if (!p) continue;
          const img = atlas.get(`${part}:${p.variant}`);
          if (!img) continue;
          const def = PARTS[part] as any;
          const sprite = def.variants[p.variant];
          const ax = def.anchor.x + (sprite.ox ?? 0) + Math.round(p.dx);
          const ay = def.anchor.y + (sprite.oy ?? 0) + Math.round(p.dy);
          ctx!.drawImage(
            img,
            ax * PIXEL_SCALE,
            ay * PIXEL_SCALE,
            img.width * PIXEL_SCALE,
            img.height * PIXEL_SCALE
          );
        }

        /* props in front */
        for (let i = 0; i < props.length; i++) {
          if (PROPS[props[i]].layer === 'front') drawPropInSprite(props[i]);
        }
        if (bird.mode === 'sleep') {
          /* the dream itself, centred in the bubble */
          const item = DREAM_ITEMS[bird.dreamIdx];
          const img = atlas.get(`prop:${item}`);
          if (img) {
            /* Round to a whole SPRITE pixel before scaling. Centring an
               odd-sized item on the bubble's centre otherwise lands it on a
               half cell, which in pixel art is not a subtle offset — it is the
               only thing on screen that does not sit on the grid, and it reads
               as blur. dreamSeed was five pixels tall and did exactly this. */
            const b = PROPS.dreamBubble;
            const cx = Math.round(b.ox + 7 - img.width / 2) * PIXEL_SCALE;
            const cy = Math.round(b.oy + 5 - img.height / 2) * PIXEL_SCALE;
            ctx!.drawImage(img, cx, cy, img.width * PIXEL_SCALE, img.height * PIXEL_SCALE);
          }
        }
        ctx!.restore();
        ctx!.restore();
      }

      /* ---- the line he came down on ---- */
      /*
       * > "The rope should come from right at the top of the screen when
       * > coming down and he should slide down it until he jumps off."
       *
       * The rope prop is 28 sprite rows — exactly one sprite height — and its
       * own comment has always said the rig can "tile it upward for as long as
       * the drop needs". Nothing ever did: `drawPropInSprite` blits it once, so
       * what the reader actually saw was a bird holding a 112px offcut of rope
       * that began in mid-air a hand's width above his head.
       *
       * So this tiles it, on the VIEWPORT canvas rather than the band, because
       * the top of the screen is the one end of it that is anchored. That is
       * also consistent rather than an exception: a transit is the one mode
       * that deliberately rides the viewport (see the sanctioned screen-space
       * move in updateTransit), so during one there is nothing to lag behind.
       *
       * The column is centred on him because the prop is: it sits at ox 8 and
       * is 4 wide, so its centre is sprite column 10, which is the sprite's own
       * centre line. The sprite-space copy still draws in his beak; this picks
       * up where that one's top edge is and carries on to the ceiling.
       */
      if (bird.mode === 'transit' && transit.name === 'downRope' && onScreen) {
        const rope = atlas.get('prop:rope');
        if (rope) {
          const prev = ctx;
          ctx = pageCtx;
          const rw = rope.width * PIXEL_SCALE;
          const rh = rope.height * PIXEL_SCALE;
          const vx = bird.x - scrollXNow;
          const vy = bird.y - scrollYNow;
          /* Where the sprite-space copy's top edge lands, in viewport space:
             puppet origin is vy - BASELINE_Y*scale, and the prop sits at
             oy -20 above that. */
          const spriteRopeTop =
            vy - BASELINE_Y * PIXEL_SCALE + PROPS.rope.oy * PIXEL_SCALE;
          for (let y = spriteRopeTop - rh; y > -rh; y -= rh) {
            drawPropAt('rope', vx - rw / 2, y, false);
          }
          ctx = prev;
        }
      }

      /* ---- the set piece, over the top of him ---- */
      drawBitFront(docOffX, docOffY);
      drawSnow();

      /* ---- the pea and its splat, in front of everything ---- */
      if (bird.mode === 'pvz') {
        if (pvz.peaLive) drawPropAt('pea', pvz.peaX - docOffX, pvz.peaY - docOffY, false);
        if (pvz.splatT > 0)
          drawPropAt('peaSplat', pvz.splatX - docOffX, pvz.splatY - docOffY, pvz.side === -1);
      }

      /* ---- chat window ---- */
      if (chat.current.open) {
        /* Back to the viewport surface. The chat window is anchored to the
           screen, not to the page, so it belongs on the fixed canvas — and it
           has no lag problem there, because it does not move while you
           scroll. The bubble, two branches down, is the opposite: it hangs off
           his beak and has to travel with him, so it stays on the band. */
        ctx = pageCtx;
        /* the input is mounted a frame late; keep it over the pixel row */
        positionInput();
        const draft = chatDraft();
        if (
          chatUi.dirty ||
          chatUi.lastVersion !== chat.current.version ||
          chatUi.lastDraft !== draft ||
          chatUi.lastBusy !== chat.current.busy
        ) {
          chatUi.lastVersion = chat.current.version;
          chatUi.lastDraft = draft;
          chatUi.lastBusy = chat.current.busy;
          buildChat();
        }
        ctx!.drawImage(chatCanvas, Math.round(chatUi.x), Math.round(chatUi.y));
        /* caret, blinking, drawn live so the window does not rebuild for it */
        if (!chat.current.busy && Math.floor(bird.clock / 530) % 2 === 0) {
          ctx!.fillStyle = theme.ink;
          ctx!.fillRect(
            Math.round(chatUi.x + chatUi.caretCells * FONT_PX),
            Math.round(chatUi.y + ((chatUi as any).caretY ?? 0) * FONT_PX),
            FONT_PX,
            GLYPH_H * FONT_PX
          );
        }
      } else if (bubble.text && bubble.until > bird.clock && onScreen) {
        /* ---- speech bubble ---- */
        if (bubble.dirty) buildBubble();
        if (bubble.w) {
          const tailPx = bubble.tailCells * FONT_PX;
          const headY = sy - SPRITE_HEIGHT * PIXEL_SCALE + 10;
          /*
           * ROOM is measured in VIEWPORT space; PLACEMENT happens in surface
           * space. The two differ now that the bird is drawn on a band that
           * scrolls with the document — his surface y is about 420 whatever the
           * scroll is doing, so "would the bubble go off the top of the screen"
           * is a question the band cannot answer about itself. `vy` is a frame
           * stale during a fling, which for a placement decision is invisible:
           * the worst case is one late flip.
           */
          const vy = bird.y - scrollYNow;
          const roomAbove = vy - SPRITE_HEIGHT * PIXEL_SCALE + 10 - bubble.h - tailPx;
          let bx: number;
          let by: number;
          let edge: 'up' | 'down' | 'left' | 'right';

          if (headBlocked()) {
            /*
             * Something is over his head — a chute, an umbrella, a balloon,
             * the rope, the beanie — and a bubble above him would cover the
             * one thing worth looking at. Go alongside, on whichever side has
             * the room, and only fall back to underneath when neither side
             * does.
             */
            /* From his SHOULDER, not his centre. The first version measured
               18px off `sx` and the sprite is 80px wide, so the bubble landed
               on top of the bird it was supposed to be avoiding. */
            const gapPx = (SPRITE_WIDTH * PIXEL_SCALE) / 2 + 14;
            const fitsRight = sx + gapPx + bubble.w <= W - 8;
            const fitsLeft = sx - gapPx - bubble.w >= 8;
            /* His own facing breaks the tie: a bubble behind his head reads as
               someone else talking. */
            const preferRight = fitsRight && (!fitsLeft || bird.facing === 1);
            if (fitsRight || fitsLeft) {
              bx = Math.round(preferRight ? sx + gapPx : sx - gapPx - bubble.w);
              edge = preferRight ? 'left' : 'right';
              /* level with his chest rather than his feet */
              by = Math.round(sy - SPRITE_HEIGHT * PIXEL_SCALE * 0.55 - bubble.h * 0.5);
            } else {
              bx = Math.round(sx - bubble.bodyW * FONT_PX * 0.5);
              bx = Math.max(8, Math.min(Math.max(8, W - bubble.w - 8), bx));
              by = Math.round(sy + 18 + tailPx);
              edge = 'up';
            }
          } else {
            bx = Math.round(sx - bubble.bodyW * FONT_PX * 0.5);
            bx = Math.max(8, Math.min(Math.max(8, W - bubble.w - 8), bx));
            by = Math.round(headY - bubble.h - tailPx);
            edge = 'down';
            if (roomAbove < 8) {
              /* no room above him: sit below and turn the tail over */
              by = Math.round(sy + 18 + tailPx);
              edge = 'up';
            }
          }
          ctx!.drawImage(bubbleCanvas, bx, by);
          drawBubbleTail(bx, by, sx, sy - SPRITE_HEIGHT * PIXEL_SCALE * 0.55, edge);
        }
      } else if (bubble.text && bubble.until <= bird.clock) {
        bubble.text = '';
      }

      /* LAST. On top of the bird, the bubble and the chat window, because a
         real cursor is on top of everything — and after them, so the class
         can only ever be turned on by a frame that got this far.

         On the viewport canvas, unconditionally: a cursor that scrolled with
         the page would not be a cursor. */
      ctx = pageCtx;
      syncCursorSwap(drawCursor());
    }

    /* ---- boot ------------------------------------------------------------- */
    resize();
    readTheme();
    measure();
    lastScrollY = scrollYNow;
    (function seat() {
      /* never open on viewport-anchored furniture: that is a screen position,
         not a place on the page, and on narrow screens the rail is the
         topmost perch there is */
      const p = perches.find((q) => q.w > 220 && !q.fixed) ?? perches.find((q) => !q.fixed);
      if (!p) return;
      bird.perch = p;
      bird.x = p.x0 + Math.min(140, (p.x1 - p.x0) * 0.3);
      bird.y = p.y;
    })();

    /*
     * RE-MEASURING IS NOT FREE AND IT IS NOT INVISIBLE.
     *
     * It used to be one function doing three jobs: reallocate both canvases,
     * re-read the document height, and re-harvest every perch. Everything
     * that could possibly want any of the three called all three. Counted on
     * the production build, one plate change did that six times and set a
     * canvas width 57 times -- the main canvas is up to 2880x1800, and
     * assigning `width` reallocates and clears it.
     *
     * The visible half of the problem is worse than the cost. `measure`
     * carries the bird with his furniture, which is right when a heading
     * really has moved and wrong six times a second while forty reveals are
     * each part way through a 14px travel. He was being carried to six
     * different wrong places per plate, which is the "glitching around".
     *
     * So the three jobs are separated by what actually changed:
     *
     *   viewport size  -> the canvases, and everything below it
     *   document size  -> the document height and the perches
     *   marks arriving -> the perches, ONCE the page has stopped moving
     */
    function viewportChanged(): boolean {
      const d = Math.min(window.devicePixelRatio || 1, 2);
      return W !== window.innerWidth || H !== window.innerHeight || dpr !== d;
    }

    let measureRaf = 0;
    function runMeasure() {
      measureRaf = 0;
      /* `resize` reallocates two canvases. Only the viewport actually
         changing is a reason to do that; a section growing is not. */
      if (viewportChanged()) resize();
      else measureDoc();
      measure();
      if (chat.current.open) layoutChat(false);
    }
    /* Scheduled once, never re-scheduled: a continuous stream of events must
       not be able to starve it the way a cancel-and-retry debounce can. */
    const remeasure = () => {
      if (measureRaf) return;
      measureRaf = requestAnimationFrame(runMeasure);
    };

    /*
     * The trailing one, for marks that are still arriving.
     *
     * A reveal is forty staggered transitions and each one ends separately, so
     * reacting to the first is reacting to a page that is still moving. This
     * waits for the stream to stop and then measures the page as it settled.
     */
    let quietTimer = 0;
    const remeasureWhenQuiet = () => {
      window.clearTimeout(quietTimer);
      quietTimer = window.setTimeout(remeasure, MEASURE_QUIET_MS);
    };

    window.addEventListener('resize', remeasure);
    const ro = new ResizeObserver(remeasure);
    ro.observe(document.body);

    /*
     * Reveal transitions move the visible mark without changing layout, so
     * neither of the two observers above ever hears about them: a heading
     * measured at boot sits 14px below where it ends up, and a polaroid 16px,
     * for the life of the page. `measureEdge` refuses anything still faded
     * out, and this puts it back in the list the moment it has arrived. Also
     * catches the polaroid tilt changing under the hover snap.
     */
    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName === 'opacity' || e.propertyName === 'transform') {
        remeasureWhenQuiet();
      }
    };
    document.addEventListener('transitionend', onTransitionEnd, true);
    /*
     * And `animationend`, which is not the same event and was not being
     * heard at all. The perch contract promises that furniture still on its
     * way in is refused and then re-measured "once it has arrived" — and the
     * only thing that delivered the second half was `transitionend`. Anything
     * that arrives under a keyframe animation, the light switch included, was
     * therefore never re-read: harvested mid-flight or not at all, and left
     * that way. A promise with no implementation for half its cases.
     */
    document.addEventListener('animationend', remeasureWhenQuiet, true);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('blur', onPointerExit);
    document.documentElement.addEventListener('pointerleave', onPointerExit);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);

    /*
     * THE CURSOR SWAP RULE, injected with the component and removed with it.
     *
     * It lives here rather than in v2.css on purpose. A stylesheet rule that
     * hides the pointer outlives the code that is supposed to draw one — if
     * this component ever fails to mount, throws on mount, or is removed by a
     * route change, a rule in the sheet would leave a site with no cursor and
     * nothing running to put it back. Injected, its lifetime is exactly the
     * lifetime of the thing drawing the replacement.
     *
     * Two selectors and no universal one: `cursor` inherits, so <html> covers
     * the whole document, and the only elements that override it are ones
     * that set their own — which is very nearly the definition of the
     * interactive elements the swap steps aside for anyway. That makes the
     * worst case "the real cursor shows over a control", not "no cursor".
     */
    const swapStyle = document.createElement('style');
    swapStyle.setAttribute('data-v2-bird-cursor', '');
    /* This now needs the universal selector and !important, where before it
       did not. Two inherited selectors were enough while the swap stood down
       over interactive elements — the only things that override an inherited
       `cursor` are elements setting their own, which was very nearly the same
       set. Now that the drawn cursor stays on over those elements, every
       `cursor: pointer` in the stylesheet would show a SECOND, real pointer
       next to the drawn one. Two cursors is worse than either behaviour it
       replaced, so the rule has to beat them. `cursor` is cheap to resolve and
       this is one style element toggled by one class. */
    swapStyle.textContent =
      `html.${CURSOR_SWAP_CLASS}, html.${CURSOR_SWAP_CLASS} body,` +
      `html.${CURSOR_SWAP_CLASS} * { cursor: none !important; }`;
    document.head.appendChild(swapStyle);
    swap.styleEl = swapStyle;

    /*
     * THE WATCHDOG. Everything above tries to keep the swap honest frame by
     * frame; this is what covers the case where there are no frames.
     *
     * If the loop stalls — a thrown error, a stopped rAF, a tab that was
     * backgrounded in a way visibilitychange did not report, a canvas that
     * lost its context — nothing calls syncCursorSwap(false) and the class
     * would simply stay on. So a timer outside the loop checks when a cursor
     * was last actually painted, and hands the pointer back if it has been
     * more than a few frames. It costs one comparison a quarter second.
     */
    const cursorWatchdog = window.setInterval(() => {
      if (!swap.on) return;
      if (document.hidden || performance.now() - swap.paintedAt > 400) restoreCursor();
    }, 250);
    /* Alt-tabbing away leaves the pointer somewhere we will never hear about
       again until it comes back. Give it up now. */
    const onBlur = () => restoreCursor();
    window.addEventListener('blur', onBlur);

    /*
     * ALSO `style`, and that omission is why he did not follow the light he
     * had just changed.
     *
     * `usePalette` writes a plate's tokens as inline custom properties on
     * <html>. A light/dark change is therefore a `style` mutation and nothing
     * else: no class, no data attribute. Watching only the other two, the bird
     * pulled the cord, the room went dark, and he went on drawing his own
     * speech bubble and chat window in the palette he had booted with. The one
     * element narrating the change was the one element not obeying it.
     *
     * READ ONCE, AND IT USED TO BE TWICE. The tokens were transitioned over
     * 940ms, so the values present at the mutation were still the old ones and
     * a second read had to be scheduled past the end of the transition to get
     * the real ones. They are not transitioned any anymore -- they cut, once,
     * at the crossover of the ground's move (see THE MOVE IS ON THE GROUND in
     * v2.css) -- so the mutation IS the change and the first read is already
     * right. The second was a forced full-document style recalc, a second
     * after every plate change, for a value that had not moved since.
     */
    const onThemeChange = () => {
      readTheme();
    };
    const themeObserver = new MutationObserver(onThemeChange);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-v2-theme', 'class', 'style']
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && chat.current.open) closeChat();
    };
    window.addEventListener('keydown', onKey);

    /* ---- loop -------------------------------------------------------------- */
    let raf = 0;
    let running = true;
    let last = performance.now();
    function frame(now: number) {
      if (!running) return;
      /* the one read the whole frame runs on */
      readScroll();
      const wall = Math.min((now - last) / 1000, FRAME_MS_MAX / 1000);
      /* See UPDATE_DT_MAX: he walks through a slow frame rather than jumping
         it, and the rate estimates still get the honest elapsed time. */
      const dt = Math.min(wall, UPDATE_DT_MAX);
      last = now;
      if (reduced) updateReduced(dt);
      else update(dt, wall);
      draw();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    function onVis() {
      if (document.hidden) {
        /* Hidden means no frames, which means nothing is drawing a cursor. */
        restoreCursor();
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }
    document.addEventListener('visibilitychange', onVis);

    /* dev handle, same reasoning as InkField. The browser pane never fires
       rAF, so `step` is the only way anything here gets tested at all. */
    if (process.env.NODE_ENV !== 'production') {
      (canvas as any).__bird = {
        bird,
        perches: () => perches,
        /* true while some marked furniture is still fading in, so a perch
           audit can tell "not landable yet" from "not landable" */
        perchesPending: () => perchesPending,
        /*
         * THE PERCH SYSTEM, drivable by hand.
         *
         * Everything that harvests furniture runs off rAF — `remeasure` is a
         * rAF, and the frame loop is a rAF — so in a pane that never fires one
         * the entire perch system was unreachable, and a `data-perch` element
         * that could not be stood on was indistinguishable from one that
         * could. That is exactly how the light switch shipped with a grip two
         * pixels under PERCH_MIN_W: the bird was never once asked to go to it,
         * the cord pulled itself on time, and nothing anywhere said otherwise.
         *
         * `measure()` re-harvests. `perchOf(el)` answers the only question
         * that matters about a marked element: did it become a perch?
         * `whyNot(el)` answers the follow-up when it did not.
         *
         * `measure` itself is already exposed further down this object.
         */
        perchOf: (el: Element) => byEl.get(el) ?? null,
        whyNot: (el: Element) => (byEl.get(el) ? null : whyNotAPerch(el)),
        /* The errand machine's whole state in one read. `prop` is what the
           page is currently asking for; the rest is what the engine has made
           of it. When a device says the bird never came, this says why. */
        errand: () => ({
          prop: errandRef.current,
          key: errandKey,
          perch: errandPerch,
          arrived: errandArrived,
          holdsTarget: errandPerch !== null && bird.perch === errandPerch
        }),
        /** Put him on a perch without flying him there. */
        seat: (p: Perch) => {
          bird.x = (p.x0 + p.x1) / 2;
          land(p, p.y, 0);
        },
        plan: () => ({ planLen, planIdx, PLAN }),
        transit,
        pvz,
        bubble,
        chatUi,
        atlasSize: atlas.size,
        step: (n = 1, dt = 1 / 60) => {
          for (let i = 0; i < n; i++) {
            if (reduced) updateReduced(dt);
            else update(dt);
          }
          draw();
        },
        draw,
        setMode,
        startAnim,
        setReduced: (v: boolean) => {
          reduced = v;
        },
        setPointer: (cx: number, cy: number) => {
          pointer.x = cx;
          pointer.y = cy;
          pointer.seen = true;
        },
        setStill: (ms: number) => {
          pointer.stillMs = ms;
        },
        forceTransit: (name: AnimationName, up?: boolean) => {
          const isUp =
            up ?? TRANSIT_UP.some((e) => e.name === name);
          startTransit(isUp, name);
        },
        forceInteraction: (a?: AnimationName, b?: AnimationName) =>
          startAct(a ?? INTERACTIONS[(Math.random() * INTERACTIONS.length) | 0], b),
        forceRareTransit: (up = true) => {
          const table = up ? TRANSIT_UP : TRANSIT_DOWN;
          const rares: AnimationName[] = [];
          for (let i = 0; i < table.length; i++)
            if (table[i].rarity === 'rare') rares.push(table[i].name);
          startTransit(up, rares[(Math.random() * rares.length) | 0]);
        },
        forceBalloon: () => startTransit(true, 'upBalloon'),
        /* Sit him on one NAMED chat perch. The perch is drawn at random when
           the window opens, so without this the only way to see a particular
           one is to keep reopening the chat, and the two carrying moving props
           are exactly the two worth looking at. Does not open the window: this
           is for looking at the puppet, not at the UI. */
        forcePerch: (name: AnimationName) => {
          /* `chat.current.open` is what holds him there. Setting the mode and
             the animation alone does not: the next update() sees a chat that
             is not open, decides he has nothing to sit for, and drops him back
             to an idle within one frame. */
          chat.current.open = true;
          chat.current.perch = name;
          chat.current.version++;
          setMode('chat');
          startAnim(name, 0);
        },
        releasePerch: () => {
          chat.current.open = false;
          setMode('idle');
        },
        /* Which cycled props are showing right now, for the same reason. */
        cycled: () => cycledProps(chat.current.perch, bird.clock).slice(),
        rareState: () => ({ sinceRare, pityAt, seen: Array.from(seenRare) }),
        mode: () => bird.mode,
        anim: () => bird.anim,
        setScrollVel: (pxPerSec: number) => {
          scrollVel = pxPerSec;
        },
        /*
         * A harness tab is frequently handed a ZERO-SIZE viewport, which
         * collapses the comfort band to a point and makes every reading taken
         * from it meaningless — he reads as permanently stranded and never
         * leaves transit. Forcing a viewport is the difference between a
         * headless test that measures the rig and one that measures the pane.
         */
        setViewport: (w: number, h: number) => {
          W = w;
          H = h;
          canvas!.width = Math.round(w * dpr);
          canvas!.height = Math.round(h * dpr);
          ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx!.imageSmoothingEnabled = false;
          chatUi.dirty = true;
        },
        resize,
        /*
         * Pretend the page moved by `px` since the last frame. A harness
         * document is often not scrollable at all, and the transit gate, the
         * catch-up and the band projection all read the scroll rate, so
         * without this none of them can be exercised.
         */
        pushScroll: (px: number) => {
          lastScrollY -= px;
        },
        holdPerch,
        forceJump: () => planTo(pickBandPerch(1), 1),
        forceWalk: (name?: AnimationName) =>
          startWalk(name ?? WALKS[(Math.random() * WALKS.length) | 0]),
        forceSleep: () => {
          setMode('sleep');
          bird.sleepUntil = bird.clock + 60000;
          startAnim('sleep', 0);
        },
        forcePvz: startPvz,
        /* The set pieces, on demand. `forceBit()` with no name rolls one the
           way the idle scheduler would, seasons and all. */
        forceBit: (name?: BitName) => startBit(name ?? rollBit() ?? 'creeper'),
        cutBit,
        bitState: () => ({ name: bit.name, t: Math.round(bit.t), holds: bit.holds, cut: bit.cut }),
        forceFall: enterFall,
        say,
        openChat,
        closeChat,
        bandUrgency,
        planTo,
        pickBandPerch,
        measure,

        /* ---- added for B1-B4 and the cursor swap ----------------------- */

        /**
         * B1. Read the flight rig. `phase` is the wingbeat, 0 at the top of
         * the stroke; `bob` is the body offset in sprite px, POSITIVE DOWN,
         * so a correct wingbeat has bob at its maximum at phase 0 and its
         * minimum at the bottom of the downstroke. `downFrac` is where that
         * bottom falls in the wall clock, and should be under a half.
         */
        flight: () => ({
          blend: rig.flight,
          phase: rig.flapPhase,
          bob: rig.bob,
          pitch: rig.pitch,
          downFrac: FLAP_DOWN_FRAC,
          cycleMs: FLAP_CYCLE_MS,
          /* ms into the animation the wing bottoms out, from the data */
          wingBottomMs: wingBottomMs(currentAnim()),
          animT: bird.animT
        }),
        /** Fly somewhere, so sustained flight can be driven without a fall. */
        forceFly: (tx?: number, ty?: number, speed = 700) =>
          enterFly(
            tx ?? scrollXNow + W * 0.5,
            ty ?? scrollYNow + H * 0.3,
            null,
            speed
          ),

        /**
         * B3. Read the gaze. `gaze` is 0..1 and is the look-up amount;
         * `dir` is which way across he is looking.
         */
        gaze: () => ({ gaze: rig.gaze, dir: rig.gazeDir }),
        forceLookUp: () => startAct('lookUp'),

        /**
         * B2. Put him on the pointer immediately, no dwell required. Flies
         * there, so it takes a few hundred frames of `step` to arrive.
         */
        forcePerchOnPointer: () => {
          gate.cursorPerch = bird.clock + 22000;
          perchOnPointer();
        },
        /** Throw him off it, as a hard mouse movement would. */
        forceBuckOff: buckOff,
        /** Read the cursor-perch state. */
        cursorPerchState: () => ({
          onCursor,
          riding: bird.perch === cursorPerch,
          leavesAt: cursorPerchUntil,
          clock: bird.clock,
          pointerSpeed: pointer.speed,
          pointerJerk: pointer.jerk,
          rideSpeed: PERCH_RIDE_SPEED,
          buckSpeed: PERCH_BUCK_SPEED,
          buckJerk: PERCH_BUCK_JERK
        }),

        /**
         * B4. Start or end a drag at the current pointer. `forceDrag(true)`
         * grabs him where he stands; `forceDrag(false)` lets go the way a
         * pointerup does. Set the pointer first if you want a specific grab.
         */
        forceDrag: (on = true) => {
          if (on) {
            drag.pressed = true;
            drag.pressX = pointer.x;
            drag.pressY = pointer.y;
            drag.pressAt = bird.clock;
            drag.grabX = bird.x - pointerDocX();
            drag.grabY = bird.y - pointerDocY();
            beginDrag();
          } else {
            releaseDrag();
          }
        },
        /** Make him break free right now, reprisal included if anger allows. */
        forceEscape: escapeDrag,
        setAnger: (v: number) => {
          anger = Math.max(0, Math.min(1, v));
          angerIdleMs = 0;
        },
        anger: () => anger,
        dragState: () => ({
          pressed: drag.pressed,
          active: drag.active,
          hauled: drag.hauled,
          anger,
          struggle: bird.anim,
          shakeX: rig.shakeX,
          shakeY: rig.shakeY,
          escapeChance: 0.05 + anger * 0.74,
          pool:
            anger > 0.66 ? 'furious' : anger > 0.33 ? 'cross' : 'calm'
        }),

        /**
         * The cursor swap. `forceCursorSteal` is the reprisal on its own,
         * without needing to make him angry first.
         */
        forceCursorSteal: stealCursor,
        forceCursorReturn: () => {
          swap.holdUntil = bird.clock - 1;
        },
        dropCursor: () => dropCursor(false),
        cursorSwap: () => ({
          on: swap.on,
          classOnHtml: document.documentElement.classList.contains(CURSOR_SWAP_CLASS),
          hold: swap.hold,
          returning: swap.returning,
          cx: swap.cx,
          cy: swap.cy,
          overUi: pointer.overUi,
          wanted: cursorWanted(),
          hasArt: !!cursorImg,
          paintedAgoMs: performance.now() - swap.paintedAt,
          ruleInDocument: !!swap.styleEl && document.head.contains(swap.styleEl)
        }),
        restoreCursor,
        checkOverUi,

        /**
         * Move the pointer by a delta and let the next `step` derive the
         * speed and jerk from it, which is how B2's thresholds get exercised:
         * setPointer alone changes the position but the derivative is only
         * taken inside update.
         */
        movePointerBy: (dx: number, dy: number) => {
          pointer.x += dx;
          pointer.y += dy;
          pointer.seen = true;
        },
        pointerState: () => ({
          x: pointer.x,
          y: pointer.y,
          speed: pointer.speed,
          jerk: pointer.jerk,
          stillMs: pointer.stillMs,
          overUi: pointer.overUi
        }),
        rig
      };
    }

    return () => {
      running = false;
      /* FIRST. Before anything else can throw: an unmount that left the page
         with no cursor is the worst outcome this component has. */
      restoreCursor();
      swapStyle.remove();
      swap.styleEl = null;
      clearInterval(cursorWatchdog);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(measureRaf);
      window.clearTimeout(quietTimer);
      /* The band is appended to document.body rather than rendered, so React
         will not take it away for us. Leaving one behind on every mount is
         how you end up with a page full of invisible canvases. */
      band.remove();
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('blur', onPointerExit);
      document.documentElement.removeEventListener('pointerleave', onPointerExit);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('transitionend', onTransitionEnd, true);
      document.removeEventListener('animationend', remeasureWhenQuiet, true);
      document.removeEventListener('visibilitychange', onVis);
      if (motionQuery.removeEventListener) motionQuery.removeEventListener('change', onMotion);
      themeObserver.disconnect();
      ro.disconnect();
      byEl.clear();
      DURATIONS.clear();
      if (process.env.NODE_ENV !== 'production') delete (canvas as any).__bird;
    };
    /* Runs once. Everything the loop needs arrives through a ref, so a parent
       re-render can never tear the bird down mid-hop. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="v2-bird-layer">
      <canvas ref={canvasRef} className="v2-bird" aria-hidden="true" />
      {chatting ? (
        <input
          ref={inputRef}
          className="v2-bird-input"
          aria-label="Ask about Jack"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          maxLength={240}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const v = e.currentTarget.value;
              e.currentTarget.value = '';
              submit(v);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              closeChat();
            }
          }}
        />
      ) : null}
      <div className="v2-bird-sr" role="log" aria-live="polite">
        {srLog.map((m, i) => (
          <p key={i}>{(m.me ? 'You: ' : 'Sparrow: ') + m.text}</p>
        ))}
      </div>
    </div>
  );
}
