'use client';

/* ============================================================================
   TextType — a line typed out, with a caret.

   Kept for places where the words are addressed TO the reader and should
   arrive as somebody speaking: the standfirst on a clipping page, the line on
   the 404. Deliberately not used on any of the spine's ledes. A paragraph
   typed at reading speed is a paragraph you are made to wait for, and eight of
   them in a row is a page that has decided its own animation matters more than
   its argument.

   THE LINE NEVER RE-WRAPS WHILE IT TYPES, and getting that right is the whole
   of this component.

   The obvious implementation — append to a text node each frame — reflows the
   paragraph on every keystroke, and on a line that wraps it visibly re-breaks
   several times on the way through, so the last word jumps up a line as the
   sentence finishes. The second-most obvious — clip the full string by a `ch`
   width — is only true in a monospace face, and everything on this page except
   the mono furniture is proportional.

   So: a GHOST carries the layout. The complete sentence is rendered with
   `visibility: hidden`, in flow, and it is what sets the box and does the line
   breaking. The visible copy is absolutely positioned over the ghost with
   `inset: 0`, so it inherits exactly that box and therefore breaks its lines in
   exactly the same places. Growing it changes nothing about the geometry — the
   final layout is correct from the first frame.

   Both copies are aria-hidden and the wrapper carries the sentence as its
   accessible name, so a screen reader gets it once, whole, immediately.
   ========================================================================== */

import { useState } from 'react';
import { useInView, useTimedFrames } from './useInView';

export interface TextTypeProps {
  text: string;
  /** Characters per second. */
  speed?: number;
  delay?: number;
  /** Keep the caret blinking after the line has finished. */
  hold?: boolean;
  className?: string;
}

export default function TextType({
  text,
  speed = 34,
  delay = 240,
  hold = false,
  className
}: TextTypeProps) {
  const { ref, seen, reduced } = useInView<HTMLSpanElement>({ threshold: 0.4 });
  const [shown, setShown] = useState(0);
  const [done, setDone] = useState(false);

  const total = delay + (text.length / speed) * 1000;

  useTimedFrames(
    seen && !reduced,
    total,
    (t) => {
      const u = Math.max(0, (t * total - delay) / (total - delay || 1));
      /* Ceil, so the first character appears the instant the delay is up
         rather than half a character later. */
      setShown(Math.min(text.length, Math.ceil(u * text.length)));
      if (t >= 1) setDone(true);
    },
    [text]
  );

  if (reduced) {
    return (
      <span ref={ref} className={className}>
        {text}
      </span>
    );
  }

  return (
    <span
      ref={ref}
      className={className ? `v2-type ${className}` : 'v2-type'}
      data-done={done ? 'true' : undefined}
      data-hold={hold ? 'true' : undefined}
    >
      {/* The sentence, read once and whole and immediately. See the note in
          SplitFlap.tsx for why this is a hidden text node rather than an
          aria-label. */}
      <span className="v2-sr">{text}</span>
      <span className="v2-type-ghost" aria-hidden="true">
        {text}
      </span>
      <span className="v2-type-ink" aria-hidden="true">
        {text.slice(0, shown)}
        <i className="v2-type-caret" />
      </span>
    </span>
  );
}
