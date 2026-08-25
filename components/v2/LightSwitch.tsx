'use client';

/* ============================================================================
   LightSwitch — the bird turns the lights on and off.

   Jack, 2026-08-26: "The transition into dark mode on this page (and number 2)
   should be the bird flying up to the top of the screen and pulling a light
   switch, changing it from light mode (there should be a light mode variant)
   to dark mode."

   So the site's two indoor mode changes are not transitions, they are an
   event with a cause. A rose drops out of the top edge of the screen, a cord
   unrolls under it, the bird flies up and lands on the grip, and the light
   changes when the cord reaches the bottom of its travel. Scrolling back up
   plays the same object doing the same thing the other way.

   WHY HE DROPS OFF IT RATHER THAN RIDING IT DOWN.

   The obvious staging is the grip descending with the bird standing on it.
   That would need the engine to re-measure the furniture every frame of the
   pull, because a perch's document position is measured, not subscribed to,
   and `measure()` walks the whole document. Sixty full-document walks to move
   one bead forty pixels is not a trade worth making.

   It is also not what pulling a light cord looks like. You pull down and you
   let go. He lands on the grip, his weight takes it down, and he drops off the
   bottom of the stroke while it springs back over him — which the engine gives
   us for free, because letting go of a perch and falling is the single most
   ordinary thing it knows how to do.

   THE ORDER OF EVENTS, and the two places it can go wrong:

     0ms                mount. The rose and cord run in from the top edge,
                        under a CSS ANIMATION that starts on this frame. It
                        used to be a transition armed by the phase flip below,
                        which meant the object hung motionless off-screen for
                        the whole of ENTER_MS and only THEN began to move.
     ENTER_MS           the object has stopped moving, so it can be measured.
                        The errand is handed to the bird HERE and not before:
                        a perch harvested mid-transform records where the grip
                        was passing through, not where it came to rest. Under
                        the old ordering this fired at the START of the
                        entrance, and the grip measured -16px — sixteen pixels
                        ABOVE the top of the screen, and 162 above its rest.
     arrival + SET_MS   he is on it. The pull starts.
     ...+ PULL_MS       bottom of the stroke. THE LIGHT CHANGES. He is
                        released on the same frame, so he falls as it recoils.
     ...+ HOLD_MS       the object runs back out of the top of the screen.
     ...+ EXIT_MS       finished. Unmounted.

   Wrong 1: he never arrives. He might be four plates away, mid-conversation,
   held by the reader, or not mounted at all on a narrow screen. After
   PATIENCE_MS the cord pulls itself and the page carries on. A light switch
   that only works when a bird is available is a light switch that leaves the
   page in the wrong colours.

   Wrong 2: he arrives after we gave up. `pulled` is a ref rather than state
   so the callback cannot fire the sequence twice.

   Wrong 3, and it is the one that bites the SECOND light change rather than
   the first: every timer this component starts has to die with it. The three
   timeouts inside `pull` and the one inside `arrive` used to be untracked, so
   a switch torn down mid-sequence — by the watchdog, or by a reader who
   outran it — went on to call `onCommit` and `onDone` from the grave. Those
   land on the hook's CURRENT event, which by then is a different one, and
   `onDone` unmounts it. The next change committed by itself with the rose
   half-way out of the ceiling and the bird never asked to come.
   ========================================================================== */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PaletteMode } from '@/lib/v2/palettes';
import type { CompanionErrand } from './Companion';

/** Selector the errand names. Must match the attribute on the grip below. */
export const SWITCH_GRIP_SELECTOR = '[data-switch-grip]';

const ENTER_MS = 460;
/** Beat between him landing and the cord moving, so the two read as cause. */
const SET_MS = 190;
const PULL_MS = 170;
/** Recoil, and how long the object stays down after the light has changed. */
const HOLD_MS = 620;
const EXIT_MS = 340;
/**
 * How long he is given before it pulls itself.
 *
 * Deliberately LONGER than ERRAND_DEADLINE in Companion.tsx, so that in the
 * ordinary case the bird's own engine is the thing that decides he is not
 * coming — it knows whether he is mid-flight and this does not. This is the
 * backstop for the case the engine cannot report at all: not mounted, torn
 * down, or never started.
 */
const PATIENCE_MS = 3000;

type Phase = 'in' | 'wait' | 'pull' | 'out';

