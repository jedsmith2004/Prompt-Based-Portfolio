'use client';

/* ============================================================================
   /v2/bench — the index of everything waiting on a decision.

   Hunting five URLs and then reading docs/ab-log.md to remember what each one
   was asking is friction on the only step I cannot do myself, so this puts the
   question, the options, my recommendation and what is blocked behind it on
   one page.

   Deliberately plain. It is a working document for one reader, not a plate.

   UPDATED 2026-08-26, second pass. Jack has been through the whole site plate
   by plate, so nothing here is a question any more: he answered the name (Pip)
   and everything else on the old list.

   What is left is the opposite shape. These are the two places where I went
   past what he literally said — once because taking him literally would have
   deleted his awards, once because he specified six plates out of nine and
   somebody had to fill in the other three. Both are live. Both are listed here
   rather than buried in a commit, because a decision made on someone's behalf
   should be easy to find and cheap to reverse.
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
    title: 'Where the awards went',
    question:
      'You said "I don’t like the react section, remove it". I read that as the Reach chart on the closing plate, and moved the awards rather than deleting them.',
    options: [
      'Clippings on the CV plate (live)',
      'Nothing: cut the awards entirely',
      'The trophy case on the CV plate',
      'Back to Reach, somewhere else'
    ],
    pick: 'Clippings on the CV plate',
    because:
      'Read narrowly you disliked that TREATMENT in that PLACE, and I think that is right: a logarithmic reach axis is a cold object to close a page on, and closing on it while asking for work was the wrong note. But deleting it outright takes the only awards on the site with it, including a lens a million strangers used, and the CV plate is the one you called boring. Awards next to the document they belong beside fixes both notes with one move. If you meant it literally and want them gone, it is one line in sectionExtra.',
    blocks: 'Nothing. It is live, and reversible in a line either way.'
  },
  {
    href: '/v2',
    keys: '',
    title: 'The light run',
    question:
      'You gave a mode per plate for six of the nine. I filled in the other three and picked where the two devices fire.',
    options: [
      'top light, 01-02 dark, 03-05 light, 06-08 dark (live)',
      'fewer changes',
      'more changes',
      'a reader-controlled toggle as well'
    ],
    pick: 'Three changes, narrated',
    because:
      'You named dark for 01, 02, 06 and 08 and light for 03, 04 and 05. That leaves the hero and plate 07. The hero is light because the site should open on paper, and 07 is dark because it sits between 06 and 08 and a one-plate flicker back to light would be a third change for nothing. The switch fires on the two indoor changes and the sun does the outdoor one, which is why there are two devices rather than one being reused. Every plate is authored in BOTH forms, so any of this moves by editing one field.',
    blocks: 'Nothing. But it is the largest thing I decided rather than was told.'
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
  ],
  ['His name', 'Pip. (Yours.)'],
  [
    'The particles',
    'Hero and contact only. They were most of the busyness: a full-viewport simulation under a world that was meant to be the subject. (Yours.)'
  ],
  [
    'Eight plates, eight worlds',
    'No repeats. cv and practice were both running Topography; cv takes the ink wash. Braid replaces the metaballs on the career plate.'
  ],
  [
    'The world handover',
    'Sequential, not a cross-dissolve. Out fast, a beat of clear paper, then in. You never see two worlds averaged together.'
  ],
  [
    'The reel',
    'Halftone, not ASCII. Square cells, dot area carries tone. Neighbours are inside the frame now instead of clipped by it.'
  ]
];

export default function BenchIndex() {
  return (
    <main className="v2-bench-index">
      <div className="v2-wrap">
        <p className="v2-eyebrow">DECISIONS / WAITING ON YOU</p>
        <hr className="v2-rule-hard" />
        <h1 className="v2-h2">Two calls I made for you</h1>
        <p className="v2-lede">
          Not questions this time. Both of these are live, and both are places
          where I read past what you actually said rather than stopping to ask.
          The reasoning is under each one so disagreeing is cheap, and each is
          one field or one line away from being something else.
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
