'use client';

/* ============================================================================
   Polaroids — photographs from the road, each with a shutter snap.

   The gesture: the polaroid rests slightly rotated, as if dropped on the page.
   On hover, on keyboard focus, or (on touch, where neither exists) when it
   settles in the middle of the viewport, the frame flashes, the photograph
   goes grey and soft, and one region stays sharp and in colour, lifts, and is
   bracketed by viewfinder ticks.

   Two copies of the same image do the work. The lower copy is desaturated and
   blurred; the upper copy is clipped to the subject rect and left alone. The
   browser fetches the file once. Nothing animates per frame, so there is no
   rAF loop to pause and no GPU resource to release; the only teardown is the
   IntersectionObserver.

   The subject cannot be detected reliably, so its rect is framed by hand. It is
   OPTIONAL: a frame with nobody in it greys and dithers whole rather than
   nominating some scenery and bracketing it.

   The grey state is an Atkinson dither onto four page tokens, not a CSS
   desaturate. See lib/v2/dither.ts for why Atkinson specifically. It is painted
   once per photo, off the main render path, into a canvas that crossfades in
   on snap. The CSS filter underneath stays as the fallback for no-JS and for
   the moment before the canvas has painted.
   ========================================================================== */

import { useEffect, useId, useRef, useState } from 'react';
import { dither, ramp, luma, PAPER_RAMP } from '@/lib/v2/dither';

/* ------------------------------------------------------------------- types */

/**
 * A rectangle in the coordinate space of the SOURCE FILE, normalised 0..1 from
 * its top-left. Measure it on the actual image, not on the rendered card: the
 * component works out where the rect lands after the cover crop.
 */
export interface SubjectRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Photo {
  /** Path under /public. Must exist on disk. */
  src: string;
  /** Describes the scene, not the effect. */
  alt: string;
  /** Set in the mono face on the polaroid's lower edge. */
  place: string;
  country: string;
  /** Right-aligned tag on the caption line, e.g. 'DAY 21'. */
  stamp: string;
  /** Natural pixel size of the file. Prevents layout shift and drives the crop. */
  width: number;
  height: number;
  /**
   * The part that stays sharp and in colour.
   *
   * OPTIONAL, and omitting it is a real choice rather than an oversight. The
   * snap only makes sense when there is a subject to pull out of the frame; on
   * a landscape with nobody in it, isolating a strip of ridgeline and putting
   * viewfinder ticks round it reads as the effect misfiring. A photo with no
   * subject still greys and dithers on snap, it just does not isolate.
   *
   * There is no face detection here and there never was. Every rect is
   * measured by hand against the source file.
   */
  subject?: SubjectRect;
  /**
   * Where the cover crop anchors, 0..1. Default is dead centre. Nudge the axis
   * that gets cropped so the subject survives the crop.
   */
  focus?: { x?: number; y?: number };
}

export interface PolaroidsProps {
  photos?: Photo[];
  /** Accessible name for the group. */
  label?: string;
  className?: string;
}

/* ------------------------------------------------------------------ photos */

/* ---------------------------------------------------------------------------
   NEW PHOTOS GO HERE.

   Everything below is a file that genuinely exists in public/thumbnails, shot
   on the Split to Tagounite hitchhike. The stops are in hitchhikeRoute in
   public/context.json; the rest of the frames are in public/thumbnails.

   When the graduation photographs arrive: drop the files in public, append an
   entry, and fill in every field. Measure `subject` on the source image itself,
   normalised 0..1 from the top-left, then set `focus` on whichever axis is
   about to be cropped so the subject stays in shot. No other code changes.
   --------------------------------------------------------------------------- */
