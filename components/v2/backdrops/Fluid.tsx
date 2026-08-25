'use client';

/* ============================================================================
   Fluid — ink drops coalescing on a wet sheet.

   Two things have to be true or this is a lava lamp.

   ONE: THE SURFACE IS IMPLICIT, NOT A PILE OF CIRCLES.
   Every pixel evaluates ONE scalar field summed over all drops

       F(p) = Σ  wᵢ · rᵢ² / (dᵢ² + ε rᵢ²) · (1 − dᵢ²/(3rᵢ)²)²

   and the ink is wherever F ≥ T. The first factor is the real inverse-square
   metaball kernel — that is what makes two drops bridge — and the second is a
   C¹ window that takes it to exactly zero at 3rᵢ, so a drop cannot quietly
   thicken the field on the far side of the page and the loop stays cheap.

   The numbers that matter, for equal drops of nominal radius r:

       isosurface of one drop alone .............. d = 0.885 r
       two surfaces touch ........................ centres at 1.77 r
       the NECK first appears .................... centres at 2.35 r

   So there is a 33% band of separation in which a bridge exists between two
   drops that are not touching. It starts as a hairline, thickens, and the pair
   becomes one body. Run it backwards and you get the pinch. That band is the
   whole point, and it is why nothing here composites per-blob alpha: alpha
   compositing can only ever darken an overlap, it can never produce a neck.

   TWO: THE MOTION IS DYNAMICS, NOT SINE PATHS.
   Drops carry area (mass), momentum and damping. They attract each other at
   range like a cohesive fluid, resist being pushed inside each other, and —
   crucially — REDISTRIBUTE VOLUME while in contact: the larger drop drains the
   smaller, absorbs its momentum, and the smaller shrinks out of existence.
   A drop that grows past its surface tension TEARS: it splits along its long
   axis into two children that separate, so the neck thins and snaps. Merges
   and splits are therefore the same mechanism seen twice, and both are driven
   by the simulation rather than scheduled.

   Two details make the difference between that reading as fluid and reading as
   a bounce. Cohesion is applied only between each drop's NEAREST partner — a
   1/d² pull between every pair does the one thing it always does, which is pile
   the entire population into a corner. And the shove that walks a torn pair
   apart is its own force, two orders of magnitude below the contact repulsion,
   because the parting has to take seconds. Measured over a long run, a torn
   pair goes 0.49 → 1.86 of its summed radii and back: fused, necked, snapped,
   drifting, and eventually rejoined. Some bridge is on screen about half the
   time.

   Scroll enters as inertia. The sheet moves, the drops lag behind it, shear
   across the frame, stretch along their direction of travel (area preserved,
   so a moving drop is a droplet and a resting one is a disc) and tear more
   easily. The drag fades as the lag grows, so a long fling reaches a bounded
   offset rather than flushing the sheet. Everything relaxes when the page
   stops. `progress` walks the whole cluster down the sheet and modulates
   wetness — a lower threshold at mid-section swells every surface at once, so
   pairs that were merely near find each other.

   Legibility: the physics keeps drops out of an elliptical exclusion in the
   middle of the frame and what is left there is attenuated to 40%. The RIM
   carries the drawing — a tide mark is what ink leaves when it dries — and the
   body stays light enough to set type over.
   ========================================================================== */

import { useEffect, useRef } from 'react';
import type { BackdropProps } from './types';
import { toRgb, mulberry32 } from './types';

/* -------------------------------------------------------------------------- */
/* tuning                                                                      */
/* -------------------------------------------------------------------------- */

/** Slot count. Also the shader loop bound and uniform array size. Slots above
 *  the live population are dormant and exist so a tear has somewhere to go. */
const N = 14;
/** Population the respawner aims for. The rest are headroom for tearing. */
const WANT_ACTIVE = 8;

const DPR_CAP = 2;
/** A full-screen fragment loop over N drops is ALU bound, so cap total pixels
 *  as well as DPR. The wash is soft by design; the shortfall is invisible. */
const MAX_PIXELS = 2.4e6;

/* Areas, not radii, because area is the conserved quantity. r = sqrt(area). */
const A_BASE = 0.00500; // r ≈ 0.071 of page height
const A_FADE = 0.00140; // below this a drop is fading out
const A_DEAD = 0.00055; // below this it is gone
const A_SPLIT = 0.01150; // r ≈ 0.107 — surface tension gives up
const A_TOTAL = 0.04000; // target total ink on the sheet
const GROW = 2.6e-5; // newborn soaking outward, per frame

/* Forces are accelerations in world units per frame². Terminal speed under
   DAMP is f / (1 − DAMP), which is how these were sized. */
const DAMP = 0.984;
const SPRING = 2.6e-4;
const DRIFT_F = 4.2e-5;
const COHERE = 6.0e-4; // × neighbour area / distance²
/** Surface tension is SHORT range. Past this multiple of the summed radii two
 *  drops ignore each other — it is also the honest cutoff, since past ~3 radii
 *  the fields cannot bridge anyway. */
const COHERE_RANGE = 2.8;
/** Repulsion is scaled by the neighbour's area exactly as cohesion is, so the
 *  balance between them does not depend on how big the neighbour happens to be.
 *  Getting this wrong is what collapses a population to a single point. */
