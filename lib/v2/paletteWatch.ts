/* ============================================================================
   paletteWatch — one observer for "the sheet just changed colour".

   THE BUG THIS EXISTS TO KILL.

   Half the canvas figures on this page read their colours out of the root
   custom properties, once, inside the effect that sets them up:

       const cs = getComputedStyle(document.documentElement);
       const ink = cs.getPropertyValue('--ink');

   That is correct exactly once, at mount, and mount happens when the page
   loads, which is when the reader is looking at the HERO. The hero is light.
   So every figure baked the LIGHT ink into an atlas or a set of constants and
   then carried it down the page into three dark plates, where it drew
   near-black glyphs on a near-black sheet and vanished.

   That is what made the climbing wall invisible and the awards headlines
   unreadable. It is one bug wearing several hats, so it gets one fix.

   WHY AN OBSERVER RATHER THAN A PROP. The palette lives on the root element
   as `data-v2-palette` and `data-v2-mode`, written by usePalette. Threading a
   React prop into these components would mean threading it through
   sectionExtra() and through five component signatures, and it would still
   land a frame out of step with the DOM attribute the tokens are keyed on.
   Watching the attribute is the same fact, read where it is actually written.

   ONE observer, ref counted, shared by every subscriber: a MutationObserver
   per figure would be five of them watching one element for the same two
   attributes.

   Note the ORDER of events. Since the token cut in usePalette, the attributes
   and the token values are written in the same task, so by the time a mutation
   record is delivered `getComputedStyle` already returns the new colours. A
   subscriber may re-read immediately and does not need to wait a frame.
   ========================================================================== */

type Listener = () => void;

const listeners = new Set<Listener>();
let observer: MutationObserver | null = null;

function ensureObserver(): void {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver(() => {
    /* Copy before iterating: a listener is allowed to unsubscribe itself. */
    for (const fn of Array.from(listeners)) {
      try {
        fn();
      } catch {
        /* one figure failing to repaint must not stop the others */
      }
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-v2-palette', 'data-v2-mode', 'data-v2-palette-dark']
  });
}

/**
 * Call `fn` whenever the page's palette changes. Returns an unsubscribe.
 *
 * Safe to call from inside a `useEffect` in an SSR build: it no-ops without a
 * document and hands back a disposer that does nothing.
 */
export function onPaletteChange(fn: Listener): () => void {
  if (typeof document === 'undefined') return () => {};
  listeners.add(fn);
  ensureObserver();
  return () => {
    listeners.delete(fn);
    if (!listeners.size && observer) {
      observer.disconnect();
      observer = null;
    }
  };
}

/** True when the plate currently on screen settles dark. */
export function isDarkPlate(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.v2Mode === 'dark';
}
