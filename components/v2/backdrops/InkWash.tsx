'use client';

/* ============================================================================
   InkWash — a sheet of washi and four marks, floated on real fluid.

   The previous version modelled water as a grid of cells trading volume with
   their neighbours. It was honest physics and it read as nothing. This one
   runs the thing that actually makes ink move like ink: incompressible flow.

   Every step advects the velocity field through itself, measures the
   divergence that leaves behind, relaxes a pressure field against it with
   twenty Jacobi iterations, subtracts the pressure gradient, and then carries
   a two-channel pigment field through the velocity that survives. Because the
   projection makes the field divergence-free, ink cannot pile up or vanish; it
   can only be pushed sideways, which is why a wash spreads in lobes and
   fingers instead of expanding as a disc.

   The look is not the fluid. The look is the display pass over the pigment:

     EDGE DARKENING  A wash deposits pigment at the rim where it dries. Compare
                     each texel with a wider blur of itself: the positive part
                     is exactly the inner lip of a boundary. Add it back in.
                     This one term is the difference between ink and smoke.
     WASHI FIBRE     Two octaves, one long-grain (0.22 x 0.9, the laid line)
                     and one fine, plus a very slow octave of sheet unevenness.
     GRANULATION     Pigment reads denser where the sheet is pitted, so the
                     fibre field modulates ink density and not just paper.
     RELATIVE LOAD   Two pigments in one wash mix by their share of the total
                     load. Compositing one over the other would let whichever
                     was laid last win outright, which is not what paper does
                     and erases the quieter pigment.

   There is no cursor behind a page, so the brush is driven by the reader:
   `progress` walks the head of each mark along its path, laying pigment and a
   little velocity as it goes, and `velocity` both dries the brush (a fast drag
   carries less pigment per unit length) and stirs the standing wash, so
   scrolling disturbs what is already on the sheet.

   Restraint is the point. Four marks, an enormous void through the top left
   where type lives, one loaded gesture down the right that matters more than
   the other three together, and a soft off-centre mask that holds the middle
   of the frame quiet no matter what drifts into it.
   ========================================================================== */

import { useEffect, useRef } from 'react';
import type { BackdropProps } from './types';

/* ---- solver -------------------------------------------------------------- */

const SIM = 192;                 // velocity / pressure grid, long axis
const DYE = 640;                 // pigment grid, finer so a stroke stays crisp
const SIM_LOW = 128;             // reduced-capability tier
const DYE_LOW = 427;             // ... same DYE/SIM ratio, so flow reads the same
const PRESSURE_ITER = 20;
const PRESSURE_ITER_LOW = 12;
const VEL_DISSIPATION = 1.9;     // motion dies fast, so the wash comes to rest
const DYE_DISSIPATION = 0.005;   // pigment lingers; paper does not forget
const SIM_DT = 1 / 60;           // solver step, clamped so a stall cannot explode it

/* How long the solver keeps running after the last disturbance. Deliberately
   short. Semi-Lagrangian advection resamples the whole pigment field every
   step, and while the velocity is small but non-zero that resampling is a
   low-pass filter running over and over: leave it going and a stroke melts
   into an airbrush. The wash needs long enough to bleed and pool, and then it
   needs to be left alone, which is also how paper behaves. */
const SETTLE_TIME = 1.3;

/* ---- brush --------------------------------------------------------------- */

const MAX_ADV = 0.035;   // head advance per frame, so a scroll jump is still painted
const SPLAT_CAP = 22;    // stamps per mark per frame
const STIR_FORCE = 26;   // how hard scrolling pushes the standing wash
const STIR_RADIUS = 0.012;

/* ---- look ---------------------------------------------------------------- */

const INK_GAIN = 2.6;    // Beer-Lambert steepness
const RIM_GAIN = 3.4;    // how much of the drying rim is added back
const PIG_MAX = 0.58;    // ceiling on pigment alpha; this is a backdrop
const CALM_FLOOR = 0.42; // how hard the middle of the frame is held back
const DPR_CAP = 2;

/* -------------------------------------------------------------------------- */
/* composition                                                                 */
/* -------------------------------------------------------------------------- */

interface Mark {
  /** Four control points, x,y, in screen space with y running down. */
  readonly pts: readonly number[];
  readonly start: number;   // progress at which the brush touches down
  readonly span: number;    // progress consumed drawing it
  readonly width: number;   // brush sigma, as a fraction of frame HEIGHT
  readonly load: number;    // pigment per stamp at full pressure
  readonly force: number;   // velocity injected along the tangent
  readonly mix0: number;    // accent share of the load at the head ...
  readonly mix1: number;    // ... and at the tail, so the brush changes colour
  readonly taper: number;   // pressure decay exponent along the stroke
}

