/* ============================================================================
   Extract the country outlines the hitchhike map needs, once, at build time.

   Jack, 2026-08-26: "The map needs the country lines."

   He is right that a route floating on an empty sheet is not a map. The old
   HitchhikeMap solved this by shipping d3-geo, topojson-client and the whole
   world atlas to the browser and projecting it live, which is a lot of runtime
   for a picture that never changes.

   This does the work here instead. It reads the SAME real data — Natural Earth
   via world-atlas, which is already a dependency — clips it to the route's
   neighbourhood, simplifies it, and writes a small array of rings in plain
   [lon, lat]. RouteMap then projects those with the Mercator it already has.
   No map library reaches the browser and the geography is still real, which
   matters on a page whose whole argument is that its figures are traceable.

   SIMPLIFICATION is Ramer-Douglas-Peucker in DEGREES, not pixels. That is the
   right space for it: the plate is a fixed projection at a fixed size, so a
   tolerance chosen here holds at every viewport, and a ring simplified in
   pixel space would have to be rebuilt whenever the plate resized.

   Run:  node scripts/build-route-countries.js
   Out:  lib/v2/route-countries.json
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const topo = require('world-atlas/countries-110m.json');
const { feature } = require('topojson-client');

/* The route runs Split (16.4E, 43.5N) to Tagounite (-5.6W, 30.0N). The window
   is that box with enough margin to carry the coastlines either side of it,
   so the sheet reads as the western Mediterranean rather than as a crop. */
const WEST = -13;
const EAST = 22;
const SOUTH = 25;
const NORTH = 52;

/** Rings shorter than this in degrees are dropped: islets, not coastline. */
const MIN_SPAN = 0.9;

/** RDP tolerance in degrees. About 25km at this latitude. */
const TOL = 0.16;

function rdp(pts, tol) {
  if (pts.length < 3) return pts;
  let maxD = 0;
  let idx = 0;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    /* perpendicular distance to the chord */
    const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return rdp(pts.slice(0, idx + 1), tol)
    .slice(0, -1)
    .concat(rdp(pts.slice(idx), tol));
}

/*
 * RDP on a CLOSED ring, which the plain algorithm cannot do.
 *
 * Ramer-Douglas-Peucker measures every point against the chord from the first
 * to the last. On a ring those are the SAME POINT, so the chord has zero
 * length, the perpendicular-distance formula degenerates to a constant, and
 * the whole ring collapses to two points. That is exactly what happened on the
 * first run of this script: 1151 points in, 68 out, and not one usable
 * coastline.
 *
 * The standard fix, and the one used here: cut the ring at the point furthest
 * from its start, simplify the two open halves, and rejoin.
 */
function rdpRing(ring, tol) {
  const pts = ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring.slice();
  if (pts.length < 4) return ring;
  let far = 0;
  let fd = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const a = rdp(pts.slice(0, far + 1), tol);
  const b = rdp(pts.concat([pts[0]]).slice(far), tol);
  const joined = a.slice(0, -1).concat(b);
  return joined;
}

function ringsOf(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return geom.coordinates;
  if (geom.type === 'MultiPolygon') return geom.coordinates.flat();
  return [];
}

const fc = feature(topo, topo.objects.countries);
const out = [];
let kept = 0;
let dropped = 0;
let before = 0;
let after = 0;

for (const f of fc.features) {
  for (const ring of ringsOf(f.geometry)) {
    /* Keep a ring if ANY of it is in the window. Clipping to the box would
       leave straight cuts along the frame edges that read as borders; the
       plate crops with a canvas clip instead, so the ring stays whole. */
    let touches = false;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of ring) {
      if (x >= WEST && x <= EAST && y >= SOUTH && y <= NORTH) touches = true;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (!touches) continue;
    if (Math.max(maxX - minX, maxY - minY) < MIN_SPAN) {
      dropped++;
      continue;
    }
    before += ring.length;
    const simp = rdpRing(ring, TOL);
    after += simp.length;
    if (simp.length < 3) continue;
    kept++;
    /* Two decimals is about a kilometre here, which is far finer than a
       hairline on a plate this size, and it halves the file. */
    out.push(simp.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]));
  }
}

const target = path.join(__dirname, '..', 'lib', 'v2', 'route-countries.json');
const payload = {
  note:
    'Generated by scripts/build-route-countries.js from world-atlas countries-110m (Natural Earth). Rings of [lon, lat], simplified with RDP at 0.16 degrees. Do not hand-edit: re-run the script.',
  window: { west: WEST, east: EAST, south: SOUTH, north: NORTH },
  rings: out
};
fs.writeFileSync(target, JSON.stringify(payload));
console.log(
  `rings ${kept} kept, ${dropped} islets dropped; points ${before} -> ${after}` +
    ` (${(100 * (1 - after / before)).toFixed(1)}% off); ` +
    `${(fs.statSync(target).size / 1024).toFixed(1)} kB`
);
