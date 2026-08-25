'use client';

/* ============================================================================
   SkillsFromWork — the technologies, derived from the work.

   This replaces the floating bubble cloud. A cloud makes frequency into
   decoration: you get a vague impression of size and no way to check it. This
   is a LEDGER. Every technology is a row, ranked, with a real count, a real
   year span, and a bar whose segments you can literally count — one segment
   per project that used it, each segment as wide as that project's recency
   weight. So the bar is simultaneously the chart and the arithmetic: total
   length is the score, segment count is the raw count, segment tone is the era.

   Selecting a row names the projects. Nothing here is a claim without evidence
   attached to it.

   SOURCE OF TRUTH is the `tech` arrays in lib/projects-data.ts, counted at
   runtime. There is no hand-maintained list anywhere in this file, on purpose:
   add a project, the ledger changes. Even the display spelling of a technology
   is derived (see canonicalisation below) rather than mapped by hand.

   No canvas, no rAF, no timers, no observers. The only effect is a synchronous
   cleanup-free `useId`. So there is nothing to pause offscreen and nothing to
   release; the perf rules for the animated pieces do not bite here.
   ========================================================================== */

import { useCallback, useId, useMemo, useState } from 'react';
import { projects as ALL_PROJECTS, type Project } from '@/lib/projects-data';

/* ======================================================================== */
/*  WEIGHTING                                                               */
/* ======================================================================== */

/*
   score(tech) = Σ  recency(project)   over every project whose tech list
                                       contains that technology

   recency(project) = RECENCY_FLOOR + (1 - RECENCY_FLOOR) * 2 ^ (-age / HALF_LIFE)

   where `age` is in years, measured back from the NEWEST project in the data
   rather than from today's clock. Anchoring to the data keeps the numbers
   stable: identical on the server and the client (no hydration drift), and
   they do not quietly decay while nobody is shipping.

   The two constants trade count against recency:

     RECENCY_FLOOR         the least a project can ever be worth, as a
                           fraction of a brand-new one. At 0.5, a single fresh
                           project is worth exactly two ancient ones, so raw
                           count still dominates — five projects (>= 2.5)
                           always outranks one (<= 1.0), which is the point.
                           Lower it to lean harder on recency.

     AGE_HALF_LIFE_YEARS   how fast the non-floor half decays. At 2 years, a
                           project from two years back carries 0.75 of a fresh
                           one; four years back, 0.625.

   Unparseable dates ('Coming soon', a typo, a missing field) fall back to
   NEUTRAL_RECENCY — the midpoint of the range — rather than throwing or
   silently scoring zero. Neutral, never fatal.
*/
export const RECENCY_FLOOR = 0.5;
export const AGE_HALF_LIFE_YEARS = 2;
export const NEUTRAL_RECENCY = RECENCY_FLOOR + (1 - RECENCY_FLOOR) * 0.5;

/* Era bands for the segment tone, in years before the newest project. These
   only colour the bar; they never affect the score or the ordering. */
export const ERA_BAND_YEARS = [1, 2] as const;

/* The default view is the recurring toolkit: anything used on more than one
   project. If the data ever has fewer than MIN_ROWS_SHOWN of those, the table
   tops itself up with the highest-scoring single-use entries so it never
   looks broken. Everything else is one disclosure away. */
export const RECURRING_MIN_PROJECTS = 2;
export const MIN_ROWS_SHOWN = 12;

/* ======================================================================== */
/*  DATE PARSING                                                            */
/* ======================================================================== */

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

/**
 * 'May 2026' | 'Jan 2025' | '2024' -> a fractional year (mid-month), or null.
 * Month names are matched on their first three letters, so both the long and
 * short forms in the data parse. Anything else returns null and is treated as
 * neutral by the caller. This never throws.
 */
export function parseProjectDate(raw: string | undefined | null): number | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  const withMonth = text.match(/^([a-z]+)\.?\s+(\d{4})$/);
  if (withMonth) {
    const stem = withMonth[1].slice(0, 3);
    const index = MONTHS.findIndex((m) => m.startsWith(stem));
    if (index < 0) return null;
    /* mid-month, so a January and a December of the same year differ sensibly */
    return Number(withMonth[2]) + (index + 0.5) / 12;
  }

  const yearOnly = text.match(/^(\d{4})$/);
  if (yearOnly) return Number(yearOnly[1]) + 0.5;

  return null;
}

