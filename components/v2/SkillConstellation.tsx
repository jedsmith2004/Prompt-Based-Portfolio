'use client';

/* ============================================================================
   SkillConstellation — the technologies as a star chart, on a turning sphere.

   Jack, 2026-08-25: "The 100 technologies should be displayed in a more
   creative way, like the current portfolio but even more creative if you can
   think of it."

   Jack, 2026-08-26: "This graph needs to be interactive in some way and
   spinning in 3D, remove the white background and make it fit into the middle
   of the background where there is nothing. We can compress the project list
   into just the titles and make them little cards on a smooth and perpetually
   spinning carousel. If nothing is selected, every now and again an idle
   animation highlights a project card (that is displayed) and the cycle on the
   graph."

   WHY A CONSTELLATION AND NOT A PRETTIER CLOUD. A cloud encodes exactly one
   number per technology, its frequency, and encodes it badly: you get an
   impression of size and no way to check it. A chart encodes three things and
   one of them is genuinely new:

     magnitude   how much the technology carries, scored by recency-weighted
                 use, exactly the score the ledger computes
     colour      the era it was last used in
     LINES       WHICH TECHNOLOGIES WERE USED TOGETHER

   That last one is the point. A cloud can tell you he has used gRPC and Unity.
   Only a chart can show you that they are joined, because they are the same
   project.

   WHY A SPHERE AND NOT A FLAT PLATE.

   It is not decoration, and it fixes a real problem the flat version had. On a
   plane, a technology shared by two projects sits between them, and a
   technology shared by two projects on OPPOSITE sides of the plate has nowhere
   to sit at all: the vector sum cancels and it lands in the middle, next to
   every other cancelled star, in a pile.

   On a sphere there is no opposite side to be caught between. Every project
   gets a direction from a Fibonacci lattice, which spaces points on a sphere
   about as evenly as anything cheap can, and a technology sits at the
   normalised sum of its projects' directions. Two projects that are far apart
   still have a well-defined midpoint, and the star lands on it.

   Turning it is then not a gimmick but the only way to read it: half the data
   is behind the other half at any instant, and the rotation is what brings it
   round. Depth is carried by size, brightness and label suppression, so the
   front half is legible and the back half reads as sky.

   NO BACKGROUND. The canvas is transparent and the plate sits in the gap in
   the middle of the world behind it. The sky here is the section's own
   backdrop, which is the point: this is the one component on the page that was
   drawing its own paper over a world that was already a sky.

   IT COSTS ONE LOOP. The globe, the carousel and the idle cycle are all
   advanced by a single rAF, gated on an IntersectionObserver, so nothing here
   runs while the reader is somewhere else on the page. The layout is computed
   once and never again.
   ========================================================================== */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { projects as ALL_PROJECTS } from '@/lib/projects-data';
import { buildTechLedger, type TechRow } from './SkillsFromWork';

/* -------------------------------------------------------------------------- */
/* layout                                                                      */
/* -------------------------------------------------------------------------- */

/** Deterministic PRNG. Same chart on the server, the client and every reload. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Star {
  key: string;
  label: string;
  /** 0..1, drives radius and brightness. */
  mag: number;
  /** 0 newest, 1 middle, 2 oldest. */
  era: number;
  projects: string[];
  /** Unit vector on the sphere. */
  x: number;
  y: number;
  z: number;
}

interface Constellation {
  id: string;
  title: string;
  /** Star indices, ordered into a chain. */
  chain: number[];
  count: number;
}

interface Chart {
  stars: Star[];
  lines: Constellation[];
}

/** Rotation speed at rest, radians per second. Slow enough to read. */
const SPIN = 0.17;

/** Perspective distance in sphere radii. Larger is flatter. */
const CAM = 3.1;

/** Fixed tilt so the poles are never edge-on and the spin reads as a globe. */
const TILT = 0.36;

/** Carousel speed, px per second. */
const CAROUSEL = 26;

/** How often the idle cycle picks a new project, ms. */
const IDLE_EVERY = 4200;
/** How long it holds one, ms. */
const IDLE_HOLD = 2600;

