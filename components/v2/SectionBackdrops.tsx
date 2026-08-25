'use client';

/* ============================================================================
   SectionBackdrops — the worlds, mounted behind the page instead of on a bench.

   Eight backdrops exist. This is what actually puts them on the site: as the
   reader moves down the spine, the section they are reading brings its own
   world up behind the type, and the one they left fades out.

   THE ONE RULE THAT SHAPES ALL OF THIS: never more than two alive.

   Each backdrop owns a canvas and a frame loop, and three of them own a WebGL
   context. Mounting six at once would mean six loops competing for the main
   thread on a page that also runs the ink field, the companion and the project
   reel — and browsers cap live WebGL contexts at roughly 8-16, so it would also
   run the page out of contexts and leave later sections drawing nothing. So
   exactly one world is mounted, plus the outgoing one for the length of a
   crossfade, and nothing else exists at all.

   TWO THINGS THAT LOOK LIKE THEY SHOULD BE THE SAME KNOB, AND ARE NOT:

     `intensity` is a per-section constant. It is how loud that world is allowed
     to be under that section's text, and it never changes, so passing it costs
     no re-render. Sections with dense body copy run quieter than sections that
     are mostly a figure.

     The crossfade is CSS opacity on the wrapper. It is the same visual result
     as animating `intensity` and it is free — compositor-side, no React render
     per frame, and it cannot tear against the backdrop's own draw loop. The
     contract asks that a backdrop be clear at intensity 0 so it can fade out;
     that requirement still holds, and is still what makes the swap safe if the
     opacity transition is ever removed.

   `progress` is quantised to 25 steps across a section. It has to be a prop,
   and a prop that changes every frame would re-render a canvas component sixty
   times a second for a value most worlds use to move something a pixel. 25
   steps is under the threshold where any of them visibly step.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBackdrop } from './backdrops/registry';
import type { BackdropName } from './backdrops/types';
import type { SectionPalette } from '@/lib/v2/palettes';

/**
 * How long the outgoing world stays mounted. Matches `.v2-world.is-leaving`.
 *
 * The handover is sequential now rather than a cross-dissolve: out in 280ms,
 * a beat of clear paper, then the new one in. See the note in v2.css. Keep
 * this a little above the CSS duration so the canvas is never pulled while it
 * is still visible.
 */
const FADE_MS = 340;

/** Progress steps per section. See the note above on why this is quantised. */
const PROGRESS_STEPS = 25;

export interface SectionWorld {
  /** Section id, as rendered by SpineSection. */
  id: string;
  backdrop: BackdropName;
  /**
   * 0..1. How loud this world runs under this section's type. Not the
   * crossfade — see the header.
   */
  intensity: number;
}

export interface SectionBackdropsProps {
  worlds: readonly SectionWorld[];
  /** Section id currently being read, from useSpine. */
  active: string;
  /** Smoothed px/frame scroll velocity, from useSpine. Negative is upward. */
  velocity: number;
  /**
   * The live section palette. Passed in rather than read from the DOM: during
   * the 940ms token transition `getComputedStyle` returns a half-interpolated
   * colour, so a world sampling the stylesheet would redraw itself in a
   * different shade every frame of every palette change.
   */
  palette: SectionPalette;
}

interface Slot {
  /** Unique per mount, so React never reuses a canvas between two worlds. */
  key: number;
  id: string;
  name: BackdropName;
  leaving: boolean;
}

let nextKey = 1;

