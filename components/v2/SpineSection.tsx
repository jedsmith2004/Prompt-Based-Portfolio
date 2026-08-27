'use client';

/* ============================================================================
   SpineSection — the repeating editorial unit of the page.

   Every section is a numbered plate in an engineering journal: a mono eyebrow
   against a hard rule, a display title, a lede set in the reading serif, and an
   optional shelf of real figures. Reveal is a single CSS class flip driven by
   one IntersectionObserver, not a per-element animation library.
   ========================================================================== */

import { Fragment, useEffect, useRef, useState } from 'react';
import { EMPHASIS } from '@/lib/v2/content';
import DecryptedText from './text/DecryptedText';
import CountUp from './text/CountUp';

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


/* ============================================================================
   THE EMPHASIS PASS.

   Jack, 2026-08-27: "The text highlighting is good but feels a bit random.
   Keep it consistent with two for each section ... I don't like the squiggly
   underlined text, it feels like a typo!"

   It was random, and the randomness had a cause worth writing down. The old
   version held ONE flat list of phrases for the whole site and dressed each
   hit with `hit++ % 3`, so the treatment a phrase received depended on how
   many OTHER phrases from that list happened to appear earlier in the same
   paragraph. The same claim could be vermilion on one plate and wavy on the
   next, a plate containing four listed phrases got four marks, and its
   neighbour containing none got none. Nothing about it was authored.

   Now the marks are authored per plate, in lib/v2/content.ts, next to the copy
   they mark, and there are exactly two: the CLAIM in vermilion and the
   MECHANISM on a blue wash. The third treatment, the wavy underline, is gone
   entirely rather than restyled. A squiggle under a phrase means one thing to
   everyone who has used a word processor, and it is "this is wrong".

   The hero's second mark is `live` instead: the phrase resolves out of noise.
   See DecryptedText.

   A phrase that is not found in the text is SKIPPED SILENTLY AND DELIBERATELY.
   The alternative is matching a shortened form somewhere else in the sentence,
   which is how emphasis quietly ends up on the wrong clause after an edit.
   ========================================================================== */

interface Mark {
  at: number;
  len: number;
  tone: 'verm' | 'blue' | 'live';
}

/** Where each authored phrase actually is, in order, without overlaps. */
function locate(text: string, section: string): Mark[] {
  const authored = EMPHASIS[section];
  if (!authored?.length) return [];
  const found: Mark[] = [];
  for (const e of authored) {
    const at = text.indexOf(e.phrase);
    if (at < 0) continue;
    found.push({ at, len: e.phrase.length, tone: e.tone });
  }
  found.sort((a, b) => a.at - b.at);
  /* Two marks that overlap would produce nested <mark>s and a broken split.
     The earlier one wins, which is the one the author listed first. */
  const out: Mark[] = [];
  let cursor = 0;
  for (const m of found) {
    if (m.at < cursor) continue;
    out.push(m);
    cursor = m.at + m.len;
  }
  return out;
}

export interface HighlightedCopyProps {
  text: string;
  /** Section id, or 'top' for the hero. Keys into EMPHASIS. */
  section: string;
}

/** Sets the plate's two authored claims off, and changes nothing else. */
export function HighlightedCopy({ text, section }: HighlightedCopyProps) {
  const marks = locate(text, section);
  if (!marks.length) return <>{text}</>;

  const out: React.ReactNode[] = [];
  let cursor = 0;
  marks.forEach((m, i) => {
    if (m.at > cursor) out.push(<Fragment key={`t${i}`}>{text.slice(cursor, m.at)}</Fragment>);
    const phrase = text.slice(m.at, m.at + m.len);
    out.push(
      <mark key={`m${i}`} className={`v2-em v2-em-${m.tone}`} data-word={phrase}>
        {m.tone === 'live' ? <DecryptedText text={phrase} /> : phrase}
      </mark>
    );
    cursor = m.at + m.len;
  });
  if (cursor < text.length) out.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>);
  return <>{out}</>;
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
            {/* The plate number and its rule arrive out of noise. It is mono,
                it is uppercase, and it is the one line on the plate that is
                machinery rather than prose, so it is the one place a decode
                reads as the page addressing itself rather than as decoration.
                See components/v2/text/DecryptedText.tsx. */}
            <DecryptedText text={eyebrow} duration={620} delay={140} />
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
              <HighlightedCopy text={lede} section={id} />
            </p>
          ) : null}
        </div>

        {stats?.length ? (
          <div className="v2-shelf v2-reveal" style={{ '--d': '210ms' } as React.CSSProperties}>
            {/* the shelf's own border-top runs along the top of every cell, so
                each cell's box edge is already the visible line: no inset */}
            {stats.map((s) => (
              <div key={s.label} className="v2-shelf-cell" data-perch>
                {/* The figure counts to its value the first time the shelf
                    is on screen. Only where the value is ONE number: see
                    parseFigure in components/v2/text/CountUp.tsx, which leaves
                    '4 / 4', 'First', '.obj' and the years alone. */}
                <b className={s.tone ? `is-${s.tone}` : undefined}>
                  <CountUp value={s.value} />
                </b>
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
