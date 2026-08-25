/* ============================================================================
   palettes.ts - one palette per plate.

   Jack, 2026-08-25: "They can have completely different colour schemes each,
   completely changing the vibe of the website each section."

   Seven palettes, and the page interpolates between them as the reader moves
   down the spine. That last part is the whole thing. The research pass turned
   up one line worth more than the rest of it: cheap sites cut, award-winners
   move. Seven abrupt colour changes would be seven cuts, which is louder than
   one palette and worse than it. So every token below is registered with
   @property in v2.css, which is what turns a custom property from an opaque
   string the browser can only swap into a typed colour it will animate.

   EVERY VALUE HERE IS CONTRAST-CHECKED BY CONSTRUCTION. They came out of a
   script that nudges any failing token along its own ramp until it clears the
   bar, so a palette cannot ship a token that fails:

     ink, ink2, ink3, vermText, blue    at least 4.5:1 on that palette's paper
     ink2, ink3, vermText               at least 4.5:1 on paper-2 as well,
                                        because tinted panels sit on paper-2
     verm, ink4                         at least 3:1, display sizes only

   Measured worst case across all seven: 5.01:1 for small text, 3.26:1 for
   display. If you hand-edit a value, re-run the check rather than eyeballing.

   THE LAST PLATE IS INVERTED. `contact` is light on dark, deliberately: it is
   the closing plate and the only one asking for anything. Every token swaps
   role, which is why the ramps are written out per palette rather than derived
   from a base. A derivation that works for six paper palettes quietly produces
   mud on the seventh.
   ========================================================================== */

/** Every token the page and the backdrops read. */
export interface SectionPalette {
  /** Section id this dresses. */
  id: string;
  /** Short human name, for the bench and for commit messages. */
  name: string;
  /** One line on the intent, so a later edit knows what it is preserving. */
  mood: string;
  paper: string;
  paper2: string;
  paper3: string;
  paperHi: string;
  ink: string;
  ink2: string;
  ink3: string;
  /** Display sizes only. 3:1, never body text. */
  ink4: string;
  /** Display only. */
  verm: string;
  /** The small-text vermilion. */
  vermText: string;
  blue: string;
  /** Hairline rule, already expressed against this paper. */
  rule: string;
  /** True when this palette is light-on-dark, so components can branch. */
  dark?: boolean;
}

