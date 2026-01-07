"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { geoMercator, geoPath, GeoProjection } from "d3-geo";
import { feature, mesh } from "topojson-client";
import type { Topology, Objects } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";
import countries110 from "world-atlas/countries-110m.json"

// Focus region: Western/Northern Europe + North Africa
const BOUNDS = { minLon: -9, maxLon: 20, minLat: 23, maxLat: 52 };

export type Reel = {
  url: string;
  thumbnail: string;
  title?: string;
};

export type Stop = {
  name: string;
  country?: string;
  lat: number;
  lon: number;
  reels?: (string | Reel)[]; // Support both old string format and new object format
};

export interface HitchhikeMapProps {
  title?: string;
  subtitle?: string;
  stops?: Stop[];
}

// Default route: Croatia → Austria → Switzerland → France → Spain → Morocco
const DEFAULT_STOPS: Stop[] = [
  { name: "Zagreb", country: "Croatia", lat: 45.815, lon: 15.982, reels: [] },
  { name: "Vienna", country: "Austria", lat: 48.208, lon: 16.373, reels: [] },
  { name: "Zurich", country: "Switzerland", lat: 47.3769, lon: 8.5417, reels: [] },
  { name: "Lyon", country: "France", lat: 45.764, lon: 4.8357, reels: [] },
  { name: "Barcelona", country: "Spain", lat: 41.3851, lon: 2.1734, reels: [] },
  { name: "Tangier", country: "Morocco", lat: 35.7595, lon: -5.834, reels: [] },
];

function project(lat: number, lon: number, width: number, height: number) {
  const x = ((lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon)) * width;
  const y = (1 - (lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * height;
  return { x, y };
}

function buildSmoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return "";
  // Simple Catmull-Rom to Bezier conversion for a smooth path
  // Edge cases handled by repeating endpoints
  const p = points;
  const d: string[] = [];
  d.push(`M ${p[0].x.toFixed(2)} ${p[0].y.toFixed(2)}`);
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] || p[i + 1];
    // Tension
    const t = 0.2;
    const cp1x = p1.x + (p2.x - p0.x) * t;
    const cp1y = p1.y + (p2.y - p0.y) * t;
    const cp2x = p2.x - (p3.x - p1.x) * t;
    const cp2y = p2.y - (p3.y - p1.y) * t;
    d.push(`C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`);
  }
  return d.join(" ");
}

