'use client';

/* ============================================================================
   Hero — the thesis plate.

   The ink field sits behind, holding a gritstone ridgeline. The type is set as
   an engineering title block: mono metadata against a hard rule, then the name
   at plate scale, then the figures. Each display line is masked and lifted on
   load, which is the one orchestrated motion moment on the page.
   ========================================================================== */

import { useEffect, useState } from 'react';
import type { Stat } from './SpineSection';
import { CV_EDITIONS } from './CurriculumVitae';

export interface HeroProps {
  eyebrowLeft: string;
  eyebrowRight: string;
  /** One entry per display line. Kept short so the plate scale holds. */
  lines: string[];
  lede: string;
  stats: Stat[];
  /** id of the section the scroll cue jumps to */
  nextId: string;
}

export default function Hero({
  eyebrowLeft,
  eyebrowRight,
  lines,
  lede,
  stats,
  nextId
}: HeroProps) {
  const [lit, setLit] = useState(false);

  useEffect(() => {
    /* one frame of delay so the mask transition actually plays */
    const t = window.setTimeout(() => setLit(true), 60);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <header className={`v2-hero${lit ? ' is-lit' : ''}`} id="top">
      <div className="v2-wrap v2-hero-inner">
        <div className="v2-hero-meta">
          <span>{eyebrowLeft}</span>
          <span>{eyebrowRight}</span>
        </div>

        {/*
          THE CV, AT THE TOP. Jack, 2026-08-26: "There should probably be links
          to my CV at the top as well."

          The plate at the bottom of the page is where the CV is EXPLAINED —
          which edition is which, how long each one is, who each is for. This
          is not that, and it deliberately does not try to be: it is the two
          files, reachable in one click by somebody who opened the page already
          knowing what they wanted. A reader who has scrolled to plate 07 has
          asked the question; a reader at the top has not.

          Read from CV_EDITIONS rather than written out, so the two places the
          CV is offered cannot disagree about how many editions there are.
        */}
        <p className="v2-hero-cv">
          {CV_EDITIONS.map((cv, i) => (
            <a
              key={cv.href}
              href={cv.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cv.primary ? 'is-lead' : undefined}
            >
              {i === 0 ? 'CV' : cv.label}
              <i aria-hidden="true">{cv.pages}pp</i>
            </a>
          ))}
        </p>
        {/* data-perch: see THE PERCH CONTRACT in components/v2/Companion.tsx.
            The title is measured as text, so he lands on the first line's ink
            rather than on the full column: "JACK" and the column it is set in
            are not the same width. 0.04em is the measured drop from the h1's
            content top to the top of the tallest letter on that line at the
            0.86 line-height of .v2-display, and being in em it holds from the
            56px end of the clamp to the 210px end. The h1's own box does not
            move during the mask-and-lift entrance — only the inner spans do —
            so this one perch is correct from the first frame, which matters
            because it is what the bird opens the page sitting on. */}
        <hr className="v2-rule-hard" data-perch />

        <h1 className="v2-hero-title" data-perch data-perch-text data-perch-inset="0.04em">
          {lines.map((line, i) => (
            <span className="v2-line" key={line}>
              <span
                className="v2-line-in v2-display"
                style={{ '--d': `${120 + i * 110}ms` } as React.CSSProperties}
              >
                {line}
              </span>
            </span>
          ))}
        </h1>

        <div className="v2-hero-foot">
          <p
            className="v2-lede v2-fade"
            style={{ '--d': `${140 + lines.length * 110}ms` } as React.CSSProperties}
            data-perch
            data-perch-text
            data-perch-inset="0.33em"
          >
            {lede}
          </p>

          <div
            className="v2-hero-stats v2-fade"
            style={{ '--d': `${220 + lines.length * 110}ms` } as React.CSSProperties}
          >
            {/* the grid's border-top runs along the top of every figure, so
                each cell's box edge is already the visible line: no inset */}
            {stats.map((s) => (
              <div key={s.label} data-perch>
                <b className={s.tone ? `is-${s.tone}` : undefined}>{s.value}</b>
                <small>{s.label}</small>
              </div>
            ))}
          </div>
        </div>

        {/* No data-perch-text here: the cue is a narrow centred column whose
            box already IS its ink, and narrowing to the measured line would
            cost half a pixel of an already tight span. The inset still names
            the top of the lettering. */}
        <a className="v2-cue" href={`#${nextId}`} data-perch data-perch-inset="0.38em">
          <span>Read on</span>
          <svg width="11" height="26" viewBox="0 0 11 26" aria-hidden="true">
            <path
              d="M5.5 0 v20 M1 16 l4.5 5 L10 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
        </a>
      </div>
    </header>
  );
}
