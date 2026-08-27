/* ============================================================================
   The sitemap, generated rather than kept.

   public/sitemap.xml used to hold two hand-written URLs and it was already a
   year out of date: it listed the old site's home and index and none of the
   fifteen project pages, because those did not exist when it was written. A
   file in public/ is served before any route of the same name, so the static
   one had to go for this to be reachable at all.

   Same source and same ordering as app/projects/[id]/page.tsx. If a project is
   added to lib/projects-data.ts it appears here without anybody remembering to
   come and add it.
   ========================================================================== */

import type { MetadataRoute } from 'next';
import { projects } from '@/lib/projects-data';
import { ORDERED_STORIES } from '@/lib/v2/clippings';

const BASE = 'https://jacksmith.me';

/* 'May 2026' and the like. Same table as the project page, and it has to stay
   the same table: lexical sorting puts April before January. */
const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9,
  nov: 10, dec: 11
};

function lastModified(date: string): Date {
  const m = date.trim().toLowerCase().match(/^([a-z]+)\s+(\d{4})$/);
  if (!m) return new Date();
  const month = MONTHS[m[1]];
  const year = Number(m[2]);
  if (month === undefined || !Number.isFinite(year)) return new Date();
  return new Date(Date.UTC(year, month, 1));
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE, changeFrequency: 'monthly', priority: 1 },
    { url: `${BASE}/projects`, changeFrequency: 'monthly', priority: 0.8 },
    ...projects.map((p) => ({
      url: `${BASE}/projects/${p.id}`,
      lastModified: lastModified(p.date),
      changeFrequency: 'yearly' as const,
      priority: 0.6
    })),
    { url: `${BASE}/clippings`, changeFrequency: 'yearly' as const, priority: 0.5 },
    /* Same arrangement as the projects above: read from the data, so a cutting
       added to lib/v2/clippings.ts appears here without anybody remembering. */
    ...ORDERED_STORIES.map((s) => ({
      url: `${BASE}/clippings/${s.id}`,
      lastModified: lastModified(s.date),
      changeFrequency: 'yearly' as const,
      priority: 0.4
    }))
  ];
}
