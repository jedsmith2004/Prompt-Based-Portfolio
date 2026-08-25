'use client';

/* ============================================================================
   SectionTheme — one identity, six plates, two palettes.

   The page used to be a single sheet with one particle field behind all of it.
   This module breaks that sheet into plates. Every section gets its own stock,
   its own ink weight and its own background treatment, drawn from the same
   material world: printed paper, carbon ink, two pigments. Nothing here is a
   second design language. It is the same press running a different paper.

   Four systems, kept apart on purpose:

   1. REGISTRY   a typed theme per section id. Each theme is a CSS class that
                 re-declares the site tokens (--paper, --ink, --rule, --verm,
                 --blue) for its subtree, so every component already written
                 against those tokens re-tints itself with no edits. The theme
                 also names a TEXTURE, which is the only thing this module
                 draws itself.

   2. TEXTURE    four canvas treatments plus a bare one. Each is generated
                 ONCE, off the main render path, and handed to the browser as
                 either a repeating tile (grain, grid, hatch) or a single
                 low-resolution stretched plate (wash). There is no animation
                 loop, no resize redraw and no per-frame work of any kind: a
                 tile is a data URL and the compositor repeats it for free.

   3. MODE       a real light/dark switch. The resolved mode lives in one
                 attribute on <html>, which means CSS owns every visual
                 consequence and React owns nothing but the button's state.
                 Persisted in localStorage, seeded from prefers-color-scheme,
                 synced across tabs.

   4. MORPH      the control itself: an SVG sun that a moving mask bites into a
                 crescent while its rays retract. Pure CSS transition off the
                 same attribute, so it is correct on the very first paint and
                 never flashes the wrong icon during hydration.

   ---------------------------------------------------------------------------
   CONTRAST

   Every colour below was measured, not guessed. The ratios in the comments are
   WCAG 2.1 relative-contrast figures for the token against its OWN plate
   surface, and against that plate's raised panel (--paper-hi) where components
   set copy on one. Thresholds applied:

       --ink, --ink-2, --ink-3, --ink-4   >= 4.5:1   (normal text)
       --verm-text, --blue-deep           >= 4.5:1   (small pigment text)
       --verm, --blue                     >= 3.0:1   (display scale only)

   --ink-4 is decorative in the base sheet at 3.52:1. Inside a plate it is
   raised to the lightest AA-safe step (>= 4.55:1) because existing components
   reach for it on small text (.v2-section-aside, .v2-nn-hint, .v2-nn-foot,
   .v2-pola-cap i). It stays visibly lighter than --ink-3; it is now merely
   legal as well.

   The measured tables live beside the class definitions at the end of
   app/v2/v2.css. Do not change a hex there without re-measuring.
   ========================================================================== */

import { useCallback, useEffect, useId, useRef, useState } from 'react';

/* ==========================================================================
   1. the registry
   ========================================================================== */

/** How a plate's background is drawn. `bare` draws nothing at all. */
export type TextureName = 'grain' | 'grid' | 'hatch' | 'wash' | 'bare';

/** Which pigment leads on a plate. Both remain available and both remain AA. */
export type AccentName = 'verm' | 'blue';

export interface SectionThemeDef {
  /** Section id from SECTIONS in lib/v2/content. */
  id: string;
  /** What the plate is made of, in one phrase. Useful as an aside or a title. */
  material: string;
  /** Class applied to the plate wrapper. Declares the token overrides. */
  className: string;
  texture: TextureName;
  /** The pigment this plate leads with. Textures draw their flecks in it. */
  accent: AccentName;
  /** True when the plate reverses ink and paper relative to the page around it. */
  inverted: boolean;
  /** True when the plate lets the fixed ink field show through. */
  showsField: boolean;
  /** Deterministic texture seed. Changing it redraws that plate's treatment. */
  seed: number;
}

/**
 * One theme per section id.
 *
 * The order is the reading order, and the sequence is deliberate: cool
 * blueprint, warm press sheet, heavy stock, thin bright sheet, bare paper with
 * the field breathing through it, then a single reversed plate to close on.
 * Only one plate in six is inverted, and only one in six is bare. That is the
 * restraint: variety you notice on the second scroll, not on the first.
 */
