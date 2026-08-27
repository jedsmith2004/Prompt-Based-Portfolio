/* ============================================================================
   /clippings/[id] — one award, as a page.

   A server component, so the five pages are generated at build time and each
   carries its own title and description into the document head. Everything
   visual is in ClippingStory, which is a client component because it runs a
   palette, a canvas world and a bird.

   The ORDER is computed here and passed down rather than recomputed in the
   client, for the same reason it is on the project pages: the index and the
   newer/older links have to agree about what "newer" means.
   ========================================================================== */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ORDERED_STORIES } from '@/lib/v2/clippings';
import ClippingStory from '@/components/v2/ClippingStory';
import '../../story.css';

export function generateStaticParams() {
  return ORDERED_STORIES.map((s) => ({ id: s.id }));
}

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const s = ORDERED_STORIES.find((x) => x.id === params.id);
  if (!s) return { title: 'Not found' };
  return {
    title: `${s.headline} — Jack Smith`,
    /* The standfirst, which was written to be the first thing read and is
       therefore already the right length and the right sentence for this. */
    description: s.article.standfirst,
    alternates: { canonical: `/clippings/${s.id}` },
    openGraph: {
      title: `${s.headline} — Jack Smith`,
      description: s.article.standfirst,
      url: `/clippings/${s.id}`,
      type: 'article'
    }
  };
}

export default function ClippingPage({ params }: { params: { id: string } }) {
  const i = ORDERED_STORIES.findIndex((x) => x.id === params.id);
  if (i < 0) notFound();
  const s = ORDERED_STORIES[i];
  const prev = i > 0 ? ORDERED_STORIES[i - 1] : null;
  const next = i < ORDERED_STORIES.length - 1 ? ORDERED_STORIES[i + 1] : null;

  return (
    <ClippingStory
      story={s}
      index={i + 1}
      total={ORDERED_STORIES.length}
      prev={prev ? { id: prev.id, headline: prev.headline } : null}
      next={next ? { id: next.id, headline: next.headline } : null}
    />
  );
}
