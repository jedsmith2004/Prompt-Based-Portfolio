'use client';

/* ============================================================================
   RotatingText — one slot in a line, cycling through the things that are true
   of it.

   Used on the hero's title block, where the role after the name turns between
   the three appointments the record actually holds. That constraint is the
   whole reason it is allowed on this page: a rotator is a machine for making
   claims cheaply, and every phrase this one shows has to be an entry that
   already exists in CareerLine's ROLES.

   THE SLOT DOES NOT RESIZE. Every candidate is rendered, stacked, with all but
   the live one made invisible AND removed from the accessibility tree; the
   widest one sets the box. Without that the eyebrow's rule would shunt
   sideways three times a minute, and a line of metadata that moves is a line
   that reads as broken layout rather than as a device.

   IT STOPS WHEN NOBODY IS LOOKING. The interval is cleared on
   `visibilitychange` and never starts until the words are on screen. A timer
   turning words over in a background tab is pure cost.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { useInView } from './useInView';

export interface RotatingTextProps {
  /** Two or more. The first is what the page renders before anything turns. */
  items: readonly string[];
  /** How long each one holds, ms. */
  hold?: number;
  className?: string;
}

export default function RotatingText({
  items,
  hold = 2600,
  className
}: RotatingTextProps) {
  const { ref, seen, reduced } = useInView<HTMLSpanElement>({ threshold: 0.6 });
  const [at, setAt] = useState(0);

  useEffect(() => {
    if (!seen || reduced || items.length < 2) return;
    let id = 0;

    const start = () => {
      id = window.setInterval(() => setAt((i) => (i + 1) % items.length), hold);
    };
    const stop = () => {
      if (id) window.clearInterval(id);
      id = 0;
    };
    const onVis = () => (document.hidden ? stop() : start());

    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [seen, reduced, items.length, hold]);

  /* Reduced motion gets the first item and nothing else: a stack of hidden
     siblings would still be in the DOM for no reason. */
  if (reduced) {
    return (
      <span ref={ref} className={className}>
        {items[0]}
      </span>
    );
  }

  return (
    <span
      ref={ref}
      className={className ? `v2-rotate ${className}` : 'v2-rotate'}
      /* Polite rather than off: the line genuinely changes meaning, and it
         changes slowly enough to be worth hearing once per turn. */
      aria-live="polite"
    >
      {items.map((item, i) => (
        <span
          key={item}
          className={`v2-rotate-item${i === at ? ' is-on' : ''}`}
          aria-hidden={i === at ? undefined : 'true'}
        >
          {item}
        </span>
      ))}
      {/* The sizer. Visually hidden, never announced, and the only child that
          takes part in layout, so the slot is as wide as the longest phrase
          from the first frame. */}
      <span className="v2-rotate-sizer" aria-hidden="true">
        {items.reduce((a, b) => (b.length > a.length ? b : a), '')}
      </span>
    </span>
  );
}
