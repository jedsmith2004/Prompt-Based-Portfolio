'use client';

/* ============================================================================
   v2 — the page.

   One fixed InkField sits behind everything and re-targets as you move between
   sections, so the whole site is drawn by a single renderer. The DOM on top is
   an editorial spine: numbered plates, hard rules, real figures.
   ========================================================================== */

import { useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import InkField, { type ShapePainter } from '@/components/v2/InkField';
import Hero from '@/components/v2/Hero';
import SpineSection from '@/components/v2/SpineSection';
import { useSpine, scrollToSection } from '@/components/v2/useSpine';
import Companion from '@/components/v2/Companion';
import ClimbingWall from '@/components/v2/ClimbingWall';
import Polaroids from '@/components/v2/Polaroids';
import NeuralPlayground from '@/components/v2/NeuralPlayground';
import HighlightReel from '@/components/v2/HighlightReel';
import RouteMap from '@/components/v2/RouteMap';
import SkillsFromWork from '@/components/v2/SkillsFromWork';
import SectionBackdrops from '@/components/v2/SectionBackdrops';
import { usePalette } from '@/components/v2/usePalette';
import CareerLine from '@/components/v2/CareerLine';
import AwardsReach from '@/components/v2/AwardsReach';
import CurriculumVitae from '@/components/v2/CurriculumVitae';
import { HERO, SECTIONS, SECTION_WORLDS, WHISPERS, type SectionShape } from '@/lib/v2/content';
import {
  ridgeline,
  wordmark,
  digitGlyph,
  climbingWall,
  routeLine,
  portraitBlob,
  scatter
} from '@/lib/v2/shapes';
import './home.css';

/* The hitchhiking route, normalised from the real stop coordinates in
   public/context.json. Split to Tagounite, summer 2025. */
const ROUTE_STOPS: Array<[number, number]> = [
  [16.443, 43.514],  // Split
  [15.802, 43.803],  // Sibenik
  [15.207, 44.136],  // Zadar
  [15.808, 45.842],  // Zagreb
  [12.978, 47.802],  // Salzburg
  [11.296, 47.285],  // Innsbruck
  [9.603, 47.265],   // Swiss border
  [7.553, 47.554],   // Basel
  [7.353, 46.954],   // Bern
  [6.164, 46.519],   // Lausanne
  [6.122, 46.204],   // Geneva
  [4.793, 45.758],   // Lyon
  [4.26, 43.832],    // Nimes
  [2.057, 41.392],   // Barcelona
  [-0.443, 39.407],  // Valencia
  [-1.16, 37.991],   // Murcia
  [-4.49, 36.718],   // Malaga
  [-5.916, 35.763],  // Tangier
  [-8.09, 31.634],   // Marrakesh
  [-5.593, 29.978]   // Tagounite
];

function normalisedRoute() {
  const lons = ROUTE_STOPS.map((s) => s[0]);
  const lats = ROUTE_STOPS.map((s) => s[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const spanLon = Math.max(maxLon - minLon, 1e-6);
  const spanLat = Math.max(maxLat - minLat, 1e-6);
  /* inset so the polyline is not flush to the canvas edge */
  return ROUTE_STOPS.map(([lon, lat]) => ({
    x: 0.12 + ((lon - minLon) / spanLon) * 0.76,
    y: 0.12 + ((maxLat - lat) / spanLat) * 0.76
  }));
}

/* Which interactive piece belongs to which plate. Kept as a lookup rather than
   scattered conditionals so adding a section does not mean editing the tree. */
function sectionExtra(id: string) {
  switch (id) {
    case 'from-scratch':
      return <NeuralPlayground />;
    case 'models':
      return <SkillsFromWork />;
    case 'recensorium':
      /* The reel leads with Recensorium, so it belongs on the plate that is
         about Recensorium rather than two sections further down. */
      return <HighlightReel height={400} />;
    case 'delivery':
      /* CareerLine's argument is that the roles did not queue up behind the
         degree, they ran inside it. This is the plate about the roles. */
      return <CareerLine />;
    case 'road':
      /* the plate first, then the photographs it was drawn from */
      return (
        <>
          <RouteMap />
          <Polaroids label="Photographs from the road" />
        </>
      );
    case 'practice':
      return <ClimbingWall height={420} seed={7} />;
    case 'cv':
      return <CurriculumVitae />;
    case 'contact':
      /* What other people made of the work, immediately before the email
         address. This was the only plate on the page with nothing on it, and
         the site had no award anywhere despite one of them being a lens a
         million strangers used.

         Three treatments exist and all three are on /v2/awards. Swapping this
         line for AwardsCase or AwardsClippings is the whole change. */
      return <AwardsReach />;
    default:
      return null;
  }
}

export default function V2Page() {
  const sectionIds = useMemo(() => SECTIONS.map((s) => s.id), []);
  const { active, progress, velocity, velocityRef } = useSpine(sectionIds);

  /* The plate the reader is on sets the page's colour, and the tokens
     interpolate rather than switching. See components/v2/usePalette.ts. */
  const palette = usePalette(active);

  const route = useMemo(() => normalisedRoute(), []);

  /* Which silhouette the field should be holding right now. Before the reader
     reaches the first section this is the hero ridgeline. */
  const shapeName: SectionShape = useMemo(() => {
    const s = SECTIONS.find((x) => x.id === active);
    return s?.shape ?? 'ridgeline';
  }, [active]);

  const painter: ShapePainter = useMemo(() => {
    switch (shapeName) {
      case 'wordmark':
        /* The wordmark plate is Recensorium now, not the hero, so the field
           holds the company's name rather than his. */
        return wordmark('RECENSORIUM');
      case 'digitGlyph':
        return digitGlyph(7);
      case 'climbingWall':
        return climbingWall();
      case 'routeLine':
        return routeLine(route);
      case 'portraitBlob':
        return portraitBlob();
      case 'scatter':
        return scatter();
      case 'ridgeline':
      default:
        return ridgeline(1);
    }
  }, [shapeName, route]);

  /* The bird answers as Jack. Streams from the existing /api/ask route, and
     says so plainly rather than inventing an answer when the route is down. */
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

  const jump = useCallback((id: string) => {
    scrollToSection(id);
  }, []);

  /* Dev-only: expose the painters so coverage can be measured without needing
     scroll and IntersectionObserver to work (they do not, in headless panes). */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as any).__shapes = {
      ridgeline,
      wordmark,
      digitGlyph,
      climbingWall,
      routeLine,
      portraitBlob,
      scatter,
      route
    };
  }, [route]);

  return (
    <>
      <div className="v2-field" aria-hidden="true">
        <InkField shape={painter} shapeKey={shapeName} density="auto" />
      </div>

      {/* The section worlds, between the ink field and the type. One alive at
          a time plus the one fading out: see SectionBackdrops.tsx for why that
          limit is not negotiable on a page that also runs the field, the
          companion and the reel. */}
      <SectionBackdrops
        worlds={SECTION_WORLDS}
        active={active}
        velocity={velocity}
        palette={palette}
      />

      {/* progress + section index */}
      {/* data-perch on the rail: see THE PERCH CONTRACT in
          components/v2/Companion.tsx. This one is position: fixed, so the
          harvester stores its VIEWPORT edge and re-derives the document
          coordinates every frame; it is also excluded from being the bird's
          opening seat, because the top of the screen is not a place on the
          page. Its top edge is where the tinted rail begins, so no inset. */}
      <nav className="v2-nav" aria-label="Sections" data-perch>
        <span className="v2-nav-mark">JS</span>
        <ol>
          {SECTIONS.map((s, i) => {
            /* eyebrows arrive pre-numbered, e.g. "01 / FROM THE METAL UP".
               Split so the rail shows the plate number and the tooltip the
               label, instead of printing the number twice. */
            const [num, label] = s.eyebrow.includes('/')
              ? [s.eyebrow.slice(0, s.eyebrow.indexOf('/')).trim(),
                 s.eyebrow.slice(s.eyebrow.indexOf('/') + 1).trim()]
              : [String(i + 1).padStart(2, '0'), s.eyebrow];
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => jump(s.id)}
                  aria-current={active === s.id ? 'true' : undefined}
                  aria-label={label}
                >
                  <i aria-hidden="true">{num}</i>
                  <span>{label}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="v2-nav-progress" aria-hidden="true">
          {/* one custom property; the stylesheet picks the axis per breakpoint */}
          <div style={{ '--p': progress } as React.CSSProperties} />
        </div>
      </nav>

      <main className="v2-above">
        <Hero
          eyebrowLeft={HERO.eyebrowLeft}
          eyebrowRight={HERO.eyebrowRight}
          lines={HERO.lines}
          lede={HERO.lede}
          stats={HERO.stats}
          nextId={sectionIds[0] ?? 'top'}
        />

        {SECTIONS.map((s) => (
          <SpineSection
            key={s.id}
            id={s.id}
            eyebrow={s.eyebrow}
            title={s.title}
            lede={s.lede}
            stats={s.stats}
          >
            {sectionExtra(s.id)}
          </SpineSection>
        ))}
        <footer className="v2-foot">
          <div className="v2-wrap">
            <hr className="v2-rule-hard" data-perch />
            <div className="v2-foot-inner">
              <p
                className="v2-foot-say"
                data-perch
                data-perch-text
                data-perch-inset="0.12em"
              >
                Bring me the part that is not working yet.
              </p>
              <ul className="v2-foot-links">
                <li>
                  <Link href="/v2/projects" className="is-lead">Every project</Link>
                </li>
                <li><a href="mailto:jedsmith2004@gmail.com">Email</a></li>
                <li>
                  <a href="https://github.com/jedsmith2004" target="_blank" rel="noreferrer noopener">GitHub</a>
                </li>
                <li>
                  <a href="https://linkedin.com/in/jack-ed-smith" target="_blank" rel="noreferrer noopener">LinkedIn</a>
                </li>
                <li><a href="/CV Jack Smith.pdf" target="_blank" rel="noreferrer noopener">CV</a></li>
              </ul>
            </div>
            {/* border-top hairline: the box edge is the visible line */}
            <div className="v2-foot-colophon" data-perch>
              <span>Sheffield, UK</span>
              <span>Drawn by one particle field and a hand-rolled rasterizer</span>
            </div>
          </div>
        </footer>
      </main>

      <Companion
        whispers={WHISPERS}
        activeSection={active}
        velocityRef={velocityRef}
        onAsk={ask}
      />
    </>
  );
}
