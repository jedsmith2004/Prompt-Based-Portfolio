'use client';

/* ============================================================================
   useNarrow — one answer to "is this a phone", shared by everything that has
   to give a different answer there.

   The stylesheet has had a 760px breakpoint since the rail was built, and by
   now four separate things need the SAME boundary in JavaScript rather than in
   CSS, because what changes at that width is not presentation:

     - the ink field paints a different ridgeline (lib/v2/shapes.ts)
     - the polaroid shelf carries three photographs instead of six
     - the bird flies to the top of the screen to be talked to
     - the section index becomes a sheet you open rather than a rail

   None of those are reachable from a media query, and four components each
   calling `matchMedia` with a number typed out by hand is four chances for one
   of them to disagree with the stylesheet. NARROW is that number, once.

   WHY matchMedia AND NOT innerWidth. A resize listener on `innerWidth` fires
   on every intermediate pixel of a drag and on every mobile-browser toolbar
   collapse; `matchMedia` fires only when the answer actually changes, which is
   also the only time any caller wants to hear about it.

   WHY IT STARTS false. This renders on the server, where there is no viewport
   at all. Returning `false` until the first effect means the phone paints one
   frame of the desktop dressing and then corrects, which is the right way
   round: the alternative is guessing `true` and making every desktop reader
   pay for a frame of the phone's. The effect runs before paint in practice,
   so neither is usually visible — but only one of them is safe to be wrong.
   ========================================================================== */

import { useEffect, useState } from 'react';

/**
 * The narrow breakpoint, in pixels. Must agree with the `max-width: 760px`
 * blocks in app/v2.css — the rail collapses there, and everything below keys
 * off the same moment.
 */
export const NARROW = 760;

/**
 * True when the viewport is at or below the narrow breakpoint.
 *
 * @param maxWidth  breakpoint in px. Defaults to NARROW.
 */
export function useNarrow(maxWidth: number = NARROW): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const read = () => setNarrow(mq.matches);
    read();
    /* addEventListener on a MediaQueryList is the modern spelling; Safari
       carried only addListener until 14, and the site is not worth breaking
       over a fallback this short. */
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', read);
      return () => mq.removeEventListener('change', read);
    }
    mq.addListener(read);
    return () => mq.removeListener(read);
  }, [maxWidth]);

  return narrow;
}

/**
 * True on a device whose primary pointer cannot hover — a phone or a tablet,
 * as opposed to a narrow desktop window.
 *
 * Distinct from `useNarrow` on purpose. Width decides what LAYOUT a plate
 * gets; pointer type decides whether a hover affordance can exist at all. A
 * desktop window dragged to 400px still has a mouse and should keep the
 * cursor; an iPad at 1024px has no mouse and should not.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(hover: none), (pointer: coarse)');
    const read = () => setCoarse(mq.matches);
    read();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', read);
      return () => mq.removeEventListener('change', read);
    }
    mq.addListener(read);
    return () => mq.removeListener(read);
  }, []);

  return coarse;
}
