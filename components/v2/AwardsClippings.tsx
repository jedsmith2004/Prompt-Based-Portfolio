'use client';

/* ============================================================================
   AwardsClippings — the press wall.

   THE ARGUMENT. Jack's record is not a list of line items, it is a run of
   stories that got reported. A lens used a million times at sixteen. A £100
   float turned into a charity haul. A talk on psychedelics delivered to a
   police lieutenant and an advisor to the Prime Minister. Set as a CV those
   read as bullets; set as clippings pinned to a wall they read as what they
   were, which is news. So the section is a wall of cuttings: torn newsprint,
   a headline, a dateline, a citation, the tags a sub-editor would set off, and
   a halftone block where the photograph ran. Biggest story, biggest cutting.

   THE SPLIT THAT MATTERS. Canvas draws MATERIAL ONLY: stock, torn edges,
   fibre, grain, creases, the halftone screen, the tape and the pin. It never
   draws a letterform. Every word on this wall is real DOM text, so it is
   selectable, searchable, translatable, and reachable by a screen reader in
   the order it was written. Rasterised type would have made the same picture
   and thrown all of that away.

   WHY THERE IS NO FRAME LOOP. A cutting is a still object. Nothing here
   animates per frame, so there is no rAF loop to pause offscreen or on
   document.hidden, nothing to preallocate, and no GPU resource to release.
   Each canvas is painted once and repainted only when its box actually
   changes size (ResizeObserver, coalesced into one rAF), which is also what
   makes the torn edge stable: the tear is seeded per cutting, so it is the
   same tear at every width. Lift and straighten on hover and focus is a CSS
   transform plus a drop-shadow filter, and the filter follows the canvas alpha
   so the shadow has the torn silhouette rather than a rectangle's.

   THE OVERLAP INVARIANT. Overlap comes from the BLEED, not from the layout:
   each canvas is drawn --clip-bleed past its cutting on every side, so two
   cuttings sitting in adjacent columns already have their paper overlapping by
   twice that, with neither box moved. Since every cutting's padding is larger
   than the bleed, a sheet can only ever cover a neighbour's MARGIN, never a
   word of it. Any negative margin added on top of that spends the difference,
   so the placements keep them tiny. This was measured, not assumed: the first
   cut of this wall pulled sheets 26px into each other on top of a 22px bleed
   and quietly buried the edge of the lead's citation.

   Every figure, date, place and citation below is verbatim from
   public/context.json. Nothing is invented.
   ========================================================================== */

import { useEffect, useId, useRef } from 'react';
import { mulberry32, rgba, toRgb } from './backdrops/types';
import { onPaletteChange, paletteTokens, type PaletteTokens } from '@/lib/v2/paletteWatch';

/* ------------------------------------------------------------------- types */

type Rgb = [number, number, number];
type Ctx = CanvasRenderingContext2D;

/** Torn-edge bitmask: 1 top, 2 right, 4 bottom, 8 left. */
const T_TOP = 1;
const T_RIGHT = 2;
const T_BOTTOM = 4;
const T_LEFT = 8;

const TAU = Math.PI * 2;

/** How the cutting is fixed to the wall. */
type Fastener = 'tape' | 'tape2' | 'pin';

/** How much room the story is given on the wall. */
type Weight = 'lead' | 'story' | 'brief';

/** The halftone block: where a photograph would have run. */
type Cut = 'wide' | 'block' | null;

interface Story {
  id: string;
  /** The award title, set as the headline. */
  headline: string;
  /** 'Cash Prize', '1st Place'. Runs in the dateline, in vermilion. */
  place: string;
  date: string;
  /** Machine-readable form of `date`, for <time>. */
  iso: string;
  /** The citation, verbatim from public/context.json. */
  citation: string;
  /**
   * A phrase inside `citation` to set off, the way a reader underlines the
   * line that made them keep the cutting. Must appear in `citation` exactly.
   */
  emph?: string;
  badges: string[];
  weight: Weight;
  cut: Cut;
  /** Pinned by hand, so nothing is square. Fixed, never random at runtime. */
  rot: number;
  /** Seeds the tear, the grain and the creases. */
  seed: number;
  torn: number;
  fastener: Fastener;
}

