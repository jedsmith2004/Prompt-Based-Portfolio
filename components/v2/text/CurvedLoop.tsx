'use client';

/* ============================================================================
   CurvedLoop — a marquee running along a curve, set on an SVG text path.

   Two instances, and each carries something the page it is on does not
   otherwise state in one place:

     /projects   the technologies that appear in the record more than once. It
                 is also the rule between the case and the catalogue, so it
                 does the dividing and the listing for the price of one.
     /           the six DO NOTs and the SO, on the way out. The eyebrows are
                 an anaphora and they are the only device holding the spine's
                 argument together; set in a row they are the page's thesis.

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

  /*
   * MEASURED ON A ResizeObserver, NOT ONCE ON MOUNT.
   *
   * `getComputedTextLength()` returns 0 for an SVG that has not been laid out
   * yet, and the effect can easily run before that has happened — which is
   * exactly what went wrong on the home page's ribbon while the projects
   * page's, higher up the document, measured fine. A single measurement that
   * silently returns zero leaves `fit` null forever: no `<animate>` is
   * rendered, and the ribbon sits there showing one static repeat.
   *
   * Three triggers, because no one of them is sufficient: a bounded retry for
   * "layout does not exist yet", `document.fonts.ready` for "the face it was
   * measured in is about to change", and a ResizeObserver for "the container
   * is a different width now". Each is commented where it is set up.
   */
  useEffect(() => {
    if (!phrase) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReduced(true);
      return;
    }
    const svg = svgRef.current;
    if (!svg) return;

    /** Returns true once it has a usable measurement. */
    const measure = (): boolean => {
      const ruler = rulerRef.current;
      const path = pathRef.current;
      if (!ruler || !path) return false;
      let len = 0;
      try {
        len = ruler.getComputedTextLength();
      } catch {
        /* Firefox throws rather than returning 0 for an SVG text node that has
           not been laid out. Same meaning: not ready, ask again. */
        return false;
      }
      if (!(len > 0)) return false;
      const total = path.getTotalLength();
      /* Overfill by one repeat beyond the path, plus one more to cover the
         distance the run travels backwards over a cycle. */
      const repeats = Math.ceil(total / len) + 2;
      setFit((prev) =>
        prev && prev.repeats === repeats && Math.abs(prev.len - len) < 0.5
          ? prev
          : { len, repeats }
      );
      return true;
    };

    /*
     * A BOUNDED RETRY, for the case where layout does not exist yet.
     *
     * `getComputedTextLength()` returns 0 (or throws, in Firefox) until the SVG
     * has been laid out, and a measurement of 0 is unrecoverable on its own:
     * `fit` stays null, no `<animate>` is rendered, and the marquee sits there
     * showing one static repeat. The ResizeObserver below does not reliably
     * rescue it, because RO notifications are delivered during "update the
     * rendering", which a browser skips for a document that is not being
     * displayed.
     *
     * `setTimeout` keeps running in that state, so it is the backstop. Twelve
     * attempts at 120ms covers about a second and a half and then gives up,
     * and it stops the instant one succeeds — in the ordinary case the very
     * first synchronous call does, and this costs nothing.
     */
    let tries = 0;
    let retry = 0;
    const attempt = () => {
      if (measure() || ++tries >= 12) return;
      retry = window.setTimeout(attempt, 120);
    };
    attempt();

    const ro = new ResizeObserver(() => measure());
    ro.observe(svg);

    /*
     * AND AGAIN WHEN THE FONTS LAND, which is the trigger that actually
     * matters and is not optional.
     *
     * A ResizeObserver fires once when observation starts and then only when
     * the box changes — and this box does not change when a webfont arrives,
     * because the SVG is sized by its container. So an observer alone leaves
     * two holes: a first measurement taken before layout exists sticks at zero
     * forever (the home page's ribbon never animated at all), and a
     * measurement taken in the fallback face is simply WRONG once Bricolage
     * and JetBrains Mono swap in. The second one is the more insidious: the
     * repeat length is what makes the loop seamless, so a stale measurement
     * does not fail loudly, it just puts a visible jump in the marquee once a
     * cycle.
     */
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });

    return () => {
      cancelled = true;
      window.clearTimeout(retry);
      ro.disconnect();
    };
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

        {/* The ruler. One repeat, never painted, re-measured on every box
            change — see the observer above. */}
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
