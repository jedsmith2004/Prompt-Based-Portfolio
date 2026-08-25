'use client';

/* ============================================================================
   RouteMap — the hitchhike, drawn as a navigator's plate.

   The old component (components/HitchhikeMap.tsx) drew a real web map: d3-geo,
   topojson, world-atlas land and borders, a glowing polyline on near-black.
   What was worth keeping is the honesty of it — real coordinates, real
   geography, and one tap to the reel that stop produced. What had to go is the
   map itself. A tile-map silhouette belongs to a different material world than
   a printed sheet.

   So: no country polygons, no atlas, no d3. The geography is carried entirely
   by the ROUTE. A single travelled line, projected from the real latitudes and
   longitudes with a Mercator of our own, laid down as a loaded brushstroke
   whose pressure varies along its length, and drawn progressively as the
   section is scrolled — the way the road was actually covered.

   Everything on the plate is measured, not decorated:
     · the mark at each stop is an ink pool whose AREA is proportional to the
       number of days he stayed there, inferred from the reels that stop
       produced. Tagounite has five, the week in the village near the desert,
       and it is visibly the biggest pause on the route.
     · the stroke swells where he stopped and thins where he was moving.
     · a graticule of whole 5° ticks, a scale bar in kilometres computed at the
       route's mean latitude, and a running total that accrues as the line is
       laid down. Every one of those numbers comes out of the coordinates.
     · country transitions get a hairline across the road and a mono label.

   Canvas draws the plate. DOM carries everything a person has to be able to
   reach: one real <button> per stop with a full accessible name, roving
   tabindex with arrow-key travel along the route, a country strip, and an
   aria-live detail panel with the reels.

   DATA. public/context.json → hitchhikeRoute, imported directly (there is one
   source of truth and it is that file; resolveJsonModule is on). Twenty stops,
   Split to Tagounite, six countries. Reel titles are "Day 1" … "Day 27", so
   the day numbers on the plate are read out of the data rather than invented.

   THUMBNAILS. Every path referenced by the route was checked against
   public/thumbnails at build time; all twenty-eight files are present. (There
   is one orphan on disk, geneva-day12.jpg, that the data does not reference —
   left alone.) The panel still degrades to a typographic tile if a file ever
   goes missing, rather than showing a broken image.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import context from '@/public/context.json';
import { withAlpha } from '@/lib/v2/colour';
import COUNTRIES from '@/lib/v2/route-countries.json';

/* -------------------------------------------------------------------- types */

export interface RouteReel {
  /** Instagram permalink. Opened in a new tab. */
  url: string;
  /** Path under /public. Verified to exist; falls back to a text tile if not. */
  thumbnail: string;
  /** "Day 12". The number is parsed out and used on the plate. */
  title?: string;
}

export interface RouteStop {
  name: string;
  country: string;
  lat: number;
  lon: number;
  reels?: RouteReel[];
}

export interface RouteMapProps {
  /** Defaults to hitchhikeRoute.stops from public/context.json. */
  stops?: RouteStop[];
  /** Small mono line above the plate. */
  eyebrow?: string;
  /** Display heading. */
  title?: string;
  /** Where the films live. Set to null to drop the credit line. */
  handle?: { label: string; url: string } | null;
  className?: string;
}

/* --------------------------------------------------------------------- data */

const ROUTE: RouteStop[] = context.hitchhikeRoute.stops;

const DEFAULT_HANDLE = {
  label: '@5001km.sidequest',
  url: 'https://www.instagram.com/5001km.sidequest'
};

/* ------------------------------------------------------------------- maths */

const EARTH_R_KM = 6371.0088;
const DEG = Math.PI / 180;

/** Great-circle distance in kilometres. */
function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const p1 = aLat * DEG;
  const p2 = bLat * DEG;
  const dp = p2 - p1;
  const dl = (bLon - aLon) * DEG;
  const s1 = Math.sin(dp / 2);
  const s2 = Math.sin(dl / 2);
  const h = s1 * s1 + Math.cos(p1) * Math.cos(p2) * s2 * s2;
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Mercator northing, in radians of a unit sphere. Latitude is clamped. */
function mercY(latDeg: number): number {
  const lat = Math.max(-85, Math.min(85, latDeg)) * DEG;
  return Math.log(Math.tan(Math.PI / 4 + lat / 2));
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-9));
  return t * t * (3 - 2 * t);
}

/** Deterministic value noise in 1D. Seeded, so the brush is the same on every
 *  render and on the server-free first paint. */
function hash1(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return s - Math.floor(s);
}
function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash1(i) * (1 - u) + hash1(i + 1) * u;
}

/*
 * Delegates. It used to parse `#RRGGBB` by hand and fall back to near-black,
 * which is how this plate lost its accent: the palette tokens are registered
 * with `@property`, so getComputedStyle hands back `rgb(181, 64, 47)` and the
 * hex path silently produced ink. See lib/v2/colour.ts.
 */
function rgba(css: string, alpha: number): string {
  return withAlpha(css, alpha);
}

function token(style: CSSStyleDeclaration, name: string, fallback: string) {
  const v = style.getPropertyValue(name);
  return v && v.trim() ? v.trim() : fallback;
}

/* ------------------------------------------------------------- projection */

interface Fit {
  /** Container x, in CSS pixels, for a longitude. */
  x(lon: number): number;
  /** Container y, in CSS pixels, for a latitude. */
  y(lat: number): number;
  /** Pixels per radian of the unit sphere. */
  scale: number;
}

interface Pad {
  l: number;
  t: number;
  r: number;
  b: number;
}

/**
 * A Mercator fitted to the box, aspect preserved so the shape of the journey
 * is not stretched to fill whatever the layout happens to give us. Written out
 * rather than pulled from d3 — it is nine lines and it removes three
 * dependencies from the page.
 */
function makeFit(stops: RouteStop[], w: number, h: number, pad: Pad): Fit {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minMY = Infinity;
  let maxMY = -Infinity;
  for (let i = 0; i < stops.length; i++) {
    const lon = stops[i].lon * DEG;
    const my = mercY(stops[i].lat);
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (my < minMY) minMY = my;
    if (my > maxMY) maxMY = my;
  }
  const spanX = Math.max(maxLon - minLon, 1e-6);
  const spanY = Math.max(maxMY - minMY, 1e-6);
  const availW = Math.max(w - pad.l - pad.r, 1);
  const availH = Math.max(h - pad.t - pad.b, 1);
  const scale = Math.min(availW / spanX, availH / spanY);
  /* centre what is left over inside the padded box */
  const ox = pad.l + (availW - spanX * scale) / 2 - minLon * scale;
  const oy = pad.t + (availH - spanY * scale) / 2 + maxMY * scale;
  return {
    x: (lon: number) => ox + lon * DEG * scale,
    y: (lat: number) => oy - mercY(lat) * scale,
    scale
  };
}

/** Padding shrinks on small plates so the route does not become a postage stamp. */
function padFor(w: number): Pad {
  const k = clamp01((w - 300) / 420);
  const side = 26 + 26 * k;
  return { l: side + 16, t: 22 + 12 * k, r: side, b: 34 + 12 * k };
}

/* ---------------------------------------------------- derived route facts */

