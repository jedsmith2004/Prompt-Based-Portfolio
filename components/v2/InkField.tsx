'use client';

/* ============================================================================
   InkField — the site's one renderer.

   A GPU particle field is advected through curl noise and pulled toward an
   arbitrary target shape. Instead of drawing the particles as glowing points,
   they deposit into a pigment buffer, which is then shaded as watercolour on
   paper: edge darkening so pigment pools where the wash stops, fibre noise for
   the stock, and granulation so the ink settles into the tooth.

   The result is that the "latent field" and the "ink wash" are the same object.
   Feed it a different shape painter and the same engine renders a ridgeline, a
   wordmark, a handwritten digit, or a climbing wall.

   Lifecycle notes, because WebGL in React 18 is full of traps:
   - Capability is probed on a THROWAWAY canvas. A canvas that has ever handed
     out a webgl2 context can never hand out a 2d one, so we must decide which
     context to ask for before touching the real node.
   - Teardown never calls loseContext(). React reuses the same canvas DOM node
     across StrictMode's double-mount, and a lost context stays lost, which
     would leave the canvas permanently blank in development.
   - Only `density` is a real dependency. Every other prop is read per frame
     through a ref, so animating them does not reallocate the GPU pipeline.
   ========================================================================== */

import { useEffect, useRef } from 'react';

export type ShapePainter = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
) => void;

export interface InkFieldProps {
  /** Draws the target silhouette. White/light pixels attract particles. */
  shape: ShapePainter;
  /**
   * Change this whenever `shape` should be re-sampled. The painter itself is
   * held in a ref so an inline arrow does not tear down the GL context every
   * render; this key is what actually triggers a retarget. Particles then flow
   * to the new silhouette rather than snapping, because the gather term does
   * the work.
   */
  shapeKey?: string | number;
  className?: string;
  /** Particle budget. 'auto' picks from device capability. Changing this DOES rebuild. */
  density?: 'auto' | 'high' | 'medium' | 'low';
  /** Fraction of particles carrying vermilion rather than ink. 0..1 */
  vermilion?: number;
  /** How tightly the field holds the shape. 0 = free drift, 1 = locked. */
  cohesion?: number;
  /** Slow breathing between assembled and dispersed. */
  breathe?: boolean;
  /** Pointer disturbance strength. 0 disables interaction. */
  disturb?: number;
  /** Pigment laid per particle. Raise for a heavier wash. */
  deposit?: number;
  /**
   * The plate's colours.
   *
   * NOT OPTIONAL IN PRACTICE, and it used to be absent entirely. The field is
   * an opaque full-viewport layer -- the display shader writes alpha 1 -- so
   * whatever it thinks the paper is IS the page's ground wherever it is
   * running. It ran with the hero's light paper and the hero's near-black ink
   * as literals, which is why the closing plate, which settles dark, was a
   * light screen with dark particles on it.
   *
   * Hand it the target palette the instant the plate changes; the timing of
   * the move is this component's business (see FIELD_GROUND_MS), and it is
   * the same split the page makes: the paper travels, the pigment cuts.
   */
  palette?: { paper: string; ink: string; verm: string };
  /**
   * Park the field.
   *
   * Jack, 2026-08-26: "I like the particles but I don't think we should have
   * them on every page, I think the hero and the contact page only."
   *
   * The field is one GL context, one 512x512 particle simulation and one full
   * viewport draw per frame, and for six of the nine plates it was running
   * underneath a backdrop that was meant to be the thing you were looking at.
   * Two problems in one: the page was too busy, and it was paying for the
   * business twice.
   *
   * Dormant STOPS THE LOOP rather than hiding the canvas, and it does not
   * unmount: rebuilding the pipeline on every return to the hero would cost
   * more than idling, and cycling a GL context that way is how a page runs the
   * browser out of contexts. The stop is deferred by FADE_OUT_MS so the last
   * thing the reader sees is the field fading, not the field freezing.
   */
  dormant?: boolean;
}

/* -------------------------------------------------------------------------- */
/* the plate's colours, and how they arrive                                    */
/* -------------------------------------------------------------------------- */

/**
 * How long the field's paper takes to reach the new plate, ms.
 *
 * The same 940ms as `--ground` in v2.css, and for the same reason: on the two
 * plates that have particles the field IS the ground, so the two have to be
 * the same move or the reader sees the room change key twice.
 */
const FIELD_GROUND_MS = 940;
/** Where the pigment cuts. Half of the above; see CUT_MS in usePalette.ts. */
const FIELD_CUT_MS = 470;

/** cubic-bezier(0.62, 0, 0.38, 1), the ground's easing in v2.css. */
const GROUND_EASE = [0.62, 0, 0.38, 1] as const;

function bezier1(a: number, b: number, u: number): number {
  const v = 1 - u;
  return 3 * v * v * u * a + 3 * v * u * u * b + u * u * u;
}

/**
 * Solve the CSS easing for a progress fraction.
 *
 * Newton on x with a bisection fallback, which is what the engines do. Four
 * iterations is well inside a pixel of colour over this range, and it runs
 * once a frame during a change and never otherwise.
 */
