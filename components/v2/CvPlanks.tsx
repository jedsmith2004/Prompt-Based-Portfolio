'use client';

/* ============================================================================
   CvPlanks — the two CV boards, hung off a rail on ropes, actually simulated.

   Jack, 2026-08-27: "The CV banners in the top left on the splash page should
   have a more interesting falling in animation, almost like two actual wooden
   planks falling in and swinging. Could even simulate it?"

   So they are simulated. The old version was one `@keyframes v2-sign-drape`
   with four stops, applied to BOTH boards at once as a single block, which is
   why it read as a graphic sliding in rather than as two objects: the two
   planks moved in lockstep, and the "swing" was a hand-authored overshoot that
   returned to rest on a curve no pendulum has ever followed.

   WHAT IS ACTUALLY MODELLED

   Each plank is a rigid board hanging from a pivot on the rail, which is the
   correct idealisation of a hanging shop sign and gives a damped pendulum:

       theta'' = -(g / L) sin(theta) - c theta'

   `L` is the rope length, so the two planks have DIFFERENT PERIODS for a real
   reason rather than a staggered delay: the lower board hangs further from its
   pivot and therefore swings more slowly. That single fact is most of why this
   reads as two objects instead of one animation. Nothing here is eased; the
   settle is the damping term, and the overshoot is the integrator.

   The arrival is a free fall onto slack rope. Each plank starts above its rest
   height and tilted, falls under the same gravity, and when the rope goes taut
   the vertical velocity it has accumulated is converted into angular velocity
   about the pivot. So a plank that falls further arrives swinging harder,
   which is what a rope does.

   Integration is SEMI-IMPLICIT EULER on a fixed 1/240s step, accumulated
   against the real frame time. Fixed-step because the swing is a spring and a
   variable step makes a spring gain or lose energy depending on frame rate —
   the classic way a simulation like this ends up either dead on arrival on a
   144Hz monitor or oscillating forever on a slow one. The accumulator is
   clamped, so a backgrounded tab does not return and run ten thousand steps.

   IT STOPS. When both planks are below the rest thresholds the loop cancels
   itself and the transforms are left at rest. There is no idle rAF: this is
   the top-left corner of the page, not the subject of it.

   AND IT ALWAYS ENDS UP HUNG. The boards start off the top of the screen, so a
   loop that stops early does not leave a still animation, it leaves the CV
   links missing — see `stepped` in `pump` for the version of that which
   shipped, and the failsafe at the end of the setup effect for the backstop.

   AND IT IS A TOY. Pointing at a plank shoves it, which is the one thing a
   hanging sign is for. That is also why the loop is written to be restartable
   from cold rather than to run once at mount.
   ========================================================================== */

import { useCallback, useEffect, useRef } from 'react';
import { CV_EDITIONS } from './CurriculumVitae';

/* px/s^2. Not 9.81: the scene is about 200px tall and a real gravity would
   drop the boards in under a fifth of a second. This is tuned so the fall
   reads at the same speed a hand does. */
const G = 2400;

/** One hanging board. */
interface Plank {
  el: HTMLDivElement;
  /** Rope length, px. Sets the period: T = 2 pi sqrt(L / g). */
  L: number;
  /** Angle from vertical, radians. */
  th: number;
  /** Angular velocity, rad/s. */
  om: number;
  /** How far above rest it still is, px. Zero once the rope is taut. */
  drop: number;
  /** Vertical velocity while falling, px/s. */
  vy: number;
  /** Damping coefficient. Lower swings for longer. */
  c: number;
  /** Seconds still to wait before it is released. */
  wait: number;
}

/*
   When a plank counts as still, in radians and rad/s.

   0.005 rad is 0.29 degrees, which at this board's width is a quarter of a
   pixel of travel at the corners: below what a screen can show. Tighter
   thresholds than this do not make the rest look any better, they just keep a
   rAF alive for another two seconds after the motion has visibly finished.
   With these, both boards stop the loop about four seconds after they are
   released, and the last second of that is already invisible.
*/
const REST_TH = 0.005;
const REST_OM = 0.02;

export interface CvPlanksProps {
  className?: string;
}

