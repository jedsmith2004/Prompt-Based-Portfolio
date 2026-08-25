'use client';

/* ============================================================================
   /v2/skills — the A/B bench for the technologies.

   Three ways of showing the same derived data, so they can be judged against
   each other rather than one at a time. Keys 1-2, D flips the palette.

   The third option is not built here: it is the live site's own frequency-sized
   cloud, described in the note under option 2, because that is the thing Jack
   said to beat rather than a thing to rebuild.
   ========================================================================== */

import { useEffect, useState } from 'react';
import SkillsFromWork from '@/components/v2/SkillsFromWork';
import SkillConstellation from '@/components/v2/SkillConstellation';
import '../awards/awards-bench.css';

const TREATMENTS = [
  {
    key: 'constellation',
    label: 'Constellation',
    thesis:
      'A star chart. Magnitude is recency-weighted use, colour is the era it was last used in, and a line joins technologies that were used together, so every project is a named constellation and a shared technology is where two of them cross. It is the only one of these that shows what was used WITH what.',
    Component: () => <SkillConstellation />
  },
  {
    key: 'ledger',
    label: 'Ledger',
    thesis:
      'A ranked table. Every row is a technology with a real count, a real year span, and a bar whose segments you can count, one per project. Rigorous and checkable, and about as creative as a spreadsheet, which is the objection: the live site already has a frequency cloud and this is less interesting than it, not more.',
    Component: () => <SkillsFromWork />
  }
];

export default function SkillsBench() {
  const [index, setIndex] = useState(0);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute('data-v2-theme');
    root.setAttribute('data-v2-theme', dark ? 'dark' : 'light');
    return () => {
      if (prev) root.setAttribute('data-v2-theme', prev);
      else root.removeAttribute('data-v2-theme');
    };
  }, [dark]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= TREATMENTS.length) setIndex(n - 1);
      if (e.key === 'd' || e.key === 'D') setDark((d) => !d);
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % TREATMENTS.length);
      if (e.key === 'ArrowLeft')
        setIndex((i) => (i - 1 + TREATMENTS.length) % TREATMENTS.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const entry = TREATMENTS[index];
  const { Component } = entry;

  return (
    <main className="v2-abench">
      <div className="v2-wrap">
        <div className="v2-abench-bar">
          <div className="v2-abench-tabs" role="tablist" aria-label="Skills treatment">
            {TREATMENTS.map((t, i) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={i === index}
                onClick={() => setIndex(i)}
              >
                <i aria-hidden="true">{i + 1}</i>
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" className="v2-abench-mode" onClick={() => setDark((d) => !d)}>
            {dark ? 'Light' : 'Dark'}
          </button>
        </div>

        <p className="v2-abench-thesis">{entry.thesis}</p>
        <hr className="v2-rule-hard" />
      </div>

      <div className="v2-wrap">
        <Component key={entry.key} />
      </div>

      <div className="v2-wrap">
        <p className="v2-abench-keys">Keys 1-2 · D palette · arrows</p>
      </div>
    </main>
  );
}