/* ======================================================================== */
/*  CANONICALISATION                                                        */
/* ======================================================================== */

/**
 * The grouping key for a technology label. Case and punctuation are dropped,
 * which is enough to fold the spelling drift that actually exists in the data
 * ('Typescript'/'TypeScript', 'TailwindCSS'/'Tailwind CSS', 'Next.js') without
 * a synonym table that would rot the moment a new project lands.
 */
function techKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Which spelling to print when several exist for one key. Most-used wins;
 * ties go to the longest (so 'Tailwind CSS' beats 'TailwindCSS'); remaining
 * ties go to lexicographic order, which favours the capitalised form. Fully
 * deterministic, so the same data always renders the same label.
 */
function pickLabel(spellings: Map<string, number>): string {
  let best = '';
  let bestCount = -1;
  spellings.forEach((count, spelling) => {
    if (
      count > bestCount ||
      (count === bestCount && spelling.length > best.length) ||
      (count === bestCount && spelling.length === best.length && spelling < best)
    ) {
      best = spelling;
      bestCount = count;
    }
  });
  return best;
}

/* ======================================================================== */
/*  MODEL                                                                   */
/* ======================================================================== */

export interface TechSource {
  projectId: string;
  title: string;
  /** The raw date string, printed as-is. */
  date: string;
  /** Fractional year, or null when the date could not be parsed. */
  time: number | null;
  /** This project's contribution to the score, RECENCY_FLOOR..1. */
  weight: number;
  /** 0 = newest band, 1 = middle, 2 = oldest. Unparseable dates sit at 1. */
  era: number;
}

export interface TechRow {
  key: string;
  label: string;
  /** Distinct projects using it. A project listing a tech twice counts once. */
  count: number;
  /** Σ of the source weights. */
  score: number;
  /** Newest first; unparseable dates last. */
  sources: TechSource[];
  /** Year span across the parseable sources, or null when none parse. */
  firstYear: number | null;
  lastYear: number | null;
}

export interface TechLedger {
  rows: TechRow[];
  /** Highest score in the ledger, for scaling the bars. Never 0. */
  maxScore: number;
  /** The fractional year the recency curve is measured back from. */
  anchor: number | null;
  /** Projects that contributed at least one technology. */
  contributingProjects: number;
}

/**
 * Count, weight and rank the technologies across a set of projects.
 * Pure: same input, same output, on server and client alike.
 */
export function buildTechLedger(source: readonly Project[]): TechLedger {
  const times = source.map((p) => parseProjectDate(p?.date));
  const parsed = times.filter((t): t is number => t !== null);
  const anchor = parsed.length ? Math.max(...parsed) : null;

  const recency = (time: number | null): number => {
    if (time === null || anchor === null) return NEUTRAL_RECENCY;
    const age = Math.max(0, anchor - time);
    return RECENCY_FLOOR + (1 - RECENCY_FLOOR) * Math.pow(2, -age / AGE_HALF_LIFE_YEARS);
  };

  const eraOf = (time: number | null): number => {
    /* an unparseable date is neutral here too: the middle band, not the oldest */
    if (time === null || anchor === null) return 1;
    const age = Math.max(0, anchor - time);
    if (age < ERA_BAND_YEARS[0]) return 0;
    if (age < ERA_BAND_YEARS[1]) return 1;
    return 2;
  };

  const buckets = new Map<string, { spellings: Map<string, number>; sources: TechSource[] }>();
  let contributingProjects = 0;

  source.forEach((project, index) => {
    /* An absent, empty or malformed tech array must not break the count. It
       simply contributes nothing — which is what a half-filled new entry
       needs, and what anything deliberately left thin would need. */
    const list = Array.isArray(project?.tech) ? project.tech : [];
    const time = times[index];
    const weight = recency(time);
    const era = eraOf(time);

    /* dedupe inside a project, so one project is one unit of evidence */
    const seen = new Set<string>();
    let contributed = false;

    list.forEach((entry) => {
      if (typeof entry !== 'string') return;
      const label = entry.trim();
      if (!label) return;
      const key = techKey(label);
      if (!key || seen.has(key)) return;
      seen.add(key);
      contributed = true;

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { spellings: new Map<string, number>(), sources: [] };
        buckets.set(key, bucket);
      }
      bucket.spellings.set(label, (bucket.spellings.get(label) ?? 0) + 1);
      bucket.sources.push({
        projectId: typeof project.id === 'string' ? project.id : `p${index}`,
        title: typeof project.title === 'string' && project.title ? project.title : 'Untitled project',
        date: typeof project.date === 'string' ? project.date : '',
        time,
        weight,
        era
      });
    });

    if (contributed) contributingProjects += 1;
  });

  const rows: TechRow[] = [];
  buckets.forEach((bucket, key) => {
    const sources = [...bucket.sources].sort((a, b) => {
      if (a.time === null && b.time === null) return a.title.localeCompare(b.title);
      if (a.time === null) return 1;
      if (b.time === null) return -1;
      return b.time - a.time;
    });
    const years = sources
      .filter((s): s is TechSource & { time: number } => s.time !== null)
      .map((s) => Math.floor(s.time));
    rows.push({
      key,
      label: pickLabel(bucket.spellings),
      count: sources.length,
      score: sources.reduce((total, s) => total + s.weight, 0),
      sources,
      firstYear: years.length ? Math.min(...years) : null,
      lastYear: years.length ? Math.max(...years) : null
    });
  });

  rows.sort((a, b) => b.score - a.score || b.count - a.count || a.label.localeCompare(b.label));

  return {
    rows,
    maxScore: rows.length ? Math.max(rows[0].score, 1e-6) : 1,
    anchor,
    contributingProjects
  };
}