export const SECTION_THEMES: Readonly<Record<string, SectionThemeDef>> = {
  'from-scratch': {
    id: 'from-scratch',
    material: 'Blueprint stock, plotted grid',
    className: 'v2-plate-blueprint',
    texture: 'grid',
    accent: 'blue',
    inverted: false,
    showsField: false,
    seed: 1
  },
  models: {
    id: 'models',
    material: 'Press sheet, letterpress grain',
    className: 'v2-plate-press',
    texture: 'grain',
    accent: 'verm',
    inverted: false,
    showsField: false,
    seed: 2
  },
  delivery: {
    id: 'delivery',
    material: 'Heavy stock, hatched',
    className: 'v2-plate-stock',
    texture: 'hatch',
    accent: 'verm',
    inverted: false,
    showsField: false,
    seed: 3
  },
  road: {
    id: 'road',
    material: 'Thin sheet, pigment wash',
    className: 'v2-plate-sheet',
    texture: 'wash',
    accent: 'blue',
    inverted: false,
    showsField: false,
    seed: 4
  },
  practice: {
    id: 'practice',
    material: 'Bare paper, field showing',
    className: 'v2-plate-bare',
    texture: 'bare',
    accent: 'verm',
    inverted: false,
    showsField: true,
    seed: 5
  },
  contact: {
    id: 'contact',
    material: 'Reversed plate, hatched',
    className: 'v2-plate-reverse',
    texture: 'hatch',
    accent: 'verm',
    inverted: true,
    showsField: false,
    seed: 6
  }
};

/** Used for any id with no entry, so an added section still renders sanely. */
const FALLBACK_THEME: SectionThemeDef = {
  id: '',
  material: 'Press sheet, letterpress grain',
  className: 'v2-plate-press',
  texture: 'grain',
  accent: 'verm',
  inverted: false,
  showsField: false,
  seed: 0
};

/**
 * The theme for a section id. Pure, safe on the server, safe in a render body.
 * Prefer `useSectionTheme` inside components that also want the current mode.
 */
export function getSectionTheme(id: string): SectionThemeDef {
  return SECTION_THEMES[id] ?? { ...FALLBACK_THEME, id };
}

/* ==========================================================================
   2. mode: the light/dark switch
   ========================================================================== */

export type ThemeMode = 'light' | 'dark';
/** What the reader chose. `system` defers to prefers-color-scheme, and keeps
    deferring to it if the operating system changes underneath them. */
export type ThemePreference = ThemeMode | 'system';

export const THEME_STORAGE_KEY = 'v2-theme';
const THEME_ATTR = 'data-v2-theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

function readPreference(): ThemePreference {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'dark' || v === 'light' ? v : 'system';
  } catch {
    /* private mode, blocked storage: fall back to the system preference */
    return 'system';
  }
}

function systemMode(): ThemeMode {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function resolve(pref: ThemePreference): ThemeMode {
  return pref === 'system' ? systemMode() : pref;
}

/** Writes the resolved mode where CSS can see it. The single source of truth. */
function applyMode(mode: ThemeMode) {
  const root = document.documentElement;
  root.setAttribute(THEME_ATTR, mode);
  /* so form controls, scrollbars and the canvas backdrop follow too */
  root.style.colorScheme = mode;
}

/**
 * The mode currently painted, read from the <html> attribute rather than from
 * React state, and kept live with a MutationObserver.
 *
 * Reading the attribute is what makes this correct no matter who flipped it:
 * the boot script before hydration, the toggle, another tab, or the operating
 * system. Any component can call this and stay in step with no provider.
 */
export function useThemeAttribute(): ThemeMode {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    const root = document.documentElement;
    const read = () =>
      setMode((prev) => {
        const next: ThemeMode =
          root.getAttribute(THEME_ATTR) === 'dark' ? 'dark' : 'light';
        return prev === next ? prev : next;
      });

    read();
    const mo = new MutationObserver(read);
    mo.observe(root, { attributes: true, attributeFilter: [THEME_ATTR] });
    return () => mo.disconnect();
  }, []);

  return mode;
}

export interface ThemeModeHandle {
  /** The mode actually on screen. */
  mode: ThemeMode;
  /** What the reader asked for, which may be `system`. */
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** Flip to the opposite of what is on screen, and remember it. */
  toggle: () => void;
}

/**
 * The full switch. Persists to localStorage, follows the system preference
 * until the reader overrides it, and stays in step across tabs.
 */
