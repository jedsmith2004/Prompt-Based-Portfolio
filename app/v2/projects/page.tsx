'use client';

/* ============================================================================
   /v2/projects — the full index.

   Three things, in the order they answer questions.

   THE CASE, at the top, holding all fifteen. Jack: "There should be a way to
   see all the projects, maybe on a rotating basis, or a clever layout, from
   the top of the screen with the carousel in view." So the case wears its
   'sheet' dress here: the stage on the left, every project as a tile on the
   right, both above the fold. The carousel turns without committing to
   anything, because the tiles are already telling you what is in it.

   THE ENTRY, raised under the case when you choose one. "When a project is
   selected, it's article entry should come up." Choosing is a click or Enter,
   not merely arriving, which is the whole reason the case has a cursor and a
   choice rather than one index for both.

   THE CATALOGUE, below, unchanged: everything, plainly, filterable. It is the
   scanning view and the entry above is the reading view, which is why the two
   look nothing alike despite coming from the same record.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    'Pick one and the entry comes up underneath.'
  ],
  'proj-catalogue': [
    'The whole list. Filter it if you know what you are after.',
    'Newest first, which is not the same as best first.'
  ]
};

export default function V2Projects() {
  const [tag, setTag] = useState<string | null>(null);
  /**
   * The project whose entry is open. Null until something is chosen: an empty
   * panel sitting between the case and the catalogue would be a hole, and the
   * layout shift when it fills is one the reader just asked for.
   */
  const [chosenId, setChosenId] = useState<string | null>(null);
  const entryRef = useRef<HTMLDivElement | null>(null);

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

  const chosen = useMemo(
    () => (chosenId ? projects.find((p) => p.id === chosenId) ?? null : null),
    [chosenId]
  );

  /* Choosing the open one closes it, so the tile is a switch rather than a
     one-way door with no handle on the inside. */
  const onChoose = useCallback((id: string) => {
    setChosenId((prev) => (prev === id ? null : id));
  }, []);

  const ask = useCallback((q: string) => askJack(q), []);

  /*
   * `block: 'nearest'` and nothing else.
   *
   * The entry is directly under the plate, so on a laptop it usually arrives
   * already on screen and this does nothing at all, which is correct: the
   * reader asked to see a project, not to be moved. It only scrolls when the
   * panel genuinely fell below the fold, and then only far enough, so the
   * carousel stays where Jack asked for it to be.
   */
  useEffect(() => {
    if (!chosenId) return;
    entryRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [chosenId]);

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
              Turn the case, then choose one.
            </p>
          </div>
        </div>

        <ProjectCase
          className="v2-proj-case"
          variant="index"
          onChoose={onChoose}
          chosenId={chosenId ?? undefined}
        />

        {chosen ? (
          <div className="v2-wrap">
            <div className="v2-proj-entry" ref={entryRef} aria-live="polite">
              <ProjectEntry
                project={chosen}
                index={sorted.findIndex((p) => p.id === chosen.id) + 1}
                total={sorted.length}
                onClose={() => setChosenId(null)}
              />
            </div>
          </div>
        ) : null}

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
                chosen={p.id === chosenId}
                onShowInCase={() => setChosenId(p.id)}
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
/* the raised entry                                                            */
/* -------------------------------------------------------------------------- */

function ProjectEntry({
  project: p,
  index,
  total,
  onClose
}: {
  project: Project;
  index: number;
  total: number;
  onClose: () => void;
}) {
  const links: Array<{ href: string; label: string }> = [];
  if (p.demo) links.push({ href: p.demo, label: 'Open it' });
  if (p.github) links.push({ href: p.github, label: 'Read the source' });
  if (p.paper) links.push({ href: p.paper, label: 'The paper' });
  if (p.linkedin) links.push({ href: p.linkedin, label: 'Write-up' });

  return (
    <article className="v2-proj-entry-card">
      <header className="v2-proj-entry-head">
        <p className="v2-eyebrow">
          {String(index).padStart(2, '0')} <b>/</b> {String(total).padStart(2, '0')}
          <span aria-hidden="true"> / </span>
          {p.date}
          {p.status === 'in-progress' ? <span> / in progress</span> : null}
        </p>
        <button type="button" className="v2-proj-entry-close" onClick={onClose}>
          Close
        </button>
      </header>

      {/* h2 rather than h1: the page already has one, and this is a part of it
          rather than a page of its own. The page of its own is the link. */}
      <h2 className="v2-proj-entry-title" data-perch data-perch-text data-perch-inset="0.12em">
        {p.title}
      </h2>
      <p className="v2-proj-entry-body">{p.description}</p>

      {p.features?.length ? (
        <ul className="v2-proj-entry-features">
          {p.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}

      <ul className="v2-proj-entry-tech">
        {p.tech.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>

      <p className="v2-proj-entry-links" data-perch>
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
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* the catalogue                                                               */
/* -------------------------------------------------------------------------- */

function ProjectRow({
  project: p,
  index,
  chosen,
  onShowInCase
}: {
  project: Project;
  index: number;
  chosen: boolean;
  onShowInCase: () => void;
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
        onClick={onShowInCase}
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
}
