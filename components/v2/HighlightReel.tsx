'use client';

/* ============================================================================
   HighlightReel — five projects, each as a composed still life.

   The collages are drawn through a small 3D pipeline written here: vertices,
   a rotation matrix, a perspective divide, faces sorted back to front, flat
   shading from a fixed light. The shaded result is then quantised to a grid of
   characters.

   That is deliberately on the nose. Jack wrote a software rasterizer from
   scratch in Python, so the site drawing its own project cards through a
   hand-rolled pipeline is the joke landing rather than a technical necessity.

   Canvas fills the projected polygons, because a hand-written scanline filler
   would be worse and slower than the one already in the browser. Everything
   that makes it 3D, the transform, the projection, the depth order and the
   shading, is here.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { FEATURED_PROJECTS, type FeaturedProject } from '@/lib/v2/content';
import { projects as ALL_PROJECTS } from '@/lib/projects-data';
import { onPaletteChange } from '@/lib/v2/paletteWatch';

/* -------------------------------------------------------------------------- */
/* 1. geometry                                                                 */
/* -------------------------------------------------------------------------- */

type V3 = [number, number, number];

interface Solid {
  verts: V3[];
  /** Vertex index loops. Wound so the normal points outward. */
  faces: number[][];
  /** 0..1 base tone before shading; lets one object read darker than another. */
  tone: number;
  /** Draw edges rather than filled faces. */
  wire?: boolean;
}

function box(w: number, h: number, d: number, tone = 0.7): Solid {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  return {
    tone,
    verts: [
      [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
      [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]
    ],
    faces: [
      [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7],
      [1, 5, 6, 2], [4, 5, 1, 0], [3, 2, 6, 7]
    ]
  };
}

/** A flat quad in the XY plane, used for sheets, pages, screens and charts. */
function panel(w: number, h: number, tone = 0.8): Solid {
  const x = w / 2;
  const y = h / 2;
  return { tone, verts: [[-x, -y, 0], [x, -y, 0], [x, y, 0], [-x, y, 0]], faces: [[0, 1, 2, 3]] };
}

function prism(r: number, h: number, sides: number, tone = 0.7): Solid {
  const verts: V3[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    verts.push([Math.cos(a) * r, -h / 2, Math.sin(a) * r]);
  }
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    verts.push([Math.cos(a) * r, h / 2, Math.sin(a) * r]);
  }
  const faces: number[][] = [];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    faces.push([i, j, j + sides, i + sides]);
  }
  faces.push(Array.from({ length: sides }, (_, i) => sides - 1 - i));
  faces.push(Array.from({ length: sides }, (_, i) => sides + i));
  return { verts, faces, tone };
}

function translate(s: Solid, dx: number, dy: number, dz: number): Solid {
  return { ...s, verts: s.verts.map((v) => [v[0] + dx, v[1] + dy, v[2] + dz] as V3) };
}
function rotY(s: Solid, a: number): Solid {
  const c = Math.cos(a);
  const n = Math.sin(a);
  return { ...s, verts: s.verts.map((v) => [v[0] * c + v[2] * n, v[1], -v[0] * n + v[2] * c] as V3) };
}
function rotX(s: Solid, a: number): Solid {
  const c = Math.cos(a);
  const n = Math.sin(a);
  return { ...s, verts: s.verts.map((v) => [v[0], v[1] * c - v[2] * n, v[1] * n + v[2] * c] as V3) };
}
/* In-plane tilt. At 87 by 31 cells the readable thing is the SILHOUETTE, and a
   diagonal edge in an otherwise orthogonal outline is worth more than any
   amount of surface detail — so anything meant to be noticed gets one. */
function rotZ(s: Solid, a: number): Solid {
  const c = Math.cos(a);
  const n = Math.sin(a);
  return { ...s, verts: s.verts.map((v) => [v[0] * c - v[1] * n, v[0] * n + v[1] * c, v[2]] as V3) };
}

/* -------------------------------------------------------------------------- */
/* 2. the object library                                                       */
/* -------------------------------------------------------------------------- */

type Builder = () => Solid[];

