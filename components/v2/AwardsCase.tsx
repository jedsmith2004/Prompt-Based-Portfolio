'use client';

/* ============================================================================
   AwardsCase — five awards, five objects, drawn by the site's own renderer.

   THE ARGUMENT
   A list of five awards is a CV line. What the awards actually say is that the
   same person shipped an AR lens a million strangers used, ran a milkshake
   stand, argued drug policy at a lectern, was judged on repository structure,
   and put a swarm of robots inside a pipe. Five different rooms. So the case
   holds five different objects, not five identical cups, and each one is
   modelled from vertices rather than fetched as an icon.

   THE PIPELINE (deliberate, and the same technique as HighlightReel.tsx)
   Model space -> per-object yaw, scale and ring placement -> camera tilt ->
   perspective divide -> Newell face normals -> flat shading from one fixed
   light -> painter's sort back to front -> quantise to a grid of characters.
   Jack wrote a software rasterizer from scratch, so the site drawing its own
   trophies through a hand-rolled pipeline is the point of the section.

   The filler is hand-written too. The shade buffer is about 160 cells by 40,
   and pushing ~560 polygons through the 2D context to reach something that
   small cost more in state changes, colour-string building and the readback
   than the whole rest of the frame put together. A scanline filler straight
   into a typed array is several times faster here, allocates nothing, and
   needs no antialiasing, because a cell is about to become one character
   either way.

   PRINTED, NOT TERMINAL
   The ground is paper, so the glyph ramp is inverted: a lit face prints faint,
   a face in shadow prints dense. That is an engraving, not a console. Distance
   fades toward the paper. The selected object prints in vermilion, the other
   four sit pale behind it.

   FRAME BUDGET
   Geometry is flattened once, at module load, into typed arrays. The frame
   loop allocates nothing: projection, shading, the painter's sort and the
   filler all write into preallocated scratch. The sort is an insertion sort,
   which is the right choice here because the face order barely changes between
   frames.

   What is left costs about 4ms, and nearly all of it is the last step: one
   drawImage per covered cell, of which there are a couple of thousand. So the
   loop is gated to 30fps. Nothing in the case moves faster than a slow sway
   and a half-second ease, this page has several canvases on it already, and
   the difference is not visible.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import context from '@/public/context.json';

/* -------------------------------------------------------------------------- */
/* 1. geometry primitives                                                      */
/* -------------------------------------------------------------------------- */

type V3 = [number, number, number];

interface Solid {
  verts: V3[];
  /** Vertex index loops, wound so the Newell normal points outward. */
  faces: number[][];
  /** 0..1 base tone before shading. 1 prints faint, 0 prints dense. */
  tone: number;
  /** Stroke the outline rather than filling the face. */
  wire?: boolean;
}

const TAU = Math.PI * 2;

/** Axis-aligned box. Every face verified outward-wound by right-hand rule. */
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
      [0, 3, 2, 1], // -z
      [4, 5, 6, 7], // +z
      [0, 4, 7, 3], // -x
      [1, 2, 6, 5], // +x
      [0, 1, 5, 4], // -y
      [3, 7, 6, 2]  // +y
    ]
  };
}

/** A flat quad in the XY plane facing +z. Screens, pages, cards, markers. */
function panel(w: number, h: number, tone = 0.8): Solid {
  const x = w / 2;
  const y = h / 2;
  return { tone, verts: [[-x, -y, 0], [x, -y, 0], [x, y, 0], [-x, y, 0]], faces: [[0, 1, 2, 3]] };
}

/**
 * Solid of revolution about Y. `profile` is [radius, y] from bottom to top.
 * A radius of 0 collapses that ring to the axis, which is how domes and
 * balloons close. Newell normals cope with the degenerate quads that leaves.
 */
function lathe(
  profile: Array<[number, number]>,
  sides: number,
  tone: number,
  caps = false
): Solid {
  const verts: V3[] = [];
  for (const [r, y] of profile) {
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * TAU;
      verts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
  }
  const faces: number[][] = [];
  for (let s = 0; s < profile.length - 1; s++) {
    if (profile[s][0] === 0 && profile[s + 1][0] === 0) continue;
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const a = s * sides + i;
      const b = s * sides + j;
      const c = (s + 1) * sides + j;
      const d = (s + 1) * sides + i;
      /* a -> d is +y, d -> c is tangential: y cross tangent points outward */
      faces.push([a, d, c, b]);
    }
  }
  if (caps) {
    const n = profile.length;
    if (profile[0][0] > 0) faces.push(Array.from({ length: sides }, (_, i) => sides - 1 - i));
    if (profile[n - 1][0] > 0) faces.push(Array.from({ length: sides }, (_, i) => (n - 1) * sides + i));
  }
  return { verts, faces, tone };
}

function cyl(r: number, h: number, sides: number, tone: number, caps = true): Solid {
  return lathe([[r, -h / 2], [r, h / 2]], sides, tone, caps);
}

/** Flat ring in the XZ plane at y = 0, facing +y. The rim of a pipe. */
function annulus(rOut: number, rIn: number, sides: number, tone: number): Solid {
  const verts: V3[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * TAU;
    verts.push([Math.cos(a) * rOut, 0, Math.sin(a) * rOut]);
  }
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * TAU;
    verts.push([Math.cos(a) * rIn, 0, Math.sin(a) * rIn]);
  }
  const faces: number[][] = [];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    faces.push([i, sides + i, sides + j, j]);
  }
  return { verts, faces, tone };
}

/* --- transforms. All return new solids; none of this runs per frame. ------ */

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
function rotZ(s: Solid, a: number): Solid {
  const c = Math.cos(a);
  const n = Math.sin(a);
  return { ...s, verts: s.verts.map((v) => [v[0] * c - v[1] * n, v[0] * n + v[1] * c, v[2]] as V3) };
}
/** Reverses every winding. Used where a builder's default face points inward. */
function flip(s: Solid): Solid {
  return { ...s, faces: s.faces.map((f) => f.slice().reverse()) };
}

/* -------------------------------------------------------------------------- */
/* 2. the five specimens                                                       */
/*                                                                             */
/* Every object is built facing local +z, with its base near y = -0.60 so it    */
/* stands on its plinth, and its extents inside roughly +/-0.55 in x.           */
/* -------------------------------------------------------------------------- */

