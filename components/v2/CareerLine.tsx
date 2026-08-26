'use client';

/* ============================================================================
   CareerLine — the roles laid along one time axis, with the degree underneath.

   THE ARGUMENT
   ------------
   A vertical stack of dated cards says: first this, then that, then the other.
   That is the wrong sentence about this CV. Nothing here queued up. The web
   studio was taking real clients while the dissertation was open, the London
   contract landed in the graduating year, and the degree ran underneath all
   three of them from start to finish. A stacked list renders concurrency as
   sequence, which is the one fact it most needs to carry.

   So time runs along the horizontal, one column per calendar year, and each
   role is a bar occupying the years it actually touched. Bars in different
   tracks that sit above one another were running at the same time. The degree
   is a band beneath the whole plate, because that is where the other three
   sat. The reader sees the density instead of reading a claim about it, and
   the axis counts how many things were running in each year so the busiest
   column names itself.

   HONESTY ABOUT RESOLUTION
   ------------------------
   The record gives years. `experience[]` in public/context.json says
   "2023 - 2024", "2025 - Present", "2026", and nothing finer. Months are not
   on the record for any of it, and a Gantt chart is an invitation to invent
   them: nudge a bar to March, taper it in September, and the plate reads as
   precise while being fiction.

   This one refuses, and makes the refusal visible:

     - The grid is one column per calendar year, and a bar fills whole cells
       only. A filled cell means "this year", never "all of this year". The
       caption says so in plain words rather than leaving it to be inferred.
     - The London role is recorded as short term inside 2026. Its bar is
       hatched rather than solid: the cell is the only thing the record
       supports, and the hatch says the true extent is smaller and unrecorded.
     - The open role has no end date on the record, so its bar terminates in a
       dashed run and an open arrowhead. That is "no end recorded", not an end
       date quietly omitted.
     - Graduation is a year, not a day. It is marked with a bracket under the
       2026 cell, an interval rather than a point, because a dot on a line
       would be a claim about a month nobody wrote down.

   Traceability. The three roles, their periods and their substance come from
   `experience[]` in public/context.json. The degree span is the one derived
   figure on the plate: sixth form ends 2023 and the degree concludes 2026,
   both from cv/cv.html, so the band runs 2023 to 2026. It is drawn at the same
   year resolution as everything else and claims nothing finer.

   WHY THIS IS NOT CANVAS
   ----------------------
   It is hairlines, bars and set text, so it is DOM and CSS. The consequences
   the house perf rules care about:

     - No frame loop, therefore nothing allocated in one.
     - No rAF and no timer, so there is nothing to pause offscreen or on
       `document.hidden`, and no DPR to cap. The reveal is a CSS transition,
       which the compositor already throttles on a hidden tab.
     - Once the reveal transition ends the component is inert. The only thing
       that ever moves again is a hover or focus state, and a state is not
       motion: it still resolves under prefers-reduced-motion, just instantly.
     - Every date, role and figure is real selectable text, so it survives
       zoom, reflow, find on page and copy and paste.

   The only effect is an IntersectionObserver that fires once and disconnects.

   REST STATE IS THE DEFAULT
   -------------------------
   The plate renders FINISHED. Server markup, no-JS, no IntersectionObserver
   and prefers-reduced-motion all land on the complete plate with every bar at
   full length. The animation is opt-in: a layout effect arms the from-state
   before first paint, and only once it has positively confirmed that motion is
   wanted and observable. There is no code path where a failure hides content.

   SEMANTICS
   ---------
   The chart is decoration over text: it is `aria-hidden`, and every fact it
   draws is set as real prose beneath it. The roles are an ordered list, in
   chronological order, inside a figure with a caption. Each entry is focusable
   and lights its own span in the chart on hover or focus, so a keyboard reader
   gets the same "what else was running then" reading a mouse does.
   ========================================================================== */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

/* ========================================================================== */
/*  SCALE                                                                      */
/* ========================================================================== */

/*
   Four calendar-year columns. Hardcoded rather than derived from `new Date()`
   on purpose: every other figure on this plate is hardcoded from the record,
   a clock read during render differs between server and client across a New
   Year boundary, and the axis should change when the record changes, not when
   midnight passes. Extend YEARS when a role extends.
*/
const YEARS: readonly number[] = [2023, 2024, 2025, 2026];
const FIRST_YEAR = YEARS[0];
const LAST_YEAR = YEARS[YEARS.length - 1];

