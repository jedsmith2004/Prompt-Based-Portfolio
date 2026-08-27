'use client';

/* ============================================================================
   ClippingStory — one award, given a page of its own.

   Jack, 2026-08-27: "The newspaper clippings should lead to their own
   article/blog pages on this site."

   THIS IS DELIBERATELY THE SAME OBJECT AS A PROJECT PAGE and shares its whole
   stylesheet (app/story.css, lifted out of the projects route when this
   arrived). A reader who has been to /projects/recensorium and then follows a
   cutting should arrive somewhere that behaves identically: a masthead, a
   standfirst, an article at a reading measure, a shelf of figures, and a way
   onward, over a backdrop world in that page's own palette.

   WHAT IS DIFFERENT, AND WHY.

   The CITATION is set out as a blockquote near the top, attributed to the
   record. On a project page the description is just the opening of the
   article; here it is a quotation from somewhere else — it is the sentence the
   award itself is written in — and running it into first-person prose without
   marking it would blur the one line on the page that is not mine to phrase.
   That is the same reason it is the only thing on the page rendered from
   `story.citation` rather than from `story.article`.

   The article paragraphs are set with ScrollReveal. It suits a long column of
   even grey in a way it does not suit the spine's short plates, and these
   pages are nothing but long columns.

   NO LIGHT SWITCH AND NO DAY DIAL, for the same reason the project pages have
   none: those devices exist because the SPINE changes the light under you
   while you read, and a change needs narrating. This is one room.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Story } from '@/lib/v2/clippings';
import { getBackdrop } from './backdrops/registry';
import { usePalette } from './usePalette';
import { useSpine } from './useSpine';
import Companion from './Companion';
import { askJack } from '@/lib/v2/ask';
import { modeForSection, plateFor } from '@/lib/v2/palettes';
import ScrollReveal from './text/ScrollReveal';
import TextType from './text/TextType';
import CountUp from './text/CountUp';
import { MaskedText } from './text/MaskedText';
import CircularText from './text/CircularText';
import ShinyText from './text/ShinyText';

export interface ClippingStoryProps {
  story: Story;
  /** Newest-first position, for the plate number. */
  index: number;
  total: number;
  prev: { id: string; headline: string } | null;
  next: { id: string; headline: string } | null;
}

