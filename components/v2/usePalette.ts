'use client';

/* ============================================================================
   usePalette — drives the page's colour tokens from the active section.

   Writes the sixteen palette custom properties onto <html>, and the ground
   colour onto <body>.

   THOSE TWO WRITES ARE NOT AT THE SAME TIME, AND THAT IS THE WHOLE DESIGN.
   The tokens used to be transitioned by the stylesheet; they are not any
   more, because animating an inherited registered property re-resolves every
   element that inherits it on every frame -- 944ms of style recalc per plate
   change, measured, and the page changes plate nine times. See THE MOVE IS ON
   THE GROUND in v2.css for the numbers.

   So the ground moves, over 940ms, on one non-inherited property on one
   element, which is free. The tokens cut, once, at the halfway point of that
   move, where the ground is passing between the two papers and the swap is
   least visible. One style recalc per plate change instead of fifty-six.

   WHY <html> AND NOT A WRAPPER. The tokens have to reach the fixed layers too
   — the nav rail, the companion, the backdrop worlds — and those are siblings
   of the content, not children of it. :root is the only element that is an
   ancestor of everything.

   The class is added rather than assumed so that the transition only ever
   applies once JS is running. Without it, the very first palette write would
   animate from the stylesheet's initial values, and the page would fade up
   from the base sheet on load, which looks like a flash of unstyled content
   rather than a deliberate move.
   ========================================================================== */

import { useEffect, useRef } from 'react';
import {
  BASE_PALETTE,
  PALETTE_VARS,
  PLATES,
  paletteForSection,
  plateFor,
  type PaletteMode,
  type SectionPalette
} from '@/lib/v2/palettes';
import { publishPalette } from '@/lib/v2/paletteWatch';

const DRIVEN_CLASS = 'v2-palette-driven';
const MODE_TRANSITION_CLASS = 'v2-mode-transition';
const MODE_VIEW_TRANSITION_CLASS = 'v2-mode-view-transition';
const MODE_TRANSITION_MS = 680;

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<unknown> };
};

/**
 * How far into the ground's travel the tokens cut, ms.
 *
 * Half of the 940ms `--ground` transition in v2.css. At that instant the
 * ground is midway between the outgoing and incoming paper, so the old ink and
 * the new ink read at about the same contrast against it and neither is wrong
 * on the way past. Set to 0 to put the old simultaneous change back.
 */
const CUT_MS = 470;

/**
 * Applies the palette belonging to `activeId`, in the form `mode` asks for.
 *
 * MODE IS A SEPARATE ARGUMENT AND NOT READ OFF THE PLATE. During a light
 * switch the page is deliberately rendering a plate in the form it does not
 * settle in, for as long as the bird takes to reach the cord. See useMode.ts.
 *
 * Returns the palette actually applied, so a caller that needs the same
 * colours in canvas-space (the backdrops do) reads them from here rather than
 * from `getComputedStyle`, which during a transition would hand back a
 * half-interpolated value.
 */