/*
   The grid occupies SPAN_PCT of the field. The remaining sliver carries the
   open terminus and any right-anchored label, so neither can be clipped.
   Mirrored in v2.css as --v2-career-span: the two must agree or the bars will
   drift off the gridlines.
*/
const SPAN_PCT = 88;
const CELL_PCT = SPAN_PCT / YEARS.length;

/** Left edge of a year cell, as a percentage across the field. */
function cellStart(year: number): number {
  return ((year - FIRST_YEAR) / YEARS.length) * SPAN_PCT;
}

/** Right edge of a year cell, as a percentage across the field. */
function cellEnd(year: number): number {
  return ((year - FIRST_YEAR + 1) / YEARS.length) * SPAN_PCT;
}

/**
 * Which side of the bar its label hangs from. Past the midpoint a label set
 * from the left would run out of the plate, so it anchors to the bar's end and
 * extends back over its own bar.
 */
function labelAnchor(x: number): 'start' | 'end' {
  return x > SPAN_PCT / 2 ? 'end' : 'start';
}

/** Custom properties in a style prop, without loosening the CSSProperties type. */
function vars(v: Record<string, string>): CSSProperties {
  return v as CSSProperties;
}

/* ========================================================================== */
/*  DATA                                                                       */
/* ========================================================================== */

interface Band {
  id: string;
  /** First calendar year the record places this in. */
  from: number;
  /** Last calendar year the record places this in. For an open band, the last
      year on the axis: it is where the bar is drawn to, not a claimed end. */
  to: number;
  /** No end date on the record. Drawn with a dashed run and an open head. */
  open?: boolean;
  /** Known to be shorter than the cells it occupies, extent unrecorded. */
  partial?: boolean;
}

interface Role extends Band {
  /** Plate number. Printed on the bar and again on the ledger entry, so the
      two halves of the figure can be read against each other. */
  index: string;
  /** Short form, set on the bar in mono. */
  short: string;
  /** As recorded in context.json. */
  period: string;
  role: string;
  org: string;
  /** What the bar cannot say. Concrete, present tense, no sales adjectives. */
  note: string;
  /** The resolution caveat this row carries, if any. Set beside the period. */
  caveat?: string;
}

/* Chronological ascending, so the plate reads as accumulation rather than as
   a countdown, and so the ledger below matches the order of the tracks. */
const ROLES: readonly Role[] = [
  {
    id: 'falcon',
    index: '01',
    short: 'Project Falcon',
    from: 2023,
    to: 2024,
    period: '2023 — 2024',
    role: 'Missions Engineer',
    org: 'Project Falcon, IMechE UAS team',
    note:
      'The flight ground control system for the team’s aircraft, written in Node and Python. Telemetry came off the airframe live, and the dashboard recorded it and drew it as it arrived.',
  },
  {
    /*
     * CORRECTED 2026-08-26, on Jack's word: "UCD only lasted for 2025."
     *
     * It was drawn open, running to the right-hand edge of the axis, because
     * context.json still records the period as running to present. It does
     * not. A studio that closed drawn as a studio that is still taking clients
     * is not a rounding error, it is a false claim about what he is doing now,
     * and it was the "career line is slightly off" he flagged and I could not
     * place. One closed year, no open terminus, no caveat.
     */
    id: 'ucd',
    index: '02',
    short: 'UCD, his own studio',
    from: 2025,
    to: 2025,
    period: '2025',
    role: 'Full Stack Developer',
    org: 'UCD, his own web studio',
    note:
      'His own studio, run for real clients. Discovery, design, the full-stack build, deployment and the maintenance afterwards, the whole lifecycle carried by one pair of hands.',
  },
  {
    id: 'startup',
    index: '03',
    short: 'AI startup, London',
    from: 2026,
    to: 2026,
    partial: true,
    period: '2026',
    /* "The AI startup was only in the first part of 2026." The record still
       has no months, so the bar stays hatched: what is known is that it did
       not fill the year, and where inside the year is his word, not a date. */
    caveat: 'Early 2026, months not recorded',
    role: 'Software Engineer, short term',
    org: 'Early-stage AI startup, London',
    note:
      'An internal API laid over systems that did not talk to each other. He rewrote several Cloudflare Workers including the GitHub syncing, then delivered a dashboard, a CLI and an MCP server on top of it.',
  },
  {
    /*
     * "We also have to put Recensorium on in 2026." It is the flagship and it
     * was the one thing missing from the plate that argues what he is doing.
     * Open, because it is running: he founded the company and it launched.
     *
     * Nothing here counts users, traffic or revenue, and nothing here may.
     * The company is launched and pre-launch commercially, so this describes
     * what is built and how the mechanism works, which is the honest and by
     * some distance the more interesting half anyway.
     */
    id: 'recensorium',
    index: '04',
    short: 'Recensorium',
    from: 2026,
    to: LAST_YEAR,
    open: true,
    period: '2026 — present',
    caveat: 'No end recorded',
    role: 'Founder and Engineer',
    org: 'Recensorium Ltd',
    note:
      'Peer review for AI-generated research. Agents publish papers over a REST API or an MCP server and are assigned other agents’ work to review, by a weighted bandit that makes it impossible for an agent to pick what it reviews. Five apps in one TypeScript monorepo on Postgres, Fly.io and Cloudflare Workers, built solo.',
  },
];

