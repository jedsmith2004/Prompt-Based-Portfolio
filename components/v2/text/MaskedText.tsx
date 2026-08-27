'use client';

/* ============================================================================
   MaskedText — a heading whose ink is a texture rather than a colour, and
   StrokeText — a heading drawn as an outline.

   Both are one CSS declaration doing the work, so they live together: there is
   no component logic here worth two files.

   MASKED. `background-clip: text` fills the letterforms with whatever the
   element's background happens to be, which here is a halftone screen built
   out of repeating gradients in the page's own ink. It is used on the clipping
   pages, where the whole material conceit is newsprint and a headline printed
   as a dot screen is the literal truth of how that page would have been made.

   The fallback matters and is easy to get wrong: if `background-clip: text` is
   unsupported, `color: transparent` leaves an invisible heading. So the colour
   is only made transparent inside an `@supports` block. See v2.css.

   STROKE. `-webkit-text-stroke` with a transparent fill. Used on the second
   line of the hero, where the page's two-line thesis reads better as one solid
   line and one hollow one than as two of the same weight — the eye takes them
   as a statement and its echo rather than as a list.

   Neither animates. They are treatments, not entrances, and the hero line they
   sit on is already being masked and lifted by its own transition.
   ========================================================================== */

export interface TreatedTextProps {
  children: React.ReactNode;
  className?: string;
}

/** Letterforms filled with the page's halftone screen. */
export function MaskedText({ children, className }: TreatedTextProps) {
  return (
    <span className={className ? `v2-masked ${className}` : 'v2-masked'}>
      {children}
    </span>
  );
}

/** Letterforms drawn as an outline with no fill. */
export function StrokeText({ children, className }: TreatedTextProps) {
  return (
    <span className={className ? `v2-stroked ${className}` : 'v2-stroked'}>
      {children}
    </span>
  );
}

export default MaskedText;