interface StopFacts {
  /** Day numbers parsed from the reel titles, ascending. */
  days: number[];
  /** How long the pause reads as. One reel is one day. */
  weight: number;
  /** Kilometres from Split, great-circle, stop to stop. */
  cumKm: number;
  /** Kilometres on the leg that arrives here. Zero at Split. */
  legKm: number;
  /** True where the country changes, and at Split. */
  entersCountry: boolean;
}

function dayNumbers(stop: RouteStop): number[] {
  const out: number[] = [];
  const reels = stop.reels ?? [];
  for (let i = 0; i < reels.length; i++) {
    const m = /(\d+)/.exec(reels[i].title ?? '');
    if (m) out.push(parseInt(m[1], 10));
  }
  out.sort((a, b) => a - b);
  return out;
}

function deriveFacts(stops: RouteStop[]): StopFacts[] {
  const facts: StopFacts[] = [];
  let cum = 0;
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const legKm =
      i === 0
        ? 0
        : haversineKm(stops[i - 1].lat, stops[i - 1].lon, s.lat, s.lon);
    cum += legKm;
    facts.push({
      days: dayNumbers(s),
      weight: Math.max(1, s.reels?.length ?? 1),
      cumKm: cum,
      legKm,
      entersCountry: i === 0 || stops[i - 1].country !== s.country
    });
  }
  return facts;
}

function formatKm(km: number): string {
  const n = Math.round(km);
  return n >= 1000
    ? `${Math.floor(n / 1000)},${String(n % 1000).padStart(3, '0')}`
    : String(n);
}

function formatDays(days: number[]): string {
  if (days.length === 0) return '';
  if (days.length === 1) return `Day ${days[0]}`;
  const contiguous = days[days.length - 1] - days[0] === days.length - 1;
  return contiguous
    ? `Days ${days[0]}–${days[days.length - 1]}`
    : `Days ${days.join(', ')}`;
}

/* ------------------------------------------------------ centreline geometry */

/**
 * Centripetal Catmull-Rom through the projected stops.
 *
 * Uniform Catmull-Rom loops on unevenly spaced control points, and these are
 * violently uneven: Lausanne to Geneva is 35 km and Tangier to Marrakesh is
 * 501. Centripetal (alpha = 0.5) is the parameterisation that provably does
 * not self-intersect, which matters when the line is a road someone drove.
 */
function catmullRom(
  p0x: number, p0y: number,
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  p3x: number, p3y: number,
  t: number,
  out: { x: number; y: number }
): void {
  const d = (ax: number, ay: number, bx: number, by: number) =>
    Math.pow(Math.hypot(bx - ax, by - ay), 0.5) || 1e-4;
  const t0 = 0;
  const t1 = t0 + d(p0x, p0y, p1x, p1y);
  const t2 = t1 + d(p1x, p1y, p2x, p2y);
  const t3 = t2 + d(p2x, p2y, p3x, p3y);
  const tt = t1 + (t2 - t1) * t;

  const a1 = (t1 - tt) / (t1 - t0);
  const a1x = a1 * p0x + (1 - a1) * p1x;
  const a1y = a1 * p0y + (1 - a1) * p1y;
  const a2 = (t2 - tt) / (t2 - t1);
  const a2x = a2 * p1x + (1 - a2) * p2x;
  const a2y = a2 * p1y + (1 - a2) * p2y;
  const a3 = (t3 - tt) / (t3 - t2);
  const a3x = a3 * p2x + (1 - a3) * p3x;
  const a3y = a3 * p2y + (1 - a3) * p3y;

  const b1 = (t2 - tt) / (t2 - t0);
  const b1x = b1 * a1x + (1 - b1) * a2x;
  const b1y = b1 * a1y + (1 - b1) * a2y;
  const b2 = (t3 - tt) / (t3 - t1);
  const b2x = b2 * a2x + (1 - b2) * a3x;
  const b2y = b2 * a2y + (1 - b2) * a3y;

  const c = (t2 - tt) / (t2 - t1);
  out.x = c * b1x + (1 - c) * b2x;
  out.y = c * b1y + (1 - c) * b2y;
}

const SAMPLES_PER_LEG = 34;

interface Geometry {
  n: number;
  /** centreline */
  sx: Float64Array;
  sy: Float64Array;
  /** unit normals */
  nx: Float64Array;
  ny: Float64Array;
  /** half-width of the loaded stroke, and of its darker core */
  hw: Float64Array;
  hwCore: Float64Array;
  /** cumulative pixel arc length */
  arc: Float64Array;
  totalArc: number;
  /** first and last sample index of each leg */
  legStart: Int32Array;
  legEnd: Int32Array;
  /** sample index nearest each stop */
  stopIndex: Int32Array;
}

/**
 * Everything about the stroke that does not change between frames. Called on
 * layout only — never from the frame loop, which allocates nothing.
 */
function buildGeometry(
  px: Float64Array,
  py: Float64Array,
  count: number,
  facts: StopFacts[],
  baseW: number
): Geometry {
  const legs = count - 1;
  const n = legs * SAMPLES_PER_LEG + 1;

  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  const nx = new Float64Array(n);
  const ny = new Float64Array(n);
  const hw = new Float64Array(n);
  const hwCore = new Float64Array(n);
  const arc = new Float64Array(n);
  const legStart = new Int32Array(legs);
  const legEnd = new Int32Array(legs);
  const stopIndex = new Int32Array(count);

  const scratch = { x: 0, y: 0 };
  let k = 0;
  for (let i = 0; i < legs; i++) {
    /* end control points are extrapolated so the stroke leaves and enters the
       first and last stop along the road, not along a doubled point */
    const i0 = i - 1;
    const i3 = i + 2;
    const p0x = i0 < 0 ? 2 * px[0] - px[1] : px[i0];
    const p0y = i0 < 0 ? 2 * py[0] - py[1] : py[i0];
    const p3x = i3 > count - 1 ? 2 * px[count - 1] - px[count - 2] : px[i3];
    const p3y = i3 > count - 1 ? 2 * py[count - 1] - py[count - 2] : py[i3];

    legStart[i] = k;
    const last = i === legs - 1 ? SAMPLES_PER_LEG : SAMPLES_PER_LEG - 1;
    for (let j = 0; j <= last; j++) {
      const t = j / SAMPLES_PER_LEG;
      catmullRom(p0x, p0y, px[i], py[i], px[i + 1], py[i + 1], p3x, p3y, t, scratch);
      sx[k] = scratch.x;
      sy[k] = scratch.y;
      k++;
    }
    legEnd[i] = k - 1;
    stopIndex[i] = legStart[i];
  }
  stopIndex[count - 1] = n - 1;

  /* arc length */
  arc[0] = 0;
  for (let i = 1; i < n; i++) {
    arc[i] = arc[i - 1] + Math.hypot(sx[i] - sx[i - 1], sy[i] - sy[i - 1]);
  }
  const totalArc = Math.max(arc[n - 1], 1);

  /* normals from central differences */
  for (let i = 0; i < n; i++) {
    const a = i === 0 ? 0 : i - 1;
    const b = i === n - 1 ? n - 1 : i + 1;
    const dx = sx[b] - sx[a];
    const dy = sy[b] - sy[a];
    const len = Math.hypot(dx, dy) || 1e-6;
    nx[i] = -dy / len;
    ny[i] = dx / len;
  }

  /* ---- pressure ---------------------------------------------------------
     A loaded brush is not a constant-width line. It bites at the start, runs
     dry and reloads, swells where the hand rests, and lifts through a fast
     turn. Four terms, all deterministic:
       edge   the taper into and out of the sheet
       swell  a gaussian at every stop, wider and heavier the longer he stayed
       wob    the bristle wander, three incommensurate sines plus value noise
       turn   curvature thins the stroke, the way speed does
     ------------------------------------------------------------------------ */
  const stopArc = new Float64Array(count);
  for (let i = 0; i < count; i++) stopArc[i] = arc[stopIndex[i]];

  for (let i = 0; i < n; i++) {
    const u = arc[i] / totalArc;

    const edge = 0.30 + 0.70 * smoothstep(0, 0.016, u) * smoothstep(0, 0.02, 1 - u);

    let swell = 0;
    for (let j = 0; j < count; j++) {
      const w = facts[j].weight;
      const sigma = (10 + 13 * Math.sqrt(w)) ; /* px, wider for a longer stay */
      const d = (arc[i] - stopArc[j]) / sigma;
      swell += (0.20 + 0.34 * (w - 1)) * Math.exp(-d * d);
    }

    const wob =
      1 +
      0.20 * Math.sin(u * 41.3 + 0.7) +
      0.13 * Math.sin(u * 97.1 + 2.1) +
      0.20 * (noise1(u * 23.7 + 5.5) - 0.5);

    const a = i === 0 ? 0 : i - 1;
    const b = i === n - 1 ? n - 1 : i + 1;
    const cx = 2 * sx[i] - sx[a] - sx[b];
    const cy = 2 * sy[i] - sy[a] - sy[b];
    const turn = 1 - 0.34 * clamp01(Math.hypot(cx, cy) * 0.7);

    const w = baseW * edge * wob * turn * (1 + swell);
    hw[i] = Math.max(baseW * 0.26, Math.min(baseW * 4.2, w));

    /* the darker core wanders inside the band and sometimes runs almost out,
       which is what reads as dry brush without erasing anything underneath */
    const core = 0.24 + 0.46 * noise1(u * 17.3 + 41.9) + 0.12 * Math.sin(u * 63.7);
    hwCore[i] = hw[i] * clamp01(core);
  }

  return { n, sx, sy, nx, ny, hw, hwCore, arc, totalArc, legStart, legEnd, stopIndex };
}