/** Snapchat lens: a phone, a face on the screen, and the lens ring around it. */
function buildLensPhone(): Solid[] {
  const out: Solid[] = [
    translate(box(0.64, 1.16, 0.11, 0.60), 0, 0.02, 0),
    translate(panel(0.53, 1.0, 0.88), 0, 0.04, 0.058)
  ];
  /* a head on the screen, which is what the lens was tracking */
  out.push(
    translate(
      lathe([[0, -0.19], [0.10, -0.14], [0.15, -0.04], [0.16, 0.05], [0.11, 0.14], [0, 0.19]], 8, 0.34),
      0, 0.14, 0.10
    )
  );
  /* the lens ring: twelve markers on a circle wider than the phone, so it
     reads as something thrown over the glass rather than printed on it */
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const k = i % 3 === 0 ? 0.15 : 0.10;
    /* dark, not bright. A near-white tick prints as bare paper and the ring
       disappears, which is the one thing this object cannot afford to lose. */
    out.push(
      translate(panel(k, k, 0.26), Math.cos(a) * 0.51, 0.12 + Math.sin(a) * 0.51, 0.20)
    );
  }
  /* the home key, so the slab reads as a phone rather than a card */
  out.push(translate(cyl(0.045, 0.02, 8, 0.42), 0, -0.49, 0.06));
  return out;
}

/** Dragon's Apprentice: a balloon tethered to the stack of coins it started as. */
function buildBalloonAndCoins(): Solid[] {
  const out: Solid[] = [];
  const coins = 5;
  for (let i = 0; i < coins; i++) {
    const y = -0.575 + i * 0.058;
    out.push(
      translate(
        rotY(cyl(0.30 - i * 0.008, 0.052, 10, 0.52 + i * 0.06), i * 0.31),
        Math.sin(i * 2.1) * 0.022,
        y,
        Math.cos(i * 1.7) * 0.022
      )
    );
  }
  /* the balloon: a teardrop of revolution, tied off at the bottom */
  out.push(
    translate(
      lathe(
        [[0, -0.20], [0.07, -0.15], [0.19, -0.05], [0.29, 0.09], [0.29, 0.26], [0.20, 0.40], [0, 0.48]],
        10,
        0.86
      ),
      0, 0.20, 0
    )
  );
  out.push(translate(cyl(0.035, 0.05, 6, 0.44), 0, -0.03, 0));
  /* the string, down to the top coin */
  out.push(translate(box(0.016, 0.24, 0.016, 0.36), 0, -0.18, 0));
  return out;
}

/** Public speaking: a lectern, a microphone, three people in the front row. */
function buildLectern(): Solid[] {
  const out: Solid[] = [
    translate(box(0.36, 0.84, 0.26, 0.74), 0, -0.16, -0.04),
    /* an inset on the front, so the column is a lectern and not a slab */
    translate(panel(0.22, 0.58, 0.95), 0, -0.15, 0.093),
    translate(box(0.48, 0.06, 0.26, 0.40), 0, -0.56, -0.04),
    translate(rotX(box(0.56, 0.055, 0.36, 0.70), -0.36), 0, 0.31, 0.0),
    translate(rotX(panel(0.42, 0.27, 0.98), -0.36), 0, 0.348, 0.058)
  ];
  /* the microphone, on a gooseneck off the left of the top */
  out.push(translate(rotZ(box(0.022, 0.30, 0.022, 0.40), -0.30), -0.15, 0.46, 0.06));
  out.push(
    translate(lathe([[0, -0.07], [0.05, -0.04], [0.055, 0.03], [0, 0.07]], 8, 0.90), -0.21, 0.62, 0.06)
  );
  /* the front row: an RAF officer, a police lieutenant, an advisor. Three. */
  const seats: Array<[number, number]> = [[-0.33, 0.40], [0.0, 0.47], [0.33, 0.40]];
  for (const [x, z] of seats) {
    out.push(translate(box(0.115, 0.17, 0.10, 0.50), x, -0.49, z));
    out.push(translate(cyl(0.048, 0.075, 8, 0.72), x, -0.36, z));
  }
  return out;
}

/**
 * hackSheffield: the repository, drawn as the tree it was judged on.
 *
 * Cards rather than dots. The prize was for structure, documentation and
 * developer experience, so the object has to read as a listing you could
 * navigate: a root, an indented level, and one folder opened one deeper.
 */
function buildRepoTree(): Solid[] {
  const out: Solid[] = [];
  const SPINE = -0.44;

  const spine = (x: number, y0: number, y1: number) =>
    out.push(translate(box(0.028, y1 - y0, 0.028, 0.30), x, (y0 + y1) / 2, 0));
  const elbow = (x0: number, x1: number, y: number) =>
    out.push(translate(box(x1 - x0, 0.026, 0.026, 0.30), (x0 + x1) / 2, y, 0));
  /** One entry: a dark tab against a pale card, the way a file row reads. */
  const card = (x0: number, w: number, y: number, tone: number) => {
    out.push(translate(box(w, 0.125, 0.06, tone), x0 + w / 2, y, 0));
    out.push(translate(box(0.055, 0.125, 0.075, 0.26), x0 + 0.028, y, 0.008));
  };

  card(SPINE - 0.02, 0.62, 0.50, 0.92);
  /* the rail runs to the foot, so the tree stands on its plinth */
  spine(SPINE, -0.56, 0.44);

  const rows: Array<[number, number]> = [[0.26, 0.86], [0.04, 0.78], [-0.18, 0.70]];
  for (const [y, tone] of rows) {
    elbow(SPINE, SPINE + 0.20, y);
    card(SPINE + 0.20, 0.60, y, tone);
  }

  /* one folder opened a level deeper: the point of the award was the layout */
  const IN = SPINE + 0.28;
  spine(IN, -0.40, -0.12);
  elbow(IN, IN + 0.18, -0.40);
  card(IN + 0.18, 0.48, -0.40, 0.94);

  return out;
}

