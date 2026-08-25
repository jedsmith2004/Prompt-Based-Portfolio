'use client';

/* ============================================================================
   SkillConstellation — the technologies as a star chart.

   Jack, 2026-08-25: "The 100 technologies should be displayed in a more
   creative way, like the current portfolio but even more creative if you can
   think of it."

   The live site has a frequency-sized cloud clustered by category. The v2
   replacement, SkillsFromWork, went the other way and made a ledger: rigorous,
   countable, and not remotely more creative than a cloud. This is the answer to
   what he actually asked for.

   WHY A CONSTELLATION AND NOT A PRETTIER CLOUD. A cloud encodes exactly one
   number per technology, its frequency, and encodes it badly — you get an
   impression of size and no way to check it. A star chart encodes three things
   at once and one of them is genuinely new:

     magnitude   how much the technology carries, scored by recency-weighted
                 use, exactly the score the ledger computes
     colour      the era it was last used in
     LINES       WHICH TECHNOLOGIES WERE USED TOGETHER

   That last one is the point. A cloud can tell you he has used gRPC and Unity.
   Only a chart can show you that they are joined, because they are the same
   project. Every project becomes a named constellation, and the technologies
   two projects share are the stars where two constellations cross. That is a
   real fact about the work, it is not derivable from a cloud, and it is the
   kind of thing this site is supposed to do: demonstrate rather than claim.

   IT ALSO BELONGS HERE. The page already has a navigator's plate for a
   backdrop and a section about crossing six countries by thumb. A sky is not a
   decoration bolted on; it is the same idea as the rest of the page.

   MECHANICS. Deterministic layout, computed once per size: seeded placement
   into per-project sectors, then a fixed number of relaxation passes to stop
   stars overlapping. There is NO physics loop at runtime. The canvas repaints
   on resize and on selection and at no other time, so this costs nothing at
   rest — which matters on a page that already runs the ink field, the
   companion, a world and the reel.

   Constellation lines are a CHAIN through each project's stars sorted by
   angle, not a clique. A clique is n(n-1)/2 lines and looks like a hairball at
   fifteen technologies; a chain is n-1 and looks like a constellation.

   Every fact is derived from `buildTechLedger`, which reads the `tech` arrays
   in lib/projects-data.ts. Nothing here is hand-maintained.
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
  /** Unit-square position, 0..1. Scaled to the canvas at paint time. */
  x: number;
  y: number;
}

interface Constellation {
  id: string;
  title: string;
  /** Star indices, ordered into a chain. */
  chain: number[];
  /** Label anchor, unit square. */
  cx: number;
  cy: number;
  count: number;
}

interface Chart {
  stars: Star[];
  lines: Constellation[];
}

/**
 * Place every technology once, in the average direction of the projects that
 * use it, at a radius set by how much it carries.
 *
 * Shared technologies therefore drift toward the middle and sit BETWEEN the
 * projects that share them, which is what makes two constellations visibly
 * cross at a real star rather than at an arbitrary one.
 */
