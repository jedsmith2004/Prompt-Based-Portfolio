/* ============================================================================
   backdrops/types.ts — the contract every backdrop implements.

   A backdrop is one canvas world that sits behind a section. They are
   interchangeable: the page fades between them as the reader moves down, so
   every one of them must be able to appear and disappear cleanly and must draw
   itself entirely from the palette it is handed.

   Two rules do most of the work here.

   1. NEVER HARDCODE A COLOUR. The page swaps between a light paper palette and
      a dark ink palette. Anything hardcoded is invisible in one of them.
   2. MULTIPLY FINAL ALPHA BY `intensity`. At 0 the canvas must be clear, so a
      backdrop that is not the current one costs nothing visually while it
      fades out.
   ========================================================================== */

/** The five colours a backdrop is allowed to draw with. */
export interface BackdropPalette {
  /** The page ground this backdrop sits on. */
  surface: string;
  /** Primary mark. */
  ink: string;
  /** Secondary, quieter mark. */
  ink2: string;
  /** Warm accent, the vermilion role. */
  accent: string;
  /** Cool accent, the ink-blue role. */
  accent2: string;
}

export interface BackdropProps {
  /** 0..1, how present this backdrop is. Fade all output by it. */
  intensity: number;
  /** 0..1 progress through the owning section. */
  progress: number;
  /** Smoothed scroll velocity in px per frame. Negative is upward. */
  velocity: number;
  palette: BackdropPalette;
  /**
   * Which section this instance is standing behind.
   *
   * Backdrops are interchangeable and almost none of them should care. The one
   * that does is Scrapbook behind `road`, where an interactive route is drawn
   * on top of it by RouteMap and its own stitched thread would be the same
   * journey drawn twice at two scales. A world may use this to stand down from
   * something, never to become a different world.
   */
  sectionId?: string;
  className?: string;
}

/** Every backdrop module default-exports one of these. */
export type Backdrop = (props: BackdropProps) => JSX.Element | null;

/** Stable identifiers, so a section can name its world without a magic string. */
export type BackdropName =
  | 'inkwash'
  | 'geometry'
  | 'braid'
  | 'watercolour'
  | 'techno'
  | 'scrapbook'
  | 'topography'
  | 'celestial';

/* ---------------------------------------------------------------------------
   Shared helpers. Backdrops may use these; nothing here allocates per frame.
   --------------------------------------------------------------------------- */

/**
 * Parse '#rgb' or '#rrggbb' into [r, g, b] 0-255.
 *
 * Backdrops need numeric channels to build rgba() strings at varying alpha, and
 * doing this per frame would allocate. Resolve palette colours once in setup.
 */
export function toRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Build an rgba() string. Resolve the rgb once, then only alpha varies. */
export function rgba(c: [number, number, number], a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/* ---------------------------------------------------------------------------
   RESOLUTION.
   --------------------------------------------------------------------------- */

/**
 * How many device pixels a backdrop is allowed per CSS pixel.
 *
 * A backdrop is full-viewport, low-contrast texture sitting BEHIND type, and
 * it is the only layer on the page that is redrawn every frame at that size.
 * At an uncapped ratio it is also the most expensive thing on the page by a
 * long way: on a 1.5x display a 1416x806 world is 2.57 megapixels to fill and
 * 10MB to hand the compositor, sixty times a second, and on a 2x laptop that
 * is 4.5 megapixels and 18MB. Measured on this machine, capping the worlds at
 * 1 took the mid-page frame from 4.6fps to a locked 60.
 *
 * 1 is deliberate rather than merely cheap. Nothing here is a hairline that
 * has to land on a device pixel — the type on top is DOM text and is
 * unaffected — and every world antialiases its own marks, so the honest
 * comparison is a slightly softer texture against a page that holds 60fps.
 *
 * Raise it for a world that genuinely needs the resolution; do not raise it
 * globally without re-running the numbers.
 */
export const BACKDROP_DPR_CAP = 1;

/** Device pixels per CSS pixel for a backdrop. See BACKDROP_DPR_CAP. */
export function backdropDpr(): number {
  return Math.min(BACKDROP_DPR_CAP, window.devicePixelRatio || 1);
}

/** Deterministic PRNG, so a backdrop looks the same across resizes. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