/**
 * Place every project on a Fibonacci lattice, then hang each technology at the
 * normalised sum of the directions of the projects that use it.
 *
 * The lattice matters. Placing N project directions by hand, or by an angle
 * that is i/N of a circle, clumps them: a circle of directions is a plane, and
 * a plane on a sphere is a ring round the equator. The golden-angle lattice is
 * the cheapest thing that genuinely spreads points over a sphere, and it is
 * why the chart has stars at the poles instead of a belt.
 */
function buildChart(rows: TechRow[], maxScore: number, projectOrder: string[]): Chart {
  const rand = mulberry32(0x5eed);
  const N = Math.max(1, projectOrder.length);
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const dir = new Map<string, [number, number, number]>();
  projectOrder.forEach((id, i) => {
    const y = 1 - (i / Math.max(1, N - 1)) * 2; // 1 down to -1
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = GOLDEN * i;
    dir.set(id, [Math.cos(th) * r, y, Math.sin(th) * r]);
  });

  const stars: Star[] = rows.map((r) => {
    let vx = 0;
    let vy = 0;
    let vz = 0;
    for (const s of r.sources) {
      const d = dir.get(s.projectId);
      if (!d) continue;
      vx += d[0];
      vy += d[1];
      vz += d[2];
    }
    /*
     * Jitter BEFORE normalising, so a technology used by exactly one project
     * does not land precisely on that project's lattice point along with every
     * other single-use technology it has. The jitter is small relative to the
     * lattice spacing, so the cluster still reads as belonging to its project.
     */
    vx += (rand() - 0.5) * 0.55;
    vy += (rand() - 0.5) * 0.55;
    vz += (rand() - 0.5) * 0.55;
    let len = Math.hypot(vx, vy, vz);
    if (len < 1e-6) {
      vx = rand() - 0.5;
      vy = rand() - 0.5;
      vz = rand() - 0.5;
      len = Math.hypot(vx, vy, vz) || 1;
    }
    return {
      key: r.key,
      label: r.label,
      mag: Math.min(1, r.score / (maxScore || 1)),
      era: r.sources[0]?.era ?? 1,
      projects: r.sources.map((s) => s.projectId),
      x: vx / len,
      y: vy / len,
      z: vz / len
    };
  });

  /*
   * Relaxation ON THE SPHERE. Fixed passes, no convergence test: this must
   * take the same time and give the same answer every run, on the server and
   * on the client. Neighbours push apart along the chord and are renormalised
   * back onto the surface, which is a great-circle repulsion to first order
   * and is indistinguishable from one at this separation.
   */
  const MIN = 0.17;
  for (let pass = 0; pass < 40; pass++) {
    for (let i = 0; i < stars.length; i++) {
      const a = stars[i];
      for (let j = i + 1; j < stars.length; j++) {
        const b = stars[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dy, dz);
        if (d >= MIN || d === 0) continue;
        const push = (MIN - d) / 2 / d;
        a.x -= dx * push;
        a.y -= dy * push;
        a.z -= dz * push;
        b.x += dx * push;
        b.y += dy * push;
        b.z += dz * push;
      }
    }
    for (const s of stars) {
      const l = Math.hypot(s.x, s.y, s.z) || 1;
      s.x /= l;
      s.y /= l;
      s.z /= l;
    }
  }

  const lines: Constellation[] = [];
  for (const id of projectOrder) {
    const idx = stars
      .map((s, i) => (s.projects.includes(id) ? i : -1))
      .filter((i) => i >= 0);
    if (idx.length < 2) continue;
    /*
     * Chain, ordered by angle about the project's own axis. On a plane this
     * was atan2 about a centroid; on a sphere the equivalent is the angle in
     * the tangent plane at the project's lattice direction, which is what
     * keeps the chain from crossing itself.
     */
    const d = dir.get(id) ?? [0, 1, 0];
    /* any vector not parallel to d, to build a tangent basis */
    const helper: [number, number, number] =
      Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const ux = d[1] * helper[2] - d[2] * helper[1];
    const uy = d[2] * helper[0] - d[0] * helper[2];
    const uz = d[0] * helper[1] - d[1] * helper[0];
    const ul = Math.hypot(ux, uy, uz) || 1;
    const e1: [number, number, number] = [ux / ul, uy / ul, uz / ul];
    const e2: [number, number, number] = [
      d[1] * e1[2] - d[2] * e1[1],
      d[2] * e1[0] - d[0] * e1[2],
      d[0] * e1[1] - d[1] * e1[0]
    ];
    const ang = (i: number) => {
      const s = stars[i];
      return Math.atan2(
        s.x * e2[0] + s.y * e2[1] + s.z * e2[2],
        s.x * e1[0] + s.y * e1[1] + s.z * e1[2]
      );
    };
    const chain = [...idx].sort((a, b) => ang(a) - ang(b));
    const title = ALL_PROJECTS.find((p) => p.id === id)?.title ?? id;
    lines.push({ id, title, chain, count: idx.length });
  }
  return { stars, lines };
}