const REPEL = 0.55;
/** The shove that walks a freshly torn pair apart. Two orders of magnitude
 *  below REPEL, because this one has to take seconds rather than frames. */
const TEAR_PUSH = 0.055;
const CENTRE_F = 3.4e-4; // keep the middle of the frame clear for text
const WALL_F = 2.6e-3;
const VEL_DRAG = 5.5e-6; // per px/frame of scroll
/** How far behind its home a drop may fall under a sustained scroll. */
const LAG_MAX = 0.20;
const MAX_SPEED = 0.014;

/** Volume drained per frame at full contact, from the smaller into the larger. */
const TRANSFER = 0.012;
/** Frames a freshly torn pair refuses to fuse back together. Long, because
 *  this is the pinch: the whole point is to watch the bridge thin and go. */
const FUSE_LOCK = 380;
/** Ceiling on the live population, so a run of tears cannot fill the sheet. */
const MAX_ACTIVE = 10;

/* -------------------------------------------------------------------------- */
/* why there is no shader here                                                 */
/* -------------------------------------------------------------------------- */

/*
 * This world used to evaluate the field in a WebGL2 fragment shader, with the
 * CPU path below as a fallback. Jack, on the bench: "you can't see anything, it
 * is broken I think." The GL path is gone, for three reasons that all point the
 * same way.
 *
 * ONE: IT COULD FAIL SILENTLY AND OFTEN DID. If the context came back but the
 * program did not link, `drawGL` returned early — and by then the canvas had a
 * GL context, so the 2D fallback could never be reached: a canvas gets one
 * context type for its whole life. A world that draws nothing and reports
 * nothing is indistinguishable from a world that is broken, which is exactly
 * what was reported.
 *
 * TWO: THE CONTEXT BUDGET. Browsers keep somewhere between eight and sixteen
 * live WebGL contexts and drop the oldest without asking. Three of the eight
 * worlds owned one, and the backdrop bench cycles through all eight — so by the
 * time anyone reached Fluid the pool could already have been recycled out from
 * under it. Nothing in the code could tell that apart from working correctly.
 *
 * THREE: IT WAS NEVER THE EXPENSIVE PART. The field is fourteen drops over a
 * grid of at most 200 by 125 — 350k inner iterations a frame, which JavaScript
 * does comfortably — and it is then bilinearly upscaled by drawImage. On ink
 * bleeding into wet paper that upscale is not a loss; it is the wetness.
 *
 * See P2-FALLBACK in docs/plan.md: the same argument applies to the two worlds
 * that still hold a context.
 */

/* -------------------------------------------------------------------------- */
/* component                                                                   */
/* -------------------------------------------------------------------------- */

