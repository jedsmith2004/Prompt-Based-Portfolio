'use client';

/* ============================================================================
   usePalette — drives the page's colour tokens from the active section.

   Writes the twelve palette custom properties onto <html> and lets the CSS
   transition registered in v2.css carry them. Nothing here animates anything
   itself: the whole point of registering the properties with `@property` is
   that the browser interpolates them off the main thread, so this hook runs
   once per section change and then gets out of the way.

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

import { useEffect } from 'react';
import {
  BASE_PALETTE,
  PALETTE_VARS,
  paletteForSection,
  plateFor,
  type PaletteMode,
  type SectionPalette
} from '@/lib/v2/palettes';

const DRIVEN_CLASS = 'v2-palette-driven';

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

  /* Write the tokens. Synchronous, every time the palette changes. */
  useEffect(() => {
    const root = document.documentElement;
    for (const [key, prop] of PALETTE_VARS) {
      root.style.setProperty(prop, String(palette[key]));
    }
    root.dataset.v2Palette = plateId;
    root.dataset.v2Mode = palette.dark ? 'dark' : 'light';
    /* Kept as well as data-v2-mode: several components and the whole of the
       projects page already branch on this attribute, and renaming it would
       be a silent visual regression in every one of them. */
    root.dataset.v2PaletteDark = palette.dark ? 'true' : 'false';
  }, [palette, plateId]);

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
      for (const [, prop] of PALETTE_VARS) root.style.removeProperty(prop);
      delete root.dataset.v2Palette;
      delete root.dataset.v2Mode;
      delete root.dataset.v2PaletteDark;
    };
  }, []);

  return palette;
}

export { BASE_PALETTE };