/*
   The degree. Not a role, so it is not in the list above and does not carry a
   plate number: it is the ground the other three stand on, and it is drawn as
   a band under all of them rather than as a fourth track.
*/
const DEGREE: Band & { label: string; grad: number } = {
  id: 'degree',
  from: FIRST_YEAR,
  to: LAST_YEAR,
  label: 'BSc Computer Science, Sheffield',
  /** The year the degree concluded. A year, and marked as a year. */
  grad: 2026,
};

/*
   The lede counts the roles in words, and counts them from the list rather
   than stating a number. It said "Three roles" while the array held three,
   and adding Recensorium would have made the first sentence on the plate
   false. A figure written next to the data it describes should be read from
   it.
*/
const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];
const ROLE_COUNT_WORD = NUMBER_WORDS[ROLES.length] ?? String(ROLES.length);

/** Geometry for a band, in percentages across the field. */
function geometry(b: Band): { x: number; w: number } {
  const x = cellStart(b.from);
  return { x, w: cellEnd(b.to) - x };
}

/**
 * How many of the four things were running in a given year. Derived, never
 * asserted: it counts the bands the record already places in that year, the
 * degree included. This is the figure the plate exists to make visible.
 */
function runningIn(year: number): number {
  const bands: readonly Band[] = [...ROLES, DEGREE];
  return bands.filter((b) => year >= b.from && year <= b.to).length;
}

/* ========================================================================== */
/*  REVEAL                                                                     */
/* ========================================================================== */

/*
   'rest'  the finished plate. Server render, no-JS, reduced motion, and the
           permanent state once the reveal has run. No transition attached.
   'armed' the from-state: bars at zero length, labels not yet set down. Only
           ever entered before paint, and only when motion is wanted.
   'drawn' the same finished plate, arrived at through a transition.
*/
type Phase = 'rest' | 'armed' | 'drawn';

/** useLayoutEffect that does not warn during server render. */
const useIsoLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

/* ========================================================================== */
/*  COMPONENT                                                                  */
/* ========================================================================== */

export interface CareerLineProps {
  className?: string;
}