/* ------------------------------------------------------------ canvas labels */

interface PlateLabel {
  text: string;
  chars: string[];
  offs: Float64Array;
  width: number;
  /** anchor on the plate */
  x: number;
  y: number;
  /** where the leader line starts */
  ax: number;
  ay: number;
  size: number;
  priority: number;
  stop: number;
  drawn: boolean;
}

/** Character advances for a tracked mono run, measured once at layout. */
function measureTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  tracking: number
): { chars: string[]; offs: Float64Array; width: number } {
  const chars = Array.from(text);
  const offs = new Float64Array(chars.length);
  let x = 0;
  for (let i = 0; i < chars.length; i++) {
    offs[i] = x;
    x += ctx.measureText(chars[i]).width + tracking;
  }
  return { chars, offs, width: Math.max(0, x - tracking) };
}

function drawTracked(
  ctx: CanvasRenderingContext2D,
  label: { chars: string[]; offs: Float64Array },
  x: number,
  y: number
): void {
  for (let i = 0; i < label.chars.length; i++) {
    ctx.fillText(label.chars[i], x + label.offs[i], y);
  }
}

function overlaps(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number
): boolean {
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}

/* -------------------------------------------------------------- theme watch */

/** Re-renders when the palette flips, so the plate is repainted in the new ink. */
function useThemeTick(): string {
  const [mode, setMode] = useState('light');
  useEffect(() => {
    const root = document.documentElement;
    const read = () =>
      setMode((prev) => {
        const next = root.getAttribute('data-v2-theme') === 'dark' ? 'dark' : 'light';
        return prev === next ? prev : next;
      });
    read();
    const mo = new MutationObserver(read);
    mo.observe(root, { attributes: true, attributeFilter: ['data-v2-theme'] });
    return () => mo.disconnect();
  }, []);
  return mode;
}

/* ---------------------------------------------------------------- component */

