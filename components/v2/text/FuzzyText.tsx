'use client';

/* ============================================================================
   FuzzyText — display type torn horizontally into bands of noise.

   Exactly one use: the 404. It is the only page on the site where something
   has genuinely gone wrong, so it is the only page where type that will not
   hold still is telling the truth rather than performing.

   HOW. The word is drawn once to an offscreen canvas, then blitted to the
   visible one a scanline band at a time with each band offset sideways by a
   random amount. That is a real horizontal tear — the same artefact a broken
   signal produces — rather than a blur, and because the source canvas is drawn
   once and only ever copied, a frame costs N `drawImage` calls of a few pixels
   each and no text rasterisation at all.

   IT IS AN IMAGE, AND IT SAYS SO. The canvas is aria-hidden and the caller
   supplies the same word as real text alongside; a 404 whose only heading is a
   canvas is a 404 a screen reader cannot read.

   IT STOPS. The loop runs only while the pointer is over it or for the first
   few seconds after mount, and never at all under reduced motion. A permanent
   full-time noise loop on an error page is a battery drain on the one page
   nobody meant to be on.
   ========================================================================== */

import { useEffect, useRef } from 'react';

export interface FuzzyTextProps {
  text: string;
  /** Rendered font size in CSS px. */
  size?: number;
  /** How far a band can slide, px. */
  intensity?: number;
  /** Height of one tear band, px. Smaller is finer and costs more. */
  band?: number;
  className?: string;
}

export default function FuzzyText({
  text,
  size = 190,
  intensity = 9,
  band = 4,
  className
}: FuzzyTextProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hotRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    /* Bound once, so the closures below are not re-narrowing a ref field that
       TypeScript has to assume any of them could have cleared. */
    const cv: HTMLCanvasElement = canvas;
    const c2: CanvasRenderingContext2D = ctx;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    /* The face and the ink are read off the page rather than hardcoded, so the
       heading is in the same type and the same palette as everything else and
       follows a change of light. */
    const styles = getComputedStyle(canvas);
    const family = styles.getPropertyValue('--f-display').trim() || 'serif';
    const ink = styles.getPropertyValue('--ink').trim() || '#17140F';
    const verm = styles.getPropertyValue('--verm').trim() || '#B5402F';
    const font = `800 ${size}px ${family}`;

    /* Measure first, then size both canvases to the ink. `actualBoundingBox`
       rather than the em box: display faces at this weight overshoot their
       nominal ascent, and a box sized from `size` alone clips the caps. */
    ctx.font = font;
    const m = ctx.measureText(text);
    const ascent = m.actualBoundingBoxAscent || size * 0.8;
    const descent = m.actualBoundingBoxDescent || size * 0.22;
    const padX = intensity * 2 + 8;
    const w = Math.ceil(m.width + padX * 2);
    const h = Math.ceil(ascent + descent + 16);

    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    /* The clean plate. Drawn once. */
    const src = document.createElement('canvas');
    src.width = canvas.width;
    src.height = canvas.height;
    const sctx = src.getContext('2d');
    if (!sctx) return;
    sctx.scale(dpr, dpr);
    sctx.font = font;
    sctx.textBaseline = 'alphabetic';
    sctx.fillStyle = ink;
    sctx.fillText(text, padX, ascent + 8);

    const bandPx = Math.max(2, band) * dpr;
    const rows = Math.ceil(canvas.height / bandPx);

    function clean() {
      c2.clearRect(0, 0, cv.width, cv.height);
      c2.drawImage(src, 0, 0);
    }

    if (reduced) {
      clean();
      return;
    }

    let raf = 0;
    /* A budget rather than a permanent loop: it tears on arrival, settles, and
       only comes back while the pointer is on it. */
    let budget = 2600;
    let last = 0;

    const frame = (now: number) => {
      const dt = last ? now - last : 16;
      last = now;
      if (!hotRef.current) budget -= dt;

      if (budget <= 0 && !hotRef.current) {
        clean();
        raf = 0;
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let r = 0; r < rows; r++) {
        const y = r * bandPx;
        /* Most bands sit still. A tear that moves every band every frame is
           uniform noise; one that moves a few is a signal breaking up. */
        const slip =
          Math.random() < 0.34
            ? (Math.random() - 0.5) * intensity * 2 * dpr
            : 0;
        ctx.drawImage(src, 0, y, canvas.width, bandPx, slip, y, canvas.width, bandPx);
      }
      /* One vermilion band, occasionally: the page's accent, misregistered the
         way a colour plate slips on a press. */
      if (Math.random() < 0.2) {
        const y = ((Math.random() * rows) | 0) * bandPx;
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = verm;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(0, y, canvas.width, bandPx);
        ctx.restore();
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    const wake = () => {
      hotRef.current = true;
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    const rest = () => {
      hotRef.current = false;
      budget = 900;
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    canvas.addEventListener('pointerenter', wake);
    canvas.addEventListener('pointerleave', rest);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerenter', wake);
      canvas.removeEventListener('pointerleave', rest);
    };
  }, [text, size, intensity, band]);

  return (
    <canvas
      ref={canvasRef}
      className={className ? `v2-fuzzy ${className}` : 'v2-fuzzy'}
      aria-hidden="true"
    />
  );
}
