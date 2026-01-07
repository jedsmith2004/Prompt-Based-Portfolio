import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

export default function InstagramTest() {
  const url = 'https://www.instagram.com/p/DPxEKFMCOjQ/';
  const containerRef = useRef<HTMLDivElement>(null);
  const [embedReady, setEmbedReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Try to process embeds if the script is already present
  const processEmbeds = () => {
    try {
      // @ts-ignore - window.instgrm is injected by Instagram's embed.js
      if (typeof window !== 'undefined' && window.instgrm?.Embeds?.process) {
        // @ts-ignore
        window.instgrm.Embeds.process();
        setEmbedReady(true);
      }
    } catch {
      /* no-op */
    }
  };

  useEffect(() => {
    processEmbeds();
  }, []);

  // Simple timeout-based fallback if the embed never becomes ready
  useEffect(() => {
    const t = setTimeout(() => {
      if (!embedReady) setFailed(true);
    }, 5000);
    return () => clearTimeout(t);
  }, [embedReady]);

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <h1 className="text-white text-2xl mb-4">Instagram Embed Test</h1>
      <div className="max-w-md mx-auto" ref={containerRef}>
        <blockquote
          className="instagram-media"
          data-instgrm-permalink={url}
          data-instgrm-version="14"
          style={{ background: '#fff', border: 0, margin: 0, maxWidth: '540px', width: '100%' }}
        >
          <a href={url} target="_blank" rel="noreferrer">View this post on Instagram</a>
        </blockquote>

        {failed && (
          <div className="mt-3 rounded-md border border-white/10 bg-white/5 p-3">
            <div className="text-white/80 text-sm mb-2">Couldn’t render the Instagram embed here.</div>
            <a className="text-white underline text-sm" href={url} target="_blank" rel="noreferrer">
              Open on Instagram →
            </a>
          </div>
        )}
      </div>

      {/* Load Instagram's official embed script and process on load */}
      <Script
        src="https://www.instagram.com/embed.js"
        strategy="lazyOnload"
        onLoad={processEmbeds}
      />
    </div>
  );
}