export default function HitchhikeMap({
  title: titleProp,
  subtitle: subtitleProp,
  stops: stopsProp,
}: HitchhikeMapProps) {
  const width = 1200;
  const height = 700;
  const [hovered, setHovered] = useState<number | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [svgSize, setSvgSize] = useState<{ width: number; height: number }>({ width, height });
  const [ctxTitle, setCtxTitle] = useState<string | undefined>(titleProp);
  const [ctxSubtitle, setCtxSubtitle] = useState<string | undefined>(subtitleProp);
  const [ctxStops, setCtxStops] = useState<Stop[] | undefined>(stopsProp);
  const borders = useMemo(() => {
    const topo = countries110 as unknown as Topology;
    const obj = (topo.objects as any).countries;
    return mesh(topo, obj, (a: any, b: any) => a !== b);
  }, []);

  // Load route from public/context.json if not provided via props
  useEffect(() => {
    let cancelled = false;
    if (stopsProp && titleProp && subtitleProp) return; // already provided
    (async () => {
      try {
        const r = await fetch('/context.json', { cache: 'no-store' });
        if (!r.ok) throw new Error('Failed to load context');
        const data = await r.json();
        if (cancelled) return;
        const route = data.hitchhikeRoute;
        if (route) {
          setCtxTitle(route.title);
          setCtxSubtitle(route.subtitle);
          setCtxStops(route.stops as Stop[]);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [stopsProp, titleProp, subtitleProp]);

  // Track SVG pixel size for accurate tooltip positioning
  useEffect(() => {
    function measure() {
      if (!svgRef.current) return;
      const r = svgRef.current.getBoundingClientRect();
      setSvgSize({ width: r.width, height: r.height });
    }
    measure();
    let ro: ResizeObserver | null = null;
    const RZ = (window as any).ResizeObserver;
    if (RZ) {
      ro = new RZ(measure);
      if (svgRef.current && ro) ro.observe(svgRef.current);
    }
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
  if (ro && svgRef.current) ro.unobserve(svgRef.current);
    };
  }, []);

  // Build projection focused on our bounds
  const projection: GeoProjection = useMemo(() => {
    const proj = geoMercator()
      .center([(BOUNDS.minLon + BOUNDS.maxLon) / 2, (BOUNDS.minLat + BOUNDS.maxLat) / 2])
      .translate([width / 2, height / 2])
      .scale(1);

    // Fit the specified bounds into the viewport
    const topLeft = proj([BOUNDS.minLon, BOUNDS.maxLat])!;
    const bottomRight = proj([BOUNDS.maxLon, BOUNDS.minLat])!;
    const currentWidth = Math.abs(bottomRight[0] - topLeft[0]);
    const currentHeight = Math.abs(bottomRight[1] - topLeft[1]);
    const scale = 0.95 * Math.min(width / currentWidth, height / currentHeight);
    return proj.scale((proj.scale() as number) * scale);
  }, []);

  // Convert topojson to GeoJSON features (land)
  const land = useMemo(() => {
    const topo = land110 as unknown as Topology;
    const objects = topo.objects as Objects<any>;
    const landObj = (objects as any).land || (objects as any).countries;
    return feature(topo, landObj);
  }, []);

  const geo = useMemo(() => geoPath(projection), [projection]);

  const stops = ctxStops || stopsProp || DEFAULT_STOPS;
  const title = ctxTitle || titleProp || "Hitchhiking Route — Summer 2025";
  const subtitle = ctxSubtitle || subtitleProp || "Croatia → Austria → Switzerland → France → Spain → Morocco";

  const points = useMemo(() => {
    return stops.map((s: Stop) => {
      const p = projection([s.lon, s.lat]);
      return { x: p ? p[0] : 0, y: p ? p[1] : 0 };
    });
  }, [stops, projection]);

  const pathD = useMemo(() => buildSmoothPath(points), [points]);

  return (
    <section className="mt-16">
      <header className="mb-4 text-center">
  <h4 className="text-xl md:text-2xl font-semibold text-white tracking-tight">{title}</h4>
  <p className="text-xs md:text-sm text-white/60">{subtitle}</p>
      </header>
      <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0A0A0A]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Abstract map of Europe with hitchhiking route"
          className="block w-full h-auto"
          ref={svgRef}
        >
          <defs>
            <radialGradient id="glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
            <linearGradient id="route" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#ffffff" stopOpacity={0.55} />
            </linearGradient>
            <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <marker id="dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6">
              <circle cx="5" cy="5" r="3" fill="#fff" />
            </marker>
          </defs>

          {/* Vignette */}
          <rect width={width} height={height} fill="#0A0A0A" />
          <rect width={width} height={height} fill="url(#glow)" opacity={0.15} />

          {/* Land silhouette (exact, projected) */}
          <g>
            {Array.isArray((land as any).features) && (land as any).features.map((f: any, i: number) => (
              <path
                key={i}
                d={geo(f) || ''}
                fill="rgba(255,255,255,0.03)"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={0.5}
              />
            ))}
          </g>

          {/* Country borders (subtle) */}
          <path
            d={geo(borders as any) || ""}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={0.5}
          />

          {/* Route path */}
          <path
            d={pathD}
            fill="none"
            stroke="url(#route)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: "url(#softGlow)" }}
          />

          {/* Stops (markers + labels) */}
          {points.map((pt, i) => (
            <g
              key={i}
              onMouseEnter={() => {
                if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                setHovered(i);
              }}
              onMouseLeave={() => {
                hoverTimeoutRef.current = setTimeout(() => {
                  setHovered((h) => (h === i ? null : h));
                }, 300);
              }}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered((h) => (h === i ? null : h))}
              tabIndex={0}
              style={{ cursor: "pointer" }}
            >
              <circle cx={pt.x} cy={pt.y} r={5} fill="#fff" />
              <circle cx={pt.x} cy={pt.y} r={14} fill="url(#glow)" opacity={0.25} />
            </g>
          ))}
        </svg>

        {/* Persistent hover popover: keep it interactive with pointer events */}
        {hovered !== null && (
          <div
            className="absolute z-20"
            style={{
              left: (points[hovered].x / width) * svgSize.width + 18,
              top: (points[hovered].y / height) * svgSize.height - 10,
            }}
            onMouseEnter={() => {
              if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
              setHovered(hovered);
            }}
            onMouseLeave={() => {
              hoverTimeoutRef.current = setTimeout(() => setHovered(null), 300);
            }}
          >
            <StopPopover stop={stops[hovered]} />
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-white/50">
        Documented on Instagram: <a className="underline decoration-dotted hover:text-white" href="https://www.instagram.com/5001km.sidequest" target="_blank" rel="noreferrer">@5001km.sidequest</a>
      </p>


    </section>
  );
}


// Simple thumbnail component for hover popups
function ReelThumbnail({ reel }: { reel: string | Reel }) {
  if (typeof reel === 'string') {
    // Fallback for old string format - show placeholder
    return (
      <a href={reel} target="_blank" rel="noreferrer" className="block aspect-[9/16] bg-black/40 rounded-lg border border-white/10 overflow-hidden group">
        <div className="w-full h-full grid place-items-center text-white/50 text-xs hover:text-white/70 transition-colors">
          <div className="text-center">
            <div className="text-lg mb-1">📷</div>
            <div>Reel</div>
          </div>
        </div>
      </a>
    );
  }

  return (
    <a
      href={reel.url}
      target="_blank"
      rel="noreferrer"
      className="block aspect-[9/16] max-w-[82px] bg-black/40 rounded-md border border-white/10 overflow-hidden group"
    >
      <div className="relative w-full h-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={reel.thumbnail}
          alt={reel.title || 'Instagram reel'}
          className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const parent = target.parentElement;
            if (parent) {
              parent.innerHTML = `
                <div class="w-full h-full grid place-items-center text-white/50 text-xs">
                  <div class="text-center">
                    <div class="text-lg mb-1">📷</div>
                    <div>Reel</div>
                  </div>
                </div>
              `;
            }
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-1 left-1 right-1">
          <div className="text-white text-[9px] font-medium truncate">{reel.title}</div>
        </div>
        {/* Play button overlay */}
        <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-6 h-6 bg-white/20 backdrop-blur-sm rounded-full grid place-items-center">
            <div className="w-0 h-0 border-l-[5px] border-l-white border-y-[3px] border-y-transparent ml-0.5"></div>
          </div>
        </div>
      </div>
    </a>
  );
}

// Persistent popover content with mini preview grid
function StopPopover({ stop }: { stop: Stop }) {
  const reelCount = stop.reels?.length || 0;
  
  return (
    <div className="pointer-events-auto w-fit max-w-sm rounded-lg border border-white/10 bg-black/70 backdrop-blur-md p-3 shadow-xl">
      <div className="text-white text-sm font-semibold">
        {stop.name}{stop.country ? <span className="text-white/60 font-normal"> — {stop.country}</span> : null}
      </div>
      {Array.isArray(stop.reels) && stop.reels.length > 0 ? (
        reelCount === 1 ? (
          // Single reel - center it
          <div className="mt-2 flex justify-center">
            <ReelThumbnail reel={stop.reels[0]} />
          </div>
        ) : reelCount === 2 ? (
          // Two reels - grid
          <div className="mt-2 grid grid-cols-2 gap-2">
            {stop.reels.map((reel, idx) => (
              <ReelThumbnail key={idx} reel={reel} />
            ))}
          </div>
        ) : (
          // 3+ reels - horizontal scroll
          <div className="mt-2 flex gap-2 overflow-x-auto max-w-[280px] pb-1 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
            {stop.reels.map((reel, idx) => (
              <div key={idx} className="flex-shrink-0">
                <ReelThumbnail reel={reel} />
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="mt-2 text-white/60 text-xs">Add reel URLs for this stop to show previews.</div>
      )}
    </div>
  );
}
