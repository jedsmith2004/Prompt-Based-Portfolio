'use client';

/* ============================================================================
   ProjectStory — one project, given a page of its own.

   Jack, 2026-08-26: "each should have its own custom page, with a custom
   background like we're doing here, like a blog post."

   So this is a plate, built the way the spine's plates are built and out of the
   same parts: a palette from lib/v2/palettes, a world from the backdrop
   registry, the editorial furniture from v2.css, and the bird. Which palette
   and which world is decided per project in lib/v2/projectPages.ts, not here,
   because that is a set of eight-way decisions that wants to be read in one
   place rather than reconstructed from fifteen.

   THE PAGE ARRIVES IN ITS KEY AND STAYS THERE. There is no light switch and no
   day dial. Those devices exist because the SPINE changes the light under you
   while you read, and a change needs narrating; a project page is one room, so
   the mode is whatever its plate settles in and nothing ever moves it. That is
   also why usePalette is handed a constant mode here.

   Everything on the page comes from lib/projects-data.ts. Nothing is written
   twice: the index at /v2/projects and this page are the same records read two
   ways.
   ========================================================================== */

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import type { Project } from '@/lib/projects-data';
import { getBackdrop } from './backdrops/registry';
import { usePalette } from './usePalette';
import { useSpine } from './useSpine';
import Companion from './Companion';
import { dressFor } from '@/lib/v2/projectPages';

export interface ProjectStoryProps {
  project: Project;
  /** Newest-first position, for the plate number. */
  index: number;
  total: number;
  prev: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
}

/** The bird's lines, drawn from the record rather than written per project. */
function whispersFor(p: Project): Record<string, string[]> {
  const lines: string[] = [];
  if (p.status === 'in-progress') lines.push('He is still in this one. Mind the edges.');
  else lines.push('This one is finished. He will still tell you what he would change.');
  if (p.tech.length > 8) {
    lines.push(`${p.tech.length} things in the stack. He can name why each one is there.`);
  }
  if (p.paper) lines.push('There is a paper. He would rather you read the code.');
  if (p.github) lines.push('The source is up. That was not optional, apparently.');
  return { [p.id]: lines.length ? lines : ['He built this one. I watched some of it.'] };
}

export default function ProjectStory({
  project: p,
  index,
  total,
  prev,
  next
}: ProjectStoryProps) {
  const dress = useMemo(() => dressFor(p.id), [p.id]);
  const palette = usePalette(dress.plate, dress.mode);

  /* One id, so `active` is constant; what this is really here for is the
     document progress and the live velocity the world reads per frame. */
  const { progress, velocity, velocityRef } = useSpine([`proj-${p.id}`]);

  const backdropPalette = useMemo(
    () => ({
      surface: palette.paper,
      ink: palette.ink,
      ink2: palette.ink2,
      accent: palette.verm,
      accent2: palette.blue
    }),
    [palette.paper, palette.ink, palette.ink2, palette.verm, palette.blue]
  );

  const { Component: World } = useMemo(() => getBackdrop(dress.world), [dress.world]);

  const links = useMemo(() => {
    const out: Array<{ href: string; label: string; lead?: boolean }> = [];
    if (p.demo) out.push({ href: p.demo, label: 'Open it', lead: true });
    if (p.github) out.push({ href: p.github, label: 'Read the source' });
    if (p.paper) out.push({ href: p.paper, label: 'The paper' });
    if (p.linkedin) out.push({ href: p.linkedin, label: 'Write-up' });
    return out;
  }, [p.demo, p.github, p.paper, p.linkedin]);

  const whispers = useMemo(() => whispersFor(p), [p]);

  const ask = useCallback(async (q: string): Promise<string> => {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: q, history: [] })
    });
    if (!res.ok || !res.body) throw new Error(String(res.status));
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let acc = '';
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      acc += dec.decode(r.value, { stream: true });
    }
    return acc.trim() || 'I did not catch that. Ask me another way.';
  }, []);

  return (
    <>
      <div className="v2-worlds" aria-hidden="true" data-world={p.id}>
        <div className="v2-world" data-backdrop={dress.world}>
          <World
            intensity={dress.intensity}
            progress={progress}
            velocity={velocity}
            palette={backdropPalette}
            sectionId={p.id}
          />
        </div>
      </div>

      <main className="v2-above v2-story" id={`proj-${p.id}`}>
        <div className="v2-wrap">
          <div className="v2-story-head">
            <p className="v2-eyebrow">
              {String(index).padStart(2, '0')} <b>/</b> {String(total).padStart(2, '0')} PROJECT
            </p>
            <Link href="/v2/projects" className="v2-story-back">
              Every project
            </Link>
          </div>

          {/* The masthead rule is 2px of solid ink and its box top IS the line,
              so it takes no inset. See THE PERCH CONTRACT in Companion.tsx. */}
          <hr className="v2-rule-hard" data-perch />

          <h1
            className="v2-display v2-story-title"
            data-perch
            data-perch-text
            data-perch-inset="0.06em"
          >
            {p.title}
          </h1>

          <div className="v2-story-meta">
            <span>{p.date}</span>
            <span className={p.status === 'in-progress' ? 'is-live' : undefined}>
              {p.status === 'in-progress' ? 'In progress' : 'Finished'}
            </span>
            <span>
              {p.tech.length} {p.tech.length === 1 ? 'technology' : 'technologies'}
            </span>
          </div>

          <p
            className="v2-lede v2-story-lede"
            data-perch
            data-perch-text
            data-perch-inset="0.33em"
          >
            {p.description}
          </p>

          {links.length ? (
            <p className="v2-story-links" data-perch>
              {links.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  className={l.lead ? 'is-lead' : undefined}
                  target={l.href.startsWith('/') ? undefined : '_blank'}
                  rel={l.href.startsWith('/') ? undefined : 'noreferrer noopener'}
                >
                  {l.label}
                </a>
              ))}
            </p>
          ) : null}
        </div>

        {p.features?.length ? (
          <div className="v2-wrap">
            <div className="v2-story-block">
              <h2 className="v2-story-h2" data-perch data-perch-text data-perch-inset="0.1em">
                What it does
              </h2>
              {/* Numbered because the order is the argument: the first item is
                  the thing the project is for, and the rest are what that cost. */}
              <ol className="v2-story-points">
                {p.features.map((f, i) => (
                  <li key={f} data-perch>
                    <i aria-hidden="true">{String(i + 1).padStart(2, '0')}</i>
                    <span>{f}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : null}

        <div className="v2-wrap">
          <div className="v2-story-block">
            <h2 className="v2-story-h2" data-perch data-perch-text data-perch-inset="0.1em">
              Built with
            </h2>
            <ul className="v2-story-tech">
              {p.tech.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="v2-wrap">
          <nav className="v2-story-nav" aria-label="Other projects">
            {prev ? (
              <Link href={`/v2/projects/${prev.id}`} className="is-prev" data-perch>
                <i aria-hidden="true">Newer</i>
                <span>{prev.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/v2/projects/${next.id}`} className="is-next" data-perch>
                <i aria-hidden="true">Older</i>
                <span>{next.title}</span>
              </Link>
            ) : (
              <span />
            )}
          </nav>

          <div className="v2-story-foot" data-perch>
            <Link href="/v2">Back to the front</Link>
            <Link href="/v2/projects">Every project</Link>
          </div>
        </div>
      </main>

      <Companion
        whispers={whispers}
        activeSection={p.id}
        velocityRef={velocityRef}
        onAsk={ask}
      />
    </>
  );
}
