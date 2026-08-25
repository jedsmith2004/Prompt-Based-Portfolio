'use client';

/* ============================================================================
   /v2/awards — the A/B bench for the recognition section.

   Three treatments of the same five awards, switchable, so they can be judged
   against each other rather than in isolation. Same idea as /v2/backdrops.

   Keys 1-4 switch. D flips the palette, because a treatment that only works on
   paper is only half built.

   The fourth is not an awards treatment — it is the career timeline, parked here
   because it is the only route that mounts it and a component nobody mounts
   ships nothing.
   ========================================================================== */

import { useEffect, useState } from 'react';
import AwardsCase from '@/components/v2/AwardsCase';
import AwardsReach from '@/components/v2/AwardsReach';
import AwardsClippings from '@/components/v2/AwardsClippings';
import CareerLine from '@/components/v2/CareerLine';
import './awards-bench.css';

const TREATMENTS = [
  {
    key: 'case',
    label: 'Trophy Case',
    thesis:
      'He builds things. Each award is a procedural 3D object drawn by the same hand-rolled pipeline as the project reel.',
    Component: AwardsCase
  },
  {
    key: 'reach',
    label: 'Reach',
    thesis:
      'One of these is not like the others. A lens used a million times does not belong on the same line as a hackathon prize, and a flat list hides that.',
    Component: AwardsReach
  },
  {
    key: 'clippings',
    label: 'Clippings',
    thesis:
      'These happened in the world, not on a CV. Torn newsprint, pinned to a wall, with the words left as real selectable text.',
    Component: AwardsClippings
  },
  {
    key: 'career',
    label: 'Career line',
    thesis:
      'Not an awards treatment. The roles ran INSIDE the degree rather than after it — three overlapping commitments over four years, with 2026 carrying three at once.',
    Component: CareerLine
  }
];

export default function AwardsBench() {
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
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + TREATMENTS.length) % TREATMENTS.length);
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
          <div className="v2-abench-tabs" role="tablist" aria-label="Awards treatment">
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

      <div className="v2-abench-stage">
        {/* key forces a genuine remount, so a treatment always starts clean */}
        <Component key={entry.key} />
      </div>

      <div className="v2-wrap">
        <p className="v2-abench-keys">Keys 1-4 · D palette · arrows</p>
      </div>
    </main>
  );
}