export default function SectionBackdrops({
  worlds,
  active,
  velocity,
  palette: sectionPalette
}: SectionBackdropsProps) {
  /* The five colours the backdrop contract allows, taken from the section's
     own palette so a world is always drawn in the same key as the type sitting
     on top of it. */
  const palette = useMemo(
    () => ({
      surface: sectionPalette.paper,
      ink: sectionPalette.ink,
      ink2: sectionPalette.ink2,
      accent: sectionPalette.verm,
      accent2: sectionPalette.blue
    }),
    [
      sectionPalette.paper,
      sectionPalette.ink,
      sectionPalette.ink2,
      sectionPalette.verm,
      sectionPalette.blue
    ]
  );

  const byId = useMemo(() => {
    const m = new Map<string, SectionWorld>();
    for (const w of worlds) m.set(w.id, w);
    return m;
  }, [worlds]);

  /* ------------------------------------------------------------------ *
     A/B override. `?bd=techno` pins one world to every section, which is
     the only practical way to judge a world against real page copy rather
     than against the bench's single paragraph. `?bd=off` kills the layer.
   * ------------------------------------------------------------------ */
  const [override, setOverride] = useState<BackdropName | 'off' | null>(null);
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('bd');
    if (!raw) return;
    if (raw === 'off') return setOverride('off');
    const known = getBackdrop(raw as BackdropName);
    if (known.name === raw) setOverride(raw as BackdropName);
  }, []);

  const wanted = useMemo<SectionWorld | null>(() => {
    if (override === 'off') return null;
    const w = byId.get(active);
    if (!w) return null;
    return override ? { ...w, backdrop: override } : w;
  }, [active, byId, override]);

  /* --- the mounted slots -------------------------------------------------- */
  const [slots, setSlots] = useState<Slot[]>([]);
  const wrapRefs = useRef(new Map<number, HTMLDivElement | null>());
  const timers = useRef(new Map<number, number>());

  /**
   * Drop a slot, releasing its GL context on the way out.
   *
   * The bench does the same thing for the same reason: a discarded context is
   * only reclaimed on GC, which is not prompt, so cycling worlds without this
   * exhausts the pool and later backdrops silently draw nothing. It is safe
   * HERE and unsafe inside a backdrop, because here the canvas really is being
   * thrown away — React reuses the node on a remount, and a lost context never
   * comes back.
   */
  const drop = useCallback((key: number) => {
    const wrap = wrapRefs.current.get(key);
    const canvas = wrap?.querySelector('canvas');
    if (canvas) {
      const gl =
        (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ??
        (canvas.getContext('webgl') as WebGLRenderingContext | null);
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    }
    wrapRefs.current.delete(key);
    timers.current.delete(key);
    setSlots((prev) => prev.filter((s) => s.key !== key));
  }, []);

  useEffect(() => {
    setSlots((prev) => {
      const current = prev.find((s) => !s.leaving);
      const same =
        current && wanted && current.id === wanted.id && current.name === wanted.backdrop;
      if (same) return prev;

      /* nothing wanted: retire whatever is up */
      if (!wanted) {
        if (!current) return prev;
        return prev.map((s) => (s.key === current.key ? { ...s, leaving: true } : s));
      }

      const incoming: Slot = {
        key: nextKey++,
        id: wanted.id,
        name: wanted.backdrop,
        leaving: false
      };
      const retired = current ? [{ ...current, leaving: true }] : [];
      /* Only ever keep ONE outgoing world. If the reader is scrolling fast
         enough to outrun the fade, the older one goes immediately rather than
         stacking up a queue of dying canvases. */
      const stale = prev.filter((s) => s.leaving);
      for (const s of stale) {
        const t = timers.current.get(s.key);
        if (t) window.clearTimeout(t);
        timers.current.delete(s.key);
      }
      return [...retired, incoming];
    });
  }, [wanted]);

  /* schedule the unmount of anything that is on its way out */
  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const s of slots) {
      if (!s.leaving || timers.current.has(s.key)) continue;
      const t = window.setTimeout(() => drop(s.key), reduced ? 0 : FADE_MS);
      timers.current.set(s.key, t);
    }
  }, [slots, drop]);

  useEffect(() => {
    const t = timers.current;
    return () => {
      t.forEach((id) => window.clearTimeout(id));
      t.clear();
    };
  }, []);

  /* --- progress through the section that owns the live world -------------- */
  const [progress, setProgress] = useState(0);
  const liveId = slots.find((s) => !s.leaving)?.id ?? '';
  useEffect(() => {
    if (!liveId) return;
    let raf = 0;
    let running = true;
    let last = -1;
    /*
     * THE SECTION'S GEOMETRY IS MEASURED ON CHANGE, NOT PER FRAME.
     *
     * This loop used to call getElementById and getBoundingClientRect on every
     * single frame. `getBoundingClientRect` is layout-dependent: reading it
     * forces the browser to flush pending style and layout before it can
     * answer. Together with the same mistake in useSpine that was two forced
     * layouts of the whole document per frame, permanently — and the page
     * where it hurt most is this one, because the palette transition dirties
     * style across the entire tree for 940ms after every plate change. The
     * cost landed precisely while the reader was scrolling between sections.
     *
     * A section's document-space top and height only change when something
     * resizes or reveals. Both are observable, so they are observed, and the
     * per-frame work is now two reads of `scrollY` and some arithmetic.
     */
    let docTop = 0;
    let docH = 1;
    const el = document.getElementById(liveId);
    const remeasure = () => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      docTop = r.top + window.scrollY;
      docH = r.height;
    };
    remeasure();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(remeasure) : null;
    if (el) ro?.observe(el);
    window.addEventListener('resize', remeasure);

    const tick = () => {
      if (!running) return;
      if (el) {
        /* 0 as the section's top reaches the bottom of the viewport, 1 as its
           bottom leaves the top: the whole time any of it is on screen. */
        const vh = window.innerHeight;
        const span = docH + vh;
        const top = docTop - window.scrollY;
        const p = span > 0 ? (vh - top) / span : 0;
        const q =
          Math.round(Math.min(1, Math.max(0, p)) * PROGRESS_STEPS) / PROGRESS_STEPS;
        if (q !== last) {
          last = q;
          setProgress(q);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onVis = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', remeasure);
      ro?.disconnect();
    };
  }, [liveId]);

  if (!slots.length) return null;

  return (
    <div className="v2-worlds" aria-hidden="true" data-world={liveId || undefined}>
      {slots.map((s) => {
        const { Component } = getBackdrop(s.name);
        const world = byId.get(s.id);
        return (
          <div
            key={s.key}
            ref={(el) => {
              wrapRefs.current.set(s.key, el);
            }}
            className={`v2-world${s.leaving ? ' is-leaving' : ''}`}
            data-backdrop={s.name}
          >
            <Component
              intensity={world?.intensity ?? 0.7}
              progress={progress}
              velocity={velocity}
              palette={palette}
              sectionId={s.id}
            />
          </div>
        );
      })}
    </div>
  );
}
