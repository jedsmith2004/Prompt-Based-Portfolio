'use client';

/* ============================================================================
   CurvedLoop — a marquee running along a curve, set on an SVG text path.

   One instance, on the projects index, carrying the technologies that appear
   in the record more than once. It does two jobs for the price of one: it is
   the ribbon that separates the case from the catalogue, and it is a list of
   what the fifteen projects are actually built out of, which is the one thing
   the index above it never says in one place.

   THE SEAM IS THE ONLY HARD PART, and it is why this measures itself.

   A marquee is seamless if and only if it translates by EXACTLY one repeat of
   its content. Everything else — animating to "-50%", or to some round number
   that looks about right — jumps, and a jump on a loop this slow is the one
   thing a reader will notice about it. So one copy of the phrase is measured
   with `getComputedTextLength()` in user units, the run is repeated enough
   times to overfill the path, and `startOffset` is driven from 0 to exactly
   minus that length. At the end of a cycle every glyph has moved into the
   position its neighbour repeat was occupying, so the wrap is invisible.

   WHY SMIL. `startOffset` is an SVG presentation attribute and is not
   animatable from CSS in any engine, so the alternative to `<animate>` is
   writing the attribute from rAF sixty times a second — a layout-affecting SVG
   write per frame, on a page that already has a real frame budget. SMIL is
   declarative, runs off the main thread's animation timeline, and gives
   `pauseAnimations()` for free, which is what the hover pause uses.

   NOT `preserveAspectRatio="none"`. Stretching the viewBox to the container
   would stretch the glyphs with it, and a face this page has chosen carefully
   would arrive squashed at one width and drawn out at another. The ribbon
   scales uniformly instead.
   ========================================================================== */

import { useEffect, useId, useRef, useState } from 'react';

export interface CurvedLoopProps {
  /** The words. Joined with the separator and repeated to fill the path. */
  items: readonly string[];
  separator?: string;
  /** Seconds for one repeat to travel its own length. Larger is slower. */
  duration?: number;
  /** Sag of the curve in user units. Negative arcs upward. */
  curve?: number;
  className?: string;
}

const VB_W = 1000;
const VB_H = 132;

export default function CurvedLoop({
  items,
  separator = '  ·  ',
  duration = 26,
  curve = 30,
  className
}: CurvedLoopProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const pathId = `v2-curve-${uid}`;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const rulerRef = useRef<SVGTextElement | null>(null);

  /** One repeat's width and how many of them the path needs. Null until measured. */
  const [fit, setFit] = useState<{ len: number; repeats: number } | null>(null);
  const [reduced, setReduced] = useState(false);

  const phrase = items.length ? items.join(separator) + separator : '';

  useEffect(() => {
    if (!phrase) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReduced(true);
      return;
    }
    const ruler = rulerRef.current;
    const path = pathRef.current;
    if (!ruler || !path) return;

    const len = ruler.getComputedTextLength();
    if (!(len > 0)) return;
    const total = path.getTotalLength();
    /* Overfill by one repeat beyond the path, plus one more to cover the
       distance the run travels backwards over a cycle. */
    const repeats = Math.ceil(total / len) + 2;
    setFit({ len, repeats });
  }, [phrase]);

  /* The reader is allowed to stop it and read one. `pauseAnimations` is on the
     SVG root and stops the whole document timeline for this element only. */
  const pause = () => svgRef.current?.pauseAnimations();
  const play = () => svgRef.current?.unpauseAnimations();

  if (!phrase) return null;

  const run = fit ? phrase.repeat(fit.repeats) : phrase;

  return (
    <div
      className={className ? `v2-curveloop ${className}` : 'v2-curveloop'}
      /* Decoration. Every technology named here is already set as real text in
         the catalogue directly below, so announcing the ribbon would read the
         same list twice, once out of order and with no structure. */
      aria-hidden="true"
      /* data-perch: the ribbon's own border-top is a real hairline across the
         full width of the page, so its box edge IS the mark and it takes no
         inset. It also happens to sit in the largest bird-free gap on the
         projects index, between the case and the catalogue. See THE PERCH
         CONTRACT in components/v2/Companion.tsx. */
      data-perch
      onMouseEnter={pause}
      onMouseLeave={play}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
      >
        <defs>
          <path
            ref={pathRef}
            id={pathId}
            /* Runs off both edges, so the ends of the ribbon are never on
               screen and the curve reads as a section of something longer. */
            d={`M -260 ${VB_H / 2 + curve / 2} Q ${VB_W / 2} ${VB_H / 2 - curve} ${VB_W + 260} ${VB_H / 2 + curve / 2}`}
            fill="none"
          />
        </defs>

        {/* The ruler. One repeat, never painted, measured once. */}
        <text ref={rulerRef} className="v2-curveloop-text" visibility="hidden" x="0" y="-999">
          {phrase}
        </text>

        <text className="v2-curveloop-text">
          <textPath href={`#${pathId}`} startOffset="0">
            {run}
            {fit && !reduced ? (
              <animate
                attributeName="startOffset"
                from="0"
                to={-fit.len}
                /* `dur` is the time for ONE REPEAT to travel its own length,
                   so a longer list moves faster rather than taking
                   proportionally longer to come round. That is the right way
                   round for a ribbon: the loop period stays constant as
                   technologies are added to the record, instead of the whole
                   thing slowing to a crawl. */
                dur={`${duration}s`}
                repeatCount="indefinite"
              />
            ) : null}
          </textPath>
        </text>
      </svg>
    </div>
  );
}
