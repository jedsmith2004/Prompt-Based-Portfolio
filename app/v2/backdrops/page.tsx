'use client';

/* ============================================================================
   /v2/backdrops — the A/B bench.

   Eight worlds, one at a time, full bleed, with real page type laid over the
   top. The type matters: a backdrop that looks wonderful empty and eats a
   paragraph is not a backdrop, and that is only visible when you put words on it.

   Keys 1-8 switch worlds. D flips the palette.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKDROPS, paletteFor } from '@/components/v2/backdrops/registry';
import './backdrops.css';

export default function BackdropBench() {
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [intensity, setIntensity] = useState(1);
  const [progress, setProgress] = useState(0.35);
  const [showType, setShowType] = useState(true);

  /* Live scroll velocity, so the worlds can be judged in motion rather than at rest. */
  const velocityRef = useRef(0);
  const [velocity, setVelocity] = useState(0);
  useEffect(() => {
    let raf = 0;
    let lastY = window.scrollY;
    let publish = 0;
    const tick = () => {
      const y = window.scrollY;
      velocityRef.current += (y - lastY - velocityRef.current) * 0.24;
      lastY = y;
      if (++publish >= 6) {
        publish = 0;
        setVelocity(Math.round(velocityRef.current * 10) / 10);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const step = useCallback((d: number) => {
    setIndex((i) => (i + d + BACKDROPS.length) % BACKDROPS.length);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= BACKDROPS.length) setIndex(n - 1);
      if (e.key === 'd' || e.key === 'D') setMode((m) => (m === 'light' ? 'dark' : 'light'));
      if (e.key === 't' || e.key === 'T') setShowType((s) => !s);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  /* Release the outgoing backdrop's WebGL context when swapping.
     Browsers cap live WebGL contexts at roughly 8-16, and a discarded context is
     only reclaimed on GC, which is not prompt. Cycling this bench therefore ran
     the page out of contexts and later backdrops silently fell back to their 2D
     path or drew nothing at all. The components must NOT do this themselves,
     because React remounts the same canvas node and a lost context never comes
     back; here the canvas really is being thrown away, so it is safe and correct. */
  const stageRef = useRef<HTMLDivElement | null>(null);
  const prevIndex = useRef(index);
  useEffect(() => {
    if (prevIndex.current === index) return;
    const old = stageRef.current?.querySelector('canvas');
    if (old) {
      const g =
        (old.getContext('webgl2') as WebGL2RenderingContext | null) ??
        (old.getContext('webgl') as WebGLRenderingContext | null);
      g?.getExtension('WEBGL_lose_context')?.loseContext();
    }
    prevIndex.current = index;
  }, [index]);

  const entry = BACKDROPS[index];
  const palette = paletteFor(mode);
  const { Component } = entry;

  return (
    <div className={`v2-bench is-${mode}`} data-bench-mode={mode}>
      {/* the world under test */}
      <div className="v2-bench-stage" aria-hidden="true" ref={stageRef}>
        <Component
          key={entry.name}
          intensity={intensity}
          progress={progress}
          velocity={velocity}
          palette={palette}
        />
      </div>

      {/* real type, so legibility is judged rather than assumed */}
      {showType ? (
        <div className="v2-bench-type">
          <p className="v2-bench-eyebrow">
            {String(index + 1).padStart(2, '0')} / {entry.label.toUpperCase()}
          </p>
          <h1 className="v2-bench-h1">
            Write the pipeline,
            <br />
            then import one
          </h1>
          <p className="v2-bench-lede">
            I built a software rasterizer in Python with projection, triangle filling and
            a z-buffer, and a digit classifier with the SVM written by hand. Neither
            needed to exist. Both showed me what the library had been hiding.
          </p>
          <p className="v2-bench-small">
            This paragraph is set at the site minimum of 11.5px. If it is hard to read
            here, the backdrop is too loud behind text and needs quietening in the middle
            of the frame.
          </p>
        </div>
      ) : null}

      {/* controls */}
      <div className="v2-bench-ui">
        <div className="v2-bench-tabs" role="tablist" aria-label="Backdrop">
          {BACKDROPS.map((b, i) => (
            <button
              key={b.name}
              role="tab"
              aria-selected={i === index}
              onClick={() => setIndex(i)}
            >
              <i>{i + 1}</i>
              {b.label}
            </button>
          ))}
        </div>

        <p className="v2-bench-note">{entry.note}</p>

        <div className="v2-bench-row">
          <button type="button" onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}>
            {mode === 'light' ? 'Dark palette' : 'Light palette'}
          </button>
          <button type="button" onClick={() => setShowType((s) => !s)}>
            {showType ? 'Hide type' : 'Show type'}
          </button>
          <span className="v2-bench-vel">velocity {velocity}</span>
        </div>

        <label className="v2-bench-slider">
          <span>intensity {intensity.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
          />
        </label>
        <label className="v2-bench-slider">
          <span>progress {progress.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
          />
        </label>

        <p className="v2-bench-keys">Keys 1-8 · D palette · T type · arrows</p>
      </div>

      {/* scroll room, so velocity is real */}
      <div className="v2-bench-scroll" aria-hidden="true" />
    </div>
  );
}