interface Posting {
  role: string;
  company: string;
  period: string;
  /** One line, compressed from the description in public/context.json. */
  line: string;
}

export interface AwardsClippingsProps {
  className?: string;
}

/* ------------------------------------------------------------------- data */

/* Five awards, in the order they were won. Titles, places, dates, citations
   and badges are lifted straight from public/context.json -> awards[]. The
   only editorial act is the headline for the first: its title carries "Cash
   Prize" and the dateline already says so, so it is not set twice. */
const STORIES: Story[] = [
  {
    id: 'lens',
    headline: 'Snapchat Lens Competition',
    place: 'Cash Prize',
    date: 'March 2022',
    iso: '2022-03',
    citation:
      'Created a Snapchat lens used over 1 million times, securing £1500 for school technology resources as a top-performing creative entry.',
    emph: 'used over 1 million times',
    badges: ['AR', 'INNOVATION', 'IMPACT'],
    weight: 'lead',
    cut: 'block',
    rot: -1.2,
    seed: 10427,
    torn: T_BOTTOM | T_RIGHT,
    fastener: 'tape2'
  },
  {
    id: 'dragons',
    headline: "Dragon's Apprentice Challenge",
    place: '1st Place',
    date: 'March 2022',
    iso: '2022-03',
    citation:
      'Led a winning charity venture that multiplied a £100 seed fund through events including a balloon race, auction, and milkshake stand, and received a creativity award.',
    emph: 'multiplied a £100 seed fund',
    badges: ['LEADERSHIP', 'CHARITY', 'ENTREPRENEUR'],
    weight: 'story',
    cut: null,
    rot: 1.5,
    seed: 20915,
    torn: T_LEFT | T_BOTTOM,
    fastener: 'tape'
  },
  {
    id: 'speaking',
    headline: 'Public Speaking Competition',
    place: '2nd Place',
    date: 'March 2023',
    iso: '2023-03',
    citation:
      'Delivered a talk on the legalisation of psychedelics to an audience including an RAF Officer, a police lieutenant, and an advisor to the Prime Minister.',
    emph: 'an advisor to the Prime Minister',
    badges: ['ADVOCACY', 'COMMUNICATION', 'STAGE'],
    weight: 'story',
    /* No picture. `cut: 'wide'` fell through to the bare `.v2-clip-cut`
       band, which is a full-measure block 118px tall dropped between the
       headline and the citation -- 136px of nothing in the middle of four
       lines of copy, on exactly this cutting and one other, and on no others.
       There has never been an `.is-cut-wide` rule to make it behave.

       > "It's only the public speaking competition and engineering you're
       >  hired ones that had the gaps in their text!"

       Those two, and those two only, are the ones that carried it. */
    cut: null,
    rot: -1.6,
    seed: 31338,
    torn: T_TOP | T_RIGHT,
    fastener: 'pin'
  },
  {
    id: 'hacksheffield',
    headline: 'hackSheffield 9',
    place: '1st Place',
    date: 'November 2024',
    iso: '2024-11',
    citation:
      'Won best GitHub repository award by engineering strong project structure, documentation, and developer experience, resulting in the top-scoring repository.',
    emph: 'best GitHub repository award',
    badges: ['OPEN-SOURCE', 'ENGINEERING', 'DX'],
    weight: 'story',
    cut: null,
    rot: 1.1,
    seed: 44201,
    torn: T_TOP | T_LEFT,
    fastener: 'tape'
  },
  {
    id: 'hired',
    headline: "Engineering You're Hired",
    place: '3rd Place',
    date: 'March 2025',
    iso: '2025-03',
    citation:
      'Designed a pipe inspection and repair concept using decentralised swarm robotics, contributing swarm behaviour mechanics and AI-based visual inspection ideas.',
    emph: 'decentralised swarm robotics',
    badges: ['SWARM', 'ROBOTICS', 'AI'],
    weight: 'brief',
    /* No picture. `cut: 'wide'` fell through to the bare `.v2-clip-cut`
       band, which is a full-measure block 118px tall dropped between the
       headline and the citation -- 136px of nothing in the middle of four
       lines of copy, on exactly this cutting and one other, and on no others.
       There has never been an `.is-cut-wide` rule to make it behave.

       > "It's only the public speaking competition and engineering you're
       >  hired ones that had the gaps in their text!"

       Those two, and those two only, are the ones that carried it. */
    cut: null,
    rot: -1.7,
    seed: 51066,
    torn: T_TOP | T_BOTTOM,
    fastener: 'pin'
  }
];