export const DEFAULT_PHOTOS: Photo[] = [
  /*
   * CHOSEN BY JACK, 2026-08-26: "3, 7, 18, 21, 24, 25 should be the photos in
   * the gallery, they mostly have faces in."
   *
   * That last clause is the whole reason the selection matters here rather
   * than being a matter of taste. The snap isolates its SUBJECT: the subject
   * stays in colour and everything around it greys and dithers. On a frame
   * with nobody in it there is nothing to isolate, so the effect has no
   * subject, does not read as a photograph being taken, and looks broken.
   * Days 1, 9 and 17 were a terminal, an empty ridgeline and an empty street.
   *
   * Every `subject` below was measured on the source image, normalised 0..1
   * from the top-left, on the face or faces. Every alt line describes the
   * frame as it actually is. All six carry a burnt-in day caption from the
   * original clips, which is left alone: it is what the record looks like.
   */
  {
    src: '/thumbnails/sibenik-day3.jpg',
    alt: 'Sitting on the kerb beside a loaded pack, building a sandwich: tomato sliced onto bread, a bottle of juice and a hunk of cheese on the ground.',
    place: 'Sibenik',
    country: 'Croatia',
    stamp: 'DAY 03',
    width: 640,
    height: 1138,
    /* the bowed head and the hands doing the work */
    subject: { x: 0.38, y: 0.32, w: 0.60, h: 0.52 },
    focus: { y: 0.52 }
  },
  {
    src: '/thumbnails/salzburg-day7.jpg',
    alt: 'Mid-sentence in a bare white room, a patterned bandana tied over his hair.',
    place: 'Salzburg',
    country: 'Austria',
    stamp: 'DAY 07',
    width: 640,
    height: 1136,
    /* head, and the hand holding the pendant */
    subject: { x: 0.44, y: 0.28, w: 0.56, h: 0.46 },
    focus: { y: 0.5 }
  },
  {
    src: '/thumbnails/murcia-day18.jpg',
    alt: 'Lacing a boot on the edge of a bed in a bare hotel room, bandana on, red curtains pulled back from a blown-out window.',
    place: 'Murcia',
    country: 'Spain',
    stamp: 'DAY 18',
    width: 720,
    height: 1280,
    /* head and shoulders, hard right, well above the boot */
    subject: { x: 0.72, y: 0.49, w: 0.26, h: 0.19 },
    focus: { y: 0.62 }
  },
  {
    src: '/thumbnails/tangier-day21.jpg',
    alt: 'Turning back towards the camera on a sunlit street, backpack on, twenty-one days in.',
    place: 'Tangier',
    country: 'Morocco',
    stamp: 'DAY 21',
    width: 720,
    height: 1280,
    subject: { x: 0.33, y: 0.17, w: 0.52, h: 0.45 },
    focus: { y: 0.42 }
  },
  {
    src: '/thumbnails/tagounite-day24.jpg',
    alt: 'Grinning into the camera in a narrow stone stairwell, a patterned bottle held up, three others coming down the steps behind.',
    place: 'Tagounite',
    country: 'Morocco',
    stamp: 'DAY 24',
    width: 640,
    height: 1136,
    /* her face, not the group: the isolate wants one thing to hold on to */
    subject: { x: 0.27, y: 0.40, w: 0.29, h: 0.18 },
    focus: { y: 0.46 }
  },
  {
    src: '/thumbnails/tagounite-day25.jpg',
    alt: 'Two figures crouched on boards on a dune face, footprints running down the sand behind them.',
    place: 'Tagounite',
    country: 'Morocco',
    stamp: 'DAY 25',
    width: 640,
    height: 1136,
    subject: { x: 0.57, y: 0.45, w: 0.43, h: 0.24 },
    focus: { y: 0.55 }
  }
];

/* -------------------------------------------------------------------- crop */

/** Must match `aspect-ratio` on .v2-pola-window in v2.css. */
const WINDOW_AR = 3 / 4;

/** Rest and snap rotations, indexed so the scatter is identical every render. */
const REST_TILT = [-2.4, 1.6, -1.1, 2.2, -1.8, 1.2, -0.7, 2.6];
const SNAP_TILT = [-4.2, 3.4, -2.8, 4.3, -3.5, 3.0, -2.3, 4.6];

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const pct = (n: number) => (n * 100).toFixed(3) + '%';

/**
 * Re-projects the subject rect from source-image space into the visible window
 * after `object-fit: cover` has thrown part of the image away, and returns the
 * custom properties the CSS reads. Doing this here rather than in the data
 * means a photo is described once, against the file, and stays framed
 * correctly if the window ratio is ever retuned.
 */
