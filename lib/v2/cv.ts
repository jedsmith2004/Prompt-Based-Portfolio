/* ============================================================================
   cv — the published CV editions, as data.

   Lifted out of components/v2/CurriculumVitae.tsx when a THIRD consumer
   arrived that cannot import a React component: the system prompt in
   lib/ai-utils.ts runs on the server and builds Pip's chip catalogue, and
   pulling a `'use client'` module into that graph to read two file paths is
   the wrong shape entirely.

   The component still re-exports these, so every existing import keeps
   working and there is one place the editions are written down.

   Every figure here is measured from the actual file, not asserted: the page
   counts were read out of the PDF page tree and the sizes off disk. If the
   CVs are rebuilt and change length these need re-reading — they are the sort
   of small claim that quietly goes stale and makes everything near it look
   careless, and they have gone stale once already.
   ========================================================================== */

export interface CvEdition {
  /** Path under /public, already URL-encoded where it needs to be. */
  href: string;
  /** What to call it. */
  label: string;
  /** Who it is for. One line. */
  forWhom: string;
  pages: number;
  kb: number;
  /** The long one is the default offer. */
  primary?: boolean;
}

export const CV_EDITIONS: readonly CvEdition[] = [
  {
    href: '/CV%20Jack%20Smith.pdf',
    label: 'Full CV',
    forWhom: 'Everything: the degree, the roles, the projects and the awards.',
    pages: 2,
    kb: 270,
    primary: true
  },
  {
    href: '/CV%20Jack%20Smith%20-%20One%20Page.pdf',
    label: 'One page',
    forWhom: 'The same career with nothing that needed a second sheet.',
    pages: 1,
    kb: 209
  }
];
