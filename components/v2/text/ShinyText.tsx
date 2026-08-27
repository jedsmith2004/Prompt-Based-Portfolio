'use client';

/* ============================================================================
   ShinyText — a specular pass across a short run of type.

   The same idea as the masthead sheen already in v2.css, packaged so it can be
   put on the small things: the lead link out of a plate, a call to action. It
   is used sparingly and never on a figure — a number that glints is a number
   that looks like it is selling you something.

   IT DOES NOT RUN AT REST. This is the house rule for passive motion on this
   site and it is not negotiable: a permanent shimmer holds a compositor layer
   and, because it is painted through `background-clip: text`, forces a repaint
   every frame for as long as the element exists. So the pass is bound to
   hover and focus by default, and the `always` variant is for the one or two
   places where the element is the thing the reader is looking for.

   THE @supports IS LOAD-BEARING, and this is the failure mode worth spelling
   out: the effect needs `color: transparent` and a `background-clip: text`
   gradient to arrive TOGETHER. Set the colour without the clip and the text is
   simply invisible. The stylesheet tests both before setting either — see
   `.v2-shiny` in text-effects.css, which is the same guard the masthead
   already uses for the same reason.
   ========================================================================== */

export interface ShinyTextProps {
  children: React.ReactNode;
  /** Run the pass continuously rather than only on hover and focus. */
  always?: boolean;
  /** Seconds for one cycle. Most of it is the held gap between passes. */
  duration?: number;
  className?: string;
}

export default function ShinyText({
  children,
  always = false,
  duration = 7,
  className
}: ShinyTextProps) {
  return (
    <span
      className={
        `v2-shiny${always ? ' is-always' : ''}` + (className ? ` ${className}` : '')
      }
      style={{ '--shine': `${duration}s` } as React.CSSProperties}
    >
      {children}
    </span>
  );
}