/** Engineering You're Hired: a length of pipe with one of the swarm on it. */
function buildPipeCrawler(): Solid[] {
  const L = 1.18;
  const rOut = 0.32;
  const rIn = 0.25;
  const out: Solid[] = [];

  /* the pipe lies along X, so a Y-lathe rotated a quarter turn about Z */
  out.push(rotZ(cyl(rOut, L, 10, 0.66, false), Math.PI / 2));
  /* the bore, wound inward so it reads as the dark inside */
  out.push(flip(rotZ(cyl(rIn, L + 0.004, 10, 0.16, false), Math.PI / 2)));
  out.push(translate(rotZ(annulus(rOut, rIn, 10, 0.86), -Math.PI / 2), L / 2, 0, 0));
  out.push(translate(flip(rotZ(annulus(rOut, rIn, 10, 0.86), -Math.PI / 2)), -L / 2, 0, 0));

  /* the crawler, walking the top of the pipe */
  const crawler: Solid[] = [
    box(0.20, 0.085, 0.15, 0.94),
    translate(lathe([[0.05, 0], [0.045, 0.03], [0, 0.055]], 8, 0.98), 0.04, 0.04, 0)
  ];
  for (const sx of [-0.07, 0.07]) {
    for (const sz of [-0.085, 0.085]) {
      crawler.push(translate(rotZ(box(0.016, 0.11, 0.016, 0.30), sx > 0 ? 0.6 : -0.6), sx * 1.5, -0.06, sz));
    }
  }
  for (const s of crawler) out.push(translate(s, 0.10, rOut + 0.055, 0));

  /* a second unit, smaller, further down the run: it is a swarm, not a robot */
  const small: Solid[] = [
    box(0.13, 0.06, 0.10, 0.88),
    translate(box(0.012, 0.075, 0.012, 0.30), -0.05, -0.05, 0.05),
    translate(box(0.012, 0.075, 0.012, 0.30), 0.05, -0.05, -0.05)
  ];
  for (const s of small) out.push(translate(rotY(s, 0.5), -0.34, rOut + 0.04, 0.12));

  /* the whole run is turned off-axis so it is never a flat side elevation */
  return out.map((s) => translate(rotY(s, 0.38), 0, -0.24, 0));
}

/* -------------------------------------------------------------------------- */
/* 3. the case: five specimens on a turning shelf                              */
/* -------------------------------------------------------------------------- */

/**
 * The specimens sit on an ellipse, not a circle: wide in x, shallow in z.
 *
 * A circular carousel projects to a composition very nearly as tall as it is
 * wide, and this plate is a wide, shallow band of paper. On a circle the fit
 * ends up height-bound and half the plate is bare. Flattening the ring in z
 * spreads the four unselected objects along the width where the room actually
 * is, and costs nothing: the depth ordering, the perspective and the turn all
 * work exactly the same on an ellipse.
 */
const RING_X = 2.12;
/**
 * How wide the ellipse gets on a narrow plate. A phone-width plate is nearly
 * square, so the wide ring becomes width-bound and wastes most of the height.
 * Pulling the ring back toward a circle squares the composition up to match.
 */
const RING_X_NARROW = 1.34;
const RING_Z = 1.02;
/** Toward the camera when selected. +z is toward the viewer throughout. */
const FORWARD = 0.52;
const SEL_SCALE = 1.24;
/* well under the selection: four objects the same size as the front one is
   five things competing, not a case with something chosen out of it. */
const REST_SCALE = 0.72;

const PLINTH_TOP = -0.615;
const SHELF_Y = -0.755;

function plinth(): Solid[] {
  return [translate(cyl(0.36, 0.10, 10, 0.74), 0, PLINTH_TOP - 0.05, 0)];
}

/** An ellipse in the XZ plane at height y, stroked rather than filled. */
function ringLine(rx: number, rz: number, sides: number, y: number, tone: number): Solid {
  const verts: V3[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * TAU;
    verts.push([Math.cos(a) * rx, y, Math.sin(a) * rz]);
  }
  return { verts, faces: [Array.from({ length: sides }, (_, i) => i)], tone, wire: true };
}

/**
 * The shelf, drawn rather than modelled. A filled slab this wide is a grey mass
 * that costs more ink than the five objects standing on it, and the objects are
 * the whole point. Three strokes read as the drawing of a shelf and leave the
 * paper to the work.
 *
 * It does not rotate. The turn is carried by the objects travelling along the
 * arc and squaring up as they arrive, which is the part worth watching.
 */
function buildShelf(): Solid[] {
  const y = SHELF_Y;
  return [
    ringLine(RING_X + 0.52, RING_Z + 0.42, 32, y, 0.80),
    ringLine(RING_X + 0.52, RING_Z + 0.42, 32, y - 0.10, 0.86)
  ];
}

interface Specimen {
  test: RegExp;
  /** Named in the citation, because a procedural object needs a caption. */
  label: string;
  build: () => Solid[];
}

const SPECIMENS: Specimen[] = [
  { test: /snapchat|lens/i, label: 'A phone, a face, and the lens ring around it.', build: buildLensPhone },
  { test: /dragon/i, label: 'A balloon, tethered to the stack of coins it started as.', build: buildBalloonAndCoins },
  { test: /speaking/i, label: 'A lectern, a microphone, three people in the front row.', build: buildLectern },
  { test: /hacksheffield|hack/i, label: 'A repository, drawn as the tree it was judged on.', build: buildRepoTree },
  { test: /engineering|hired|swarm/i, label: 'A length of pipe, with two of the swarm walking it.', build: buildPipeCrawler }
];

function specimenFor(title: string): Specimen {
  for (const s of SPECIMENS) if (s.test.test(title)) return s;
  return SPECIMENS[0];
}

/* -------------------------------------------------------------------------- */
/* 4. flattening                                                               */
/*                                                                             */
/* The frame loop must not allocate, so every solid is unrolled once into flat  */
/* typed arrays. Faces become a start/length pair into one index array.         */
/* -------------------------------------------------------------------------- */

/** 0..N-1 are the awards; the last object is the shelf. */
interface Geometry {
  nVerts: number;
  nFaces: number;
  nObjects: number;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  vObj: Uint8Array;
  fStart: Int32Array;
  fLen: Int32Array;
  fIdx: Int32Array;
  fTone: Float32Array;
  fWire: Uint8Array;
  fObj: Uint8Array;
  /** Per-object vertex and face counts, quoted in the citation. */
  stats: Array<{ verts: number; faces: number }>;
}