function frameVars(p: Photo, index: number): React.CSSProperties {
  const fx = p.focus?.x ?? 0.5;
  const fy = p.focus?.y ?? 0.5;
  const ar = p.width / p.height;

  let visW = 1;
  let visH = 1;
  let offX = 0;
  let offY = 0;
  if (ar < WINDOW_AR) {
    /* narrower than the window: fills the width, loses top and bottom */
    visH = ar / WINDOW_AR;
    offY = (1 - visH) * fy;
  } else {
    visW = WINDOW_AR / ar;
    offX = (1 - visW) * fx;
  }

  /* No subject: only --op is meaningful, and the cut-out and ticks are not
     rendered at all, so the clip values would be read by nobody. */
  if (!p.subject) {
    return {
      '--op': `${pct(fx)} ${pct(fy)}`
    } as React.CSSProperties;
  }

  let x0 = clamp01((p.subject.x - offX) / visW);
  let y0 = clamp01((p.subject.y - offY) / visH);
  let x1 = clamp01((p.subject.x + p.subject.w - offX) / visW);
  let y1 = clamp01((p.subject.y + p.subject.h - offY) / visH);

  /* A rect the crop has eaten entirely would collapse the highlight to nothing,
     which reads as a bug rather than as a choice. Keep a sliver. */
  const MIN = 0.05;
  if (x1 - x0 < MIN) {
    const c = (x0 + x1) / 2;
    x0 = clamp01(c - MIN / 2);
    x1 = clamp01(c + MIN / 2);
  }
  if (y1 - y0 < MIN) {
    const c = (y0 + y1) / 2;
    y0 = clamp01(c - MIN / 2);
    y1 = clamp01(c + MIN / 2);
  }

  return {
    '--st': pct(y0),
    '--sr': pct(1 - x1),
    '--sb': pct(1 - y1),
    '--sl': pct(x0),
    '--scx': pct((x0 + x1) / 2),
    '--scy': pct((y0 + y1) / 2),
    '--op': (fx * 100).toFixed(2) + '% ' + (fy * 100).toFixed(2) + '%',
    '--rot': REST_TILT[index % REST_TILT.length] + 'deg',
    '--rot2': SNAP_TILT[index % SNAP_TILT.length] + 'deg',
    '--d': index * 70 + 'ms'
  } as React.CSSProperties;
}

/* --------------------------------------------------------------- one plate */

/** Longest edge of the dithered plate, in pixels. */
const DITHER_EDGE = 340;

/** Atkinson onto ink, ink-2, paper-3, paper. Built once for every card. */
const PLATE_RAMP = ramp(...PAPER_RAMP);

