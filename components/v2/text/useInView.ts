'use client';

/* ============================================================================
   useInView — one observer contract, shared by every text effect.

   Every effect in this folder plays ONCE, when the words are actually on
   screen, and never again. That is the whole reason this hook exists rather
   than each component rolling its own IntersectionObserver: a page that runs
   a particle field, a backdrop world and a bird cannot also afford a dozen
   observers with a dozen different thresholds re-firing on every scroll.

   TWO RULES THAT ARE NOT NEGOTIABLE.

   Reduced motion resolves TRUE IMMEDIATELY and skips the observer entirely.
   Every consumer treats `true` as "you are finished", so a reader who has
   asked for no motion gets the final text on the first paint with no
   animation frame spent anywhere.

   The observer DISCONNECTS on the first hit. These are entrances, not scroll
   scrubs; nothing here needs to know when the words leave again.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';

export interface InViewOptions {
  /** Fraction of the element that must be visible. */
  threshold?: number;
  /** Passed straight to the observer. Negative bottom delays the trigger. */
  rootMargin?: string;
  /** Skip the observer and never resolve. For effects behind a prop. */
  disabled?: boolean;
}

/**
 * `{ ref, seen }`. `seen` flips true once and stays true.
 *
 * `prefersReduced` is reported separately because several effects want to
 * render a different TREE rather than the same tree instantly: a split-flap
 * board with no motion should be a plain string, not forty stacked cards
 * holding their final letters.
 */
export function useInView<T extends HTMLElement>(opts: InViewOptions = {}) {
  const { threshold = 0.25, rootMargin = '0px 0px -8% 0px', disabled = false } = opts;
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReduced(true);
      setSeen(true);
      return;
    }

    /* Already on screen at mount: the observer would still fire, but a frame
       later, and the hero's effects are the ones a reader is looking at on
       the first paint. Ask directly. */
    const box = el.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) {
      setSeen(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, rootMargin, disabled]);

  return { ref, seen, reduced };
}

/**
 * A frame loop that runs for `ms` and then stops, handing progress 0..1 to
 * `onFrame`. Returns nothing; cancel by unmounting or by flipping `run`.
 *
 * Shared because five of these effects are the same three lines of rAF
 * bookkeeping with a different body, and getting the cancel wrong in five
 * places is how a page ends up with orphan loops after a route change.
 */
export function useTimedFrames(
  run: boolean,
  ms: number,
  onFrame: (t: number) => void,
  deps: unknown[] = []
) {
  const cb = useRef(onFrame);
  cb.current = onFrame;

  useEffect(() => {
    if (!run) return;
    let raf = 0;
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / ms);
      cb.current(t);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [run, ms, ...deps]);
}
