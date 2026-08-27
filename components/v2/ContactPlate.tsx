'use client';

/* ContactPlate — three distinct doors and a form that becomes physical mail. */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react';

const EMAIL = 'jedsmith2004@gmail.com';

interface Door {
  label: string;
  handle: string;
  href: string;
  external: boolean;
  tone: 'email' | 'github' | 'linkedin';
}

const DOORS: Door[] = [
  { label: 'Email', handle: EMAIL, href: 'mailto:' + EMAIL, external: false, tone: 'email' },
  {
    label: 'GitHub',
    handle: 'jedsmith2004',
    href: 'https://github.com/jedsmith2004',
    external: true,
    tone: 'github'
  },
  {
    label: 'LinkedIn',
    handle: 'jack-ed-smith',
    href: 'https://linkedin.com/in/jack-ed-smith',
    external: true,
    tone: 'linkedin'
  }
];

type Status = 'idle' | 'sending' | 'sent' | 'failed';
type Delivery = 'idle' | 'sealing' | 'ready' | 'flying';

export interface ContactPlateHandle {
  /** Called when Pip reaches the sealed envelope. */
  collect: () => void;
  /** Keeps the sequence moving if he cannot reach it. */
  collectWithoutPip: () => void;
}

export interface ContactPlateProps {
  onLetterReady?: () => void;
}

const ContactPlate = forwardRef<ContactPlateHandle, ContactPlateProps>(function ContactPlate(
  { onLetterReady },
  ref
) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [delivery, setDelivery] = useState<Delivery>('idle');
  const [error, setError] = useState('');
  const timers = useRef<number[]>([]);
  const mailRef = useRef<HTMLDivElement | null>(null);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);

  useEffect(() => () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  const resetBlank = useCallback(() => {
    const packet = mailRef.current;
    if (packet) {
      delete packet.dataset.mailCarried;
      packet.style.removeProperty('--mail-carry-x');
      packet.style.removeProperty('--mail-carry-y');
      packet.style.removeProperty('--mail-carry-opacity');
    }
    setName('');
    setEmail('');
    setMessage('');
    setStatus('idle');
    setError('');
    setDelivery('idle');
  }, []);

  const collect = useCallback((withPip: boolean) => {
    const packet = mailRef.current;
    if (packet) packet.dataset.mailCarried = withPip ? 'true' : 'false';
    const front = packet?.querySelector<HTMLElement>('.v2-mail-front');
    if (packet && front) {
      const rect = front.getBoundingClientRect();
      const startX = rect.left + rect.width * 0.5;
      const startY = rect.top;
      const targetX = window.innerWidth + 150;
      const targetY = window.innerHeight * 0.22;
      const dx = targetX - startX;
      const dy = targetY - startY;
      const duration = Math.max(420, Math.hypot(dx, dy) / 0.9);
      packet.style.setProperty('--mail-away-x', dx.toFixed(2) + 'px');
      packet.style.setProperty('--mail-away-y', dy.toFixed(2) + 'px');
      packet.style.setProperty('--mail-away-ms', duration.toFixed(2) + 'ms');
    }
    setDelivery('flying');
    later(resetBlank, 4700);
  }, [later, resetBlank]);

  useImperativeHandle(ref, () => ({
    collect: () => collect(true),
    collectWithoutPip: () => collect(false)
  }), [collect]);

  const mailto = useMemo(() => {
    const subject = encodeURIComponent(name ? name + ' via the site' : 'Via the site');
    const body = encodeURIComponent(message);
    return 'mailto:' + EMAIL + '?subject=' + subject + (message ? '&body=' + body : '');
  }, [name, message]);

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'sending' || delivery !== 'idle') return;
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
        throw new Error(j.error || 'The send failed (' + res.status + ').');
      }
      setStatus('sent');
      setDelivery('sealing');
      later(() => {
        setDelivery('ready');
        onLetterReady?.();
      }, 2100);
    } catch (err) {
      setStatus('failed');
      setError(err instanceof Error ? err.message : 'The send failed.');
    }
  }, [delivery, email, later, message, name, onLetterReady, status]);

  const busy = delivery !== 'idle';

  return (
    <div className={'v2-contact' + (busy ? ' is-mailing' : '')}>
      <ul className="v2-doors">
        {DOORS.map((door) => (
          <li key={door.label}>
            <a
              className={'is-' + door.tone}
              href={door.href}
              target={door.external ? '_blank' : undefined}
              rel={door.external ? 'noreferrer noopener' : undefined}
              data-perch
            >
              <b>{door.label}</b>
              <span>{door.handle}</span>
              <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
                <path d="M5 21 L21 5 M9 5 h12 v12" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </a>
          </li>
        ))}
      </ul>

      <div className={'v2-note-stage is-' + delivery}>
        <form className="v2-note" onSubmit={submit}>
          <div className="v2-note-head" data-perch>
            <p className="v2-eyebrow">Or leave it here</p>
            <p className="v2-note-strap">Three fields. It reaches the same inbox as the first door.</p>
          </div>

          <div className="v2-mail" ref={mailRef} data-mail-packet>
            <div className="v2-mail-back" aria-hidden="true" />

            <div className="v2-note-fields">
              <div className="v2-note-row">
                <label className="v2-note-field">
                  <span>Name</span>
                  <input type="text" name="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" maxLength={120} disabled={busy} />
                </label>
                <label className="v2-note-field">
                  <span>Email</span>
                  <input type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" maxLength={200} disabled={busy} />
                </label>
              </div>

              <label className="v2-note-field is-wide">
                <span>What should Jack know?</span>
                <textarea name="message" value={message} onChange={(e) => setMessage(e.target.value)} required rows={4} maxLength={4000} disabled={busy} />
              </label>
            </div>

            <div
              className="v2-mail-front"
              aria-hidden="true"
            >
              <svg className="v2-mail-pocket" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path className="v2-mail-pocket-face" d="M 0 0 L 50 48 L 100 0 L 100 100 L 0 100 Z" vectorEffect="non-scaling-stroke" />
                <path className="v2-mail-pocket-seam" d="M 0 100 L 50 52 L 100 100" vectorEffect="non-scaling-stroke" />
              </svg>
              <svg className="v2-mail-flap" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 0 0 L 100 0 L 50 48 Z" vectorEffect="non-scaling-stroke" />
              </svg>
              <i className="v2-mail-stamp">JS</i>
              <span>{name || 'A VISITOR'}</span>
              <i className="v2-mail-grip" data-perch data-mail-perch />
            </div>
          </div>

          <div className="v2-note-foot">
            <button type="submit" disabled={status === 'sending' || busy}>
              {status === 'sending' ? 'Sending' : 'Send it'}
            </button>
            <p className="v2-note-say" role="status" aria-live="polite">
              {status === 'sent' ? 'Sealed. Pip is collecting it.' : null}
              {status === 'failed' ? (
                <>{error}{' '}<a href={mailto}>Send it by mail instead</a>, with what you have already written.</>
              ) : null}
            </p>
          </div>
        </form>
      </div>
    </div>
  );
});

export default ContactPlate;
