'use client';

/* ============================================================================
   /v2/projects — the full index.

   Two things, in the order they answer questions.

   THE CASE, at the top, holding all fifteen. Jack: "There should be a way to
   see all the projects, maybe on a rotating basis, or a clever layout, from
   the top of the screen with the carousel in view." So the case wears its
   'sheet' dress here: the stage on the left, every project as a tile on the
   right, and the entry for whatever is turned to the front directly under the
   object it belongs to.

   THAT ENTRY USED TO BE TWO. There was a caption under the stage and a raised
   panel below the case, and Jack: "the project entry appears twice, I want the
   higher one (under the turnstile) to be the main one, compress the
   information from the big entry underneath into that smaller one with links."
   So the panel is gone and the caption grew into it: the whole description,
   the stack, the project's own page and everywhere else it lives.

   Losing the panel takes the CHOICE with it. The case had two positions, a
   cursor and a choice, for one reason: something below had to know when a
   reader meant it. With the entry attached to the cursor there is nothing left
   for a choice to open, and a second mark that can drift out of step with the
   first is a mark that lies. The case reports its cursor instead, and the
   catalogue marks the row it is showing.

   THE CATALOGUE, below, unchanged: everything, plainly, filterable. It is the
   scanning view and the entry above is the reading view, which is why the two
   look nothing alike despite coming from the same record.
   ========================================================================== */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { projects, type Project } from '@/lib/projects-data';
import ProjectCase from '@/components/v2/ProjectCase';
import Companion from '@/components/v2/Companion';
import { useSpine } from '@/components/v2/useSpine';
import { askJack } from '@/lib/v2/ask';
import './projects.css';

/* Newest first. The dates are human strings like 'May 2026', so parse rather
   than sort lexically, which would put April before January. */
const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9,
  nov: 10, dec: 11
};

function dateKey(d: string): number {
  const m = d.trim().toLowerCase().match(/^([a-z]+)\s+(\d{4})$/);
  if (!m) return -1; // 'Coming soon' and friends sort to the end
  const month = MONTHS[m[1]];
  const year = Number(m[2]);
  if (month === undefined || !Number.isFinite(year)) return -1;
  return year * 12 + month;
}

/* The bird's lines on this page. It is an index, so he talks about the set
   rather than about any one of them. */
const WHISPERS: Record<string, string[]> = {
  'proj-index': [
    'Turn the case. He modelled every one of those objects by hand.',
    'Fifteen. He will tell you which three he would keep.',
    'Whatever is facing you, its entry is right underneath.'
  ],
  'proj-catalogue': [
    'The whole list. Filter it if you know what you are after.',
    'Newest first, which is not the same as best first.'
  ]
};