export default function RouteMap({
  stops = ROUTE,
  eyebrow = 'THE ROAD SOUTH · SUMMER 2025',
  title = 'Split to Tagounite',
  handle = DEFAULT_HANDLE,
  className
}: RouteMapProps) {
  const plateRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const markRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [box, setBox] = useState({ w: 0, h: 0 });
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const theme = useThemeTick();

  const count = stops.length;
  const facts = useMemo(() => deriveFacts(stops), [stops]);
  const totalKm = count > 0 ? facts[count - 1].cumKm : 0;

  /* Countries in order of arrival, with the kilometre they begin at. */
  const countries = useMemo(() => {
    const out: Array<{ name: string; km: number; stop: number; days: number }> = [];
    for (let i = 0; i < count; i++) {
      if (facts[i].entersCountry) {
        out.push({
          name: stops[i].country,
          km: facts[i].cumKm,
          stop: i,
          days: 0
        });
      }
      if (out.length) out[out.length - 1].days += facts[i].weight;
    }
    return out;
  }, [stops, facts, count]);

  /* Where each mark sits, in CSS pixels of the plate. One projection, shared
     with the canvas so the buttons cannot drift off the ink. */
  const points = useMemo(() => {
    if (box.w < 2 || box.h < 2) return [] as Array<{ x: number; y: number; r: number }>;
    const fit = makeFit(stops, box.w, box.h, padFor(box.w));
    const base = 3.1 + 1.5 * clamp01((box.w - 300) / 460);
    return stops.map((s, i) => ({
      x: fit.x(s.lon),
      y: fit.y(s.lat),
      /* AREA proportional to days stayed, so radius goes as the square root */
      r: base * Math.sqrt(facts[i].weight)
    }));
  }, [stops, facts, box]);

  /* Interaction state the frame loop reads, without re-running layout. */

  /* Pointer target sizes, clamped so no two marks overlap.
     The marks are absolutely positioned circles, so two whose radii sum to more
     than the gap between them share pixels, and the one later in DOM order wins
     the hit test. On the desktop plate that made Lausanne unclickable: its ink
     pool is 11.5px from Geneva's centre, inside Geneva's 12.6px target. The
     projection fit means no amount of resizing separates them, so the target has
     to yield instead. Two circles clear each other when r1 + r2 <= d, so an equal
     rule caps DIAMETER at the nearest-neighbour distance. Where that would leave
     a target too small to hit, the floor wins and the smaller mark is raised
     above its neighbour so it still takes the click. */
  const markSizes = useMemo(() => {
    const n = points.length;
    return points.map((p, i) => {
      let nearest = Infinity;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const d = Math.hypot(points[j].x - p.x, points[j].y - p.y);
        if (d < nearest) nearest = d;
      }
      const desired = Math.max(22, Math.min(46, p.r * 2 + 16));
      if (!Number.isFinite(nearest)) return desired;
      return Math.max(13, Math.min(desired, nearest * 0.9));
    });
  }, [points]);
  const activeRef = useRef(0);
  const hoverRef = useRef<number | null>(null);
  const dirtyRef = useRef(true);
  const forceFullRef = useRef(false);
  const revealTargetRef = useRef(0);
  /* How much of the road is currently down. Survives a resize or a palette
     flip, both of which rebuild the whole plate: without this the stroke would
     vanish and re-draw itself from Split every time the window changed width. */
  const revealNowRef = useRef(0);

  useEffect(() => {
    activeRef.current = active;
    hoverRef.current = hover;
    dirtyRef.current = true;
  }, [active, hover]);

  /* ---- plate size ------------------------------------------------------- */
  useEffect(() => {
    const plate = plateRef.current;
    if (!plate) return;
    const measure = () => {
      const r = plate.getBoundingClientRect();
      setBox((prev) =>
        Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5
          ? prev
          : { w: r.width, h: r.height }
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(plate);
    return () => ro.disconnect();
  }, []);

  /* ---- the plate -------------------------------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    const plateEl = plateRef.current;
    if (!canvas || !plateEl) return;
    const plate: HTMLDivElement = plateEl;
    if (box.w < 2 || box.h < 2 || count < 2) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    /* bound to a non-null local: TypeScript will not carry the narrowing into
       the drawing closures below, and every one of them needs the context */
    const ctx: CanvasRenderingContext2D = ctx2d;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(box.w * dpr);
    canvas.height = Math.round(box.h * dpr);
    canvas.style.width = `${box.w}px`;
    canvas.style.height = `${box.h}px`;

    /* ---- palette, read live so the plate follows the sheet --------------- */
    const cs = getComputedStyle(document.documentElement);
    const inkHex = token(cs, '--ink', '#17140F');
    const ink3Hex = token(cs, '--ink-3', '#655C4F');
    const vermHex = token(cs, '--verm', '#B5402F');
    const vermTextHex = token(cs, '--verm-text', '#9E3524');
    const paperHex = token(cs, '--paper', '#E4DFD3');
    const ruleCol = token(cs, '--rule', 'rgba(23,20,15,0.16)');
    const mono =
      token(cs, '--f-mono', '"JetBrains Mono", ui-monospace, Menlo, monospace');

    const C_WASH = rgba(inkHex, 0.30);
    const C_CORE = rgba(inkHex, 0.62);
    const C_BRISTLE = rgba(inkHex, 0.34);
    const C_POOL = rgba(inkHex, 0.92);
    const C_MARK_IN = rgba(paperHex, 1);
    const C_LABEL = rgba(inkHex, 0.86);
    const C_META = rgba(ink3Hex, 1);
    /* --verm is a display-scale colour: 4.22:1 on paper. The ring and the leg
       wash are graphics and may use it; the 11.5px label may not, and takes
       --verm-text at 5.29:1 instead. */
    const C_HOT = rgba(vermHex, 1);
    const C_HOT_SOFT = rgba(vermHex, 0.34);
    const C_HOT_TEXT = rgba(vermTextHex, 1);
    const C_PAPER = rgba(paperHex, 0.92);
    /* The coastline. Quiet on purpose: it is the ground, not the subject, and
       the whole reason the old component deleted its map was that a map drawn
       at full strength buries the one line that matters. */
    const C_LAND = rgba(ink3Hex, 0.44);

    /* ---- geometry -------------------------------------------------------- */
    const pad = padFor(box.w);
    const fit = makeFit(stops, box.w, box.h, pad);
    const px = new Float64Array(count);
    const py = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      px[i] = fit.x(stops[i].lon);
      py[i] = fit.y(stops[i].lat);
    }
    const baseW = 1.15 + 0.85 * clamp01((box.w - 300) / 460);
    const geo = buildGeometry(px, py, count, facts, baseW);
    const markBase = 3.1 + 1.5 * clamp01((box.w - 300) / 460);
    const markR = new Float64Array(count);
    for (let i = 0; i < count; i++) markR[i] = markBase * Math.sqrt(facts[i].weight);

    /* Kilometres at each stop, in the order the arc visits them, so the
       running total can be interpolated from a pixel position on the stroke. */
    const kmAt = new Float64Array(count);
    for (let i = 0; i < count; i++) kmAt[i] = facts[i].cumKm;

    /* ---- graticule ------------------------------------------------------- */
    /* Whole 5° ticks that actually fall inside the plate. The geography the
       old component drew with polygons is carried here by the frame. */
    const lonTicks: number[] = [];
    const latTicks: number[] = [];
    for (let d = -180; d <= 180; d += 5) {
      const x = fit.x(d);
      if (x > pad.l - 12 && x < box.w - pad.r + 12) lonTicks.push(d);
    }
    for (let d = -85; d <= 85; d += 5) {
      const y = fit.y(d);
      if (y > pad.t - 10 && y < box.h - pad.b + 10) latTicks.push(d);
    }

    /* ---- scale bar ------------------------------------------------------- */
    /* Pixels per kilometre at the route's mean latitude — the only latitude at
       which a Mercator scale bar is honest, so it is the one that is stated. */
    let latSum = 0;
    for (let i = 0; i < count; i++) latSum += stops[i].lat;
    const meanLat = latSum / count;
    const kmPerPx = 1 / ((fit.scale / EARTH_R_KM) / Math.cos(meanLat * DEG));
    let barKm = 500;
    for (const cand of [100, 200, 250, 500, 1000]) {
      const w = cand / kmPerPx;
      if (w >= 60 && w <= 150) {
        barKm = cand;
        break;
      }
      if (w < 60) barKm = cand;
    }
    const barPx = barKm / kmPerPx;

    /* ---- labels ---------------------------------------------------------- */
    const labelSize = 11.5;
    const trackPx = labelSize * 0.11;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `500 ${labelSize}px ${mono}`;

    const cxAll = box.w / 2;
    const cyAll = box.h / 2;

    /* Labels live inside the frame: clear of the running total above and of the
       degree ticks along the left and bottom edges. Anything that cannot be put
       here is not drawn at all, which is better than printing a stop name over
       the graticule. */
    const safeL = 4;
    const safeR = box.w - 4;
    const safeT = pad.t - 6;
    const safeB = box.h - pad.b - 2;

    const labels: PlateLabel[] = [];
    for (let i = 0; i < count; i++) {
      const m = measureTracked(ctx, stops[i].name.toUpperCase(), trackPx);
      const si = geo.stopIndex[i];
      /* first choice: push the label out, away from the middle of the plate */
      const preferred =
        (px[i] - cxAll) * geo.nx[si] + (py[i] - cyAll) * geo.ny[si] >= 0 ? 1 : -1;
      const off = markR[i] + 9;
      const lead = 7;

      /* try outward, then inward; the frame wins over the preference */
      let side = preferred;
      let lx = 0;
      let ly = 0;
      for (let attempt = 0; attempt < 2; attempt++) {
        side = attempt === 0 ? preferred : -preferred;
        const tx = px[i] + geo.nx[si] * side * (off + lead);
        const ty = py[i] + geo.ny[si] * side * (off + lead);
        lx = tx - (geo.nx[si] * side < 0 ? m.width : 0);
        ly = ty + labelSize * 0.36;
        const inside =
          lx - 3 >= safeL &&
          lx + m.width + 3 <= safeR &&
          ly - labelSize >= safeT &&
          ly + 4 <= safeB;
        if (inside) break;
      }

      labels.push({
        text: stops[i].name.toUpperCase(),
        chars: m.chars,
        offs: m.offs,
        width: m.width,
        x: lx,
        y: ly,
        ax: px[i] + geo.nx[si] * side * off,
        ay: py[i] + geo.ny[si] * side * off,
        size: labelSize,
        /* longest stays first, then the stops that open a country */
        priority: facts[i].weight * 10 + (facts[i].entersCountry ? 5 : 0),
        stop: i,
        drawn: false
      });
    }
    /* place in priority order, drop anything that would collide */
    const order = labels.map((_, i) => i).sort((a, b) => labels[b].priority - labels[a].priority);
    const placedX: number[] = [];
    const placedY: number[] = [];
    const placedW: number[] = [];
    const placedH: number[] = [];
    for (const i of order) {
      const L = labels[i];
      const bx = L.x - 3;
      const by = L.y - labelSize;
      const bw = L.width + 6;
      const bh = labelSize + 4;
      if (bx < safeL || by < safeT || bx + bw > safeR || by + bh > safeB) continue;
      let hit = false;
      for (let j = 0; j < placedX.length; j++) {
        if (overlaps(bx, by, bw, bh, placedX[j], placedY[j], placedW[j], placedH[j])) {
          hit = true;
          break;
        }
      }
      if (hit) continue;
      L.drawn = true;
      placedX.push(bx);
      placedY.push(by);
      placedW.push(bw);
      placedH.push(bh);
    }

    /* The selected label is drawn whether or not it found a clear slot, so it
       gets clamped into the frame rather than running off the sheet. */
    for (let i = 0; i < labels.length; i++) {
      const L = labels[i];
      L.x = Math.max(safeL + 3, Math.min(safeR - 3 - L.width, L.x));
      L.y = Math.max(safeT + labelSize, Math.min(safeB - 4, L.y));
    }

    /* ---- country transitions -------------------------------------------- */
    interface Crossing {
      x: number;
      y: number;
      nx: number;
      ny: number;
      arc: number;
      label: ReturnType<typeof measureTracked>;
      lx: number;
      ly: number;
    }
    const csize = 11.5;
    ctx.font = `600 ${csize}px ${mono}`;
    const crossings: Crossing[] = [];
    for (let i = 0; i < count; i++) {
      if (!facts[i].entersCountry) continue;
      /* halfway along the leg that arrives, or just before Split for the first */
      const si = i === 0 ? 0 : Math.round((geo.stopIndex[i - 1] + geo.stopIndex[i]) / 2);
      const m = measureTracked(ctx, stops[i].country.toUpperCase(), csize * 0.13);
      const outward =
        (geo.sx[si] - cxAll) * geo.nx[si] + (geo.sy[si] - cyAll) * geo.ny[si] >= 0 ? 1 : -1;
      const lx = geo.sx[si] + geo.nx[si] * outward * 15;
      const ly = geo.sy[si] + geo.ny[si] * outward * 15;
      crossings.push({
        x: geo.sx[si],
        y: geo.sy[si],
        nx: geo.nx[si],
        ny: geo.ny[si],
        arc: geo.arc[si],
        label: m,
        lx: Math.max(
          safeL + 3,
          Math.min(safeR - 3 - m.width, lx - (geo.nx[si] * outward < 0 ? m.width : 0))
        ),
        ly: Math.max(safeT + csize, Math.min(safeB - 4, ly + csize * 0.36))
      });
    }

    /* Room for the running total before its caption, sized on the widest value
       the counter will ever show, so the two never collide as it counts up. */
    ctx.font = `600 ${labelSize + 3}px ${mono}`;
    const headerGap =
      ctx.measureText(`${formatKm(facts[count - 1].cumKm)} KM`).width + 14;

    /* ---- frame state ----------------------------------------------------- */
    let reveal = reduced ? 1 : revealNowRef.current;
    if (reduced) {
      revealTargetRef.current = 1;
      revealNowRef.current = 1;
    }
    let raf = 0;
    let resizeRaf = 0;
    /* IMPORTANT: optimistic. A plate that waits for the observer draws nothing. */
    let onScreen = true;
    let running = false;
    let disposed = false;
    let kmShown = -1;
    let kmStr = '0';

    /* ---- drawing --------------------------------------------------------- */

    /** Index of the last fully revealed sample, for a given arc length. */
    function headIndex(targetArc: number): number {
      let lo = 0;
      let hi = geo.n - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (geo.arc[mid] <= targetArc) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    }

    function bandPath(from: number, to: number, headArc: number, scaleW: number) {
      ctx.beginPath();
      ctx.moveTo(geo.sx[from] + geo.nx[from] * geo.hw[from] * scaleW,
                 geo.sy[from] + geo.ny[from] * geo.hw[from] * scaleW);
      for (let i = from + 1; i <= to; i++) {
        ctx.lineTo(geo.sx[i] + geo.nx[i] * geo.hw[i] * scaleW,
                   geo.sy[i] + geo.ny[i] * geo.hw[i] * scaleW);
      }
      /* a partial sample so the wet end moves smoothly, not in 34ths of a leg */
      if (to < geo.n - 1) {
        const seg = geo.arc[to + 1] - geo.arc[to];
        const t = seg > 1e-6 ? clamp01((headArc - geo.arc[to]) / seg) : 0;
        const hx = geo.sx[to] + (geo.sx[to + 1] - geo.sx[to]) * t;
        const hy = geo.sy[to] + (geo.sy[to + 1] - geo.sy[to]) * t;
        const hnx = geo.nx[to] + (geo.nx[to + 1] - geo.nx[to]) * t;
        const hny = geo.ny[to] + (geo.ny[to + 1] - geo.ny[to]) * t;
        const hhw = (geo.hw[to] + (geo.hw[to + 1] - geo.hw[to]) * t) * scaleW * (0.35 + 0.65 * (1 - t));
        ctx.lineTo(hx + hnx * hhw, hy + hny * hhw);
        ctx.lineTo(hx - hnx * hhw, hy - hny * hhw);
      }
      for (let i = to; i >= from; i--) {
        ctx.lineTo(geo.sx[i] - geo.nx[i] * geo.hw[i] * scaleW,
                   geo.sy[i] - geo.ny[i] * geo.hw[i] * scaleW);
      }
      ctx.closePath();
    }

    function corePath(from: number, to: number) {
      ctx.beginPath();
      ctx.moveTo(geo.sx[from] + geo.nx[from] * geo.hwCore[from],
                 geo.sy[from] + geo.ny[from] * geo.hwCore[from]);
      for (let i = from + 1; i <= to; i++) {
        ctx.lineTo(geo.sx[i] + geo.nx[i] * geo.hwCore[i],
                   geo.sy[i] + geo.ny[i] * geo.hwCore[i]);
      }
      for (let i = to; i >= from; i--) {
        ctx.lineTo(geo.sx[i] - geo.nx[i] * geo.hwCore[i],
                   geo.sy[i] - geo.ny[i] * geo.hwCore[i]);
      }
      ctx.closePath();
    }

    /** One bristle: a hair that wanders inside the band and out past its edge. */
    function bristle(from: number, to: number, phase: number, amp: number) {
      ctx.beginPath();
      for (let i = from; i <= to; i++) {
        const u = geo.arc[i] / geo.totalArc;
        const o = amp * Math.sin(u * 58.4 + phase) * (0.55 + 0.45 * noise1(u * 31 + phase));
        const x = geo.sx[i] + geo.nx[i] * geo.hw[i] * o;
        const y = geo.sy[i] + geo.ny[i] * geo.hw[i] * o;
        if (i === from) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, box.w, box.h);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const headArc = reveal * geo.totalArc;
      const head = headIndex(headArc);
      const hot = hoverRef.current !== null ? hoverRef.current : activeRef.current;

      /*
       * ---- the land, under everything -----------------------------------
       *
       * Jack: "The map needs the country lines." He is right that a route
       * floating on an empty sheet is not a map, and the plate had been
       * arguing the opposite: "no country polygons, no atlas, no d3."
       *
       * The compromise is that the geography is REAL but it does not ship a
       * map library. scripts/build-route-countries.js pulls the same Natural
       * Earth data the old component used, simplifies it at build time, and
       * leaves 34 rings of plain [lon, lat] that this projects with the
       * Mercator already on the page.
       *
       * Drawn as a coastline and nothing else: one hairline weight, no fill,
       * no labels, no borders picked out. It is the ground the road is on and
       * it must never compete with the road, which is the reason the old
       * component threw the map away rather than quieting it down.
       *
       * Clipped to the plate rather than to the data window, so a ring that
       * runs off the sheet leaves at the edge instead of being cut square by
       * the extraction and reading as a border that is not there.
       */
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad.l - 10, pad.t - 8, box.w - pad.r + 10 - (pad.l - 10), box.h - pad.b + 8 - (pad.t - 8));
      ctx.clip();
      ctx.strokeStyle = C_LAND;
      ctx.lineWidth = 1;
      for (let r = 0; r < COUNTRIES.rings.length; r++) {
        const ring = COUNTRIES.rings[r] as number[][];
        ctx.beginPath();
        for (let i = 0; i < ring.length; i++) {
          /* DEGREES. `fit.x` applies DEG itself — passing radians in squashed
             every longitude toward zero and drew the whole of Europe as one
             vertical line down the middle of the plate. */
          const px = fit.x(ring[i][0]);
          const py = fit.y(ring[i][1]);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();

      /* ---- graticule: the frame, drawn first and quietly ----------------- */
      ctx.strokeStyle = ruleCol;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l - 10, pad.t - 8);
      ctx.lineTo(pad.l - 10, box.h - pad.b + 8);
      ctx.lineTo(box.w - pad.r + 10, box.h - pad.b + 8);
      ctx.stroke();

      ctx.font = `500 ${labelSize}px ${mono}`;
      ctx.fillStyle = C_META;
      ctx.textBaseline = 'alphabetic';
      for (let i = 0; i < latTicks.length; i++) {
        const y = fit.y(latTicks[i]);
        ctx.beginPath();
        ctx.moveTo(pad.l - 10, y);
        ctx.lineTo(pad.l - 4, y);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(`${latTicks[i]}°`, pad.l - 14, y + 4);
      }
      for (let i = 0; i < lonTicks.length; i++) {
        const x = fit.x(lonTicks[i]);
        ctx.beginPath();
        ctx.moveTo(x, box.h - pad.b + 8);
        ctx.lineTo(x, box.h - pad.b + 2);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillText(`${lonTicks[i]}°`, x, box.h - pad.b + 22);
      }
      ctx.textAlign = 'left';

      /* ---- country crossings: hairline across the road ------------------- */
      ctx.font = `600 ${csize}px ${mono}`;
      for (let i = 0; i < crossings.length; i++) {
        const c = crossings[i];
        const on = headArc >= c.arc - 2;
        if (!on) continue;
        ctx.strokeStyle = ruleCol;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(c.x + c.nx * 13, c.y + c.ny * 13);
        ctx.lineTo(c.x - c.nx * 13, c.y - c.ny * 13);
        ctx.stroke();
        ctx.fillStyle = C_META;
        drawTracked(ctx, c.label, c.lx, c.ly);
      }

      /* ---- the road ------------------------------------------------------ */
      if (head > 0) {
        ctx.fillStyle = C_WASH;
        bandPath(0, head, headArc, 1);
        ctx.fill();

        ctx.fillStyle = C_CORE;
        corePath(0, head);
        ctx.fill();

        ctx.strokeStyle = C_BRISTLE;
        ctx.lineWidth = 0.7;
        bristle(0, head, 0.4, 0.78);
        bristle(0, head, 2.9, -0.62);
        bristle(0, head, 5.1, 0.34);

        /* the leg the reader is on, picked out in pigment */
        if (hot >= 0 && hot < count) {
          const legs: number[] = [];
          if (hot > 0) legs.push(hot - 1);
          if (hot < count - 1) legs.push(hot);
          ctx.fillStyle = C_HOT_SOFT;
          for (let j = 0; j < legs.length; j++) {
            const a = geo.legStart[legs[j]];
            const b = Math.min(geo.legEnd[legs[j]], head);
            if (b > a) {
              bandPath(a, b, geo.arc[b], 1.55);
              ctx.fill();
            }
          }
        }
      }

      /* ---- the marks ----------------------------------------------------- */
      for (let i = 0; i < count; i++) {
        const on = headArc >= geo.arc[geo.stopIndex[i]] - 1;
        if (!on) continue;
        const r = markR[i];
        const isHot = i === hot;

        /* ink pools where the brush rested: area proportional to days stayed */
        ctx.fillStyle = C_POOL;
        ctx.beginPath();
        ctx.arc(px[i], py[i], r, 0, Math.PI * 2);
        ctx.fill();

        /* a paper centre turns the blot into a surveyed station */
        if (r > 4.4) {
          ctx.fillStyle = C_MARK_IN;
          ctx.beginPath();
          ctx.arc(px[i], py[i], r * 0.40, 0, Math.PI * 2);
          ctx.fill();
        }

        if (isHot) {
          ctx.strokeStyle = C_HOT;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(px[i], py[i], r + 5.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      /* ---- the wet end --------------------------------------------------- */
      if (reveal > 0.004 && reveal < 0.999) {
        const seg = head < geo.n - 1 ? geo.arc[head + 1] - geo.arc[head] : 1;
        const t = seg > 1e-6 ? clamp01((headArc - geo.arc[head]) / seg) : 0;
        const nxt = Math.min(head + 1, geo.n - 1);
        const hx = geo.sx[head] + (geo.sx[nxt] - geo.sx[head]) * t;
        const hy = geo.sy[head] + (geo.sy[nxt] - geo.sy[head]) * t;
        ctx.fillStyle = C_POOL;
        ctx.beginPath();
        ctx.arc(hx, hy, geo.hw[head] * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      /* ---- stop labels --------------------------------------------------- */
      ctx.font = `500 ${labelSize}px ${mono}`;
      for (let i = 0; i < labels.length; i++) {
        const L = labels[i];
        const isHot = L.stop === hot;
        if (!L.drawn && !isHot) continue;
        if (headArc < geo.arc[geo.stopIndex[L.stop]] - 1 && !isHot) continue;

        if (isHot) {
          /* the active label always wins, so it gets a paper backing */
          ctx.fillStyle = C_PAPER;
          ctx.fillRect(L.x - 4, L.y - labelSize, L.width + 8, labelSize + 5);
        }
        ctx.strokeStyle = isHot ? C_HOT_SOFT : ruleCol;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(L.ax, L.ay);
        ctx.lineTo(L.x + (L.x < px[L.stop] ? L.width : 0), L.y - labelSize * 0.34);
        ctx.stroke();

        ctx.fillStyle = isHot ? C_HOT_TEXT : C_LABEL;
        drawTracked(ctx, L, L.x, L.y);
      }

      /* ---- scale bar and the running total ------------------------------- */
      const by = box.h - pad.b + 8;
      const bx = box.w - pad.r + 10 - barPx;
      ctx.strokeStyle = rgba(inkHex, 0.55);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(bx, by - 26);
      ctx.lineTo(bx, by - 20);
      ctx.lineTo(bx + barPx, by - 20);
      ctx.lineTo(bx + barPx, by - 26);
      ctx.stroke();
      ctx.font = `500 ${labelSize}px ${mono}`;
      ctx.fillStyle = C_META;
      ctx.textAlign = 'right';
      ctx.fillText(`${barKm} KM AT ${meanLat.toFixed(0)}°N`, bx + barPx, by - 30);

      /* Interpolate the total from the pixel position of the wet end, so the
         figure lands exactly on the real cumulative distance at every stop.
         The string is rebuilt only when the whole kilometre changes. */
      let km = 0;
      for (let i = 0; i < count - 1; i++) {
        const a = geo.arc[geo.stopIndex[i]];
        const b = geo.arc[geo.stopIndex[i + 1]];
        if (headArc >= b) {
          km = kmAt[i + 1];
        } else if (headArc > a) {
          km = kmAt[i] + (kmAt[i + 1] - kmAt[i]) * ((headArc - a) / (b - a || 1));
          break;
        } else break;
      }
      const kmInt = Math.round(km);
      if (kmInt !== kmShown) {
        kmShown = kmInt;
        kmStr = formatKm(kmInt);
      }
      ctx.font = `600 ${labelSize + 3}px ${mono}`;
      ctx.fillStyle = rgba(inkHex, 0.9);
      ctx.textAlign = 'left';
      ctx.fillText(`${kmStr} KM`, pad.l - 10, pad.t - 14);
      ctx.font = `500 ${labelSize}px ${mono}`;
      ctx.fillStyle = C_META;
      ctx.fillText('GREAT-CIRCLE, STOP TO STOP', pad.l - 10 + headerGap, pad.t - 14);
    }

    /* ---- scroll drives the laydown --------------------------------------- */
    function readScroll() {
      if (reduced) {
        revealTargetRef.current = 1;
        return;
      }
      if (forceFullRef.current) {
        revealTargetRef.current = 1;
        return;
      }
      const r = plate.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      const span = Math.max(r.height * 0.66, vh * 0.4);
      const next = clamp01((vh * 0.86 - r.top) / span);
      if (Math.abs(next - revealTargetRef.current) > 0.0005) {
        revealTargetRef.current = next;
      }
    }

    function frame() {
      raf = requestAnimationFrame(frame);
      const target = revealTargetRef.current;
      const d = target - reveal;
      if (Math.abs(d) > 0.0006) {
        reveal += d * 0.14;
        revealNowRef.current = reveal;
        dirtyRef.current = true;
      } else if (reveal !== target) {
        reveal = target;
        revealNowRef.current = reveal;
        dirtyRef.current = true;
      }
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      draw();
    }

    function sync() {
      const should = onScreen && !document.hidden && !disposed;
      if (should && !running) {
        running = true;
        raf = requestAnimationFrame(frame);
      } else if (!should && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    }

    const io = new IntersectionObserver(
      (entries) => {
        onScreen = entries[0].isIntersecting;
        sync();
      },
      { rootMargin: '160px 0px' }
    );
    io.observe(plate);

    const onScroll = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        readScroll();
      });
    };

    readScroll();
    dirtyRef.current = true;
    draw();
    sync();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    document.addEventListener('visibilitychange', sync);

    /*
     * Dev handle, for the same reason every world has one. The pane has no
     * viewport, so this plate sits at 2px wide and neither the reveal nor the
     * ResizeObserver ever fires: there is no way to find out whether the
     * coastline lands on the route without one. `at` re-measures first, which
     * is the whole point.
     */
    if (process.env.NODE_ENV !== 'production') {
      (canvas as unknown as Record<string, unknown>).__route = {
        /* Force a plate size. The ResizeObserver that normally does this
           never fires in a pane with no viewport, so the effect re-runs and
           installs a fresh handle: call size() first, then at(). */
        size: (w: number, h: number) => setBox({ w, h }),
        at: (r = 1) => {
          reveal = r;
          dirtyRef.current = true;
          draw();
        },
        stops: () => stops.length,
        rings: () => COUNTRIES.rings.length
      };
    }

    return () => {
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(resizeRaf);
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [box, stops, facts, count, theme]);

  /* ---- keyboard travel along the route ---------------------------------- */
  const select = useCallback((i: number, focus: boolean) => {
    const next = Math.max(0, Math.min(count - 1, i));
    /* written synchronously so a second key event in the same commit reads the
       stop this one just moved to, rather than the one before it */
    activeRef.current = next;
    setActive(next);
    /* reaching for a stop means the reader wants the whole road, now */
    forceFullRef.current = true;
    revealTargetRef.current = 1;
    dirtyRef.current = true;
    if (focus) markRefs.current[next]?.focus();
  }, [count]);

  /* Reads the current stop from the ref, not from the render closure. Two key
     events can land inside one commit, and a stale `active` would swallow the
     second — which is exactly what happened the first time this was driven. */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const at = activeRef.current;
      let next = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = at + 1;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = at - 1;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = count - 1;
      else return;
      e.preventDefault();
      select(next, true);
    },
    [count, select]
  );

  /* ---- the panel --------------------------------------------------------- */
  const sel = stops[active];
  const selFacts = facts[active];
  const reels = sel?.reels ?? [];

  return (
    <div className={className ? `v2-route ${className}` : 'v2-route'}>
      {/* data-perch marks the lines the bird can stand on. See THE PERCH
          CONTRACT in components/v2/Companion.tsx: the insets are cap-line
          offsets for each face's line-height, in em so they survive the
          clamp(); the hairline and the plate border are their own lines and
          take none. */}
      <div className="v2-route-head">
        <p className="v2-eyebrow" data-perch data-perch-text data-perch-inset="0.38em">
          {eyebrow}
        </p>
        <hr className="v2-rule-firm" data-perch />
        <div className="v2-route-headline">
          <h3 className="v2-route-title" data-perch data-perch-text data-perch-inset="0.10em">
            {title}
          </h3>
          <dl className="v2-route-figures">
            <div>
              {/* Self-describing, because the films are filed under
                  @5001km.sidequest and a bare "Distance: 3,682 km" reads as a
                  contradiction. It is not: this is the sum of great-circle legs,
                  the handle counts road actually travelled. */}
              <dt>Straight line</dt>
              <dd>
                <b>{formatKm(totalKm)}</b> km
              </dd>
            </div>
            <div>
              <dt>Stops</dt>
              <dd>
                <b>{count}</b>
              </dd>
            </div>
            <div>
              <dt>Countries</dt>
              <dd>
                <b>{countries.length}</b>
              </dd>
            </div>
          </dl>
        </div>
        <p className="v2-route-note">
          Every figure on this plate is computed from the recorded coordinates.
          Straight line stop to stop, so it runs shorter than the road did.
        </p>
      </div>

      <div className="v2-route-body">
        <div className="v2-route-plate" ref={plateRef} data-perch>
          <canvas ref={canvasRef} className="v2-route-canvas" aria-hidden="true" />
          <div
            className="v2-route-marks"
            role="group"
            aria-label={`Route stops, ${stops[0]?.name ?? ''} to ${stops[count - 1]?.name ?? ''}. Use the arrow keys to travel along the route.`}
            onKeyDown={onKeyDown}
          >
            {points.map((p, i) => {
              const f = facts[i];
              const s = stops[i];
              const size = markSizes[i];
              const filmCount = s.reels?.length ?? 0;
              const name =
                `Stop ${i + 1} of ${count}. ${s.name}, ${s.country}. ` +
                `${formatDays(f.days)}. ${formatKm(f.cumKm)} kilometres from ${stops[0].name}. ` +
                `${filmCount} ${filmCount === 1 ? 'film' : 'films'}.`;
              return (
                <button
                  key={`${s.name}-${i}`}
                  ref={(el) => {
                    markRefs.current[i] = el;
                  }}
                  type="button"
                  className={`v2-route-mark${i === active ? ' is-active' : ''}`}
                  style={{
                    left: `${p.x}px`,
                    top: `${p.y}px`,
                    width: `${size}px`,
                    height: `${size}px`,
                    /* smaller target on top, so a crowded stop stays clickable */
                    zIndex: i === active ? 200 : Math.round(100 - size)
                  }}
                  tabIndex={i === active ? 0 : -1}
                  aria-pressed={i === active}
                  aria-label={name}
                  onClick={() => select(i, false)}
                  /* focus IS selection here: the roving tabindex means the mark
                     you have landed on is the one the arrows travel from, and
                     the panel should already be describing it. */
                  onFocus={() => {
                    setHover(i);
                    select(i, false);
                  }}
                  onBlur={() => setHover((h) => (h === i ? null : h))}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                />
              );
            })}
          </div>
        </div>

        <div
          className="v2-route-panel"
          aria-live="polite"
          aria-atomic="true"
          aria-label="Selected stop"
        >
          {sel ? (
            <>
              <p className="v2-route-panel-idx">
                {String(active + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
                <span> · {sel.country}</span>
              </p>
              <h4 className="v2-route-panel-name">{sel.name}</h4>
              <dl className="v2-route-panel-facts">
                <div>
                  <dt>Days</dt>
                  <dd>{formatDays(selFacts.days) || '—'}</dd>
                </div>
                <div>
                  <dt>From {stops[0].name}</dt>
                  <dd>{formatKm(selFacts.cumKm)} km</dd>
                </div>
                <div>
                  <dt>Last leg</dt>
                  <dd>
                    {active === 0 ? 'Start of the road' : `${formatKm(selFacts.legKm)} km`}
                  </dd>
                </div>
                <div>
                  <dt>Position</dt>
                  <dd>
                    {sel.lat.toFixed(3)}°N&nbsp;
                    {Math.abs(sel.lon).toFixed(3)}°{sel.lon < 0 ? 'W' : 'E'}
                  </dd>
                </div>
              </dl>

              {reels.length > 0 ? (
                <ReelStack key={sel.name} reels={reels} place={sel.name} />
              ) : (
                <p className="v2-route-panel-empty">No film from this stop.</p>
              )}
            </>
          ) : null}
        </div>
      </div>

      <ol
        className="v2-route-strip"
        aria-label="Countries, in the order they were crossed"
        data-perch
      >
        {countries.map((c) => (
          <li key={c.name}>
            <button
              type="button"
              className="v2-route-strip-btn"
              onClick={() => select(c.stop, true)}
            >
              <b>{c.name}</b>
              <small>
                {formatKm(c.km)} km · {c.days} {c.days === 1 ? 'day' : 'days'}
              </small>
            </button>
          </li>
        ))}
      </ol>

      {handle ? (
        <p className="v2-route-credit">
          Filmed on the way at{' '}
          <a href={handle.url} target="_blank" rel="noreferrer noopener">
            {handle.label}
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- the films */

/**
 * The films from one stop, as a stack of polaroids you can deal through.
 *
 * > "videos appear in the empty middle-right as polaroids... multiple
 * >  polaroids in a visible stack, cycleable with arrows"
 *
 * This replaced a grid of small thumbnails. The grid was more efficient and
 * less true: what these are is a handful of pictures from one place, and a
 * handful of pictures from one place is a stack you go through, not a contact
 * sheet. Tagounite has five and Split has one, and a stack SHOWS that at a
 * glance — the depth of the pile is the count — where a grid of equal cells
 * flattens the difference into a row length nobody reads.
 *
 * Only the top card carries the image and the link; the cards behind it are
 * empty stock, offset and turned by a deterministic angle so the pile is the
 * same every time this stop is opened rather than reshuffling on each render.
 * That also keeps the cost at one <img> per stop however deep the pile is.
 */
function ReelStack({ reels, place }: { reels: RouteReel[]; place: string }) {
  const [at, setAt] = useState(0);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const n = reels.length;
  const reel = reels[at];
  const isBroken = !!broken[reel.url];
  const label = reel.title ? `${reel.title}, ${place}` : place;

  const go = (d: number) => setAt((i) => (i + d + n) % n);

  /* At most three cards of backing. Past that the pile stops reading as deeper
     and starts reading as untidy, and the count is printed underneath anyway. */
  const backing = Math.min(3, n - 1);

  return (
    <div className="v2-route-stack">
      <div
        className="v2-route-pile"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            go(1);
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            go(-1);
          }
        }}
      >
        {/* the pile, behind. Deterministic angles: `at` is deliberately NOT in
            the expression, so dealing through does not make the pile twitch. */}
        {Array.from({ length: backing }, (_, k) => (
          <span
            key={k}
            className="v2-route-card is-back"
            aria-hidden="true"
            style={{
              transform: `rotate(${(k % 2 ? 1 : -1) * (1.4 + k * 0.9)}deg) translate(${
                (k + 1) * 3
              }px, ${(k + 1) * 4}px)`,
              zIndex: backing - k
            }}
          />
        ))}

        <a
          className={`v2-route-card is-top${isBroken ? ' is-bare' : ''}`}
          href={reel.url}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`Open the film from ${label} on Instagram. ${at + 1} of ${n}.`}
        >
          <span className="v2-route-card-win">
            {isBroken ? (
              <span className="v2-route-card-bare">{reel.title ?? 'Film'}</span>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={reel.thumbnail}
                alt={`Still from the film shot in ${label}`}
                loading="lazy"
                decoding="async"
                onError={() => setBroken((b) => ({ ...b, [reel.url]: true }))}
              />
            )}
          </span>
          {/* The wide bottom margin is the whole reason a polaroid reads as a
              polaroid, so the caption lives in it rather than under the card. */}
          <span className="v2-route-card-cap">
            {reel.title ?? 'Film'}
            <i aria-hidden="true">↗</i>
          </span>
        </a>
      </div>

      {n > 1 ? (
        <div className="v2-route-deal">
          <button
            type="button"
            aria-label={`Previous film from ${place}`}
            onClick={() => go(-1)}
          >
            <span aria-hidden="true">&#8249;</span>
          </button>
          <p aria-live="polite">
            <b>{at + 1}</b> / {n}
          </p>
          <button type="button" aria-label={`Next film from ${place}`} onClick={() => go(1)}>
            <span aria-hidden="true">&#8250;</span>
          </button>
        </div>
      ) : (
        <p className="v2-route-deal is-single">One film</p>
      )}
    </div>
  );
}
