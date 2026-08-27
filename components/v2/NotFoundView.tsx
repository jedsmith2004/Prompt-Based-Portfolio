'use client';

/* ============================================================================
   404 — the one page where something has actually gone wrong.

   Jack, 2026-08-27, on fuzzy text: "maybe for the 404 page."

   There was no 404 page at all, so this is the page as well as the treatment.
   Next was serving its own default, which is a bare sans-serif line on white:
   the one screen on the site with none of the site on it, reached by exactly
   the reader who is already lost.

   WHY THE NOISE IS ALLOWED HERE AND NOWHERE ELSE. Type that will not hold
   still reads as untrustworthy, which is why nothing on the spine glitches and
   why no figure anywhere on this site is ever animated in a way that questions
   it. On a 404 that reading is the correct one and it is the whole message:
   the number is torn because the thing behind it is not there. It is the only
   page whose subject is its own failure.

   It carries THREE ways out and they are the three places anybody arriving
   here actually wanted: the front, the projects, the cuttings. A 404 with one
   "go home" link makes the reader start their search again from the top.

   The heading is drawn on a canvas, so the real "404" is set as text beside it
   and hidden visually. See FuzzyText.

   IT IS A COMPONENT RATHER THAN THE ROUTE because all three treatments here
   need the client, and a client `app/not-found.tsx` cannot export `metadata` —
   so the 404 was inheriting the home page's title verbatim, which is the one
   title it must not have. The route is a server component that carries the
   metadata and renders this. See app/not-found.tsx.
   ========================================================================== */

import Link from 'next/link';
import FuzzyText from './text/FuzzyText';
import GlitchText from './text/GlitchText';
import TextType from './text/TextType';
import '@/app/not-found.css';

export default function NotFoundView() {
  return (
    <main className="v2-above v2-404">
      <div className="v2-wrap">
        {/* Local classes, not the catalogue's: this route imports only
            not-found.css, and borrowing `.v2-proj-head` would have pulled the
            whole projects stylesheet onto the one page that needs the least
            of it. */}
        <div className="v2-404-head">
          <p className="v2-eyebrow">
            Error <b>/</b> <GlitchText text="NO SUCH PAGE" />
          </p>
          <Link href="/" className="v2-404-back">Back to the front</Link>
        </div>
        <hr className="v2-rule-hard" />

        <div className="v2-404-plate">
          {/* The canvas is the picture; this is the word. */}
          <h1 className="v2-404-num">
            <span className="v2-sr">404</span>
            <FuzzyText text="404" size={200} />
          </h1>

          <p className="v2-lede v2-404-say">
            <TextType
              text="This address does not resolve to anything. It may never have, or it may have moved when the site did."
              speed={46}
              hold
            />
          </p>

          <ul className="v2-404-ways">
            <li>
              <Link href="/" className="is-lead">
                <b>The front</b>
                <span>The whole argument, in eight plates</span>
              </Link>
            </li>
            <li>
              <Link href="/projects">
                <b>Every project</b>
                <span>Fifteen, newest first, each with its own page</span>
              </Link>
            </li>
            <li>
              <Link href="/clippings">
                <b>Every cutting</b>
                <span>Five judged competitions, 2022 to 2025</span>
              </Link>
            </li>
          </ul>

          <p className="v2-404-note">
            If you followed a link from somewhere on this site to get here, that
            is a bug and I would like to know:{' '}
            <a href="mailto:jedsmith2004@gmail.com">jedsmith2004@gmail.com</a>.
          </p>
        </div>
      </div>
    </main>
  );
}