const MARKS: readonly Mark[] = [
  /* The ground. Pale, wet, pushed into the bottom left corner and off the edge
     so it has somewhere to go. Little pigment and a lot of push, so it bleeds
     wide and pools at its rim: this is the mark that shows what the sheet does. */
  {
    pts: [-0.06, 0.85, 0.15, 0.945, 0.36, 0.882, 0.54, 0.952],
    start: -0.04, span: 0.30, width: 0.06,
    load: 0.10, force: 26, mix0: 0.06, mix1: 0.26, taper: 0.55
  },
  /* THE stroke. One gesture, top to bottom, right of centre and clear of the
     column where type sits. Heavily loaded and given almost no velocity, so it
     holds its shape while everything around it spreads. It is the only mark
     that has to be good; the other three answer to it. */
  {
    pts: [0.63, -0.03, 0.716, 0.29, 0.622, 0.61, 0.724, 1.04],
    start: 0.10, span: 0.34, width: 0.02,
    load: 0.34, force: 3, mix0: 0.03, mix1: 0.16, taper: 0.42
  },
  /* A dry line low across the sheet, tying the wash to the gesture. Thin
     enough that it is nearly all boundary, so edge darkening carries it. */
  {
    pts: [0.10, 0.902, 0.33, 0.846, 0.55, 0.80, 0.76, 0.736],
    start: 0.42, span: 0.26, width: 0.009,
    load: 0.18, force: 5, mix0: 0.0, mix1: 0.06, taper: 0.70
  },
  /* The counter-mark: short, low left, where the second pigment arrives. It
     balances the gesture across the diagonal and is the only warm note. */
  {
    pts: [0.132, 0.742, 0.161, 0.788, 0.177, 0.836, 0.20, 0.876],
    start: 0.62, span: 0.20, width: 0.013,
    load: 0.22, force: 9, mix0: 0.88, mix1: 0.55, taper: 0.80
  }
];

const NMARK = MARKS.length;

/* -------------------------------------------------------------------------- */
/* shaders                                                                     */
/* -------------------------------------------------------------------------- */

const BASE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
uniform vec2 uTexel;
out vec2 vUv; out vec2 vL; out vec2 vR; out vec2 vT; out vec2 vB;
void main(){
  vUv = aPos * 0.5 + 0.5;
  vL = vUv - vec2(uTexel.x, 0.0);
  vR = vUv + vec2(uTexel.x, 0.0);
  vT = vUv + vec2(0.0, uTexel.y);
  vB = vUv - vec2(0.0, uTexel.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const ADVECT_FS = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uVelocity, uSource;
uniform vec2 uTexel;
uniform float uDt, uDissipation;
void main(){
  vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uTexel;
  outColor = texture(uSource, coord) / (1.0 + uDissipation * uDt);
}`;

const DIVERGENCE_FS = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
out vec4 outColor;
uniform sampler2D uVelocity;
void main(){
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  /* Free-slip walls: mirror the normal component, so the sheet has edges. */
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  outColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const PRESSURE_FS = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
out vec4 outColor;
uniform sampler2D uPressure, uDivergence;
void main(){
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float div = texture(uDivergence, vUv).x;
  outColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT_FS = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
out vec4 outColor;
uniform sampler2D uPressure, uVelocity;
void main(){
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 v = texture(uVelocity, vUv).xy;
  v -= vec2(R - L, T - B) * 0.5;
  outColor = vec4(v, 0.0, 1.0);
}`;

const SPLAT_FS = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uTarget;
uniform float uAspect, uRadius;
uniform vec2 uPoint;
uniform vec3 uColor;
void main(){
  vec2 p = vUv - uPoint;
  p.x *= uAspect;                       // so a stamp is round on screen
  /* Super-gaussian, not gaussian. A brush lays a fairly flat load and then
     stops; a gaussian has no edge at all, and a field with no edge gives the
     rim term in the display pass nothing to find, which is the difference
     between a stroke of ink and a smear of smoke. */
  float q = dot(p, p) / uRadius;
  vec3 stamp = exp(-pow(q, 1.6)) * uColor;
  outColor = vec4(texture(uTarget, vUv).xyz + stamp, 1.0);
}`;

/* The watercolour renderer. Everything that separates ink from smoke is here,
   and every colour it uses arrives as a uniform from the palette. */
const DISPLAY_FS = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uDye;
uniform vec2 uDyeTexel, uGrain;
uniform float uIntensity, uCeiling;
uniform vec3 uSurface, uInk, uInk2, uAccent, uAccent2;

float hash21(vec2 p){
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
             mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
}

void main(){
  vec2 d0 = texture(uDye, vUv).rg;

  /* Edge darkening. A wash dries from its rim inward and strands its pigment
     there; the difference between a texel and a wider blur of itself is
     positive only on the inner lip of a boundary, which is exactly where that
     rim sits. A thin mark is all boundary and simply reads denser, which is
     also true on paper. */
  vec2 e = uDyeTexel * 3.6;
  vec2 blur = (texture(uDye, vUv + vec2(e.x, 0.0)).rg
             + texture(uDye, vUv - vec2(e.x, 0.0)).rg
             + texture(uDye, vUv + vec2(0.0, e.y)).rg
             + texture(uDye, vUv - vec2(0.0, e.y)).rg) * 0.25;
  vec2 ink = d0 + max(d0 - blur, 0.0) * ${RIM_GAIN.toFixed(2)};

  /* Washi: long grain, fine grain, and a very slow octave of sheet
     unevenness. Measured in CSS pixels rather than device pixels, so the paper
     is the same paper on a retina display as on a cheap panel. */
  vec2 sp = vUv * uGrain;
  float fibre = vnoise(sp * vec2(0.22, 0.9)) * 0.55 + vnoise(sp * 1.9) * 0.45;
  float sheet = vnoise(sp * 0.011);
  vec3 paper = mix(uSurface, uInk2, fibre * 0.055 + sheet * 0.03);

  /* Granulation: settled pigment reads darker where the sheet is pitted. */
  ink *= 0.86 + fibre * 0.30;

  /* Two pigments MIX by relative load. Compositing one over the other would
     let whichever was laid last win outright and bury the quieter one. */
  float total = ink.r + ink.g;
  float m = total > 1e-5 ? ink.g / total : 0.0;
  vec3 pig = mix(uInk, uAccent, m);
  /* Only the deepest pools take a cool cast; any earlier and the whole stroke
     turns blue-grey. */
  pig = mix(pig, uAccent2, smoothstep(0.90, 2.20, total) * 0.12);

  /* Hold the middle of the frame quiet. Off-centre, so it is not a
     symmetrical hole, and floored, so a mark that drifts in does not vanish. */
  vec2 n = vec2(vUv.x - 0.44, vUv.y - 0.50);
  float d2 = min(n.x * n.x / 0.085 + n.y * n.y / 0.105, 1.0);
  float calm = ${CALM_FLOOR.toFixed(2)} + ${(1 - CALM_FLOOR).toFixed(2)} * (d2 * d2 * (3.0 - 2.0 * d2));

  float a = (1.0 - exp(-total * ${INK_GAIN.toFixed(2)})) * uCeiling * calm;
  outColor = vec4(mix(paper, pig, a), uIntensity);
}`;

/* -------------------------------------------------------------------------- */
/* helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Write one CSS colour into `out` as three 0..1 floats. Never throws. */
function parseColor(src: string | undefined, out: Float32Array, o: number): void {
  let r = 0.5;
  let g = 0.5;
  let b = 0.5;
  const s = (src ?? '').trim();

  if (s.charCodeAt(0) === 35 /* # */) {
    const hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      r = parseInt(hex.charAt(0) + hex.charAt(0), 16) / 255;
      g = parseInt(hex.charAt(1) + hex.charAt(1), 16) / 255;
      b = parseInt(hex.charAt(2) + hex.charAt(2), 16) / 255;
    } else if (hex.length >= 6) {
      r = parseInt(hex.slice(0, 2), 16) / 255;
      g = parseInt(hex.slice(2, 4), 16) / 255;
      b = parseInt(hex.slice(4, 6), 16) / 255;
    }
  } else if (s.length > 4) {
    /* rgb()/rgba(): pull the first three numbers out by hand rather than with
       a regex, so a palette swap stays allocation-light. */
    let i = 0;
    let n = 0;
    let v0 = 0;
    let v1 = 0;
    let v2 = 0;
    while (i < s.length && n < 3) {
      const c = s.charCodeAt(i);
      if ((c >= 48 && c <= 57) || c === 46) {
        let j = i + 1;
        while (j < s.length) {
          const d = s.charCodeAt(j);
          if (!((d >= 48 && d <= 57) || d === 46)) break;
          j++;
        }
        const val = parseFloat(s.slice(i, j));
        if (n === 0) v0 = val;
        else if (n === 1) v1 = val;
        else v2 = val;
        n++;
        i = j;
      } else i++;
    }
    if (n === 3) {
      r = v0 / 255;
      g = v1 / 255;
      b = v2 / 255;
    }
  }

  out[o] = Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 0.5;
  out[o + 1] = Number.isFinite(g) ? Math.min(1, Math.max(0, g)) : 0.5;
  out[o + 2] = Number.isFinite(b) ? Math.min(1, Math.max(0, b)) : 0.5;
}

function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Enable float rendering on a context. Asking for an extension is what turns
 * it on, so this has to be called on the context that will actually be used —
 * probing it somewhere else proves nothing about this one.
 */
function enableFloat(g: WebGL2RenderingContext): boolean {
  return !!g.getExtension('EXT_color_buffer_float') || !!g.getExtension('EXT_color_buffer_half_float');
}

/**
 * Can this machine render into a half-float target at all? Probed on a
 * throwaway canvas, because once a canvas has handed out a WebGL context it
 * can never hand out a 2D one, and the fallback below has to stay reachable.
 *
 * The extension being present is not the question — whether an RG16F
 * attachment comes back complete is, and on software rasterisers those two
 * answers differ. So build one and ask.
 */
function probeWebGL2(): boolean {
  try {
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const g = probe.getContext('webgl2', { antialias: false, depth: false, stencil: false });
    if (!g) return false;
    let ok = false;
    if (enableFloat(g)) {
      const tex = g.createTexture();
      const fbo = g.createFramebuffer();
      if (tex && fbo) {
        g.bindTexture(g.TEXTURE_2D, tex);
        g.texImage2D(g.TEXTURE_2D, 0, g.RG16F, 4, 4, 0, g.RG, g.HALF_FLOAT, null);
        g.bindFramebuffer(g.FRAMEBUFFER, fbo);
        g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0);
        ok = g.checkFramebufferStatus(g.FRAMEBUFFER) === g.FRAMEBUFFER_COMPLETE;
      }
    }
    /* Safe here and nowhere else: this canvas is garbage the moment we return. */
    const lose = g.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return ok;
  } catch {
    return false;
  }
}