/* -------------------------------------------------------------------------- */
/* component                                                                   */
/* -------------------------------------------------------------------------- */

export interface SkillConstellationProps {
  className?: string;
  height?: number;
}

function token(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = style.getPropertyValue(name).trim();
  return v || fallback;
}

export default function SkillConstellation({
  className,
  height = 460
}: SkillConstellationProps) {
  const listId = useId();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  /*
   * `active` is what the reader chose. `idle` is what the loop is showing
   * because nobody has chosen anything. They are separate so that the idle
   * cycle can never overwrite a reader's selection, and so that the moment a
   * reader touches anything the idle cycle stops mattering rather than having
   * to be cancelled.
   */
  const [active, setActive] = useState<string | null>(null);
  const [idle, setIdle] = useState<string | null>(null);
  const shownId = active ?? idle;

  const ledger = useMemo(() => buildTechLedger(ALL_PROJECTS), []);
  const chart = useMemo(() => {
    const order = ALL_PROJECTS.map((p) => p.id);
    const maxScore = ledger.rows.reduce((m, r) => Math.max(m, r.score), 0);
    return buildChart(ledger.rows, maxScore, order);
  }, [ledger]);

  const projects = chart.lines;

  /* Everything the loop reads. Refs, so the loop is built once. */
  const activeRef = useRef<string | null>(null);
  activeRef.current = shownId;
  const chartRef = useRef(chart);
  chartRef.current = chart;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  /** Set by the loop so the hover handler can hit-test without re-projecting. */
  const screenRef = useRef<Float32Array>(new Float32Array(0));

  const onCardEnter = useCallback((id: string) => {
    setActive(id);
    setIdle(null);
  }, []);
  const onCardLeave = useCallback((id: string) => {
    setActive((a) => (a === id ? null : a));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const rail = railRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let W = 0;
    let H = 0;
    let R = 1;
    let cx = 0;
    let cy = 0;
    let theta = 0;
    let spin = SPIN;
    let dragging = false;
    let lastPointerX = 0;
    let railX = 0;
    let railSpan = 1;
    let raf = 0;
    let running = false;
    let visible = true;
    let last = 0;
    let idleClock = 0;
    let idleIdx = -1;
    let hovered: number = -1;

    /* Palette, resolved once per repaint rather than per star. */
    let C = { ink: '#17140F', ink3: '#635B4E', verm: '#B5402F', blue: '#2A4C7D', mono: 'monospace' };
    function readTokens() {
      const st = getComputedStyle(canvas!);
      C = {
        ink: token(st, '--ink', '#17140F'),
        ink3: token(st, '--ink-3', '#635B4E'),
        verm: token(st, '--verm', '#B5402F'),
        blue: token(st, '--blue', '#2A4C7D'),
        mono: token(st, '--f-mono', 'ui-monospace, monospace')
      };
    }

    function resize() {
      const r = canvas!.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2;
      cy = H / 2;
      /* Sized off the SHORT edge so the sphere is never clipped, and pulled in
         far enough that a label on a rim star still has somewhere to go. */
      R = Math.min(W, H) * 0.33;
      const n = chartRef.current.stars.length;
      if (screenRef.current.length !== n * 4) screenRef.current = new Float32Array(n * 4);
      if (rail) railSpan = rail.scrollWidth / 2 || 1;
    }

    /** Project one unit vector. Writes sx, sy, scale, depth into `screen`. */
    function project(sx: number, sy: number, sz: number, out: Float32Array, o: number) {
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const rx = sx * c + sz * s;
      const rz = -sx * s + sz * c;
      const ct = Math.cos(TILT);
      const st = Math.sin(TILT);
      const ry = sy * ct - rz * st;
      const rzz = sy * st + rz * ct;
      const k = CAM / (CAM - rzz);
      out[o] = cx + rx * R * k;
      out[o + 1] = cy + ry * R * k;
      out[o + 2] = k;
      out[o + 3] = rzz; // -1 far, +1 near
    }

    function draw() {
      const { stars, lines } = chartRef.current;
      const scr = screenRef.current;
      ctx!.clearRect(0, 0, W, H);

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        project(s.x, s.y, s.z, scr, i * 4);
      }

      const act = activeRef.current;

      /* --- constellation lines, behind the stars --- */
      for (const c of lines) {
        const on = act === c.id;
        if (act && !on) continue;
        ctx!.lineWidth = on ? 1.5 : 0.7;
        for (let k = 0; k < c.chain.length - 1; k++) {
          const a = c.chain[k] * 4;
          const b = c.chain[k + 1] * 4;
          /* Depth of the midpoint, so a line running round the back fades
             even when both of its ends happen to be near the rim. */
          const d = (scr[a + 3] + scr[b + 3]) * 0.5;
          const near = 0.5 + 0.5 * d;
          ctx!.strokeStyle = on
            ? withAlpha(C.verm, 0.3 + 0.6 * near)
            : withAlpha(C.ink, 0.13 + 0.32 * near);
          ctx!.beginPath();
          ctx!.moveTo(scr[a], scr[a + 1]);
          ctx!.lineTo(scr[b], scr[b + 1]);
          ctx!.stroke();
        }
      }

      /* --- stars, back to front so near ones sit over far ones --- */
      const order: number[] = [];
      for (let i = 0; i < stars.length; i++) order.push(i);
      order.sort((a, b) => scr[a * 4 + 3] - scr[b * 4 + 3]);

      for (const i of order) {
        const s = stars[i];
        const o = i * 4;
        const near = 0.5 + 0.5 * scr[o + 3];
        const on = !act || s.projects.includes(act);
        const r = (1.1 + s.mag * 3.9) * scr[o + 2] * (i === hovered ? 1.9 : 1);
        const base = 0.2 + 0.62 * near;
        const a = on ? base * (0.5 + 0.5 * s.mag) + (i === hovered ? 0.35 : 0) : base * 0.13;
        const col = i === hovered || (act && on) ? C.verm : s.era === 0 ? C.ink : s.era === 1 ? C.ink3 : C.blue;
        ctx!.fillStyle = withAlpha(col, Math.min(1, a));
        ctx!.beginPath();
        ctx!.arc(scr[o], scr[o + 1], Math.max(0.6, r), 0, Math.PI * 2);
        ctx!.fill();
      }

      /* --- labels: front hemisphere only, and only stars that earn one --- */
      ctx!.font = `500 11.5px ${C.mono}`;
      ctx!.textBaseline = 'middle';
      for (const i of order) {
        const s = stars[i];
        const o = i * 4;
        if (scr[o + 3] < 0.06) continue; // behind the sphere: no label
        const on = !act || s.projects.includes(act);
        if (act && !on) continue;
        if (!act && i !== hovered && s.mag < 0.42) continue;
        const near = 0.5 + 0.5 * scr[o + 3];
        const r = (1.1 + s.mag * 3.9) * scr[o + 2];
        const left = scr[o] > cx;
        ctx!.textAlign = left ? 'right' : 'left';
        ctx!.fillStyle = withAlpha(
          i === hovered || act ? C.ink : C.ink,
          i === hovered ? 1 : (act ? 0.9 : 0.3 + 0.5 * s.mag) * near
        );
        ctx!.fillText(s.label, scr[o] + (left ? -(r + 6) : r + 6), scr[o + 1]);
      }
    }

    /** `#RRGGBB` or an rgb() string, plus alpha. */
    function withAlpha(col: string, alpha: number): string {
      const a = Math.max(0, Math.min(1, alpha));
      if (col.charCodeAt(0) === 35) {
        let h = col.slice(1);
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        const n = parseInt(h, 16);
        if (!Number.isFinite(n)) return `rgba(23,20,15,${a})`;
        return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
      }
      const m = col.match(/[\d.]+/g);
      if (!m || m.length < 3) return `rgba(23,20,15,${a})`;
      return `rgba(${m[0]},${m[1]},${m[2]},${a})`;
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dt = last === 0 ? 0.016 : Math.min(0.05, (now - last) / 1000);
      last = now;

      if (!dragging) {
        /* Eased back to the resting rate, so a flick decays into the drift
           rather than stopping dead or spinning forever. */
        spin += (SPIN - spin) * Math.min(1, dt * 1.6);
      }
      theta += spin * dt;

      /* the carousel */
      if (rail && railSpan > 0) {
        railX -= CAROUSEL * dt;
        /* One list is rendered twice; wrapping at exactly one copy's width is
           what makes it perpetual with no seam and no reflow. */
        if (railX <= -railSpan) railX += railSpan;
        rail.style.transform = `translate3d(${railX}px,0,0)`;
      }

      /* the idle cycle */
      idleClock += dt * 1000;
      if (!activeIsReaders()) {
        if (idleClock > IDLE_EVERY) {
          idleClock = 0;
          const p = projectsRef.current;
          if (p.length) {
            idleIdx = pickVisibleCard();
            setIdle(p[idleIdx]?.id ?? null);
          }
        } else if (idleClock > IDLE_HOLD && idleIdx >= 0) {
          idleIdx = -1;
          setIdle(null);
        }
      } else {
        idleClock = 0;
      }

      draw();
    }

    /** True while the reader is driving. The idle cycle stands down. */
    function activeIsReaders(): boolean {
      return dragging || hovered >= 0 || readerPickRef.current !== null;
    }

    /**
     * Which card to light.
     *
     * Jack asked for "a project card (that is displayed)", and on a rail that
     * is perpetually moving that is a real constraint rather than a detail:
     * lighting a card that is currently off the left-hand end means the
     * constellation flares on the globe and the reader has nothing to connect
     * it to. So it picks from the cards whose centres are actually inside the
     * visible strip, and falls back to the head of the list only if the rail
     * has not been measured yet.
     */
    function pickVisibleCard(): number {
      const p = projectsRef.current;
      if (!rail || !p.length) return 0;
      const stripW = wrap!.clientWidth || W;
      const cards = rail.children;
      const inView: number[] = [];
      for (let i = 0; i < cards.length && i < p.length; i++) {
        const el = cards[i] as HTMLElement;
        const c = el.offsetLeft + el.offsetWidth / 2 + railX;
        if (c > 16 && c < stripW - 16) inView.push(i);
      }
      if (!inView.length) return (idleIdx + 1) % p.length;
      /* Step forward through what is on screen rather than picking at random,
         so the cycle reads as a sweep and never lights the same card twice
         in a row while three others were also available. */
      for (const i of inView) if (i > idleIdx) return i;
      return inView[0];
    }

    const readerPickRef = { current: null as string | null };

    function start() {
      if (running || reduced) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    }
    function sync() {
      if (visible && !document.hidden) start();
      else stop();
    }

    /* --- pointer: drag to spin, hover to inspect a star --- */
    function onDown(e: PointerEvent) {
      dragging = true;
      lastPointerX = e.clientX;
      canvas!.setPointerCapture(e.pointerId);
    }
    function onMove(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect();
      if (dragging) {
        const dx = e.clientX - lastPointerX;
        lastPointerX = e.clientX;
        /* A drag sets the RATE, not the angle. Letting go therefore keeps the
           momentum and eases back to the drift, which is what makes it feel
           like a physical globe rather than a slider. */
        spin = Math.max(-3.4, Math.min(3.4, dx * 0.055 / Math.max(0.001, 0.016)));
        theta += dx * 0.0055;
        return;
      }
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const scr = screenRef.current;
      const stars = chartRef.current.stars;
      let best = -1;
      let bestD = 17 * 17;
      for (let i = 0; i < stars.length; i++) {
        const o = i * 4;
        if (scr[o + 3] < 0) continue; // only the front hemisphere is clickable
        const dx = scr[o] - mx;
        const dy = scr[o + 1] - my;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best !== hovered) {
        hovered = best;
        canvas!.style.cursor = best >= 0 ? 'pointer' : 'grab';
        /* Hovering a star lights the project it belongs to most: the first
           source is the most recent one the ledger recorded. */
        const s = best >= 0 ? stars[best] : null;
        readerPickRef.current = s?.projects[0] ?? null;
        setIdle(null);
        setActive(s?.projects[0] ?? null);
      }
    }
    function onUp(e: PointerEvent) {
      dragging = false;
      try {
        canvas!.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released; nothing to do */
      }
    }
    function onLeave() {
      dragging = false;
      if (hovered >= 0) {
        hovered = -1;
        readerPickRef.current = null;
        setActive(null);
      }
    }

    readTokens();
    resize();
    draw();

    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointerleave', onLeave);

    const ro = new ResizeObserver(() => {
      resize();
      draw();
    });
    ro.observe(canvas);
    if (rail) ro.observe(rail);

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        sync();
      },
      { threshold: 0.01 }
    );
    io.observe(canvas);

    const onVis = () => sync();
    document.addEventListener('visibilitychange', onVis);

    /* The palette moves under us as the reader crosses plates. One repaint on
       the transition's far side is enough; nothing here reads tokens per frame. */
    const mo = new MutationObserver(() => {
      readTokens();
      if (!running) draw();
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-v2-palette', 'data-v2-mode']
    });

    if (reduced) draw();
    else sync();

    if (process.env.NODE_ENV !== 'production') {
      (canvas as unknown as Record<string, unknown>).__const = {
        frames: (n = 1) => {
          resize();
          for (let i = 0; i < n; i++) frame(i * 16.667);
          cancelAnimationFrame(raf);
          raf = 0;
        },
        stars: () => chartRef.current.stars.length,
        lines: () => chartRef.current.lines.length
      };
    }

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div className={`v2-const${className ? ' ' + className : ''}`}>
      <div className="v2-const-sky" style={{ height }} data-perch ref={wrapRef}>
        <canvas ref={canvasRef} aria-hidden="true" />
        <p className="v2-const-key" aria-hidden="true">
          {ledger.rows.length} technologies · {projects.length} projects ·
          brightness is recency-weighted use · a line joins what was used
          together · drag to turn it
        </p>
      </div>

      {/*
        The rail. One list, rendered twice, translated by the loop and wrapped
        at exactly one copy's width: that is what makes it perpetual with no
        seam and without ever adding or removing a node.

        The SECOND copy is aria-hidden and not focusable. It is the same
        projects again, and a keyboard reader tabbing through twenty-eight
        cards to find fourteen projects would be paying for a visual trick.
      */}
      {/*
        data-perch. Jack, 2026-08-26, of plate 02: "pip can't land on the
        projects carousel."

        The perch is the RAIL, not a card. The rail's top edge is a real
        hairline and it never moves; the cards inside it translate every frame
        forever, and the perch harvester re-measures on a resize or a
        transition ending rather than per frame, so a card would hand him a
        surface that had already slid out from under him. Standing on the rail
        while the projects run past underneath is also the better picture.

        The 1px border-top IS the line, so no inset. See THE PERCH CONTRACT in
        components/v2/Companion.tsx.
      */}
      <div className="v2-const-rail" aria-label="Projects" id={listId} data-perch>
        <div className="v2-const-rail-in" ref={railRef}>
          {projects.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`v2-const-card${shownId === c.id ? ' is-on' : ''}`}
              aria-pressed={shownId === c.id}
              onPointerEnter={() => onCardEnter(c.id)}
              onPointerLeave={() => onCardLeave(c.id)}
              onFocus={() => onCardEnter(c.id)}
              onBlur={() => onCardLeave(c.id)}
              onClick={() => setActive((a) => (a === c.id ? null : c.id))}
            >
              <b>{c.title}</b>
              <i>{c.count}</i>
            </button>
          ))}
          {projects.map((c) => (
            <span
              key={`${c.id}-echo`}
              className={`v2-const-card is-echo${shownId === c.id ? ' is-on' : ''}`}
              aria-hidden="true"
            >
              <b>{c.title}</b>
              <i>{c.count}</i>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
