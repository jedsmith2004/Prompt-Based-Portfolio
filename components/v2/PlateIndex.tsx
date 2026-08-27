'use client';

/* ============================================================================
   PlateIndex — the section index, for a screen with no room for a rail.

   Jack, 2026-08-27: "There is no mobile selector screen."

   There was not. The rail in app/page.tsx is the only way to move between
   plates without scrolling through all of them, and below 760px app/v2.css
   throws away everything about it except the progress hairline: the mark and
   the whole numbered list are `display: none`, because 62px of fixed furniture
   down the side of a 375px screen is a sixth of the page. That was the right
   call for the rail and the wrong end state, because what it left behind was a
   3px bar that reports progress and accepts no input. On a phone the site was
   nine plates of one-way scrolling.

   THIS IS A SHEET, NOT A COLLAPSED RAIL.

   The obvious repair is to reflow the rail into a horizontal strip of numbers
   along the top. That fails on the thing the rail is actually for: the numbers
   alone are meaningless — the desktop rail only works because a hover reveals
   the plate's name — and hover is exactly what a phone does not have. A strip
   of nine bare digits is a worse index than no index.

   So the phone gets the affordance the desktop cannot afford: the plate names
   in full, set as a list, on a sheet that covers the page while you choose.
   The screen is the one resource a phone has more of than a desktop sidebar.

   WHAT IS IN THE BAR. The mark and the current plate, and that is the whole
   of it. The mark goes to the splash — the same job it does on the desktop
   rail — and the plate reads "03 / NOTHING LEAVES THE MACHINE" so the bar is
   answering "where am I" even when nobody opens it. Tapping either half is a
   real action, so there is no chrome that is only decoration.

   THE SHEET CLOSES ON EVERYTHING. Escape, the backdrop, the close control, and
   choosing a plate. A sheet you can get stuck inside is worse than no sheet,
   and on a phone the back gesture is a browser navigation rather than a
   dismissal, so it cannot be the way out.
   ========================================================================== */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Section } from '@/lib/v2/content';

/**
 * Split a plate eyebrow into its number and its label.
 *
 * Eyebrows arrive pre-numbered, e.g. "01 / DO NOT IMPORT IT", because the
 * number is part of the plate's identity rather than an index into an array.
 * Both the rail and this sheet need the halves separately, and they must split
 * them the same way or the two indexes would disagree about what plate 03 is
 * called.
 */
export function splitEyebrow(eyebrow: string, i: number): [string, string] {
  const cut = eyebrow.indexOf('/');
  if (cut < 0) return [String(i + 1).padStart(2, '0'), eyebrow];
  return [eyebrow.slice(0, cut).trim(), eyebrow.slice(cut + 1).trim()];
}

export interface PlateIndexProps {
  sections: Section[];
  /** id of the plate the reader is on. 'top' is the splash. */
  active: string;
  /** Scrolls the page to a plate. */
  onJump: (id: string) => void;
}

export default function PlateIndex({ sections, active, onJump }: PlateIndexProps) {
  const [open, setOpen] = useState(false);
  const sheetId = useId();
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const activeIndex = sections.findIndex((s) => s.id === active);
  const [activeNum, activeLabel] =
    activeIndex >= 0
      ? splitEyebrow(sections[activeIndex].eyebrow, activeIndex)
      : ['00', 'Splash'];

  /* Escape closes, and while the sheet is up the page behind it does not
     scroll — a sheet that moves the thing it is covering reads as broken. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    /* Focus moves into the sheet so the keyboard and the screen reader are
       both looking at the thing that just appeared. */
    sheetRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const choose = useCallback(
    (id: string) => {
      setOpen(false);
      /* The sheet is unmounted on the same tick, so the scroll is queued
         behind it: scrolling a page that is still under `overflow: hidden`
         lands in the wrong place. */
      window.setTimeout(() => onJump(id), 0);
      /* Focus goes back to the control that opened the sheet rather than
         being dropped on the body. */
      window.setTimeout(() => openerRef.current?.focus(), 0);
    },
    [onJump]
  );

  return (
    <>
      {/* The bar is hidden above the breakpoint by app/v2.css rather than by a
          condition here, so there is nothing for the server and the client to
          disagree about on first paint. */}
      <div className="v2-platebar">
        <button
          type="button"
          className="v2-platebar-mark"
          onClick={() => choose('top')}
          aria-label="Back to the top"
        >
          JS
        </button>

        <button
          type="button"
          className="v2-platebar-open"
          ref={openerRef}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={sheetId}
        >
          <i aria-hidden="true">{activeNum}</i>
          <span>{activeLabel}</span>
          <svg width="11" height="7" viewBox="0 0 11 7" aria-hidden="true">
            <path d="M1 1 L5.5 5.5 L10 1" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
      </div>

      {open && (
        <div
          className="v2-platesheet"
          id={sheetId}
          role="dialog"
          aria-modal="true"
          aria-label="Plate index"
          ref={sheetRef}
          tabIndex={-1}
        >
          {/* The backdrop is a sibling button rather than a click handler on
              the sheet, so a tap on the list cannot fall through to it. */}
          <button
            type="button"
            className="v2-platesheet-scrim"
            onClick={() => setOpen(false)}
            aria-label="Close the index"
          />

          <div className="v2-platesheet-panel">
            <div className="v2-platesheet-head">
              <span>Index</span>
              <button
                type="button"
                className="v2-platesheet-close"
                onClick={() => setOpen(false)}
                aria-label="Close the index"
              >
                <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                  <path
                    d="M1.5 1.5 L13.5 13.5 M13.5 1.5 L1.5 13.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                </svg>
              </button>
            </div>

            <ol className="v2-platesheet-list">
              {/* The splash is plate 00. It is a place on the page and the
                  sheet is the only way back to it without a long scroll. */}
              <li>
                <button
                  type="button"
                  onClick={() => choose('top')}
                  aria-current={active === 'top' ? 'true' : undefined}
                >
                  <i aria-hidden="true">00</i>
                  <span>The top</span>
                </button>
              </li>

              {sections.map((s, i) => {
                const [num, label] = splitEyebrow(s.eyebrow, i);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => choose(s.id)}
                      aria-current={active === s.id ? 'true' : undefined}
                    >
                      <i aria-hidden="true">{num}</i>
                      <span>{label}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