function ease(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  let t = u;
  for (let i = 0; i < 4; i++) {
    const x = bezier1(GROUND_EASE[0], GROUND_EASE[2], t) - u;
    if (Math.abs(x) < 1e-4) break;
    const v = 1 - t;
    const d =
      3 * v * v * GROUND_EASE[0] +
      6 * v * t * (GROUND_EASE[2] - GROUND_EASE[0]) +
      3 * t * t * (1 - GROUND_EASE[2]);
    if (Math.abs(d) < 1e-6) break;
    t -= x / d;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  return bezier1(GROUND_EASE[1], GROUND_EASE[3], t);
}

type Rgb01 = [number, number, number];

/** '#rgb' or '#rrggbb' to 0..1 channels. Falls back to the hero's paper. */
function rgb01(hex: string, into: Rgb01): Rgb01 {
  let h = (hex || '').trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (h.length !== 6 || !Number.isFinite(n)) return into;
  into[0] = ((n >> 16) & 255) / 255;
  into[1] = ((n >> 8) & 255) / 255;
  into[2] = (n & 255) / 255;
  return into;
}

/** Rec. 709 luma, near enough to decide which way the paper's tooth goes. */
function luma(c: Rgb01): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/**
 * What the field is painting right now, and what it is on its way to.
 *
 * The paper travels over FIELD_GROUND_MS and the pigment cuts at
 * FIELD_CUT_MS, which is the page's own split: see THE MOVE IS ON THE GROUND
 * in v2.css. Advanced from the frame loop, so a field that is parked -- which
 * is seven plates out of nine -- simply arrives already correct.
 */
interface FieldInk {
  paper: Rgb01;
  ink: Rgb01;
  verm: Rgb01;
  fromPaper: Rgb01;
  toPaper: Rgb01;
  toInk: Rgb01;
  toVerm: Rgb01;
  /** performance.now() at the start of the move, or -1 when settled. */
  t0: number;
  /** Bumped whenever the painted colours change, so the 2D path can repaint. */
  rev: number;
}

const HERO_PAPER = '#E4DFD3';
const HERO_INK = '#17140F';
const HERO_VERM = '#B5402F';

function newFieldInk(): FieldInk {
  const mk = (hex: string): Rgb01 => rgb01(hex, [0, 0, 0]);
  return {
    paper: mk(HERO_PAPER),
    ink: mk(HERO_INK),
    verm: mk(HERO_VERM),
    fromPaper: mk(HERO_PAPER),
    toPaper: mk(HERO_PAPER),
    toInk: mk(HERO_INK),
    toVerm: mk(HERO_VERM),
    t0: -1,
    rev: 0
  };
}

/** Land everything immediately. Used when nothing is drawing to animate it. */
function settleInk(f: FieldInk): void {
  for (let i = 0; i < 3; i++) {
    f.paper[i] = f.fromPaper[i] = f.toPaper[i];
    f.ink[i] = f.toInk[i];
    f.verm[i] = f.toVerm[i];
  }
  f.t0 = -1;
  f.rev++;
}

/** One frame of the move. Cheap, and a no-op once it has landed. */
function advanceInk(f: FieldInk, now: number): void {
  if (f.t0 < 0) return;
  const ms = now - f.t0;
  const u = Math.min(1, Math.max(0, ms / FIELD_GROUND_MS));
  const e = ease(u);
  for (let i = 0; i < 3; i++) {
    f.paper[i] = f.fromPaper[i] + (f.toPaper[i] - f.fromPaper[i]) * e;
  }
  if (ms >= FIELD_CUT_MS) {
    for (let i = 0; i < 3; i++) {
      f.ink[i] = f.toInk[i];
      f.verm[i] = f.toVerm[i];
    }
  }
  f.rev++;
  if (u >= 1) {
    for (let i = 0; i < 3; i++) f.fromPaper[i] = f.toPaper[i];
    f.t0 = -1;
  }
}

/** Format one channel triple as a hex string, for the 2D fallback. */
function hex01(c: Rgb01): string {
  const b = (v: number) => {
    const n = Math.round(Math.min(1, Math.max(0, v)) * 255);
    return n < 16 ? '0' + n.toString(16) : n.toString(16);
  };
  return '#' + b(c[0]) + b(c[1]) + b(c[2]);
}

/**
 * How long the wrapper takes to fade out. Mirrored by `--v2-field-fade` in
 * v2.css: if the two disagree the field freezes mid-fade, visibly.
 */
const FADE_OUT_MS = 760;

/**
 * How far, in NDC, a woken particle starts from its target.
 *
 * 0.05 is about a fortieth of the screen. Small enough that the field reads as
 * already drawn the instant it fades up, large enough that the last of the
 * gather is visible rather than a hard cut. See retarget(settle).
 */
const SETTLE_SCATTER = 0.05;

/* -------------------------------------------------------------------------- */
/* shader sources                                                              */
/* -------------------------------------------------------------------------- */

const QUAD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const NOISE = `
float hash13(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 27.13;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i),                hash13(i + vec3(1,0,0)), f.x),
                 mix(hash13(i + vec3(0,1,0)),  hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)),  hash13(i + vec3(1,0,1)), f.x),
                 mix(hash13(i + vec3(0,1,1)),  hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 potential(vec3 p, float t){
  return vec3(
    noise3(p + vec3( 0.0,  0.0, t)),
    noise3(p + vec3(31.4,  7.2, t)),
    noise3(p + vec3(11.7, 43.9, t)));
}
vec3 curl(vec3 p, float t){
  const float e = 0.19;
  vec3 dx = potential(p + vec3(e,0,0), t) - potential(p - vec3(e,0,0), t);
  vec3 dy = potential(p + vec3(0,e,0), t) - potential(p - vec3(0,e,0), t);
  vec3 dz = potential(p + vec3(0,0,e), t) - potential(p - vec3(0,0,e), t);
  return vec3(dy.z - dz.y, dz.x - dx.z, dx.y - dy.x) / (2.0 * e);
}`;

const SIM_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uPos;
uniform sampler2D uTarget;
uniform float uTime, uDt, uGather, uAspect, uDrift;
uniform vec3  uMouse;   // xy in NDC, z = strength

${NOISE}

void main(){
  ivec2 uv  = ivec2(gl_FragCoord.xy);
  vec4  pos = texelFetch(uPos, uv, 0);
  vec4  tgt = texelFetch(uTarget, uv, 0);
  vec3  p   = pos.xyz;

  // NDC squashes x by the aspect ratio, so multiply x back up before sampling
  // the noise. That makes the eddies round on screen rather than stretched.
  vec3 np = vec3(p.x * uAspect, p.y, p.z) * 1.55;
  vec3 vel = curl(np, uTime * 0.075) * uDrift;

  // hold the shape
  vel += (tgt.xyz - p) * uGather;

  // pointer pushes pigment out of the way
  if (uMouse.z > 0.0) {
    vec2 d = p.xy - uMouse.xy;
    d.x *= uAspect;
    float dist = length(d);
    vec2 dir = dist > 1e-4 ? d / dist : vec2(0.0, 1.0);
    vel.xy += dir * uMouse.z * exp(-dist * dist * 7.5) * 1.35;
  }


  p += vel * uDt;
  p = clamp(p, vec3(-2.6, -2.6, -1.6), vec3(2.6, 2.6, 1.6));

  outColor = vec4(p, pos.w);
}`;

const DEPOSIT_VS = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uPos;
uniform sampler2D uTarget;
uniform float uSide, uPointSize, uVermCut;

out float vSettle;
out float vVerm;

void main(){
  int id = gl_VertexID;
  int side = int(uSide);
  ivec2 uv = ivec2(id % side, id / side);

  vec4 pos = texelFetch(uPos, uv, 0);
  vec4 tgt = texelFetch(uTarget, uv, 0);

  // how close this particle is to where it is meant to be
  vSettle = 1.0 - clamp(length(pos.xy - tgt.xy) * 2.4, 0.0, 1.0);
  vVerm   = pos.w > uVermCut ? 1.0 : 0.0;

  gl_Position  = vec4(pos.xy, 0.0, 1.0);
  gl_PointSize = uPointSize * (0.72 + vSettle * 0.85);
}`;

const DEPOSIT_FS = `#version 300 es
precision highp float;
in float vSettle;
in float vVerm;
out vec4 outColor;
uniform float uDeposit;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.03, length(c));
  if (a < 0.01) discard;
  // a loaded brush lays down more where the stroke rests
  float amt = a * uDeposit * (0.30 + vSettle * 1.05);
  outColor = vec4(amt * (1.0 - vVerm), amt * vVerm, 0.0, 1.0);
}`;

const DISPLAY_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uPigment;
uniform vec2  uTexel;
uniform vec2  uRes;
uniform vec3  uPaper;
uniform vec3  uInk;
uniform vec3  uVerm;
/* +1 on light stock, -1 on dark. The tooth of a sheet is darker than the
   sheet when the sheet is pale and LIGHTER than it when the sheet is not;
   subtracting unconditionally clipped the grain to black on a dark plate and
   the paper went flat exactly where it most needed to read as paper. */
uniform float uGrain;

float hash21(vec2 p){
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i),               hash21(i + vec2(1,0)), f.x),
             mix(hash21(i + vec2(0,1)),   hash21(i + vec2(1,1)), f.x), f.y);
}

