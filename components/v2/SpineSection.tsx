'use client';

/* ============================================================================
   SpineSection — the repeating editorial unit of the page.

   Every section is a numbered plate in an engineering journal: a mono eyebrow
   against a hard rule, a display title, a lede set in the reading serif, and an
   optional shelf of real figures. Reveal is a single CSS class flip driven by
   one IntersectionObserver, not a per-element animation library.
   ========================================================================== */

import { Fragment, useEffect, useRef, useState } from 'react';

export interface Stat {
  value: string;
  label: string;
  /** 'verm' | 'blue' tints the figure; omit for ink. */
  tone?: 'verm' | 'blue';
}

/**
 * A plate title, set word by word, each one lifted out from behind a mask.
 *
 * From the research pass: kinetic typography on a timeline is one of the
 * recurring things award-winning sites do and one of the things this site did
 * not do. The hero has a masked-and-lifted treatment and everything after it
 * was a single block fade, so the page opens with a gesture and then stops
 * making them.
 *
 * Restrained on purpose, because this is an engineering journal and not a
 * showreel: the words arrive in reading order, 55ms apart, from behind the
 * line they belong on. Nothing rotates, nothing scales, no character is set
 * individually. A per-character stagger on a display face at this size reads
 * as a ransom note, and it also multiplies the element count on a page that
 * already runs six canvases.
 *
 * TWO THINGS THAT WOULD BE BUGS WITHOUT CARE.
 *
 * The mask clips descenders. `overflow: hidden` on a line box cuts the tails
 * off g, y, p and j, and half of these titles have one. The mask is padded a
 * fifth of an em below the baseline and pulled back by the same amount, so it
 * hides what is below the line without hiding what hangs off it.
 *
 * The spaces have to be real AND OUTSIDE THE MASK. The first version put the
 * space inside the overflow:hidden wrapper, where it was clipped to nothing:
 * the line still broke correctly, because the line-breaker sees the character
 * in the DOM, but it had no width — so every title rendered as one run of
 * jammed-together words, and `innerText` returned "Writethepipeline". Copying
 * a heading gave you that too. The space is a sibling of the mask now.
 */
function KineticTitle({ text }: { text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((w, i) => (
        <Fragment key={`${w}-${i}`}>
          <span className="v2-kin">
            <span className="v2-kin-i" style={{ '--k': `${i * 55}ms` } as React.CSSProperties}>
              {w}
            </span>
          </span>
          {i < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </>
  );
}

export interface SpineSectionProps {
  id: string;
  eyebrow: string;
  title: string;
  lede?: string;
  stats?: Stat[];
  children?: React.ReactNode;
  /** Rendered hard against the right edge of the header row. */
  aside?: React.ReactNode;
}

/** Flips to true once the element has been scrolled into view, and stays true. */
function useRevealed<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, seen };
}

export default function SpineSection({
  id,
  eyebrow,
  title,
  lede,
  stats,
  children,
  aside
}: SpineSectionProps) {
  const { ref, seen } = useRevealed<HTMLElement>();

  return (
    <section
      id={id}
      ref={ref}
      className={`v2-section${seen ? ' is-in' : ''}`}
      aria-labelledby={`${id}-title`}
    >
      <div className="v2-wrap">
        {/* data-perch: see THE PERCH CONTRACT in components/v2/Companion.tsx.
            The eyebrow, the title and the lede are TEXT, so the bird stands on
            the ink of the first line, not on the top of a column that is
            mostly empty paper. Each inset is the measured distance from the
            content-box top to the highest ink on that line, in em so it
            follows the clamp(). The rule is 2px of solid ink and its box top
            IS the line, so it takes none. */}
        <div className="v2-section-head">
          <p
            className="v2-eyebrow v2-reveal"
            style={{ '--d': '0ms' } as React.CSSProperties}
            data-perch
            data-perch-text
            data-perch-inset="0.38em"
          >
            {eyebrow}
          </p>
          {aside ? <div className="v2-section-aside">{aside}</div> : null}
        </div>

        <hr
          className="v2-rule-hard v2-reveal"
          style={{ '--d': '40ms' } as React.CSSProperties}
          data-perch
        />

        <div className="v2-section-body">
          <h2
            id={`${id}-title`}
            className="v2-h2 v2-reveal"
            style={{ '--d': '90ms' } as React.CSSProperties}
            data-perch
            data-perch-text
            data-perch-inset="0.10em"
          >
            <KineticTitle text={title} />
          </h2>

          {lede ? (
            <p
              className="v2-lede v2-reveal"
              style={{ '--d': '150ms' } as React.CSSProperties}
              data-perch
              data-perch-text
              data-perch-inset="0.33em"
            >
              {lede}
            </p>
          ) : null}
        </div>

        {stats?.length ? (
          <div className="v2-shelf v2-reveal" style={{ '--d': '210ms' } as React.CSSProperties}>
            {/* the shelf's own border-top runs along the top of every cell, so
                each cell's box edge is already the visible line: no inset */}
            {stats.map((s) => (
              <div key={s.label} className="v2-shelf-cell" data-perch>
                <b className={s.tone ? `is-${s.tone}` : undefined}>{s.value}</b>
                <small>{s.label}</small>
              </div>
            ))}
          </div>
        ) : null}

        {children ? <div className="v2-section-extra">{children}</div> : null}
      </div>
    </section>
  );
}
