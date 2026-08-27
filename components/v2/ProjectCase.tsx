'use client';

/* ============================================================================
   ProjectCase — fifteen projects, fifteen objects, on the same shelf.

   > "I love the trophy case, this is sort of the idea I had with my projects
   >  but we can think of something else for them."

   So the case is the PROJECTS treatment now. It sits at the head of the index
   at /v2/projects, which is the page whose whole job is to hold all of them at
   once; the highlight reel on the spine keeps its own job, which is the
   opposite one — a single project, large, with its neighbours blurred either
   side. Same pipeline, same grain, different question.

   Everything here is geometry. The renderer, the primitives, the plinth and
   the shelf all live in AwardsCase.tsx and are imported rather than copied;
   this file is only the fifteen objects and the list that names them.

   THREE RULES THE SPECIMENS FOLLOW

   1. AN OBJECT, NOT AN ICON. A logo says "web project". A monitor on a stand
      with a page on it says what was delivered. Where a project has a physical
      fact in it — a pipe, a phone, a wall calendar — that is the object.

   2. IT HAS TO READ AT 7x13 CELLS. Which means silhouette. A step in the
      outline is worth more than any amount of surface detail, and a face
      turned to a different angle is worth more than a darker tone, because the
      ramp is inverted for paper: a lit face leaves the page showing.

   3. NO OBJECT REPEATS UNLESS THE PROJECTS DO. Two web deliveries are two
      screens, and they are different screens: one is a monitor on a stand and
      one is a CRT, which is also true of when they were made. The swarm robots
      are the same object as the award, because they are the same work.

   Sizes are in the same model space the awards use: roughly one unit tall,
   standing on y = 0 so the plinth meets the foot.
   ========================================================================== */

import { useMemo } from 'react';
import Link from 'next/link';
import { projects as PROJECTS, type Project } from '@/lib/projects-data';
import { FEATURED_PROJECTS } from '@/lib/v2/content';
import {
  SpecimenCase,
  box,
  panel,
  lathe,
  cyl,
  annulus,
  translate,
  rotX,
  rotY,
  rotZ,
  type CaseEntry,
  type Solid
} from './AwardsCase';

const TAU = Math.PI * 2;

/* -------------------------------------------------------------------------- */
/* the specimens                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Recensorium: a sealed ballot box with a paper going into the slot.
 *
 * The argument of the platform is a list of things an agent cannot do — it
 * never picks what it reviews and never picks who reviews it — so the object
 * is a closed box you post into, not a pile of papers you choose from.
 */
function buildBallotBox(): Solid[] {
  return [
    translate(box(0.62, 0.52, 0.44, 0.62), 0, -0.24, 0),
    /* the lid overhangs by a wide margin: at this size the step it puts in the
       outline is the only part of a lid anyone can see */
    translate(box(0.78, 0.10, 0.56, 0.90), 0, 0.06, 0),
    /* the slot, standing proud, and wider than the sheet so the dark shows
       either side of it — that is the only thing saying the paper goes IN */
    translate(box(0.42, 0.035, 0.09, 0.10), 0, 0.13, 0),
    /* a foot, for the second step */
    translate(box(0.70, 0.07, 0.50, 0.44), 0, -0.53, 0),
    /* the sheet, tilted in plane as well as out of it, so it is the one
       diagonal in an otherwise orthogonal outline. Mid tone, not paper tone:
       the ramp is inverted and a lit face leaves the page showing. */
    translate(rotX(rotZ(panel(0.30, 0.26, 0.44), -0.30), -0.14), -0.02, 0.28, 0.02),
    /* the seal, over the join */
    translate(panel(0.09, 0.09, 0.20), 0.20, 0.06, 0.29)
  ];
}

/**
 * MotionGen: a figure caught mid-stride, over the keyframe strip it was
 * written into. The dissertation generates humanoid motion from text and
 * writes it back as AnimationClip assets, so the object is the pose AND the
 * timeline, because either alone is a different project.
 */