const OBJECTS: Record<string, Builder> = {
  cube: () => [box(1, 1, 1, 0.72)],

  wireCube: () => [{ ...box(1.1, 1.1, 1.1, 0.9), wire: true }],

  /**
   * A sealed ballot box with a sheet going into the slot.
   *
   * Built for Recensorium, and built rather than borrowed because the object
   * has to carry the argument: an agent never picks what it reviews and never
   * picks who reviews it, so the thing on the plate is a closed box you post
   * into, not a pile of papers you choose from.
   *
   * It also fixes a rendering problem that `paperStack` has by construction.
   * Seven near-parallel panels all face the key light at almost the same
   * angle, so the lambert term lands in a narrow band and the glyph ramp gets
   * two or three characters out of eleven to work with. Everything here is at
   * a different angle to everything else — a horizontal lid over vertical
   * walls, a dark slot, a band, and a sheet tipped back out of plane — which
   * is what gives the ramp its whole range to spend.
   */
  ballotBox: () => [
    /* the body */
    translate(box(1.1, 0.66, 0.76, 0.6), 0, -0.24, 0),
    /* The lid. Overhanging by a wide margin, because the step it puts in the
       outline is the only part of a lid a reader can see at this size — an
       earlier version overhung by 0.07 and simply was not there. */
    translate(box(1.44, 0.17, 0.94, 0.88), 0, 0.19, 0),
    /* The slot, standing proud of the lid and deliberately WIDER than the
       sheet: behind it, it is invisible, and the dark showing either side is
       the only thing that says the sheet is going INTO something. */
    translate(box(0.82, 0.06, 0.15, 0.09), 0, 0.29, 0),
    /* The base. This was a seal band around the middle, which measured as
       nothing at all: a tonal stripe on a face is below the resolution of the
       plate. Moved to the foot, where it is a second step in the outline. */
    translate(box(1.3, 0.12, 0.88, 0.44), 0, -0.63, 0),
    /*
     * The sheet going in. Tilted in plane as well as out of it, so it is the
     * one diagonal in the silhouette.
     *
     * Its tone is 0.44, not the 0.97 you would expect a piece of paper to
     * have, and that is not a mistake. The glyph ramp on this plate is
     * INVERTED for print: a lit face leaves the paper showing and a shadowed
     * one prints dense. At 0.97 the sheet measured as almost nothing — a few
     * scattered dots above the lid. Mid-tone is what "a piece of paper" looks
     * like when the page itself is the white.
     */
    translate(rotX(rotZ(panel(0.56, 0.5, 0.44), -0.3), -0.12), -0.04, 0.54, 0.04)
  ],

  /** A stack of sheets, slightly fanned, for papers and pencilled pages. */
  paperStack: () => {
    const out: Solid[] = [];
    for (let i = 0; i < 7; i++) {
      out.push(rotY(translate(panel(1.5, 1.05, 0.86 - i * 0.03), 0, -0.34 + i * 0.055, i * 0.012), (i - 3) * 0.035));
    }
    return out;
  },

  trophy: () => [
    prism(0.42, 0.42, 12, 0.82),
    translate(prism(0.1, 0.34, 8, 0.7), 0, -0.36, 0),
    translate(box(0.62, 0.16, 0.62, 0.6), 0, -0.6, 0),
    translate(prism(0.06, 0.3, 6, 0.75), -0.44, 0.02, 0),
    translate(prism(0.06, 0.3, 6, 0.75), 0.44, 0.02, 0)
  ],

  /** A screen on a stand. Used for monitors, dashboards and phones alike. */
  monitor: () => [
    translate(box(1.7, 1.05, 0.1, 0.6), 0, 0.22, 0),
    translate(panel(1.5, 0.86, 0.95), 0, 0.22, 0.06),
    translate(box(0.24, 0.34, 0.2, 0.5), 0, -0.44, 0),
    translate(box(0.8, 0.07, 0.44, 0.55), 0, -0.62, 0)
  ],

  phone: () => [
    translate(box(0.62, 1.2, 0.09, 0.55), 0, 0, 0),
    translate(panel(0.52, 1.02, 0.95), 0, 0.02, 0.06)
  ],

  tower: () => [
    box(0.72, 1.5, 0.86, 0.62),
    translate(panel(0.5, 0.1, 0.9), 0, 0.5, 0.44),
    translate(panel(0.5, 0.06, 0.85), 0, 0.32, 0.44)
  ],

  mountain: () => {
    const out: Solid[] = [];
    const peaks: Array<[number, number, number]> = [[-0.6, 0.7, 0.55], [0.15, 1.05, 0.8], [0.75, 0.62, 0.5]];
    for (const [x, h, w] of peaks) {
      out.push(translate(prism(w, h, 4, 0.7), x, h / 2 - 0.5, 0));
    }
    return out;
  },

  rucksack: () => [
    box(0.95, 1.2, 0.62, 0.66),
    translate(box(0.8, 0.34, 0.2, 0.58), 0, -0.3, 0.4),
    translate(box(0.16, 0.9, 0.12, 0.5), -0.3, 0.1, -0.38),
    translate(box(0.16, 0.9, 0.12, 0.5), 0.3, 0.1, -0.38)
  ],

  guitar: () => [
    translate(prism(0.52, 0.16, 14, 0.7), 0, -0.36, 0),
    translate(prism(0.38, 0.16, 14, 0.72), 0, 0.12, 0),
    translate(box(0.16, 1.15, 0.1, 0.6), 0, 0.72, 0),
    translate(box(0.24, 0.2, 0.09, 0.5), 0, 1.34, 0)
  ],

  /** A grid of cells: the consistency heatmap, a digit sheet, a card wall. */
  cardGrid: () => {
    const out: Solid[] = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 8; c++) {
        const on = (r * 8 + c) % 3 !== 0;
        out.push(translate(panel(0.17, 0.17, on ? 0.95 : 0.42), -0.72 + c * 0.2, 0.42 - r * 0.2, 0));
      }
    }
    return out;
  },

  folder: () => [
    translate(box(1.5, 1.0, 0.05, 0.66), 0, 0, -0.04),
    translate(box(1.5, 1.0, 0.05, 0.78), 0, 0.04, 0.04),
    translate(box(0.5, 0.14, 0.05, 0.6), -0.46, 0.56, -0.04)
  ],

  /** A sheet draped over something whose shape you cannot quite make out. */
  dustSheet: () => {
    const out: Solid[] = [];
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const w = 1.5 - Math.abs(t - 0.5) * 0.7;
      out.push(rotX(translate(panel(w, 0.22, 0.84 - Math.abs(t - 0.5) * 0.2), 0, 0.6 - t * 1.2, Math.sin(t * Math.PI) * 0.35), 0.5));
    }
    return out;
  },

  lamp: () => [
    translate(prism(0.42, 0.36, 10, 0.9), 0, 0.55, 0),
    translate(box(0.06, 0.9, 0.06, 0.6), 0, 0, 0),
    translate(prism(0.34, 0.08, 10, 0.55), 0, -0.5, 0)
  ],

  /** A single large triangle, half of it banded, for the rasterizer. */
  triangle: () => {
    const out: Solid[] = [
      { tone: 0.5, verts: [[-0.9, -0.7, 0], [0.9, -0.7, 0], [0.05, 0.85, 0]], faces: [[0, 1, 2]], wire: true }
    ];
    for (let i = 0; i < 7; i++) {
      const y = -0.66 + i * 0.13;
      const k = (y + 0.7) / 1.55;
      const halfW = 0.88 * (1 - k);
      out.push(translate(panel(halfW * 1.1, 0.07, 0.92), 0.05 - halfW * 0.05, y, 0.01));
    }
    return out;
  },

  /** A curve flattening out, plotted as a run of bars. */
  curve: () => {
    const out: Solid[] = [];
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const h = 0.15 + Math.exp(-t * 3.4) * 1.15;
      out.push(translate(box(0.075, h, 0.075, 0.62 + t * 0.3), -0.75 + i * 0.115, -0.55 + h / 2, 0));
    }
    return out;
  },

  /** Stacked translucent slabs, for a depth buffer read as fog. */
  fogSlabs: () => {
    const out: Solid[] = [];
    for (let i = 0; i < 6; i++) {
      out.push(translate(panel(1.5 - i * 0.12, 1.0 - i * 0.08, 0.3 + i * 0.11), 0, 0, -0.5 + i * 0.18));
    }
    return out;
  },

  /** A standing figure, blocked out and mid-stride. */
  figure: () => [
    translate(prism(0.16, 0.16, 8, 0.86), 0, 0.72, 0),
    translate(box(0.34, 0.62, 0.2, 0.72), 0, 0.28, 0),
    translate(rotX(box(0.13, 0.5, 0.13, 0.66), 0.5), -0.16, -0.24, 0.1),
    translate(rotX(box(0.13, 0.5, 0.13, 0.66), -0.55), 0.16, -0.24, -0.1),
    translate(rotX(box(0.1, 0.44, 0.1, 0.62), -0.7), -0.28, 0.36, 0.06),
    translate(rotX(box(0.1, 0.44, 0.1, 0.62), 0.6), 0.28, 0.36, -0.06)
  ],

  /** A run of keyframe markers along a track. */
  timeline: () => {
    const out: Solid[] = [translate(box(1.8, 0.06, 0.06, 0.5), 0, 0, 0)];
    for (let i = 0; i < 6; i++) {
      const x = -0.78 + i * 0.31;
      out.push(translate(rotY(box(0.13, 0.13, 0.13, 0.9), Math.PI / 4), x, 0, 0));
    }
    return out;
  },

  /** A radar chart with deliberately uneven arms. */
  radar: () => {
    const out: Solid[] = [];
    const arms = [0.9, 0.55, 0.78, 0.35, 0.66, 0.48];
    for (let i = 0; i < arms.length; i++) {
      const a = (i / arms.length) * Math.PI * 2 - Math.PI / 2;
      const r = arms[i];
      out.push(translate(box(0.05, r, 0.05, 0.8), (Math.cos(a) * r) / 2, (Math.sin(a) * r) / 2, 0));
      out.push(translate(panel(0.11, 0.11, 0.95), Math.cos(a) * r, Math.sin(a) * r, 0.02));
    }
    return out;
  }
};