function flatten(objects: Solid[][]): Geometry {
  let nv = 0;
  let nf = 0;
  let ni = 0;
  for (const solids of objects) {
    for (const s of solids) {
      nv += s.verts.length;
      nf += s.faces.length;
      for (const f of s.faces) ni += f.length;
    }
  }

  const g: Geometry = {
    nVerts: nv,
    nFaces: nf,
    nObjects: objects.length,
    vx: new Float32Array(nv),
    vy: new Float32Array(nv),
    vz: new Float32Array(nv),
    vObj: new Uint8Array(nv),
    fStart: new Int32Array(nf),
    fLen: new Int32Array(nf),
    fIdx: new Int32Array(ni),
    fTone: new Float32Array(nf),
    fWire: new Uint8Array(nf),
    fObj: new Uint8Array(nf),
    stats: []
  };

  let vAt = 0;
  let fAt = 0;
  let iAt = 0;
  objects.forEach((solids, o) => {
    let ov = 0;
    let of_ = 0;
    for (const s of solids) {
      const base = vAt;
      for (const v of s.verts) {
        g.vx[vAt] = v[0];
        g.vy[vAt] = v[1];
        g.vz[vAt] = v[2];
        g.vObj[vAt] = o;
        vAt++;
        ov++;
      }
      for (const f of s.faces) {
        g.fStart[fAt] = iAt;
        g.fLen[fAt] = f.length;
        g.fTone[fAt] = s.tone;
        g.fWire[fAt] = s.wire ? 1 : 0;
        g.fObj[fAt] = o;
        for (const idx of f) g.fIdx[iAt++] = base + idx;
        fAt++;
        of_++;
      }
    }
    g.stats.push({ verts: ov, faces: of_ });
  });

  return g;
}

/* -------------------------------------------------------------------------- */
/* 5. data                                                                     */
/* -------------------------------------------------------------------------- */

interface Award {
  title: string;
  place: string;
  date: string;
  description: string;
  badges?: string[];
}

const AWARDS: Award[] = context.awards;

/* Built once, at module load. Pure arithmetic, a fraction of a millisecond,
   and it is the same on the server as in the browser. */
const GEOMETRY: Geometry = flatten([
  ...AWARDS.map((a) => [...specimenFor(a.title).build(), ...plinth()]),
  buildShelf()
]);

const SHELF_OBJ = AWARDS.length;
const TOTAL_VERTS = GEOMETRY.nVerts;
const TOTAL_FACES = GEOMETRY.nFaces;

/* -------------------------------------------------------------------------- */
/* 6. the renderer                                                             */
/* -------------------------------------------------------------------------- */

/* Sparse to dense. Index 0 is bare paper. The same ten steps HighlightReel
   uses, so the page's two rasterised plates read as one instrument rather
   than two. Letters in the ramp look like text at this size; symbols do not. */
const RAMP = ' .:-=+*#%@';
/* Same cell as HighlightReel. Two rasterised plates on one page should be
   drawn at the same grain, and the blit is the frame's whole cost: one
   drawImage per covered cell, a few thousand of them, so cell area is the
   single biggest lever there is. */
const CELL_W = 7;
const CELL_H = 13;
/** Frames per second for the plate. See the gate in `loop`. */
const FPS = 30;

const CAM_D = 5.7;
const FOCAL = 4.7;
const TILT = 0.235;
/** How far distance fades toward the paper, and how pale an unselected object sits. */
const FOG = 0.30;
const REST_FADE = 0.48;

/**
 * Fixed light, upper left, well in front of the subject. It has to sit close
 * to the camera axis: a raking light means no face ever gets a lambert term
 * near 1, the tonal range collapses into the middle of the ramp, and the whole
 * plate prints as one grey mass.
 */
const LIGHT: V3 = (() => {
  const l: V3 = [-0.40, 0.46, 0.82];
  const n = Math.hypot(l[0], l[1], l[2]);
  return [l[0] / n, l[1] / n, l[2] / n];
})();