void main(){
  vec2 d0 = texture(uPigment, vUv).rg;

  /* Edge darkening. This is the single detail that makes a wash read as
     watercolour rather than as smoke: pigment migrates to the drying rim. */
  vec2 e = uTexel * 2.7;
  vec2 blur = (texture(uPigment, vUv + vec2(e.x, 0.0)).rg
             + texture(uPigment, vUv - vec2(e.x, 0.0)).rg
             + texture(uPigment, vUv + vec2(0.0, e.y)).rg
             + texture(uPigment, vUv - vec2(0.0, e.y)).rg) * 0.25;
  vec2 rim = max(d0 - blur, 0.0);
  vec2 ink = d0 + rim * 2.9;

  /* Stock: one long-grain octave, one fine, plus slow sheet unevenness. */
  vec2 sp = vUv * uRes;
  float fibre = vnoise(sp * vec2(0.20, 0.85)) * 0.55 + vnoise(sp * 1.85) * 0.45;
  vec3 paper = uPaper - uGrain * (fibre * 0.028 + vnoise(sp * 0.010) * 0.016);

  /* Granulation: pigment settles into the tooth of the sheet. */
  float gran = 0.88 + fibre * 0.26;
  float mInk  = max(ink.r, 0.0) * gran;
  float mVerm = max(ink.g, 0.0) * gran;

  /* Two pigments in the same wash MIX, they do not stack. Compositing one over
     the other lets whichever is drawn last win, which erased the vermilion
     entirely. Blend by relative load instead, then apply the combined opacity
     once, so a little vermilion warms the ink rather than being buried by it. */
  float load = mInk + mVerm;
  vec3 pigment = load > 1e-5 ? (uInk * mInk + uVerm * mVerm) / load : uInk;
  vec3 col = mix(paper, pigment, clamp(load, 0.0, 1.0) * 0.94);

  outColor = vec4(col, 1.0);
}`;

/* -------------------------------------------------------------------------- */
/* gl helpers                                                                  */
/* -------------------------------------------------------------------------- */

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('[InkField] shader:', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function link(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('[InkField] link:', gl.getProgramInfoLog(p));
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

/**
 * Probe float-render support on a throwaway canvas.
 *
 * This must not touch the real canvas: once a node has produced a webgl2
 * context it can never produce a 2d one, so asking the real node first would
 * make the 2D fallback unreachable.
 */
function supportsFloatTargets(): boolean {
  try {
    const probe = document.createElement('canvas');
    probe.width = 2;
    probe.height = 2;
    const g = probe.getContext('webgl2');
    if (!g) return false;
    let ok = !!g.getExtension('EXT_color_buffer_float');

    /*
     * AND THE SHADERS THEMSELVES, HERE, ON THE THROWAWAY.
     *
     * The extension check alone leaves one hole, and it is the hole the Fluid
     * world fell through for days: if the context comes back but a program
     * fails to LINK, the real canvas has already been handed a GL context — and
     * a canvas gets one context type for its whole life, so the 2D fallback
     * below can never be reached. What a reader sees is nothing at all, and
     * nothing in the code can tell that apart from working correctly.
     *
     * A program that links here will link there: it is the same driver
     * compiling the same GLSL. So the question is asked on a node we are about
     * to throw away, where the answer is still actionable.
     *
     * The cost is three compile-and-links at startup, once, off the critical
     * path. Against a blank hero on hardware nobody tested, that is nothing.
     */
    if (ok) {
      const a = link(g, QUAD_VS, SIM_FS);
      const b = link(g, DEPOSIT_VS, DEPOSIT_FS);
      const c = link(g, QUAD_VS, DISPLAY_FS);
      ok = !!(a && b && c);
      if (a) g.deleteProgram(a);
      if (b) g.deleteProgram(b);
      if (c) g.deleteProgram(c);
    }

    // the probe node is discarded, so losing its context is safe and frees a slot
    g.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

function pickSide(density: InkFieldProps['density']): number {
  if (density === 'high') return 512;
  if (density === 'medium') return 384;
  if (density === 'low') return 256;
  if (typeof navigator === 'undefined') return 384;
  const mem = (navigator as any).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const coarse =
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches;
  if (coarse || mem <= 4 || cores <= 4) return 256;
  if (mem >= 8 && cores >= 8) return 512;
  return 384;
}

/* -------------------------------------------------------------------------- */
/* component                                                                   */
/* -------------------------------------------------------------------------- */

export default function InkField({
  shape,
  shapeKey,
  className,
  density = 'auto',
  vermilion = 0.11,
  cohesion = 0.9,
  breathe = true,
  disturb = 1,
  deposit = 0.115,
  palette,
  dormant = false
}: InkFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* Every live-tunable prop is read through a ref inside the frame loop, so
     changing it never reallocates the pipeline. Assigned in an effect rather
     than the render body, so a discarded concurrent render cannot poison it. */
  const shapeRef = useRef(shape);
  const vermRef = useRef(vermilion);
  const cohesionRef = useRef(cohesion);
  const breatheRef = useRef(breathe);
  const disturbRef = useRef(disturb);
  const depositRef = useRef(deposit);
  const dormantRef = useRef(dormant);
  /** Live `shapeKey`. A ref, not a dependency: putting it in the wake effect's
      deps would re-run the whole wake, and re-snap the field, on every plate. */
  const shapeKeyRef = useRef(shapeKey);
  /**
   * The shapeKey the two RETARGETING EFFECTS last built into the target
   * texture, or undefined.
   *
   * Both of them fire on the one render that matters. Arriving at the closing
   * plate flips `dormant` to false and `shapeKey` in the same commit, and
   * React flushes passive effects in hook order, so the wake seeds every
   * particle onto a freshly sampled target set and the shapeKey effect below
   * then samples a SECOND, independent set from the same silhouette. Every
   * particle is re-aimed at a random other point of it and the settle the wake
   * just did is discarded before a single frame is drawn.
   *
   * Whichever effect actually built the texture records it here and the other
   * then has nothing to do. It does NOT track `resize`, which rebuilds the
   * texture through its own path; this is a handshake between two effects, not
   * a description of the texture.
   */
  const targetKeyRef = useRef<InkFieldProps['shapeKey']>(undefined);

  useEffect(() => {
    shapeRef.current = shape;
    vermRef.current = vermilion;
    cohesionRef.current = cohesion;
    breatheRef.current = breathe;
    disturbRef.current = disturb;
    depositRef.current = deposit;
    dormantRef.current = dormant;
    shapeKeyRef.current = shapeKey;
  });

  /**
   * The colours on screen, and the move they are part way through.
   *
   * A ref rather than state: it changes sixty times a second during a plate
   * change and nothing in the DOM depends on it, so a render per frame would
   * be sixty renders to move a uniform.
   */
  const inkRef = useRef<FieldInk>(newFieldInk());

  /**
   * Set by the GL effect so the shapeKey effect can retarget without a rebuild.
   *
   * `settle` puts the particles ON the new shape rather than letting them fly
   * to it from wherever they were left. See the wake path below.
   */
  const retargetRef = useRef<((settle?: boolean) => void) | null>(null);

  /** Set by the GL effect so `dormant` can park and wake the loop in place. */
  const runRef = useRef<{ start: () => void; stop: () => void } | null>(null);

  /** True while the frame loop is actually running. Nothing animates without it. */
  const liveRef = useRef(false);
  /** Set by the 2D fallback so a palette change can repaint the one flat frame. */
  const repaintRef = useRef<(() => void) | null>(null);

  /*
   * Aim the colours at the new plate.
   *
   * Deliberately NOT in the GL effect's dependency list: a palette change must
   * not rebuild a particle simulation. It writes the target into a ref and the
   * frame loop walks towards it.
   *
   * If nothing is drawing -- the field is parked on seven of the nine plates,
   * and a hidden tab fires no frames at all -- there is no move to make, so it
   * lands immediately. That is also what makes waking correct: the field comes
   * back already in the plate's key rather than fading up in the last one's.
   */
  useEffect(() => {
    const f = inkRef.current;
    rgb01(palette?.paper ?? HERO_PAPER, f.toPaper);
    rgb01(palette?.ink ?? HERO_INK, f.toInk);
    rgb01(palette?.verm ?? HERO_VERM, f.toVerm);

    const same =
      f.paper[0] === f.toPaper[0] &&
      f.paper[1] === f.toPaper[1] &&
      f.paper[2] === f.toPaper[2] &&
      f.ink[0] === f.toInk[0] &&
      f.ink[1] === f.toInk[1] &&
      f.ink[2] === f.toInk[2];
    if (same) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!liveRef.current || reduced || document.hidden) {
      settleInk(f);
    } else {
      for (let i = 0; i < 3; i++) f.fromPaper[i] = f.paper[i];
      f.t0 = performance.now();
    }
    repaintRef.current?.();
  }, [palette?.paper, palette?.ink, palette?.verm]);

  /*
   * Park and wake.
   *
   * Waking is immediate, because the reader is already looking at an empty
   * rectangle that is about to fade up. Parking waits out the fade, because
   * stopping the loop on the same frame the opacity starts falling freezes the
   * last image in place and the reader watches a still photograph dissolve
   * rather than a field disperse.
   *
   * `dormantRef` is written by the sync effect above, but that effect runs on
   * EVERY render and this one only when `dormant` changes, so the ref could
   * still be stale on the frame this runs. It is written here too.
   */
  useEffect(() => {
    dormantRef.current = dormant;
    const run = runRef.current;
    if (!run) return;
    if (!dormant) {
      /*
       * WAKE ONTO THE SHAPE, NOT INTO IT.
       *
       * Jack, 2026-08-26, of the closing plate: "when it first loads in, the
       * screen becomes noise (probably filled with the pixels spawning in)."
       *
       * He read the cause correctly. The field is parked for the whole middle
       * of the page with its particles frozen wherever the hero left them,
       * which is a ridgeline across the bottom of the screen. Waking it
       * retargeted them at a portrait blob in the middle and let them fly: two
       * hundred thousand points crossing the viewport at once, in front of the
       * one plate on the site that is asking the reader for something. The
       * flight IS the noise.
       *
       * So the wake seeds them on their targets with a little scatter and lets
       * the last of it tighten up inside the fade that was already there. The
       * pigment they laid down on the last plate goes with it, or the closing
       * plate opens with a ghost of the hero's hills printed on it.
       *
       * The opening screen still does the full draw-in from a random disc.
       * That entrance is the site introducing itself and nobody complained
       * about it; this is the same field arriving somewhere it has already
       * been.
       */
      /* Recorded only if the call can actually happen. The GL teardown nulls
         retargetRef but not runRef, so a re-run of the [density] effect --
         StrictMode's double mount being the everyday one -- reaches here with
         a live `run` and a dead retarget, and marking the shape built anyway
         would make the effect below skip the rebuild that repairs it. */
      if (retargetRef.current) {
        targetKeyRef.current = shapeKeyRef.current;
        retargetRef.current(true);
      }
      run.start();
      return;
    }
    const t = window.setTimeout(() => {
      if (dormantRef.current) run.stop();
    }, FADE_OUT_MS);
    return () => window.clearTimeout(t);
  }, [dormant]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------------------------------------------------------------- */
    /* fallback: no float render targets, so paint the shape flat in 2D  */
    /* ---------------------------------------------------------------- */
    if (!supportsFloatTargets()) {
      const c2 = canvas.getContext('2d');
      if (!c2) return;
      const paint = () => {
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(r.width * dpr));
        canvas.height = Math.max(1, Math.round(r.height * dpr));
        c2.setTransform(dpr, 0, 0, dpr, 0, 0);
        /* Flat, but in the plate's colours: this path is the whole field on
           a device without float render targets, so getting the ground wrong
           here is getting the page wrong. */
        const pal = inkRef.current;
        c2.fillStyle = hex01(pal.paper);
        c2.fillRect(0, 0, r.width, r.height);
        c2.save();
        c2.globalAlpha = 0.86;
        c2.fillStyle = hex01(pal.ink);
        c2.strokeStyle = hex01(pal.ink);
        shapeRef.current(c2, r.width, r.height);
        c2.restore();
      };
      paint();
      let rafId = 0;
      const onResize = () => {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(paint);
      };
      window.addEventListener('resize', onResize);
      retargetRef.current = paint;
      repaintRef.current = onResize;
      return () => {
        window.removeEventListener('resize', onResize);
        cancelAnimationFrame(rafId);
        retargetRef.current = null;
        repaintRef.current = null;
      };
    }

    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance'
    });
    if (!gl) return;
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');

    const SIDE = pickSide(density);
    const COUNT = SIDE * SIDE;
    /*
     * RESOLUTION.
     *
     * The field is full-viewport and redrawn every frame, so its device-pixel
     * count is the single number that decides what it costs: at 1.75 on a 1.5x
     * display that is 2.6 megapixels of point sprites plus a pigment pass,
     * sixty times a second, and it held both the plates that run it — the
     * opening screen and the closing one — at 30fps.
     *
     * 1, and it was measured rather than chosen. This is the one layer on the
     * page that had a real argument for keeping its resolution — it is not
     * texture behind type, it IS the subject on the two plates that run it —
     * so it was tried at 1.25 first. That still held the closing plate at
     * 30fps: 1770x1008 was over budget and 1416x806 was not. At 1 the closing
     * plate runs at 60 and the opening plate's dropped-frame rate goes from
     * 10% to 1%.
     *
     * The particle COUNT is untouched, which is the half that carries the
     * look: the field is as dense as it ever was, drawn one device pixel per
     * CSS pixel instead of one and a quarter.
     */
    const DPR_CAP = 1;
    const PIGMENT_SCALE = 0.72;

    const maxPoint = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)?.[1] ?? 64;

    /* ---- programs ---- */
    const pSim = link(gl, QUAD_VS, SIM_FS);
    const pDeposit = link(gl, DEPOSIT_VS, DEPOSIT_FS);
    const pDisplay = link(gl, QUAD_VS, DISPLAY_FS);
    if (!pSim || !pDeposit || !pDisplay) {
      /* clean up whatever did link, and still return a teardown */
      if (pSim) gl.deleteProgram(pSim);
      if (pDeposit) gl.deleteProgram(pDeposit);
      if (pDisplay) gl.deleteProgram(pDisplay);
      console.error('[InkField] pipeline unavailable; leaving canvas blank');
      return () => { retargetRef.current = null; };
    }

    /* ---- fullscreen triangle ---- */
    const quadVao = gl.createVertexArray();
    const quadBuf = gl.createBuffer();
    gl.bindVertexArray(quadVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const pointVao = gl.createVertexArray();

    /* ---- particle state textures ---- */
    function dataTex(data: Float32Array | null) {
      const t = gl!.createTexture()!;
      gl!.bindTexture(gl!.TEXTURE_2D, t);
      gl!.texImage2D(
        gl!.TEXTURE_2D, 0, gl!.RGBA32F, SIDE, SIDE, 0, gl!.RGBA, gl!.FLOAT, data
      );
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.NEAREST);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.NEAREST);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      return t;
    }

    /** Sample the shape painter into target positions. */
    function buildTargets(aspectNow: number) {
      const TW = 640;
      const TH = Math.max(64, Math.round(640 / Math.max(aspectNow, 0.2)));
      const c = document.createElement('canvas');
      c.width = TW;
      c.height = TH;
      const x = c.getContext('2d')!;
      x.fillStyle = '#000';
      x.fillRect(0, 0, TW, TH);
      x.fillStyle = '#fff';
      x.strokeStyle = '#fff';
      shapeRef.current(x, TW, TH);

      const img = x.getImageData(0, 0, TW, TH).data;
      const on: number[] = [];
      for (let py = 0; py < TH; py++) {
        for (let px = 0; px < TW; px++) {
          if (img[(py * TW + px) * 4] > 100) on.push(px, py);
        }
      }

      const data = new Float32Array(COUNT * 4);
      const n = on.length / 2;
      for (let i = 0; i < COUNT; i++) {
        let tx = 0;
        let ty = 0;
        if (n > 0) {
          const k = ((Math.random() * n) | 0) * 2;
          // jitter inside the source pixel so edges do not alias
          tx = ((on[k] + Math.random()) / TW) * 2 - 1;
          ty = 1 - ((on[k + 1] + Math.random()) / TH) * 2;
        }
        data[i * 4] = tx;
        data[i * 4 + 1] = ty;
        data[i * 4 + 2] = (Math.random() - 0.5) * 0.5;
        /* The w channel decides pigment. Rather than sprinkling vermilion at
           random, where it just tints everything uniformly, bias it along one
           diagonal band so it reads as a deliberate second stroke through the
           wash. The random term softens the band's edges. */
        const s = tx * 0.55 + ty * 0.83;
        const band = Math.exp(-((s - 0.15) * (s - 0.15)) / 0.08);
        data[i * 4 + 3] = band * (0.55 + Math.random() * 0.62);
      }
      return data;
    }

    const seed = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 1.5;
      seed[i * 4] = Math.cos(a) * r;
      seed[i * 4 + 1] = Math.sin(a) * r * 0.8;
      seed[i * 4 + 2] = (Math.random() - 0.5) * 0.9;
      seed[i * 4 + 3] = Math.random();
    }

    let texA = dataTex(seed);
    let texB = dataTex(seed);
    const texTarget = dataTex(null);
    const simFbo = gl.createFramebuffer();

    /* ---- pigment buffer ---- */
    let pigTex: WebGLTexture | null = null;
    const pigFbo = gl.createFramebuffer();
    let pigW = 1;
    let pigH = 1;

    function allocPigment(w: number, h: number) {
      const g = gl!;
      pigW = Math.max(2, Math.round(w));
      pigH = Math.max(2, Math.round(h));
      const next = g.createTexture();
      g.bindTexture(g.TEXTURE_2D, next);
      g.texImage2D(g.TEXTURE_2D, 0, g.RG16F, pigW, pigH, 0, g.RG, g.HALF_FLOAT, null);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      /* rebind the FBO to the new texture BEFORE dropping the old one */
      g.bindFramebuffer(g.FRAMEBUFFER, pigFbo);
      g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, next, 0);
      g.bindFramebuffer(g.FRAMEBUFFER, null);
      if (pigTex) g.deleteTexture(pigTex);
      pigTex = next;
    }

    /* ---- sizing ---- */
    let aspect = 1;
    let dpr = 1;

    /**
     * When the breath was last reset to its tightest, in ms on performance.now().
     *
     * -1 means "never": the field is on the page's own clock and the reader
     * arrives at whatever phase they arrive at, which is right for the opening
     * screen. A wake sets it, so the closing plate always opens assembled and
     * breathes out from there rather than fading up half dispersed. See the
     * note on the breath in renderOnce.
     */
    let breathAnchorMs = -1;

    /**
     * Re-sample the current shape painter into the target texture.
     *
     * `settle` also moves the PARTICLES onto that shape, with a small scatter
     * so the last of the move is still visible, and wipes the pigment they had
     * already laid down. Two callers want it: reduced motion, where the
     * simulation never advances and the silhouette would otherwise never
     * appear at all, and waking from dormant. See the wake path above.
     */
    function retarget(settle = false) {
      const g = gl!;
      const targets = buildTargets(aspect);
      g.bindTexture(g.TEXTURE_2D, texTarget);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA32F, SIDE, SIDE, 0, g.RGBA, g.FLOAT, targets);
      if (!reduced && !settle) return;

      /* Reduced motion lands exactly on the shape, since nothing is ever going
         to move afterwards. A wake gets SETTLE_SCATTER of NDC either way, which
         is about a fortieth of the screen: enough that the field visibly draws
         itself together inside the fade, nowhere near enough to read as
         scatter. */
      const spread = reduced ? 0 : SETTLE_SCATTER;
      const start = new Float32Array(targets.length);
      start.set(targets);
      if (spread > 0) {
        for (let i = 0; i < COUNT; i++) {
          start[i * 4] += (Math.random() - 0.5) * spread;
          start[i * 4 + 1] += (Math.random() - 0.5) * spread;
        }
      }
      /* Match the seed's pigment distribution rather than the target's. The
         renderer reads pigment off the POSITION texture, which has carried a
         uniform random w since the field was first seeded; writing the
         target's banded w here instead would change the vermilion on this
         plate and on no other. */
      for (let i = 0; i < COUNT; i++) start[i * 4 + 3] = Math.random();

      g.bindTexture(g.TEXTURE_2D, texA);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA32F, SIDE, SIDE, 0, g.RGBA, g.FLOAT, start);
      g.bindTexture(g.TEXTURE_2D, texB);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA32F, SIDE, SIDE, 0, g.RGBA, g.FLOAT, start);

      /* Open at the tight end of the breath. Without this the plate can fade
         up at whatever phase the page's clock happens to be at, which is the
         one thing that can still put a dispersed field in front of the
         reader. See the note on the breath in renderOnce. */
      breathAnchorMs = performance.now();

      /* the last plate's wash, wiped */
      g.bindFramebuffer(g.FRAMEBUFFER, pigFbo);
      g.clearColor(0, 0, 0, 0);
      g.clear(g.COLOR_BUFFER_BIT);
      g.bindFramebuffer(g.FRAMEBUFFER, null);

      if (reduced) requestFrame();
    }
    retargetRef.current = retarget;

    function resize() {
      const r = canvas!.getBoundingClientRect();
      if (!r.width || !r.height) return;
      dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      canvas!.width = Math.max(1, Math.round(r.width * dpr));
      canvas!.height = Math.max(1, Math.round(r.height * dpr));
      aspect = r.width / r.height;
      allocPigment(canvas!.width * PIGMENT_SCALE, canvas!.height * PIGMENT_SCALE);
      retarget();
      if (reduced) requestFrame();
    }

    /* ---- pointer ---- */
    const ptr = { x: 0, y: 0, strength: 0, target: 0 };
    function onMove(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect();
      ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ptr.y = 1 - ((e.clientY - r.top) / r.height) * 2;
      ptr.target = disturbRef.current;
    }
    function onLeave() { ptr.target = 0; }
    window.addEventListener('pointermove', onMove, { passive: true });
    canvas.addEventListener('pointerleave', onLeave);

    /* ---- uniform lookups ---- */
    const uSim = {
      pos: gl.getUniformLocation(pSim, 'uPos'),
      tgt: gl.getUniformLocation(pSim, 'uTarget'),
      time: gl.getUniformLocation(pSim, 'uTime'),
      dt: gl.getUniformLocation(pSim, 'uDt'),
      gather: gl.getUniformLocation(pSim, 'uGather'),
      aspect: gl.getUniformLocation(pSim, 'uAspect'),
      drift: gl.getUniformLocation(pSim, 'uDrift'),
      mouse: gl.getUniformLocation(pSim, 'uMouse')
    };
    const uDep = {
      pos: gl.getUniformLocation(pDeposit, 'uPos'),
      tgt: gl.getUniformLocation(pDeposit, 'uTarget'),
      side: gl.getUniformLocation(pDeposit, 'uSide'),
      size: gl.getUniformLocation(pDeposit, 'uPointSize'),
      vermCut: gl.getUniformLocation(pDeposit, 'uVermCut'),
      deposit: gl.getUniformLocation(pDeposit, 'uDeposit')
    };
    const uDis = {
      pig: gl.getUniformLocation(pDisplay, 'uPigment'),
      texel: gl.getUniformLocation(pDisplay, 'uTexel'),
      res: gl.getUniformLocation(pDisplay, 'uRes'),
      paper: gl.getUniformLocation(pDisplay, 'uPaper'),
      ink: gl.getUniformLocation(pDisplay, 'uInk'),
      verm: gl.getUniformLocation(pDisplay, 'uVerm'),
      grain: gl.getUniformLocation(pDisplay, 'uGrain')
    };

    /* ---- loop ---- */
    let raf = 0;
    let running = false;
    let visible = true;
    let lost = false;
    const t0 = performance.now();
    let last = t0;

    function renderOnce(t: number, dt: number) {
      const g = gl!;

      /* simulate */
      g.bindFramebuffer(g.FRAMEBUFFER, simFbo);
      g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, texB, 0);
      g.viewport(0, 0, SIDE, SIDE);
      g.disable(g.BLEND);
      g.useProgram(pSim!);
      g.bindVertexArray(quadVao);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, texA);
      g.uniform1i(uSim.pos, 0);
      g.activeTexture(g.TEXTURE1);
      g.bindTexture(g.TEXTURE_2D, texTarget);
      g.uniform1i(uSim.tgt, 1);
      g.uniform1f(uSim.time, t);
      g.uniform1f(uSim.dt, dt);
      g.uniform1f(uSim.aspect, aspect);
      g.uniform1f(uSim.drift, 0.2);
      /*
       * THE BREATH, AND WHY ITS LOOSE END MOVED.
       *
       * The field is a spring against a curl-noise drift, so what the reader
       * sees is an equilibrium: the particles sit about drift/k away from the
       * shape they are holding. Breathing modulates k on a 39 second cycle,
       * and it used to swing between 0.24 and 1.00 of the base stiffness.
       *
       * Measured, by reading the simulation back and averaging the distance
       * from each particle to its target: that swing takes the field from
       * about 0.10 of NDC away from the shape to about 0.42. At 0.10 you are
       * looking at a silhouette. At 0.42 there is no silhouette at all — a
       * quarter of a million opaque points spread evenly over the viewport,
       * which on a dark plate is television static.
       *
       * Jack, 2026-08-26, of the closing plate: "when it first loads in, the
       * screen becomes noise (probably filled with the pixels spawning in)."
       * It was not the spawn. It was the field arriving at the wrong end of
       * its own breath and staying there for the best part of twenty seconds.
       *
       * 0.78 to 1.00 keeps the swing visible — the field still loosens and
       * gathers — while holding the spread between about 0.10 and 0.18, which
       * is the difference between a crisp shape and a soft one rather than the
       * difference between a shape and nothing.
       *
       * cos rather than sin so that phase zero is the TIGHT end, which is what
       * lets a wake anchor the cycle and open assembled.
       */
      const bt = breathAnchorMs >= 0 ? t - (breathAnchorMs - t0) / 1000 : t;
      const breath = breatheRef.current ? 0.78 + 0.22 * Math.cos(bt * 0.16) : 1;
      /* Gather is an explicit-Euler spring. Keep k*dt below ~1 or it overshoots
         and rings; dt is already clamped to 1/30, so cap the stiffness here. */
      const k = Math.min(Math.max(0.08, cohesionRef.current * breath) * 2.2, 24);
      g.uniform1f(uSim.gather, k);
      g.uniform3f(uSim.mouse, ptr.x, ptr.y, ptr.strength);
      g.drawArrays(g.TRIANGLES, 0, 3);

      const swap = texA;
      texA = texB;
      texB = swap;

      /* deposit pigment */
      g.bindFramebuffer(g.FRAMEBUFFER, pigFbo);
      g.viewport(0, 0, pigW, pigH);
      g.clearColor(0, 0, 0, 1);
      g.clear(g.COLOR_BUFFER_BIT);
      g.enable(g.BLEND);
      g.blendFunc(g.ONE, g.ONE);
      g.useProgram(pDeposit!);
      g.bindVertexArray(pointVao);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, texA);
      g.uniform1i(uDep.pos, 0);
      g.activeTexture(g.TEXTURE1);
      g.bindTexture(g.TEXTURE_2D, texTarget);
      g.uniform1i(uDep.tgt, 1);
      g.uniform1f(uDep.side, SIDE);
      g.uniform1f(
        uDep.size,
        Math.min(maxPoint, Math.max(1.4, 2.1 * dpr * PIGMENT_SCALE))
      );
      g.uniform1f(uDep.vermCut, 1 - vermRef.current);
      g.uniform1f(uDep.deposit, depositRef.current * (384 / SIDE));
      g.drawArrays(g.POINTS, 0, COUNT);

      /* shade as watercolour */
      g.bindFramebuffer(g.FRAMEBUFFER, null);
      g.viewport(0, 0, canvas!.width, canvas!.height);
      g.disable(g.BLEND);
      g.useProgram(pDisplay!);
      g.bindVertexArray(quadVao);
      g.activeTexture(g.TEXTURE0);
      g.bindTexture(g.TEXTURE_2D, pigTex);
      g.uniform1i(uDis.pig, 0);
      g.uniform2f(uDis.texel, 1 / pigW, 1 / pigH);
      g.uniform2f(uDis.res, canvas!.width, canvas!.height);
      /* The plate's colours, not the hero's. `advanceInk` has already run
         for this frame, at the top of `frame`. */
      const pal = inkRef.current;
      g.uniform3f(uDis.paper, pal.paper[0], pal.paper[1], pal.paper[2]);
      g.uniform3f(uDis.ink, pal.ink[0], pal.ink[1], pal.ink[2]);
      g.uniform3f(uDis.verm, pal.verm[0], pal.verm[1], pal.verm[2]);
      g.uniform1f(uDis.grain, luma(pal.paper) > 0.5 ? 1 : -1);
      g.drawArrays(g.TRIANGLES, 0, 3);
    }

    /** Draw exactly one frame, outside the loop. Used by the reduced path. */
    function requestFrame() {
      if (lost) return;
      renderOnce((performance.now() - t0) / 1000, 0);
    }

    /*
     * THE FIELD SIMULATES AT 30Hz, AND THE PAGE STILL RUNS AT 60.
     *
     * This is not a compromise on smoothness, because there is nothing here
     * whose motion the eye can track. The field is a diffuse cloud of a
     * quarter of a million particles under a spring; what it does between one
     * frame and the next is below the threshold of being seen, which is
     * exactly why it can be sampled at half rate when a moving edge could not.
     *
     * On a frame that is skipped, NOTHING is drawn — the canvas simply keeps
     * the pigment it already has, and the compositor keeps showing it for
     * free. So this halves the field's GPU work outright rather than spreading
     * it, and it does that without giving up a single particle or a single
     * device pixel of resolution.
     *
     * It is here because of the closing plate. That is the one place on the
     * site where two full-viewport animated layers run at once — the field and
     * the celestial world — and the pair came to about 20ms a frame when the
     * budget is 16.7, so the plate sat at exactly half rate. Either one alone
     * fitted. Rather than take a world off a plate or the particles off the
     * closing screen, both of which Jack asked for by name, the field now asks
     * for half as much and they both fit.
     *
     * `dt` is accumulated rather than dropped, so the simulation advances by
     * real elapsed time and looks identical; the existing 1/30 clamp on dt is
     * exactly this interval, so the integrator is still inside its designed
     * range.
     */
    const FIELD_STEP = 1 / 30;
    let acc = 0;

    function frame(now: number) {
      if (!running || lost) return;
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      raf = requestAnimationFrame(frame);
      acc += dt;
      if (acc < FIELD_STEP) return;
      ptr.strength += (ptr.target - ptr.strength) * Math.min(1, acc * 6);
      /* The plate's colours move here rather than in their own loop. It is
         absolute-time, so sampling it at the field's 30Hz rather than the
         page's 60 does not make the move slower or shorter -- and a paper
         colour crossing over most of a second is not something 30Hz shows. */
      advanceInk(inkRef.current, now);
      renderOnce((now - t0) / 1000, acc);
      acc = 0;
    }

    function start() {
      if (running || !visible || lost || dormantRef.current) return;
      /* Motion reduced: paint one static frame and stay off the rAF treadmill
         entirely, rather than re-rendering an identical image forever. */
      if (reduced) { requestFrame(); return; }
      running = true;
      /* Nothing walks the palette towards a new plate unless this loop is
         turning. Anything else -- parked, reduced, hidden -- lands the change
         on the spot instead, which is what makes waking up correct. */
      liveRef.current = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      liveRef.current = false;
      cancelAnimationFrame(raf);
    }

    /* A palette change under reduced motion has settled instantly and there is
       no loop to show it, so the one static frame is redrawn by hand. */
    repaintRef.current = requestFrame;

    /* ---- context loss ---- */
    function onLost(e: Event) {
      e.preventDefault();          // without this the context can never restore
      lost = true;
      stop();
    }
    function onRestored() {
      lost = false;
      /* Programs and textures are gone. Signal rather than limp along with a
         half-dead pipeline; the parent can remount by changing `density`. */
      console.warn('[InkField] context restored; remount required to rebuild');
    }
    canvas.addEventListener('webglcontextlost', onLost as EventListener);
    canvas.addEventListener('webglcontextrestored', onRestored);

    /* Dev-only handle. Headless and offscreen environments never fire rAF and
       report the canvas as non-intersecting, so there is otherwise no way to
       drive a frame and check what the pipeline actually produces. */
    if (process.env.NODE_ENV !== 'production') {
      (canvas as any).__inkfield = {
        renderOnce: (dt = 1 / 60) => renderOnce((performance.now() - t0) / 1000, dt),
        readPigment: () => {
          const g = gl!;
          const buf = new Float32Array(pigW * pigH * 4);
          g.bindFramebuffer(g.FRAMEBUFFER, pigFbo);
          /* RG16F reads back as RGBA float on most implementations */
          g.readPixels(0, 0, pigW, pigH, g.RGBA, g.FLOAT, buf);
          g.bindFramebuffer(g.FRAMEBUFFER, null);
          return { buf, w: pigW, h: pigH };
        },
        info: () => ({ SIDE, COUNT, pigW, pigH, aspect, dpr, reduced }),
        /** Coverage of the current painter's mask, as the sampler sees it. */
        maskCoverage: () => {
          const TW = 640;
          const TH = Math.max(64, Math.round(640 / Math.max(aspect, 0.2)));
          const cc = document.createElement('canvas');
          cc.width = TW;
          cc.height = TH;
          const x = cc.getContext('2d')!;
          x.fillStyle = '#000';
          x.fillRect(0, 0, TW, TH);
          x.fillStyle = '#fff';
          x.strokeStyle = '#fff';
          shapeRef.current(x, TW, TH);
          const img = x.getImageData(0, 0, TW, TH).data;
          let lit = 0;
          for (let i = 0; i < TW * TH; i++) if (img[i * 4] > 100) lit++;
          return { w: TW, h: TH, litPct: +((100 * lit) / (TW * TH)).toFixed(2) };
        }
      };
    }

    resize();

    runRef.current = { start, stop };

    /* only run while actually on screen */
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
        if (visible) start();
        else stop();
      },
      { threshold: 0.01 }
    );
    io.observe(canvas);

    function onVis() {
      if (document.hidden) stop();
      else if (visible) start();
    }
    document.addEventListener('visibilitychange', onVis);

    let resizeRaf = 0;
    function onResize() {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(resize);
    }
    window.addEventListener('resize', onResize);

    start();

    /* ---- teardown ----
       Deliberately NO loseContext() here: React reuses this same canvas node on
       remount, and a lost context never comes back, which would leave the
       canvas permanently blank under StrictMode. Deleting the resources below
       already releases the GPU memory. */
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('webglcontextlost', onLost as EventListener);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      cancelAnimationFrame(resizeRaf);

      gl.deleteProgram(pSim);
      gl.deleteProgram(pDeposit);
      gl.deleteProgram(pDisplay);
      gl.deleteTexture(texA);
      gl.deleteTexture(texB);
      gl.deleteTexture(texTarget);
      if (pigTex) gl.deleteTexture(pigTex);
      gl.deleteFramebuffer(simFbo);
      gl.deleteFramebuffer(pigFbo);
      gl.deleteBuffer(quadBuf);
      gl.deleteVertexArray(quadVao);
      gl.deleteVertexArray(pointVao);
      retargetRef.current = null;
      repaintRef.current = null;
      liveRef.current = false;
    };
  }, [density]);

  /*
   * Morph to a new silhouette without rebuilding the GL context.
   *
   * NOT WHILE DORMANT. Retargeting rasterises the painter's mask and then
   * fills a 512x512 RGBA32F buffer — a quarter of a million particle
   * destinations, about 50ms of main thread. `shapeKey` changes on every one
   * of the nine plates and the field is only VISIBLE on two of them, so seven
   * of those rebuilds were paid for a canvas nobody could see.
   *
   * Worse than wasted: each one landed at the exact moment the reader crossed
   * into a new plate, which is the one moment on this page when the main
   * thread is already busy and the one moment a dropped frame is most
   * obvious. Deferred, and settled on the way back up — the field is behind a
   * fade when it wakes, so the work is hidden by the same transition that was
   * always there.
   */
  useEffect(() => {
    if (dormantRef.current) return;
    /* The wake has already built this shape and put the particles on it.
       Sampling a second, independent set here re-aims every one of them at a
       random other point of the same silhouette, which is the whole gather
       again, in front of the reader, at about five per cent of the settled
       ink. See targetKeyRef. */
    if (targetKeyRef.current === shapeKey) return;
    targetKeyRef.current = shapeKey;
    retargetRef.current?.();
  }, [shapeKey]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  );
}
