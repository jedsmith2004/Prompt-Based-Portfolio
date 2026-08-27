'use client';

/* ============================================================================
   CurriculumVitae — the two CVs, offered honestly.

   Jack, 2026-08-25: "There needs to be a section for my CV."

   There are two of them published, and they are not the same document with
   different margins: one is the full record and one is the single sheet you
   hand someone who is going to read it standing up. Offering both, and saying
   which is which, is more useful than picking one and hiding the other.

   NO PREVIEW IFRAME. An embedded PDF viewer is a 250KB download nobody asked
   for, it ignores the page's palette entirely, and on mobile it renders as a
   grey box with a download button in it — which is what this section already
   is, only worse. The cards say what each file is and how big it is, and the
   browser's own viewer does the rest.

   Every figure here is measured from the actual file, not asserted: page counts
   were read out of the PDF page tree and the sizes off disk. If the CVs are
   rebuilt and change length, these need re-reading. They are the sort of small
   claim that quietly goes stale and makes everything near it look careless.

   AND THEY DID GO STALE, WITHIN THE HOUR. The first version of this file
   described a two-page CV of 252KB read straight out of the working tree.
   Jack: "the two page CV is the wrong version, the right version is on the
   live jacksmith.me." He was right: the published file is 276,063 bytes
   against the working tree's 258,441. The one-page edition was byte-identical,
   so only the full CV had drifted.

   THE PART WORTH REMEMBERING IS THAT ORIGIN ALREADY HAD IT. `origin/master`'s
   copy is 276,063 bytes, the same as the live site. The rule about reading
   project facts from `origin/master` rather than the working tree was already
   written down, and had already been applied that same session to
   `lib/projects-data.ts` and `public/context.json` — just not to this. A rule
   applied to the files you happen to think of is not a rule.

   `cv/cv.html` was behind too, so rebuilding locally would have regenerated
   the wrong document. Both come from `origin/master` now.
   ========================================================================== */

/* The editions live in lib/v2/cv.ts so the server can read them too; see the
   header there. Re-exported because Hero and CvPlanks import them from here
   and there is no reason to make them care where they moved to. */
export type { CvEdition } from '@/lib/v2/cv';
export { CV_EDITIONS } from '@/lib/v2/cv';
import { CV_EDITIONS } from '@/lib/v2/cv';

export interface CurriculumVitaeProps {
  className?: string;
}

export default function CurriculumVitae({ className }: CurriculumVitaeProps) {
  return (
    <div className={`v2-cv${className ? ' ' + className : ''}`}>
      <ul className="v2-cv-list">
        {CV_EDITIONS.map((cv) => (
          /* data-perch: the card's top border is the visible line, so no
             inset. See THE PERCH CONTRACT in components/v2/Companion.tsx. */
          <li key={cv.href} className={cv.primary ? 'is-primary' : undefined} data-perch>
            <a href={cv.href} target="_blank" rel="noopener noreferrer">
              <span className="v2-cv-label">{cv.label}</span>
              <span className="v2-cv-for">{cv.forWhom}</span>
              <span className="v2-cv-meta">
                <b>PDF</b>
                <i>
                  {cv.pages} {cv.pages === 1 ? 'page' : 'pages'}
                </i>
                <i>{cv.kb} KB</i>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="v2-cv-note">
        Both open in a new tab. If you would rather have a specific format, or a
        version cut down to one thing, ask and you will get it the same day.
      </p>
    </div>
  );
}
