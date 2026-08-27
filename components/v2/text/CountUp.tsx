'use client';

/* ============================================================================
   CountUp — the figures on a shelf arrive by counting.

   This page is an engineering journal whose whole argument is that its numbers
   are real, so a figure that rolls up to its value is the one animation here
   that is saying something rather than decorating: it puts the eye on the
   number instead of on the motion around it.

   IT ONLY EVER ANIMATES A NUMBER IT CAN PROVE IT UNDERSTOOD.

   The shelves carry '99.8%', '139k', '4 / 4', 'First', '.obj', 'Grade 8',
   '677 days', '1st' and '2025'. Only some of those are countable, and the
   wrong behaviour is not a crash, it is '4 / 4' turning into '4' or 'First'
   vanishing. So `parseFigure` returns null unless the value is EXACTLY one
   numeric token with optional plain text either side, and null renders the
   authored string verbatim, with no wrapper and no loop.

   Two countable values are understood and deliberately left alone:

     Years. '2025' would count from zero through two thousand meaningless
     numbers, which reads as a broken odometer rather than as a date. A bare
     four-digit number in 1900..2100 is treated as a year.

     Zero. '0 cloud calls, by design' is a claim that there are none. An
     animation from 0 to 0 is a no-op that still costs renders, and a figure
     that flickers on arrival undermines the sentence it is sitting in.

   TABULAR FIGURES ARE THE CALLER'S JOB. The shelves already set
   `font-variant-numeric: tabular-nums`; without it a counter reflows its own
   box every frame as glyph widths change, and takes the row with it.
   ========================================================================== */

import { useState } from 'react';
import { useInView, useTimedFrames } from './useInView';

export interface CountUpProps {
  /** The final, authored string. Rendered as-is if it is not countable. */
  value: string;
  /** Run length, ms. */
  duration?: number;
  delay?: number;
  className?: string;
}

interface Parsed {
  prefix: string;
  target: number;
  suffix: string;
  /** Decimal places held while counting, so '99.8%' never shows '99%'. */
  places: number;
  /** True where the authored number carried thousands separators. */
  grouped: boolean;
}

/** One numeric token, optional text either side. Anything else returns null. */
export function parseFigure(value: string): Parsed | null {
  const m = /^([^0-9]*?)(\d[\d,]*(?:\.\d+)?)([^0-9]*)$/.exec(value);
  if (!m) return null;
  const prefix = m[1];
  const digits = m[2];
  const suffix = m[3];
  const grouped = digits.indexOf(',') >= 0;
  const target = Number(digits.replace(/,/g, ''));
  if (!Number.isFinite(target) || target === 0) return null;

  const dot = digits.indexOf('.');
  const places = dot < 0 ? 0 : digits.length - dot - 1;

  /* A bare four-digit number in living memory is a year, not a quantity. */
  if (!prefix && !suffix && places === 0 && target >= 1900 && target <= 2100) {
    return null;
  }
  return { prefix, target, suffix, places, grouped };
}

function render(n: number, p: Parsed): string {
  const fixed = n.toFixed(p.places);
  if (!p.grouped) return fixed;
  const parts = fixed.split('.');
  const withSeps = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? withSeps + '.' + parts[1] : withSeps;
}

export default function CountUp({
  value,
  duration = 1100,
  delay = 120,
  className
}: CountUpProps) {
  const parsed = parseFigure(value);
  const { ref, seen, reduced } = useInView<HTMLSpanElement>({ threshold: 0.5 });
  const [shown, setShown] = useState<string | null>(null);

  const run = Boolean(parsed) && seen && !reduced;
  const span = delay + duration;

  useTimedFrames(
    run,
    span,
    (t) => {
      if (!parsed) return;
      const u = Math.max(0, (t * span - delay) / duration);
      if (u >= 1) {
        setShown(null);
        return;
      }
      /* Ease out cubic: fast off the mark, so the figure is legible for most
         of the run rather than blurring past and stopping dead. */
      const e = 1 - Math.pow(1 - u, 3);
      setShown(render(parsed.target * e, parsed));
    },
    [value]
  );

  if (!parsed) return <>{value}</>;

  return (
    <span ref={ref} className={className}>
      {shown === null ? value : parsed.prefix + shown + parsed.suffix}
    </span>
  );
}