/* The appointments column. A press wall carries one, set narrow beside the
   stories: who took which post, and when. Roles, companies and periods are
   verbatim from public/context.json -> experience[]; each line is a
   compression of that entry's own description, nothing added. */
const POSTINGS: Posting[] = [
  {
    role: 'Missions Engineer',
    company: 'Project Falcon',
    period: '2023 to 2024',
    line: 'Real-time analytics dashboard on scalable backend infrastructure.'
  },
  {
    role: 'Full Stack Developer',
    company: 'UCD',
    period: '2025 to present',
    line: 'Founded a web studio. Discovery and design through deployment.'
  },
  {
    role: 'Software Engineer',
    company: 'AI startup, London',
    period: '2026',
    line: 'Internal API, Cloudflare Workers, a CLI, a dashboard, an MCP server.'
  }
];

/* ------------------------------------------------------------------- paint */

interface Stock {
  hi: Rgb;
  mid: Rgb;
  low: Rgb;
  ink: Rgb;
  ink4: Rgb;
  verm: Rgb;
}

/**
 * Palette, read live off the root element so the wall follows the sheet rather
 * than carrying its own copy of the colours. Called only on a repaint, which
 * is a resize or a plate change, so a getComputedStyle here costs nothing.
 */
/* Seven reads, once per cutting, six cuttings: forty-two forced style
   recalculations on one change of light. The stock comes from the snapshot
   paletteWatch carries. See lib/v2/paletteWatch.ts. */
function readStock(t: PaletteTokens = paletteTokens()): Stock {
  const pick = (name: string, fallback: string): Rgb => toRgb(t.get(name, fallback));
  return {
    hi: pick('--paper-hi', '#F0ECE3'),
    mid: pick('--paper', '#E4DFD3'),
    /* --paper-2 is the darkest stock allowed anywhere on this wall, and it is
       used only inside the halftone block where no text sits. --ink-3 is
       exactly 4.50:1 on it, so nothing on the sheet can fall below AA. */
    low: pick('--paper-2', '#DCD5C6'),
    ink: pick('--ink', '#17140F'),
    ink4: pick('--ink-4', '#7C7364'),
    verm: pick('--verm', '#B5402F')
  };
}

interface Outline {
  /** Flat x,y pairs, clockwise from the top-left. */
  pts: number[];
  /** Which edge each point came from, so only torn edges grow fibre. */
  edge: number[];
}

/**
 * The outline of one cutting.
 *
 * Torn edges are a shallow ripple with the occasional deeper bite; cut edges
 * still carry a hair of jitter, because a sheet trimmed with scissors is not
 * a straight line either. Returned as points rather than stroked in place so
 * the same outline can drive the fill, the inner highlight and the fibre.
 */
function tornOutline(w: number, h: number, torn: number, rnd: () => number): Outline {
  const pts: number[] = [];
  const edge: number[] = [];
  for (let e = 0; e < 4; e++) {
    const isTorn = (torn & (1 << e)) !== 0;
    const len = e % 2 === 0 ? w : h;
    const steps = Math.max(9, Math.round(len / 10));
    const amp = isTorn ? 4.4 : 0.55;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      let n = (rnd() - 0.5) * 2 * amp;
      if (isTorn && rnd() < 0.13) n -= amp * 1.7;
      if (e === 0) {
        pts.push(t * w, n);
      } else if (e === 1) {
        pts.push(w - n, t * h);
      } else if (e === 2) {
        pts.push((1 - t) * w, h - n);
      } else {
        pts.push(n, (1 - t) * h);
      }
      edge.push(e);
    }
  }
  return { pts, edge };
}

