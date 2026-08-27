'use client';

/* ============================================================================
   /clippings — the five cuttings, listed.

   The wall on the front page is the real index: it is the thing you look at,
   and it is where a reader will actually find these. This exists because a
   section whose pages live under /clippings/ and whose own address 404s is a
   section with a hole in it — the back links on every article page point here,
   and so does the sitemap.

   It is deliberately the plainest page on the site and it borrows the project
   catalogue's furniture wholesale, down to the class names. The two are the
   same object: a numbered list of things, newest first, each with a name, a
   line, some tags and a way in. Giving it a second set of styles that looked
   almost the same would be two things to keep in step for no gain.

   Metadata is in the sibling layout, because this mounts the companion and is
   therefore a client component. See app/clippings/layout.tsx.
   ========================================================================== */

import { useCallback } from 'react';
import Link from 'next/link';
import { ORDERED_STORIES } from '@/lib/v2/clippings';
import Companion from '@/components/v2/Companion';
import { useSpine } from '@/components/v2/useSpine';
import { askJack } from '@/lib/v2/ask';
/* The catalogue furniture. Borrowed from the projects route rather than
   duplicated; see the note at the top of this file. */
import '../projects/projects.css';

const WHISPERS: Record<string, string[]> = {
  'clip-index': [
    'Five of them. He can still name who came first in the one he came second in.',
    'The wall on the front page is the same five, pinned up properly.',
    'Everything in quotation marks on these is the citation. The rest is him.'
  ]
};

export default function ClippingsIndex() {
  const { velocityRef } = useSpine(['clip-index']);
  const ask = useCallback((q: string) => askJack(q), []);

  return (
    <>
      <main className="v2-above v2-projects">
        <div className="v2-wrap">
          <div className="v2-proj-head">
            <p className="v2-eyebrow">Index / Every cutting</p>
            <Link href="/" className="v2-proj-back">Back to the front</Link>
          </div>
          <hr className="v2-rule-hard" data-perch />

          <div className="v2-proj-masthead" id="clip-index">
            <h1 className="v2-display v2-proj-title">Cuttings</h1>
            <p className="v2-lede v2-proj-lede">
              {ORDERED_STORIES.length} judged competitions, 2022 to 2025. Two
              first places, and one lens used a million times.
            </p>
          </div>

          <ol className="v2-proj-list">
            {ORDERED_STORIES.map((s, i) => (
              /* Same perch treatment as the project catalogue: the row's box
                 top sits on the hairline above it, and the headline is
                 declared as text so the bird lands on the words rather than in
                 the middle of an empty column. See THE PERCH CONTRACT in
                 components/v2/Companion.tsx. */
              <li className="v2-proj-row" key={s.id} data-perch>
                <span className="v2-proj-num">{String(i + 1).padStart(2, '0')}</span>
                <div className="v2-proj-main">
                  <h2
                    className="v2-proj-name"
                    data-perch
                    data-perch-text
                    data-perch-inset="0.13em"
                  >
                    {s.headline}
                    <em> {s.place}</em>
                  </h2>
                  <p className="v2-proj-desc">{s.article.standfirst}</p>
                  <ul className="v2-proj-tech">
                    {s.badges.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  <p className="v2-proj-links" data-perch data-perch-inset="1.15em">
                    <Link href={`/clippings/${s.id}`} className="is-lead">
                      Read the story
                    </Link>
                  </p>
                </div>
                <span className="v2-proj-meta">
                  <time dateTime={s.iso}>{s.date}</time>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </main>

      <Companion whispers={WHISPERS} velocityRef={velocityRef} onAsk={ask} />
    </>
  );
}