export function useThemeMode(): ThemeModeHandle {
  const mode = useThemeAttribute();
  const [preference, setPref] = useState<ThemePreference>('system');

  /* adopt the stored preference once mounted; the boot script has already
     painted the right palette, so this only reconciles React's copy */
  useEffect(() => {
    setPref(readPreference());
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    try {
      if (p === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, p);
    } catch {
      /* storage refused; the choice still applies for this page view */
    }
    applyMode(resolve(p));
  }, []);

  /* follow the operating system, but only while nothing was chosen here */
  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => applyMode(systemMode());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  /* another tab changed the choice */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== THEME_STORAGE_KEY) return;
      const p = readPreference();
      setPref(p);
      applyMode(resolve(p));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback(() => {
    const next: ThemeMode =
      document.documentElement.getAttribute(THEME_ATTR) === 'dark' ? 'light' : 'dark';
    setPreference(next);
  }, [setPreference]);

  return { mode, preference, setPreference, toggle };
}

/**
 * A section's theme together with the mode it is currently painted in. This is
 * the helper other components should use to tint themselves to match a plate.
 *
 *   const { accent, inverted, mode } = useSectionTheme(active);
 */
export function useSectionTheme(id: string): SectionThemeDef & { mode: ThemeMode } {
  const mode = useThemeAttribute();
  return { ...getSectionTheme(id), mode };
}

/* --------------------------------------------------------------------------
   the no-flash boot script

   Renders as a real <script> in the server HTML, so it runs while the parser
   is still working and the correct palette is on the very first paint. Without
   it a dark reader gets one white frame on every navigation.
   -------------------------------------------------------------------------- */