/** Reads a design token off the live element, so the ink stays in the system. */
function token(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

export interface AwardsCaseProps {
  className?: string;
}

export default function AwardsCase({ className }: AwardsCaseProps) {
  const [index, setIndex] = useState(0);
  const count = AWARDS.length;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /* What the frame loop reads. `select` writes it too, so it is never stale. */
  const indexRef = useRef(0);
  indexRef.current = index;
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  /** Set by the effect. Draws a single frame; the only way in under reduced motion. */
  const drawOnceRef = useRef<(() => void) | null>(null);

  const award = AWARDS[index];
  const spec = useMemo(() => specimenFor(award.title), [award.title]);
  const stat = GEOMETRY.stats[index];

  /**
   * The ref is written here rather than only during render. Two key events can
   * land inside one commit, and until React re-renders `indexRef` would still
   * hold the old value, so the second press would travel from the same place as
   * the first. Holding an arrow key down is exactly that case.
   */
  const select = useCallback(
    (next: number, focus: boolean) => {
      const i = next < 0 ? count - 1 : next >= count ? 0 : next;
      indexRef.current = i;
      setIndex(i);
      if (focus) btnRefs.current[i]?.focus();
    },
    [count]
  );

  /* Reads from the ref, not the render closure: two key events can land inside
     one commit and a stale index would swallow the second. */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLOListElement>) => {
      const at = indexRef.current;
      let next = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = at + 1;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = at - 1;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = count - 1;
      else return;
      e.preventDefault();
      select(next, true);
    },
    [count, select]
  );

  /* Under reduced motion nothing is scheduled, so a selection has to ask for
     its own frame. Harmless in the animated case: the loop redraws anyway. */
  useEffect(() => {
    drawOnceRef.current?.();
  }, [index]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- scratch. Allocated here, written every frame, never grown. ------- */
    const g = GEOMETRY;
    const sx = new Float32Array(g.nVerts); // view space
    const sy = new Float32Array(g.nVerts);
    const sz = new Float32Array(g.nVerts);
    const px = new Float32Array(g.nVerts); // cell space
    const py = new Float32Array(g.nVerts);
    const fDepth = new Float32Array(g.nFaces);
    const fShade = new Float32Array(g.nFaces);
    const fSel = new Uint8Array(g.nFaces);
    const order = new Int32Array(g.nFaces);
    for (let i = 0; i < g.nFaces; i++) order[i] = i;

    const nObj = g.nObjects;
    const oCos = new Float32Array(nObj);
    const oSin = new Float32Array(nObj);
    const oScale = new Float32Array(nObj);
    const oTx = new Float32Array(nObj);
    const oTy = new Float32Array(nObj);
    const oTz = new Float32Array(nObj);
    const oFade = new Float32Array(nObj);
    const oSelFlag = new Uint8Array(nObj);
    /* Extra x-only scale. Only the shelf uses it, to follow the ring when the
       ellipse narrows for a small plate. Safe because the shelf never yaws, so
       there is no shear to worry about. */
    const oKx = new Float32Array(nObj).fill(1);

    /* eased state, carried between frames */
    const scaleNow = new Float32Array(nObj).fill(REST_SCALE);
    const liftNow = new Float32Array(nObj);
    const spinNow = new Float32Array(nObj);
    for (let o = 0; o < nObj; o++) spinNow[o] = o * 1.27;
    scaleNow[SHELF_OBJ] = 1;
    const STEP = TAU / count;
    let ring = -indexRef.current * STEP;
    scaleNow[indexRef.current] = SEL_SCALE;
    liftNow[indexRef.current] = 1;
    spinNow[indexRef.current] = 0;

    /* ---- glyph atlases --------------------------------------------------- */
    const inkAtlas = document.createElement('canvas');
    const vermAtlas = document.createElement('canvas');
    let cellW = CELL_W;
    let cellH = CELL_H;
    /* A fresh canvas element is 300x150, so its width can never stand in for
       "not painted yet". At dpr 1 the cell size matches the initial values and
       the atlas would have stayed blank. */
    let atlasCell = -1;

    function paintAtlas(target: HTMLCanvasElement, colour: string) {
      target.width = cellW * RAMP.length;
      target.height = cellH;
      const a = target.getContext('2d');
      if (!a) return;
      a.clearRect(0, 0, target.width, target.height);
      a.fillStyle = '#fff';
      a.textAlign = 'center';
      a.textBaseline = 'middle';
      a.font = `600 ${Math.max(7, Math.round(cellH * 0.96))}px "JetBrains Mono", ui-monospace, monospace`;
      for (let i = 1; i < RAMP.length; i++) {
        a.fillText(RAMP[i], i * cellW + cellW / 2, cellH * 0.53);
      }
      /* tint in one pass, so the glyphs carry a real pigment token */
      a.globalCompositeOperation = 'source-in';
      a.fillStyle = colour;
      a.fillRect(0, 0, target.width, target.height);
      a.globalCompositeOperation = 'source-over';
    }

    /* ---- the shade buffer: one cell per character ------------------------
       Plain arrays, not a canvas. The target is roughly 190 x 50, and putting
       ~560 polygons through the 2D context to reach it meant 560 state changes
       and 560 freshly built `rgb(...)` strings every frame, then a readback.
       The scanline filler below does the same work in a fraction of the time
       and allocates nothing, which is the whole point of doing it by hand. */
    let lumBuf = new Float32Array(0); // -1 is bare paper
    let selBuf = new Uint8Array(0);
    /** Edge crossings for one scanline. Nothing here has 32 sides. */
    const xs = new Float32Array(32);

    let cols = 0;
    let rows = 0;
    let dpr = 1;
    let devW = 0;
    let devH = 0;
    let S = 1; // unit scale, in device pixels
    /* Projected centre of the composition. The case is not symmetric about the
       origin: the shelf hangs below and the front object magnifies, so a
       naive centre leaves a band of dead paper across the top. */
    let midX = 0;
    let midY = 0;

    /** How wide the ellipse currently is. Set by `layout` from the plate. */
    let ringX = RING_X;
    let SPAN_X = 1;
    let SPAN_Y = 1;
    let MID_X = 0;
    let MID_Y = 0;

    /**
     * Projected bounds of every configuration the case can actually reach:
     * each of the five selections, at each end of the idle sway. Cheap enough
     * to redo whenever the ring width changes, and it means the plate always
     * frames the work at any breakpoint, with no magic number to go stale when
     * a specimen changes.
     */
    function measureBounds(): [number, number, number, number] {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let sel = 0; sel < count; sel++) {
        for (let w = -1; w <= 1; w++) {
          const shown = -sel * STEP + w * 0.085;
          const tilt = TILT + w * 0.028;
          const ct = Math.cos(tilt);
          const st = Math.sin(tilt);
          for (let o = 0; o < nObj; o++) {
            if (o === SHELF_OBJ) {
              oCos[o] = 1;
              oSin[o] = 0;
              oScale[o] = 1;
              oKx[o] = ringX / RING_X;
              oTx[o] = 0;
              oTy[o] = 0;
              oTz[o] = 0;
              continue;
            }
            const isSel = o === sel;
            const th = shown + o * STEP;
            oCos[o] = Math.cos(th);
            oSin[o] = Math.sin(th);
            oScale[o] = isSel ? SEL_SCALE : REST_SCALE;
            oTx[o] = Math.sin(th) * ringX;
            oTy[o] = isSel ? 0.07 : 0;
            oTz[o] = Math.cos(th) * RING_Z + (isSel ? FORWARD : 0);
          }
          for (let i = 0; i < g.nVerts; i++) {
            const o = g.vObj[i];
            const k0 = oScale[o];
            const ax0 = g.vx[i] * k0 * oKx[o];
            const ay0 = g.vy[i] * k0;
            const az0 = g.vz[i] * k0;
            const wx = ax0 * oCos[o] + az0 * oSin[o] + oTx[o];
            const wz = -ax0 * oSin[o] + az0 * oCos[o] + oTz[o];
            const wy = ay0 + oTy[o];
            const yv = wy * ct - wz * st;
            const zv = wy * st + wz * ct;
            const d = CAM_D - zv;
            const k = FOCAL / (d < 0.5 ? 0.5 : d);
            const sxp = wx * k;
            const syp = yv * k;
            if (sxp < x0) x0 = sxp;
            if (sxp > x1) x1 = sxp;
            if (syp < y0) y0 = syp;
            if (syp > y1) y1 = syp;
          }
        }
      }
      return [x0, x1, y0, y1];
    }
    function refit() {
      const [x0, x1, y0, y1] = measureBounds();
      SPAN_X = Math.max(0.001, x1 - x0);
      SPAN_Y = Math.max(0.001, y1 - y0);
      MID_X = (x0 + x1) / 2;
      MID_Y = (y0 + y1) / 2;
    }
    refit();

    function layout() {
      const r = canvas!.getBoundingClientRect();
      if (!r.width || !r.height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      devW = Math.max(1, Math.round(r.width * dpr));
      devH = Math.max(1, Math.round(r.height * dpr));
      canvas!.width = devW;
      canvas!.height = devH;
      ctx!.setTransform(1, 0, 0, 1, 0, 0);

      /* Finer grain on a narrow plate. The case has a fixed amount of shape to
         say, and at a phone width the desktop cell leaves it about 48 columns
         by 20 rows, which is not enough resolution for a phone to be a phone.
         The blit is cheap at that size anyway, so spend it on legibility. */
      const fine = r.width < 560;
      const nw = Math.max(4, Math.round((fine ? 5 : CELL_W) * dpr));
      const nh = Math.max(6, Math.round((fine ? 9 : CELL_H) * dpr));

      const wantRing = fine ? RING_X_NARROW : RING_X;
      if (wantRing !== ringX) {
        ringX = wantRing;
        refit();
      }
      if (nw !== cellW || nh !== cellH || atlasCell < 0) {
        cellW = nw;
        cellH = nh;
        atlasCell = nw * 1000 + nh;
        paintAtlas(inkAtlas, token(canvas!, '--ink', '#17140F'));
        paintAtlas(vermAtlas, token(canvas!, '--verm-text', '#9E3524'));
      }

      cols = Math.max(12, Math.ceil(devW / cellW));
      rows = Math.max(8, Math.ceil(devH / cellH));
      const cells = cols * rows;
      /* grown here, never in the frame loop */
      if (lumBuf.length < cells) {
        lumBuf = new Float32Array(cells);
        selBuf = new Uint8Array(cells);
      }
      S = Math.min(devW / SPAN_X, devH / SPAN_Y) * 0.94;
      midX = (MID_X * S) / cellW;
      midY = (MID_Y * S) / cellH;
    }
    layout();

    let last = 0;
    let t = 0;
    let raf = 0;
    let running = true;
    let onScreen = true; // optimistic: never wait on IO for a first paint

    function frameParams(dt: number) {
      const sel = indexRef.current;

      /* the ring eases to put the selection at the front, by the short way */
      const target = -sel * STEP;
      if (reduce) {
        ring = target;
      } else {
        let d = target - ring;
        d = ((((d + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
        ring += d * (1 - Math.exp(-dt * 4.2));
      }
      /* idle: the case never quite settles, it sways */
      const shown = reduce ? ring : ring + Math.sin(t * 0.23) * 0.075;
      const tilt = reduce ? TILT : TILT + Math.sin(t * 0.34) * 0.028;

      for (let o = 0; o < nObj; o++) {
        if (o === SHELF_OBJ) {
          oCos[o] = 1;
          oSin[o] = 0;
          oScale[o] = 1;
          oKx[o] = ringX / RING_X;
          oTx[o] = 0;
          oTy[o] = 0;
          oTz[o] = 0;
          oFade[o] = 0.34;
          oSelFlag[o] = 0;
          continue;
        }
        const isSel = o === sel;
        const kS = reduce ? 1 : 1 - Math.exp(-dt * 5.0);
        scaleNow[o] += ((isSel ? SEL_SCALE : REST_SCALE) - scaleNow[o]) * kS;
        liftNow[o] += ((isSel ? 1 : 0) - liftNow[o]) * kS;

        if (reduce) {
          /* one still frame, so every object simply faces out from the ring */
          spinNow[o] = 0;
        } else if (isSel) {
          /* squares up to the viewer as it comes forward, by the short way */
          const s = ((spinNow[o] + Math.PI) % TAU + TAU) % TAU - Math.PI;
          spinNow[o] = s * Math.exp(-dt * 3.4);
        } else {
          spinNow[o] += dt * 0.26;
        }

        const th = shown + o * STEP;
        const yaw = th + spinNow[o];
        oCos[o] = Math.cos(yaw);
        oSin[o] = Math.sin(yaw);
        oScale[o] = scaleNow[o];
        oTx[o] = Math.sin(th) * ringX;
        oTy[o] = liftNow[o] * 0.07;
        oTz[o] = Math.cos(th) * RING_Z + liftNow[o] * FORWARD;
        /* everything that is not the selection prints pale */
        oFade[o] = REST_FADE * (1 - liftNow[o]);
        oSelFlag[o] = liftNow[o] > 0.55 ? 1 : 0;
      }
      return tilt;
    }

    function render() {
      if (!cols || !rows) return;
      const now = performance.now();
      let dt = last ? (now - last) / 1000 : 0.016;
      last = now;
      if (dt > 0.05) dt = 0.05;
      t = now / 1000;

      const tilt = frameParams(dt);
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);
      const cx = cols / 2 - midX;
      const cy = rows / 2 + midY;
      const kx = S / cellW;
      const ky = S / cellH;

      /* ---- transform and project ---------------------------------------- */
      for (let i = 0; i < g.nVerts; i++) {
        const o = g.vObj[i];
        const k0 = oScale[o];
        const x0 = g.vx[i] * k0 * oKx[o];
        const y0 = g.vy[i] * k0;
        const z0 = g.vz[i] * k0;
        const x1 = x0 * oCos[o] + z0 * oSin[o] + oTx[o];
        const z1 = -x0 * oSin[o] + z0 * oCos[o] + oTz[o];
        const y1 = y0 + oTy[o];
        const yv = y1 * ct - z1 * st;
        const zv = y1 * st + z1 * ct;
        sx[i] = x1;
        sy[i] = yv;
        sz[i] = zv;
        const d = CAM_D - zv;
        const k = FOCAL / (d < 0.5 ? 0.5 : d);
        px[i] = cx + x1 * k * kx;
        py[i] = cy - yv * k * ky;
      }

      /* ---- shade ---------------------------------------------------------- */
      const ZBACK = -RING_Z * SEL_SCALE - 1.0;
      const ZSPAN = (RING_Z + FORWARD) * SEL_SCALE + 1.6 - ZBACK;
      for (let f = 0; f < g.nFaces; f++) {
        const s0 = g.fStart[f];
        const n = g.fLen[f];
        /* Newell: robust where a lathe ring has collapsed to the axis */
        let nx = 0;
        let ny = 0;
        let nz = 0;
        let dep = 0;
        for (let e = 0; e < n; e++) {
          const a = g.fIdx[s0 + e];
          const b = g.fIdx[s0 + ((e + 1) % n)];
          nx += (sy[a] - sy[b]) * (sz[a] + sz[b]);
          ny += (sz[a] - sz[b]) * (sx[a] + sx[b]);
          nz += (sx[a] - sx[b]) * (sy[a] + sy[b]);
          dep += sz[a];
        }
        dep /= n;
        fDepth[f] = dep;

        const len = Math.hypot(nx, ny, nz);
        let lit: number;
        if (len < 1e-9) {
          lit = 0.5;
        } else {
          let ux = nx / len;
          let uy = ny / len;
          let uz = nz / len;
          /* +z is toward the camera. Open forms are drawn from behind too, so
             a back face is flipped and dimmed rather than culled. */
          let back = false;
          if (uz < 0) {
            ux = -ux;
            uy = -uy;
            uz = -uz;
            back = true;
          }
          const lam = ux * LIGHT[0] + uy * LIGHT[1] + uz * LIGHT[2];
          /* little ambient on purpose: a narrow tonal range turns the whole
             plate to mush, and the ramp only has ten steps to spend. */
          lit = 0.10 + 0.90 * (lam > 0 ? lam : 0);
          if (back) lit *= 0.52;
        }

        const o = g.fObj[f];
        let v = g.fTone[f] * lit;
        /* aerial perspective, toward the paper rather than toward black */
        let dn = (dep - ZBACK) / ZSPAN;
        dn = dn < 0 ? 0 : dn > 1 ? 1 : dn;
        const fog = (1 - dn) * FOG;
        v = v + (1 - v) * fog;
        v = v + (1 - v) * oFade[o];
        fShade[f] = v > 1 ? 1 : v < 0 ? 0 : v;
        fSel[f] = oSelFlag[o];
      }

      /* ---- painter's sort, back to front ---------------------------------- */
      /* Insertion sort: the order barely changes frame to frame, so this runs
         close to linear and, unlike sort(), allocates nothing. */
      for (let i = 1; i < g.nFaces; i++) {
        const v = order[i];
        const d = fDepth[v];
        let j = i - 1;
        while (j >= 0 && fDepth[order[j]] > d) {
          order[j + 1] = order[j];
          j--;
        }
        order[j + 1] = v;
      }

      /* ---- rasterise, back to front, into the cell buffers ----------------- */
      lumBuf.fill(-1, 0, cols * rows);
      for (let i = 0; i < g.nFaces; i++) {
        const f = order[i];
        if (g.fWire[f]) strokeFace(f, fShade[f], fSel[f]);
        else fillFace(f, fShade[f], fSel[f]);
      }

      /* ---- quantise to characters ------------------------------------------
         Ink on paper, so the ramp is inverted: a lit face prints faint and a
         face in shadow prints dense. The brightest face still prints, at the
         bottom of the ramp, or a highlight would punch a hole in the object. */
      ctx!.clearRect(0, 0, devW, devH);
      const top = RAMP.length - 1;
      for (let r = 0; r < rows; r++) {
        const row = r * cols;
        for (let c = 0; c < cols; c++) {
          const v = lumBuf[row + c];
          if (v < 0) continue; // bare paper
          const ink = 0.10 + (1 - v) * 0.90;
          let gi = Math.round(ink * top);
          if (gi < 1) gi = 1;
          else if (gi > top) gi = top;
          const atlas = selBuf[row + c] ? vermAtlas : inkAtlas;
          ctx!.drawImage(atlas, gi * cellW, 0, cellW, cellH, c * cellW, r * cellH, cellW, cellH);
        }
      }
    }

    /* ------------------------------------------------------------------------
       The filler. Even-odd scanline over cell centres, painter's order, no
       antialiasing: a cell is in or it is out, which is what quantising to
       characters wants anyway.

       The sliver rule matters more than it looks. A tree spine, the string on
       the balloon and the legs on the crawler are all well under one cell wide,
       and a strict centre test drops them entirely. Where a span or a face
       falls between two centres, the nearest single cell is painted instead, so
       hairline geometry survives at the cost of being exactly one cell thick.
       ---------------------------------------------------------------------- */

    function fillFace(f: number, v: number, sel: number) {
      const s0 = g.fStart[f];
      const n = g.fLen[f];
      let minY = Infinity;
      let maxY = -Infinity;
      for (let e = 0; e < n; e++) {
        const y = py[g.fIdx[s0 + e]];
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (maxY < -0.5 || minY > rows + 0.5) return;

      let y0 = Math.ceil(minY - 0.5);
      let y1 = Math.floor(maxY - 0.5);
      if (y1 < y0) {
        /* thinner than one row: take the row nearest the middle of it */
        y0 = Math.round((minY + maxY) * 0.5 - 0.5);
        y1 = y0;
      }
      if (y0 < 0) y0 = 0;
      if (y1 > rows - 1) y1 = rows - 1;

      for (let y = y0; y <= y1; y++) {
        const yc = y + 0.5;
        let m = 0;
        for (let e = 0; e < n && m < 32; e++) {
          const a = g.fIdx[s0 + e];
          const b = g.fIdx[s0 + (e + 1 === n ? 0 : e + 1)];
          const ya = py[a];
          const yb = py[b];
          if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) {
            xs[m++] = px[a] + ((yc - ya) / (yb - ya)) * (px[b] - px[a]);
          }
        }
        if (m < 2) continue;
        for (let i = 1; i < m; i++) {
          const t = xs[i];
          let j = i - 1;
          while (j >= 0 && xs[j] > t) {
            xs[j + 1] = xs[j];
            j--;
          }
          xs[j + 1] = t;
        }
        const row = y * cols;
        for (let k = 0; k + 1 < m; k += 2) {
          let xa = Math.ceil(xs[k] - 0.5);
          let xb = Math.floor(xs[k + 1] - 0.5);
          if (xb < xa) {
            xa = Math.round((xs[k] + xs[k + 1]) * 0.5 - 0.5);
            xb = xa;
          }
          if (xa < 0) xa = 0;
          if (xb > cols - 1) xb = cols - 1;
          for (let x = xa; x <= xb; x++) {
            lumBuf[row + x] = v;
            selBuf[row + x] = sel;
          }
        }
      }
    }

    function plot(x: number, y: number, v: number, sel: number) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      const i = y * cols + x;
      lumBuf[i] = v;
      selBuf[i] = sel;
    }

    /** DDA along each edge. A two-vertex face is a single segment, not a loop. */
    function strokeFace(f: number, v: number, sel: number) {
      const s0 = g.fStart[f];
      const n = g.fLen[f];
      const edges = n === 2 ? 1 : n;
      for (let e = 0; e < edges; e++) {
        const a = g.fIdx[s0 + e];
        const b = g.fIdx[s0 + (e + 1 === n ? 0 : e + 1)];
        const xa = px[a];
        const ya = py[a];
        const dx = px[b] - xa;
        const dy = py[b] - ya;
        const adx = dx < 0 ? -dx : dx;
        const ady = dy < 0 ? -dy : dy;
        const steps = Math.ceil(adx > ady ? adx : ady);
        if (steps <= 0) {
          plot(Math.round(xa - 0.5), Math.round(ya - 0.5), v, sel);
          continue;
        }
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          plot(Math.round(xa + dx * t - 0.5), Math.round(ya + dy * t - 0.5), v, sel);
        }
      }
    }

    /**
     * Gated to FPS rather than free-running. Nothing here moves fast: a slow
     * sway and a half-second ease. The page already has other canvases, and a
     * few thousand glyph blits is not a bill worth paying sixty times a second
     * for motion no one can see the difference in.
     */
    let nextDue = 0;
    function loop(now: number) {
      if (!running || !onScreen) {
        raf = 0;
        return;
      }
      if (now >= nextDue) {
        nextDue = now + 1000 / FPS;
        render();
      }
      raf = requestAnimationFrame(loop);
    }

    function kick() {
      if (reduce || raf || !running || !onScreen) return;
      last = 0;
      nextDue = 0;
      raf = requestAnimationFrame(loop);
    }

    drawOnceRef.current = () => {
      last = 0;
      render();
    };

    if (reduce) render();
    else kick();

    const io = new IntersectionObserver(
      (entries) => {
        onScreen = entries[0].isIntersecting;
        if (onScreen) kick();
        else if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { threshold: 0.01 }
    );
    io.observe(canvas);

    function onVis() {
      running = !document.hidden;
      if (running) kick();
      else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }
    document.addEventListener('visibilitychange', onVis);

    function relayout() {
      layout();
      if (reduce) render();
      else kick();
    }

    let rr = 0;
    /** Debounced, for the fallback path only. See below. */
    function onResize() {
      cancelAnimationFrame(rr);
      rr = requestAnimationFrame(relayout);
    }

    /* A ResizeObserver fires once on observe, which is the guarantee that the
       plate still gets a correct first layout if it happened to be unsized when
       the effect ran. Its callback lays out synchronously rather than hopping
       through rAF: the observer already coalesces to one call per frame, and
       deferring meant a plate that came up unsized stayed blank for as long as
       animation frames were not being served. The window-event fallback still
       debounces, because that event does not coalesce itself. */
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(relayout);
      ro.observe(canvas);
    } else {
      window.addEventListener('resize', onResize);
    }

    /* The atlas is measured in JetBrains Mono. If the face lands late, the
       glyphs were drawn in the fallback and every cell is subtly wrong. */
    let fontsAlive = true;
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready
        .then(() => {
          if (!fontsAlive) return;
          paintAtlas(inkAtlas, token(canvas, '--ink', '#17140F'));
          paintAtlas(vermAtlas, token(canvas, '--verm-text', '#9E3524'));
          if (reduce) render();
        })
        .catch(() => {
          /* a font that never resolves is not a reason to lose the drawing */
        });
    }

    /* Dev-only handle. Headless panes never fire rAF and report the canvas as
       non-intersecting, so there is otherwise no way to drive one frame and
       check what the pipeline actually put on the plate. Matches HighlightReel. */
    if (process.env.NODE_ENV !== 'production') {
      (canvas as unknown as { __case?: unknown }).__case = {
        renderOnce: () => {
          last = 0;
          render();
        },
        info: () => ({
          cols,
          rows,
          S,
          span: [SPAN_X, SPAN_Y],
          mid: [MID_X, MID_Y],
          verts: g.nVerts,
          faces: g.nFaces,
          selected: indexRef.current,
          covered: (() => {
            let n = 0;
            for (let i = 0; i < cols * rows; i++) if (lumBuf[i] >= 0) n++;
            return n;
          })()
        })
      };
    }

    return () => {
      fontsAlive = false;
      running = false;
      drawOnceRef.current = null;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(rr);
      raf = 0;
      io.disconnect();
      if (ro) ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
    };
  }, [count]);

  /* ------------------------------------------------------------------------ */

  return (
    <section
      className={className ? `v2-case ${className}` : 'v2-case'}
      aria-labelledby="v2-case-title"
    >
      <header className="v2-case-head">
        <p className="v2-eyebrow" data-perch data-perch-text data-perch-inset="0.38em">
          Awards / <b>2022 to 2025</b>
        </p>
        <h2 className="v2-h2" id="v2-case-title" data-perch data-perch-text data-perch-inset="0.10em">
          Five wins, five objects.
        </h2>
        <p className="v2-case-note">
          Not five identical cups. A lens a million strangers used, a milkshake stand, a lectern, a
          repository, a swarm of robots in a pipe. Each object below is modelled from vertices and
          drawn by the same hand-rolled pipeline that draws the rest of this page, then quantised to
          a grid of characters. Choose one and it turns to face you.
        </p>
      </header>

      <div className="v2-case-stage" data-perch>
        <canvas ref={canvasRef} aria-hidden="true" />
        <p className="v2-case-mark">
          {TOTAL_VERTS} vertices / {TOTAL_FACES} faces / drawn here
        </p>
      </div>

      <div className="v2-case-body">
        <ol
          className="v2-case-list"
          onKeyDown={onKeyDown}
          aria-label="Awards. Use the arrow keys to turn the case."
        >
          {AWARDS.map((a, i) => (
            <li key={a.title}>
              <button
                type="button"
                ref={(el) => {
                  btnRefs.current[i] = el;
                }}
                className={`v2-case-plaque${i === index ? ' is-on' : ''}`}
                tabIndex={i === index ? 0 : -1}
                aria-pressed={i === index}
                aria-controls="v2-case-citation"
                onClick={() => select(i, false)}
                onFocus={() => select(i, false)}
              >
                <span className="v2-case-plaque-place">{a.place}</span>
                <span className="v2-case-plaque-title">{a.title}</span>
                <span className="v2-case-plaque-date">{a.date}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="v2-case-citation" id="v2-case-citation" aria-live="polite">
          <p className="v2-case-cite-meta">
            <b>{award.place}</b>
            <span aria-hidden="true"> / </span>
            {award.date}
          </p>
          <h3 className="v2-case-cite-title">{award.title}</h3>
          <p className="v2-case-cite-body">{award.description}</p>
          {award.badges && award.badges.length ? (
            <ul className="v2-case-badges">
              {award.badges.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
          <p className="v2-case-specimen">
            <span className="v2-case-specimen-key">On the shelf</span>
            {spec.label} {stat.verts} vertices, {stat.faces} faces.
          </p>
        </div>
      </div>
    </section>
  );
}
