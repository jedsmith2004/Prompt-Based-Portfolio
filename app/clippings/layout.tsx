/* ============================================================================
   Metadata for /clippings and everything under it.

   The index itself is a client component (it mounts the companion), so it
   cannot export `metadata` and without this it would inherit the home page's
   title verbatim. Same arrangement, and same reason, as app/projects/layout.tsx.

   IT MUST SET ITS OWN CANONICAL. The root layout declares `canonical: '/'`,
   and canonical is inherited, so a section index that stays quiet does not get
   "no canonical" — it gets one saying it is a duplicate of the home page,
   which is an instruction to drop it from the index. The five article pages
   each set their own, so nothing here leaks down to them.
   ========================================================================== */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cuttings — Jack Smith',
  description:
    'Five judged competitions between 2022 and 2025: an AR lens opened a million times, a charity venture built off a hundred pounds, a talk on drug policy, a hackathon repository prize, and a swarm robotics concept.',
  alternates: { canonical: '/clippings' },
  openGraph: {
    title: 'Cuttings — Jack Smith',
    description: 'Five judged competitions, 2022 to 2025, each one with its own page.',
    url: '/clippings'
  }
};

export default function ClippingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
