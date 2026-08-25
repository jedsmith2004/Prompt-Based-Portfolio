'use client';

/* ============================================================================
   /v2/bench — the index of everything waiting on a decision.

   Four A/B benches exist and each of them gates work. Hunting four URLs and
   then reading docs/ab-log.md to remember what each one was asking is friction
   on the only step I cannot do myself, so this puts the question, the options,
   my recommendation and what is blocked behind it on one page.

   Deliberately plain. It is a working document for one reader, not a plate.
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
    href: '/v2/skills',
    keys: '1-2',
    title: 'The 100 technologies',
    question:
      'A star chart where a line joins technologies used together, or the ranked ledger?',
    options: ['Constellation', 'Ledger'],
    pick: 'Constellation',
    because:
      'The ledger is the more rigorous document and the wrong answer to the question you asked. Your live site already has a frequency cloud; the ledger is that same one number, measured precisely, and duller for it. Neither can tell you gRPC and Unity belong to the same piece of work. The chart can.',
    blocks: 'Nothing is on /v2 yet. The section still shows the ledger.'
  },
  {
    href: '/v2/awards',
    keys: '1-4',
    title: 'The awards',
    question:
      'The trophy case moved to projects, so what treatment do the five awards get now?',
    options: ['Reach', 'Clippings', 'Career line', 'something new'],
    pick: 'Reach, for now',
    because:
      'It is the only one that refuses to fake the four awards with no recorded figure, and the log scale makes the point that a lens used a million times does not belong on the same line as a hackathon prize. You said to hold Clippings for something else, so it is out of the running here.',
    blocks:
      'Reach is sitting on the close plate as a placeholder. The trophy case still needs porting to projects, and its dark mode is broken.'
  },
  {
    href: '/v2/backdrops',
    keys: '1-8',
    title: 'Which world goes on which plate',
    question:
      'You asked what pages Techno, Topography and Celestial were for. My answers are live: confirm or move them.',
    options: ['confirm', 'reassign'],
    pick: 'models / practice / contact',
    because:
      'Techno is a live forward pass and models is about running models locally. Topography is marching-squares contours and practice is gritstone. Celestial is a navigator plate and contact is the last thing you read.',
    blocks:
      'Fluid is assigned to delivery and is still broken. Ink wash is unassigned and is next for the dither treatment.'
  },
  {
    href: '/v2',
    keys: '',
    title: 'The scroll fix, or Lenis',
    question:
      'Take JS out of the scroll path for the bird only, or adopt virtual scroll for the whole site?',
    options: ['document-flow bird', 'Lenis'],
    pick: 'document-flow bird first',
    because:
      'It is free, adds no dependency, and his coordinates are already in document space so the maths is right already. Lenis is a decision about how the whole page should feel and deserves its own A/B rather than arriving as a side effect of a bird fix.',
    blocks:
      'This is the biggest defect on the page and you have reported it three times. It is fully specced in docs/plan.md.'
  }
];

const DECIDED = [
  ['Narrative order', 'The constraint spine. Seven plates of DO NOT, then SO. Live.'],
  ['Companion form', 'Pixel sparrow. 70 landable surfaces, five chat perches.'],
  ['Direction', 'Synthesised from all four. No Japanese glyphs.'],
  ['Dithering', 'Atkinson onto four page tokens. Shipped into the polaroids.']
];

export default function BenchIndex() {
  return (
    <main className="v2-bench-index">
      <div className="v2-wrap">
        <p className="v2-eyebrow">DECISIONS / WAITING ON YOU</p>
        <hr className="v2-rule-hard" />
        <h1 className="v2-h2">Four things I cannot decide for you</h1>
        <p className="v2-lede">
          Each of these gates work that is otherwise finished. The recommendation
          is mine and the reasoning is under it, so disagreeing is cheap.
        </p>

        <ol className="v2-bi-list">
          {PENDING.map((p, i) => (
            <li key={p.href}>
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
          <code>docs/ab-log.md</code>. Outstanding work is in
          <code>docs/plan.md</code>.
        </p>
      </div>
    </main>
  );
}
