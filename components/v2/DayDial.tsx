'use client';

/* ============================================================================
   DayDial — the sun goes down over the climbing plate.

   Jack, 2026-08-26: "a little animation in the top corner with the sun dipping
   beneath the horizon on the right and a moon coming up on the left in a
   circle, this should be a small and snappy animation, with it popping up,
   really quickly rotating, and going away. When you scroll backwards, the
   opposite animation plays."

   WHY THIS PLATE GETS ITS OWN DEVICE AND NOT THE LIGHT SWITCH.

   The other two mode changes are on plates about building things at a desk, so
   a switch on a wall is the honest object. This one is the plate about being
   outside on rock, and you do not flip a switch on a crag. Indoors you change
   the light. Outdoors you wait for it. That is the whole reason there are two
   devices instead of one being reused, and it is why `via` is a property of
   the plate in palettes.ts rather than a global setting.

   THE GEOMETRY.

   One disc carries both bodies and rotates. The horizon and the ground do NOT
   rotate: the ground is an opaque half-disc drawn OVER the bodies, so a body
   below the horizon is genuinely occluded rather than faded, and the sun
   really does go behind the world rather than dimming out.

   Angles are measured from the right-hand horizon, positive upwards, which is
   the convention that makes the copy above readable in the code:

     sun    starts  +50deg   upper right, an hour off setting
     moon   starts +200deg   lower left, still under the world

   Night falls by rotating -110deg, which is clockwise on screen. The sun
   crosses zero at 45% of the sweep and the moon crosses 180deg at 18%, so the
   moon has broken the left horizon before the sun has finished going down —
   which is what a real dusk looks like, and it means the dial is never empty.
   Dawn is the identical sweep with the sign flipped, so scrolling back up is
   the same object running backwards rather than a second animation to keep in
   step with the first.

   THE LIGHT CHANGES WHEN THE SUN CROSSES THE HORIZON, not when the animation
   ends. That is the only frame where the commit is not arbitrary.
   ========================================================================== */

import { useEffect, useRef } from 'react';
import type { PaletteMode } from '@/lib/v2/palettes';

const POP_MS = 170;
const SPIN_MS = 400;
const HOLD_MS = 170;
const EXIT_MS = 200;

/** Degrees of sweep, and where the two bodies sit on the disc. */
const SWEEP = 110;
const SUN_A = 50;
const MOON_A = 200;

/** Fraction of the sweep at which the sun is on the horizon. */
const CROSS = SUN_A / SWEEP;

export interface DayDialProps {
  /** The form we are moving to. 'dark' is dusk, 'light' is dawn. */
  to: PaletteMode;
  /** The sun is on the horizon: change the light now. */
  onCommit: () => void;
  /** Entirely over. */
  onDone: () => void;
}

/** Where a body sits, in the 100x100 user space of the SVG. */
function at(deg: number, r: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: 50 + Math.cos(a) * r, y: 50 - Math.sin(a) * r };
}

const ORBIT = 30;

export default function DayDial({ to, onCommit, onDone }: DayDialProps) {
  const commitCb = useRef(onCommit);
  commitCb.current = onCommit;
  const doneCb = useRef(onDone);
  doneCb.current = onDone;

  useEffect(() => {
    const timers = [
      window.setTimeout(() => commitCb.current(), POP_MS + SPIN_MS * CROSS),
      window.setTimeout(() => doneCb.current(), POP_MS + SPIN_MS + HOLD_MS + EXIT_MS),
    ];
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);

  const sun = at(SUN_A, ORBIT);
  const moon = at(MOON_A, ORBIT);

  /* Dusk sweeps clockwise from rest. Dawn starts at the end of that sweep and
     comes back, so the two are one animation read in either direction. */
  const from = to === 'dark' ? 0 : -SWEEP;
  const until = to === 'dark' ? -SWEEP : 0;

  return (
    <div
      className="v2-dial"
      data-to={to}
      aria-hidden="true"
      style={
        {
          '--pop': `${POP_MS}ms`,
          '--spin': `${SPIN_MS}ms`,
          '--hold': `${HOLD_MS}ms`,
          '--exit': `${EXIT_MS}ms`,
          '--from': `${from}deg`,
          '--until': `${until}deg`,
        } as React.CSSProperties
      }
    >
      <svg viewBox="0 0 100 100" className="v2-dial-svg">
        <defs>
          {/* Everything is confined to the badge. Without this the sun leaves
              the disc on its way down and hangs in the page. */}
          <clipPath id="v2-dial-clip">
            <circle cx="50" cy="50" r="46" />
          </clipPath>
          {/* The crescent is a real subtraction, not a glyph: a filled disc
              with a second disc knocked out of it, offset up and right. */}
          <mask id="v2-dial-moon">
            <rect x="0" y="0" width="100" height="100" fill="#000" />
            <circle cx="0" cy="0" r="8.5" fill="#fff" />
            <circle cx="3.6" cy="-3.2" r="7.6" fill="#000" />
          </mask>
        </defs>

        <g clipPath="url(#v2-dial-clip)">
          <circle cx="50" cy="50" r="46" className="v2-dial-face" />

          <g className="v2-dial-orbit">
            <g transform={`translate(${sun.x} ${sun.y})`}>
              <circle r="8" className="v2-dial-sun" />
              {/* Eight rays. Drawn as one path so the sun is one node. */}
              <path
                className="v2-dial-rays"
                d={Array.from({ length: 8 }, (_, i) => {
                  const a = (i * Math.PI) / 4;
                  const c = Math.cos(a);
                  const s = Math.sin(a);
                  return `M${c * 11} ${s * 11} L${c * 14.5} ${s * 14.5}`;
                }).join(' ')}
              />
            </g>
            <g transform={`translate(${moon.x} ${moon.y})`}>
              <rect
                x="-10"
                y="-10"
                width="20"
                height="20"
                className="v2-dial-moon"
                mask="url(#v2-dial-moon)"
              />
            </g>
          </g>

          {/* The world. Opaque, and drawn last, so it occludes rather than
              tints: the sun goes BEHIND it. */}
          <rect x="0" y="50" width="100" height="50" className="v2-dial-ground" />
          <line x1="0" y1="50" x2="100" y2="50" className="v2-dial-horizon" />
        </g>
        <circle cx="50" cy="50" r="46" className="v2-dial-rim" />
      </svg>
    </div>
  );
}
