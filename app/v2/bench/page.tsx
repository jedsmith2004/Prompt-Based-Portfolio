'use client';

/* ============================================================================
   /v2/bench — the index of everything waiting on a decision.

   Hunting five URLs and then reading docs/ab-log.md to remember what each one
   was asking is friction on the only step I cannot do myself, so this puts the
   question, the options, my recommendation and what is blocked behind it on
   one page.

   Deliberately plain. It is a working document for one reader, not a plate.

   UPDATED 2026-08-26, after a night's work. Four of the five things that were
   here are now DECIDED — by me, provisionally, because Jack said "try and
   figure most of it out yourself". Every one of those is reversible and the
   bench it was decided on is still standing, so disagreeing costs a sentence.
   ========================================================================== */

import Link from 'next/link';
import './bench.css';

interface Pending {
  href: string;
  keys: string;
  title: string;
  /** The actual question, in one sentence. */
  question: string;
  options: string[];
  /** My answer and the reason for it. */
  pick: string;
  because: string;
  /** What cannot proceed until this is answered. */
  blocks: string;
}

const PENDING: Pending[] = [
  {
    href: '/v2',
    keys: '',
    title: 'What to call him',
    question:
      'The sparrow needs a name. Seven candidates, each of which means two things at once.',
    options: ['Pip', 'Crumb', 'Nibble', 'Passer', 'Nib', 'Dunnock', 'Chip'],
    pick: 'Pip',
    because:
      'It is the smallest possible name for the smallest thing on the page, and it is true four times over. A sparrow eats pips. A pip is a printed mark, which is the material this whole site is made of. The pips are a time signal — a small regular interruption, which is exactly what he is. And pip is the command every Python engineer types daily, which is what the MotionGen backend is written in. Crumb and Nibble are the runners-up and are better jokes: a crumb is two bits and a nibble is four, and a sparrow does both. Passer is the sparrow genus and also a compiler pass. Dunnock is the real English name of a hedge sparrow and the only one nobody else has taken.',
    blocks:
      'Nothing technically. But he is the most memorable thing on the site and he currently has no name, which means nobody can talk about him.'
  },
  {
    href: '/v2/awards',
    keys: '1-4',
    title: 'The awards',
    question:
      'The case treatment has moved to projects, so what do the five awards get now?',
    options: ['Reach', 'Clippings', 'Career line', 'something new'],
    pick: 'Reach, still',
    because:
      'It is the only one that refuses to fake the four awards with no recorded figure, and the log scale makes the point that a lens used a million times does not belong on the same line as a hackathon prize. You said to hold Clippings for something else, so it is out of the running here. The trophy case still works and is still on the bench — it is now the SECOND case on the site rather than the only one, which is the argument against keeping it here.',
    blocks: 'Reach is on the close plate as a placeholder and has been for a week.'
  }
];

const DECIDED: Array<[string, string]> = [
  ['Narrative order', 'The constraint spine. Eight plates of DO NOT, then SO. Live. (Yours.)'],
  ['Companion form', 'Pixel sparrow. Five chat perches, nine transits, a peck that aims.'],
  ['Direction', 'Synthesised from all four. No Japanese glyphs. (Yours.)'],
  ['Dithering', 'Atkinson in the polaroids, ordered in the ink wash. Different jobs.'],
  [
    'The 100 technologies',
    'Constellation, not the ledger. Live on the models plate. Bench still at /v2/skills, keys 1-2.'
  ],
  [
    'The case treatment',
    'Ported to projects: fifteen objects at the head of /v2/projects. Its dark mode is fixed.'
  ],
  [
    'World assignments',
    'Techno on models, Topography on practice and CV, Celestial on contact. Bench at /v2/backdrops.'
  ],
  [
    'The scroll fix',
    'Document-flow bird, not Lenis. Free, no dependency, and his coordinates were already in document space.'
  ],
  [
    'When an ability fires',
    'Only when he is off the screen. In the edge fifths he hops back into the middle 60%. (Yours.)'
  ],
  [
    'The hitchhiking',
    'RouteMap keeps the interactive line; Scrapbook keeps the album page and stands its own thread down.'
  ]
];

export default function BenchIndex() {
  return (
    <main className="v2-bench-index">
      <div className="v2-wrap">
        <p className="v2-eyebrow">DECISIONS / WAITING ON YOU</p>
        <hr className="v2-rule-hard" />
        <h1 className="v2-h2">Two things I cannot decide for you</h1>
        <p className="v2-lede">
          It was five. You said to figure most of it out myself, so three of
          them are decided and live, and every bench they were decided on is
          still standing. The recommendation is mine and the reasoning is under
          it, so disagreeing is cheap.
        </p>

        <ol className="v2-bi-list">
          {PENDING.map((p, i) => (
            <li key={p.title}>
              <span className="v2-bi-num" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h2>
                  <Link href={p.href}>{p.title}</Link>
                  {p.keys ? <em>keys {p.keys}</em> : null}
                </h2>
                <p className="v2-bi-q">{p.question}</p>
                <p className="v2-bi-opts">
                  {p.options.map((o) => (
                    <span key={o}>{o}</span>
                  ))}
                </p>
                <p className="v2-bi-pick">
                  <b>My pick: {p.pick}.</b> {p.because}
                </p>
                <p className="v2-bi-blocks">
                  <i>Blocked behind it:</i> {p.blocks}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <h2 className="v2-bi-h">Already decided</h2>
        <ul className="v2-bi-done">
          {DECIDED.map(([k, v]) => (
            <li key={k}>
              <b>{k}</b>
              <span>{v}</span>
            </li>
          ))}
        </ul>

        <p className="v2-bi-foot">
          Full reasoning and every verdict you have given, verbatim, is in
          <code>docs/ab-log.md</code>. What changed overnight is in
          <code>docs/devlog.md</code>. Outstanding work is in
          <code>docs/plan.md</code>.
        </p>
      </div>
    </main>
  );
}
