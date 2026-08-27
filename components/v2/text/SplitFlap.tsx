'use client';

/* ============================================================================
   SplitFlap — a mechanical departure board, one flap per character.

   Used for the total on the route plate. It earns its place there rather than
   anywhere else because a split-flap board is the object you read a JOURNEY
   off, and the figure it is spelling out is the length of one.

   HOW IT IS ACTUALLY DRAWN, and why it is not forty animated elements.

   A real split-flap rig has a card hinged across the middle that falls to
   reveal the next character. Simulating the hinge properly is two half-height
   faces per column with a rotateX on a shared 3D transform, per frame, per
   column — for a nine-character figure that is eighteen composited layers
   turning at once, on a page already running a particle field and a backdrop.

   So the flap is a CHARACTER SWAP plus a short vertical wipe. Each column
   holds one glyph and steps through a fixed alphabet toward its target, and
   the wipe (a scaleY on a pseudo-element, GPU-composited, no layout) supplies
   the mechanical read. At the speed the columns actually turn, that is
   indistinguishable from the hinge and costs one text write per column per
   step rather than a transform per layer per frame.

   COLUMNS ARE FIXED WIDTH, set in `em` in text-effects.css. A board whose
   columns resize as the glyphs change is not a board, and commas and decimal
   points are narrower than digits in every face on this page.

   THE WIPE IS RE-TRIGGERED BY REMOUNTING THE COLUMN, which is the part that
   looks like a mistake and is not. A CSS animation on `::after` runs once when
   the element is created and does NOT restart because an attribute on the
   parent changed — so keying the pseudo-element off the glyph, which is what
   this did first, played the wipe once per column for the entire life of the
   board and never again. Each column therefore carries a flip COUNTER in its
   React key: a new key is a new element, and a new element runs its animation.
   The counter rather than the glyph, so a column landing on the same character
   twice in a row still flips.

   REDUCED MOTION renders a plain string with no columns at all. Forty boxes
   holding their final letters is not a calmer version of this, it is the same
   picture with the point removed.

   AND IT IS CORRECT BEFORE IT RUNS. The board is seeded with the final value
   rather than with blanks, so the server-rendered figure is the real one and
   nothing is missing while the observer waits for the plate to be scrolled to.
   See the note on `cols`.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { useInView } from './useInView';

/* The order the flaps are physically stacked in, so a column always turns
   FORWARDS through the alphabet to reach its target the way a real one does.
   Digits first because almost everything this is pointed at is a figure. */
const ALPHABET = '0123456789,.:%+-/ ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface SplitFlapProps {
  /** What the board should end up reading. */
  value: string;
  /** ms between flaps on one column. */
  step?: number;
  /** Extra flaps each column runs past its target before settling. */
  overshoot?: number;
  className?: string;
}

export default function SplitFlap({
  value,
  step = 34,
  overshoot = 6,
  className
}: SplitFlapProps) {
  const upper = value.toUpperCase();
  const { ref, seen, reduced } = useInView<HTMLSpanElement>({ threshold: 0.5 });
  /**
   * The glyph each column is showing, and how many times it has flipped.
   *
   * IT STARTS SETTLED, ON THE ANSWER. The first cut started every column
   * blank, which meant the server-rendered HTML — and every frame before the
   * observer fired — read `DISTANCE ______ km`. A figure that is missing until
   * you scroll to it is a figure that is missing, and a board that has not
   * been told anything yet showing nothing is only correct if you never look
   * at it early.
   *
   * Starting on the value also happens to be what a real board does: it holds
   * the last thing it was told and flips when it is told something new. So the
   * effect below reads as an UPDATE rather than as an arrival, which is the
   * better read anyway.
   */
  const [cols, setCols] = useState<Array<{ c: string; n: number }>>(() =>
    upper.split('').map((c) => ({ c, n: 0 }))
  );
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!seen || reduced) return;

    const targets = upper.split('');
    /* Each column gets its own start offset so the board does not turn as one
       block: a real one settles left to right as the mechanism catches up. */
    const remaining = targets.map((c, i) => {
      const at = ALPHABET.indexOf(c);
      return (at < 0 ? 1 : ALPHABET.length) + overshoot + i * 2;
    });
    const cursor = targets.map(() => 0);

    let flip = 0;
    const tick = () => {
      let moving = false;
      flip += 1;
      const next = targets.map((target, i) => {
        const want = ALPHABET.indexOf(target);
        /* Settled, or a character the board has no flap for: hold it, and do
           not bump the counter, so a finished column stops animating. */
        if (want < 0 || remaining[i] <= 0) return { c: target, n: -1 - i };
        remaining[i] -= 1;
        moving = true;
        if (remaining[i] <= 0) return { c: target, n: flip };
        cursor[i] = (cursor[i] + 1) % ALPHABET.length;
        return { c: ALPHABET[cursor[i]], n: flip };
      });
      setCols(next);
      if (moving) timer.current = window.setTimeout(tick, step);
      else timer.current = null;
    };

    timer.current = window.setTimeout(tick, step);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [upper, seen, reduced, step, overshoot]);

  if (reduced) {
    return (
      <span ref={ref} className={className ? `v2-flap ${className}` : 'v2-flap'}>
        {value}
      </span>
    );
  }

  return (
    <span
      ref={ref}
      className={className ? `v2-flap ${className}` : 'v2-flap'}
    >
      {/* One accessible reading of the final figure. The columns are
          decoration and would otherwise be announced as forty separate
          characters, mid flip, every time one of them changed.

          A visually hidden text node rather than `role="text"` + aria-label:
          `text` is a non-standard Safari-only role, and aria-label on a plain
          span with no role is ignored outright by several screen readers, so
          the pairing that looks tidiest is the one that says nothing at all
          in Firefox with NVDA. `.v2-sr` is the utility already used by the
          companion's transcript. */}
      <span className="v2-sr">{value}</span>
      {cols.map((col, i) => (
        <span
          className="v2-flap-col"
          /* The flip counter is the key. See the note at the top of the file:
             a new key is a new element, and a new element runs its animation,
             which is the only thing that makes the wipe play more than once. */
          key={`${i}:${col.n}`}
          aria-hidden="true"
        >
          {/* A no-break space on a blank flap. A plain space in JSX collapses
              away and the column would lose its width, so the board would
              visibly narrow while it was still turning. */}
          {col.c === ' ' ? '\u00A0' : col.c}
        </span>
      ))}
    </span>
  );
}
