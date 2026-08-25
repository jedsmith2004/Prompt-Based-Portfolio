'use client';

/* ============================================================================
   useSpine — the page's scroll nervous system.

   One rAF loop, one IntersectionObserver. Everything that needs to know about
   scroll (the ink field's current silhouette, the companion's dive/ride
   reflexes, the section nav) reads from here rather than attaching its own
   listener, so we never pay for the same work twice.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';

export interface SpineState {
  /** id of the section currently occupying the reading position */
  active: string;
  /** 0..1 progress through the whole document */
  progress: number;
  /** smoothed px/frame scroll velocity; negative is upward */
  velocity: number;
}

export interface SpineHandle extends SpineState {
  /** Live velocity without triggering a React render. Read inside rAF loops. */
  velocityRef: React.MutableRefObject<number>;
  /** Live progress without triggering a render. */
  progressRef: React.MutableRefObject<number>;
}

/**
 * Observes the given section ids and reports which one is being read.
 *
 * `active` and `progress` are throttled to meaningful changes so they do not
 * re-render on every frame. Anything that genuinely needs per-frame values
 * should read the refs instead.
 */
export function useSpine(ids: string[]): SpineHandle {
  const [active, setActive] = useState(ids[0] ?? '');
  const [progress, setProgress] = useState(0);
  const [velocity, setVelocity] = useState(0);

  const velocityRef = useRef(0);
  const progressRef = useRef(0);
  const lastYRef = useRef(0);
  const idsKey = ids.join('|');

  /* --- which section is being read --------------------------------------- */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (!els.length) return;

    /* Track visibility ratios ourselves rather than trusting entry order:
       IntersectionObserver callbacks only carry the entries that changed. */
    const ratios = new Map<string, number>();

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          ratios.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        }
        let bestId = '';
        let best = -1;
        ratios.forEach((r, id) => {
          if (r > best) { best = r; bestId = id; }
        });
        if (bestId && best > 0) {
          setActive((prev) => (prev === bestId ? prev : bestId));
        }
      },
      {
        /* the reading position sits a little above centre */
        rootMargin: '-20% 0px -45% 0px',
        threshold: [0, 0.15, 0.35, 0.6, 0.85, 1]
      }
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- velocity and progress --------------------------------------------- */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let raf = 0;
    let running = true;
    let publishAcc = 0;
    lastYRef.current = window.scrollY;

    const tick = () => {
      if (!running) return;
      const y = window.scrollY;
      const raw = y - lastYRef.current;
      lastYRef.current = y;

      /* critically damped enough to be usable as a gesture signal */
      velocityRef.current += (raw - velocityRef.current) * 0.24;
      if (Math.abs(velocityRef.current) < 0.02) velocityRef.current = 0;

      const max = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight
      );
      progressRef.current = Math.min(1, Math.max(0, y / max));

      /* publish to React sparingly: 6 times a second is plenty for UI */
      publishAcc++;
      if (publishAcc >= 10) {
        publishAcc = 0;
        const v = Math.round(velocityRef.current * 10) / 10;
        const p = Math.round(progressRef.current * 200) / 200;
        setVelocity((prev) => (prev === v ? prev : v));
        setProgress((prev) => (prev === p ? prev : p));
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    const onVis = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
        velocityRef.current = 0;
      } else if (!running) {
        running = true;
        lastYRef.current = window.scrollY;
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return { active, progress, velocity, velocityRef, progressRef };
}

/**
 * Smoothly scrolls to a section, respecting reduced-motion.
 */
export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}