export interface LightSwitchProps {
  /** The form we are moving TO. Only used to label the object for a reader. */
  to: PaletteMode;
  /** Hand this to Companion. Null until the object has stopped moving. */
  onErrand: (e: CompanionErrand | null) => void;
  /** Bottom of the stroke: change the light now. */
  onCommit: () => void;
  /** Entirely over. */
  onDone: () => void;
}

/** What the page calls when the bird reports in. */
export interface LightSwitchHandle {
  /** He is standing on the grip. */
  arrive: () => void;
  /** He is not coming. Pull it without him. */
  fail: () => void;
}

let nextErrandKey = 1;

const LightSwitch = forwardRef<LightSwitchHandle, LightSwitchProps>(function LightSwitch(
  { to, onErrand, onCommit, onDone },
  ref
) {
  const [phase, setPhase] = useState<Phase>('in');
  const pulled = useRef(false);
  /** Every timer this instance owns, so unmount can take all of them. */
  const timers = useRef<number[]>([]);
  /** Set on unmount. Belt and braces: a timer that somehow survives no-ops. */
  const dead = useRef(false);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(
      window.setTimeout(() => {
        if (!dead.current) fn();
      }, ms)
    );
  }, []);

  /* Callbacks live behind refs so the one-shot timeline effect below can have
     an empty dependency list and genuinely run once. A parent that re-renders
     mid-pull must not restart the sequence. */
  const errandCb = useRef(onErrand);
  errandCb.current = onErrand;
  const commitCb = useRef(onCommit);
  commitCb.current = onCommit;
  const doneCb = useRef(onDone);
  doneCb.current = onDone;

  /** The whole back half of the sequence. Idempotent. */
  const pull = useCallback(() => {
    if (pulled.current || dead.current) return;
    pulled.current = true;
    setPhase('pull');
    /* Let go of him now rather than at the bottom of the stroke: the errand
       ends, the engine stops holding him on the grip, and he is already
       falling by the time the cord recoils past him. */
    errandCb.current(null);
    later(() => commitCb.current(), PULL_MS);
    later(() => setPhase('out'), PULL_MS + HOLD_MS);
    later(() => doneCb.current(), PULL_MS + HOLD_MS + EXIT_MS);
  }, [later]);

  /* one-shot timeline */
  useEffect(() => {
    const key = nextErrandKey++;
    dead.current = false;

    /* The entrance is already running: `[data-phase='in']` carries a CSS
       animation that started when the element was painted. This timer only
       marks where it FINISHES, which is the first moment the grip is where it
       is going to stay and so the first moment it can be measured. */
    later(() => {
      setPhase('wait');
      errandCb.current({ key, selector: SWITCH_GRIP_SELECTOR });
    }, ENTER_MS);
    later(pull, ENTER_MS + PATIENCE_MS);

    const owned = timers.current;
    return () => {
      dead.current = true;
      for (const t of owned) window.clearTimeout(t);
      owned.length = 0;
      /* Unmounted mid-errand — the watchdog in useMode, or a reader who
         outran the whole thing. Release him either way. */
      errandCb.current(null);
    };
  }, [pull, later]);

  /*
   * An imperative handle rather than a callback prop, because the two events
   * this needs travel the wrong way: they arrive at the PAGE, from the
   * Companion, and have to reach a child that is a sibling of it. Passing them
   * down as state would re-render the switch mid-animation to deliver a fact
   * that has no visual consequence of its own.
   */
  useImperativeHandle(
    ref,
    () => ({
      arrive: () => later(pull, SET_MS),
      fail: pull,
    }),
    [pull, later]
  );

  return (
    <div
      className="v2-switch"
      data-phase={phase}
      data-to={to}
      aria-hidden="true"
      style={
        {
          '--enter': `${ENTER_MS}ms`,
          '--pull': `${PULL_MS}ms`,
          '--exit': `${EXIT_MS}ms`,
        } as React.CSSProperties
      }
    >
      <span className="v2-switch-rose" />
      <span className="v2-switch-cord" />
      {/* data-perch: see THE PERCH CONTRACT in components/v2/Companion.tsx.
          The grip is a solid bead whose box top IS its visible top edge, so it
          takes no inset. It is fixed, so the harvester stores its viewport
          edge and re-derives the document coordinates every frame. */}
      <span className="v2-switch-grip" data-switch-grip data-perch />
    </div>
  );
});

export default LightSwitch;
