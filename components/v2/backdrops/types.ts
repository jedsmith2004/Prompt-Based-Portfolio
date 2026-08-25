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
  className?: string;
}

/** Every backdrop module default-exports one of these. */
export type Backdrop = (props: BackdropProps) => JSX.Element | null;

/** Stable identifiers, so a section can name its world without a magic string. */
export type BackdropName =
  | 'inkwash'
  | 'geometry'
  | 'fluid'
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
