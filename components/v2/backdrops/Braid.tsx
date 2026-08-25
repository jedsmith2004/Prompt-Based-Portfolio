'use client';

/* ============================================================================
   Braid — WHAT RUNNING FOUR THINGS AT ONCE LOOKS LIKE.

   Jack, 2026-08-26: "The meta balls look awful, either replace it with some
   other creative effect or go look up other people's implementations."

   He is right, and the honest post-mortem is that Fluid was the wrong idea
   rather than a botched one. It was a good demo of an implicit surface and it
   said nothing whatsoever about the plate it was standing behind. This plate
   is CareerLine: four roles and a degree that do not queue up, they overlap.
   The whole argument of the page is that the studio was taking real clients
   while the dissertation was still open.

   So: strands that run the width of the page, cross, pass over and under each
   other, and never merge. That is the same sentence in a different medium.

   THE ONE IDEA THAT MAKES IT WORK.

   Drawing strand A then strand B gives you two crossing lines, not a braid.
   A braid needs each strand to pass IN FRONT at some crossings and BEHIND at
   others, and to keep doing so consistently along its whole length.

   Doing that with paths means solving for every intersection, splitting the
   curves, and sorting the fragments. Instead this rasterises in COLUMNS. For
   each column of the screen every strand knows two things there: where its
   centre is, and how deep it is. Sort the strands by depth in that column and
   draw them back to front, and the weave falls out for free — correct at every
   crossing, with no intersection ever computed, because a painter's sort one
   pixel column wide is exact.

   Depth is its own slow sine per strand, at a different frequency from the
   vertical one, so a strand rises and sinks independently of where it is on
   the screen. That is what stops the crossings from landing in a repeating
   pattern.

   WHY THE STRANDS LOOK LIKE CABLE AND NOT LIKE TAPE.

   Each one is a bundle of fibres running lengthwise, shaded across the bundle:
   bright along the upper third, dark under the lower edge. Lengthwise rather
   than cross-hatched because a fibre is continuous from column to column,
   which costs nothing to keep in step, whereas a hatch has a phase that has to
   be carried and looks like corduroy the moment it drifts.

   The occluding slab under each bundle is filled in SURFACE, which is the
   page's own paper, so a strand in front genuinely hides what is behind it.
   That is the only way the over-and-under reads at all.

   NOTHING IN THE FRAME LOOP ALLOCATES. The per-column ordering uses two
   preallocated arrays and an insertion sort, which for six items beats
   Array.prototype.sort and, more to the point, does not allocate a comparator
   result or a new array four hundred times a frame.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import type { BackdropProps } from './types';
import { toRgb, rgba, mulberry32 } from './types';

/* --- the weave ----------------------------------------------------------- */

/** Strands. Six reads as a braid; more reads as static. */
const STRANDS = 6;

/** Column width in CSS px. The unit of the painter's sort. */
const STEP = 3;

/** Fibres per strand. Odd, so one runs down the centre. */
const FIBRES = 7;

/** Half-thickness of a strand at depth 0, in CSS px. */
const HALF = 21;

/** How much depth swells and shrinks a strand. Cheap perspective. */
const DEPTH_SWELL = 0.3;

/** Vertical travel of a strand about its lane, as a fraction of lane pitch. */
const SWING = 0.92;

const MAX_COLS = 1400;

