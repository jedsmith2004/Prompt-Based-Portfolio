'use client';

/* ============================================================================
   DecryptedText — the words arrive out of noise.

   Each character starts as a random glyph and settles into the real one, left
   to right, over a fixed duration. It is the one effect in this folder with a
   reason beyond looking good: it is used on "no signal" in the hero, where the
   sentence is literally about a signal that is not there yet.

   WHY IT DOES NOT ANIMATE THE DOM TEXT NODE. Rewriting `textContent` sixty
   times a second on a node inside a paragraph forces a text-layout pass on the
   whole line every frame, and the line REFLOWS whenever a scrambled glyph is
   wider than the real one — so the rest of the sentence jitters while one
   phrase decodes. Here the scramble is drawn in an absolutely positioned
   overlay stacked exactly over the real text, and the real text carries the
   layout the entire time. Nothing under it ever moves, the phrase still wraps
   normally, and a reader who copies the paragraph gets the true string.

   The overlay is aria-hidden and the real text is never removed, so a screen
   reader reads the sentence once, correctly, with no noise in it.
   ========================================================================== */

import { useState } from 'react';
import { useInView, useTimedFrames } from './useInView';

/* Deliberately narrow. Full ASCII soup reads as a terminal doing something
   wrong; this set is close to the shapes of the face the page is already set
   in, so the noise looks like type about to become other type. */
const GLYPHS = '#%&$@*+=<>[]{}|?!01';

export interface DecryptedTextProps {
  text: string;
  /** Total run, ms. The last character settles exactly at the end. */
  duration?: number;
  /** Wait this long after the words come into view. */
  delay?: number;
  className?: string;
}

export default function DecryptedText({
  text,
  duration = 900,
  delay = 260,
  className
}: DecryptedTextProps) {
  const { ref, seen, reduced } = useInView<HTMLSpanElement>({ threshold: 0.4 });
  const [armed, setArmed] = useState(false);
  const [noise, setNoise] = useState<string | null>(null);

  /* The delay is its own tiny loop rather than a setTimeout, so there is one
     cancellation path on unmount instead of two. */
  useTimedFrames(seen && !reduced && !armed, delay, (t) => {
    if (t >= 1) setArmed(true);
  });

  useTimedFrames(
    armed && !reduced,
    duration,
    (t) => {
      if (t >= 1) {
        setNoise(null);
        return;
      }
      /* Characters settle in reading order: the head of the string is already
         true while the tail is still noise. Smoothstepped so the boundary
         moves slowly at both ends rather than sweeping at a constant rate. */
      const settled = t * t * (3 - 2 * t) * text.length;
      let out = '';
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        /* Spaces and punctuation never scramble. A phrase whose word gaps move
           reads as broken rather than as decoding. */
        if (i < settled || c === ' ' || c === ',' || c === '.') out += c;
        else out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      setNoise(out);
    },
    [text]
  );

  return (
    <span
      ref={ref}
      className={className ? `v2-decrypt ${className}` : 'v2-decrypt'}
      data-running={noise ? 'true' : undefined}
    >
      <span className="v2-decrypt-true">{text}</span>
      {noise ? (
        <span className="v2-decrypt-noise" aria-hidden="true">
          {noise}
        </span>
      ) : null}
    </span>
  );
}