/* Collage strings in content.ts are prose, so map them by keyword. Anything
   unmatched falls back to a solid rather than rendering an empty panel. */
const KEYWORDS: Array<[RegExp, string]> = [
  [/dust sheet|draped/i, 'dustSheet'],
  [/folder/i, 'folder'],
  [/light|blind|lamp/i, 'lamp'],
  [/wireframe figure|figure|mid-stride/i, 'figure'],
  [/timeline|keyframe/i, 'timeline'],
  [/tower|desktop/i, 'tower'],
  [/radar/i, 'radar'],
  [/phone/i, 'phone'],
  [/grid|squares|digits/i, 'cardGrid'],
  [/curve|loss/i, 'curve'],
  [/triangle|scanline/i, 'triangle'],
  [/depth buffer|fog/i, 'fogSlabs'],
  [/wireframe|\.obj|model/i, 'wireCube'],
  /* before the paper rule: a ballot box with a paper in it is a ballot box */
  [/ballot/i, 'ballotBox'],
  [/paper|page|pencil|margin/i, 'paperStack'],
  [/trophy/i, 'trophy'],
  [/monitor|screen|dashboard/i, 'monitor'],
  [/mountain|peak|ridge/i, 'mountain'],
  [/rucksack|bag/i, 'rucksack'],
  [/guitar/i, 'guitar']
];

function objectFor(desc: string): Solid[] {
  for (const [re, key] of KEYWORDS) {
    if (re.test(desc)) return OBJECTS[key]();
  }
  return OBJECTS.cube();
}

