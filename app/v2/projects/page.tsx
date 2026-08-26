'use client';

/* ============================================================================
   /v2/projects — the full index.

   The highlight reel on the home page shows five projects as composed still
   lifes. This is the other half: everything, plainly, in a form you can scan
   and filter. It is a catalogue, so information design wins over spectacle.
   ========================================================================== */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { projects, type Project } from '@/lib/projects-data';
import ProjectCase from '@/components/v2/ProjectCase';
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

export default function V2Projects() {
  const [tag, setTag] = useState<string | null>(null);

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

  return (
    <main className="v2-above v2-projects">
      <div className="v2-wrap">
        <div className="v2-proj-head">
          <p className="v2-eyebrow">Index / Every project</p>
          <Link href="/v2" className="v2-proj-back">Back to the front</Link>
        </div>
        <hr className="v2-rule-hard" />

        <h1 className="v2-display v2-proj-title">Everything, plainly</h1>
        <p className="v2-lede v2-proj-lede">
          {projects.length} projects, newest first. The dissertation, the things
          written from nothing, the client work, and the company.
        </p>
      </div>

      {/* The case, before the catalogue. Jack: "I love the trophy case, this
          is sort of the idea I had with my projects." It is the right treatment
          for THIS page rather than for the spine, because the case answers the
          question the index asks — what is all of it — while the reel on the
          front answers the opposite one, which is what is this one. */}
      <ProjectCase className="v2-proj-case" />

      <div className="v2-wrap">
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
            <ProjectRow key={p.id} project={p} index={i + 1} />
          ))}
        </ol>
      </div>
    </main>
  );
}

function ProjectRow({ project: p, index }: { project: Project; index: number }) {
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
    <li className={`v2-proj-row${open ? ' is-open' : ''}`}>
      <span className="v2-proj-num">{String(index).padStart(2, '0')}</span>
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