export default function Fluid({
  intensity,
  progress,
  velocity,
  palette,
  className,
}: BackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* Props are read once per frame through this ref rather than through the
     effect's closure, so scrolling never rebuilds the GL pipeline. */
  const live = useRef({ intensity, progress, velocity, palette });
  live.current.intensity = intensity;
  live.current.progress = progress;
  live.current.velocity = velocity;
  live.current.palette = palette;

  /* The palette only changes on a theme flip, so resolving hex to floats is
     deferred to the next frame rather than done on every render. */
  const paletteKey =
    palette.surface +
    palette.ink +
    palette.ink2 +
    palette.accent +
    palette.accent2;
  const colourDirty = useRef(true);
  useEffect(() => {
    colourDirty.current = true;
  }, [paletteKey]);

  /* Under prefers-reduced-motion there is no loop, so intensity and theme
     changes have to be pushed in by hand. This is not a loop: the simulation
     clock never advances, so the image is identical each time — only its
     opacity moves. */
  const redrawStatic = useRef<((i: number) => void) | null>(null);
  useEffect(() => {
    if (redrawStatic.current) redrawStatic.current(intensity);
  }, [intensity, paletteKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------------------------------------------------------------- state */
    /* Every array here is allocated once. The frame loop writes into them and
       never creates anything, which is the whole reason this can run behind a
       live page without stuttering it. */
    const rng = mulberry32(0x0d1a5e);

    const alive = new Uint8Array(N); // 1 active, 0 dormant
    const px = new Float32Array(N);
    const py = new Float32Array(N);
    const vx = new Float32Array(N);
    const vy = new Float32Array(N);
    const area = new Float32Array(N);
    const aim = new Float32Array(N); // the area a newborn soaks up to
    const wt = new Float32Array(N); // shader weight, 0 while fading
    const ax = new Float32Array(N); // stretch axis x
    const ay = new Float32Array(N); // stretch axis y
    const st = new Float32Array(N); // stretch magnitude
    const sus = new Float32Array(N); // how readily this drop deforms, 0.6..1.4
    const fuse = new Float32Array(N); // frames left refusing to re-fuse
    const wait = new Float32Array(N); // frames until a dormant slot respawns
    const hang = new Float32Array(N); // home angle on the orbit
    const hrad = new Float32Array(N); // home distance, 0..1 of the ellipse
    const hdir = new Float32Array(N); // orbit direction
    const ph0 = new Float32Array(N);
    const ph1 = new Float32Array(N);
    const roleOf = new Uint8Array(N);
    const tintOf = new Float32Array(N);
    const gap = new Float32Array(N * N); // pair distances, one pass per frame
    const near = new Int8Array(N); // index of the closest live neighbour
    const nearD = new Float32Array(N);

    /* uniform staging, uploaded as-is */
    const u0 = new Float32Array(N * 4);
    const u1 = new Float32Array(N * 4);
    const ucol = new Float32Array(N * 3);
    const roleRgb = new Float32Array(4 * 3);
    const inkRgb = new Float32Array(3);
    const surfRgb = new Float32Array(3);

    let aspect = 1;
    let cssW = 1;
    let pixelRatio = 1;
    let placed = false;
    let threshold = 1;
    let time = 0;

    function role(dst: number, hex: string) {
      const c = toRgb(hex);
      roleRgb[dst * 3] = c[0] / 255;
      roleRgb[dst * 3 + 1] = c[1] / 255;
      roleRgb[dst * 3 + 2] = c[2] / 255;
    }

    /** Resolve one drop's pigment: its role, pulled back toward ink2 so the
     *  accents never read as brand paint when they bleed into a neighbour. */
    function tintSlot(i: number) {
      const r = roleOf[i] * 3;
      const t = tintOf[i];
      for (let k = 0; k < 3; k++) {
        ucol[i * 3 + k] = roleRgb[r + k] * (1 - t) + roleRgb[3 + k] * t;
      }
    }

    function syncColours() {
      const p = live.current.palette;
      role(0, p.ink);
      role(1, p.ink2);
      role(2, p.accent);
      role(3, p.accent2);
      const s = toRgb(p.surface);
      surfRgb[0] = s[0] / 255;
      surfRgb[1] = s[1] / 255;
      surfRgb[2] = s[2] / 255;
      inkRgb[0] = roleRgb[0];
      inkRgb[1] = roleRgb[1];
      inkRgb[2] = roleRgb[2];
      for (let i = 0; i < N; i++) tintSlot(i);
    }

    /** Where drop i wants to be: a point on a slow orbit around the cluster,
     *  on an ellipse wide enough that the middle column stays clear. */
    function homeX(i: number, cx: number): number {
      return (
        cx +
        Math.cos(hang[i] + time * 0.012 * hdir[i]) * hrad[i] * aspect * 0.42
      );
    }
    function homeY(i: number, cy: number): number {
      return cy + Math.sin(hang[i] + time * 0.012 * hdir[i]) * hrad[i] * 0.38;
    }

    /** Pick a fresh identity for a slot: where it sits, how big it wants to be,
     *  what colour it is. Mostly ink2; ink now and then; an accent rarely. */
    function reseed(i: number) {
      hang[i] = rng() * Math.PI * 2;
      hrad[i] = 0.55 + rng() * 0.45;
      hdir[i] = rng() < 0.5 ? -1 : 1;
      ph0[i] = rng() * Math.PI * 2;
      ph1[i] = rng() * Math.PI * 2;
      aim[i] = A_BASE * (0.72 + rng() * 0.72);
      sus[i] = 0.6 + rng() * 0.8;

      const r = rng();
      if (r < 0.62) {
        roleOf[i] = 1;
        tintOf[i] = 0;
      } else if (r < 0.86) {
        roleOf[i] = 0;
        tintOf[i] = 0.2;
      } else if (r < 0.94) {
        roleOf[i] = 2;
        tintOf[i] = 0.5;
      } else {
        roleOf[i] = 3;
        tintOf[i] = 0.44;
      }
      tintSlot(i);
    }

    function spawn(i: number, cx: number, cy: number) {
      reseed(i);
      alive[i] = 1;
      px[i] = homeX(i, cx);
      py[i] = homeY(i, cy);
      vx[i] = 0;
      vy[i] = 0;
      area[i] = A_DEAD * 1.05; // invisible, then soaks outward from nothing
      wt[i] = 0;
      ax[i] = 0;
      ay[i] = 1;
      st[i] = 0;
      fuse[i] = 0;
    }

    function kill(i: number) {
      alive[i] = 0;
      wt[i] = 0;
      area[i] = 0;
      st[i] = 0;
      wait[i] = 40 + rng() * 200;
    }

    /** A tear needs somewhere for the child to live. Requiring a spare beyond
     *  the one it takes stops a cascade filling every slot, which would then
     *  leave a drop stuck oversized with nowhere to break. */
    function dormantSlot(spare: number): number {
      let free = 0;
      let first = -1;
      for (let i = 0; i < N; i++) {
        if (alive[i] === 0) {
          free++;
          if (first < 0) first = i;
        }
      }
      return free > spare ? first : -1;
    }

    /* ------------------------------------------------------------- tearing */

    /** Surface tension gives up. The drop splits along its LONG axis, which is
     *  the axis it has been stretched along, into two overlapping children that
     *  push apart — so the bridge between them thins and snaps rather than the
     *  drop simply becoming two circles. */
    function tear(i: number, j: number) {
      const a = area[i];
      const f = 0.52 + rng() * 0.12;
      const a1 = a * f;
      const a2 = a - a1;
      const r = Math.sqrt(a);
      const tx = ax[i];
      const ty = ay[i];
      const off = r * 0.34;
      const sep = 0.0009 + rng() * 0.0005;

      // child j inherits the slot's identity from its parent, so a torn pair
      // is the same pigment on both sides of the break
      roleOf[j] = roleOf[i];
      tintOf[j] = tintOf[i];
      tintSlot(j);
      hang[j] = hang[i] + (rng() - 0.5) * 1.2;
      hrad[j] = 0.55 + rng() * 0.45;
      hdir[j] = hdir[i];
      ph0[j] = rng() * Math.PI * 2;
      ph1[j] = rng() * Math.PI * 2;
      sus[j] = 0.6 + rng() * 0.8;
      /* Neither half is a newborn — they already own their volume. Leaving a
         growth target on them would let the soak-in step clamp a child back
         down to a beginner's size and quietly destroy ink. */
      aim[i] = 0;
      aim[j] = 0;

      alive[j] = 1;
      area[i] = a1;
      area[j] = a2;

      px[j] = px[i] + tx * off;
      py[j] = py[i] + ty * off;
      px[i] -= tx * off;
      py[i] -= ty * off;

      vx[j] = vx[i] + tx * sep;
      vy[j] = vy[i] + ty * sep;
      vx[i] -= tx * sep;
      vy[i] -= ty * sep;

      ax[j] = tx;
      ay[j] = ty;
      st[j] = st[i];

      fuse[i] = FUSE_LOCK;
      fuse[j] = FUSE_LOCK;
    }

    /* ------------------------------------------------------------- physics */

    function step(dt: number) {
      const prog = live.current.progress;
      let vel = live.current.velocity;
      if (!Number.isFinite(vel)) vel = 0;
      vel = vel < -140 ? -140 : vel > 140 ? 140 : vel;
      const gs = Math.min(Math.abs(vel) / 70, 1);

      // mid-section the sheet is wettest: dropping the threshold swells every
      // surface at once, so necks form between pairs that were merely near
      threshold = 1.0 - 0.14 * Math.sin(prog * Math.PI) + 0.05 * gs;

      const cx = aspect * 0.5;
      const cy = 0.34 + 0.3 * prog; // the cluster runs down the sheet as you read
      const damp = Math.pow(DAMP, dt);

      /* ---- single-drop forces ---- */
      for (let i = 0; i < N; i++) {
        if (alive[i] === 0) {
          wait[i] -= dt;
          continue;
        }

        const hx = homeX(i, cx);
        const hy = homeY(i, cy);

        let fx = (hx - px[i]) * SPRING;
        let fy = (hy - py[i]) * SPRING;

        // two incommensurate frequencies per axis: never repeats visibly
        fx +=
          (Math.sin(time * 0.19 + ph0[i]) * 0.62 +
            Math.sin(time * 0.11 + ph1[i] * 1.7) * 0.38) *
          DRIFT_F;
        fy +=
          (Math.cos(time * 0.15 + ph1[i]) * 0.62 +
            Math.cos(time * 0.09 + ph0[i] * 1.3) * 0.38) *
          DRIFT_F;

        /* The sheet moves and the drops have mass, so they lag behind it, more
           on one side of the frame than the other — without that shear a fast
           scroll reads as the whole picture sliding in one rigid piece.
           The drag fades out as the lag grows, which is the difference between
           a drop being dragged through a fluid and a drop being accelerated
           forever: a long fling reaches a bounded lag and holds it, instead of
           quietly flushing the entire population off the bottom of the sheet. */
        const lag = Math.min(Math.abs(py[i] - hy) / LAG_MAX, 1);
        const pin = 1 - lag * lag;
        const shear = 0.65 + 0.7 * (px[i] / Math.max(aspect, 0.01));
        fy += vel * VEL_DRAG * shear * pin;
        fx += vel * VEL_DRAG * 0.3 * pin * Math.sin(ph0[i] + py[i] * 5.0);

        // keep the middle of the frame clear: a wide flat exclusion, matched to
        // the shader's quiet ellipse, that text sits inside
        const ex = px[i] - cx;
        const ey = (py[i] - 0.5) * 1.4;
        const ed = Math.sqrt(ex * ex + ey * ey);
        if (ed < 0.36 && ed > 1e-4) {
          const k = (CENTRE_F * (1 - ed / 0.36)) / ed;
          fx += ex * k;
          fy += ey * k * 0.7;
        }

        /* Soft walls, set a little outside the frame so drops are free to run
           off the edge — a population that never crosses the border reads as
           being kept in a box. */
        const lo = -0.16;
        if (px[i] < lo) fx += (lo - px[i]) * WALL_F;
        else if (px[i] > aspect - lo) fx += (aspect - lo - px[i]) * WALL_F;
        if (py[i] < lo) fy += (lo - py[i]) * WALL_F;
        else if (py[i] > 1 - lo) fy += (1 - lo - py[i]) * WALL_F;

        vx[i] = (vx[i] + fx * dt) * damp;
        vy[i] = (vy[i] + fy * dt) * damp;
      }

      /* ---- who is whose nearest ---- */
      for (let i = 0; i < N; i++) {
        near[i] = -1;
        nearD[i] = 1e9;
      }
      for (let i = 0; i < N; i++) {
        if (alive[i] === 0) continue;
        for (let j = i + 1; j < N; j++) {
          if (alive[j] === 0) continue;
          const dx = px[j] - px[i];
          const dy = py[j] - py[i];
          const d = Math.sqrt(dx * dx + dy * dy);
          gap[i * N + j] = d;
          if (d < nearD[i]) {
            nearD[i] = d;
            near[i] = j;
          }
          if (d < nearD[j]) {
            nearD[j] = d;
            near[j] = i;
          }
        }
      }

      /* ---- pairwise: cohesion, contact, volume transfer ----

         Cohesion acts only between NEAREST partners. Surface tension between
         real drops is a local negotiation, and a 1/d² attraction applied to
         every pair does the one thing it always does — piles the whole
         population into a single lump in a corner. Restricting the pull to the
         closest partner gives pairs and short chains, which is what ink on a
         wet sheet actually does. Repulsion still applies to every pair, so the
         drops that are not partnered still keep out of each other's way. */
      for (let i = 0; i < N; i++) {
        if (alive[i] === 0) continue;
        const ri = Math.sqrt(area[i]);
        for (let j = i + 1; j < N; j++) {
          if (alive[j] === 0) continue;

          let d = gap[i * N + j];
          const rj = Math.sqrt(area[j]);
          const sum = ri + rj;
          if (d > sum * COHERE_RANGE) continue;
          if (d < 1e-5) d = 1e-5;

          const dx = px[j] - px[i];
          const dy = py[j] - py[i];
          const inv = 1 / d;
          const nx = dx === 0 && dy === 0 ? 1 : dx * inv;
          const ny = dx === 0 && dy === 0 ? 0 : dy * inv;

          const lock = Math.max(fuse[i], fuse[j]) / FUSE_LOCK;

          /* Cohesion: inverse square, saturating just outside contact so it
             cannot run away, faded to nothing at the edge of reach so a drop
             entering range does not get a kick, and cut right down while a torn
             pair is still pulling apart. */
          if (near[i] === j || near[j] === i) {
            const reach = sum * COHERE_RANGE;
            const t = d / reach;
            const taper = 1 - t * t;
            const sat = sum * 0.85;
            const soft = Math.max(d * d, sat * sat);
            /* Cushion the last of the approach. Two drops that close at full
               speed cross the band where the bridge exists in a couple of
               frames and the neck is over before it registers; at a third of
               the pull it lasts long enough to read. */
            const cushion = 0.34 + 0.66 * Math.min(d / (sum * 1.35), 1);
            const pull = (COHERE * taper * cushion * (1 - lock)) / soft;
            vx[i] += nx * pull * area[j] * dt;
            vy[i] += ny * pull * area[j] * dt;
            vx[j] -= nx * pull * area[i] * dt;
            vy[j] -= ny * pull * area[i] * dt;
          }

          /* Core: shallow enough that a partnered pair settles at ~0.4 of their
             summed radii — deeply fused, one body with a waist. */
          const core = sum * 0.58;
          if (d < core) {
            const o = 1 - d / core;
            const push = REPEL * o * o;
            vx[i] -= nx * push * area[j] * dt;
            vy[i] -= ny * push * area[j] * dt;
            vx[j] += nx * push * area[i] * dt;
            vy[j] += ny * push * area[i] * dt;
          }

          /* The pinch. A torn pair is walked apart by its own separate, very
             weak shove that dies out just past the distance at which the bridge
             between them can survive. Weak is the whole point: reuse the main
             repulsion here and the two halves are fired across the frame in
             half a second, which is a bounce, not a fluid coming apart. This
             takes about two seconds to cross the band, so the neck thins,
             holds, and goes. */
          if (lock > 0.02) {
            const tcore = sum * 1.50;
            if (d < tcore) {
              const o = 1 - d / tcore;
              const push = TEAR_PUSH * o * o * lock;
              vx[i] -= nx * push * area[j] * dt;
              vy[i] -= ny * push * area[j] * dt;
              vx[j] += nx * push * area[i] * dt;
              vy[j] += ny * push * area[i] * dt;
            }
          }

          /* Coalescence. In contact the larger drop drains the smaller and
             takes its momentum with the pigment — the pair does not just look
             joined, it becomes one body with one velocity. */
          const contact = sum * 0.92;
          if (d < contact && lock < 0.02) {
            const o = 1 - d / contact;
            const big = area[i] >= area[j] ? i : j;
            const sml = big === i ? j : i;
            let give = TRANSFER * o * o * area[sml] * dt;
            if (give > area[sml]) give = area[sml];
            const tot = area[big] + give;
            vx[big] = (vx[big] * area[big] + vx[sml] * give) / tot;
            vy[big] = (vy[big] * area[big] + vy[sml] * give) / tot;
            area[big] = tot;
            area[sml] -= give;
          }
        }
      }

      /* ---- integrate, shape, birth and death ---- */
      let total = 0;
      let count = 0;

      for (let i = 0; i < N; i++) {
        if (alive[i] === 0) continue;

        let s2 = vx[i] * vx[i] + vy[i] * vy[i];
        if (s2 > MAX_SPEED * MAX_SPEED) {
          const k = MAX_SPEED / Math.sqrt(s2);
          vx[i] *= k;
          vy[i] *= k;
          s2 = MAX_SPEED * MAX_SPEED;
        }
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;

        /* Hard containment behind the soft walls. A backdrop that has quietly
           shoved its whole population off the edge is a blank canvas, and no
           amount of restoring force is a guarantee — this is. */
        if (px[i] < -0.25) {
          px[i] = -0.25;
          if (vx[i] < 0) vx[i] = 0;
        } else if (px[i] > aspect + 0.25) {
          px[i] = aspect + 0.25;
          if (vx[i] > 0) vx[i] = 0;
        }
        if (py[i] < -0.25) {
          py[i] = -0.25;
          if (vy[i] < 0) vy[i] = 0;
        } else if (py[i] > 1.25) {
          py[i] = 1.25;
          if (vy[i] > 0) vy[i] = 0;
        }

        if (fuse[i] > 0) fuse[i] -= dt;

        /* Stretch axis: own motion plus the page's motion. An ellipse axis is a
           line rather than a direction, so flip the target when it points the
           other way — otherwise the axis spins 180° instead of holding still. */
        let tx = vx[i] * 300;
        let ty = vy[i] * 300 + vel * 0.02;
        const m = Math.sqrt(tx * tx + ty * ty);
        if (m > 0.02) {
          tx /= m;
          ty /= m;
          if (tx * ax[i] + ty * ay[i] < 0) {
            tx = -tx;
            ty = -ty;
          }
          const bx = ax[i] + (tx - ax[i]) * 0.045 * dt;
          const by = ay[i] + (ty - ay[i]) * 0.045 * dt;
          const bm = Math.sqrt(bx * bx + by * by) || 1;
          ax[i] = bx / bm;
          ay[i] = by / bm;
        }

        // a droplet in flight is a droplet; one at rest relaxes back to a disc.
        // sus varies per drop so a hard scroll does not deform them in unison,
        // which would read as one rigid picture being pulled sideways.
        const own = Math.min(Math.sqrt(s2) / 0.0055, 1);
        const target = Math.min((0.34 * gs + 0.30 * own) * sus[i], 0.72);
        st[i] += (target - st[i]) * 0.05 * dt;

        /* Newborns soak outward rather than appearing. Strictly ONCE: a drop
           that kept topping itself back up to its target would refill faster
           than a neighbour could drain it, and nothing would ever finish
           merging. Retiring the target is what lets absorption complete. */
        if (aim[i] > 0) {
          if (area[i] >= aim[i]) aim[i] = 0;
          else area[i] = Math.min(aim[i], area[i] + GROW * dt);
        }

        // tearing: easier when the sheet is being dragged hard
        if (area[i] > A_SPLIT * (1 - 0.3 * gs) && fuse[i] <= 0) {
          const slot = dormantSlot(N - MAX_ACTIVE);
          if (slot >= 0) tear(i, slot);
          else if (area[i] > A_SPLIT * 1.7) area[i] = A_SPLIT * 1.7;
        }

        if (area[i] < A_DEAD) {
          kill(i);
          continue;
        }

        const f = (area[i] - A_DEAD) / (A_FADE - A_DEAD);
        const e = f < 0 ? 0 : f > 1 ? 1 : f;
        wt[i] = e * e * (3 - 2 * e);

        total += area[i];
        count++;
      }

      /* Total ink on the sheet is a soft constraint rather than a hard one:
         births and tears add, and this walks the whole population gently back
         toward the target instead of anyone visibly evaporating. */
      if (total > 1e-6) {
        const k = 1 + (A_TOTAL / total - 1) * 0.006 * dt;
        for (let i = 0; i < N; i++) if (alive[i] === 1) area[i] *= k;
      }

      if (count < WANT_ACTIVE) {
        for (let i = 0; i < N; i++) {
          if (alive[i] === 0 && wait[i] <= 0) {
            spawn(i, cx, cy);
            break;
          }
        }
      }
    }

    /* ----------------------------------------------------------- rendering */


    let raf = 0;
    let running = false;
    let visible = true;
    let last = 0;
    let lastDraw = 0;

    /* 2D only. See "why there is no shader here" at the top of this file. */
    let ctx2d: CanvasRenderingContext2D | null = canvas.getContext('2d', { alpha: true });
    let fieldCanvas: HTMLCanvasElement | null = null;
    let fieldCtx: CanvasRenderingContext2D | null = null;
    let fieldImg: ImageData | null = null;
    let fw = 0;
    let fh = 0;

    function stage() {
      for (let i = 0; i < N; i++) {
        const o = i * 4;
        const r = alive[i] === 1 ? Math.sqrt(area[i]) : 0.02;
        u0[o] = px[i];
        u0[o + 1] = py[i];
        u0[o + 2] = r < 0.02 ? 0.02 : r;
        u0[o + 3] = alive[i] === 1 ? wt[i] : 0;
        u1[o] = ax[i];
        u1[o + 1] = ay[i];
        u1[o + 2] = st[i];
        u1[o + 3] = 0;
      }
    }


    /* The same field, evaluated on the CPU at roughly a seventh of the linear
       resolution and then bilinearly upscaled by drawImage. Without fwidth
       there is no screen-space gradient, so the edge ramps are expressed in
       field units instead — sized so a mid-sized drop lands on about the same
       look, and the upscale smooths the rest into something wetter. A fallback,
       but a fallback in the same world. */
    function draw2D(inten: number) {
      if (!ctx2d || !fieldCtx || !fieldImg || !fieldCanvas) return;
      ctx2d.setTransform(1, 0, 0, 1, 0, 0);
      ctx2d.clearRect(0, 0, canvas!.width, canvas!.height);
      if (inten <= 0.002) return;

      if (colourDirty.current) {
        syncColours();
        colourDirty.current = false;
      }
      stage();

      const d = fieldImg.data;
      const invW = 1 / fw;
      const invH = 1 / fh;
      const T = threshold;
      let o = 0;

      for (let y = 0; y < fh; y++) {
        const uy = (y + 0.5) * invH;
        const ey = (uy - 0.5) * 1.45;
        for (let x = 0; x < fw; x++, o += 4) {
          const ux = (x + 0.5) * invW;
          const wx = ux * aspect;

          let f = 0;
          let lead = 0;
          let cr = 0;
          let cg = 0;
          let cb = 0;

          for (let i = 0; i < N; i++) {
            const k = i * 4;
            const bw = u0[k + 3];
            if (bw <= 0.001) continue;
            const dx = wx - u0[k];
            const dy = uy - u0[k + 1];
            const axi = u1[k];
            const ayi = u1[k + 1];
            const s = 1 + u1[k + 2];
            const uu = (dx * axi + dy * ayi) / s;
            const vv = (dx * -ayi + dy * axi) * s;
            const d2 = uu * uu + vv * vv;
            const r = u0[k + 2];
            const r2 = r * r;
            const win = 1 - d2 / (9 * r2);
            if (win <= 0) continue;
            const w = (bw * r2 * win * win) / (d2 + 0.05 * r2);
            f += w;
            if (w > lead) lead = w;
            const co = i * 3;
            cr += w * ucol[co];
            cg += w * ucol[co + 1];
            cb += w * ucol[co + 2];
          }

          if (f < 0.04) {
            d[o + 3] = 0;
            continue;
          }

          const over = f - T;
          const insideRaw = over / 0.12 + 0.5;
          const ins = insideRaw < 0 ? 0 : insideRaw > 1 ? 1 : insideRaw;
          const up = over > 0 ? over : 0;
          const dn = over < 0 ? -over : 0;
          const line = Math.exp(-up * 26);
          const bank = Math.exp(-up * 3.6);
          const halo = Math.exp(-dn * 5.5);

          const blend = f / (lead > 1e-5 ? lead : 1e-5);
          let nk = (blend - 1.1) / 0.7;
          nk = nk < 0 ? 0 : nk > 1 ? 1 : nk;
          nk *= ins;

          /*
           * THE NUMBERS THAT MADE THIS INVISIBLE.
           *
           * Body was 0.07 and rim 0.185, then multiplied by a 0.17 floor over
           * a wide central ellipse, then by the section intensity of 0.58. In
           * the middle of the frame that is a body alpha of SIX THOUSANDTHS.
           * Measured against the worlds Jack liked — Geometry peaks around
           * 0.36 effective, Scrapbook 0.27 — this was an order of magnitude
           * under all of them, which is the whole of "you can't see anything".
           *
           * The shape is unchanged and deliberate: the RIM carries the
           * drawing, because a tide mark is what ink leaves when it dries, and
           * the body stays light so type can sit over it. It is the level that
           * was wrong, not the design.
           */
          let a =
            ins * (0.22 * (1 + 0.8 * nk) + 0.55 * (0.55 * line + 0.62 * bank)) +
            (1 - ins) * halo * 0.075;

          const ex = (ux - 0.5) * aspect;
          const q = Math.sqrt(ex * ex + ey * ey);
          /* The physics already pushes drops out of the middle (CENTRE_F), so
             attenuating what little reaches it to 17% was charging twice for
             the same legibility. 0.40 over a slightly tighter ellipse. */
          let qt = (q - 0.10) / 0.34;
          qt = qt < 0 ? 0 : qt > 1 ? 1 : qt;
          a *= 0.4 + 0.6 * (qt * qt * (3 - 2 * qt));
          a *= inten;

          const inv = 1 / f;
          let pr = cr * inv;
          let pg = cg * inv;
          let pb = cb * inv;
          const mixIn = 0.28 * nk;
          pr += (inkRgb[0] - pr) * mixIn;
          pg += (inkRgb[1] - pg) * mixIn;
          pb += (inkRgb[2] - pb) * mixIn;
          const mixOut = 0.4 * (1 - ins);
          pr += (surfRgb[0] - pr) * mixOut;
          pg += (surfRgb[1] - pg) * mixOut;
          pb += (surfRgb[2] - pb) * mixOut;

          d[o] = pr * 255;
          d[o + 1] = pg * 255;
          d[o + 2] = pb * 255;
          d[o + 3] = (a > 1 ? 1 : a) * 255;
        }
      }

      fieldCtx.putImageData(fieldImg, 0, 0);
      ctx2d.imageSmoothingEnabled = true;
      ctx2d.drawImage(fieldCanvas, 0, 0, canvas!.width, canvas!.height);
    }

    function draw(inten: number) {
      draw2D(inten);
    }

    /* --------------------------------------------------------------- sizing */

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);

      let dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const budget = Math.sqrt(MAX_PIXELS / (w * h));
      if (budget < dpr) dpr = Math.max(0.75, budget);

      const pw = Math.max(1, Math.round(w * dpr));
      const ph = Math.max(1, Math.round(h * dpr));
      if (canvas!.width !== pw || canvas!.height !== ph) {
        canvas!.width = pw;
        canvas!.height = ph;
      }

      // world x spans 0..aspect, so a shape's proportions survive a resize if
      // its x coordinate is rescaled with the frame
      const na = w / h;
      if (placed && aspect > 0) {
        const k = na / aspect;
        for (let i = 0; i < N; i++) px[i] *= k;
      }
      aspect = na;
      cssW = w;
      pixelRatio = dpr;

      if (!placed) {
        const cx = aspect * 0.5;
        const cy = 0.45;
        for (let i = 0; i < WANT_ACTIVE; i++) {
          spawn(i, cx, cy);
          area[i] = A_BASE * (0.7 + rng() * 0.7);
        }
        for (let i = WANT_ACTIVE; i < N; i++) {
          reseed(i);
          alive[i] = 0;
          wait[i] = 60 + rng() * 240;
        }
        placed = true;
      }

      {
        const nw = Math.max(48, Math.min(200, Math.round(cssW / 7)));
        const nh = Math.max(32, Math.round(nw / Math.max(aspect, 0.05)));
        if (nw !== fw || nh !== fh) {
          fw = nw;
          fh = nh;
          if (!fieldCanvas) fieldCanvas = document.createElement('canvas');
          fieldCanvas.width = fw;
          fieldCanvas.height = fh;
          fieldCtx = fieldCanvas.getContext('2d');
          fieldImg = fieldCtx ? fieldCtx.createImageData(fw, fh) : null;
        }
      }
    }

    /** Run the simulation forward without drawing, so the drops are found in a
     *  configuration the physics agrees with rather than on a ring. Scroll is
     *  zeroed for the settle so a mount mid-flick does not bake in a lean. */
    function settle(frames: number) {
      const held = live.current.velocity;
      live.current.velocity = 0;
      for (let i = 0; i < frames; i++) {
        time += 1 / 60;
        step(1);
      }
      live.current.velocity = held;
    }

    /* ----------------------------------------------------------- the loop */

    function frame(now: number) {
      raf = requestAnimationFrame(frame);

      const ms = Math.min(now - last, 100);
      last = now;
      const dt = Math.max(0.2, ms / 16.667);
      time += ms / 1000;

      step(dt);

      // the CPU field is far too expensive at 60Hz; it looks the same at 30
      if (now - lastDraw < 30) return;
      lastDraw = now;
      draw(live.current.intensity);
    }

    function start() {
      if (running || reduced) return;
      running = true;
      last = performance.now();
      lastDraw = 0;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    }

    resize();
    settle(reduced ? 1400 : 320);

    /*
     * Dev-only handle. A pane that never composites never fires rAF and always
     * reports the canvas as non-intersecting, so without this there is no way
     * to drive a frame and find out what a world actually draws — which is how
     * this one came to be shipped invisible in the first place.
     */
    if (process.env.NODE_ENV !== 'production') {
      (canvas as unknown as Record<string, unknown>).__world = {
        name: 'fluid',
        frames: (n = 1, inten?: number) => {
          for (let i = 0; i < n; i++) {
            time += 1 / 60;
            step(1);
          }
          draw(inten ?? live.current.intensity);
        },
        info: () => {
          let live_ = 0;
          for (let i = 0; i < N; i++) if (alive[i] === 1) live_++;
          return { drops: live_, field: fw + 'x' + fh, aspect, threshold };
        }
      };
    }

    if (reduced) {
      // no resize() here: this runs on every intensity change, and a
      // getBoundingClientRect per scroll frame is a forced layout
      redrawStatic.current = draw;
      draw(live.current.intensity);
    }

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        if (visible && !document.hidden) start();
        else stop();
      },
      { threshold: 0.01 }
    );
    io.observe(canvas);

    function onVis() {
      if (document.hidden) stop();
      else if (visible) start();
    }
    document.addEventListener('visibilitychange', onVis);

    let resizeRaf = 0;
    function onResize() {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resize();
        if (reduced) draw(live.current.intensity);
      });
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);

    /* There is no `webglcontextlost` handler any more, because there is no
       context to lose. That is the point: a 2D canvas cannot be recycled out
       from under the page when some other world asks for a GPU context. */

    if (!reduced) start();

    return () => {
      stop();
      cancelAnimationFrame(resizeRaf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      redrawStatic.current = null;
      fieldCanvas = null;
      fieldCtx = null;
      fieldImg = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
      }}
    />
  );
}
