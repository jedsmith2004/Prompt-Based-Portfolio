'use client';

/* ============================================================================
   AwardsReach — the awards, plotted by the size of the thing they touched.

   THE ARGUMENT
   ------------
   A list of five awards flattens them into five equal rows. That is a lie by
   layout, because one of them is not the same size as the others: a Snapchat
   lens used over a million times is three or four orders of magnitude beyond
   anything else on the page, and a bulleted list renders that as one more
   bullet.

   So this is a plate, not a list. One logarithmic axis, one drawn rule per
   award, and the scale does the arguing. The million-use bar runs the width of
   the plate. Nothing else comes close, and you can see exactly how far off it
   is rather than being told.

   HONESTY IS THE WHOLE DESIGN
   ---------------------------
   The temptation with a chart like this is to fill in the blanks. Four of the
   five awards have no recorded reach figure at all: nobody wrote down how many
   people were in the public speaking audience, or how many teams entered
   hackSheffield 9, or Engineering You're Hired, or how much the Dragon's
   Apprentice venture finally raised. A plausible number could be invented for
   every one of them and no reader would catch it.

   This component refuses to. Three states, all of them visible:

     atLeast     the record says "over N". Plotted to N, terminated in an OPEN
                 arrowhead, because N is a floor and the true figure is to the
                 right of it. Only the Snapchat lens qualifies.

     floor       part of the audience is on the record by name but the total
                 never was. Plotted as a solid rule to the named count, then a
                 DASHED continuation running the full remaining width, refusing
                 to bound it above. Only the public speaking award qualifies:
                 three people are named in the citation, the room was not
                 counted.

     unrecorded  no reach figure exists. NO BAR IS DRAWN. A hollow ring sits at
                 the origin so the row still reads as present on the axis, and
                 the plot column says "not recorded" in words. The citation,
                 placement and date are all still there at full weight, because
                 the row is missing a reach figure, not missing evidence.

   A chart that quietly fabricates its own data is worse than no chart, so the
   gaps are drawn as gaps and the scale is labelled in the caption in plain
   words rather than left to be inferred.

   Every string below traces to public/context.json (`awards[]`). The reach
   classification is editorial, but it is editorial about what the record does
   and does not contain, never about the values themselves. Nothing is
   estimated, rounded up, or filled in.

   WHY THIS IS NOT CANVAS
   ----------------------
   It is a plate of text and hairlines, so it is DOM and CSS. Consequences that
   matter for the house perf rules:

     - There is no frame loop, so nothing is allocated in one.
     - There is no rAF and no timer, so there is nothing to pause offscreen or
       on `document.hidden`, and no DPR to cap. The one-shot reveal is a CSS
       transition, which the compositor already throttles on a hidden tab.
     - After the reveal transition finishes the component is completely inert.
       "Draws in once, then rests" is literal here.
     - Every figure is real selectable text, so it survives zoom, reflow, find
       on page, and copy and paste.

   The only effect is an IntersectionObserver that fires once and disconnects.

   REST STATE IS THE DEFAULT
   -------------------------
   The plate renders FINISHED. Server markup, no-JS, no IntersectionObserver
   and prefers-reduced-motion all land on the complete, correct, legible plate
   with every bar at full length. The animation is opt-in: a layout effect arms
   the from-state before first paint, and only if it can positively confirm
   that motion is wanted and observable. It then disarms itself for good. There
   is no code path where a failure hides the content.
   ========================================================================== */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

/* ========================================================================== */
/*  SCALE                                                                      */
/* ========================================================================== */

/*
   The axis is base-10 logarithmic across seven ticks, 1 through 1,000,000.

   It has to be logarithmic. A million and a single room of people cannot share
   a linear ruler: on a linear axis every award except the lens would collapse
   onto the origin and the plate would show one bar and four invisible ones,
   which is the same flattening the list already does, only ruder.

   The cost of a log axis is that it visually compresses the gap, so the plate
   must never let a reader mistake it for linear. Three things guard that: the
   decade gridlines are drawn through every row, the ticks are labelled with
   full numbers rather than 10^n or a K/M abbreviation, and the caption says
   outright that each gridline is ten times the one before it.
*/
const DECADES = 6;