export default function Braid({
  intensity,
  progress,
  velocity,
  palette,
  className,
}: BackdropProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

    /* --- preallocation. Nothing past here allocates per frame. ----------- */

    /* Per strand, fixed for the life of the component. */
    const lane = new Float32Array(STRANDS);      // 0..1 resting height
    const vAmp = new Float32Array(STRANDS);      // vertical swing, px
    const vFreq = new Float32Array(STRANDS);     // cycles across the width
    const vPhase = new Float32Array(STRANDS);
    const dFreq = new Float32Array(STRANDS);     // depth cycles across the width
    const dPhase = new Float32Array(STRANDS);
    const drift = new Float32Array(STRANDS);     // rad/s the strand travels at
    const tint = new Int32Array(STRANDS);        // 0 ink, 1 ink2, 2 accent, 3 accent2

    /* Per column, rebuilt each frame. */
    const cy = new Float32Array(STRANDS);
    const cd = new Float32Array(STRANDS);
    const order = new Int32Array(STRANDS);

    const rnd = mulberry32(0x9e37);
    for (let i = 0; i < STRANDS; i++) {
      lane[i] = (i + 0.5) / STRANDS;
      vAmp[i] = 0.5 + rnd() * 0.5;
      vFreq[i] = 0.55 + rnd() * 0.85;
      vPhase[i] = rnd() * Math.PI * 2;
      /*
       * Depth frequency is deliberately NOT a neat ratio of the vertical one.
       * When they share a period every strand crosses at the same phase of its
       * own rise and the weave repeats, which reads as wallpaper. Adding an
       * irrational-ish offset keeps the crossings from ever lining up.
       */
      dFreq[i] = vFreq[i] * 0.61803 + 0.23 + rnd() * 0.3;
      dPhase[i] = rnd() * Math.PI * 2;
      drift[i] = (0.045 + rnd() * 0.055) * (rnd() < 0.5 ? -1 : 1);
      tint[i] = i === 1 ? 2 : i === 4 ? 3 : rnd() < 0.5 ? 0 : 1;
    }

    let cssW = 0;
    let cssH = 0;
    let cols = 0;
    let pitch = 0;
    let t = 0;
    let last = 0;
    let velSmooth = 0;
    let shear = 0;
    let raf = 0;
    let running = false;
    let visible = true;
    let clearedAtZero = false;

    function resize(): void {
      const r = canvas!.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cssW = w;
      cssH = h;
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.min(MAX_COLS, Math.ceil(w / STEP) + 1);
      /* Lane pitch: how much room each strand has before it is another
         strand's problem. The swing is a fraction of this, so six strands on
         a short viewport crowd rather than overlap into a single mass. */
      pitch = h / STRANDS;
      clearedAtZero = false;
    }

    /** rgb for a strand's tint. Returns into the shared triple, never allocates. */
    const tintScratch: [number, number, number] = [0, 0, 0];
    function tintOf(k: number): [number, number, number] {
      const src = k === 0 ? cInk : k === 1 ? cInk2 : k === 2 ? cAcc : cAcc2;
      tintScratch[0] = src[0];
      tintScratch[1] = src[1];
      tintScratch[2] = src[2];
      return tintScratch;
    }

    function render(time: number, prog: number, a0: number): void {
      const A = Math.max(0, Math.min(1, a0));

      if (A <= 0.001) {
        /* The contract: clear at zero, and only once, so a world fading out
           does not keep paying for a full-viewport clear every frame. */
        if (!clearedAtZero) {
          ctx!.clearRect(0, 0, cssW, cssH);
          clearedAtZero = true;
        }
        return;
      }
      clearedAtZero = false;
      ctx!.clearRect(0, 0, cssW, cssH);

      /* The braid slides sideways as the reader moves through the plate, so
         the crossings the reader sees at the top are not the ones at the
         bottom. `shear` adds the scroll gesture on top and springs back. */
      const slide = prog * 0.9 + time * 0.05;

      for (let c = 0; c < cols; c++) {
        const x = c * STEP;
        const u = cssW > 0 ? x / cssW : 0;

        /* --- where every strand is, in this column --- */
        for (let i = 0; i < STRANDS; i++) {
          const p = (u + slide + shear * 0.0006) * Math.PI * 2;
          cy[i] =
            lane[i] * cssH +
            Math.sin(p * vFreq[i] + vPhase[i] + time * drift[i] * 6) *
              vAmp[i] *
              pitch *
              SWING *
              0.5;
          cd[i] = Math.sin(p * dFreq[i] + dPhase[i] + time * drift[i] * 4.2);
          order[i] = i;
        }

        /* --- painter's sort, back to front. Insertion: six items. --- */
        for (let i = 1; i < STRANDS; i++) {
          const k = order[i];
          const kd = cd[k];
          let j = i - 1;
          while (j >= 0 && cd[order[j]] > kd) {
            order[j + 1] = order[j];
            j--;
          }
          order[j + 1] = k;
        }

        /* --- draw --- */
        for (let o = 0; o < STRANDS; o++) {
          const i = order[o];
          const d = cd[i];
          const half = HALF * (1 + d * DEPTH_SWELL);
          const y = cy[i];
          const top = y - half;

          /*
           * The occluder. Paper, at full alpha for the frontmost strands and
           * easing off for the ones at the back, so depth reads as air in
           * front of a thing rather than as a thing being drawn faint.
           */
          const solid = 0.72 + 0.28 * (d * 0.5 + 0.5);
          ctx!.fillStyle = rgba(cSurf, solid * A);
          ctx!.fillRect(x, top, STEP + 0.6, half * 2);

          const rgb = tintOf(tint[i]);
          /* Depth also buys contrast: something behind is further away and
             hazier, which is the cheapest depth cue there is. */
          const near = 0.55 + 0.45 * (d * 0.5 + 0.5);

          for (let f = 0; f < FIBRES; f++) {
            const s = FIBRES > 1 ? f / (FIBRES - 1) : 0.5; // 0 top, 1 bottom
            const fy = top + s * half * 2;
            /*
             * Shading across the bundle. Bright along the upper third and
             * heavy under the lower edge: one light source, above and behind
             * the reader, consistent for every strand on the screen. Without
             * this the bundle is a stack of parallel lines and reads flat.
             */
            const lit = Math.cos((s - 0.34) * Math.PI * 1.35);
            const shade = 0.2 + 0.72 * Math.max(0, 1 - lit * lit * 1.05);
            ctx!.fillStyle = rgba(rgb, shade * near * A);
            ctx!.fillRect(x, fy - 0.7, STEP + 0.6, 1.4);
          }

          /* Both edges, so a strand has a silhouette even where it crosses
             another of the same tint. */
          ctx!.fillStyle = rgba(rgb, 0.62 * near * A);
          ctx!.fillRect(x, top - 0.5, STEP + 0.6, 1.1);
          ctx!.fillStyle = rgba(rgb, 0.86 * near * A);
          ctx!.fillRect(x, top + half * 2 - 0.6, STEP + 0.6, 1.2);
        }
      }
    }

    function frame(now: number): void {
      raf = requestAnimationFrame(frame);
      const dt = last === 0 ? 0.016 : Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;

      const v = velocityRef.current;
      velSmooth += (v - velSmooth) * 0.08;
      shear += velSmooth * 0.6;
      shear *= 0.93; // springs back, so a flick shifts the weave and it settles

      render(t, progressRef.current, intensityRef.current);
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

    function drawStill(): void {
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
        name: 'braid',
        frames: (n = 1) => {
          resize();
          for (let i = 0; i < n; i++) frame(i * 16.667);
          cancelAnimationFrame(raf);
          raf = 0;
        },
      };
    }

    return () => {
      stop();
      staticDrawRef.current = null;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [surface, ink, ink2, accent, accent2, reduced]);

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
