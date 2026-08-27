/* ============================================================================
   404, the route.

   A server component, and it exists only so the page can carry its own title.
   Everything visible is in components/v2/NotFoundView.tsx, which has to be a
   client component because all three of its treatments run in the browser: a
   canvas tearing the numerals, a CSS glitch on the eyebrow, and a typed line.

   `robots: noindex` because an error page that ranks is worse than one that
   does not exist.
   ========================================================================== */

import type { Metadata } from 'next';
import NotFoundView from '@/components/v2/NotFoundView';

export const metadata: Metadata = {
  title: 'Not found — Jack Smith',
  description: 'This address does not resolve to anything on this site.',
  robots: { index: false, follow: true }
};

export default function NotFound() {
  return <NotFoundView />;
}
