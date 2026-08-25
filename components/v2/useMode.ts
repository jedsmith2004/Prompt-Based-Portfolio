'use client';

/* ============================================================================
   useMode — the light/dark run, and the events that narrate it.

   The site is not one theme with a toggle. It is nine plates, three of which
   change the light as you arrive, and the change is a THING THAT HAPPENS
   rather than a fade. Jack asked for it in those terms: the bird flies to the
   top of the screen and pulls a light switch; over the climbing plate the sun
   dips under the horizon on the right while the moon comes up on the left.

   THE STATE MACHINE, and why it has four states rather than two.

     settled     tokens are in `mode`, nothing playing.
     armed       the reader has arrived on a plate whose mode differs. The
                 device is mounted but the light has NOT changed yet. This
                 state is the entire reason the palette file authors every
                 plate twice: for the length of the wind-up we are rendering
                 plate 01 in the light form it does not settle in.
     committed   the device hit its moment. Tokens swapped. The device is
                 still on screen finishing its follow-through.
     settled     again.

   The device owns the timing and calls back. It does NOT own the mode, and
   the hook does not own the animation. That split is deliberate, because the
   two devices have wildly different shapes: the dial is 1.1s of self-contained
   canvas, and the switch depends on a bird that has to fly across the page
   first and might be four sections away or not mounted at all.

   THREE FAILURE MODES THAT ARE HANDLED, because a page whose colours are stuck
   mid-transition is worse than one that never animates:

   1. The device never calls back. A watchdog commits anyway after
      DEVICE_TIMEOUT and tears the device down. The bird can be interrupted by
      the reader scrolling, by a chat, or by not being mounted on a narrow
      screen, and none of those may leave the page in the wrong light.
   2. The reader outruns it. If `active` moves again while a device is armed
      and the new target matches the mode we are already in, the whole event is
      abandoned rather than committed: nothing changed, so nothing should
      animate. If it matches the target instead, the event carries on.
   3. Reduced motion, or a hidden tab. Commit immediately, mount nothing. rAF
      does not fire in a background tab, so a device waiting on one would hang
      forever, which is exactly what the watchdog exists for as well.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { modeForSection, plateFor, type PaletteMode } from '@/lib/v2/palettes';

export type ModeDevice = 'switch' | 'dial';

export interface ModeEvent {
  /** Which device is narrating this change. */
  device: ModeDevice;
  /** The form we are moving to. */
  to: PaletteMode;
  /** The form we are moving from, which the device may want to draw. */
  from: PaletteMode;
  /** Fresh per event, so a device remounts rather than resuming. */
  key: number;
}

export interface ModeHandle {
  /** The form the tokens are in RIGHT NOW. Not the target. */
  mode: PaletteMode;
  /** The device to mount, or null when settled. */
  event: ModeEvent | null;
  /**
   * Called by the device at the instant the light actually changes: the cord
   * reaching the bottom of its pull, the sun crossing the horizon.
   *
   * PASS THE KEY OF THE EVENT THAT MOUNTED YOU. A device's callbacks must
   * only ever be able to affect the event it was mounted for; without the
   * key a stray timer from a torn-down device commits, and then finishes,
   * whatever event happens to be live at the time.
   */
  commit: (key?: number) => void;
  /** Called by the device once its follow-through is over. Unmounts it. */
  finish: (key?: number) => void;
}

/**
 * Longest a device may hold the page before the hook stops believing it.
 *
 * Generous, because the switch legitimately takes a while: the bird has to
 * fly up from wherever he was standing. Anything past this is a device that
 * is not going to call back, and a page left in the wrong light.
 */
const DEVICE_TIMEOUT = 5200;

let nextKey = 1;

export function useMode(activeId: string): ModeHandle {
  const [mode, setMode] = useState<PaletteMode>(() => modeForSection(activeId));
  const [event, setEvent] = useState<ModeEvent | null>(null);

  /* Read inside callbacks and the watchdog without making them re-fire. */
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const eventRef = useRef(event);
  eventRef.current = event;

  const commit = useCallback((key?: number) => {
    const e = eventRef.current;
    if (!e) return;
    if (key !== undefined && key !== e.key) return;
    setMode(e.to);
  }, []);

  const finish = useCallback((key?: number) => {
    const e = eventRef.current;
    if (!e) return;
    if (key !== undefined && key !== e.key) return;
    /* Committing on the way out is a safety net, not the normal path: a device
       that animates its follow-through and forgets to call commit() would
       otherwise unmount having changed nothing. */
    setMode(e.to);
    setEvent(null);
  }, []);

  useEffect(() => {
    const target = modeForSection(activeId);

    if (target === modeRef.current) {
      /* Case 2 above: the reader turned around mid-event. Nothing is changing
         any more, so the device is abandoned rather than allowed to land. */
      if (eventRef.current) setEvent(null);
      return;
    }

    /* Already heading there. Let it run rather than restarting the animation
       every time the observer re-fires on the same plate. */
    if (eventRef.current && eventRef.current.to === target) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || (typeof document !== 'undefined' && document.hidden)) {
      setEvent(null);
      setMode(target);
      return;
    }

    setEvent({
      device: plateFor(activeId).via ?? 'switch',
      to: target,
      from: modeRef.current,
      key: nextKey++,
    });
  }, [activeId]);

  /* --- the watchdog ------------------------------------------------------ */
  useEffect(() => {
    if (!event) return;
    const t = window.setTimeout(() => {
      setMode(event.to);
      setEvent(null);
    }, DEVICE_TIMEOUT);
    return () => window.clearTimeout(t);
  }, [event]);

  /*
   * Dev handle. Scroll is a no-op in the browser pane and IntersectionObserver
   * never fires there, so `active` never changes and neither device can be
   * reached by any means the reader would use. Without this there is no way to
   * look at either of them at all — which is the same hole that let the Fluid
   * world ship completely invisible.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as any).__v2Mode = {
      get: () => ({ mode: modeRef.current, event: eventRef.current }),
      /** Mount a device and run it for real, callbacks and all. */
      fire: (device: ModeDevice = 'switch', to?: PaletteMode) =>
        setEvent({
          device,
          to: to ?? (modeRef.current === 'dark' ? 'light' : 'dark'),
          from: modeRef.current,
          key: nextKey++,
        }),
      set: (m: PaletteMode) => {
        setEvent(null);
        setMode(m);
      },
    };
    return () => {
      delete (window as any).__v2Mode;
    };
  }, []);

  return { mode, event, commit, finish };
}