/**
 * ONE object, centred, as large as the plate will take.
 *
 * It used to be three, staggered and overlapping at scales 1.0, 0.62 and 0.52.
 * Jack, 2026-08-25: "the scenes don't really show anything, they're very
 * obscured. Just make them normal 3D objects." He was right, and the collage
 * was the second cause rather than the first — three solids sharing a plate
 * this small occlude each other into one silhouette, and at 87 by 31 cells
 * there is not enough resolution to read the seams between them.
 *
 * So the first item in the collage is the object, and the rest of the list is
 * kept because it still describes the project in `content.ts` and reads as
 * intent for whoever draws the next one.
 *
 * A second object can go back in when there is a treatment that can hold it.
 * The trophy-case plate (AwardsCase) puts five on one ellipse legibly, and it
 * does that by giving each one its own plinth and a lot more cells.
 */
function buildScene(collage: readonly string[]): Solid[] {
  const desc = collage[0] ?? '';
  /* Centred, and scaled up now there is nothing to share the plate with. */
  const S = 1.34;
  return objectFor(desc).map((solid) => ({
    ...solid,
    verts: solid.verts.map((v) => [v[0] * S, v[1] * S, v[2] * S] as V3)
  }));
}

/* -------------------------------------------------------------------------- */
/* 3. component                                                                */
/* -------------------------------------------------------------------------- */

/* dev-only: capture one frame of shade values, see __reel.shades() */
const SHADE_LOG: { on: boolean; v: number[] } = { on: false, v: [] };

/* ==========================================================================
   THE SCREEN, which used to be a glyph ramp.

   Jack, 2026-08-26: "remove the ascii filter and maybe add dithering or
   something."

   The ASCII was the wrong instrument for this plate twice over. It rendered
   the model into a 7x13 CHARACTER cell, so the object had to be pre-squashed
   by the cell aspect and every silhouette arrived on a grid whose two axes
   disagreed. And an ASCII face is a texture of letters: at any real size you
   read the letters, not the form.

   This is a HALFTONE instead. Square cells, one dot each, and the dot's AREA
   carries the tone — which is why the radius goes as sqrt(coverage) and not as
   coverage. Get that wrong and the midtones sag, because a dot of half the
   radius is a quarter of the ink.

   The Bayer matrix is there to break up the two places a pure halftone shows
   its grid: the very light end, where identical tiny dots line up into rows,
   and a large flat face, where identical dots read as wallpaper. It perturbs
   the threshold, not the size, so the tone stays correct.

   The mapping is INVERTED, because this prints on paper. A brightly lit face
   leaves the paper showing; a face in shadow fills with ink.
   ========================================================================== */

/**
 * Dot pitch in CSS px. Square, unlike the character cell it replaces.
 *
 * 2 rather than 3. Jack, 2026-08-26: "the objects aren't very high quality."
 * The centre plate is 58% of the stage now that the neighbours actually sit
 * beside it rather than on top of it, so at a 3px pitch the object was landing
 * on about a hundred cells across and every curve in it was a staircase. Two
 * is a little over twice the cells for a plate that only paints while it is
 * turning, which is three quarters of a second per selection.
 */
const DOT = 2;

/**
 * 8x8 ordered dither, values in 0..1, MEAN 0.4921875.
 *
 * That figure is measured, not remembered. The centre of an 8x8 Bayer matrix
 * built as (index + 0.5) / 64 is 0.4921875, and writing 0.46875 from memory —
 * which happened on this project once already, in the ink wash — biases every
 * threshold by a sixty-fourth and speckles empty paper.
 */
const BAYER = (() => {
  const m = new Float32Array(64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      let v = 0;
      let mask = 4;
      let bit = 0;
      /* the standard recursive interleave, unrolled over three levels */
      for (let i = 0; i < 3; i++) {
        const xb = (x & mask) ? 1 : 0;
        const yb = (y & mask) ? 1 : 0;
        v |= (yb ^ xb) << (2 * i + 1);
        v |= yb << (2 * i);
        mask >>= 1;
        bit++;
      }
      void bit;
      m[y * 8 + x] = (v + 0.5) / 64;
    }
  }
  return m;
})();

/**
 * The object sits still. Jack, 2026-08-25: "the carousel should be the 3D
 * object (not spinning) ... then it spins to them."
 *
 * So rotation is not an idle animation any more, it is the TRANSITION. At rest
 * the plate holds this three-quarter view and the frame loop stops entirely,
 * which is the largest performance win available here: the reel used to repaint
 * sixty times a second forever to show an object nobody asked to see turning.
 */
const REST_ANG = 0.62;
const REST_TILT = -0.22;
/** One full revolution, handing over to the next project halfway through. */
const SPIN_MS = 780;

