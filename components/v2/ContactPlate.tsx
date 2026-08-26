'use client';

/* ============================================================================
   ContactPlate — the three doors, and the one short form.

   Jack, 2026-08-26: "the email, github and linkedin should all be massive link
   boxes. There should be a minimal contact form, in line with the theme."

   They were a figure shelf: three statistics whose values happened to be the
   words Email, GitHub and LinkedIn. That is the wrong grammar for the closing
   plate. Everywhere else on the page a shelf holds a FACT you read; here the
   reader is being asked to do something, and the thing you do it with should
   be the biggest object in the room.

   So: three doors at display scale, each one entirely clickable, and under
   them a form short enough that nobody has to decide whether to bother. Three
   fields, because /api/contact needs exactly three and a fourth would be a
   field invented to look thorough.

   MINIMAL MEANS HAIRLINES, NOT BOXES. The rest of the site sets its inputs
   the way an engineering journal sets a blank to be filled in: a label in
   mono, a rule under the writing line, nothing enclosed. A rounded input with
   a filled background would be the one control on the site that came from
   somewhere else.

   NO STATE SURVIVES A FAILURE SILENTLY. If the send fails, the message is
   still in the box and the fallback is the reader's own mail client, with the
   text they already typed carried into it. The one thing this must never do is
   swallow someone's paragraph.
   ========================================================================== */

import { useCallback, useMemo, useRef, useState } from 'react';

const EMAIL = 'jedsmith2004@gmail.com';

interface Door {
  label: string;
  handle: string;
  href: string;
  external: boolean;
}

const DOORS: Door[] = [
  { label: 'Email', handle: EMAIL, href: `mailto:${EMAIL}`, external: false },
  {
    label: 'GitHub',
    handle: 'jedsmith2004',
    href: 'https://github.com/jedsmith2004',
    external: true
  },
  {
    label: 'LinkedIn',
    handle: 'jack-ed-smith',
    href: 'https://linkedin.com/in/jack-ed-smith',
    external: true
  }
];

type Status = 'idle' | 'sending' | 'sent' | 'failed';

export default function ContactPlate() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement | null>(null);

  /* The escape hatch, built from whatever has already been typed, so a reader
     whose send failed does not have to type it again. */
  const mailto = useMemo(() => {
    const subject = encodeURIComponent(name ? `${name} via the site` : 'Via the site');
    const body = encodeURIComponent(message);
    return `mailto:${EMAIL}?subject=${subject}${message ? `&body=${body}` : ''}`;
  }, [name, message]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (status === 'sending') return;
      setStatus('sending');
      setError('');
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, message })
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `The send failed (${res.status}).`);
        }
        setStatus('sent');
        setMessage('');
      } catch (err) {
        setStatus('failed');
        setError(err instanceof Error ? err.message : 'The send failed.');
      }
    },
    [name, email, message, status]
  );

  return (
    <div className="v2-contact">
      {/* The doors. Each one is a link, not a card containing a link, so the
          whole plate is the target and there is nothing to aim at. */}
      <ul className="v2-doors">
        {DOORS.map((d) => (
          <li key={d.label}>
            <a
              href={d.href}
              target={d.external ? '_blank' : undefined}
              rel={d.external ? 'noreferrer noopener' : undefined}
              /* The box top is a real 2px rule, so it is a perch with no
                 inset. See THE PERCH CONTRACT in components/v2/Companion.tsx. */
              data-perch
            >
              <b>{d.label}</b>
              <span>{d.handle}</span>
              <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
                <path
                  d="M5 21 L21 5 M9 5 h12 v12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
              </svg>
            </a>
          </li>
        ))}
      </ul>

      <form className="v2-note" onSubmit={submit} ref={formRef}>
        <div className="v2-note-head" data-perch>
          <p className="v2-eyebrow">Or leave it here</p>
          <p className="v2-note-strap">
            Three fields. It reaches the same inbox as the first door.
          </p>
        </div>

        <div className="v2-note-row">
          <label className="v2-note-field">
            <span>Name</span>
            <input
              type="text"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              maxLength={120}
            />
          </label>
          <label className="v2-note-field">
            <span>Email</span>
            <input
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              maxLength={200}
            />
          </label>
        </div>

        <label className="v2-note-field is-wide">
          <span>The part that is not working yet</span>
          <textarea
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            rows={4}
            maxLength={4000}
          />
        </label>

        <div className="v2-note-foot">
          <button type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending' : 'Send it'}
          </button>
          {/* aria-live so the outcome is announced rather than only drawn. */}
          <p className="v2-note-say" role="status" aria-live="polite">
            {status === 'sent' ? 'Sent. He reads these himself.' : null}
            {status === 'failed' ? (
              <>
                {error}{' '}
                <a href={mailto}>Send it by mail instead</a>, with what you have
                already written.
              </>
            ) : null}
          </p>
        </div>
      </form>
    </div>
  );
}
