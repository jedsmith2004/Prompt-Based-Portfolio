/* ============================================================================
   /v2/projects/[id] — one project, as a page.

   A server component, so the fifteen pages are generated at build time and each
   one carries its own title and description into the document head. Everything
   visual is in ProjectStory, which is a client component because it runs a
   palette, a canvas world and a bird.

   The ORDER is computed here and passed down rather than recomputed in the
   client: the index at /v2/projects sorts newest first, and the plate number
   and the newer/older links on this page have to agree with it.
   ========================================================================== */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { projects } from '@/lib/projects-data';
import ProjectStory from '@/components/v2/ProjectStory';
import './story.css';

/* Newest first. The dates are human strings like 'May 2026', so parse rather
   than sort lexically, which would put April before January. Same table as
   app/v2/projects/page.tsx, and it has to stay the same table. */
const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9,
  nov: 10, dec: 11
};

function dateKey(d: string): number {
  const m = d.trim().toLowerCase().match(/^([a-z]+)\s+(\d{4})$/);
  if (!m) return -1;
  const month = MONTHS[m[1]];
  const year = Number(m[2]);
  if (month === undefined || !Number.isFinite(year)) return -1;
  return year * 12 + month;
}

const ORDERED = projects.slice().sort((a, b) => dateKey(b.date) - dateKey(a.date));

export function generateStaticParams() {
  return ORDERED.map((p) => ({ id: p.id }));
}

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const p = ORDERED.find((x) => x.id === params.id);
  if (!p) return { title: 'Project not found' };
  return {
    title: `${p.title} — Jack Smith`,
    /* The record's first sentence. Trimmed rather than rewritten, so the page
       and the index cannot drift apart. */
    description: p.description.split('. ')[0] + '.',
    robots: { index: false, follow: false }
  };
}

export default function ProjectPage({ params }: { params: { id: string } }) {
  const i = ORDERED.findIndex((x) => x.id === params.id);
  if (i < 0) notFound();
  const p = ORDERED[i];
  const prev = i > 0 ? ORDERED[i - 1] : null;
  const next = i < ORDERED.length - 1 ? ORDERED[i + 1] : null;

  return (
    <ProjectStory
      project={p}
      index={i + 1}
      total={ORDERED.length}
      prev={prev ? { id: prev.id, title: prev.title } : null}
      next={next ? { id: next.id, title: next.title } : null}
    />
  );
}