function buildFigureOnTimeline(): Solid[] {
  const out: Solid[] = [];
  const limb = (
    x: number,
    y: number,
    z: number,
    len: number,
    ang: number,
    tone: number
  ) => out.push(translate(rotZ(box(0.045, len, 0.045, tone), ang), x, y, z));

  /* torso and head */
  out.push(translate(box(0.13, 0.26, 0.10, 0.58), 0, 0.19, 0));
  out.push(
    translate(lathe([[0, -0.07], [0.06, -0.03], [0.065, 0.03], [0, 0.07]], 8, 0.36), 0, 0.40, 0)
  );
  /* mid-stride: one leg forward and one back, arms opposed */
  limb(-0.10, -0.02, 0, 0.30, 0.42, 0.5);
  limb(0.11, -0.04, 0, 0.30, -0.34, 0.66);
  limb(-0.12, 0.20, 0.05, 0.24, -0.62, 0.44);
  limb(0.12, 0.18, -0.05, 0.24, 0.52, 0.72);

  /* the timeline underneath: eight keys, three of them marked */
  for (let i = 0; i < 8; i++) {
    const x = -0.42 + i * 0.12;
    const key = i === 0 || i === 3 || i === 7;
    out.push(translate(box(0.055, key ? 0.11 : 0.055, 0.05, key ? 0.20 : 0.72), x, -0.34, 0.12));
  }
  out.push(translate(box(0.94, 0.022, 0.05, 0.34), 0, -0.40, 0.12));
  return out;
}

/**
 * HabitFlow: a wall calendar with a streak running down it. The whole point of
 * a habit tracker is the unbroken run, so the filled cells are a contiguous
 * diagonal and one is conspicuously missed.
 */
function buildHabitGrid(): Solid[] {
  const out: Solid[] = [translate(box(0.72, 0.86, 0.05, 0.94), 0, 0, -0.03)];
  /* the hanging bar */
  out.push(translate(cyl(0.018, 0.78, 8, 0.40, false), 0, 0.44, -0.03));
  const cols = 5;
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      /* a run of done days, then one missed, then the run resumes */
      const done = i < 17 && i !== 11;
      out.push(
        translate(
          box(0.095, 0.095, done ? 0.05 : 0.012, done ? 0.24 : 0.86),
          -0.26 + c * 0.13,
          0.31 - r * 0.13,
          0.01
        )
      );
    }
  }
  return out;
}

/**
 * Neighbourly: two houses either side of one shared path. A neighbourhood app
 * is not a building, it is the thing BETWEEN two buildings, so the path is
 * drawn as heavily as the roofs are.
 */
function buildTwoHouses(): Solid[] {
  const out: Solid[] = [];
  const house = (x: number, s: number, tone: number, yaw: number) => {
    out.push(translate(rotY(box(0.30 * s, 0.30 * s, 0.26 * s, tone), yaw), x, -0.28, 0));
    /* roof: a four-sided pyramid, closed at the top by a zero-radius ring */
    out.push(
      translate(
        rotY(lathe([[0.24 * s, 0], [0, 0.20 * s]], 4, tone * 0.62), yaw + 0.79),
        x,
        -0.13,
        0
      )
    );
    out.push(translate(rotY(panel(0.09 * s, 0.14 * s, 0.30), yaw), x, -0.35, 0.135 * s + 0.005));
  };
  house(-0.34, 1.0, 0.86, 0.22);
  house(0.34, 0.86, 0.66, -0.26);
  /* the path between them, and the gate on it */
  for (let i = 0; i < 7; i++) {
    out.push(
      translate(box(0.10, 0.014, 0.13, 0.44 + i * 0.05), 0, -0.435, 0.30 - i * 0.10)
    );
  }
  out.push(translate(box(0.024, 0.20, 0.024, 0.36), -0.10, -0.33, 0.16));
  out.push(translate(box(0.024, 0.20, 0.024, 0.36), 0.10, -0.33, 0.16));
  out.push(translate(box(0.20, 0.02, 0.02, 0.30), 0, -0.26, 0.16));
  return out;
}