/** Light direction in view space, normalised, close to the camera axis. */
const LIGHT: readonly [number, number, number] = (() => {
  const v: [number, number, number] = [-0.34, 0.46, -0.82];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();
/* Square, so the projection no longer has to pre-squash the object to undo
   the aspect of a character cell. See THE SCREEN above. */
const CELL_W = DOT;
const CELL_H = DOT;

export interface HighlightReelProps {
  className?: string;
  height?: number;
}

export default function HighlightReel({ className, height = 400 }: HighlightReelProps) {
  const [index, setIndex] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /* Set by the render effect; called when `index` changes so the idle loop
     wakes up and runs the turn. */
  const kickRef = useRef<(() => void) | null>(null);
  /* The two neighbours. Still images: they are painted once per selection and
     never animate, so they cost one pass each and nothing at rest. */
  const prevRef = useRef<HTMLCanvasElement | null>(null);
  const nextRef = useRef<HTMLCanvasElement | null>(null);
  const indexRef = useRef(0);
  indexRef.current = index;

  const project: FeaturedProject = FEATURED_PROJECTS[index];

  /* tech tags come from the real project record, not from the reel copy */
  const tech = useMemo(() => {
    const p = ALL_PROJECTS.find((x) => x.id === project.id);
    return (p?.tech ?? []).slice(0, 6);
  }, [project.id]);

  const step = useCallback((d: number) => {
    setIndex((i) => (i + d + FEATURED_PROJECTS.length) % FEATURED_PROJECTS.length);
  }, []);

  useEffect(() => {
    kickRef.current?.();
  }, [index]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /*
     * The glyph atlas used to be built here: a strip of ten characters, drawn
     * white on transparent, blitted one per cell and recoloured afterwards.
     * It is gone with the ASCII. A halftone dot is one arc call in the page's
     * own ink, so there is nothing to cache and nothing to recolour.
     */

    /* offscreen the 3D is shaded into, one cell per pixel */
    const shade = document.createElement('canvas');
    const sctx = shade.getContext('2d', { willReadFrequently: true });
    if (!sctx) return;

    let cols = 0;
    let rows = 0;
    let dpr = 1;
    let W = 0;
    let H = 0;
    let scene: Solid[] = buildScene(FEATURED_PROJECTS[0].collage);
    let sceneFor = 0;
    /* Which project we are turning TOWARDS, and where the turn started. */
    let spinTarget = 0;
    let spinStart = 0;
    let spinning = false;
    /* which project the neighbours were last painted for */
    let neighboursFor = -1;
    /* preallocated: nothing may be created inside the frame loop */
    let lum: Uint8ClampedArray | null = null;

    /**
     * Size the backing store to the box. Returns true if anything moved.
     *
     * THE STALE BOX WAS THE WHOLE OF "THE OBJECT DOESN'T APPEAR AT FIRST" AND
     * "THE OBJECTS APPEAR OFF TO THE RIGHT OF THE VIEWPORT".
     *
     * This used to run once, at mount, with nothing but a window resize
     * listener behind it. The stage is inside a section that reveals, under
     * type set in a web font that lands after first paint, in a grid whose
     * columns depend on both: the box it measured at mount was not the box it
     * ended up with. And because the stylesheet asked for `width: auto` on a
     * canvas — a replaced element, so auto means the intrinsic width, which is
     * whatever this function last wrote to the width attribute — the stale
     * measurement then became the CSS width and locked itself in. An 800px
     * canvas in a 606px stage, clipped on the right by the stage's own
     * overflow, with the object drawn at its centre and therefore sitting near
     * the right edge of what you could see.
     *
     * The CSS states a real width now, and this runs whenever the box changes.
     */
    function layout(): boolean {
      const r = canvas!.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const d = Math.min(window.devicePixelRatio || 1, 2);
      const nw = Math.round(r.width);
      const nh = Math.round(r.height);
      if (nw === W && nh === H && d === dpr) return false;
      dpr = d;
      W = nw;
      H = nh;
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.imageSmoothingEnabled = false;
      cols = Math.max(8, Math.ceil(W / CELL_W));
      rows = Math.max(6, Math.ceil(H / CELL_H));
      shade.width = cols;
      shade.height = rows;
      return true;
    }
    layout();

    /* The light lives at module scope now — see LIGHT near the glyph ramp.
       A local of the same name used to sit here, left over from before the
       shading was rewritten, and it pointed AWAY from the camera at
       [0.42, 0.72, 0.55]. Once the normals were flipped to face the viewer it
       shadowed the real light and made every dot product negative, so every
       face clamped to lambert 0 and the whole plate printed as one solid
       silhouette. Do not reintroduce a local by this name. */

    let t = 0;
    let raf = 0;
    let running = true;
    let onScreen = true; // optimistic: never wait on IO for a first paint

    /**
     * Paint one scene, at one rotation, into one context.
     *
     * Pulled out of render() so the same pipeline can serve the live centre
     * plate and the two still neighbours beside it. Everything it needs is a
     * parameter, so there is no hidden dependency on the main canvas left.
     *
     * `shade`, the cols-by-rows greyscale buffer, is shared and resized per
     * call: it is a few thousand pixels, so reallocating it is cheaper than
     * keeping one per target, and the calls never interleave.
     */
    function paint(
      tctx: CanvasRenderingContext2D,
      tW: number,
      tH: number,
      tCols: number,
      tRows: number,
      scn: Solid[],
      ang: number,
      tilt: number,
      ink: string
    ) {
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);
      if (shade.width !== tCols || shade.height !== tRows) {
        shade.width = tCols;
        shade.height = tRows;
      }
      sctx!.fillStyle = "#000";
      sctx!.fillRect(0, 0, tCols, tRows);
      /* 1.9 used to be here, undoing the 7:13 character cell. The cells are
         square now, so the object is drawn at its own proportions. 0.40 rather
         than 0.34 because the centre plate is 58% of the stage now that the
         neighbours are beside it instead of over it. */
      const scale = Math.min(tCols, tRows) * 0.4;
      const cx = tCols / 2;
      const cy = tRows / 2;
      /* One projected, shaded face, ready to be depth-sorted and filled. */
      type Ready = { pts: number[]; depth: number; shade: number; wire: boolean };
      const ready: Ready[] = [];
      for(let si = 0; si < scn.length; si++){
        const s = scn[si];
        const vs = s.verts;
        const n = vs.length;
        const px = new Array<number>(n);
        const py = new Array<number>(n);
        const pz = new Array<number>(n);
        /* View space is kept as well as screen space. The projected points
        cannot be used for lighting: after the perspective divide the
        polygon is no longer the shape the light hits, and its cross product
        only tells you which way the face is wound. */ const vx = new Array<number>(n);
        const vy = new Array<number>(n);
        for(let i = 0; i < n; i++){
          const v = vs[i];
          /* rotate about Y, then X */ const x1 = v[0] * ca + v[2] * sa;
          const z1 = -v[0] * sa + v[2] * ca;
          const y2 = v[1] * ct - z1 * st;
          const z2 = v[1] * st + z1 * ct;
          /* perspective divide */ const d = 4.2 + z2;
          const k = 3.6 / Math.max(d, 0.35);
          px[i] = cx + x1 * scale * k;
          py[i] = cy - y2 * scale * k;
          pz[i] = z2;
          vx[i] = x1;
          vy[i] = y2;
        }
        for(let fi = 0; fi < s.faces.length; fi++){
          const f = s.faces[fi];
          let depth = 0;
          for(let i = 0; i < f.length; i++)depth += pz[f[i]];
          depth /= f.length;
          /*
          * Flat shading from a REAL face normal.
          *
          * This used to be the sign of the projected cross product, which is
          * a winding test and not a normal: it gave every face one of two
          * values, so the whole scn shaded into the top of the glyph ramp
          * and printed as one solid mass. Newell's method over the view-space
          * polygon gives an actual normal, and a dot product against a fixed
          * light gives a continuous term that uses the whole ramp.
          *
          * Newell rather than a cross product of the first three vertices,
          * because several of these solids have quads that are not perfectly
          * planar and a three-vertex cross product on those flips at random.
          */ let nx = 0;
          let ny = 0;
          let nz = 0;
          for(let i = 0; i < f.length; i++){
            const j = f[i];
            const k2 = f[(i + 1) % f.length];
            nx += (vy[j] - vy[k2]) * (pz[j] + pz[k2]);
            ny += (pz[j] - pz[k2]) * (vx[j] + vx[k2]);
            nz += (vx[j] - vx[k2]) * (vy[j] + vy[k2]);
          }
          const nl = Math.hypot(nx, ny, nz) || 1;
          nx /= nl;
          ny /= nl;
          nz /= nl;
          /* Two-sided: these are open forms and several are single panels, so
          a face pointing away is still lit rather than black. */ if (nz > 0) {
            nx = -nx;
            ny = -ny;
            nz = -nz;
          }
          /* Light near the camera axis. A raking light looks better on a solid
          render and is wrong here: no face ever reaches a high lambert, so
          the ramp never uses its light end and the plate greys out. */ const lambert = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
          const sh = Math.max(0.06, Math.min(1, s.tone * (0.14 + 0.86 * lambert)));
          const pts: number[] = [];
          for(let i = 0; i < f.length; i++){
            pts.push(px[f[i]], py[f[i]]);
          }
          ready.push({
            pts,
            depth,
            shade: sh,
            wire: !!s.wire
          });
          if (SHADE_LOG.on) SHADE_LOG.v.push(sh);
        }
      }
      ready.sort((p, q)=>p.depth - q.depth);
      for(let i = 0; i < ready.length; i++){
        const r = ready[i];
        const g = Math.round(r.shade * 255);
        sctx!.beginPath();
        sctx!.moveTo(r.pts[0], r.pts[1]);
        for(let k = 2; k < r.pts.length; k += 2)sctx!.lineTo(r.pts[k], r.pts[k + 1]);
        sctx!.closePath();
        if (r.wire) {
          sctx!.strokeStyle = `rgb(${g},${g},${g})`;
          sctx!.lineWidth = 0.9;
          sctx!.stroke();
        } else {
        sctx!.fillStyle = `rgb(${g},${g},${g})`;
        sctx!.fill();
      }
      }
      /* --- screen it --------------------------------------------------
         One dot per cell, area proportional to how much ink the cell wants,
         with the Bayer matrix perturbing the THRESHOLD rather than the size so
         the tone stays correct. See THE SCREEN at the top of this file.
         ---------------------------------------------------------------- */
      const img = sctx!.getImageData(0, 0, tCols, tRows);
      lum = img.data;
      tctx.clearRect(0, 0, tW, tH);
      /* Drawn straight in the page's ink. The old glyph path painted white and
         recoloured the whole plate afterwards with a source-in fill, which was
         the right trade for an atlas and is pure cost for a circle. */
      tctx.fillStyle = ink;
      const rMax = DOT * 0.62;
      for (let r = 0; r < tRows; r++) {
        for (let c = 0; c < tCols; c++) {
          const v = lum[(r * tCols + c) * 4] / 255;
          /* Background first. The offscreen buffer is cleared to opaque black,
             so v = 0 means "nothing drawn here", and it has to be rejected
             BEFORE the inversion or empty paper would print as solid ink. */
          if (v < 0.04) continue;
          const cov = 1 - v;
          const th = BAYER[(r & 7) * 8 + (c & 7)];
          /* The light end. Without this, coverage below one dot's worth
             quantises into rows of identical specks and the grid shows. */
          if (cov < th * 0.16) continue;
          /* AREA carries tone, so the radius goes as the square root. Linear
             radius sags every midtone, because half the radius is a quarter
             of the ink. */
          const rad = rMax * Math.sqrt(Math.min(1, cov));
          if (rad < 0.22) continue;
          tctx.beginPath();
          tctx.arc(c * CELL_W + CELL_W / 2, r * CELL_H + CELL_H / 2, rad, 0, Math.PI * 2);
          tctx.fill();
        }
      }
    }

    function render(now: number) {

      /*
      * The scene swaps at the HALFWAY point of the spin, not when the index
      * changes. That is what makes it read as the carousel turning to the next
      * project rather than as one object being replaced by another: the old
      * one rotates away, and the new one rotates in from behind.
      */ if (indexRef.current !== spinTarget) {
        spinTarget = indexRef.current;
        spinStart = now;
        spinning = true;
      }
      let ang = REST_ANG;
      if (spinning && !reduce) {
        const p = Math.min(1, (now - spinStart) / SPIN_MS);
        /* ease-in-out, so it leaves and arrives without a jolt */ const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        ang = REST_ANG + e * Math.PI * 2;
        if (e >= 0.5 && sceneFor !== spinTarget) {
          sceneFor = spinTarget;
          scene = buildScene(FEATURED_PROJECTS[sceneFor].collage);
        }
        if (p >= 1) {
          spinning = false;
          ang = REST_ANG;
        }
      }
      if (sceneFor !== spinTarget) {
        /* reduced motion, or a jump that never span: swap outright */ sceneFor = spinTarget;
        scene = buildScene(FEATURED_PROJECTS[sceneFor].collage);
      }

      const tilt = REST_TILT;
      paint(
        ctx!,
        W,
        H,
        cols,
        rows,
        scene,
        ang,
        tilt,
        getComputedStyle(canvas!).color || '#17140F'
      );

      /* Neighbours follow the centre, but only once it has actually landed:
         repainting them mid-spin would be two more full pipeline passes per
         frame for a picture nobody can read while it is moving. */
      if (!spinning && neighboursFor !== sceneFor) {
        neighboursFor = sceneFor;
        paintNeighbours();
      }

      /*
       * Only keep the loop alive while something is actually moving. At rest
       * the plate is a still image and re-rendering it is pure waste: this is
       * what turns the reel from a permanent 30fps cost into one that is free
       * except during the three quarters of a second it is turning.
       */
      if (spinning) raf = requestAnimationFrame(loop);
      else raf = 0;
    }

    /**
     * Paint the project either side, still and square-on.
     *
     * They are drawn at REST_ANG like the centre, so the three plates read as
     * the same object seen three times rather than three unrelated pictures.
     * The fade and the blur are CSS on the elements: a canvas filter would
     * cost a pass per repaint, and these never repaint.
     *
     * A cell one size up from the centre's, because a plate this small at 7x13
     * is mostly empty grid. It is going to be blurred anyway.
     */
    function paintNeighbours() {
      const n = FEATURED_PROJECTS.length;
      const ink = getComputedStyle(canvas!).color || '#17140F';
      const targets: Array<[HTMLCanvasElement | null, number]> = [
        [prevRef.current, (sceneFor - 1 + n) % n],
        [nextRef.current, (sceneFor + 1) % n]
      ];
      for (const [el, idx] of targets) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const d = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.round(r.width);
        const h = Math.round(r.height);
        if (el.width !== Math.round(w * d) || el.height !== Math.round(h * d)) {
          el.width = Math.round(w * d);
          el.height = Math.round(h * d);
        }
        const c2 = el.getContext('2d');
        if (!c2) continue;
        c2.setTransform(d, 0, 0, d, 0, 0);
        c2.clearRect(0, 0, w, h);
        /* One pitch up from the centre, and square like it: the sides are
           blurred and half-transparent, so the extra cells would not survive
           the treatment anyway. */
        const cc = Math.max(8, Math.ceil(w / (CELL_W + 1)));
        const rr2 = Math.max(6, Math.ceil(h / (CELL_H + 1)));
        paint(
          c2,
          w,
          h,
          cc,
          rr2,
          buildScene(FEATURED_PROJECTS[idx].collage),
          REST_ANG,
          REST_TILT,
          ink
        );
      }
      /* the shared shade buffer is left at the neighbours' size; put it back */
      shade.width = cols;
      shade.height = rows;
    }

    function loop(now: number) {
      if (!running || !onScreen) { raf = 0; return; }
      t = now / 1000;
      render(now);
    }

    /** Wake the loop. Called when the reader picks a different project. */
    function kick() {
      if (!running || !onScreen || reduce) {
        /* reduced motion still needs the new plate, just without the turn */
        if (running && reduce) render(performance.now());
        return;
      }
      if (!raf) raf = requestAnimationFrame(loop);
    }
    kickRef.current = kick;

    if (reduce) {
      render(0);
    } else {
      raf = requestAnimationFrame(loop);
    }

    const io = new IntersectionObserver(
      (e) => {
        onScreen = e[0].isIntersecting;
        if (onScreen && running && !reduce && !raf) raf = requestAnimationFrame(loop);
        if (!onScreen) { cancelAnimationFrame(raf); raf = 0; }
      },
      { threshold: 0.01 }
    );
    io.observe(canvas);

    function onVis() {
      running = !document.hidden;
      if (running && onScreen && !reduce && !raf) raf = requestAnimationFrame(loop);
      if (!running) { cancelAnimationFrame(raf); raf = 0; }
    }
    document.addEventListener('visibilitychange', onVis);

    /* The plate is drawn in the page's ink, read off the canvas once per
       render — and a render only happens while the object is turning. A plate
       change is therefore invisible to it unless it is told. */
    const stopPalette = onPaletteChange(() => {
      if (!running) return;
      if (!spinning) render(performance.now());
    });

    let rr = 0;
    function relayout() {
      rr = 0;
      if (!layout()) return;
      /* the sides are stills painted at their own size, so they are stale too */
      neighboursFor = -1;
      if (!spinning) render(performance.now());
    }
    function onResize() {
      cancelAnimationFrame(rr);
      rr = requestAnimationFrame(relayout);
    }
    window.addEventListener('resize', onResize);

    /* A ResizeObserver on the plate itself, which is the thing that actually
       changes: the reveal, the web font landing, and the grid re-solving are
       all invisible to a window resize listener. See layout(). */
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    ro?.observe(canvas);

    /* Dev-only handle. Headless and hidden panes never fire rAF and report the
       canvas as non-intersecting, so there is otherwise no way to drive a frame
       and check what the pipeline actually draws. Matches InkField/Companion. */
    if (process.env.NODE_ENV !== 'production') {
      (canvas as any).__reel = {
        renderOnce: (time = 0) => { t = time; render(time * 1000); cancelAnimationFrame(raf); raf = 0; },
        info: () => ({ cols, rows, solids: scene.length, sceneFor }),
        shades: (time = 0) => {
          SHADE_LOG.on = true;
          SHADE_LOG.v = [];
          t = time;
          render(time * 1000);
          cancelAnimationFrame(raf);
          raf = 0;
          SHADE_LOG.on = false;
          return SHADE_LOG.v.slice();
        }
      };
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(rr);
      io.disconnect();
      ro?.disconnect();
      stopPalette();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div className={`v2-reel${className ? ' ' + className : ''}`}>
      {/* The stage is a bordered plate on tinted stock, so its box top is the
          visible line: no inset. See THE PERCH CONTRACT in Companion.tsx. */}
      <div className="v2-reel-stage" style={{ height }} data-perch>
        <canvas
          ref={prevRef}
          className="v2-reel-side is-prev"
          aria-hidden="true"
        />
        <canvas
          ref={nextRef}
          className="v2-reel-side is-next"
          aria-hidden="true"
        />
        <canvas ref={canvasRef} className="v2-reel-main" aria-hidden="true" />
        {/* Arrows flank the object rather than sitting under it, so the thing
            you are steering and the controls that steer it are the same
            gesture. They are real buttons on top of the canvas, which is why
            the canvas is aria-hidden and these carry the labels. */}
        <button
          type="button"
          className="v2-reel-arrow is-prev"
          onClick={() => step(-1)}
          aria-label="Previous project"
        >
          <svg width="13" height="22" viewBox="0 0 13 22" aria-hidden="true">
            <path d="M10.5 1.5 L2.5 11 l8 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
        <button
          type="button"
          className="v2-reel-arrow is-next"
          onClick={() => step(1)}
          aria-label="Next project"
        >
          <svg width="13" height="22" viewBox="0 0 13 22" aria-hidden="true">
            <path d="M2.5 1.5 L10.5 11 l-8 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </div>

      <div className="v2-reel-panel" aria-live="polite">
        <p className="v2-reel-count">
          {String(index + 1).padStart(2, '0')} of {String(FEATURED_PROJECTS.length).padStart(2, '0')}
        </p>
        {/* line-height 1.06 on the display face, so the cap line sits 0.20em
            below the content top */}
        <h3 className="v2-reel-title" data-perch data-perch-text data-perch-inset="0.12em">
          {project.title}
        </h3>
        <p className="v2-reel-hook">{project.hook}</p>
        {tech.length ? (
          <ul className="v2-reel-tech">
            {tech.map((tg) => (
              <li key={tg}>{tg}</li>
            ))}
          </ul>
        ) : null}

        {/*
          THE WAY IN. Jack, 2026-08-26: "there is no link to each project (each
          should have its own custom page) ... there is also no link to an 'all
          projects' page."

          Both live here rather than under the dots, because this panel is the
          part of the reel that is about ONE project and the dots are the part
          that is about the set. The first link is where you go if the object
          you are looking at interested you; the second is where you go if it
          did not.

          data-perch on the row: it is a real line of ink with a rule above it,
          which is a place a bird can stand. See THE PERCH CONTRACT in
          components/v2/Companion.tsx.
        */}
        <p className="v2-reel-go" data-perch>
          <Link href={`/projects/${project.id}`} className="is-lead">
            Open {project.title}
          </Link>
          <Link href="/projects">Every project</Link>
        </p>
      </div>

      <div className="v2-reel-controls">
        <ol className="v2-reel-dots">
          {FEATURED_PROJECTS.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                aria-label={p.title}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => setIndex(i)}
              />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
