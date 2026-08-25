/* ============================================================================
   colour.ts — ONE colour parser, and there is exactly one for a reason.

   THE BUG THIS EXISTS TO END.

   Jack, 2026-08-26, on the map: "the orange highlight is no longer orange,
   it's black." And on the neural net: "where have the colours gone from it?"

   Same bug, two plates, and it was not a colour choice. Three components each
   carried a private helper of this shape:

       const h = hex.trim().replace('#', '');
       const n = parseInt(h.slice(0, 6), 16);
       if (!Number.isFinite(n)) return 'rgba(23,20,15,' + alpha + ')';   // ink

   which is correct for `#B5402F` and catastrophic for anything else, because
   the fallback is near-black. And the tokens stopped being `#B5402F` the day
   the palette was registered with `@property`: a REGISTERED custom property
   has a computed value, so `getComputedStyle(root).getPropertyValue('--verm')`
   returns `rgb(181, 64, 47)`, not the text that was written in the stylesheet.
   `parseInt('rgb(18', 16)` is NaN, the guard fires, and every accent on those
   plates silently became ink.

   Nothing threw. Nothing logged. The vermilion was simply gone, on two plates,
   until Jack said so — which is the same failure mode as the Fluid world, and
   the same failure mode as the probe reading `color(srgb ...)` channels as
   bytes twice in one evening.

   So: one parser, it accepts everything the platform can hand back, and it is
   the only one. If you find yourself writing `replace('#', '')` in a component,
   you are re-introducing this.

   WHAT IT ACCEPTS
     #rgb  #rgba  #rrggbb  #rrggbbaa
     rgb(r, g, b)   rgb(r g b / a)   rgba(r, g, b, a)
     color(srgb r g b / a)      <- CHANNELS ARE 0..1 HERE, NOT 0..255.
                                   This is what `color-mix()` computes to.
   ========================================================================== */

/** [r, g, b] with channels 0..255. */
export type Rgb = [number, number, number];

/** Near-black, and deliberately NOT used as a silent fallback anywhere. */
const BLACK: Rgb = [23, 20, 15];

/**
 * Parse any CSS colour this codebase can produce into [r, g, b, a].
 *
 * Returns null rather than a colour when it cannot parse, so a caller has to
 * decide what to do about it. A parser that returns ink on failure is how two
 * plates lost their accent without anybody noticing.
 */
export function parseColour(css: string): [number, number, number, number] | null {
  const s = String(css).trim();
  if (!s) return null;

  if (s.charCodeAt(0) === 35 /* # */) {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2] + (h[3] ? h[3] + h[3] : '');
    }
    if (h.length !== 6 && h.length !== 8) return null;
    const n = parseInt(h.slice(0, 6), 16);
    if (!Number.isFinite(n)) return null;
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }

  /* Exponents matter: a computed `color()` can come back as `1e-7`, and a
     digits-only pattern would read that as 1 followed by a stray 7. */
  const m = s.match(/[\d.]+(?:e[-+]?\d+)?/gi);
  if (!m || m.length < 3) return null;
  let r = +m[0];
  let g = +m[1];
  let b = +m[2];
  const a = m.length > 3 ? +m[3] : 1;

  /*
   * THE 0..1 TRAP. `color(srgb 0.71 0.25 0.18)` is the same colour as
   * `rgb(181, 64, 47)`, and reading its channels as bytes turns it into
   * near-black. This project has been caught by it twice in the probe alone.
   *
   * Only `color()` is treated this way. An `rgb(1, 1, 1)` is a genuine
   * near-black and must stay one.
   */
  if (s.startsWith('color(') && r <= 1 && g <= 1 && b <= 1) {
    r *= 255;
    g *= 255;
    b *= 255;
  }
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
  return [r, g, b, Number.isFinite(a) ? a : 1];
}

/** Channels only, with an explicit fallback the caller has chosen. */
export function toRgb(css: string, fallback: Rgb = BLACK): Rgb {
  const c = parseColour(css);
  return c ? [c[0], c[1], c[2]] : fallback;
}

/**
 * `rgba()` string from any CSS colour plus an alpha.
 *
 * The source's own alpha is MULTIPLIED IN rather than discarded, so passing a
 * translucent token through does not silently make it opaque.
 */
export function withAlpha(css: string, alpha: number): string {
  const c = parseColour(css);
  const a = Math.max(0, Math.min(1, alpha)) * (c ? c[3] : 1);
  const [r, g, b] = c ? [c[0], c[1], c[2]] : BLACK;
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

/** Read a design token off an element, falling back to a literal. */
export function token(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = style.getPropertyValue(name);
  return v && v.trim() ? v.trim() : fallback;
}
