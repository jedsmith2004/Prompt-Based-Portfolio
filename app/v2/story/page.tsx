'use client';

/* ============================================================================
   /v2/story — the A/B bench for the page's narrative order.

   Same shape as /v2/backdrops and /v2/awards, because the point of a bench is
   that you can flip between the options rather than read them in sequence and
   try to hold three of them in your head at once.

   Keys 1-3 switch. C shows the order that ships today, so a candidate can be
   compared against the thing it would replace rather than against nothing.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { NARRATIVES, NARRATIVE_RECOMMENDATION } from '@/lib/v2/narratives';
import { SECTIONS } from '@/lib/v2/content';
import './story.css';

export default function StoryBench() {
  const [index, setIndex] = useState(0);
  const [showCurrent, setShowCurrent] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= NARRATIVES.length) setIndex(n - 1);
      if (e.key === 'c' || e.key === 'C') setShowCurrent((s) => !s);
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % NARRATIVES.length);
      if (e.key === 'ArrowLeft')
        setIndex((i) => (i - 1 + NARRATIVES.length) % NARRATIVES.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const n = NARRATIVES[index];
  const recommended = n.key === NARRATIVE_RECOMMENDATION.key;

  return (
    <main className="v2-story">
      <div className="v2-wrap">
        <p className="v2-eyebrow">THE PAGE / WHAT IT IS ARGUING</p>
        <hr className="v2-rule-hard" />

        <p className="v2-story-problem">
          The six plates that ship today are ordered by subject, which is a filing
          system rather than an argument. And Recensorium — the company he founded,
          the platform he built solo, his current role — has no plate at all. All
          three candidates below give it one. That part is a correction, not a
          choice between them.
        </p>

        <div className="v2-story-tabs" role="tablist" aria-label="Narrative order">
          {NARRATIVES.map((c, i) => (
            <button
              key={c.key}
              role="tab"
              aria-selected={i === index}
              onClick={() => setIndex(i)}
            >
              <i aria-hidden="true">{i + 1}</i>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="v2-wrap">
        <div className="v2-story-head">
          <h1 className="v2-h2">{n.thesis}</h1>
          {recommended ? (
            <p className="v2-story-flag">My pick</p>
          ) : null}
        </div>

        <ol className="v2-story-plates">
          {n.plates.map((p, i) => (
            <li key={p.eyebrow} className={p.from === 'new' ? 'is-new' : undefined}>
              <span className="v2-story-num" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="v2-story-plate">
                <p className="v2-story-brow">
                  {p.eyebrow}
                  {p.from === 'new' ? <em>new plate</em> : <span>from {p.from}</span>}
                </p>
                <h2>{p.title}</h2>
                <p className="v2-story-beat">{p.beat}</p>
                <p className="v2-story-carries">{p.carries}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="v2-story-case">
          <div>
            <h3>Why this order</h3>
            <p>{n.rationale}</p>
          </div>
          <div>
            <h3>What it costs</h3>
            <p>{n.cost}</p>
          </div>
        </div>

        {recommended ? (
          <p className="v2-story-because">
            <b>Why I would take this one.</b> {NARRATIVE_RECOMMENDATION.because}
          </p>
        ) : null}

        <button
          type="button"
          className="v2-story-toggle"
          onClick={() => setShowCurrent((s) => !s)}
          aria-expanded={showCurrent}
        >
          {showCurrent ? 'Hide' : 'Show'} the order that ships today
        </button>

        {showCurrent ? (
          <ol className="v2-story-current">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <span>{s.eyebrow}</span>
                <b>{s.title}</b>
              </li>
            ))}
          </ol>
        ) : null}

        <p className="v2-story-keys">Keys 1-3 · C for the current order · arrows</p>
      </div>
    </main>
  );
}
