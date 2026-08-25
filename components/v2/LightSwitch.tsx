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

     0ms                mount. The rose and cord run in from the top edge.
     ENTER_MS           the object has stopped moving, so it can be measured.
                        The errand is handed to the bird HERE and not before:
                        a perch harvested mid-transform records where the grip
                        was passing through, not where it came to rest.
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
/** How long he is given before it pulls itself. */
const PATIENCE_MS = 2400;

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
    if (pulled.current) return;
    pulled.current = true;
    setPhase('pull');
    /* Let go of him now rather than at the bottom of the stroke: the errand
       ends, the engine stops holding him on the grip, and he is already
       falling by the time the cord recoils past him. */
    errandCb.current(null);
    window.setTimeout(() => commitCb.current(), PULL_MS);
    window.setTimeout(() => setPhase('out'), PULL_MS + HOLD_MS);
    window.setTimeout(() => doneCb.current(), PULL_MS + HOLD_MS + EXIT_MS);
  }, []);

  /* one-shot timeline */
  useEffect(() => {
    const key = nextErrandKey++;
    const timers: number[] = [];

    timers.push(
      window.setTimeout(() => {
        setPhase('wait');
        errandCb.current({ key, selector: SWITCH_GRIP_SELECTOR });
      }, ENTER_MS)
    );
    timers.push(window.setTimeout(pull, ENTER_MS + PATIENCE_MS));

    return () => {
      for (const t of timers) window.clearTimeout(t);
      /* Unmounted mid-errand — the watchdog in useMode, or a reader who
         outran the whole thing. Release him either way. */
      errandCb.current(null);
    };
  }, [pull]);

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
      arrive: () => window.setTimeout(pull, SET_MS),
      fail: pull,
    }),
    [pull]
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
