'use client';

/* ============================================================================
   DayDial — the sun goes down over the climbing plate.

   Jack, 2026-08-26: "The sun to moon animation should be bigger, and just a
   line representing the horizon, a sun that quickly pops up, hangs for a
   second, then rotates around the middle of the horizon, disappearing
   underneath it as a moon pops up the other side, rotating 180 degrees out of
   phase, hangs for a second, then the whole thing disappears. Play with the
   animation speeds, with a little bit of overshoot as well."

   WHY THIS PLATE GETS ITS OWN DEVICE AND NOT THE LIGHT SWITCH.

   The other two mode changes are on plates about building things at a desk, so
   a switch on a wall is the honest object. This one is the plate about being
   outside on rock, and you do not flip a switch on a crag. Indoors you change
   the light. Outdoors you wait for it. That is the whole reason there are two
   devices instead of one being reused, and it is why `via` is a property of
   the plate in palettes.ts rather than a global setting.

   WHAT CHANGED, AND WHY IT IS SIMPLER RATHER THAN LARGER.

   It used to be a badge: a paper disc with a rim, a filled half-disc for the
   ground, and both bodies inside it. That gave the occlusion for free -- the
   ground was opaque and drawn last -- but it also made the whole thing a small
   illustrated coin in the corner, and the sun setting inside a coin is not the
   sun setting. There is now no disc, no ground and no rim. One rule across the
   top of the page IS the horizon, and the sky is a clip: everything below the
   line is simply not drawn, which is the same occlusion with nothing standing
   in for the world.

   THE GEOMETRY.

   One group carries both bodies and rotates about the MIDDLE OF THE LINE.
   Angles are measured from the right-hand end of the horizon, positive up:

     sun   +90deg   straight up, at the top of the arc
     moon  -90deg   straight down, under the world, 180deg out of phase

   Dusk rotates -180deg, which is clockwise on screen: the sun leaves through
   0deg, the right-hand horizon, and the moon arrives through 180deg, the left.
   Dawn is the identical sweep read backwards, which is also why its opening
   pose is the moon at the top rather than a second animation to keep in step.

   THE POP IS A SCALE ABOUT THE MIDDLE OF THE LINE, and that is the whole
   trick. Scaling the arc about a point that lies ON the horizon moves each
   body along its own radius, so growing the arc pushes the top body up out of
   the line and leaves the bottom one below it. One animation, and it reads
   exactly as "pops up" for whichever body happens to be up. The exit is the
   same scale run backwards, so the whole thing goes back into the line it
   came out of.

   NO KEYFRAME PERCENTAGES. The previous version encoded the phase boundaries
   twice -- four constants here and two percentages in the stylesheet -- with a
   comment warning that they were one number in two files. Every phase now
   lives on its own element with its own single-purpose animation, and every
   delay is a calc() over the same four custom properties. There is one place
   to change a duration.

   THE LIGHT CHANGES WHEN THE SUN CROSSES THE HORIZON, not when the animation
   ends. That is the only frame where the commit is not arbitrary. It is now
   about 1.4s in rather than 0.4s, because a hang was asked for and a hang has
   to be long enough to read as one; DEVICE_TIMEOUT in useMode.ts is 5200ms, so
   there is room, and the number below is what it costs.
   ========================================================================== */

import { useCallback, useEffect, useRef } from 'react';
import type { PaletteMode } from '@/lib/v2/palettes';

/** The horizon draws itself out from the middle. */
const LINE_MS = 170;
/** The arc grows out of the line, overshooting a little. */
const POP_MS = 260;
/** "hangs for a second". Twice, once per body. */
const HOLD_MS = 720;
/** Half a turn about the middle of the line. */
const SPIN_MS = 640;
/** Back into the line. Equal to line + pop, so the exchange is exactly centred. */
const EXIT_MS = LINE_MS + POP_MS;

const TOTAL_MS = LINE_MS + POP_MS + HOLD_MS + SPIN_MS + HOLD_MS + EXIT_MS;
const COMMIT_MS = TOTAL_MS / 2;

/**
 * Half a turn, and where the two bodies sit on it.
 *
 * The sweep is 180 rather than the old 110 because the bodies are now a real
 * half-turn apart: one is always up and one is always down, and the exchange
 * is the entire animation.
 */
const SWEEP = 180;
const SUN_A = 90;
const MOON_A = -90;

/* The plate, in the SVG's own user space. The horizon is the bottom edge of
   the sky; the arc's centre is the middle of it. */
const VIEW_W = 200;
const VIEW_H = 120;
const HORIZON_Y = 100;
const CENTRE_X = 100;
const ORBIT_R = 64;

