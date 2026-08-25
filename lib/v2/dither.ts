/* ============================================================================
   dither.ts — error-diffusion and ordered dithering onto the page palette.

   Why this exists. The site is paper and ink: four or five values, no
   gradients. Anything photographic dropped onto it has to lose almost all of
   its tonal range, and a plain desaturate-and-posterise turns a face into
   flat grey slabs. Dithering trades spatial resolution for tonal resolution,
   which is exactly the trade a limited palette wants — it is how newsprint
   carried photographs for a century on one ink.

   ATKINSON IS THE DEFAULT, and the reason is specific. Classic Floyd-Steinberg
   pushes 100% of each pixel's quantisation error into its neighbours, which
   preserves average brightness and gives smooth, faithful gradients. Atkinson
   pushes only 6/8 of it and throws the rest away. That is "wrong" — it clips
   highlights and crushes shadows — and it is exactly what makes it right here:
   discarding a quarter of the error raises local contrast and leaves clean
   white paper where a faithful algorithm would leave grey mud. It is the
   original Macintosh look, and it was designed for one-bit output.

   ERROR DIFFUSION CANNOT BE A SHADER. Each pixel depends on the error pushed
   into it by pixels already processed, so the loop is inherently sequential.
   This is CPU work on an ImageData buffer, run ONCE when an image is prepared,
   never per frame. `bayer` is the exception — it is a pure function of
   position, so it is the one that could move to the GPU later if it needs to.

   Everything here operates on the page's own tokens. Nothing hardcodes a
   colour: you pass the ramp in.
   ========================================================================== */

/** A palette entry, pre-parsed to linear-ish sRGB bytes. */
export interface Tone {
  r: number;
  g: number;
  b: number;
  /** Perceptual luminance 0..1, used to pick the nearest tone. */
  l: number;
}

export type DitherKind = 'atkinson' | 'floyd' | 'bayer' | 'none';

/**
 * Perceptual luminance, the same weights a television used.
 *
 * Not the sRGB-linear relative luminance used for contrast ratios: this is the
 * fast gamma-space approximation, which is what every dithering implementation
 * has used since the 1980s and what the tone ramp below is calibrated against.
 * Using the "more correct" linear version here makes midtones bunch and the
 * dither pattern coarsen in the shadows.
 */
export function luma(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Parse `#rrggbb` into a Tone. Throws on anything else, loudly and early. */
export function toTone(hex: string): Tone {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`dither: expected #rrggbb, got ${hex}`);
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return { r, g, b, l: luma(r, g, b) };
}

/** Build a ramp from page tokens, darkest first. */
export function ramp(...hexes: string[]): Tone[] {
  return hexes.map(toTone).sort((a, b) => a.l - b.l);
}

/** Nearest tone by luminance. Ramps here are tiny, so a linear scan wins. */
function nearest(tones: Tone[], l: number): Tone {
  let best = tones[0];
  let bestD = Math.abs(l - best.l);
  for (let i = 1; i < tones.length; i++) {
    const d = Math.abs(l - tones[i].l);
    if (d < bestD) {
      bestD = d;
      best = tones[i];
    }
  }
  return best;
}

/**
 * Atkinson kernel: six neighbours, one eighth each, 25% of the error dropped.
 * Offsets are [dx, dy].
 */
const ATKINSON: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1 / 8],
  [2, 0, 1 / 8],
  [-1, 1, 1 / 8],
  [0, 1, 1 / 8],
  [1, 1, 1 / 8],
  [0, 2, 1 / 8]
];

/** Floyd-Steinberg: four neighbours, all of the error, no loss. */
const FLOYD: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 7 / 16],
  [-1, 1, 3 / 16],
  [0, 1, 5 / 16],
  [1, 1, 1 / 16]
];

/** 4x4 Bayer, normalised to -0.5..0.5. Ordered, positionally pure, no memory. */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
].map((row) => row.map((v) => v / 16 - 0.5 + 1 / 32));

export interface DitherOptions {
  kind?: DitherKind;
  /** Darkest-first tone ramp. Two entries gives a true one-bit result. */
  tones: Tone[];
  /**
   * Multiplies the diffused error. Below 1 softens the texture toward flat
   * posterisation; above 1 exaggerates it. 1 is the honest algorithm.
   */
  strength?: number;
  /** Applied to luminance before quantising. 1 is neutral. */
  contrast?: number;
  /** Added to luminance before quantising, -1..1. */
  brightness?: number;
}

/**
 * Dither `img` in place, onto `tones`.
 *
 * Alpha is preserved exactly and fully transparent pixels are skipped — a
 * cut-out keeps its edge instead of growing a fringe of dithered noise.
 *
 * The error buffer is a separate Float32Array rather than being accumulated
 * into the ImageData: pushing error into 8-bit channels clips at 0 and 255 and
 * loses precisely the information the algorithm exists to carry.
 */
export function dither(img: ImageData, opts: DitherOptions): ImageData {
  const { data, width: w, height: h } = img;
  const kind = opts.kind ?? 'atkinson';
  const tones = opts.tones;
  if (!tones.length) throw new Error('dither: empty ramp');
  const strength = opts.strength ?? 1;
  const contrast = opts.contrast ?? 1;
  const brightness = opts.brightness ?? 0;

  /* luminance up front, so the inner loop never touches three channels */
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    let l = luma(data[i], data[i + 1], data[i + 2]);
    l = (l - 0.5) * contrast + 0.5 + brightness;
    lum[p] = l;
  }

  const kernel = kind === 'floyd' ? FLOYD : ATKINSON;
  const diffusing = kind === 'atkinson' || kind === 'floyd';

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const i = p * 4;
      if (data[i + 3] === 0) continue;

      let l = lum[p];
      if (kind === 'bayer') l += BAYER4[y & 3][x & 3] / Math.max(1, tones.length - 1);
      l = l < 0 ? 0 : l > 1 ? 1 : l;

      const t = nearest(tones, l);
      data[i] = t.r;
      data[i + 1] = t.g;
      data[i + 2] = t.b;

      if (!diffusing) continue;

      const err = (l - t.l) * strength;
      if (err === 0) continue;
      for (let k = 0; k < kernel.length; k++) {
        const [dx, dy, f] = kernel[k];
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= w || ny >= h) continue;
        lum[ny * w + nx] += err * f;
      }
    }
  }
  return img;
}

/**
 * The ramp the site uses for photographs.
 *
 * Four tones, not two. A true one-bit result is the most striking version and
 * the least readable one at polaroid size — a face needs a midtone to keep a
 * cheek separate from a jaw. These are page tokens: ink, ink-2, paper-3, paper.
 */
export const PAPER_RAMP: readonly string[] = ['#17140F', '#443E34', '#D1C9B7', '#E4DFD3'];

/** Two tones, for when the subject is a silhouette and not a face. */
export const ONE_BIT_RAMP: readonly string[] = ['#17140F', '#E4DFD3'];