export default function CareerLine({ className }: CareerLineProps) {
  const headingId = useId();
  const captionId = useId();
  const degreeId = useId();
  const rootRef = useRef<HTMLElement | null>(null);

  const [phase, setPhase] = useState<Phase>('rest');

  /*
     Which span is lit. A state, not an animation: it is set by hover and by
     focus alike, so the keyboard reading and the mouse reading are the same
     one. Null is the resting value and the plate is complete without it.
  */
  const [lit, setLit] = useState<string | null>(null);

  const litGeometry = useMemo(() => {
    if (!lit) return null;
    const band: Band | undefined =
      lit === DEGREE.id ? DEGREE : ROLES.find((r) => r.id === lit);
    return band ? geometry(band) : null;
  }, [lit]);

  useIsoLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    /* Every reason not to animate, checked before the from-state is applied.
       Any one of them leaves the plate finished and correct. */
    if (typeof IntersectionObserver === 'undefined') return;
    let reduced = false;
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      /* No matchMedia: assume reduced and do not animate. Declining to move is
         always the safe failure. */
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
             for the rest of the session. */
          io.disconnect();
          return;
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const peak = Math.max(...YEARS.map(runningIn));
  const peakYear = YEARS.find((y) => runningIn(y) === peak) ?? LAST_YEAR;
  const degreeGeom = geometry(DEGREE);
  const gradX = cellStart(DEGREE.grad);

  return (
    <section
      ref={rootRef}
      className={['v2-career', `is-${phase}`, className].filter(Boolean).join(' ')}
      aria-labelledby={headingId}
    >
      <header className="v2-career-head">
        <p className="v2-eyebrow">
          Career <b>/</b> laid along one axis
        </p>
        <h2 className="v2-h2" id={headingId}>
          The roles ran inside the degree
        </h2>
        <p className="v2-lede">
          {ROLE_COUNT_WORD} roles and a degree on one time axis, a column to the
          year. They do not queue up behind each other: the studio was taking
          real clients while the dissertation was still open, and by {peakYear}{' '}
          there were {peak} things running at once. The plate is drawn at the
          resolution the record actually has, which is the year.
        </p>
      </header>

      <figure className="v2-career-plate">
        {/*
          Decoration over text. Every date, role and figure the chart draws is
          set as prose below it, so nothing is lost by hiding it here, and a
          screen reader is spared a field of positioned hairlines.
        */}
        <div className="v2-career-chart" aria-hidden="true">
          <div className="v2-career-axis">
            {YEARS.map((year) => (
              <span
                className="v2-career-tick"
                key={year}
                style={vars({ '--x': `${cellStart(year)}%`, '--w': `${CELL_PCT}%` })}
              >
                <b>{year}</b>
                <i>{runningIn(year)} running</i>
              </span>
            ))}
          </div>

          <div className="v2-career-field">
            <div className="v2-career-grid">
              {YEARS.map((year) => (
                <span
                  className="v2-career-gridline"
                  key={year}
                  style={vars({ '--x': `${cellStart(year)}%` })}
                />
              ))}
              <span
                className="v2-career-gridline is-last"
                style={vars({ '--x': `${SPAN_PCT}%` })}
              />
            </div>

            {/* The lit span. Always mounted, so lighting it costs an opacity
                change rather than a mount, and never a layout. */}
            <div
              className="v2-career-edges"
              data-on={litGeometry ? 'true' : 'false'}
              style={vars({
                '--x': `${litGeometry ? litGeometry.x : 0}%`,
                '--w': `${litGeometry ? litGeometry.w : 0}%`,
              })}
            >
              <span className="v2-career-edge is-a" />
              <span className="v2-career-edge is-b" />
            </div>

            <div className="v2-career-tracks">
              {ROLES.map((r, i) => {
                const g = geometry(r);
                return (
                  <div
                    className={[
                      'v2-career-track',
                      lit === r.id ? 'is-lit' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={r.id}
                    onMouseEnter={() => setLit(r.id)}
                    onMouseLeave={() => setLit((c) => (c === r.id ? null : c))}
                  >
                    <span
                      className="v2-career-barlabel"
                      data-anchor={labelAnchor(g.x)}
                      style={vars({
                        '--x': `${g.x}%`,
                        '--w': `${g.w}%`,
                        '--d': `${420 + i * 130}ms`,
                      })}
                    >
                      <b>{r.index}</b> <span>{r.short}</span>
                    </span>
                    {/* data-perch on the bar itself. Jack, 2026-08-26, of
                        plate 04: "pip can't land on some of the items." The
                        bars are the items, and they are the best perches on
                        the page: a bar IS a horizontal line of solid ink, so
                        the box edge is the mark and there is no inset. A bar
                        narrower than the bird is rejected by the harvester on
                        its own, which is the right answer for a role that
                        lasted one year on a nine year axis. */}
                    <span
                      className="v2-career-bar"
                      data-partial={r.partial ? 'true' : undefined}
                      data-perch
                      style={vars({
                        '--x': `${g.x}%`,
                        '--w': `${g.w}%`,
                        '--d': `${240 + i * 130}ms`,
                      })}
                    />
                    {/* The open terminus is a sibling of the bar, not a child:
                        the bar reveals by scaling on its own axis, and a child
                        would be squashed along with it. */}
                    {r.open ? (
                      <span
                        className="v2-career-open"
                        style={vars({
                          '--x': `${g.x + g.w}%`,
                          '--d': `${820 + i * 130}ms`,
                        })}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div
              className={[
                'v2-career-degreeband',
                lit === DEGREE.id ? 'is-lit' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => setLit(DEGREE.id)}
              onMouseLeave={() => setLit((c) => (c === DEGREE.id ? null : c))}
            >
              <span
                className="v2-career-band"
                data-perch
                style={vars({
                  '--x': `${degreeGeom.x}%`,
                  '--w': `${degreeGeom.w}%`,
                  '--d': '0ms',
                })}
              />
              <span
                className="v2-career-bandlabel"
                style={vars({ '--x': `${degreeGeom.x}%`, '--d': '620ms' })}
              >
                {DEGREE.label}
              </span>

              {/* An interval, not a point. The bracket spans the year cell
                  because the year is all the record holds. */}
              <span
                className="v2-career-grad"
                style={vars({
                  '--x': `${gradX}%`,
                  '--w': `${CELL_PCT}%`,
                  '--d': '980ms',
                })}
              >
                <span className="v2-career-grad-mark" />
                <span className="v2-career-grad-label">
                  Graduated, first class
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Focusable for the same reason the ledger entries are: it is the
            degree's handle, and lighting the band under the whole plate should
            not be a thing only a mouse can do. */}
        <p
          className={['v2-career-degreeline', lit === DEGREE.id ? 'is-lit' : '']
            .filter(Boolean)
            .join(' ')}
          id={degreeId}
          /* 2px of solid rule along the top: box edge, no inset. */
          data-perch
          tabIndex={0}
          onMouseEnter={() => setLit(DEGREE.id)}
          onMouseLeave={() => setLit((c) => (c === DEGREE.id ? null : c))}
          onFocus={() => setLit(DEGREE.id)}
          onBlur={() => setLit((c) => (c === DEGREE.id ? null : c))}
        >
          <span className="v2-career-degreeline-key">Underneath all of it</span>
          BSc Computer Science, University of Sheffield, 2023 to 2026. He
          graduated with a first. Every role above sits inside that span.
        </p>

        <ol className="v2-career-ledger">
          {ROLES.map((r) => (
            <li
              className={['v2-career-entry', lit === r.id ? 'is-lit' : '']
                .filter(Boolean)
                .join(' ')}
              key={r.id}
              /* the entry's own border-top is the visible line */
              data-perch
              tabIndex={0}
              onMouseEnter={() => setLit(r.id)}
              onMouseLeave={() => setLit((c) => (c === r.id ? null : c))}
              onFocus={() => setLit(r.id)}
              onBlur={() => setLit((c) => (c === r.id ? null : c))}
            >
              <p className="v2-career-entry-when">
                <b>{r.index}</b>
                <span className="v2-career-entry-period">{r.period}</span>
                {r.caveat ? (
                  <span className="v2-career-entry-caveat">{r.caveat}</span>
                ) : null}
              </p>
              <h3 className="v2-career-entry-role">{r.role}</h3>
              <p className="v2-career-entry-org">{r.org}</p>
              <p className="v2-career-entry-note">{r.note}</p>
            </li>
          ))}
        </ol>

        <figcaption className="v2-career-caption" id={captionId}>
          <span className="v2-career-caption-rule" />
          One column is one calendar year. The record keeps years and not
          months, so a bar fills the cells it touches and claims nothing inside
          them: a filled cell means that year, not the whole of it. The hatched
          bar was short term within 2026 and its months were never written down.
          An open terminus means no end date on the record rather than an end
          date left off. The bracket under the degree marks the year he
          graduated for the same reason, an interval rather than a point.
          Hovering or focusing a role draws its start and end down through the
          other tracks.
        </figcaption>
      </figure>
    </section>
  );
}
