'use client';

/* ============================================================================
   ScrollReveal — a paragraph that comes up out of the page word by word as it
   is scrolled through.

   Used on the article body of the clipping pages and the project pages. It
   suits a long read in a way it does not suit the spine: the spine's plates are
   short and already have a masked-and-lifted title doing the arriving, whereas
   an article is a column of even grey that benefits from the eye being given a
   leading edge.

   THE STAGGER IS A CSS TRANSITION DELAY, NOT A TIMELINE.

   There is one IntersectionObserver per paragraph and one class flip. Every
   word carries `--w` (its index) and the stylesheet turns that into a delay,
   so the browser owns the whole animation and JavaScript touches nothing after
   the flip. A per-word rAF timeline over an article of forty paragraphs is
   hundreds of elements being written to every frame for an effect CSS does
   natively.

   IT FAILS VISIBLE, AND THAT IS THE IMPORTANT PART.

   The words are hidden by `.is-armed`, which is added by a LAYOUT effect —
   before the browser paints — rather than being the default state in the
   stylesheet. So the class is only ever present when JavaScript is running and
   has already decided it is going to animate. Anything that stops the observer
   ever firing (no JS, a failed hydration, a browser that never delivers the
   callback) leaves the article fully legible instead of leaving a page of
   invisible text, and because the arming happens before paint there is no
   frame in which the words are seen and then hidden again.

   That is not hypothetical caution: the same shape of bug shipped in CvPlanks,
   where a loop that stopped early left the CV links parked off the top of the
   screen. An effect that hides content has to be the thing that proves it can
   also show it again.

   SPACES ARE SIBLINGS OF THE WORD SPANS, never inside them. Wrapping the
   trailing space in the animated span makes it part of the transform, and a
   space that slides is a word gap that visibly changes width.
   ========================================================================== */

import { Fragment, useEffect, useLayoutEffect, useState } from 'react';
import { useInView } from './useInView';

/* useLayoutEffect warns when it runs on the server, where there is no layout to
   read. The arming below has to happen before paint, so on the client it is the
   layout effect and on the server it is a no-op that never runs. */
const useArmEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface ScrollRevealProps {
  text: string;
  /** ms between one word and the next. */
  stagger?: number;
  /** Rendered element. A paragraph by default. */
  as?: 'p' | 'div';
  className?: string;
}

export default function ScrollReveal({
  text,
  stagger = 26,
  as = 'p',
  className
}: ScrollRevealProps) {
  const { ref, seen, reduced } = useInView<HTMLParagraphElement>({
    threshold: 0.12,
    rootMargin: '0px 0px -14% 0px'
  });

  const [armed, setArmed] = useState(false);
  useArmEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setArmed(true);
  }, []);

  const Tag = as;

  /* Reduced motion returns the paragraph as one text node. Two hundred spans
     all already in their final state is not a calmer version of the effect, it
     is the same DOM cost with nothing to show for it. */
  if (reduced) {
    return (
      <Tag ref={ref as never} className={className}>
        {text}
      </Tag>
    );
  }

  const words = text.split(' ');

  return (
    <Tag
      ref={ref as never}
      className={
        `v2-sreveal${armed ? ' is-armed' : ''}${seen ? ' is-in' : ''}` +
        (className ? ` ${className}` : '')
      }
    >
      {words.map((w, i) => (
        <Fragment key={`${w}-${i}`}>
          <span
            className="v2-sreveal-w"
            style={{ '--w': `${i * stagger}ms` } as React.CSSProperties}
          >
            {w}
          </span>
          {i < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </Tag>
  );
}
