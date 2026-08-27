/* ============================================================================
   chips — the things Pip is allowed to hand you.

   Jack, 2026-08-27: "add a chip he can insert into the conversation that takes
   you to any section, page, project, or blog when clicked, closing the chat.
   Also give him the ability to add my CV as a chip."

   A chip is a small pressable label in the transcript. Pip writes one by
   emitting a KEY in double brackets — `[[recensorium]]` — and the app turns
   that key into a destination, a label and a hit target.

   HE EMITS KEYS, NEVER URLS, AND THAT IS THE WHOLE DESIGN.

   The obvious version of this feature lets the model write a link. It should
   not be able to. A model writing hrefs invents `/projects/motion-gen` for a
   project filed under `motiongen`, or a `/blog/` prefix this site has never
   had, and the failure is silent: the chip renders, it looks right, and it
   404s when somebody presses it. Every key below is derived from the data that
   builds the actual routes — lib/projects-data.ts, SECTIONS, the clippings,
   the CV editions — so a chip either resolves to a page that exists or is
   dropped on the floor before it is ever drawn.

   That also means the catalogue cannot drift. Add a project and its chip
   appears; rename a section id and the chip follows it. Nothing here is typed
   out by hand except the four whole-page destinations, which are routes rather
   than records.

   THE KEYS ARE THE IDS. A project's chip key is its id in projects-data, a
   cutting's is its id in clippings, a plate's is its section id, so there is no
   second name to keep in step. The one exception is a genuine clash between
   two of those namespaces, which takes a suffix rather than losing an entry;
   see the note on `build`.
   ========================================================================== */

import { projects } from '@/lib/projects-data';
import { SECTIONS } from '@/lib/v2/content';
import { STORIES } from '@/lib/v2/clippings';
import { CV_EDITIONS } from '@/lib/v2/cv';

/** What kind of thing a chip goes to. Drives nothing but the prompt's shape. */
export type ChipKind = 'plate' | 'page' | 'project' | 'cutting' | 'cv';

export interface ChipTarget {
  key: string;
  kind: ChipKind;
  /** What the chip says when Pip does not name it himself. */
  label: string;
  /**
   * Where it goes.
   *
   * `section` is a plate on the home page and is handled by scrolling when the
   * reader is already there. `href` is a route. `external` opens in a new tab
   * and leaves the page where it is, which is what a PDF wants.
   */
  href?: string;
  section?: string;
  external?: boolean;
}

/* The four whole-page destinations. Written out because they are routes, not
   records; everything else below is derived. */
const PAGES: ChipTarget[] = [
  { key: 'home', kind: 'page', label: 'The front page', href: '/' },
  { key: 'projects', kind: 'page', label: 'Every project', href: '/projects' },
  { key: 'clippings', kind: 'page', label: 'Every cutting', href: '/clippings' }
];