/**
 * AlexNet transfer learning: the convolution tower. Each plate is smaller and
 * deeper than the one in front of it, which is the shape of the network and
 * also the shape of what transfer learning does — the photograph goes in the
 * front and only the last plate is retrained.
 */
function buildConvTower(): Solid[] {
  const out: Solid[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const s = 0.62 - i * 0.09;
    const d = 0.05 + i * 0.045;
    out.push(
      translate(box(s, s, d, 0.90 - i * 0.13), 0, 0.06 - i * 0.012, 0.30 - i * 0.17)
    );
  }
  /* the retrained head: a short stack of bars, in front and darker */
  for (let i = 0; i < 4; i++) {
    out.push(
      translate(box(0.05, 0.06 + i * 0.05, 0.05, 0.24), -0.09 + i * 0.06, -0.42, -0.52)
    );
  }
  return out;
}

/**
 * Natural systems and reinforcement learning: a flock wheeling around one
 * attractor. Darts rather than dots, so each one has a heading — a flock
 * without headings is a scatter plot.
 */
function buildFlock(): Solid[] {
  const out: Solid[] = [translate(cyl(0.026, 0.62, 8, 0.30), 0, -0.30, 0)];
  out.push(translate(annulus(0.44, 0.40, 20, 0.62), 0, -0.58, 0));
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU + i * 0.13;
    const r = 0.20 + (i % 4) * 0.09;
    const y = -0.14 + Math.sin(i * 1.7) * 0.26;
    /* a flattened tetrahedron-ish dart: a two-ring lathe with three sides */
    const dart = lathe([[0.055, -0.05], [0, 0.09]], 3, 0.28 + (i % 3) * 0.16);
    out.push(
      translate(rotZ(rotY(dart, a + 1.2), 0.9 - (i % 3) * 0.3), Math.cos(a) * r, y, Math.sin(a) * r)
    );
  }
  return out;
}

/** A screen on a stand. The delivered website: a page, above the fold. */
function buildMonitor(): Solid[] {
  const out: Solid[] = [
    translate(box(0.86, 0.54, 0.06, 0.58), 0, 0.18, 0),
    translate(panel(0.76, 0.44, 0.95), 0, 0.18, 0.035),
    translate(box(0.10, 0.22, 0.09, 0.44), 0, -0.20, 0),
    translate(box(0.40, 0.045, 0.24, 0.50), 0, -0.32, 0)
  ];
  /* a masthead and three columns, so the screen holds a page rather than glow */
  out.push(translate(panel(0.66, 0.055, 0.24), 0, 0.34, 0.04));
  for (let i = 0; i < 3; i++) {
    out.push(translate(panel(0.19, 0.24, 0.40 + i * 0.14), -0.235 + i * 0.235, 0.13, 0.04));
  }
  return out;
}

/**
 * The old portfolio: the same idea, two years earlier, so it is a CRT. Deeper
 * than it is wide, with the back tapered, which is a silhouette nobody can
 * mistake for the flat panel beside it on the shelf.
 */
function buildCrt(): Solid[] {
  const out: Solid[] = [
    translate(box(0.62, 0.52, 0.30, 0.62), 0, 0.06, 0),
    /* the taper: a four-sided lathe running back from the case */
    translate(
      rotX(lathe([[0.30, 0], [0.16, 0.26]], 4, 0.42), Math.PI / 2),
      0,
      0.06,
      -0.28
    ),
    translate(panel(0.48, 0.38, 0.96), 0, 0.07, 0.152),
    translate(box(0.44, 0.06, 0.30, 0.44), 0, -0.23, 0)
  ];
  /* scanlines, which is the one detail a CRT is allowed */
  for (let i = 0; i < 5; i++) {
    out.push(translate(panel(0.44, 0.014, 0.34), 0, 0.20 - i * 0.07, 0.156));
  }
  return out;
}

/**
 * The language app: one phrase said, one understood. Two bubbles, the second
 * offset behind and turned the other way, because the whole exercise is a
 * reply arriving in a language you did not have yesterday.
 */