function Polaroid({ photo, index }: { photo: Photo; index: number }) {
  const capId = useId();
  const ref = useRef<HTMLElement | null>(null);
  const ditherRef = useRef<HTMLCanvasElement | null>(null);
  const [snap, setSnap] = useState(false);

  /*
   * Paint the dithered plate once, when the browser is not busy.
   *
   * Deliberately NOT at the file's native size. Error diffusion is sequential
   * CPU work, so a 720x1280 frame is nearly a million dependent iterations and
   * six of those on the main thread is a visible stall. At a 340px longest edge
   * it is around a tenth of the work, and the coarser pattern is the better
   * look anyway: this is meant to read as newsprint, not as a photograph that
   * happens to be speckled.
   *
   * requestIdleCallback because nothing here is urgent — the CSS desaturate is
   * already covering the snap state until this lands. setTimeout is the Safari
   * fallback.
   */
  useEffect(() => {
    const canvas = ditherRef.current;
    if (!canvas) return;
    let cancelled = false;
    let handle = 0;

    const paint = () => {
      if (cancelled) return;
      const img = new Image();
      img.decoding = 'async';
      img.src = photo.src;
      const run = () => {
        if (cancelled) return;
        const nw = img.naturalWidth || photo.width;
        const nh = img.naturalHeight || photo.height;
        if (!nw || !nh) return;
        const scale = Math.min(1, DITHER_EDGE / Math.max(nw, nh));
        const w = Math.max(1, Math.round(nw * scale));
        const h = Math.max(1, Math.round(nh * scale));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, 0, 0, w, h);
        let data: ImageData;
        try {
          data = ctx.getImageData(0, 0, w, h);
        } catch {
          /* a tainted canvas cannot be read. The CSS fallback still works, so
             this is a downgrade rather than a failure. */
          return;
        }
        /*
         * A bounded auto-exposure, applied before quantising.
         *
         * Four tones is not much room, and a frame that is genuinely dark
         * spends nearly all of it at the ink end: the alpine ridgeline at
         * first light came out 49% ink and 0.7% paper, which on a paper-
         * coloured page is a black rectangle rather than a photograph. The
         * bright desert frame has the opposite problem in miniature.
         *
         * So the mean is nudged toward the middle of the ramp, and the nudge
         * is CLAMPED. Uncapped normalisation would flatten the difference
         * between a night shot and a noon one, which is a real thing about
         * these photographs and not a defect to correct away.
         */
        let mean = 0;
        for (let i = 0; i < data.data.length; i += 4) {
          mean += luma(data.data[i], data.data[i + 1], data.data[i + 2]);
        }
        mean /= data.data.length / 4;
        const TARGET = 0.52;
        const MAX_SHIFT = 0.12;
        const shift = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, TARGET - mean));

        dither(data, {
          kind: 'atkinson',
          tones: PLATE_RAMP,
          contrast: 1.06,
          brightness: shift
        });
        ctx.putImageData(data, 0, 0);
        canvas.dataset.painted = '1';
      };
      if (img.complete) run();
      else {
        img.onload = run;
        img.onerror = () => {};
      }
    };

    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, o?: { timeout: number }) => number)
      | undefined;
    if (ric) handle = ric(paint, { timeout: 1200 });
    else handle = window.setTimeout(paint, 200);

    return () => {
      cancelled = true;
      const cic = (window as any).cancelIdleCallback as ((h: number) => void) | undefined;
      if (ric && cic) cic(handle);
      else window.clearTimeout(handle);
    };
  }, [photo.src, photo.width, photo.height]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    /* Touch has no hover and rarely any focus, so on those devices the snap
       fires when the polaroid settles near the middle of the viewport. */
    if (!window.matchMedia('(hover: none)').matches) return;
    const io = new IntersectionObserver(
      (entries) => setSnap(entries[0].isIntersecting),
      { rootMargin: '-30% 0px -30% 0px', threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* Mouse only. A pointerenter synthesised by a tap would leave the snap stuck
     on until something else took the pointer. */
  const enter = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse') setSnap(true);
  };
  const leave = () => setSnap(false);

  const focus = (e: React.FocusEvent<HTMLElement>) => {
    let keyboard = true;
    try {
      keyboard = e.currentTarget.matches(':focus-visible');
    } catch {
      /* older engines: treat any focus as keyboard focus rather than silently
         denying the effect to people who cannot hover */
    }
    if (keyboard) setSnap(true);
  };

  return (
    <figure
      ref={ref}
      tabIndex={0}
      aria-labelledby={capId}
      className={
        'v2-pola' + (snap ? ' is-snap' : '') + (photo.subject ? '' : ' is-plain')
      }
      style={frameVars(photo, index)}
      /* The bird lands here. See THE PERCH CONTRACT in components/v2/
         Companion.tsx. The perch goes on the FIGURE, not on the window
         inside it, because the white border is the frame you can see and its
         box top is exactly that top edge — no inset.

         The reason this was never landable before is the tilt. A polaroid at
         -2.4deg has a bounding rect wider than the card and about 5px above
         its top edge, so a rect-derived perch put the bird in mid-air over
         one corner. The harvester rebuilds the real top edge from the rotation
         matrix, and re-measures on transitionend so the steeper snap tilt is
         picked up too. */
      data-perch
      onPointerEnter={enter}
      onPointerLeave={leave}
      onPointerCancel={leave}
      onFocus={focus}
      onBlur={leave}
    >
      <div className="v2-pola-window">
        <div className="v2-pola-plate">
          <img
            className="v2-pola-base"
            src={photo.src}
            alt={photo.alt}
            width={photo.width}
            height={photo.height}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
          {/* The grey state: an Atkinson dither onto four page tokens, painted
              once and crossfaded in on snap. Sits directly over the base, so
              the CSS desaturate underneath is the fallback rather than a thing
              the reader ever sees once this has painted. */}
          <canvas
            ref={ditherRef}
            className="v2-pola-dither"
            aria-hidden="true"
            width={1}
            height={1}
          />
          {/* the same file, already in cache: the sharp cut-out of the subject.
              Only when there IS a subject: see Photo.subject. */}
          {photo.subject ? (
            <>
              <img
                className="v2-pola-cut"
                src={photo.src}
                alt=""
                aria-hidden="true"
                width={photo.width}
                height={photo.height}
                loading="lazy"
                decoding="async"
                draggable={false}
              />
              <span className="v2-pola-marks" aria-hidden="true" />
            </>
          ) : null}
        </div>
        <span className="v2-pola-flash" aria-hidden="true" />
      </div>

      <figcaption className="v2-pola-cap" id={capId}>
        <b>{photo.place}</b>
        <span>{photo.country}</span>
        <i>{photo.stamp}</i>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------- shelf */

export default function Polaroids({
  photos = DEFAULT_PHOTOS,
  label = 'Photographs from the road',
  className
}: PolaroidsProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.06 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={'v2-polas' + (seen ? ' is-in' : '') + (className ? ' ' + className : '')}
    >
      {photos.map((p, i) => (
        <Polaroid key={p.src} photo={p} index={i} />
      ))}
    </div>
  );
}