export function usePalette(activeId: string, mode: PaletteMode): SectionPalette {
  const palette = paletteForSection(activeId, mode);
  const plateId = plateFor(activeId).id;
  const previousModeRef = useRef(mode);

  /*
   * The ground leaves now; the tokens follow at the crossover.
   *
   * `--ground` is written first and unconditionally, because it is the thing
   * that is actually animating and every frame it is late is a frame of the
   * move that never happens.
   */
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const modeChanged = previousModeRef.current !== mode;
    previousModeRef.current = mode;

    const applyTokens = () => {
      /*
       * PUBLISHED BEFORE IT IS WRITTEN.
       *
       * Every canvas figure on the page used to answer the resulting mutation
       * by going back to `getComputedStyle(root)` for these same sixteen
       * strings -- 82 property reads across 19 acquisitions, per toggle -- and
       * because the tokens are registered `@property` with `inherits: true`,
       * the first of those reads forces a full-document style recalculation.
       * That recalc is the 110ms written down further up v2.css, and it was
       * being dragged into a mutation callback where it blocks. See
       * lib/v2/paletteWatch.ts.
       */
      const snapshot: Record<string, string> = {};
      for (const [key, prop] of PALETTE_VARS) snapshot[prop] = String(palette[key]);
      publishPalette(snapshot);

      for (const [key, prop] of PALETTE_VARS) {
        root.style.setProperty(prop, String(palette[key]));
      }
      root.dataset.v2Palette = plateId;
      root.dataset.v2Mode = palette.dark ? 'dark' : 'light';
      root.dataset.v2Theme = palette.dark ? 'dark' : 'light';
      /* Kept as well as data-v2-mode: several components and the whole of the
         projects page already branch on this attribute, and renaming it would
         be a silent visual regression in every one of them. */
      root.dataset.v2PaletteDark = palette.dark ? 'true' : 'false';
    };

    /*
     * THREE CASES WHERE THERE IS NO MOVE TO HIDE THE CUT IN, and delaying it
     * would just be half a second of the wrong ink:
     *
     *   - the first write, before the transition has been armed at all (see
     *     the effect below). The opening palette is not a change.
     *   - reduced motion, where v2.css has already removed the ground's
     *     transition. Someone who asked for less motion did not ask to read
     *     the old palette for another 470ms.
     *   - a hidden tab, where the transition will not run and setTimeout is
     *     throttled to whole seconds. A tab brought back to the front must
     *     already be in the right key.
     */
    const settled =
      !root.classList.contains(DRIVEN_CLASS) ||
      document.hidden ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (modeChanged && !settled) {
      /* The dial has reached its horizon. Modern browsers cross-fade snapshots
         on the compositor, so the whole page changes smoothly without asking
         every inheriting element to recalculate sixteen colours every frame. */
      const viewDocument = document as ViewTransitionDocument;
      if (viewDocument.startViewTransition) {
        root.classList.add(MODE_VIEW_TRANSITION_CLASS);
        const transition = viewDocument.startViewTransition(() => {
          body.style.setProperty('--ground', String(palette.paper));
          applyTokens();
        });
        void transition.finished.finally(() => {
          root.classList.remove(MODE_VIEW_TRANSITION_CLASS);
        });
        return;
      }

      /* Registered-property interpolation is the graceful fallback. */
      root.classList.add(MODE_TRANSITION_CLASS);
      void root.offsetWidth;
      body.style.setProperty('--ground', String(palette.paper));
      applyTokens();
      const t = window.setTimeout(
        () => root.classList.remove(MODE_TRANSITION_CLASS),
        MODE_TRANSITION_MS
      );
      return () => {
        window.clearTimeout(t);
        root.classList.remove(MODE_TRANSITION_CLASS);
      };
    }

    body.style.setProperty('--ground', String(palette.paper));
    if (settled || CUT_MS <= 0) {
      applyTokens();
      return;
    }

    /* A reader who outruns the cut gets the next plate's, not a queue of
       them: the cleanup cancels a pending cut before the next one is set. */
    const t = window.setTimeout(applyTokens, CUT_MS);
    return () => window.clearTimeout(t);
  }, [mode, palette, plateId]);

  /*
   * Arm the transition, once, and hand everything back on unmount.
   *
   * THIS IS DELIBERATELY A SEPARATE EFFECT WITH NO DEPENDENCIES, and the
   * reason is a bug that was live for one commit. The class used to be armed
   * inside the effect above, guarded by a ref that recorded whether a palette
   * had already been written. Under React's development double-invoke that is
   * fatal: mount writes the tokens and schedules the class, the immediate
   * cleanup cancels the schedule, and on the second mount the ref has survived
   * and says the first write already happened, so nothing ever arms it again.
   * The palette changed by snapping, in dev, forever.
   *
   * Split in two, the ordering that matters still holds for free: the token
   * write above is synchronous and this is deferred, so the opening palette is
   * always painted before the transition exists to animate it. No ref, nothing
   * to get out of step, and StrictMode's cleanup-then-remount is just an
   * arm/disarm/arm.
   *
   * A timeout rather than requestAnimationFrame, because rAF does not fire in
   * a hidden or backgrounded tab, and a page opened in one would otherwise
   * never transition for the rest of its life.
   */
  useEffect(() => {
    const root = document.documentElement;
    const t = window.setTimeout(() => root.classList.add(DRIVEN_CLASS), 0);
    return () => {
      window.clearTimeout(t);
      root.classList.remove(DRIVEN_CLASS);
      root.classList.remove(MODE_TRANSITION_CLASS);
      root.classList.remove(MODE_VIEW_TRANSITION_CLASS);
      document.body.style.removeProperty('--ground');
      /* Before the tokens go, and for the same reason they go: whatever reads
         the palette after this must read the document, not this page. */
      publishPalette(null);
      for (const [, prop] of PALETTE_VARS) root.style.removeProperty(prop);
      delete root.dataset.v2Palette;
      delete root.dataset.v2Mode;
      delete root.dataset.v2Theme;
      delete root.dataset.v2PaletteDark;
    };
  }, []);

  /*
   * Dev handle. There is no other way to look at a plate's palette here:
   * `activeId` comes from an IntersectionObserver that never fires in a pane
   * with no viewport, so eight of the nine plates are unreachable. Writes the
   * tokens by the same path the hook does, so what it produces is what the
   * reader would get.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as any).__v2Palette = {
      ids: () => PLATES.map((p) => ({ id: p.id, name: p.name, mode: p.mode })),
      apply: (id: string, m: PaletteMode) => {
        const pal = paletteForSection(id, m);
        const root = document.documentElement;
        document.body.style.setProperty('--ground', String(pal.paper));
        /* By the same path the hook uses, publication included -- otherwise a
           figure reading the snapshot after this gets the last plate the hook
           published and the handle silently measures the wrong plate. */
        const snapshot: Record<string, string> = {};
        for (const [key, prop] of PALETTE_VARS) snapshot[prop] = String(pal[key]);
        publishPalette(snapshot);
        for (const [key, prop] of PALETTE_VARS) {
          root.style.setProperty(prop, String(pal[key]));
        }
        root.dataset.v2Palette = id;
        root.dataset.v2Mode = pal.dark ? 'dark' : 'light';
        root.dataset.v2Theme = pal.dark ? 'dark' : 'light';
        root.dataset.v2PaletteDark = pal.dark ? 'true' : 'false';
        return pal;
      },
    };
    return () => {
      delete (window as any).__v2Palette;
    };
  }, []);

  return palette;
}

export { BASE_PALETTE };
