'use client';

/* ============================================================================
   ClickSpark — every click on the page throws a small burst of ink.

   The one genuinely global interactive flourish on the site, and the reason it
   is allowed to be global is that it costs nothing until somebody presses
   something: there is no element per spark, no listener per target, and no
   frame loop at all between clicks.

   ONE CANVAS, ONE DOCUMENT LISTENER, AND NO LOOP AT REST.

   The canvas is fixed, full viewport, `pointer-events: none`, and sized to the
   device pixel ratio. A pointerdown seeds a ring of particles and starts a
   rAF; when the last particle dies the loop cancels itself and the canvas is
   cleared. A page sitting idle is paying for one event listener.

   IT DRAWS IN THE PLATE'S OWN INK. The colours are read off the root element
   at the moment of the click, not cached, so a spark on the closing plate is
   vermilion on that plate's paper rather than on the hero's. This is the only
   place on the site allowed a computed-style read per interaction: it is one
   read per click, which is nothing, and the alternative is a subscription to
   the palette watcher for an effect that is over in 500ms.

   WHAT IT DELIBERATELY DOES NOT DO. It does not fire on drags of the bird, on
   the chat input, or on anything inside the companion layer: the bird has its
   own reactions to being handled and a burst of ink underneath him during a
   drag reads as a bug. It also never fires on a right-click.
   ========================================================================== */

import { useEffect, useRef } from 'react';

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  len: number;
  hue: string;
}

export interface ClickSparkProps {
  /** Particles per click. */
  count?: number;
  /** Longest a particle lives, ms. */
  life?: number;
}

export default function ClickSpark({ count = 11, life = 470 }: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.ceil(window.innerWidth * dpr);
      canvas.height = Math.ceil(window.innerHeight * dpr);
    };
    size();

    const sparks: Spark[] = [];
    let raf = 0;
    let last = 0;

    const frame = (now: number) => {
      const dt = last ? Math.min(48, now - last) : 16;
      last = now;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life += dt;
        if (s.life >= s.max) {
          sparks.splice(i, 1);
          continue;
        }
        const u = s.life / s.max;
        /* Out fast, then coast. Ease-out on the position and a linear fade,
           so the burst reads as struck rather than as drifting. */
        const e = 1 - Math.pow(1 - u, 2.6);
        const x = s.x + s.vx * e;
        const y = s.y + s.vy * e;
        /* Each particle is a short line along its own direction rather than a
           dot: a stroke carries the direction of travel and reads as ink
           thrown off a nib, which is the material this whole page is in. */
        const tail = s.len * (1 - u);
        const n = Math.hypot(s.vx, s.vy) || 1;

        ctx.globalAlpha = (1 - u) * 0.9;
        ctx.strokeStyle = s.hue;
        ctx.lineWidth = 1.6 * dpr;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x * dpr, y * dpr);
        ctx.lineTo((x - (s.vx / n) * tail) * dpr, (y - (s.vy / n) * tail) * dpr);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (sparks.length) {
        raf = requestAnimationFrame(frame);
      } else {
        /* Nothing left to draw: stop, and leave the canvas clear. */
        raf = 0;
        last = 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as Element | null;
      /* The bird owns its own feedback; so does the chat it carries. */
      if (target && target.closest('.v2-bird-layer')) return;

      const root = document.documentElement;
      const cs = getComputedStyle(root);
      const verm = cs.getPropertyValue('--verm').trim() || '#B5402F';
      const ink = cs.getPropertyValue('--ink-2').trim() || '#3A342A';
      const blue = cs.getPropertyValue('--blue').trim() || '#2F5D8C';

      for (let i = 0; i < count; i++) {
        /* An even ring with jitter rather than pure random angles: a random
           burst of eleven leaves visible gaps and clumps often enough to look
           like a mistake. */
        const a = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const speed = 22 + Math.random() * 30;
        sparks.push({
          x: e.clientX,
          y: e.clientY,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          life: 0,
          max: life * (0.62 + Math.random() * 0.5),
          len: 6 + Math.random() * 7,
          /* Mostly the accent, with the page's ink and blue mixed through so
             the burst is not one flat colour. */
          hue: i % 5 === 0 ? blue : i % 3 === 0 ? ink : verm
        });
      }
      if (!raf) raf = requestAnimationFrame(frame);
    };

    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('resize', size);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', size);
    };
  }, [count, life]);

  return <canvas ref={canvasRef} className="v2-spark" aria-hidden="true" />;
}
