'use client';

/* ============================================================================
   GlitchText — the word printed three times, two of them misregistered.

   The classic chromatic-split glitch, built the honest way: two copies of the
   string in `::before` and `::after` from `data-text`, offset and clipped to
   moving horizontal slices. Everything is CSS keyframes, so there is no state,
   no loop, and no JavaScript touching it after mount.

   ONE PLACE ONLY: the 404 heading, beside FuzzyText. Both are about the same
   thing — something on this page is broken — and neither is allowed anywhere a
   claim is being made, because a glitching figure reads as a figure you should
   not trust.

   THE COPIES ARE `aria-hidden` VIA `data-text` RATHER THAN REAL NODES: pseudo
   element content is not in the accessibility tree at all, so the word is
   announced exactly once with no extra markup.
   ========================================================================== */

export interface GlitchTextProps {
  text: string;
  /** Runs continuously by default; set false to glitch only on hover. */
  always?: boolean;
  className?: string;
}

export default function GlitchText({
  text,
  always = true,
  className
}: GlitchTextProps) {
  return (
    <span
      className={
        `v2-glitch${always ? ' is-always' : ''}` + (className ? ` ${className}` : '')
      }
      data-text={text}
    >
      {text}
    </span>
  );
}