export default function V2Projects() {
  const [tag, setTag] = useState<string | null>(null);
  /**
   * WHAT THE CASE IS SHOWING, and WHAT WE LAST ASKED IT TO SHOW.
   *
   * Two different facts, and it matters that they are two. `cursorId` comes
   * back OUT of the case every time the ring turns, by any means, and is what
   * the catalogue marks. `turnTo` goes IN, and only ever from a row number
   * down there.
   *
   * `turnTo` is an object rather than a bare id because a bare id cannot be
   * asked for twice: `setTurnTo(p.id)` with the id it already held is a React
   * bail-out, so the row number would do nothing at all in exactly the case a
   * reader would press it, when they had since turned the case somewhere else.
   * A fresh object each press, and the case keys on its identity.
   */
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [turnTo, setTurnTo] = useState<{ key: string } | null>(null);
  const caseRef = useRef<HTMLDivElement | null>(null);

  const { velocityRef } = useSpine(['proj-index', 'proj-catalogue']);

  const sorted = useMemo(
    () => projects.slice().sort((a, b) => dateKey(b.date) - dateKey(a.date)),
    []
  );

  /* Only offer tags that would actually narrow anything. */
  const tags = useMemo(() => {
    const count = new Map<string, number>();
    projects.forEach((p) => p.tech.forEach((t) => count.set(t, (count.get(t) ?? 0) + 1)));
    return Array.from(count.entries())
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([t]) => t);
  }, []);

  const shown = useMemo(
    () => (tag ? sorted.filter((p) => p.tech.includes(tag)) : sorted),
    [sorted, tag]
  );

  const onCursor = useCallback((id: string) => setCursorId(id), []);

  /* From the catalogue. Never a toggle: pressing a row number is a request to
     go and look at that one, and turning the case away from it down here would
     be a strange answer to it. */
  const onShowInCase = useCallback((id: string) => {
    setTurnTo({ key: id });
  }, []);

  const ask = useCallback((q: string) => askJack(q), []);

  /*
   * The case is held still while the cursor moves.
   *
   * `onCursor` fires on every notch of the wheel and every arrow key, and the
   * only thing on this page that cares is the bar in the catalogue's margin.
   * Without this the case would re-render from above on each one, on top of
   * the re-render it is already doing for itself, for a mark five hundred
   * pixels away. Memoising the element rather than the component keeps the
   * reason next to the state that caused it.
   */
  const theCase = useMemo(
    () => (
      <div ref={caseRef}>
        <ProjectCase
          className="v2-proj-case"
          variant="index"
          onCursor={onCursor}
          chosenKey={turnTo ?? undefined}
        />
      </div>
    ),
    [onCursor, turnTo]
  );

  /*
   * WHERE A ROW NUMBER PUTS YOU.
   *
   * At the top of the case, because the whole point of pressing one is to go
   * and look at the object. The entry travels with it, being part of the same
   * plate now, which is the other half of why the raised panel is not missed:
   * there is nothing left that can be on screen without the thing it describes.
   *
   * Nothing here scrolls when the case is turned by its own controls. A reader
   * working the arrows is already looking at it.
   */
  useEffect(() => {
    if (!turnTo) return;
    caseRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [turnTo]);

  return (
    <>
      <main className="v2-above v2-projects">
        <div className="v2-wrap">
          <div className="v2-proj-head">
            <p className="v2-eyebrow">Index / Every project</p>
            <Link href="/v2" className="v2-proj-back">Back to the front</Link>
          </div>
          <hr className="v2-rule-hard" />

          {/* Deliberately tight. Everything between the top of the page and
              the stage is a tax on Jack's "with the carousel in view", so the
              title and the lede share one row and the case raises no masthead
              of its own. */}
          <div className="v2-proj-masthead" id="proj-index">
            <h1 className="v2-display v2-proj-title">Everything, plainly</h1>
            <p className="v2-lede v2-proj-lede">
              {projects.length} projects, newest first, each one modelled as an
              object and drawn by the same pipeline as the rest of the site.
              Turn the case; the entry under it follows.
            </p>
          </div>
        </div>

        {theCase}

        <div className="v2-wrap" id="proj-catalogue">
          <div className="v2-proj-filters" role="group" aria-label="Filter by technology">
            <button
              type="button"
              className={tag === null ? 'is-on' : undefined}
              onClick={() => setTag(null)}
              aria-pressed={tag === null}
            >
              All
            </button>
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                className={tag === t ? 'is-on' : undefined}
                onClick={() => setTag(tag === t ? null : t)}
                aria-pressed={tag === t}
              >
                {t}
              </button>
            ))}
          </div>

          <p className="v2-data v2-proj-count" aria-live="polite">
            Showing {shown.length} of {projects.length}
          </p>

          <ol className="v2-proj-list">
            {shown.map((p, i) => (
              <ProjectRow
                key={p.id}
                project={p}
                index={i + 1}
                chosen={p.id === cursorId}
                onShowInCase={onShowInCase}
              />
            ))}
          </ol>
        </div>
      </main>

      {/*
        PIP, WHO WAS NOT HERE.

        Jack: "In the all projects page, firstly, there is no pip". He was
        absent for no better reason than that the Companion is mounted per page
        and this page never imported it. Every prop is optional, so the whole
        fix is the mount plus the two things he actually needs: somewhere to
        stand, which the case's stage and the page's headings already declare
        through the perch contract, and something to say.
      */}
      <Companion whispers={WHISPERS} velocityRef={velocityRef} onAsk={ask} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* the catalogue                                                               */