export interface DayDialProps {
  /** The form we are moving to. 'dark' is dusk, 'light' is dawn. */
  to: PaletteMode;
  /** The sun is on the horizon: change the light now. */
  onCommit: () => void;
  /** Entirely over. */
  onDone: () => void;
}

/** Where a body sits, in the SVG's user space. */
function at(deg: number, r: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: CENTRE_X + Math.cos(a) * r, y: HORIZON_Y - Math.sin(a) * r };
}

export default function DayDial({ to, onCommit, onDone }: DayDialProps) {
  const commitCb = useRef(onCommit);
  commitCb.current = onCommit;
  const doneCb = useRef(onDone);
  doneCb.current = onDone;
  const committedRef = useRef(false);
  const commitNow = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    commitCb.current();
  }, []);

  useEffect(() => {
    const timers = [
      /* CSS owns the exact crossing frame below. This is only a watchdog for
         engines that suppress animation events. */
      window.setTimeout(commitNow, COMMIT_MS + 700),
      window.setTimeout(() => doneCb.current(), TOTAL_MS)
    ];
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [commitNow]);

  const sun = at(SUN_A, ORBIT_R);
  const moon = at(MOON_A, ORBIT_R);

  /* Dusk sweeps clockwise from rest. Dawn starts at the end of that sweep and
     comes back, so the two are one animation read in either direction — and
     dawn therefore opens with the moon up, which is what it should be. */
  const from = to === 'dark' ? 0 : -SWEEP;
  const until = to === 'dark' ? -SWEEP : 0;

  return (
    <div
      className="v2-dial"
      data-to={to}
      aria-hidden="true"
      style={
        {
          '--line': `${LINE_MS}ms`,
          '--pop': `${POP_MS}ms`,
          '--hold': `${HOLD_MS}ms`,
          '--spin': `${SPIN_MS}ms`,
          '--exit': `${EXIT_MS}ms`,
          '--commit': `${COMMIT_MS}ms`,
          '--from': `${from}deg`,
          '--until': `${until}deg`
        } as React.CSSProperties
      }
    >
      <i className="v2-dial-commit" onAnimationStart={commitNow} />
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="v2-dial-svg">
        <defs>
          {/* The sky. Everything below the horizon is not drawn, which is what
              makes a body SET rather than fade. Generous on three sides so a
              body at the top of the arc is never nipped. */}
          <clipPath id="v2-dial-sky">
            <rect x={-VIEW_W} y={-VIEW_H} width={VIEW_W * 3} height={VIEW_H + HORIZON_Y} />
          </clipPath>
          {/* The crescent is a real subtraction, not a glyph: a filled disc
              with a second disc knocked out of it, offset up and right. */}
          {/* Fatter than the badge's was. The old radii scaled up gave a
              sliver about twelve device pixels across at this size, which on a
              busy plate reads as a smudge rather than as a moon. */}
          <mask id="v2-dial-moon">
            <rect x="-22" y="-22" width="44" height="44" fill="#000" />
            <circle cx="0" cy="0" r="15" fill="#fff" />
            <circle cx="7" cy="-6" r="12.2" fill="#000" />
          </mask>
        </defs>

        {/* Everything goes back into the line together. */}
        <g className="v2-dial-out">
          <g clipPath="url(#v2-dial-sky)">
            {/* The pop: a scale about the middle of the line. */}
            <g className="v2-dial-in">
              <g className="v2-dial-orbit">
                <g transform={`translate(${sun.x} ${sun.y})`}>
                  <circle r="14" className="v2-dial-sun" />
                  {/* Eight rays. Drawn as one path so the sun is one node. */}
                  <path
                    className="v2-dial-rays"
                    d={Array.from({ length: 8 }, (_, i) => {
                      const a = (i * Math.PI) / 4;
                      const c = Math.cos(a);
                      const s = Math.sin(a);
                      return `M${(c * 19).toFixed(2)} ${(s * 19).toFixed(2)} L${(
                        c * 25
                      ).toFixed(2)} ${(s * 25).toFixed(2)}`;
                    }).join(' ')}
                  />
                </g>
                <g transform={`translate(${moon.x} ${moon.y})`}>
                  <rect
                    x="-18"
                    y="-18"
                    width="36"
                    height="36"
                    className="v2-dial-moon"
                    mask="url(#v2-dial-moon)"
                  />
                </g>
              </g>
            </g>
          </g>

          {/* The horizon. Outside the clip on purpose: the clip ends ON the
              line, so a stroke centred there would lose its lower half. */}
          <g className="v2-dial-wipe">
            <line
              x1="2"
              y1={HORIZON_Y}
              x2={VIEW_W - 2}
              y2={HORIZON_Y}
              className="v2-dial-horizon"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