/*
   The origin sits at 0% of the plot column and 10^6 sits at SPAN_PCT, leaving
   the remaining sliver for the open arrowhead and its label to overrun into
   without clipping. Mirrored in v2.css as --v2-reach-span; the two must agree
   or the bars will drift off the gridlines.
*/
const SPAN_PCT = 91;

/** Decade tick values, 1 through 1,000,000. */
const TICKS: readonly number[] = [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000];

/**
 * A value on the reach axis to a percentage across the plot column.
 * Clamped so a bad figure can never draw outside the plate.
 */
function axisPos(value: number): number {
  if (!(value > 0)) return 0;
  const t = Math.log10(value) / DECADES;
  return Math.max(0, Math.min(1, t)) * SPAN_PCT;
}

/**
 * Which side of its terminus a figure label hangs off. Past the midpoint it
 * must extend leftward or it would run out of the plate.
 */
function labelAnchor(pos: number): 'start' | 'end' {
  return pos >= SPAN_PCT / 2 ? 'end' : 'start';
}

/** Custom properties in a style prop, without loosening the CSSProperties type. */
function vars(v: Record<string, string>): CSSProperties {
  return v as CSSProperties;
}

/* ========================================================================== */
/*  DATA                                                                       */
/* ========================================================================== */

/**
 * How much of an award's reach the record actually contains.
 * See the header: these three cases are the design.
 */
type Reach =
  /** Record states "over N". N is a floor; the terminus is open to the right. */
  | { kind: 'atLeast'; value: number; figure: string }
  /** Part of the audience is named, the total never was. Open above. */
  | { kind: 'floor'; value: number; figure: string }
  /** No reach figure exists. Nothing is plotted. */
  | { kind: 'unrecorded'; figure: string };

interface Entry {
  id: string;
  /** As titled in context.json, trimmed of the redundant "Competition" tail. */
  title: string;
  /** "1st", "2nd", "3rd", "Cash prize". Recorded for every entry. */
  place: string;
  /** Sort key and the figure shown in the meta column. */
  year: string;
  /** Full date as recorded, for the row's accessible description. */
  date: string;
  /** The citation. Concrete, present tense, no adjectives doing sales work. */
  cite: string;
  reach: Reach;
  /**
   * A second recorded figure that is real but is in a different unit from the
   * reach axis, so it is set as a ledger chip rather than plotted. Mixing
   * pounds and people on one axis would be exactly the kind of quiet
   * fabrication this plate exists to avoid.
   */
  ledger?: string;
}

/*
   Chronological ascending. That is both the honest ordering and the one that
   serves the argument, because the million genuinely came first: he did his
   widest-reach work before any of the competition placings.
*/
const ENTRIES: readonly Entry[] = [
  {
    id: 'snap',
    title: 'Snapchat Lens Competition',
    place: 'Cash prize',
    year: '2022',
    date: 'March 2022',
    cite:
      'A lens built while he was still at school, and used over a million times. The prize went to school technology.',
    reach: { kind: 'atLeast', value: 1_000_000, figure: '1,000,000+ uses' },
    ledger: '£1,500 to school technology',
  },
  {
    id: 'dragons',
    title: "Dragon's Apprentice Challenge",
    place: '1st',
    year: '2022',
    date: 'March 2022',
    cite:
      'A £100 seed fund multiplied through a balloon race, an auction and a milkshake stand. It took a creativity award as well as the win.',
    reach: { kind: 'unrecorded', figure: 'Amount raised not recorded' },
    ledger: '£100 seed fund',
  },
  {
    id: 'speaking',
    title: 'Public Speaking Competition',
    place: '2nd',
    year: '2023',
    date: 'March 2023',
    cite:
      'A talk on the legalisation of psychedelics, to an audience including an RAF officer, a police lieutenant and an advisor to the Prime Minister.',
    reach: { kind: 'floor', value: 3, figure: '3 named, room not counted' },
  },
  {
    id: 'hacksheffield',
    title: 'hackSheffield 9',
    place: '1st',
    year: '2024',
    date: 'November 2024',
    cite:
      'Best repository. Judged on structure, documentation and developer experience.',
    reach: { kind: 'unrecorded', figure: 'Cohort size not recorded' },
  },
  {
    id: 'eyh',
    title: "Engineering You're Hired",
    place: '3rd',
    year: '2025',
    date: 'March 2025',
    cite:
      'Decentralised swarm robotics for pipe inspection. He contributed the swarm behaviour and the visual inspection model.',
    reach: { kind: 'unrecorded', figure: 'Cohort size not recorded' },
  },
];