function buildTwoBubbles(): Solid[] {
  const bubble = (w: number, h: number, tone: number): Solid[] => [
    box(w, h, 0.07, tone),
    translate(rotZ(box(0.09, 0.09, 0.07, tone), 0.78), -w * 0.28, -h * 0.5 - 0.03, 0)
  ];
  const out: Solid[] = [];
  for (const s of bubble(0.52, 0.30, 0.92)) out.push(translate(s, -0.13, 0.28, 0.06));
  for (const s of bubble(0.46, 0.26, 0.52)) out.push(translate(rotY(s, Math.PI), 0.16, -0.18, -0.08));
  /* three lines of type in the front one, so it is speech and not a slab */
  for (let i = 0; i < 3; i++) {
    out.push(translate(panel(0.34 - i * 0.07, 0.028, 0.20), -0.20 + i * 0.035, 0.36 - i * 0.08, 0.101));
  }
  return out;
}

/**
 * MNIST from scratch: a written digit on a card, and behind it the separating
 * plane the hand-written SVM found. The point of the project was that neither
 * the classifier nor the plane came from a library.
 */
function buildDigitAndPlane(): Solid[] {
  const out: Solid[] = [translate(box(0.50, 0.50, 0.05, 0.95), -0.16, 0.10, 0.20)];
  /* a 7, in five strokes on the card face */
  const stroke = (x: number, y: number, w: number, h: number, a: number) =>
    out.push(translate(rotZ(box(w, h, 0.05, 0.16), a), -0.16 + x, 0.10 + y, 0.24));
  stroke(-0.02, 0.15, 0.28, 0.045, 0);
  stroke(0.06, 0.02, 0.045, 0.20, 0.22);
  stroke(0.0, -0.13, 0.045, 0.16, 0.22);
  /* the plane, tilted through the space behind, with points either side */
  out.push(translate(rotY(rotZ(panel(0.62, 0.50, 0.30), 0.42), 0.6), 0.22, -0.02, -0.16));
  for (let i = 0; i < 9; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    out.push(
      translate(
        cyl(0.024, 0.024, 6, side > 0 ? 0.22 : 0.86),
        0.22 + side * (0.10 + (i % 3) * 0.06),
        -0.24 + i * 0.055,
        -0.16 + side * 0.10
      )
    );
  }
  return out;
}

/**
 * The rasterizer: a wireframe solid inside the frustum that is projecting it,
 * with the depth slabs stacked behind. Wire on the model and solid on the
 * frustum, because the project is the difference between the two.
 */
function buildRasterizer(): Solid[] {
  const out: Solid[] = [];
  const wire = (s: Solid): Solid => ({ ...s, wire: true });
  out.push(translate(wire(box(0.38, 0.38, 0.38, 0.16)), -0.02, 0.10, 0.02));
  out.push(translate(wire(rotY(box(0.26, 0.26, 0.26, 0.16), 0.6)), -0.02, 0.10, 0.02));
  /* the frustum: a four-sided lathe opening away from the eye */
  out.push(
    translate(
      rotX(wire(lathe([[0.06, 0], [0.46, 0.72]], 4, 0.30)), -Math.PI / 2),
      -0.02,
      0.10,
      0.46
    )
  );
  /* the eye */
  out.push(translate(lathe([[0, -0.05], [0.07, 0], [0, 0.05]], 8, 0.24), -0.02, 0.10, 0.50));
  /* z-buffer slabs behind the model, nearest darkest */
  for (let i = 0; i < 4; i++) {
    out.push(translate(panel(0.50, 0.42, 0.30 + i * 0.18), -0.02, 0.10, -0.22 - i * 0.10));
  }
  return out;
}

/**
 * The interactive portfolio: a screen with a caret on it and a bubble coming
 * off the side. The project was a site you could talk to, so the object is a
 * screen that is mid-answer.
 */