interface Fbo {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
  texelX: number;
  texelY: number;
}

interface Dbl {
  a: Fbo;
  b: Fbo;
  texelX: number;
  texelY: number;
}

/* -------------------------------------------------------------------------- */
/* component                                                                   */
/* -------------------------------------------------------------------------- */

export default function InkWash({
  intensity,
  progress,
  velocity,
  palette,
  className
}: BackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* Props are read through refs inside the loop, so a scroll-rate prop change
     never re-runs the engine effect or rebuilds a single GPU target. */
  const live = useRef({ intensity: 0, progress: 0, velocity: 0 });
  const colors = useRef<Float32Array>(new Float32Array(15));
  const colorVersion = useRef(0);
  const repaint = useRef<(() => void) | null>(null);

  /* Declared before the sync effect so the buffer is populated before the
     engine effect (mount-only, therefore last) first reads it. */
  useEffect(() => {
    const c = colors.current;
    parseColor(palette.surface, c, 0);
    parseColor(palette.ink, c, 3);
    parseColor(palette.ink2, c, 6);
    parseColor(palette.accent, c, 9);
    parseColor(palette.accent2, c, 12);
    colorVersion.current++;
    repaint.current?.();
  }, [palette.surface, palette.ink, palette.ink2, palette.accent, palette.accent2]);

  useEffect(() => {
    live.current.intensity = intensity;
    live.current.progress = progress;
    live.current.velocity = velocity;
    /* Only does anything on the static paths, where no loop would notice. */
    repaint.current?.();
  });

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    /* Re-bound with an explicit type: the target is ES5, where a narrowing does
       not survive into a hoisted function declaration, and almost everything
       below is one. Same trick for the contexts. */
    const cv: HTMLCanvasElement = canvasEl;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4;
    const lowPower = coarse || cores <= 4;

    const simW = lowPower ? SIM_LOW : SIM;
    const dyeW = lowPower ? DYE_LOW : DYE;
    const iters = lowPower ? PRESSURE_ITER_LOW : PRESSURE_ITER;
    const dprCap = lowPower ? 1.5 : DPR_CAP;

    /* ---- geometry, shared by both paths --------------------------------- */

    let cssW = 1;
    let cssH = 1;
    let aspect = 1;

    const heads = new Float32Array(NMARK);
    const arcLen = new Float32Array(NMARK);
    const jitter = new Float32Array(NMARK * 64);
    for (let s = 0; s < NMARK; s++) {
      for (let k = 0; k < 64; k++) {
        /* Per-mark edge wobble, so a stroke is never a clean capsule. */
        jitter[s * 64 + k] = 0.84 + 0.3 * hash2(k + s * 131, s * 17 + 5);
      }
    }

    /* Scratch for path evaluation: plain numbers in the closure, so getting a
       point off a curve allocates nothing. */
    let px = 0;
    let py = 0;

    /** Catmull-Rom through all four control points, endpoints clamped. */
    function pathAt(spec: Mark, t: number): void {
      let seg = Math.floor(t * 3);
      if (seg > 2) seg = 2;
      if (seg < 0) seg = 0;
      const u = t * 3 - seg;
      const i0 = Math.max(0, seg - 1);
      const i1 = seg;
      const i2 = Math.min(3, seg + 1);
      const i3 = Math.min(3, seg + 2);
      const u2 = u * u;
      const u3 = u2 * u;
      const c0 = -0.5 * u3 + u2 - 0.5 * u;
      const c1 = 1.5 * u3 - 2.5 * u2 + 1;
      const c2 = -1.5 * u3 + 2 * u2 + 0.5 * u;
      const c3 = 0.5 * u3 - 0.5 * u2;
      const p = spec.pts;
      px = c0 * p[i0 * 2] + c1 * p[i1 * 2] + c2 * p[i2 * 2] + c3 * p[i3 * 2];
      py = c0 * p[i0 * 2 + 1] + c1 * p[i1 * 2 + 1] + c2 * p[i2 * 2 + 1] + c3 * p[i3 * 2 + 1];
    }

    /** Loaded-brush pressure: swells fast, then decays by the mark's taper. */
    function envelope(t: number, taper: number): number {
      const rise = t < 0.07 ? t / 0.07 : 1;
      return rise * Math.pow(1 - t, taper);
    }

    /** Arc length in screen-normalised units, where x is stretched by aspect. */
    function measureArcs(): void {
      for (let s = 0; s < NMARK; s++) {
        const spec = MARKS[s];
        let len = 0;
        let lx = 0;
        let ly = 0;
        for (let k = 0; k <= 32; k++) {
          pathAt(spec, k / 32);
          const x = px * aspect;
          const y = py;
          if (k > 0) {
            const dx = x - lx;
            const dy = y - ly;
            len += Math.sqrt(dx * dx + dy * dy);
          }
          lx = x;
          ly = y;
        }
        arcLen[s] = len;
      }
    }

    /** Where a mark's head should be for a given progress. */
    function targetHead(s: number, prog: number): number {
      const spec = MARKS[s];
      const t = (prog - spec.start) / spec.span;
      return t < 0 ? 0 : t > 1 ? 1 : t;
    }

    /* ---- context --------------------------------------------------------- */

    const glCtx = probeWebGL2()
      ? cv.getContext('webgl2', {
          alpha: true,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: false, // the display pass writes straight alpha
          preserveDrawingBuffer: false,
          powerPreference: 'low-power'
        })
      : null;

    let raf = 0;
    let pending = 0;
    let running = false;
    let visible = true; // optimistic: paint first, let the observer park it
    let last = 0;
    let settle = SETTLE_TIME;

    /* ------------------------------------------------------------------ */
    /* No float targets: no fluid. Paint the same composition as soft       */
    /* stamps, so the section still gets its sheet of paper and its marks.  */
    /* ------------------------------------------------------------------ */
    if (!glCtx) {
      const ctx2d = cv.getContext('2d');
      if (!ctx2d) return;
      const ctx: CanvasRenderingContext2D = ctx2d;

      const css = (o: number): string => {
        const c = colors.current;
        return `rgb(${Math.round(c[o] * 255)},${Math.round(c[o + 1] * 255)},${Math.round(
          c[o + 2] * 255
        )})`;
      };

      const paint = (): void => {
        const w = cv.width;
        const h = cv.height;
        ctx.clearRect(0, 0, w, h);
        const inten = live.current.intensity;
        if (inten <= 0.004 || w < 2 || h < 2) return;

        const a = inten > 1 ? 1 : inten;
        ctx.globalAlpha = a;
        ctx.fillStyle = css(0);
        ctx.fillRect(0, 0, w, h);

        const inkCss = css(3);
        const accCss = css(9);
        const prog = live.current.progress;
        for (let s = 0; s < NMARK; s++) {
          const spec = MARKS[s];
          const head = targetHead(s, prog);
          if (head <= 0.001) continue;
          const steps = Math.max(2, Math.round(head * 90));
          for (let k = 0; k <= steps; k++) {
            const t = (head * k) / steps;
            const env = envelope(t, spec.taper);
            if (env <= 0.02) continue;
            pathAt(spec, t);
            const jit = jitter[s * 64 + (((t * 63) | 0) & 63)];
            const r = spec.width * env * jit * h * 2.1;
            if (r < 0.8) continue;
            const cx = px * w;
            const cy = py * h;
            const mix = spec.mix0 + (spec.mix1 - spec.mix0) * t;
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            grad.addColorStop(0, mix > 0.5 ? accCss : inkCss);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalAlpha = a * Math.min(0.5, spec.load * env * 1.5) * 0.5;
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      };

      const resize2d = (): void => {
        const rect = cv.getBoundingClientRect();
        const w = rect.width || cv.clientWidth;
        const h = rect.height || cv.clientHeight;
        if (w < 1 || h < 1) return;
        const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
        const pw = Math.max(1, Math.round(w * dpr));
        const ph = Math.max(1, Math.round(h * dpr));
        cssW = w;
        cssH = h;
        aspect = w / h;
        measureArcs();
        if (pw !== cv.width || ph !== cv.height) {
          cv.width = pw;
          cv.height = ph;
        }
        paint();
      };

      const schedule2d = (): void => {
        if (pending) return;
        pending = requestAnimationFrame(() => {
          pending = 0;
          paint();
        });
      };
      repaint.current = schedule2d;

      resize2d();
      const ro2 = new ResizeObserver(() => resize2d());
      ro2.observe(cv);

      return () => {
        cancelAnimationFrame(pending);
        pending = 0;
        ro2.disconnect();
        repaint.current = null;
      };
    }

    /* ------------------------------------------------------------------ */
    /* GL setup                                                            */
    /* ------------------------------------------------------------------ */

    const gl: WebGL2RenderingContext = glCtx;
    /* The probe ran on a different context. Turning float rendering on here is
       what actually makes RG16F attachments renderable for this one. */
    enableFloat(gl);

    function compile(type: number, src: string): WebGLShader | null {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        gl.deleteShader(s);
        return null;
      }
      return s;
    }

    function link(fs: string): WebGLProgram | null {
      const p = gl.createProgram();
      const v = compile(gl.VERTEX_SHADER, BASE_VS);
      const f = compile(gl.FRAGMENT_SHADER, fs);
      if (!p || !v || !f) return null;
      gl.attachShader(p, v);
      gl.attachShader(p, f);
      gl.linkProgram(p);
      /* The program holds its own reference now; drop ours. */
      gl.deleteShader(v);
      gl.deleteShader(f);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        gl.deleteProgram(p);
        return null;
      }
      return p;
    }

    const pAdvect = link(ADVECT_FS);
    const pDiv = link(DIVERGENCE_FS);
    const pPress = link(PRESSURE_FS);
    const pGrad = link(GRADIENT_FS);
    const pSplat = link(SPLAT_FS);
    const pShow = link(DISPLAY_FS);
    const vao = gl.createVertexArray();
    const quad = gl.createBuffer();

    /* Uniform locations are objects, so looking one up per frame would
       allocate. Every location this component will ever need is resolved
       here, once. */
    function loc(p: WebGLProgram | null, n: string): WebGLUniformLocation | null {
      return p ? gl.getUniformLocation(p, n) : null;
    }
    const uAdvTexel = loc(pAdvect, 'uTexel');
    const uAdvVel = loc(pAdvect, 'uVelocity');
    const uAdvSrc = loc(pAdvect, 'uSource');
    const uAdvDt = loc(pAdvect, 'uDt');
    const uAdvDiss = loc(pAdvect, 'uDissipation');
    const uDivTexel = loc(pDiv, 'uTexel');
    const uDivVel = loc(pDiv, 'uVelocity');
    const uPrTexel = loc(pPress, 'uTexel');
    const uPrP = loc(pPress, 'uPressure');
    const uPrD = loc(pPress, 'uDivergence');
    const uGrTexel = loc(pGrad, 'uTexel');
    const uGrP = loc(pGrad, 'uPressure');
    const uGrV = loc(pGrad, 'uVelocity');
    const uSpTarget = loc(pSplat, 'uTarget');
    const uSpAspect = loc(pSplat, 'uAspect');
    const uSpPoint = loc(pSplat, 'uPoint');
    const uSpColor = loc(pSplat, 'uColor');
    const uSpRadius = loc(pSplat, 'uRadius');
    const uShDye = loc(pShow, 'uDye');
    const uShDyeTexel = loc(pShow, 'uDyeTexel');
    const uShGrain = loc(pShow, 'uGrain');
    const uShInten = loc(pShow, 'uIntensity');
    const uShCeil = loc(pShow, 'uCeiling');
    const uShSurface = loc(pShow, 'uSurface');
    const uShInk = loc(pShow, 'uInk');
    const uShInk2 = loc(pShow, 'uInk2');
    const uShAccent = loc(pShow, 'uAccent');
    const uShAccent2 = loc(pShow, 'uAccent2');

    let ok = !!(pAdvect && pDiv && pPress && pGrad && pSplat && pShow && vao && quad);

    if (ok) {
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.clearColor(0, 0, 0, 0);
    }

    /* ---- targets --------------------------------------------------------- */

    const owned: Fbo[] = [];
    let vel: Dbl | null = null;
    let dye: Dbl | null = null;
    let div: Fbo | null = null;
    let pres: Dbl | null = null;
    let builtAspect = 0;

    function makeFbo(w: number, h: number, internal: number, format: number, filter: number): Fbo | null {
      const tex = gl.createTexture();
      const fbo = gl.createFramebuffer();
      if (!tex || !fbo) return null;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.HALF_FLOAT, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const f: Fbo = { tex, fbo, w, h, texelX: 1 / w, texelY: 1 / h };
      owned.push(f);
      return f;
    }

    function makeDbl(w: number, h: number, internal: number, format: number, filter: number): Dbl | null {
      const a = makeFbo(w, h, internal, format, filter);
      const b = makeFbo(w, h, internal, format, filter);
      if (!a || !b) return null;
      return { a, b, texelX: 1 / w, texelY: 1 / h };
    }

    function swapDbl(d: Dbl): void {
      const t = d.a;
      d.a = d.b;
      d.b = t;
    }

    function dropTargets(): void {
      for (let i = 0; i < owned.length; i++) {
        gl.deleteTexture(owned[i].tex);
        gl.deleteFramebuffer(owned[i].fbo);
      }
      owned.length = 0;
      vel = null;
      dye = null;
      div = null;
      pres = null;
    }

    function buildTargets(): void {
      dropTargets();
      const sh = Math.max(48, Math.round(simW / aspect));
      const dh = Math.max(96, Math.round(dyeW / aspect));
      vel = makeDbl(simW, sh, gl.RG16F, gl.RG, gl.LINEAR);
      dye = makeDbl(dyeW, dh, gl.RG16F, gl.RG, gl.LINEAR);
      div = makeFbo(simW, sh, gl.R16F, gl.RED, gl.NEAREST);
      pres = makeDbl(simW, sh, gl.R16F, gl.RED, gl.NEAREST);
      builtAspect = aspect;
      if (!vel || !dye || !div || !pres) ok = false;
    }

    /* ---- passes ---------------------------------------------------------- */

    function blit(t: Fbo | null): void {
      if (t) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
        gl.viewport(0, 0, t.w, t.h);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, cv.width, cv.height);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function bind(unit: number, tex: WebGLTexture): void {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    }

    /**
     * One stamp of the brush: pigment into the dye field, and a push into the
     * velocity field so the fluid takes it from there. `x`,`y` are in uv with
     * y already flipped; `radius` is the gaussian's sigma squared.
     */
    function splat(
      x: number,
      y: number,
      dx: number,
      dy: number,
      radius: number,
      r: number,
      g: number
    ): void {
      if (!vel || !dye) return;
      gl.useProgram(pSplat);
      gl.uniform1f(uSpAspect, aspect);
      gl.uniform2f(uSpPoint, x, y);
      gl.uniform1f(uSpRadius, radius);

      if (dx !== 0 || dy !== 0) {
        bind(0, vel.a.tex);
        gl.uniform1i(uSpTarget, 0);
        gl.uniform3f(uSpColor, dx, dy, 0);
        blit(vel.b);
        swapDbl(vel);
      }
      if (r !== 0 || g !== 0) {
        bind(0, dye.a.tex);
        gl.uniform1i(uSpTarget, 0);
        gl.uniform3f(uSpColor, r, g, 0);
        blit(dye.b);
        swapDbl(dye);
      }
    }

    /**
     * Lay one mark between two head positions. Stamps are spaced by arc length
     * and never by however finely scrolling happens to subdivide `progress`, so
     * a slow reader and a fast one get the same painting. When the per-frame
     * cap bites, the stamps that remain are made heavier by exactly the factor
     * that was lost.
     */
    function layMark(s: number, h0: number, h1: number, vn: number, cap: number): void {
      const spec = MARKS[s];
      const seg = (h1 - h0) * arcLen[s];
      /* Stamps must overlap even where the brush has narrowed to its floor,
         or the tail of a stroke breaks into a dotted line. */
      let n = Math.ceil(seg / (0.28 * spec.width));
      if (n < 1) n = 1;
      let dens = 1;
      if (n > cap) {
        dens = n / cap;
        n = cap;
      }
      /* A brush dragged fast carries less pigment per unit length and more
         momentum. That is the whole of `velocity`'s effect on the brush. */
      const wet = 1 - 0.35 * vn;
      const push = 1 + 0.9 * vn;

      for (let k = 1; k <= n; k++) {
        const t = h0 + ((h1 - h0) * k) / n;
        const env = envelope(t, spec.taper);
        if (env <= 0.02) continue;
        pathAt(spec, t);
        const cx = px;
        const cy = py;
        pathAt(spec, Math.min(1, t + 0.02));
        let tx = px - cx;
        let ty = py - cy;
        const tl = Math.sqrt(tx * tx * aspect * aspect + ty * ty) || 1;
        tx /= tl;
        ty /= tl;

        const jit = jitter[s * 64 + (((t * 63) | 0) & 63)];
        /* The footprint narrows to a third and then stops, while the load goes
           on falling to nothing. A brush lifts off the paper; it does not
           shrink to a point, and a shrinking point leaves a dotted line where
           the stamps stop overlapping. */
        const sigma = spec.width * (0.34 + 0.66 * env) * jit;
        const mix = spec.mix0 + (spec.mix1 - spec.mix0) * t;
        const load = spec.load * env * dens * wet;
        const f = spec.force * env * push;

        /* uv y runs up the screen; the composition is authored with y down. */
        splat(cx, 1 - cy, tx * f, -ty * f, sigma * sigma, load * (1 - mix), load * mix);
      }
    }

/**
     * Stir the standing wash with the reader's scroll. No pigment, only push.
     * Scaled by the frame's share of a 60Hz tick: this fires every frame that
     * the page is moving, and without that scale a 144Hz display would shove
     * the wash across the sheet nearly two and a half times as hard as a 60Hz
     * one for the same scroll.
     */
    function stir(vn: number, dir: number, scale: number): void {
      const f = STIR_FORCE * vn * dir * scale;
      splat(0.2, 0.62, 5 * vn * scale, f, STIR_RADIUS, 0, 0);
      splat(0.78, 0.36, -5 * vn * scale, f * 0.7, STIR_RADIUS, 0, 0);
    }

    function step(dt: number): void {
      if (!vel || !dye || !div || !pres) return;

      /* advect the velocity field through itself */
      gl.useProgram(pAdvect);
      gl.uniform2f(uAdvTexel, vel.texelX, vel.texelY);
      bind(0, vel.a.tex);
      gl.uniform1i(uAdvVel, 0);
      gl.uniform1i(uAdvSrc, 0);
      gl.uniform1f(uAdvDt, dt);
      gl.uniform1f(uAdvDiss, VEL_DISSIPATION);
      blit(vel.b);
      swapDbl(vel);

      /* how far the advected field has drifted from conserving volume */
      gl.useProgram(pDiv);
      gl.uniform2f(uDivTexel, vel.texelX, vel.texelY);
      bind(0, vel.a.tex);
      gl.uniform1i(uDivVel, 0);
      blit(div);

      /* relax a pressure field against that divergence */
      gl.useProgram(pPress);
      gl.uniform2f(uPrTexel, vel.texelX, vel.texelY);
      bind(0, div.tex);
      gl.uniform1i(uPrD, 0);
      gl.uniform1i(uPrP, 1);
      for (let i = 0; i < iters; i++) {
        bind(1, pres.a.tex);
        blit(pres.b);
        swapDbl(pres);
      }

      /* subtract its gradient. What is left is divergence-free, and that is
         the whole reason ink spreads in lobes instead of as a disc. */
      gl.useProgram(pGrad);
      gl.uniform2f(uGrTexel, vel.texelX, vel.texelY);
      bind(0, pres.a.tex);
      gl.uniform1i(uGrP, 0);
      bind(1, vel.a.tex);
      gl.uniform1i(uGrV, 1);
      blit(vel.b);
      swapDbl(vel);

      /* carry the pigment through it */
      gl.useProgram(pAdvect);
      gl.uniform2f(uAdvTexel, dye.texelX, dye.texelY);
      bind(0, vel.a.tex);
      gl.uniform1i(uAdvVel, 0);
      bind(1, dye.a.tex);
      gl.uniform1i(uAdvSrc, 1);
      gl.uniform1f(uAdvDt, dt);
      gl.uniform1f(uAdvDiss, DYE_DISSIPATION);
      blit(dye.b);
      swapDbl(dye);
    }

    function display(): void {
      if (!dye) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clear(gl.COLOR_BUFFER_BIT);

      let inten = live.current.intensity;
      if (inten <= 0.004) return;
      if (inten > 1) inten = 1;

      const c = colors.current;
      /* Light marks on a dark ground read hotter than dark marks on a light
         one at equal alpha, so pull the ceiling down when the palette inverts.
         Derived from the palette rather than assumed, so it tracks any theme. */
      const inkLum = 0.2126 * c[3] + 0.7152 * c[4] + 0.0722 * c[5];
      const surfLum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      let lift = (inkLum - surfLum) * 2.2;
      if (lift < 0) lift = 0;
      if (lift > 1) lift = 1;

      gl.useProgram(pShow);
      bind(0, dye.a.tex);
      gl.uniform1i(uShDye, 0);
      gl.uniform2f(uShDyeTexel, dye.texelX, dye.texelY);
      gl.uniform2f(uShGrain, cssW, cssH);
      gl.uniform1f(uShInten, inten);
      gl.uniform1f(uShCeil, PIG_MAX * (1 - 0.3 * lift));
      gl.uniform3f(uShSurface, c[0], c[1], c[2]);
      gl.uniform3f(uShInk, c[3], c[4], c[5]);
      gl.uniform3f(uShInk2, c[6], c[7], c[8]);
      gl.uniform3f(uShAccent, c[9], c[10], c[11]);
      gl.uniform3f(uShAccent2, c[12], c[13], c[14]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /**
     * Repaint the sheet from nothing up to wherever the heads already are.
     * Needed because a target rebuild loses the painting, and used again for
     * the reduced-motion bake. Finite, and never called from the frame loop.
     */
    function replay(steps: number): void {
      let any = false;
      for (let s = 0; s < NMARK; s++) {
        if (heads[s] > 0.001) {
          layMark(s, 0, heads[s], 0, 4000);
          any = true;
        }
      }
      if (!any) return;
      for (let i = 0; i < steps; i++) step(SIM_DT);
    }

    /* ---- sizing ---------------------------------------------------------- */

    function resize(): void {
      if (!ok) return;
      const rect = cv.getBoundingClientRect();
      const w = rect.width || cv.clientWidth;
      const h = rect.height || cv.clientHeight;
      if (w < 1 || h < 1) return;
      const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      const pw = Math.max(1, Math.round(w * dpr));
      const ph = Math.max(1, Math.round(h * dpr));
      if (pw !== cv.width || ph !== cv.height) {
        cv.width = pw;
        cv.height = ph;
      }
      cssW = w;
      cssH = h;
      aspect = w / h;
      measureArcs();

      /* The grids are shaped to the frame, so a rebuild is only worth paying
         for when the frame's proportions actually moved. A phone rotating buys
         one; a browser chrome bar sliding away does not. */
      if (!vel || Math.abs(aspect / (builtAspect || 1) - 1) > 0.06) {
        buildTargets();
        if (ok) replay(24);
      }
      display();
    }

    /* ---- reduced motion --------------------------------------------------
       Lay the whole composition, dry it, show it, and stop for good. Chunked
       across a few frames because doing it in one go is a visible stall; this
       is a finite job that terminates, not an animation loop. */
    let bakeLeft = 0;
    let bakeRaf = 0;

    function bakeChunk(): void {
      let budget = 14;
      while (bakeLeft > 0 && budget-- > 0) {
        bakeLeft--;
        step(SIM_DT);
      }
      display();
      if (bakeLeft > 0) bakeRaf = requestAnimationFrame(bakeChunk);
    }

    function startBake(): void {
      if (!ok) return;
      for (let s = 0; s < NMARK; s++) heads[s] = 1;
      for (let s = 0; s < NMARK; s++) layMark(s, 0, 1, 0, 4000);
      bakeLeft = 34;
      cancelAnimationFrame(bakeRaf);
      bakeRaf = requestAnimationFrame(bakeChunk);
    }

    /* ---- loop ------------------------------------------------------------ */

    function frame(now: number): void {
      if (!running) return;
      raf = requestAnimationFrame(frame);

      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.25) dt = 0.25;
      if (dt < 0) dt = 0;

      /* A backdrop that is faded out simulates nothing at all. With eight of
         these on a page that is the difference between one running sheet and
         eight. It catches up when it fades back in, and because a head can
         only advance MAX_ADV per frame, catching up looks like being painted. */
      const inten = live.current.intensity;
      if (inten < 0.02) {
        display();
        return;
      }

      const v = live.current.velocity;
      const av = v < 0 ? -v : v;
      const vn = av > 90 ? 1 : av / 90;

      /* Walk each head toward where progress says it should be. */
      const adv = MAX_ADV * Math.min(3, dt * 60);
      const prog = live.current.progress;
      let moved = false;
      for (let s = 0; s < NMARK; s++) {
        const target = targetHead(s, prog);
        const h0 = heads[s];
        if (target <= h0 + 1e-4) continue;
        const h1 = target < h0 + adv ? target : h0 + adv;
        layMark(s, h0, h1, vn, SPLAT_CAP);
        heads[s] = h1;
        moved = true;
      }

      /* Scrolling down runs the wash down the page; scrolling back up lifts it. */
      if (av > 4) {
        stir(vn, v > 0 ? -1 : 1, Math.min(2, dt * 60));
        moved = true;
      }

      /* Nothing happening means nothing to solve. The sheet is already still,
         so the twenty pressure iterations can simply stop until it is
         disturbed again, and the frame costs one full-screen pass. */
      if (moved) settle = SETTLE_TIME;
      if (settle > 0) {
        settle -= dt;
        step(dt < SIM_DT ? dt : SIM_DT);
      }

      display();
    }

    function start(): void {
      if (running || !visible || reduced || !ok) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function stop(): void {
      running = false;
      cancelAnimationFrame(raf);
    }

    /* Reduced motion still has to honour intensity and a palette flip, but
       through a coalesced single-shot repaint rather than a standing loop. */
    function scheduleRepaint(): void {
      if (!reduced || pending || !ok) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        display();
      });
    }
    repaint.current = scheduleRepaint;

    resize();
    if (reduced) startBake();

    let resizeRaf = 0;
    function onResize(): void {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => resize());
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(cv);

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        if (visible && !document.hidden) start();
        else stop();
      },
      { threshold: 0 }
    );
    io.observe(cv);

    function onVisibility(): void {
      if (document.hidden) stop();
      else if (visible) start();
    }
    document.addEventListener('visibilitychange', onVisibility);

    /* A lost context cannot be rebuilt without redoing all of the above, and a
       backdrop is not worth that; stop cleanly rather than spew errors. */
    function onLost(e: Event): void {
      e.preventDefault();
      ok = false;
      stop();
    }
    cv.addEventListener('webglcontextlost', onLost);

    if (!reduced) start();

    /* No loseContext() here: React may hand this same canvas node to a
       remounted component, and a deliberately lost context never comes back.
       Deleting the resources already frees the GPU memory. */
    /*
     * Dev-only handle, identical across every world.
     *
     * The Browser pane reports `document.hidden` and never composites, so rAF
     * never fires and the IntersectionObserver reports the canvas as never on
     * screen. Without a way to drive a frame by hand there is no way to find
     * out what a world actually draws — which is exactly how Fluid came to be
     * shipped invisible. See docs/spec.md section 8.
     */
    if (process.env.NODE_ENV !== 'production') {
      (canvasEl as unknown as Record<string, unknown>).__world = {
        name: 'inkwash',
        frames: (n = 1) => {
          for (let i = 0; i < n; i++) frame(i * 16.667);
          cancelAnimationFrame(raf);
          raf = 0;
        }
      };
    }

    return () => {
      stop();
      cancelAnimationFrame(pending);
      cancelAnimationFrame(bakeRaf);
      cancelAnimationFrame(resizeRaf);
      pending = 0;
      bakeLeft = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      cv.removeEventListener('webglcontextlost', onLost);
      repaint.current = null;
      dropTargets();
      if (pAdvect) gl.deleteProgram(pAdvect);
      if (pDiv) gl.deleteProgram(pDiv);
      if (pPress) gl.deleteProgram(pPress);
      if (pGrad) gl.deleteProgram(pGrad);
      if (pSplat) gl.deleteProgram(pSplat);
      if (pShow) gl.deleteProgram(pShow);
      if (vao) gl.deleteVertexArray(vao);
      if (quad) gl.deleteBuffer(quad);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: 'none'
      }}
    />
  );
}