/*
   THE KEYS COLLIDE, AND NOTHING MAY BE LOST TO A COLLISION.

   Three of these namespaces overlap. The plate `recensorium` and the project
   `recensorium` share an id, and so do `cv` the plate and the CV document. The
   first cut let the first writer win and dropped the loser silently, which
   made `[[cv]]` — the single chip Jack asked for by name — resolve to the
   PLATE about his CV rather than to the PDF.

   So a collision suffixes instead of discarding. Order decides who keeps the
   bare key, and it is chosen rather than incidental:

     CV documents first. Somebody asking for a CV wants the file.
     Plates next. "Tell me about Recensorium" from a reader on the front page
       is better answered by the argument than by the project page, and the
       plate links to the project anyway.
     Then projects, then cuttings, which take `-project` and `-cutting` on the
       two ids that clash and their own id everywhere else.

   Both names end up in the catalogue with their labels, so the model can see
   the difference and pick.
*/
function build(): Map<string, ChipTarget> {
  const out = new Map<string, ChipTarget>();
  const claim = (t: ChipTarget, suffix: string) => {
    const key = out.has(t.key) ? `${t.key}${suffix}` : t.key;
    /* Two suffixed collisions on one key would be a genuine data problem
       rather than a naming one, and silently dropping it is how this went
       wrong the first time. */
    if (out.has(key)) return;
    out.set(key, { ...t, key });
  };

  for (const cv of CV_EDITIONS) {
    /* One stable key per edition rather than per page count, so a rebuild that
       changes the length does not change the key. */
    claim(
      {
        key: cv.primary ? 'cv' : 'cv-one-page',
        kind: 'cv',
        label: cv.primary ? 'My CV, both pages' : 'My CV, one page',
        href: cv.href,
        external: true
      },
      '-pdf'
    );
  }
  for (const s of SECTIONS) {
    /* The label is the plate's TITLE, not its eyebrow: the title is the
       sentence a reader would recognise. */
    claim({ key: s.id, kind: 'plate', label: s.title, section: s.id }, '-plate');
  }
  for (const p of PAGES) claim(p, '-page');
  for (const p of projects) {
    claim({ key: p.id, kind: 'project', label: p.title, href: `/projects/${p.id}` }, '-project');
  }
  for (const s of STORIES) {
    claim({ key: s.id, kind: 'cutting', label: s.headline, href: `/clippings/${s.id}` }, '-cutting');
  }
  return out;
}

export const CHIP_TARGETS: Map<string, ChipTarget> = build();

export function chipFor(key: string): ChipTarget | undefined {
  return CHIP_TARGETS.get(key.trim().toLowerCase());
}

/** One chip as it appears in a message. */
export interface Chip {
  key: string;
  label: string;
}

/**
 * Pull `[[key]]` and `[[key|label]]` out of a reply.
 *
 * Returns the text with the markers removed and the chips it found, in order,
 * deduplicated. Unknown keys are dropped rather than shown: a chip that goes
 * nowhere is worse than no chip, and the model does occasionally invent one.
 *
 * The marker is also tolerated with spaces inside the brackets, because that
 * is the most common way a model gets it slightly wrong and it costs one `\s*`
 * to accept.
 */
export function parseChips(reply: string): { text: string; chips: Chip[] } {
  const chips: Chip[] = [];
  const seen = new Set<string>();

  const text = reply.replace(
    /\[\[\s*([a-z0-9_-]+)\s*(?:\|\s*([^\]]*?)\s*)?\]\]/gi,
    (_m, rawKey: string, rawLabel?: string) => {
      const target = chipFor(rawKey);
      if (!target) return '';
      if (!seen.has(target.key)) {
        seen.add(target.key);
        const label = (rawLabel || '').trim();
        chips.push({ key: target.key, label: label || target.label });
      }
      return '';
    }
  );

  return {
    /* Markers are usually written on their own line or after a sentence, so
       removing them leaves double spaces and trailing blank lines behind. */
    text: text.replace(/[ \t]{2,}/g, ' ').replace(/\s+\n/g, '\n').trim(),
    chips
  };
}

/**
 * The catalogue, as the system prompt sees it.
 *
 * Grouped and compact: this goes into every request, so it is written to be
 * scanned by the model rather than read by a person. Project and cutting keys
 * carry their titles because the key alone (`eyh-swarm-pipe-robots`) is not
 * always enough to know what it is.
 */
export function chipCatalogue(): string {
  const byKind = (kind: ChipKind) =>
    Array.from(CHIP_TARGETS.values()).filter((t) => t.kind === kind);

  const line = (t: ChipTarget) => `${t.key} (${t.label})`;

  return [
    `PLATES on the front page: ${byKind('plate').map(line).join(', ')}`,
    `PAGES: ${byKind('page').map(line).join(', ')}`,
    `PROJECTS: ${byKind('project').map(line).join(', ')}`,
    `CUTTINGS: ${byKind('cutting').map(line).join(', ')}`,
    `CV: ${byKind('cv').map(line).join(', ')}`
  ].join('\n');
}
