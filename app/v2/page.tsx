'use client';

/* ============================================================================
   v2 — the page.

   One fixed InkField sits behind everything and re-targets as you move between
   sections, so the whole site is drawn by a single renderer. The DOM on top is
   an editorial spine: numbered plates, hard rules, real figures.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import InkField, { type ShapePainter } from '@/components/v2/InkField';
import Hero from '@/components/v2/Hero';
import SpineSection from '@/components/v2/SpineSection';
import { useSpine, scrollToSection } from '@/components/v2/useSpine';
import Companion, { type CompanionErrand } from '@/components/v2/Companion';
import LightSwitch, { type LightSwitchHandle } from '@/components/v2/LightSwitch';
import DayDial from '@/components/v2/DayDial';
import { useMode } from '@/components/v2/useMode';
import ClimbingWall from '@/components/v2/ClimbingWall';
import Polaroids from '@/components/v2/Polaroids';
import NeuralPlayground from '@/components/v2/NeuralPlayground';
import ProjectCase from '@/components/v2/ProjectCase';
import RouteMap from '@/components/v2/RouteMap';
import SkillConstellation from '@/components/v2/SkillConstellation';
import SectionBackdrops from '@/components/v2/SectionBackdrops';
import { usePalette } from '@/components/v2/usePalette';
import CareerLine from '@/components/v2/CareerLine';
import AwardsClippings from '@/components/v2/AwardsClippings';
import ContactPlate, { type ContactPlateHandle } from '@/components/v2/ContactPlate';
import CurriculumVitae from '@/components/v2/CurriculumVitae';
import { askJack } from '@/lib/v2/ask';
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
const MAIL_LINES = [
  "I'll get it to him.",
  'Special delivery — I know a shortcut.',
  'Leave it with me.',
  'Air mail. Obviously.',
  'On it. First-class post.'
] as const;

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
function sectionExtra(id: string, contactExtra?: React.ReactNode) {
  switch (id) {
    case 'from-scratch':
      return <NeuralPlayground />;
    case 'models':
      /*
       * The constellation rather than the ledger, PROVISIONALLY — the two are
       * still benched against each other at /v2/skills, keys 1-2, and this is
       * my answer to that bench rather than Jack's.
       *
       * The reasoning, so it can be argued with: the ledger is the more
       * rigorous document and the wrong answer to the question that was asked.
       * The live site already has a frequency cloud, and the ledger is that
       * same one number measured precisely — duller for it, not more creative.
       * Neither a cloud nor a table can tell you that gRPC and Unity belong to
       * the same piece of work. A chart where a line joins two technologies
       * that were used together can, and that is the one fact here that is not
       * derivable from a list.
       */
      return <SkillConstellation />;
    case 'recensorium':
      /*
       * THE CASE, NOT THE REEL.
       *
       * > "The projects section carousel doesn't work, can you just lift the
       * >  carousel from the 'all projects' page but only keep the two either
       * >  side and be able to use the arrow buttons and the horizontal scroll
       * >  if the user has it."
       *
       * Lifted rather than reimplemented: this is the same component the index
       * uses, in its reel dress. Two either side, arrows, a sideways wheel, and
       * the two links out that the reel carried. It holds all fifteen rather
       * than five, which is also why it is still on the plate that is about
       * Recensorium: Recensorium is the one it opens on.
       */
      return <ProjectCase variant="reel" />;
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
      /* Taller as well as bigger-celled: "make it bigger/bolder/easier to
         see", and a wall is the one figure on the page that gains from height
         rather than width. See CELL_W in ClimbingWall.tsx. */
      return <ClimbingWall height={520} seed={7} />;
    case 'cv':
      /*
       * THE AWARDS MOVED HERE, and this is my call rather than Jack's.
       *
       * He said two things about the last two plates: "I don't like the react
       * section, remove it" — the Reach chart, on contact — and of this plate,
       * "otherwise, this is fine, a bit boring, can we make it more creative?"
       *
       * Deleting the chart outright would take the only awards on the site
       * with it, including a lens a million strangers used. Read narrowly, he
       * disliked THAT TREATMENT in THAT PLACE: a logarithmic reach axis is a
       * cold object to close a page on, and closing on it while asking for
       * work was the wrong note. The awards themselves are the least boring
       * thing the CV plate could possibly carry.
       *
       * So the chart is gone and the clippings are here, next to the document
       * they belong beside. Reversible in one line if he meant it literally:
       * all three treatments are still standing at /v2/awards.
       */
      return (
        <>
          <CurriculumVitae />
          <AwardsClippings />
        </>
      );
    case 'contact':
      /*
       * THE DOORS AND THE FORM, and this replaces "nothing".
       *
       * The old note here said the closing plate asks for one thing and should
       * not be competing with a figure while it does. That is still true and
       * this is not a figure: it is the ask itself, given the size the ask
       * deserves. Jack, 2026-08-26: "the email, github and linkedin should all
       * be massive link boxes. There should be a minimal contact form."
       *
       * The three addresses used to be a figure shelf, which is the grammar
       * for a fact you read rather than a door you go through. They are gone
       * from the stats in lib/v2/content.ts, so they exist once.
       */
      return contactExtra ?? <ContactPlate />;
    default:
      return null;
  }
}