function buildTalkingScreen(): Solid[] {
  const out: Solid[] = [
    translate(box(0.72, 0.48, 0.06, 0.60), -0.06, 0.14, 0),
    translate(panel(0.62, 0.38, 0.95), -0.06, 0.14, 0.035),
    translate(box(0.09, 0.20, 0.08, 0.44), -0.06, -0.20, 0),
    translate(box(0.34, 0.045, 0.22, 0.50), -0.06, -0.31, 0)
  ];
  /* two answered lines and a live caret on the third */
  out.push(translate(panel(0.44, 0.03, 0.26), -0.14, 0.26, 0.04));
  out.push(translate(panel(0.36, 0.03, 0.26), -0.18, 0.19, 0.04));
  out.push(translate(panel(0.026, 0.05, 0.12), -0.34, 0.11, 0.04));
  /* the reply, arriving off the right-hand edge */
  out.push(translate(box(0.30, 0.20, 0.06, 0.90), 0.40, 0.30, 0.04));
  out.push(translate(rotZ(box(0.07, 0.07, 0.06, 0.90), 0.78), 0.30, 0.19, 0.04));
  return out;
}

/**
 * The offline app: a phone with the model inside it and the aerial struck
 * through. Everything about that project is the absence of a network, and an
 * absence has to be drawn as a mark rather than left out.
 */
function buildOfflinePhone(): Solid[] {
  const out: Solid[] = [
    translate(box(0.40, 0.76, 0.09, 0.62), -0.08, 0.04, 0),
    translate(panel(0.33, 0.64, 0.95), -0.08, 0.05, 0.05),
    translate(cyl(0.035, 0.014, 8, 0.40), -0.08, -0.36, 0.05)
  ];
  /* the model, drawn inside the glass as a small stack of layers */
  for (let i = 0; i < 4; i++) {
    out.push(translate(box(0.22 - i * 0.03, 0.05, 0.02, 0.20 + i * 0.16), -0.08, 0.20 - i * 0.09, 0.055));
  }
  /* the aerial, and the bar through it */
  out.push(translate(cyl(0.016, 0.26, 6, 0.36), 0.28, 0.34, 0));
  out.push(translate(lathe([[0.09, 0], [0, 0.12]], 3, 0.30), 0.28, 0.47, 0));
  out.push(translate(rotZ(box(0.40, 0.035, 0.035, 0.12), 0.72), 0.28, 0.40, 0.05));
  return out;
}

/**
 * Texas Hold'em in Haskell: the five community cards, fanned, over the pot.
 * Fanned rather than stacked because the whole game is that everyone can see
 * the same five and still disagree about them.
 */
function buildCardFan(): Solid[] {
  const out: Solid[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.20;
    out.push(
      translate(
        rotZ(box(0.24, 0.34, 0.014, 0.94), a),
        (i - 2) * 0.14,
        0.16 - Math.abs(i - 2) * 0.028,
        i * 0.012
      )
    );
    /* one pip, so a card is a card */
    out.push(
      translate(
        rotZ(panel(0.06, 0.08, i === 2 ? 0.18 : 0.44), a),
        (i - 2) * 0.14,
        0.16 - Math.abs(i - 2) * 0.028,
        i * 0.012 + 0.012
      )
    );
  }
  /* the pot */
  for (let i = 0; i < 6; i++) {
    out.push(
      translate(cyl(0.11, 0.035, 10, 0.44 + i * 0.07), -0.02, -0.42 + i * 0.036, -0.10)
    );
  }
  return out;
}

/**
 * The swarm in the pipe. Deliberately the same object as the award, because it
 * is the same work: the pipe robots won Engineering You're Hired and the case
 * should not pretend otherwise by drawing it twice, two different ways.
 */
function buildPipeSwarm(): Solid[] {
  const out: Solid[] = [];
  const R = 0.34;
  out.push(translate(rotX(cyl(R, 0.92, 16, 0.72, false), Math.PI / 2), 0, -0.02, 0));
  out.push(translate(rotX(annulus(R, R - 0.05, 16, 0.30), Math.PI / 2), 0, -0.02, 0.46));
  out.push(translate(rotX(annulus(R, R - 0.05, 16, 0.44), Math.PI / 2), 0, -0.02, -0.46));
  /* two crawlers on the bore, one either side, legs down onto the wall */
  const crawler = (a: number, z: number) => {
    const x = Math.cos(a) * (R - 0.08);
    const y = -0.02 + Math.sin(a) * (R - 0.08);
    out.push(translate(rotZ(box(0.16, 0.07, 0.10, 0.26), a), x, y, z));
    for (let k = -1; k <= 1; k += 2) {
      out.push(
        translate(
          rotZ(box(0.02, 0.09, 0.02, 0.20), a + 0.5 * k),
          x + Math.cos(a) * 0.05,
          y + Math.sin(a) * 0.05,
          z + k * 0.05
        )
      );
    }
  };
  crawler(1.9, 0.14);
  crawler(-0.7, -0.16);
  return out;
}