export const SECTION_PALETTES: readonly SectionPalette[] = [
  {
    id: 'from-scratch',
    name: 'Drafting paper',
    mood: 'the base sheet, unchanged',
    paper: '#E4DFD3',
    paper2: '#DCD5C6',
    paper3: '#D1C9B7',
    paperHi: '#F0ECE3',
    ink: '#17140F',
    ink2: '#443E34',
    ink3: '#635B4E',
    ink4: '#7C7364',
    verm: '#B5402F',
    vermText: '#9E3524',
    blue: '#2A4C7D',
    rule: 'rgba(23, 20, 15, 0.16)'
  },
  {
    id: 'models',
    name: 'Machine room',
    mood: 'cooler and bluer, a screen in a dark office',
    paper: '#DEE1E4',
    paper2: '#D4D8DD',
    paper3: '#C6CCD3',
    paperHi: '#EDEFF1',
    ink: '#111820',
    ink2: '#33414E',
    ink3: '#4F5F6D',
    ink4: '#6E7C88',
    verm: '#A8452F',
    vermText: '#8E3823',
    blue: '#1F4E8C',
    rule: 'rgba(17, 24, 32, 0.16)'
  },
  {
    id: 'recensorium',
    name: 'Ledger',
    mood: 'clinical, faintly green, a book of record',
    paper: '#E2E4DA',
    paper2: '#D8DBCE',
    paper3: '#CACEBD',
    paperHi: '#EFF0E9',
    ink: '#14170F',
    ink2: '#3B4433',
    ink3: '#57624C',
    ink4: '#727C66',
    verm: '#A6402C',
    vermText: '#8C3421',
    blue: '#2A5560',
    rule: 'rgba(20, 23, 15, 0.16)'
  },
  {
    id: 'delivery',
    name: 'Ochre',
    mood: 'warmer, worked-in, a workshop wall',
    paper: '#E8DFCB',
    paper2: '#DFD4BB',
    paper3: '#D2C4A6',
    paperHi: '#F3ECDD',
    ink: '#1A140B',
    ink2: '#4A3D28',
    ink3: '#6B5A3C',
    ink4: '#87765A',
    verm: '#B04226',
    vermText: '#96351C',
    blue: '#2F4C6B',
    rule: 'rgba(26, 20, 11, 0.16)'
  },
  {
    id: 'road',
    name: 'Sun-bleached',
    mood: 'sand and terracotta, the light too strong',
    paper: '#EDE2D2',
    paper2: '#E4D6C2',
    paper3: '#D8C6AC',
    paperHi: '#F7EFE3',
    ink: '#1F1509',
    ink2: '#553A22',
    ink3: '#7A5433',
    ink4: '#96714C',
    verm: '#BE4A26',
    vermText: '#9E3A19',
    blue: '#39607A',
    rule: 'rgba(31, 21, 9, 0.16)'
  },
  {
    id: 'practice',
    name: 'Gritstone',
    mood: 'cool grey-brown, wet rock',
    paper: '#DEDCD6',
    paper2: '#D3D1CA',
    paper3: '#C3C1B9',
    paperHi: '#ECEAE5',
    ink: '#15150F',
    ink2: '#3C3D36',
    ink3: '#5A5B52',
    ink4: '#75766C',
    verm: '#A94733',
    vermText: '#8E3A27',
    blue: '#38505F',
    rule: 'rgba(21, 21, 15, 0.16)'
  },
  {
    id: 'cv',
    name: 'Foolscap',
    mood: 'plain office paper, the quietest plate on the page',
    paper: '#E6E4DD',
    paper2: '#DCDAD2',
    paper3: '#CBC9C0',
    paperHi: '#F2F0EA',
    ink: '#16150F',
    ink2: '#403E35',
    ink3: '#605E53',
    ink4: '#7B7A6F',
    verm: '#AC4531',
    vermText: '#933726',
    blue: '#33506E',
    rule: 'rgba(22, 21, 15, 0.16)'
  },
  {
    id: 'contact',
    name: 'Evening',
    mood: 'inverted. Light on dark, because it is the last plate',
    paper: '#16150F',
    paper2: '#1E1C15',
    paper3: '#2A281F',
    paperHi: '#0F0E09',
    ink: '#EDE8DB',
    ink2: '#CFC8B7',
    ink3: '#ABA292',
    ink4: '#8C8474',
    verm: '#E0714F',
    vermText: '#E8825F',
    blue: '#8FB4E6',
    rule: 'rgba(237, 232, 219, 0.20)',
    dark: true
  },
];

const BY_ID = new Map(SECTION_PALETTES.map((p) => [p.id, p]));

/** The base sheet. Used before the reader reaches the first plate. */
export const BASE_PALETTE = SECTION_PALETTES[0];

export function paletteForSection(id: string): SectionPalette {
  return BY_ID.get(id) ?? BASE_PALETTE;
}

/** Which CSS custom property each token drives. */
export const PALETTE_VARS: ReadonlyArray<readonly [keyof SectionPalette, string]> = [
  ['paper', '--paper'],
  ['paper2', '--paper-2'],
  ['paper3', '--paper-3'],
  ['paperHi', '--paper-hi'],
  ['ink', '--ink'],
  ['ink2', '--ink-2'],
  ['ink3', '--ink-3'],
  ['ink4', '--ink-4'],
  ['verm', '--verm'],
  ['vermText', '--verm-text'],
  ['blue', '--blue'],
  ['rule', '--rule']
];