function buildChart(rows: TechRow[], maxScore: number, projectOrder: string[]): Chart {
  const rand = mulberry32(0x5eed);
  const sector = new Map<string, number>();
  projectOrder.forEach((id, i) => {
    sector.set(id, (i / Math.max(1, projectOrder.length)) * Math.PI * 2);
  });

  const stars: Star[] = rows.map((r) => {
    /* mean direction over the projects that use it, as a vector sum so that
       two opposite sectors cancel to the centre instead of averaging to a
       meaningless angle halfway round the circle */
    let vx = 0;
    let vy = 0;
    for (const s of r.sources) {
      const a = sector.get(s.projectId);
      if (a === undefined) continue;
      vx += Math.cos(a);
      vy += Math.sin(a);
    }
    const len = Math.hypot(vx, vy);
    const mag = Math.min(1, r.score / (maxScore || 1));
    /* Shared technologies have a short resultant and land near the middle.
       A technology used once has a resultant of 1 and sits out at the rim. */
    const pull = len / Math.max(1, r.sources.length);
    /*
     * Normalised 0..1 FIRST, then scaled into the box.
     *
     * The first version computed a radius in the 0.10..0.54 range and then
     * multiplied the x component by the 1.62 aspect ratio, which put stars at
     * x = 0.5 + 0.87 = 1.37 — far outside the plate. Everything past the wall
     * clamped, so a third of the sky ended up pinned in two vertical rails
     * down the edges with constellation lines running along them.
     *
     * RX and RY are half-extents, so nothing can leave the box by
     * construction and the clamp below is a backstop rather than the layout.
     */
    const rn = Math.min(1, 0.20 + 0.62 * pull + 0.10 * (1 - mag) + rand() * 0.08);
    const RX = 0.44;
    const RY = 0.40;
    const ang = len > 0.0001 ? Math.atan2(vy, vx) : rand() * Math.PI * 2;
    const jitter = (rand() - 0.5) * 0.34;
    return {
      key: r.key,
      label: r.label,
      mag,
      era: r.sources[0]?.era ?? 1,
      projects: r.sources.map((s) => s.projectId),
      x: 0.5 + Math.cos(ang + jitter) * rn * RX,
      y: 0.5 + Math.sin(ang + jitter) * rn * RY
    };
  });

  /* Relaxation. Fixed passes, no convergence test: this must take the same
     time and give the same answer every run. */
  const MIN = 0.046;
  for (let pass = 0; pass < 60; pass++) {
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const a = stars[i];
        const b = stars[j];
        const dx = (b.x - a.x) * 1.62;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= MIN || d === 0) continue;
        const push = (MIN - d) / 2 / d;
        a.x -= (dx * push) / 1.62;
        a.y -= dy * push;
        b.x += (dx * push) / 1.62;
        b.y += dy * push;
      }
    }
  }
  for (const s of stars) {
    s.x = Math.min(0.965, Math.max(0.035, s.x));
    s.y = Math.min(0.94, Math.max(0.06, s.y));
  }

  const byKey = new Map(stars.map((s, i) => [s.key, i]));
  const lines: Constellation[] = [];
  for (const id of projectOrder) {
    const idx = stars
      .map((s, i) => (s.projects.includes(id) ? i : -1))
      .filter((i) => i >= 0);
    if (idx.length < 2) continue;
    let cx = 0;
    let cy = 0;
    for (const i of idx) {
      cx += stars[i].x;
      cy += stars[i].y;
    }
    cx /= idx.length;
    cy /= idx.length;
    /* chain, ordered by angle about the group's own centroid */
    const chain = [...idx].sort(
      (a, b) =>
        Math.atan2(stars[a].y - cy, stars[a].x - cx) -
        Math.atan2(stars[b].y - cy, stars[b].x - cx)
    );
    const title = ALL_PROJECTS.find((p) => p.id === id)?.title ?? id;
    lines.push({ id, title, chain, cx, cy, count: idx.length });
  }
  void byKey;
  return { stars, lines };
}

/* -------------------------------------------------------------------------- */
/* component                                                                   */
/* -------------------------------------------------------------------------- */

export interface SkillConstellationProps {
  className?: string;
  height?: number;
}