/* -------------------------------------------------------------------------- */
/* the list                                                                    */
/* -------------------------------------------------------------------------- */

interface Spec {
  build: () => Solid[];
  /** Caption, because a procedural object needs one. */
  label: string;
}

/**
 * Keyed by project id, so a renamed title cannot silently swap two objects on
 * the shelf. A project with no entry gets the ballot box's neighbour rather
 * than nothing — see `specFor` — but every project in the data has one today.
 */
const SPECS: Record<string, Spec> = {
  recensorium: { build: buildBallotBox, label: 'A sealed ballot box, with a paper going into the slot.' },
  motiongen: { build: buildFigureOnTimeline, label: 'A figure mid-stride, over the keyframe strip it was written into.' },
  habitflow: { build: buildHabitGrid, label: 'A wall calendar with a streak on it, and one day missed.' },
  neighbourly: { build: buildTwoHouses, label: 'Two houses, and the path between them.' },
  'alexnet-transfer-classifier': { build: buildConvTower, label: 'The convolution tower, with only the last plate retrained.' },
  'natural-systems-and-rl': { build: buildFlock, label: 'A flock wheeling around one attractor.' },
  'client-website-sheffield': { build: buildMonitor, label: 'A screen on a stand, with a page above the fold.' },
  'old-personal-portfolio': { build: buildCrt, label: 'The same idea two years earlier, so: a CRT.' },
  'language-learning-app': { build: buildTwoBubbles, label: 'One phrase said, one understood.' },
  'mnist-from-scratch-classifier': { build: buildDigitAndPlane, label: 'A written digit, and the separating plane behind it.' },
  '3d-rasterizer-engine': { build: buildRasterizer, label: 'A wireframe solid inside the frustum projecting it.' },
  'eyh-swarm-pipe-robots': { build: buildPipeSwarm, label: 'A length of pipe, with two of the swarm walking it.' },
  'interactive-ai-portfolio': { build: buildTalkingScreen, label: 'A screen that is mid-answer.' },
  'offline-ai-app': { build: buildOfflinePhone, label: 'A phone with the model inside it and the aerial struck through.' },
  'texas-holdem-haskell': { build: buildCardFan, label: 'The five community cards, fanned, over the pot.' }
};

const FALLBACK: Spec = { build: buildMonitor, label: 'A screen on a stand.' };

function specFor(p: Project): Spec {
  return SPECS[p.id] ?? FALLBACK;
}

/** 'August 2026' etc, newest first. Unparseable dates sort to the end. */
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];
function monthKey(date: string): number {
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec((date || '').trim());
  if (!m) return -1;
  const mi = MONTHS.indexOf(m[1].toLowerCase());
  if (mi < 0) return -1;
  return Number(m[2]) * 12 + mi;
}

/**
 * The one written line about each project, where there is one.
 *
 * FEATURED_PROJECTS carries a `hook` for the five the spine used to lead with:
 * a sentence written to be read, rather than the opening of a catalogue entry.
 * Preferring it costs nothing and reads better than truncating a description
 * at its first full stop, which is what the other ten still get.
 */
const HOOKS: Record<string, string> = Object.fromEntries(
  FEATURED_PROJECTS.map((f) => [f.id, f.hook])
);