function pathFrom(ctx: Ctx, pts: number[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

/**
 * Fibre. Where paper is torn rather than cut, the core of the sheet is exposed
 * and loose fibres stand off the edge. Two marks do it: a pale band just
 * inside the outline (drawn by stroking the clipped path, so only the inner
 * half survives), and short hairs standing out along the edge normal.
 */
function fibre(ctx: Ctx, o: Outline, torn: number, S: Stock, rnd: () => number): void {
  const pts = o.pts;
  ctx.save();
  pathFrom(ctx, pts);
  ctx.clip();
  pathFrom(ctx, pts);
  ctx.strokeStyle = rgba(S.hi, 0.8);
  ctx.lineWidth = 3.4;
  ctx.stroke();
  ctx.strokeStyle = rgba(S.ink, 0.07);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();

  /* Hairs stand off a TORN edge only. On a cut edge they read as evenly
     spaced tick marks, which is a ruler, not a piece of paper. */
  ctx.strokeStyle = rgba(S.ink4, 0.26);
  ctx.lineWidth = 0.65;
  ctx.lineCap = 'round';
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    if ((torn & (1 << o.edge[i])) === 0) continue;
    if (rnd() > 0.42) continue;
    const px = pts[i * 2];
    const py = pts[i * 2 + 1];
    const q = ((i + 1) % n) * 2;
    let tx = pts[q] - px;
    let ty = pts[q + 1] - py;
    const m = Math.hypot(tx, ty) || 1;
    tx /= m;
    ty /= m;
    /* outward normal of the winding: the outline runs clockwise */
    const nx = ty;
    const ny = -tx;
    const l = 1 + rnd() * 2.8;
    ctx.beginPath();
    ctx.moveTo(px - nx * 1.1 + tx * (rnd() - 0.5) * 2, py - ny * 1.1 + ty * (rnd() - 0.5) * 2);
    ctx.lineTo(px + nx * l + tx * (rnd() - 0.5) * 3, py + ny * l + ty * (rnd() - 0.5) * 3);
    ctx.stroke();
  }
}

/**
 * The halftone block. Not a photograph: a screen of dots over a tone field,
 * which is what a photograph in cheap newsprint actually is once you are close
 * enough to the page. The field is a subject blob, a horizon, light falling
 * from one side and a little tonal noise, and the whole grid is set at a screen
 * angle so it never reads as a chequerboard.
 *
 * Every dot goes into ONE path and is filled once. A per-dot fill would be a
 * thousand state changes for a picture that never moves.
 */
function halftone(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  S: Stock,
  rnd: () => number
): void {
  if (w < 8 || h < 8) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.fillStyle = rgba(S.low, 0.5);
  ctx.fillRect(x, y, w, h);

  const pitch = Math.max(4, Math.min(w, h) / 24);
  const ang = 0.42;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const diag = Math.hypot(w, h) * 0.72;
  const cx = x + w / 2;
  const cy = y + h / 2;
  /* The tone field: a horizon, a subject standing against it, and light from
     one side. A single radial blob was the first attempt and it read as a
     moon, because a circle centred in a frame is not what photographs look
     like. */
  const fx = x + w * (0.3 + rnd() * 0.3);
  const fy = y + h * (0.34 + rnd() * 0.2);
  const fr = Math.min(w, h) * (0.36 + rnd() * 0.16);
  const hzN = 0.54 + rnd() * 0.16;

  ctx.beginPath();
  for (let v = -diag; v <= diag; v += pitch) {
    for (let u = -diag; u <= diag; u += pitch) {
      const px = cx + u * ca - v * sa;
      const py = cy + u * sa + v * ca;
      if (px < x - pitch || px > x + w + pitch) continue;
      if (py < y - pitch || py > y + h + pitch) continue;
      const nx = (px - x) / w;
      const ny = (py - y) / h;
      /* ground is heavier than sky, and gets heavier towards the foot */
      let val = ny < hzN ? 0.1 + ny * 0.22 : 0.42 + (ny - hzN) * 0.55;
      const ex = (px - fx) / (fr * 0.66);
      const ey = (py - fy) / fr;
      const dd = ex * ex + ey * ey;
      if (dd < 1) val = 0.9 - dd * 0.42;
      val -= (nx - 0.5) * 0.24;
      val += Math.sin(px * 0.07) * Math.cos(py * 0.09) * 0.06;
      if (val <= 0.03) continue;
      const r = pitch * 0.47 * Math.sqrt(val > 1 ? 1 : val);
      if (r < 0.32) continue;
      ctx.moveTo(px + r, py);
      ctx.arc(px, py, r, 0, TAU);
    }
  }
  /* A smudge where a photograph would sit, not a photograph: the screen
     stays light enough that the words beside it keep the page. */
  ctx.fillStyle = rgba(S.ink, 0.46);
  ctx.fill();

  /* the smudge: newsprint ink comes off on a thumb, and a cutting that has
     been handled for three years shows where the thumb went */
  const sx = x + w * (0.15 + rnd() * 0.6);
  const sy = y + h * (0.55 + rnd() * 0.4);
  const sr = Math.min(w, h) * (0.3 + rnd() * 0.25);
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
  g.addColorStop(0, rgba(S.ink, 0.16));
  g.addColorStop(1, rgba(S.ink, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = rgba(S.ink, 0.24);
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const ty0 = sy + (rnd() - 0.5) * sr;
    ctx.globalAlpha = 0.16 + rnd() * 0.12;
    ctx.beginPath();
    ctx.moveTo(sx - sr * 0.8, ty0);
    ctx.quadraticCurveTo(sx, ty0 + (rnd() - 0.5) * 6, sx + sr * 0.9, ty0 + (rnd() - 0.5) * 4);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.strokeStyle = rgba(S.ink, 0.3);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

/** A strip of tape: translucent body, ragged torn ends, fibres running through. */
function tapeStrip(
  ctx: Ctx,
  cx: number,
  cy: number,
  len: number,
  wid: number,
  ang: number,
  S: Stock,
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
  for (let i = 1; i <= 5; i++) ctx.lineTo(half + (rnd() - 0.5) * 3.6, -hw + (wid * i) / 5);
  ctx.lineTo(-half + 1, hw);
  for (let i = 1; i <= 5; i++) ctx.lineTo(-half + (rnd() - 0.5) * 3.6, hw - (wid * i) / 5);
  ctx.closePath();
  /* Tape drawn in paper-hi is invisible on paper-hi stock. It has to carry a
     little grey of its own, the way real tape greys the sheet under it. */
  ctx.fillStyle = rgba(S.ink4, 0.15);
  ctx.fill();

  ctx.strokeStyle = rgba(S.ink4, 0.3);
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 6; i++) {
    const fy = -hw + (wid * (i + 0.5)) / 6 + (rnd() - 0.5) * 1.2;
    ctx.beginPath();
    ctx.moveTo(-half + 2.5, fy);
    ctx.lineTo(half - 2.5, fy + (rnd() - 0.5) * 1.4);
    ctx.stroke();
  }

  ctx.strokeStyle = rgba(S.ink, 0.2);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-half + 1, -hw);
  ctx.lineTo(half - 1, -hw);
  ctx.moveTo(-half + 1, hw);
  ctx.lineTo(half - 1, hw);
  ctx.stroke();
  ctx.restore();
}

/** A pin: a shadow, a head, a highlight. */
function pin(ctx: Ctx, x: number, y: number, r: number, S: Stock): void {
  ctx.fillStyle = rgba(S.ink, 0.16);
  ctx.beginPath();
  ctx.ellipse(x + 1.5, y + 2.6, r * 1.05, r * 0.8, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba(S.verm, 0.85);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba(S.ink, 0.35);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = rgba(S.hi, 0.6);
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.3, 0, TAU);
  ctx.fill();
}

interface PaperSpec {
  seed: number;
  torn: number;
  fastener: Fastener;
}

/**
 * Paint one cutting. `cut` is the DOM element the copy has already reserved
 * for the photograph; the halftone is drawn into wherever the text engine
 * actually put it, so the picture and the words can never disagree.
 */
function paintCutting(
  canvas: HTMLCanvasElement,
  spec: PaperSpec,
  cut: HTMLElement | null,
  bleed: number
): void {
  /* clientWidth, not getBoundingClientRect: the cutting is rotated, and a
     bounding rect would report the axis-aligned box of the tilted sheet. */
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (cw < 8 || ch < 8) return;

  /* One source of truth for the bleed: the stylesheet sets --clip-bleed, the
     canvas is stretched by it, and the paint is handed the same number back.
     Passed in rather than read here; see the cache in usePaper. */

  const w = cw - bleed * 2;
  const h = ch - bleed * 2;
  if (w < 8 || h < 8) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const wantW = Math.round(cw * dpr);
  const wantH = Math.round(ch * dpr);
  if (canvas.width !== wantW) canvas.width = wantW;
  if (canvas.height !== wantH) canvas.height = wantH;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  const S = readStock();
  const rnd = mulberry32(spec.seed);

  ctx.save();
  ctx.translate(bleed, bleed);

  const outline = tornOutline(w, h, spec.torn, rnd);
  const pts = outline.pts;

  /* the stock. Lighter at the top, settling to the page colour at the foot,
     which is how a sheet lit from above actually sits on a wall. */
  pathFrom(ctx, pts);
  const g = ctx.createLinearGradient(0, 0, w * 0.12, h);
  g.addColorStop(0, rgba(S.hi, 1));
  g.addColorStop(1, rgba(S.mid, 1));
  ctx.fillStyle = g;
  ctx.fill();

  /* grain: newsprint is a rough sheet and the flecks are visible in raking
     light. One speck per ~900px² is enough to break the flatness. */
  ctx.save();
  pathFrom(ctx, pts);
  ctx.clip();
  const specks = Math.min(1100, Math.round((w * h) / 900));
  for (let i = 0; i < specks; i++) {
    const a = 0.04 + rnd() * 0.06;
    ctx.fillStyle = rnd() < 0.7 ? rgba(S.ink4, a) : rgba(S.hi, a * 3);
    ctx.fillRect(rnd() * w, rnd() * h, rnd() < 0.85 ? 1 : 2, 1);
  }

  /* one crease, from a sheet that spent a while folded in a drawer */
  const creaseY = h * (0.24 + rnd() * 0.5);
  ctx.strokeStyle = rgba(S.ink, 0.05);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-2, creaseY);
  ctx.quadraticCurveTo(w * 0.5, creaseY + (rnd() - 0.5) * 10, w + 2, creaseY + (rnd() - 0.5) * 8);
  ctx.stroke();
  ctx.strokeStyle = rgba(S.hi, 0.55);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-2, creaseY - 1.4);
  ctx.quadraticCurveTo(w * 0.5, creaseY - 1.4 + (rnd() - 0.5) * 10, w + 2, creaseY - 1.4);
  ctx.stroke();
  ctx.restore();

  if (cut) {
    /* Offsets, not rects. The cutting is rotated, so the difference between
       two bounding rects is not the layout offset between two boxes;
       offsetLeft/offsetTop are pre-transform layout values and are.
       If the walk never reaches the cutting itself the offsets would be
       measured against some other ancestor, so the block is simply skipped
       rather than painted in the wrong place. */
    let ox = 0;
    let oy = 0;
    let el: HTMLElement | null = cut;
    const host = canvas.parentElement;
    while (el && el !== host) {
      ox += el.offsetLeft;
      oy += el.offsetTop;
      el = el.offsetParent as HTMLElement | null;
    }
    if (el === host) halftone(ctx, ox, oy, cut.offsetWidth, cut.offsetHeight, S, rnd);
  }

  fibre(ctx, outline, spec.torn, S, rnd);
  ctx.restore();

  if (spec.fastener === 'pin') {
    pin(ctx, bleed + w * 0.5 + (rnd() - 0.5) * w * 0.2, bleed + 3, 5.4, S);
  } else {
    tapeStrip(ctx, bleed, bleed, 58, 18, -Math.PI * 0.25 + (rnd() - 0.5) * 0.2, S, rnd);
    if (spec.fastener === 'tape2') {
      tapeStrip(ctx, bleed + w, bleed + h, 52, 17, -Math.PI * 0.25 + (rnd() - 0.5) * 0.25, S, rnd);
    }
  }
}

