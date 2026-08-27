/* ============================================================================
   The root layout, for the site that now answers at the apex.

   THREE SITES, ONE NAME, AND THE THING THAT MAKES THE NAMING CONFUSING.

     jacksmith.me      this one. What the repository has always called v2:
                       the plates, the spine, the sparrow.
     v2.jacksmith.me   the previous site, the one with the question box. It
                       is frozen on the `site/v2-archive` branch.
     v1.jacksmith.me   the Prismic one from December 2024, its own repository.

   So `components/v2` and `lib/v2` are THIS site, and the address v2 belongs to
   the one before it. The directories were not renamed, because renaming them
   would have touched a hundred and fifty imports to change nothing that runs.
   The rule is: v2 inside the repository means the design, v2 in a URL means
   the archive.

   The layout itself is the old root layout with the old site's half removed.
   Gone: globals.css and the whole Tailwind base, which nothing here uses, and
   the flat near-black on <body>, which was the old site's ground. What is left
   is the document, the font preconnects, v2.css and the `.v2` scope that every
   rule in it hangs off.
   ========================================================================== */

import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import ClickSpark from '@/components/v2/ClickSpark';
import './v2.css';
/* The optional treatments in components/v2/text/*. Loaded here rather than per
   page because the effects are placed across the spine, the index and the
   project pages, and three copies of one small sheet is three round trips. */
import './text-effects.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://jacksmith.me'),
  title: 'Jack Smith — builds from the metal up',
  description:
    'Software rasterizers written from nothing, neural runtimes that never leave your machine, motion models that answer inside the editor. Computer Science, first class, University of Sheffield.',
  keywords: [
    'Software Engineer',
    'Computer Graphics',
    'Rasterizer',
    'Machine Learning',
    'Recensorium',
    'MotionGen',
    'Next.js',
    'TypeScript',
    'Unity'
  ],
  authors: [{ name: 'Jack Smith' }],
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Jack Smith — builds from the metal up',
    description:
      'Software rasterizers written from nothing, neural runtimes that never leave your machine, motion models that answer inside the editor.',
    url: 'https://jacksmith.me',
    siteName: 'Jack Smith',
    /* Logo rather than a screenshot of the page. The card that used to sit
       here, public/OG_image.png, is a photograph of the OLD site's hero, and
       it now advertises v2.jacksmith.me to anyone who shares this one. */
    images: [{ url: 'https://jacksmith.me/Logo.png', width: 1189, height: 1188 }],
    locale: 'en_GB',
    type: 'website'
  },
  twitter: {
    card: 'summary',
    title: 'Jack Smith — builds from the metal up',
    description:
      'Software rasterizers written from nothing, neural runtimes that never leave your machine, motion models that answer inside the editor.',
    images: ['https://jacksmith.me/Logo.png']
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Moved out of an `@import` at the top of v2.css, where it could not
            be requested until that file had downloaded and parsed. The preload
            scanner finds this on the first pass, which closes most of the
            window in which headings render in the fallback face — a face about
            10% wider than Bricolage Grotesque, so the swap was reflowing every
            heading on the page. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font --
            `no-page-custom-font` is a Pages Router rule: it fires because it
            cannot tell a page from a document, and warns that the font will
            "only load for a single page". This IS the document. app/layout.tsx
            wraps every route in the app, so the link is on every page, which is
            the exact outcome the rule exists to enforce. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400;12..96,75..100,600;12..96,75..100,700;12..96,75..100,800&family=Newsreader:ital,opsz,wght@0,6..72,200;0,6..72,300;0,6..72,400;1,6..72,300&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <div className="v2">{children}</div>
        {/* One canvas, one listener, and no frame loop between clicks. It is
            outside `.v2` because it is a fixed overlay over the whole document
            rather than a part of the plate stack. See ClickSpark.tsx. */}
        <ClickSpark />
        <Analytics />
      </body>
    </html>
  );
}