export default function V2Page() {
  const sectionIds = useMemo(() => SECTIONS.map((s) => s.id), []);

  /*
   * THE HERO IS ITS OWN PLATE, and giving it one fixed the note Jack opened
   * with: "The mathematics one should be removed from the hero page but put on
   * the first page, these need to be separate."
   *
   * They were not separate. `useSpine` opened with `active` set to the first
   * SECTION, so before the reader had scrolled a pixel the page was already
   * dressed as plate 01 and already had plate 01's world running behind the
   * title. The geometry backdrop was not bleeding onto the hero; the hero was
   * never anything but plate 01 wearing the hero's type.
   *
   * `top` is the hero's id in the DOM and it now has a palette of its own in
   * palettes.ts and deliberately NO entry in SECTION_WORLDS, so the opening
   * screen is the particle field and nothing else. Plate 01 gets the
   * mathematics, one scroll later, on its own.
   */
  const spineIds = useMemo(() => ['top', ...sectionIds], [sectionIds]);
  const { active, progress, velocity, velocityRef } = useSpine(spineIds);

  /* Light or dark, and the device narrating the change. See useMode.ts. */
  const { mode, event, commit, finish } = useMode(active);

  /* The plate the reader is on sets the page's colour, and the tokens
     interpolate rather than switching. See components/v2/usePalette.ts. */
  const palette = usePalette(active, mode);

  /*
   * PARTICLES ON TWO PLATES ONLY. Jack: "I like the particles but I don't
   * think we should have them on every page, I think the hero and the contact
   * page only."
   *
   * It was also most of the busyness he opened with. On the middle seven
   * plates the field was a full-viewport particle simulation running
   * UNDERNEATH the world that was supposed to be the thing you were looking
   * at, so the page was paying twice to be harder to read. The opening screen
   * and the closing one are the two that are mostly type and air, which is
   * where a field has room to be the subject rather than the noise.
   */
  const particles = active === 'top' || active === 'contact';

  /* Only the three the field draws with, and memoised on the values rather
     than the object, so a re-render for any other reason does not look like a
     palette change to it. */
  const fieldPalette = useMemo(
    () => ({ paper: palette.paper, ink: palette.ink, verm: palette.verm }),
    [palette.paper, palette.ink, palette.verm]
  );

  /* --- the light switch, and the bird who works it ----------------------- */
  const [errand, setErrand] = useState<CompanionErrand | null>(null);
  const switchRef = useRef<LightSwitchHandle | null>(null);
  const contactRef = useRef<ContactPlateHandle | null>(null);
  const mailKey = useRef(10000);
  const requestSwitchErrand = useCallback((next: CompanionErrand | null) => {
    setErrand(next ? { ...next, kind: 'switch' } : null);
  }, []);
  const requestMailErrand = useCallback(() => {
    setErrand({
      key: mailKey.current++,
      selector: '[data-mail-perch]',
      kind: 'delivery',
      line: MAIL_LINES[Math.floor(Math.random() * MAIL_LINES.length)]
    });
  }, []);
  const onErrandArrive = useCallback(() => {
    if (errand?.kind === 'delivery') {
      contactRef.current?.collect();
      window.setTimeout(() => setErrand(null), 1800);
    } else {
      switchRef.current?.arrive();
    }
  }, [errand]);
  const onErrandFail = useCallback(() => {
    if (errand?.kind === 'delivery') {
      contactRef.current?.collectWithoutPip();
      setErrand(null);
    } else {
      switchRef.current?.fail();
    }
  }, [errand]);

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

  const ask = useCallback((q: string) => askJack(q), []);

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
      {/* The field is an OPAQUE full-viewport layer, so on the two plates
          where it runs it is the page's ground: it has to be handed the
          plate's colours or it paints the hero's over the top of them. That
          is what made the closing plate light. See the palette prop in
          InkField.tsx. */}
      <div className="v2-field" aria-hidden="true" data-dormant={!particles}>
        <InkField
          shape={painter}
          shapeKey={shapeName}
          density="auto"
          palette={fieldPalette}
          dormant={!particles}
        />
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
            {sectionExtra(
              s.id,
              s.id === 'contact' ? (
                <ContactPlate ref={contactRef} onLetterReady={requestMailErrand} />
              ) : undefined
            )}
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
              {/* He graduated from Sheffield. He does not live there. */}
              <span>Hemel Hempstead, UK</span>
              <span>Drawn by one particle field and a hand-rolled rasterizer</span>
            </div>
          </div>
        </footer>
      </main>

      {/* The mode devices. At most one is ever mounted, and only while a
          change is actually happening: see useMode.ts. */}
      {event?.device === 'switch' ? (
        <LightSwitch
          key={event.key}
          ref={switchRef}
          to={event.to}
          onErrand={requestSwitchErrand}
          /* Bound to THIS event's key. A device that is torn down mid-sequence
             must not be able to commit or finish the next one: see the
             ModeHandle contract in useMode.ts. */
          onCommit={() => commit(event.key)}
          onDone={() => finish(event.key)}
        />
      ) : null}
      {event?.device === 'dial' ? (
        <DayDial
          key={event.key}
          to={event.to}
          onCommit={() => commit(event.key)}
          onDone={() => finish(event.key)}
        />
      ) : null}

      <Companion
        whispers={WHISPERS}
        activeSection={active}
        velocityRef={velocityRef}
        onAsk={ask}
        errand={errand}
        onErrandArrive={onErrandArrive}
        onErrandFail={onErrandFail}
      />
    </>
  );
}
