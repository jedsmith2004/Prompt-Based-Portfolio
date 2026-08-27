/* ============================================================================
   Metadata for /projects and everything under it.

   The index itself is a client component, so it cannot export `metadata` and
   without this it would inherit the home page's title verbatim.

   IT HAS TO SET A CANONICAL, and the reason this file originally argued the
   opposite is worth keeping. The worry was that a canonical here would be
   inherited by all fifteen project pages and name /projects as the canonical
   URL of every one of them. That was a real risk and it is no longer live:
   every project page sets its own in `generateMetadata`, so nothing here
   reaches them.

   What staying quiet actually did was inherit from further up. The root layout
   declares `canonical: '/'`, so /projects was shipping a canonical saying it
   was a duplicate of the home page — an explicit instruction to leave the
   whole project index out of the search results.
   ========================================================================== */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Projects — Jack Smith',
  description:
    'Fifteen projects, newest first: software rasterizers, neural runtimes that stay on the device, motion models inside the Unity editor, and the peer review company built around them.',
  alternates: { canonical: '/projects' },
  openGraph: {
    title: 'Projects — Jack Smith',
    description: 'Fifteen projects, newest first, each one with its own page.',
    url: '/projects'
  }
};

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