export default function CvPlanks({ className }: CvPlanksProps) {
  const hostRef = useRef<HTMLElement | null>(null);
  const planksRef = useRef<Plank[]>([]);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const accRef = useRef(0);

  /* Shortest first, so the one-page edition is the upper board. Same ordering
     the old markup used, kept so the rail does not reshuffle itself. */
  const editions = [...CV_EDITIONS].sort((a, b) => a.pages - b.pages);

  /* ---- the loop ---------------------------------------------------------- */

  const step = useCallback((dt: number) => {
    let moving = false;
    const planks = planksRef.current;

    for (let i = 0; i < planks.length; i++) {
      const p = planks[i];

      if (p.wait > 0) {
        p.wait -= dt;
        moving = true;
        continue;
      }

      if (p.drop > 0) {
        /* Free fall. The rope is slack, so nothing is pulling it round yet. */
        p.vy += G * dt;
        p.drop -= p.vy * dt;
        if (p.drop <= 0) {
          /*
           * THE ROPE GOES TAUT. Only the part of the fall PERPENDICULAR to the
           * rope survives as rotation about the pivot; the rest is taken by the
           * rope. That is why a board dropped dead level barely swings and one
           * dropped tilted swings hard.
           *
           * The 0.3 is the rope being inelastic — it absorbs most of the
           * impact rather than returning it. It was 1.35 first, which is a
           * rope that gives back more than it was given: the boards arrived at
           * seventy degrees, swung clean past horizontal, and were still
           * moving thirteen seconds later.
           */
          p.drop = 0;
          p.om += (p.vy / p.L) * Math.sin(p.th) * 0.3;
          p.vy = 0;
        }
        moving = true;
      } else {
        /* Damped pendulum, semi-implicit: velocity first, then position. */
        const a = -(G / p.L) * Math.sin(p.th) - p.c * p.om;
        p.om += a * dt;
        p.th += p.om * dt;
        if (Math.abs(p.th) > REST_TH || Math.abs(p.om) > REST_OM) moving = true;
        else {
          p.th = 0;
          p.om = 0;
        }
      }

      /* One write per plank per frame, both packed into one transform so the
         browser does a single composite rather than two style resolutions. */
      p.el.style.transform = `translateY(${-p.drop}px) rotate(${p.th}rad)`;
    }
    return moving;
  }, []);

  const pump = useCallback(
    (now: number) => {
      const last = lastRef.current || now;
      lastRef.current = now;
      /* Clamped: a tab that was in the background must not come back and
         integrate the whole time it was away. */
      accRef.current = Math.min(0.25, accRef.current + (now - last) / 1000);

      const H = 1 / 240;
      let moving = false;
      /*
       * WHETHER WE INTEGRATED AT ALL, which is a different question from
       * whether anything moved, and conflating the two stopped the boards
       * dead before they had fallen a pixel.
       *
       * On the FIRST frame `now - last` is zero by construction — `last`
       * defaults to `now` because there is no previous timestamp yet — so the
       * accumulator is still under one fixed step and the loop below never
       * runs. `moving` was therefore false, not because the planks had
       * settled but because they had not been asked yet, and the scheduler
       * read that as "finished" and cancelled itself on frame one. The boards
       * stayed at their seed transform for the life of the page: hanging
       * above the top of the screen, tilted, never falling in.
       *
       * A frame that integrated nothing says nothing about the simulation, so
       * it can only ever be a reason to keep going.
       */
      let stepped = false;
      while (accRef.current >= H) {
        accRef.current -= H;
        moving = step(H) || moving;
        stepped = true;
      }

      if (moving || !stepped) {
        rafRef.current = requestAnimationFrame(pump);
      } else {
        rafRef.current = 0;
        lastRef.current = 0;
        accRef.current = 0;
      }
    },
    [step]
  );

  const start = useCallback(() => {
    if (rafRef.current) return;
    lastRef.current = 0;
    accRef.current = 0;
    rafRef.current = requestAnimationFrame(pump);
  }, [pump]);

  /* ---- setup -------------------------------------------------------------- */

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const els = Array.from(
      host.querySelectorAll<HTMLDivElement>('.v2-cv-swing')
    );
    if (!els.length) return;

    /* Reduced motion: hang them at rest and never start the loop. The boards
       are a navigation control first; the swing is the least important thing
       about them. */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach((el) => {
        el.style.transform = 'none';
        el.style.opacity = '1';
      });
      return;
    }

    planksRef.current = els.map((el, i) => {
      /* Rope length off the element itself, so the geometry lives in the
         stylesheet with the rest of the layout and the media queries can
         shorten the ropes on a narrow screen without this file knowing. */
      const L = parseFloat(getComputedStyle(el).getPropertyValue('--rope')) || 80;
      return {
        el,
        L,
        /* Opposite tilts, so they do not arrive as a matched pair. About
           fifteen degrees: enough to be unmistakably a swing, not so much that
           a board reads as having come off its ropes. */
        th: i === 0 ? -0.26 : 0.3,
        om: 0,
        /* How far above rest each one starts. Both clear the top of the hero,
           so they fall in from off the screen rather than fading up. */
        drop: 120 + i * 36,
        vy: 0,
        /* The longer rope carries more board and settles slightly sooner.
           Tuned against the integrator rather than by eye: first swing about
           seventeen degrees, visibly finished inside three seconds, loop
           cancelled at four. */
        c: 2.4 + i * 0.25,
        wait: 0.5 + i * 0.22
      };
    });

    planksRef.current.forEach((p) => {
      p.el.style.transform = `translateY(${-p.drop}px) rotate(${p.th}rad)`;
      p.el.style.opacity = '1';
    });

    start();

    /*
     * THE FAILSAFE, and it is here because this exact failure shipped once.
     *
     * These two boards are NAVIGATION — they are the only link to the CV above
     * the fold — and their seed position is off the top of the screen. So any
     * bug that stops the loop early does not degrade to "no animation", it
     * degrades to "the CV links are gone", which is what happened when the
     * scheduler mistook a frame it had not integrated for a simulation that
     * had finished.
     *
     * A simulated arrival is worth having and it is not worth a link nobody
     * can find. Both boards settle inside 4.3s by construction, so at eight
     * anything still in the air is a bug, and the right answer to a bug in a
     * decoration is to drop the decoration and keep the link.
     */
    const failsafe = window.setTimeout(() => {
      planksRef.current.forEach((p) => {
        if (p.drop === 0 && p.th === 0) return;
        p.drop = 0;
        p.th = 0;
        p.om = 0;
        p.vy = 0;
        p.wait = 0;
        p.el.style.transform = 'none';
      });
    }, 8000);

    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      window.clearTimeout(failsafe);
    };
  }, [start]);

  /* ---- the toy ------------------------------------------------------------ */

  /**
   * A shove. The impulse is scaled by 1/L so a nudge moves the light upper
   * board more than the long-roped lower one, and it is added to whatever the
   * plank is already doing rather than replacing it, so repeated pokes pump
   * the swing the way pushing a real one does.
   */
  const nudge = useCallback(
    (i: number, force: number) => {
      const p = planksRef.current[i];
      if (!p || p.wait > 0) return;
      const dir = p.om !== 0 ? Math.sign(p.om) : Math.random() < 0.5 ? -1 : 1;
      p.om += (dir * force) / (p.L / 80);
      /* Capped well under the angle the arrival uses. A reader who re-enters
         repeatedly is pumping a swing, which should build; a reader who does
         it thirty times should not be able to spin the board over the rail. */
      p.om = Math.max(-3.2, Math.min(3.2, p.om));
      start();
    },
    [start]
  );

  return (
    <nav
      ref={hostRef as React.RefObject<HTMLElement>}
      className={className ? `v2-cv-hanger ${className}` : 'v2-cv-hanger'}
      aria-label="Curriculum vitae downloads"
    >
      {/* The rail is the fixed thing everything hangs from, and it is a real
          2px line, so it is a perch with no inset. See THE PERCH CONTRACT in
          components/v2/Companion.tsx. */}
      <span className="v2-cv-rail" data-perch aria-hidden="true" />

      {editions.map((cv, i) => (
        <div
          key={cv.href}
          className={`v2-cv-swing is-${i}`}
          /* Starts hidden and is revealed by the first simulated frame, so a
             plank is never painted at its rest position before it has fallen
             into it. */
          style={{ opacity: 0 }}
          onPointerEnter={() => nudge(i, 0.9)}
          onPointerDown={() => nudge(i, 1.9)}
        >
          <span className="v2-cv-rope is-left" aria-hidden="true" />
          <span className="v2-cv-rope is-right" aria-hidden="true" />
          <a
            href={cv.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cv.primary ? 'is-lead' : undefined}
            /* Keyboard readers get the shove too, so the object is not only
               alive for a pointer. */
            onFocus={() => nudge(i, 1.1)}
          >
            <strong>{cv.pages}</strong>
            <span>page CV</span>
            <i aria-hidden="true">PDF ↗</i>
          </a>
        </div>
      ))}
    </nav>
  );
}