/* -------------------------------------------------------------------------- */

/*
 * MEMOISED, because `chosen` now changes under it constantly.
 *
 * The bar in the margin follows the case's cursor, which moves on every arrow
 * key and every notch of a sideways wheel. Fifteen rows of real markup
 * re-rendering for a three-pixel rule on one of them is a poor trade, and the
 * only thing standing between here and that trade is the callback: an inline
 * `() => onShowInCase(p.id)` is a new function on every render and would defeat
 * this outright. So the row is handed the id back instead.
 */
const ProjectRow = memo(function ProjectRow({
  project: p,
  index,
  chosen,
  onShowInCase
}: {
  project: Project;
  index: number;
  chosen: boolean;
  onShowInCase: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  /*
   * There is no redacted row any more, on purpose.
   *
   * This used to special-case `p.stealth` into a name, a vague line and three
   * black bars. Recensorium launched in August 2026 and nothing in the data
   * sets that flag now, so the branch was dead code that drew a redaction over
   * the best thing on the page — the kind of dead code that comes back. It is
   * gone. If something genuinely undisclosed ever needs listing, it wants a
   * deliberate treatment rather than a resurrected one.
   */

  const links: Array<{ href: string; label: string }> = [];
  if (p.demo) links.push({ href: p.demo, label: 'Live' });
  if (p.github) links.push({ href: p.github, label: 'Source' });
  if (p.paper) links.push({ href: p.paper, label: 'Paper' });
  if (p.linkedin) links.push({ href: p.linkedin, label: 'Write-up' });

  return (
    <li className={`v2-proj-row${open ? ' is-open' : ''}${chosen ? ' is-chosen' : ''}`}>
      {/* The number is the way back UP to the case. A row and a specimen are
          the same project seen twice, and until now the catalogue could only
          send you off the page. */}
      <button
        type="button"
        className="v2-proj-num"
        onClick={() => onShowInCase(p.id)}
        aria-label={`Show ${p.title} in the case`}
      >
        {String(index).padStart(2, '0')}
      </button>
      <div className="v2-proj-main">
        <h2 className="v2-proj-name">
          {p.title}
          {p.status === 'in-progress' ? <em> in progress</em> : null}
        </h2>
        <p className="v2-proj-desc">{p.description}</p>

        <ul className="v2-proj-tech">
          {p.tech.slice(0, 8).map((t) => (
            <li key={t}>{t}</li>
          ))}
          {p.tech.length > 8 ? <li className="is-more">+{p.tech.length - 8}</li> : null}
        </ul>

        {p.features?.length ? (
          <>
            <button
              type="button"
              className="v2-proj-toggle"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
            >
              {open ? 'Fewer details' : `What it does (${p.features.length})`}
            </button>
            {open ? (
              <ul className="v2-proj-features">
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}

        {/* The page for this project always comes first, and it is the only
            link here that is internal: everything else leaves the site. A row
            in an index should be able to open the thing it is indexing. */}
        <p className="v2-proj-links">
          <Link href={`/v2/projects/${p.id}`} className="is-lead">
            The full page
          </Link>
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target={l.href.startsWith('/') ? undefined : '_blank'}
              rel={l.href.startsWith('/') ? undefined : 'noreferrer noopener'}
            >
              {l.label}
            </a>
          ))}
        </p>
      </div>
      <span className="v2-proj-meta">{p.date}</span>
    </li>
  );
});