/* ======================================================================== */
/*  VIEW HELPERS                                                            */
/* ======================================================================== */

function yearSpan(row: TechRow): string {
  if (row.firstYear === null || row.lastYear === null) return 'n/a';
  if (row.firstYear === row.lastYear) return String(row.firstYear);
  /* 2023–26: the range reads faster than two full years in a narrow column */
  return `${row.firstYear}–${String(row.lastYear).slice(2)}`;
}

const ERA_NAMES = ['within a year', 'one to two years', 'earlier'] as const;

/* ======================================================================== */
/*  COMPONENT                                                               */
/* ======================================================================== */

export interface SkillsFromWorkProps {
  /** Defaults to the real project data. Injectable for tests and stories. */
  projects?: readonly Project[];
  /** Accessible name for the whole figure. */
  label?: string;
  /**
   * Optional link target for a named project in the evidence panel. Return
   * null to leave it as plain text (the default, since nothing on the site
   * currently exposes a per-project anchor).
   */
  projectHref?: (projectId: string) => string | null;
  className?: string;
}

export default function SkillsFromWork({
  projects = ALL_PROJECTS,
  label = 'Technologies ranked by use across the projects',
  projectHref,
  className
}: SkillsFromWorkProps) {
  const ledger = useMemo(() => buildTechLedger(projects), [projects]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const uid = useId();
  const panelId = `${uid}-evidence`;
  const tableId = `${uid}-ledger`;

  const recurring = useMemo(() => {
    const strong = ledger.rows.filter((r) => r.count >= RECURRING_MIN_PROJECTS);
    return strong.length >= MIN_ROWS_SHOWN ? strong : ledger.rows.slice(0, MIN_ROWS_SHOWN);
  }, [ledger.rows]);

  const visible = showAll ? ledger.rows : recurring;
  const hidden = ledger.rows.length - recurring.length;

  const active = useMemo(
    () => ledger.rows.find((r) => r.key === selected) ?? null,
    [ledger.rows, selected]
  );

  /* Escape clears the selection from anywhere inside the figure. Handled on
     the React tree, so there is no document listener to tear down. */
  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && selected !== null) {
      event.stopPropagation();
      setSelected(null);
    }
  }, [selected]);

  if (!ledger.rows.length) {
    return (
      <figure className={['v2-tech', className].filter(Boolean).join(' ')}>
        <figcaption className="v2-eyebrow">Technologies</figcaption>
        <p className="v2-tech-empty">No technologies recorded yet.</p>
      </figure>
    );
  }

  return (
    <figure
      className={['v2-tech', className].filter(Boolean).join(' ')}
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      <div className="v2-tech-grid">
        {/* ---------------------------------------------------------- panel */}
        <div className="v2-tech-side">
          <div className="v2-tech-panel" id={panelId} aria-live="polite">
            <p className="v2-eyebrow v2-tech-panel-head">Evidence</p>
            {active ? (
              <>
                <p className="v2-tech-panel-name">{active.label}</p>
                <p className="v2-tech-panel-meta">
                  <b>{active.count}</b> {active.count === 1 ? 'project' : 'projects'}
                  <span aria-hidden="true"> · </span>
                  {yearSpan(active)}
                  <span aria-hidden="true"> · </span>
                  weight {active.score.toFixed(2)}
                </p>
                <ol className="v2-tech-panel-list">
                  {active.sources.map((s) => {
                    const href = projectHref ? projectHref(s.projectId) : null;
                    return (
                      <li key={s.projectId}>
                        {href ? <a href={href}>{s.title}</a> : <span>{s.title}</span>}
                        <small>{s.date || 'undated'}</small>
                      </li>
                    );
                  })}
                </ol>
              </>
            ) : (
              <p className="v2-tech-panel-empty">
                Choose a technology in the ledger to see which projects it came from.
              </p>
            )}
          </div>

          <ul className="v2-tech-legend" aria-hidden="true">
            {ERA_NAMES.map((name, era) => (
              <li key={name}>
                <i className={`is-era-${era}`} />
                {name}
              </li>
            ))}
          </ul>
          <p className="v2-tech-note">
            Counted from the project data itself. Bar length is use weighted by
            recency; each block is one project, measured back from the most
            recent.
          </p>
        </div>

        {/* --------------------------------------------------------- ledger */}
        <div className="v2-tech-tablewrap">
          <table className="v2-tech-table" id={tableId}>
            <caption className="v2-tech-caption">
              {ledger.rows.length} technologies across {ledger.contributingProjects} projects,
              ranked by how often and how recently they were used.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="v2-tech-col-rank">#</th>
                <th scope="col" className="v2-tech-col-name">Technology</th>
                <th scope="col" className="v2-tech-col-bar">Weight</th>
                <th scope="col" className="v2-tech-col-num">Projects</th>
                <th scope="col" className="v2-tech-col-years">Years</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) => {
                const isActive = row.key === selected;
                const fraction = Math.max(row.score / ledger.maxScore, 0.02);
                return (
                  /* The bird lands on the ledger rows. See THE PERCH CONTRACT
                     in components/v2/Companion.tsx. Every row carries a
                     border-bottom, and with collapsed borders that rule is
                     drawn along the top edge of the row below it, so a row's
                     box top IS a visible line and needs no inset. The head's
                     2px rule does the same job for the first row. */
                  <tr key={row.key} className={isActive ? 'is-active' : undefined} data-perch>
                    <td className="v2-tech-col-rank">{index + 1}</td>
                    <th scope="row" className="v2-tech-col-name">
                      <button
                        type="button"
                        className="v2-tech-name"
                        aria-expanded={isActive}
                        aria-controls={panelId}
                        onClick={() => setSelected(row.key)}
                        onFocus={() => setSelected(row.key)}
                      >
                        {row.label}
                      </button>
                    </th>
                    <td className="v2-tech-col-bar">
                      <span className="v2-tech-track">
                        <span
                          className="v2-tech-fill"
                          style={{ width: `${(fraction * 100).toFixed(3)}%` }}
                          aria-hidden="true"
                        >
                          {row.sources.map((s) => (
                            <span
                              key={s.projectId}
                              className={`v2-tech-seg is-era-${s.era}`}
                              style={{ flexGrow: s.weight }}
                              title={`${s.title} · ${s.date || 'undated'}`}
                            />
                          ))}
                        </span>
                      </span>
                    </td>
                    <td className="v2-tech-col-num">{row.count}</td>
                    <td className="v2-tech-col-years">{yearSpan(row)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {hidden > 0 && (
            <button
              type="button"
              className="v2-tech-more"
              aria-expanded={showAll}
              aria-controls={tableId}
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll
                ? `Show the recurring ${recurring.length} only`
                : `Show all ${ledger.rows.length}, including ${hidden} used once`}
            </button>
          )}
        </div>
      </div>
    </figure>
  );
}