export default function ClippingStory({
  story,
  index,
  total,
  prev,
  next
}: ClippingStoryProps) {
  const mode = useMemo(
    () => modeForSection(plateFor(story.dress.plate).id),
    [story.dress.plate]
  );
  const palette = usePalette(story.dress.plate, mode);

  /* One id, so `active` is constant; what this is really here for is the
     document progress and the live velocity the world reads per frame. */
  const { progress, velocity, velocityRef } = useSpine([`clip-${story.id}`]);

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

  const { Component: World } = useMemo(
    () => getBackdrop(story.dress.world),
    [story.dress.world]
  );

  /* Same two-frame gate SectionBackdrops uses: `.v2-world` starts at opacity 0
     and the fade must not be spent inside the world's own setup task. Without
     it the backdrop here never becomes visible at all. */
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let a = 0;
    let b = 0;
    a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, []);

  const ask = useCallback((q: string) => askJack(q), []);

  /* The bird's lines here are about the cutting rather than about the work,
     because that is what the reader is standing in front of. */
  const whispers = useMemo(
    () => ({
      [story.id]: [
        'He kept the cutting. I have seen the drawer.',
        `${story.place}. He will tell you who came first, if you ask.`,
        'Everything on this page that is in quotation marks is the citation. The rest is him.'
      ]
    }),
    [story.id, story.place]
  );

  const art = story.article;

  return (
    <>
      <div className="v2-worlds" aria-hidden="true" data-world={story.id}>
        <div className={`v2-world${ready ? ' is-ready' : ''}`} data-backdrop={story.dress.world}>
          <World
            intensity={story.dress.intensity}
            progress={progress}
            velocity={velocity}
            palette={backdropPalette}
            sectionId={story.id}
          />
        </div>
      </div>

      <main className="v2-above v2-story" id={`clip-${story.id}`}>
        <div className="v2-wrap">
          <div className="v2-story-head">
            <p className="v2-eyebrow">
              {String(index).padStart(2, '0')} <b>/</b> {String(total).padStart(2, '0')} CUTTING
            </p>
            <Link href="/clippings" className="v2-story-back">
              Every cutting
            </Link>
          </div>

          {/* 2px of solid ink and its box top IS the line, so no inset. See
              THE PERCH CONTRACT in components/v2/Companion.tsx. */}
          <hr className="v2-rule-hard" data-perch />

          {/* The headline is filled with a halftone screen rather than a flat
              ink. It is the one treatment on the site that is literally true
              of the material the page is pretending to be: a headline printed
              on newsprint IS a dot screen. See MaskedText. */}
          <h1
            className="v2-display v2-story-title"
            data-perch
            data-perch-text
            data-perch-inset="0.06em"
          >
            <MaskedText>{story.headline}</MaskedText>
          </h1>

          <div className="v2-story-meta">
            <span className="is-live">{story.place}</span>
            <time dateTime={story.iso}>{story.date}</time>
            <span>{story.badges.join(' · ')}</span>
          </div>

          <p
            className="v2-lede v2-story-lede"
            data-perch
            data-perch-text
            data-perch-inset="0.33em"
          >
            <TextType text={art.standfirst} speed={64} />
          </p>

          {/* The award's own sentence, marked as a quotation because it is
              one. Everything else on this page is written.

              The seal beside it is the one decoration on the page and it is
              the right one: an award has a seal, a newspaper page carries a
              stamp, and both of the things it names — the placing and the year
              — are already set as text in the metadata line above, so it adds
              a shape rather than a claim. See CircularText. */}
          <div className="v2-story-award">
            <blockquote className="v2-story-cite" data-perch>
              <p>{story.citation}</p>
              <cite>The citation, as recorded</cite>
            </blockquote>
            <CircularText text={`${story.place} · ${story.headline}`} duration={30}>
              {story.iso.slice(0, 4)}
            </CircularText>
          </div>

          {art.links?.length ? (
            <p className="v2-story-links" data-perch>
              {art.links.map((l) => (
                <Link
                  key={l.label}
                  href={l.href}
                  className={l.lead ? 'is-lead' : undefined}
                >
                  {l.lead ? <ShinyText>{l.label}</ShinyText> : l.label}
                </Link>
              ))}
            </p>
          ) : null}
        </div>

        {art.shelf?.length ? (
          <div className="v2-wrap">
            <dl className="v2-story-shelf">
              {art.shelf.map((f) => (
                <div key={f.label} data-perch>
                  <dt>
                    <CountUp value={f.value} />
                  </dt>
                  <dd>{f.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        <div className="v2-wrap">
          <div className="v2-story-article">
            {art.sections.map((sec, i) => (
              <section key={sec.heading} className="v2-story-sec">
                <h2 className="v2-story-h2" data-perch data-perch-text data-perch-inset="0.1em">
                  {sec.heading}
                </h2>
                {sec.body.map((para) => (
                  <ScrollReveal key={para.slice(0, 40)} text={para} />
                ))}
                {/* After the SECOND section rather than at the top: a line
                    lifted out of an article the reader has not reached yet is
                    just a subtitle in bigger type. */}
                {art.pull && i === 1 ? (
                  <blockquote className="v2-story-pull" data-perch>
                    {art.pull}
                  </blockquote>
                ) : null}
              </section>
            ))}
          </div>
        </div>

        <div className="v2-wrap">
          <nav className="v2-story-nav" aria-label="Other cuttings">
            {prev ? (
              <Link href={`/clippings/${prev.id}`} className="is-prev" data-perch>
                <i aria-hidden="true">Newer</i>
                <span>{prev.headline}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/clippings/${next.id}`} className="is-next" data-perch>
                <i aria-hidden="true">Older</i>
                <span>{next.headline}</span>
              </Link>
            ) : (
              <span />
            )}
          </nav>

          <div className="v2-story-foot" data-perch>
            <Link href="/">Back to the front</Link>
            <Link href="/clippings">Every cutting</Link>
            <Link href="/projects">Every project</Link>
          </div>
        </div>
      </main>

      <Companion
        whispers={whispers}
        activeSection={story.id}
        velocityRef={velocityRef}
        onAsk={ask}
      />
    </>
  );
}