const BOOT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)},a=${JSON.stringify(
  THEME_ATTR
)},v=null;try{v=localStorage.getItem(k)}catch(e){}var d=v==='dark'||(v!=='light'&&window.matchMedia(${JSON.stringify(
  DARK_QUERY
)}).matches);var r=document.documentElement;r.setAttribute(a,d?'dark':'light');r.style.colorScheme=d?'dark':'light'}catch(e){}})();`;

/**
 * Drop this as the FIRST element of the page tree. It paints no pixels.
 */
export function ThemeBoot() {
  return <script dangerouslySetInnerHTML={{ __html: BOOT }} />;
}

/* ==========================================================================
   3. the textures
   ========================================================================== */

/* Tile edge in CSS pixels. The generated bitmap is this times the device ratio
   so a tile is blitted one device pixel to one on a retina panel. */
const TILE_CSS: Record<'grain' | 'grid' | 'hatch', number> = {
  grain: 96,
  grid: 96,
  hatch: 18
};

/* The wash is not a tile. It is one small plate stretched over the plate box:
   it is a blur of pigment, so resolution is exactly the thing it does not
   need, and 360x240 costs a third of a megabyte instead of twenty. */
const WASH_W = 360;
const WASH_H = 240;

type Rgb = readonly [number, number, number];

const INK_FALLBACK: Rgb = [23, 20, 15];
const ACCENT_FALLBACK: Rgb = [181, 64, 47];

/** Parses the hex or rgb() a custom property resolves to. Never throws. */
function toRgb(raw: string, fallback: Rgb): Rgb {
  const s = raw.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 3) {
      const r = parseInt(h[0] + h[0], 16);
      const g = parseInt(h[1] + h[1], 16);
      const b = parseInt(h[2] + h[2], 16);
      if (r === r && g === g && b === b) return [r, g, b];
    }
    if (h.length >= 6) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      if (r === r && g === g && b === b) return [r, g, b];
    }
    return fallback;
  }
  const m = s.match(/-?\d+(\.\d+)?/g);
  if (m && m.length >= 3) {
    return [Number(m[0]) | 0, Number(m[1]) | 0, Number(m[2]) | 0];
  }
  return fallback;
}

function rgba(c: Rgb, a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/** xorshift32. Deterministic, so a plate's grain is the same on every visit. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/* --- grain ---------------------------------------------------------------
   Letterpress tooth: the speckle the plate leaves where the paper was not
   quite flat. Written straight into an ImageData buffer because that is what
   noise actually is, and drawing forty thousand one-pixel rects is not. */
function drawGrain(
  ctx: CanvasRenderingContext2D,
  n: number,
  ink: Rgb,
  accent: Rgb,
  alpha: number,
  rnd: () => number
) {
  const img = ctx.createImageData(n, n);
  const d = img.data;
  const total = n * n;

  for (let i = 0, p = 0; i < total; i++, p += 4) {
    const v = rnd();
    let a = 0;
    if (v < 0.135) a = 18 + rnd() * 34;          /* the tooth */
    else if (v < 0.158) a = 58 + rnd() * 42;     /* the odd heavy fleck */
    if (a === 0) continue;
    d[p] = ink[0];
    d[p + 1] = ink[1];
    d[p + 2] = ink[2];
    d[p + 3] = a * alpha;
  }
  ctx.putImageData(img, 0, 0);

  /* a few grains of the plate's own pigment, so the stock is not neutral */
  ctx.fillStyle = rgba(accent, 0.42 * alpha);
  const flecks = Math.max(3, Math.round(n / 34));
  for (let i = 0; i < flecks; i++) {
    ctx.fillRect(Math.floor(rnd() * n), Math.floor(rnd() * n), 1, 1);
  }
}

/* --- grid ----------------------------------------------------------------
   Plotted graph paper: five faint divisions to a major, a firm major line on
   two edges, and a registration cross where the majors meet. Drawn in device
   pixels with fillRect so the hairlines land on the pixel and stay hairlines. */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  n: number,
  dpr: number,
  ink: Rgb,
  accent: Rgb,
  alpha: number
) {
  const w = Math.max(1, Math.round(dpr));
  const step = n / 6;

  ctx.fillStyle = rgba(ink, 0.26 * alpha);
  for (let i = 1; i < 6; i++) {
    const p = Math.round(i * step);
    ctx.fillRect(p, 0, w, n);
    ctx.fillRect(0, p, n, w);
  }

  ctx.fillStyle = rgba(ink, 0.55 * alpha);
  ctx.fillRect(0, 0, w, n);
  ctx.fillRect(0, 0, n, w);

  /* the cross sits on the tile corner, so three of its four arms wrap around
     to the far edges. Draw all four or it reads as a tick, not a cross. */
  const arm = Math.max(2, Math.round(3.5 * dpr));
  ctx.fillStyle = rgba(accent, 0.5 * alpha);
  ctx.fillRect(0, 0, arm, w);
  ctx.fillRect(0, 0, w, arm);
  ctx.fillRect(n - arm, 0, arm, w);
  ctx.fillRect(0, n - arm, w, arm);
}

/* --- hatch ---------------------------------------------------------------
   Engraver's hatching. Any line of slope 1 tiles seamlessly on a square tile
   provided its twin at intercept minus the tile edge is drawn too, so each
   band leaves one triangle and re-enters the other. */
function drawHatch(
  ctx: CanvasRenderingContext2D,
  n: number,
  dpr: number,
  ink: Rgb,
  accent: Rgb,
  alpha: number
) {
  ctx.lineWidth = Math.max(1, dpr * 0.85);
  ctx.lineCap = 'butt';

  ctx.strokeStyle = rgba(ink, 0.3 * alpha);
  ctx.beginPath();
  for (const base of [0, n / 2]) {
    for (const c of [base, base - n, base + n]) {
      ctx.moveTo(-n, -n + c);
      ctx.lineTo(2 * n, 2 * n + c);
    }
  }
  ctx.stroke();

  /* one counter-stroke per tile, in pigment: the correction the engraver made */
  ctx.strokeStyle = rgba(accent, 0.28 * alpha);
  ctx.beginPath();
  ctx.moveTo(-n, 2 * n);
  ctx.lineTo(2 * n, -n);
  ctx.stroke();
}

/* --- wash ----------------------------------------------------------------
   Pigment dropped into wet paper: a few overlapping pools and the dark edge
   they leave as they dry. Everything is a radial gradient, which is the one
   soft primitive a canvas gives away for nothing. */
function drawWash(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ink: Rgb,
  accent: Rgb,
  alpha: number,
  rnd: () => number
) {
  ctx.clearRect(0, 0, w, h);
  const reach = Math.max(w, h);

  for (let i = 0; i < 6; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = (0.2 + rnd() * 0.42) * reach;
    const col = i % 3 === 0 ? accent : ink;
    const core = (0.035 + rnd() * 0.045) * alpha;

    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, core));
    g.addColorStop(0.52, rgba(col, core * 0.45));
    /* the ring where the pigment settles as the water retreats */
    g.addColorStop(0.86, rgba(col, core * 0.72));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  const foot = ctx.createLinearGradient(0, h * 0.6, 0, h);
  foot.addColorStop(0, rgba(ink, 0));
  foot.addColorStop(1, rgba(ink, 0.05 * alpha));
  ctx.fillStyle = foot;
  ctx.fillRect(0, 0, w, h);
}

/* --------------------------------------------------------------------------
   generation is deferred until the plate is near the viewport, so a page of
   six plates does not pay for six bitmaps during the first frame
   -------------------------------------------------------------------------- */
const NEAR_MARGIN = 400;

function useNearViewport<T extends HTMLElement>(
  ref: React.MutableRefObject<T | null>
): boolean {
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;

    /* Measure first, observe second. A plate that is already on screen must
       not wait on an IntersectionObserver callback, because a hidden document
       never delivers one: open the page in a background tab and the treatment
       would be missing when the reader finally looks at it. */
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight + NEAR_MARGIN && r.bottom > -NEAR_MARGIN) {
      setNear(true);
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: `${NEAR_MARGIN}px 0px ${NEAR_MARGIN}px 0px` }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, near]);

  return near;
}

/** Reads the three texture inputs a plate publishes through its class. */
function readTextureTokens(el: HTMLElement) {
  const cs = getComputedStyle(el);
  const alpha = parseFloat(cs.getPropertyValue('--v2-tex-alpha'));
  return {
    ink: toRgb(cs.getPropertyValue('--v2-tex-ink'), INK_FALLBACK),
    accent: toRgb(cs.getPropertyValue('--v2-tex-accent'), ACCENT_FALLBACK),
    alpha: Number.isFinite(alpha) ? alpha : 1
  };
}

interface TextureProps {
  texture: TextureName;
  seed?: number;
  className?: string;
}

function TilingTexture({ texture, seed = 0, className }: {
  texture: 'grain' | 'grid' | 'hatch';
  seed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mode = useThemeAttribute();
  const near = useNearViewport(ref);

  useEffect(() => {
    const host = ref.current;
    if (!host || !near) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssTile = TILE_CSS[texture];
    const n = Math.max(2, Math.round(cssTile * dpr));

    const cv = document.createElement('canvas');
    cv.width = n;
    cv.height = n;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const { ink, accent, alpha } = readTextureTokens(host);
    const rnd = makeRng(seed * 2654435761 + texture.length * 97 + 1);

    if (texture === 'grain') drawGrain(ctx, n, ink, accent, alpha, rnd);
    else if (texture === 'grid') drawGrid(ctx, n, dpr, ink, accent, alpha);
    else drawHatch(ctx, n, dpr, ink, accent, alpha);

    /* Handed to the compositor as a repeating background. From here on the
       texture costs nothing: no canvas in the tree, no resize handler, no
       redraw on scroll. It is a bitmap the browser tiles. */
    let url = '';
    try {
      url = cv.toDataURL('image/png');
    } catch {
      return; /* tainted or out of memory: the plate is fine without it */
    }
    host.style.backgroundImage = `url(${url})`;
    host.style.backgroundRepeat = 'repeat';
    host.style.backgroundSize = `${cssTile}px ${cssTile}px`;

    return () => {
      host.style.backgroundImage = '';
    };
  }, [texture, seed, mode, near]);

  return (
    <div
      ref={ref}
      className={className ? `v2-tex ${className}` : 'v2-tex'}
      aria-hidden="true"
    />
  );
}

function WashTexture({ seed = 0, className }: { seed?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const mode = useThemeAttribute();
  const near = useNearViewport(ref);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !near) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const { ink, accent, alpha } = readTextureTokens(cv);
    drawWash(ctx, WASH_W, WASH_H, ink, accent, alpha, makeRng(seed * 40503 + 7));

    return () => {
      ctx.clearRect(0, 0, WASH_W, WASH_H);
    };
  }, [seed, mode, near]);

  return (
    <canvas
      ref={ref}
      width={WASH_W}
      height={WASH_H}
      className={className ? `v2-tex v2-tex-wash ${className}` : 'v2-tex v2-tex-wash'}
      aria-hidden="true"
    />
  );
}

/**
 * The background treatment for one texture keyword. Decoration only: it never
 * takes a pointer and it is hidden from the accessibility tree.
 */
export function TexturePlate({ texture, seed, className }: TextureProps) {
  if (texture === 'bare') return null;
  if (texture === 'wash') return <WashTexture seed={seed} className={className} />;
  return <TilingTexture texture={texture} seed={seed} className={className} />;
}

/* ==========================================================================
   4. the control
   ========================================================================== */

/* Eight rays at 45 degree steps, as unit segments from the disc edge outward.
   Precomputed so the component allocates nothing per render. */
const RAYS: ReadonlyArray<readonly [number, number, number, number]> = (() => {
  const out: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const c = Math.cos(a);
    const s = Math.sin(a);
    out.push([
      Number((12 + c * 7.6).toFixed(2)),
      Number((12 + s * 7.6).toFixed(2)),
      Number((12 + c * 10.2).toFixed(2)),
      Number((12 + s * 10.2).toFixed(2))
    ]);
  }
  return out;
})();

export interface ThemeToggleProps {
  /** Added to the button. Omit for the default fixed position, top right. */
  className?: string;
}

/**
 * The light/dark switch.
 *
 * A real button, so it is in the tab order and answers to Enter and Space with
 * no key handling of our own. Its accessible name is fixed ("Toggle dark
 * theme") and its state is carried by aria-pressed, which keeps the name
 * stable across the flip and keeps the first render identical on server and
 * client. The icon is driven entirely by the <html> attribute in CSS, so it is
 * already correct before React hydrates.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { mode, toggle } = useThemeMode();
  const rawId = useId();
  const maskId = `v2-moon-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  /* the veil: a full-screen sheet in the OUTGOING surface colour that fades
     off over the new one. One element and one opacity, which is cheaper and
     far less disruptive than transitioning every painted property on the page. */
  const [veil, setVeil] = useState<ThemeMode | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  const clearVeil = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVeil(null);
  }, []);

  const onClick = useCallback(() => {
    const reduced = window.matchMedia(REDUCE_QUERY).matches;
    if (!reduced) {
      const from: ThemeMode =
        document.documentElement.getAttribute(THEME_ATTR) === 'dark' ? 'dark' : 'light';
      setVeil(from);
      /* The animation's own end event is what normally takes the veil down.
         The timer is only a backstop for the case where the animation never
         runs at all, and it is generous because a hidden tab throttles
         timeouts to a second or more. */
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setVeil(null);
      }, 2000);
    }
    toggle();
  }, [toggle]);

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={mode === 'dark'}
        aria-label="Toggle dark theme"
        title={mode === 'dark' ? 'Switch to the paper palette' : 'Switch to the ink palette'}
        className={className ? `v2-themeswitch ${className}` : 'v2-themeswitch'}
      >
        <svg
          className="v2-sunmoon"
          viewBox="0 0 24 24"
          width="21"
          height="21"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <mask id={maskId}>
              <rect x="0" y="0" width="24" height="24" fill="#fff" />
              {/* slides in from the upper right to bite the disc into a crescent */}
              <circle className="v2-sunmoon-bite" cx="12" cy="12" r="7.4" fill="#000" />
            </mask>
          </defs>

          <g
            className="v2-sunmoon-rays"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            {RAYS.map((r) => (
              <line key={r[0] + ':' + r[1]} x1={r[0]} y1={r[1]} x2={r[2]} y2={r[3]} />
            ))}
          </g>

          <circle
            className="v2-sunmoon-disc"
            cx="12"
            cy="12"
            r="5.1"
            fill="currentColor"
            mask={`url(#${maskId})`}
          />

          <g className="v2-sunmoon-stars" fill="currentColor">
            <circle cx="18.4" cy="6.2" r="0.85" />
            <circle cx="6.1" cy="17.6" r="0.65" />
            <circle cx="17.2" cy="17.9" r="0.5" />
          </g>
        </svg>

        <span className="v2-themeswitch-txt" aria-hidden="true">
          <i data-when="light">Dark</i>
          <i data-when="dark">Light</i>
        </span>
      </button>

      {veil ? (
        <div
          className={`v2-veil is-from-${veil}`}
          aria-hidden="true"
          onAnimationEnd={clearVeil}
        />
      ) : null}
    </>
  );
}

/* ==========================================================================
   5. the wrapper
   ========================================================================== */

export interface SectionThemeProps {
  /** Section id. Anything not in the registry gets the press-sheet theme. */
  id: string;
  children: React.ReactNode;
  /** Added to the plate wrapper. */
  className?: string;
}

/**
 * Wraps one section in its plate: token overrides, surface, and the background
 * treatment its theme names. The children are lifted above the treatment; the
 * treatment itself is inert.
 *
 * The plate bleeds left under the fixed index rail and puts the rail's width
 * back as padding, so the surface reaches the viewport edge while the content
 * box stays exactly where it was.
 */
export default function SectionTheme({ id, children, className }: SectionThemeProps) {
  const theme = getSectionTheme(id);

  return (
    <div
      className={
        className
          ? `v2-plate ${theme.className} ${className}`
          : `v2-plate ${theme.className}`
      }
      data-v2-plate={theme.id}
      data-v2-texture={theme.texture}
    >
      <TexturePlate texture={theme.texture} seed={theme.seed} />
      <div className="v2-plate-body">{children}</div>
    </div>
  );
}