/** Rows whose reach the record actually contains. Used by the caption. */
const PLOTTED = ENTRIES.filter((e) => e.reach.kind !== 'unrecorded').length;

/* ========================================================================== */
/*  REVEAL                                                                     */
/* ========================================================================== */

/*
   'rest'  the finished plate. Server render, no-JS, reduced motion, and the
           permanent state once the reveal has run. No transition attached.
   'armed' the from-state: rules at zero length, termini not yet set down.
           Only ever entered before paint, and only when motion is wanted.
   'drawn' the finished plate again, but arrived at through a transition.
*/
type Phase = 'rest' | 'armed' | 'drawn';

/** useLayoutEffect that does not warn during server render. */
const useIsoLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

/* ========================================================================== */
/*  COMPONENT                                                                  */
/* ========================================================================== */

export interface AwardsReachProps {
  className?: string;
}

export default function AwardsReach({ className }: AwardsReachProps) {
  const headingId = useId();
  const captionId = useId();
  const rootRef = useRef<HTMLElement | null>(null);
  const [phase, setPhase] = useState<Phase>('rest');

  useIsoLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    /* Every reason not to animate, checked before the from-state is ever
       applied. Any one of them leaves the plate finished and correct. */
    if (typeof IntersectionObserver === 'undefined') return;
    let reduced = false;
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      /* no matchMedia: assume reduced and simply do not animate. Declining to
         move is always the safe failure. */
      reduced = true;
    }
    if (reduced) return;

    /* Arm before paint, so the from-state is never a visible flash of a
       finished plate collapsing. */
    setPhase('armed');

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setPhase('drawn');
          /* Once, then rest. The observer releases itself here rather than
             waiting for unmount, so a plate that has been read costs nothing
             for the remainder of the session. */
          io.disconnect();
          return;
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={rootRef}
      className={['v2-reach', `is-${phase}`, className].filter(Boolean).join(' ')}
      aria-labelledby={headingId}
    >
      <header className="v2-reach-head">
        <p className="v2-eyebrow">
          Awards <b>/</b> plotted by reach
        </p>
        <h2 className="v2-h2" id={headingId}>
          Reach, where reach was recorded
        </h2>
        <p className="v2-lede">
          Five awards. Only one of them touched something whose size anybody
          wrote down, and that one touched a million people. The scale below is
          logarithmic because it has to be: a million and an audience in a
          single room cannot share a ruler. Where the figure was never
          recorded, the row is left empty. An estimate would be an invention.
        </p>
      </header>

      <figure className="v2-reach-plate">
        {/*
          The axis is aria-hidden on purpose. Every row states its own figure in
          words, so a screen reader that also walked the tick scale would hear
          "one, ten, one hundred, one thousand" as pure noise before reaching
          any content. The scale itself is explained in the figcaption, which is
          read, and is wired to the plate via aria-describedby.
        */}
        <div className="v2-reach-axis" aria-hidden="true">
          <div className="v2-reach-axis-gutter" />
          <div className="v2-reach-axis-scale">
            {TICKS.map((t, i) => {
              const pos = axisPos(t);
              const last = i === TICKS.length - 1;
              /* First label butts against the origin, last hangs back off the
                 1,000,000 tick, everything between is centred. Otherwise the
                 outer two would overhang the plate. */
              const shift = i === 0 ? '0' : last ? '-100%' : '-50%';
              return (
                <span
                  key={t}
                  className="v2-reach-tick"
                  data-minor={i % 2 === 1 ? 'true' : undefined}
                  style={vars({ '--p': `${pos}%`, '--shift': shift })}
                >
                  <i className="v2-reach-tick-mark" />
                  <b className="v2-reach-tick-label">{t.toLocaleString('en-GB')}</b>
                </span>
              );
            })}
          </div>
        </div>

        <ol
          className="v2-reach-rows"
          role="list"
          aria-describedby={captionId}
        >
          {ENTRIES.map((e, i) => (
            <Row key={e.id} entry={e} index={i} />
          ))}
        </ol>

        <figcaption className="v2-reach-caption" id={captionId}>
          <span className="v2-reach-caption-rule" aria-hidden="true" />
          Horizontal scale: uses or people reached, logarithmic. Each gridline
          is ten times the one before it, from one at the left to one million at
          the right. Figures are taken from the record as written and are never
          rounded up or estimated. Placement and date exist for all five
          entries. Reach exists for {PLOTTED === 1 ? 'one' : PLOTTED}, and the
          other {ENTRIES.length - PLOTTED} are drawn as blank rather than
          guessed at.
        </figcaption>
      </figure>
    </section>
  );
}