export interface ProjectCaseProps {
  className?: string;
  /**
   * 'index'  the head of /v2/projects. Every project on screen beside the
   *          carousel, and choosing one raises its entry below.
   * 'reel'   the spine. Three objects, arrows, and the way in.
   *
   * > "can you just lift the carousel from the 'all projects' page but only
   * >  keep the two either side and be able to use the arrow buttons and the
   * >  horizontal scroll if the user has it"
   *
   * So it is one component with two dresses rather than two components that
   * drift. The reel is the same fifteen objects, the same pipeline and the
   * same ring: it just lights a window of three and hands you the arrows.
   */
  variant?: 'index' | 'reel';
  /** Fires when a project is CHOSEN. See SpecimenCase.onChoose. */
  onChoose?: (id: string, index: number) => void;
  /** The chosen project's id, if the caller tracks one. */
  chosenId?: string;
}

export default function ProjectCase({
  className,
  variant = 'index',
  onChoose,
  chosenId
}: ProjectCaseProps) {
  const entries = useMemo<readonly CaseEntry[]>(() => {
    const sorted = PROJECTS.slice().sort((a, b) => monthKey(b.date) - monthKey(a.date));
    return sorted.map((p) => {
      const spec = specFor(p);
      /* The index below already carries the full description; the citation
         gets the hook if the project has one and the first sentence if not,
         which is the one that says what it is. */
      const dot = p.description.indexOf('. ');
      return {
        key: p.id,
        meta: p.status === 'in-progress' ? 'In progress' : 'Shipped',
        title: p.title,
        date: p.date,
        body: HOOKS[p.id] ?? (dot > 40 ? p.description.slice(0, dot + 1) : p.description),
        badges: p.tech.slice(0, 5),
        specimen: spec.label,
        build: spec.build
      };
    });
  }, []);

  const reel = variant === 'reel';

  return (
    <SpecimenCase
      className={className}
      idPrefix={reel ? 'v2-case-reel' : 'v2-case-projects'}
      entries={entries}
      arrows
      /* The index page has its own masthead directly above this, and the point
         of the sheet is that the carousel is reachable from the top. */
      head={reel}
      layout={reel ? 'reel' : 'sheet'}
      /* Two either side, and no more. See SpecimenCaseProps.window. */
      window={reel ? 2 : undefined}
      onChoose={onChoose ? (e, i) => onChoose(e.key, i) : undefined}
      chosenKey={chosenId}
      listLabel={
        reel
          ? 'Projects. Drag sideways or use the arrow keys to turn the case.'
          : 'Projects. Use the arrow keys to turn the case, and enter to open one.'
      }
      eyebrow={
        reel ? (
          <>
            Projects / <b>{entries.length}, newest first</b>
          </>
        ) : (
          <>
            Projects / <b>{entries.length} on the shelf</b>
          </>
        )
      }
      heading={reel ? 'Turn the case.' : 'Fifteen projects, fifteen objects.'}
      note={
        reel
          ? 'The same case that stands at the head of the index, holding three at a time. Each ' +
            'object is modelled from vertices and drawn by the same hand-rolled pipeline that ' +
            'draws the rest of this site, then quantised to a grid of characters. Use the ' +
            'arrows, the arrow keys, or a sideways scroll.'
          : 'Not fifteen screenshots. Each object is modelled from vertices and drawn by the same ' +
            'hand-rolled pipeline that draws the rest of this site, then quantised to a grid of ' +
            'characters. Where a project has a physical fact in it, that is the object: a pipe, a ' +
            'wall calendar, a fan of cards. Choose one and its entry opens below.'
      }
      citationFoot={
        reel
          ? (entry) => (
              /*
               * THE WAY IN, carried over from the reel this replaced.
               *
               * Jack, 2026-08-26: "there is no link to each project (each
               * should have its own custom page) ... there is also no link to
               * an 'all projects' page."
               *
               * Both of them, in the part of the case that is about ONE
               * project, because the first is where you go if the object in
               * front of you interested you and the second is where you go if
               * it did not.
               */
              <p className="v2-case-go" data-perch>
                <Link href={`/v2/projects/${entry.key}`} className="is-lead">
                  Open {entry.title}
                </Link>
                <Link href="/v2/projects">Every project</Link>
              </p>
            )
          : undefined
      }
    />
  );
}