export default function SkillConstellation({
  className,
  height = 460
}: SkillConstellationProps) {
  const listId = useId();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const ledger = useMemo(() => buildTechLedger(ALL_PROJECTS), []);

  /* Newest first, and only projects that actually declare technologies. */
  const projectOrder = useMemo(() => {
    const ids = new Set<string>();
    for (const r of ledger.rows) for (const s of r.sources) ids.add(s.projectId);
    return ALL_PROJECTS.filter((p) => ids.has(p.id)).map((p) => p.id);
  }, [ledger]);

  const chart = useMemo(
    () => buildChart(ledger.rows, ledger.maxScore, projectOrder),
    [ledger, projectOrder]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(rect.width);
    const H = Math.round(rect.height);
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const cs = getComputedStyle(canvas);
    const ink = cs.color || '#17140F';
    const accent = cs.getPropertyValue('--verm-text').trim() || '#9E3524';
    const cool = cs.getPropertyValue('--blue').trim() || '#2A4C7D';

    const px = (s: Star) => s.x * W;
    const py = (s: Star) => s.y * H;
    const dim = active ? 0.13 : 1;

    /* --- lines first, so stars sit on top of their own joins --- */
    ctx.lineCap = 'round';
    for (const c of chart.lines) {
      const on = active === c.id;
      ctx.globalAlpha = on ? 0.85 : 0.1 * dim + 0.06;
      ctx.strokeStyle = on ? accent : ink;
      ctx.lineWidth = on ? 1.25 : 0.7;
      ctx.beginPath();
      for (let i = 0; i < c.chain.length; i++) {
        const s = chart.stars[c.chain[i]];
        if (i === 0) ctx.moveTo(px(s), py(s));
        else ctx.lineTo(px(s), py(s));
      }
      /* close the loop: a constellation reads better as a shape than a path */
      const first = chart.stars[c.chain[0]];
      ctx.lineTo(px(first), py(first));
      ctx.stroke();
    }

    /* --- stars --- */
    ctx.globalAlpha = 1;
    for (const s of chart.stars) {
      const on = !active || s.projects.includes(active);
      const r = 1.4 + s.mag * 4.2;
      const a = on ? 0.42 + s.mag * 0.58 : 0.16;
      ctx.globalAlpha = a;
      ctx.fillStyle = s.era === 0 ? accent : s.era === 2 ? cool : ink;
      /* a four-point sparkle rather than a dot: a dot at this size is a
         speck of dust and a sparkle is unmistakably a star */
      const x = px(s);
      const y = py(s);
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r, y);
      ctx.quadraticCurveTo(x, y, x, y - r);
      ctx.fill();
    }

    /* --- labels, only for stars big enough to earn one --- */
    ctx.font =
      '500 11.5px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'middle';
    for (const s of chart.stars) {
      const on = !active || s.projects.includes(active);
      if (!on && active) continue;
      if (s.mag < 0.34 && !active) continue;
      const x = px(s);
      const y = py(s);
      const r = 1.4 + s.mag * 4.2;
      const left = x > W * 0.62;
      ctx.textAlign = left ? 'right' : 'left';
      ctx.globalAlpha = active ? 0.95 : 0.34 + s.mag * 0.5;
      ctx.fillStyle = ink;
      ctx.fillText(s.label, x + (left ? -(r + 5) : r + 5), y);
    }
    ctx.globalAlpha = 1;
  }, [chart, active]);

  useEffect(() => {
    draw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [draw]);

  const shown = chart.lines;

  return (
    <div className={`v2-const${className ? ' ' + className : ''}`}>
      <div className="v2-const-sky" style={{ height }} data-perch>
        <canvas ref={canvasRef} aria-hidden="true" />
        <p className="v2-const-key" aria-hidden="true">
          {ledger.rows.length} technologies · {shown.length} projects · brightness
          is recency-weighted use · a line joins what was used together
        </p>
      </div>

      {/* The chart is decoration. Everything it draws is real text here. */}
      <ol className="v2-const-list" id={listId}>
        {shown.map((c) => {
          const techs = chart.stars
            .filter((s) => s.projects.includes(c.id))
            .sort((a, b) => b.mag - a.mag)
            .map((s) => s.label);
          const on = active === c.id;
          return (
            <li key={c.id} className={on ? 'is-on' : undefined}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setActive(on ? null : c.id)}
                onPointerEnter={() => setActive(c.id)}
                onFocus={() => setActive(c.id)}
                onPointerLeave={() => setActive((a) => (a === c.id ? null : a))}
                onBlur={() => setActive((a) => (a === c.id ? null : a))}
              >
                <b>{c.title}</b>
                <i>{c.count}</i>
                <span>{techs.join(', ')}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