/**
 * Wires one cutting's canvas to its box.
 *
 * Repaints on a real size change only, coalesced into a single rAF so a drag
 * resize cannot queue a hundred paints. The window listener is for the case a
 * ResizeObserver cannot see: the same box moving to a display with a different
 * devicePixelRatio.
 */
function usePaper<T extends HTMLElement>(spec: PaperSpec) {
  const hostRef = useRef<T | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cutRef = useRef<HTMLSpanElement | null>(null);
  const specRef = useRef(spec);
  specRef.current = spec;

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    let raf = 0;

    /*
     * --clip-bleed, CACHED. -1 means "ask the document next paint".
     *
     * A layout constant, not a colour, and only a breakpoint can move it. It
     * was read back out of the document on every repaint, and a palette change
     * repaints all six cuttings, so one change of light performed six computed
     * reads for a number that had not changed. The tokens are registered
     * `@property` with `inherits: true`, so ANY computed read after they are
     * written pays for the whole document -- it does not have to be one of
     * them. See lib/v2/paletteWatch.ts.
     *
     * Only the two size paths dirty it. The palette path never reads it.
     */
    let bleed = -1;
    const paint = () => {
      raf = 0;
      if (bleed < 0) {
        bleed = parseFloat(getComputedStyle(canvas).getPropertyValue('--clip-bleed')) || 18;
      }
      paintCutting(canvas, specRef.current, cutRef.current, bleed);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    /** A resize can change the breakpoint, and the breakpoint sets the bleed. */
    const scheduleResized = () => {
      bleed = -1;
      schedule();
    };

    schedule();
    const ro = new ResizeObserver(scheduleResized);
    ro.observe(host);
    window.addEventListener('resize', scheduleResized);

    /*
     * THE SHEET IS STOCK, AND THE STOCK CHANGES COLOUR.
     *
     * readStock() reads --paper and --ink off the root, and the comment above
     * it used to say a repaint only ever happens on a resize. That was the
     * bug: this plate settles DARK and the page loads LIGHT, so a cutting
     * painted at mount carried cream newsprint down to a black plate, or the
     * reverse on the way back up, and the headline set in var(--ink) then sat
     * on paper from the other palette. Black type on a black sheet is exactly
     * what that looks like.
     *
     * A palette change is a repaint reason like any other. */
    const stopPalette = onPaletteChange(() => schedule());

    /* Dev-only handle: headless panes report a zero box and never fire a
       resize, so there is otherwise no way to drive a paint and inspect it. */
    if (process.env.NODE_ENV !== 'production') {
      (canvas as unknown as { __cutting?: unknown }).__cutting = { paint };
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      stopPalette();
      window.removeEventListener('resize', scheduleResized);
    };
  }, []);

  return { hostRef, canvasRef, cutRef };
}

