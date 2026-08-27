/* ============================================================================
   paletteWatch — one observer for "the sheet just changed colour", and one
   read of what it changed to.

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

   ---------------------------------------------------------------------------
   AND THE SECOND BUG, WHICH IS THE FIRST ONE'S BILL.

   > "there are lag spikes when switching backgrounds and massive lag spikes
   >  when turning off or on the lights"

   Every one of those `getPropertyValue` calls was a FORCED SYNCHRONOUS STYLE
   RECALCULATION of the whole document. All sixteen palette tokens are
   registered `@property` with `inherits: true` on `:root`, so the moment
   usePalette writes them every element in a sixteen-thousand-pixel document
   is dirty, and the first computed read after that has to resolve all of it
   before it can answer. Jack had already measured that recalc and written the
   number down: v2.css says an untransitioned light change costs 110ms of
   style. A CPU profile of one toggle, with native frames charged to their
   nearest JS caller, put 137ms on NeuralPlayground's token reads on one plate
   and 134ms on SkillConstellation's on another. Those are the same 110ms,
   paid inside a mutation callback, where it blocks.

   Counted on the spine, ONE light change performed 19 getComputedStyle
   acquisitions and 82 getPropertyValue calls, and every one of them was
   re-deriving from the DOM a value that usePalette had held as a plain hex
   string a microtask earlier.

   So the notification carries the palette with it. usePalette publishes the
   sixteen values it is about to write, and a subscriber asks the snapshot
   rather than the document. The recalc still happens -- it must -- but in the
   browser's own rendering step, where it is not blocking anything, instead of
   being dragged forward into a callback.

   WHAT WAS TRIED AND THROWN AWAY. Before this, the same complaint was
   answered by SKIPPING off-screen figures and repainting them on the way back
   in. It was measured properly, one configuration per page load against one
   compiled bundle, and it bought nothing: mean total blocking 208ms against
   200ms, and the worst case got worse. It also introduced a real regression,
   because IntersectionObserver records are delivered AFTER the frame that
   crossed the threshold has painted, so an instant jump from the nav rail
   under `prefers-reduced-motion` would paint one frame of the old ink on the
   new paper and then block on the catch-up repaint. Deferring the work was
   the wrong shape of answer: the work should not exist.
   ========================================================================== */

/**
 * The colours, resolved once per change and shared by every subscriber.
 *
 * `get` is the whole interface. It answers from the published snapshot where
 * there is one, and from the document where there is not. The A/B bench routes
 * were the case that proved it: they stood outside the spine and set
 * `data-v2-theme` by hand without ever mounting usePalette. Those routes left
 * with the move to the apex, and the fallback stays, because any page that
 * mounts a figure without the hook needs it. Even then it is ONE acquisition
 * shared across the batch rather than one per figure.
 */
export interface PaletteTokens {
  get(name: string, fallback: string): string;
}

type Listener = (tokens: PaletteTokens) => void;

const listeners = new Set<Listener>();
let observer: MutationObserver | null = null;

/** The last palette usePalette wrote, keyed by custom property name. */
let published: Record<string, string> | null = null;

/**
 * Called by usePalette with the values it is about to set on the root.
 *
 * Synchronous and before the write, so that by the time the mutation record is
 * delivered the snapshot already describes what the document now says.
 *
 * `null` UNPUBLISHES, and usePalette's teardown must call it. This is module
 * state and the hook is not guaranteed to be on the next page: the bench routes
 * set `data-v2-theme` by hand without ever mounting it, and any page like them
 * would do the same. Left set, the spine's last plate would still be answering
 * for a page that is asking the document for its own colours -- the same bug in
 * a quieter coat.
 */
export function publishPalette(tokens: Record<string, string> | null): void {
  published = tokens;
}

/** Built fresh per notification: the lazy fallback must not outlive its batch. */
function snapshot(): PaletteTokens {
  let cs: CSSStyleDeclaration | null = null;
  return {
    get(name: string, fallback: string): string {
      const v = published ? published[name] : undefined;
      if (v !== undefined && v !== '') return v;
      /* No publisher on this page. One acquisition for the whole batch. */
      if (!cs) cs = getComputedStyle(document.documentElement);
      return cs.getPropertyValue(name).trim() || fallback;
    }
  };
}

function ensureObserver(): void {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver(() => {
    const tokens = snapshot();
    /* Copy before iterating: a listener is allowed to unsubscribe itself. */
    for (const fn of Array.from(listeners)) {
      try {
        fn(tokens);
      } catch {
        /* one figure failing to repaint must not stop the others */
      }
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    /* `data-v2-theme` as well: a page outside the spine sets only that one,
       in a mount effect that lands after a figure's first paint. NOT `class` and NOT `style` -- usePalette touches
       both of those on the root during a mode change, so watching them means
       three notifications where one is correct. */
    attributeFilter: [
      'data-v2-palette',
      'data-v2-mode',
      'data-v2-palette-dark',
      'data-v2-theme'
    ]
  });
}

/**
 * Call `fn` whenever the page's palette changes, with the new colours.
 *
 * Returns an unsubscribe. Safe to call from inside a `useEffect` in an SSR
 * build: it no-ops without a document and hands back a disposer that does
 * nothing.
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

/**
 * The current colours, for a caller that needs them OUTSIDE a notification --
 * a figure reading its tokens for the first time at mount, say.
 *
 * Same rule: the published snapshot if there is one, the document if not.
 */
export function paletteTokens(): PaletteTokens {
  return snapshot();
}

/** True when the plate currently on screen settles dark. */
export function isDarkPlate(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.v2Mode === 'dark';
}
