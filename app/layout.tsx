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
  creator: 'Jack Smith',
  alternates: { canonical: '/' },
  /*
     Let the crawlers show the whole card. `max-image-preview: large` is the
     difference between Google rendering the share image at full width and
     rendering a thumbnail beside the result, and it is off by default — the
     card is drawn on purpose, so it may as well be seen.
  */
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1
    }
  },
  /* The paper the whole site is printed on, so a mobile browser's chrome
     stops being white above it. */
  themeColor: '#E4DFD3',
  openGraph: {
    title: 'Jack Smith — builds from the metal up',
    description:
      'Software rasterizers written from nothing, neural runtimes that never leave your machine, motion models that answer inside the editor.',
    url: 'https://jacksmith.me',
    siteName: 'Jack Smith',
    /*
       NO `images` HERE ANY MORE, and that is the point rather than an
       omission. It used to name public/Logo.png — the mark from the Prismic
       site of December 2024, two sites ago — so every share of this site was
       illustrated by the one before it. app/opengraph-image.png replaces it
       and is picked up by file convention, which also means the sub-routes
       inherit it: /projects, /clippings and all twenty detail pages declare
       their own titles and descriptions and none of them declared an image,
       so all of them were carrying that same stale logo.

       See scripts/build-pip-icons.js. The card is drawn from the sparrow
       sprite, so it cannot fall out of date with the bird the way a hand
       exported picture falls out of date with the site.
    */
    locale: 'en_GB',
    type: 'website'
  },
  twitter: {
    /* `summary` is the small square card. The image is 1200x630 now, which is
       the large card's shape, and asking for `summary` would have it cropped
       to a square thumbnail. */
    card: 'summary_large_image',
    title: 'Jack Smith — builds from the metal up',
    description:
      'Software rasterizers written from nothing, neural runtimes that never leave your machine, motion models that answer inside the editor.'
  }
};

/* ============================================================================
   STRUCTURED DATA, so the record is machine readable as well as legible.

   Everything below is already stated on the page in words — the name and the
   location in the hero eyebrow, the degree in its lede, the three addresses on
   the closing plate. None of it is a claim the site does not already make out
   loud, which is the only rule that matters here: structured data that says
   more than the page says is what a manual action is for.

   `@graph` rather than two separate blocks so the Person and the WebSite can
   point at each other by id. That link is the whole value of doing this: it
   tells a crawler that this domain is ONE named person's site rather than a
   company that happens to mention him, which is what a knowledge panel is
   assembled from.

   Sourced from lib/v2/content.ts and components/v2/ContactPlate.tsx by hand
   rather than imported, because those are client modules and this is the
   document. If the eyebrow or the three addresses change, change them here —
   there is a test for exactly this drift in nobody's test suite, so the note
   is the mechanism.
   ========================================================================== */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Person',
      '@id': 'https://jacksmith.me/#jack',
      name: 'Jack Smith',
      url: 'https://jacksmith.me',
      jobTitle: 'Software Engineer',
      description:
        'Software engineer working close to the metal: rasterizers, neural runtimes ' +
        'that stay on the machine, and motion models that answer inside the editor.',
      alumniOf: {
        '@type': 'CollegeOrUniversity',
        name: 'University of Sheffield'
      },
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Hemel Hempstead',
        addressCountry: 'GB'
      },
      knowsAbout: [
        'Computer Graphics',
        'Machine Learning',
        'Software Rasterization',
        'Unity',
        'TypeScript'
      ],
      sameAs: [
        'https://github.com/jedsmith2004',
        'https://linkedin.com/in/jack-ed-smith'
      ]
    },
    {
      '@type': 'WebSite',
      '@id': 'https://jacksmith.me/#site',
      url: 'https://jacksmith.me',
      name: 'Jack Smith',
      inLanguage: 'en-GB',
      author: { '@id': 'https://jacksmith.me/#jack' },
      publisher: { '@id': 'https://jacksmith.me/#jack' }
    }
  ]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* The scalable icon and the apple touch icon are app/icon.svg and
            app/apple-icon.png, which Next links by file convention. This is
            the fallback for anything that will not take an SVG icon, and it
            is declared with a size so a browser that reads both knows this is
            the 32px raster and the SVG is the one to scale. Both are Pip —
            see scripts/build-pip-icons.js. */}
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
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
        {/* Ahead of the page, because it is a statement about the document
            rather than a part of it. `JSON.stringify` and not a template
            literal: the description carries a colon and an apostrophe, and
            hand-quoted JSON in a script tag is how those become a parse error
            nobody notices for a year. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
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
