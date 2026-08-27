'use client';

/* ============================================================================
   CircularText — words set around a ring, turning slowly.

   One use: the seal on a clipping page. It is the right object in the right
   place rather than a shape with type bent round it — an award has a seal, a
   newspaper page carries a stamp, and this is the only page on the site where
   both of those are literally what is being described.

   IT IS AN SVG TEXT PATH ON A CIRCLE, AND THE RING IS THE ANIMATED THING.

   The obvious build is one absolutely positioned span per character, each
   rotated by `i * (360 / n)` degrees. That is between twenty and forty
   elements for one decoration, every one of them a transform the compositor
   has to keep, and the letter spacing has to be computed by hand and comes out
   wrong the moment the string length changes.

   A `<textPath>` on a circle does the spacing itself, in one element, and the
   rotation is a CSS transform on the `<svg>` — so the whole thing is one
   composited layer turning, at zero cost per frame, and adding a word just
   makes the letters sit closer together the way they would on a real stamp.

   PAUSES ON HOVER, and stops entirely under reduced motion. It carries real
   words, so a reader who wants to read them should be able to stop it.
   ========================================================================== */

import { useId } from 'react';

export interface CircularTextProps {
  /** Repeated to fill the ring. Keep it short. */
  text: string;
  /** Seconds for one full turn. Negative reverses. */
  duration?: number;
  /** What sits in the middle, if anything. */
  children?: React.ReactNode;
  className?: string;
}

/* The viewBox is a square and everything is expressed against it, so the seal
   scales to whatever box the caller gives it with no measurement. */
const VB = 200;
const R = 78;

export default function CircularText({
  text,
  duration = 26,
  children,
  className
}: CircularTextProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const pathId = `v2-ring-${uid}`;

  /*
   * ONE PASS, STRETCHED TO THE RING, and this is the part that has to be done
   * with `textLength` rather than by repeating the string until it looks full.
   *
   * The circumference here is 2 pi R = 490 user units. A repeated phrase set at
   * its natural width overshoots that badly at the lengths this is actually
   * handed — "1st Place · hackSheffield 9 · " three times measures about a
   * thousand units — and a `<textPath>` does not wrap, it simply STOPS at the
   * end of the path. So two thirds of the words were being silently dropped,
   * at a cut point that moved with every headline.
   *
   * `textLength` set to the circumference with `lengthAdjust="spacing"` makes
   * the browser fit the string to the ring exactly: the glyphs keep their own
   * size and the spacing between them absorbs the difference. A short award
   * sets wide and a long one sets tight, which is what a real stamp does, and
   * neither one overflows or leaves a gap.
   *
   * `spacing` rather than `spacingAndGlyphs`: the latter would scale the
   * letterforms themselves, and type that is horizontally squashed to fit is
   * the one thing this page's whole typographic argument is against.
   */
  const run = `${text} · `;
  const circumference = 2 * Math.PI * R;

  return (
    <div
      className={className ? `v2-seal ${className}` : 'v2-seal'}
      /* The words are a decoration around a fact that is already set as real
         text in the page's metadata line directly above, so announcing the
         ring would read the same award out twice. */
      aria-hidden="true"
    >
      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className="v2-seal-ring"
        /* The turn is a CSS animation on this one element; the duration is the
           only thing the component has to hand it. A negative value reverses
           it, which `animation-direction` in the stylesheet reads off the
           sign. */
        style={
          {
            '--turn': `${Math.abs(duration)}s`,
            '--dir': duration < 0 ? 'reverse' : 'normal'
          } as React.CSSProperties
        }
        focusable="false"
      >
        <defs>
          {/* Two arcs rather than a <circle>, because a text path needs a
              start and a direction and a circle element gives neither. */}
          <path
            id={pathId}
            d={`M ${VB / 2 - R} ${VB / 2}
                a ${R} ${R} 0 1 1 ${R * 2} 0
                a ${R} ${R} 0 1 1 ${-R * 2} 0`}
            fill="none"
          />
        </defs>
        <text>
          <textPath
            href={`#${pathId}`}
            textLength={circumference}
            lengthAdjust="spacing"
          >
            {run}
          </textPath>
        </text>
      </svg>
      {children ? <span className="v2-seal-core">{children}</span> : null}
    </div>
  );
}