/* ========================================================================== */
/*  ROW                                                                        */
/* ========================================================================== */

function Row({ entry, index }: { entry: Entry; index: number }) {
  const { reach } = entry;

  /* Stagger. The rules lay down top to bottom like a plotter arm working down
     the page. Consumed by v2.css as a transition-delay. */
  const delay = `${index * 90}ms`;

  const pos = reach.kind === 'unrecorded' ? 0 : axisPos(reach.value);
  const anchor = labelAnchor(pos);

  return (
    <li
      className="v2-reach-row"
      data-kind={reach.kind}
      style={vars({ '--d': delay, '--p': `${pos}%` })}
    >
      <div className="v2-reach-cite">
        <p className="v2-reach-meta">
          <span className="v2-reach-year">{entry.year}</span>
          <span className="v2-reach-place">{entry.place}</span>
        </p>
        <h3 className="v2-reach-title">{entry.title}</h3>
        <p className="v2-reach-desc">{entry.cite}</p>
        {entry.ledger ? (
          <p className="v2-reach-ledger">
            {/* A real recorded figure in a unit the axis does not carry. It is
                stated, not plotted, because pounds are not people. */}
            <span className="v2-reach-ledger-key">Also recorded</span>
            <span className="v2-reach-ledger-val">{entry.ledger}</span>
          </p>
        ) : null}
      </div>

      <div className="v2-reach-plot">
        <div className="v2-reach-grid" aria-hidden="true" />

        {reach.kind === 'unrecorded' ? (
          <>
            {/* No rule. A hollow ring holds the row's place on the axis so it
                reads as present and empty, rather than as forgotten. */}
            <span className="v2-reach-void" aria-hidden="true" />
            <span className="v2-reach-figure is-absent" data-anchor="start">
              {reach.figure}
            </span>
          </>
        ) : (
          <>
            <span className="v2-reach-bar" aria-hidden="true" />

            {reach.kind === 'floor' ? (
              /* Solid to the named count, then dashed across the entire
                 remaining width. The dash deliberately runs to the end of the
                 axis: the total is unknown, so the plate declines to bound it
                 above rather than implying a small room. */
              <span className="v2-reach-open" aria-hidden="true" />
            ) : null}

            <span className="v2-reach-node" aria-hidden="true">
              {reach.kind === 'atLeast' ? (
                /* An open arrowhead, not a stop. The record says "over a
                   million", so a million is the floor and the true value lies
                   to the right of this mark. */
                <svg
                  className="v2-reach-arrow"
                  viewBox="0 0 12 14"
                  width="12"
                  height="14"
                  focusable="false"
                  aria-hidden="true"
                >
                  <path
                    d="M2 2 L10 7 L2 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <span className="v2-reach-dot" />
              )}
            </span>

            <span className="v2-reach-figure" data-anchor={anchor}>
              {reach.figure}
            </span>
          </>
        )}
      </div>
    </li>
  );
}