/* -------------------------------------------------------------------- copy */

/**
 * The citation, with one phrase set off. Splitting here rather than storing
 * markup keeps the source string byte-identical to context.json, so it can be
 * diffed against it.
 */
function citationNodes(text: string, emph?: string) {
  if (!emph) return text;
  const at = text.indexOf(emph);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <b>{emph}</b>
      {text.slice(at + emph.length)}
    </>
  );
}

/* ---------------------------------------------------------------- a cutting */

function Cutting({ story, z }: { story: Story; z: number }) {
  const uid = useId();
  const headId = `${uid}-head`;
  const { hostRef, canvasRef, cutRef } = usePaper<HTMLLIElement>({
    seed: story.seed,
    torn: story.torn,
    fastener: story.fastener
  });

  return (
    <li
      ref={hostRef}
      className={`v2-clip is-${story.weight}${story.cut ? ` has-cut is-cut-${story.cut}` : ''}`}
      style={{ '--rot': `${story.rot}deg`, '--z': z } as React.CSSProperties}
      tabIndex={0}
      aria-labelledby={headId}
      /*
       * data-perch. This plate is three and a half thousand pixels tall and
       * had ten landable surfaces on it, the fewest per thousand pixels
       * anywhere on the site, which is a large part of what Jack meant by
       * "he struggles to find a nearby surface to land on and falls off the
       * screen". A wall of cuttings is nothing BUT horizontal edges.
       *
       * The sheet is rotated and its paint bleeds past the box, so the perch
       * lands a little inside the torn edge rather than on it. That is the
       * right answer anyway: a bird stands on the paper, not on the tear.
       * The harvester rebuilds the top edge from the untransformed box and
       * the computed matrix, so the tilt is already handled. See THE PERCH
       * CONTRACT in components/v2/Companion.tsx.
       */
      data-perch
    >
      <canvas className="v2-clip-paper" ref={canvasRef} aria-hidden="true" />

      <div className="v2-clip-body">
        <p className="v2-clip-dateline">
          <span className="v2-clip-place">{story.place}</span>
          <span className="v2-clip-sep" aria-hidden="true" />
          <time dateTime={story.iso}>{story.date}</time>
        </p>

        <h3 className="v2-clip-head" id={headId}>
          {story.headline}
        </h3>

        {story.cut ? <span className="v2-clip-cut" ref={cutRef} aria-hidden="true" /> : null}

        <p className="v2-clip-cite">{citationNodes(story.citation, story.emph)}</p>

        <ul className="v2-clip-tags">
          {story.badges.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>
    </li>
  );
}

/* ----------------------------------------------------------- the wall */

export default function AwardsClippings({ className }: AwardsClippingsProps) {
  const uid = useId();
  const apptId = `${uid}-appts`;
  const { hostRef, canvasRef } = usePaper<HTMLDivElement>({
    seed: 60733,
    torn: T_TOP | T_RIGHT | T_BOTTOM | T_LEFT,
    fastener: 'pin'
  });

  return (
    <div className={`v2-clipwall${className ? ` ${className}` : ''}`}>
      {/* The masthead rule is a real 2px line at the top of this box, so it is
          a perch with no inset. See THE PERCH CONTRACT in components/v2/
          Companion.tsx. */}
      <div className="v2-clipwall-mast" data-perch>
        <p className="v2-eyebrow">
          Cuttings <b>/</b> 2022 to 2025
        </p>
        <p className="v2-clipwall-strap">
          Five judged competitions. Two first places, and one lens used a million times.
        </p>
      </div>

      <div className="v2-clipwall-grid">
        {/* role="list" is not redundant. This list carries `list-style: none`
            and becomes a grid at 900px, and WebKit drops list semantics from
            both, so the role puts them back. (It used to say the wall was a
            multicolumn flow with `display: contents`. That was true for a
            day; the role is still needed, for the older reason.) */}
        <ol className="v2-clip-stories" role="list" aria-label="Awards and distinctions">
          {STORIES.map((s, i) => (
            <Cutting key={s.id} story={s} z={i + 1} />
          ))}
        </ol>

        <div
          ref={hostRef}
          role="group"
          className="v2-clip v2-clip-appts is-column"
          style={{ '--rot': '1.3deg', '--z': 6 } as React.CSSProperties}
          tabIndex={0}
          data-perch
          aria-labelledby={apptId}
        >
          <canvas className="v2-clip-paper" ref={canvasRef} aria-hidden="true" />
          <div className="v2-clip-body">
            <h3 className="v2-clip-colhead" id={apptId}>
              Appointments
            </h3>
            <ol className="v2-clip-posts">
              {POSTINGS.map((p) => (
                <li key={p.company}>
                  <b>{p.role}</b>
                  <span className="v2-clip-post-co">{p.company}</span>
                  <span className="v2-clip-post-when">{p.period}</span>
                  <span className="v2-clip-post-line">{p.line}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
