/* ============================================================================
   palettes.ts - one plate, two forms.

   Jack, 2026-08-25: "They can have completely different colour schemes each,
   completely changing the vibe of the website each section."
   Jack, 2026-08-26: "This should be a dark mode part of the site ... changing
   it from light mode (there should be a light mode variant) to dark mode."

   So every plate below is authored TWICE, in a light form and a dark form, and
   declares which of the two it settles in. That is a bigger idea than a theme
   toggle and it is what the two transition devices need in order to exist: the
   bird cannot pull a light switch unless the room he is standing in has a
   working light and a working dark.

   THE MODE RUN, top to bottom:

     top            light    the opening sheet
     from-scratch   DARK     <- the bird pulls the switch
     models         DARK
     recensorium    light    <- the bird pulls it back
     delivery       light
     road           light
     practice       DARK     <- the sun goes down instead
     cv             DARK
     contact        DARK

   Three changes across nine plates, and each one is an EVENT rather than a
   crossfade. Which device fires where is not arbitrary: the first two changes
   happen on the plates about building things at a desk, so they are a switch on
   a wall. The third happens on the plate about being outside on rock, so it is
   the sun going down. Indoors you flip a switch. Outdoors you wait.

   The tokens still interpolate. Every one is registered with @property in
   v2.css, which is what turns a custom property from an opaque string the
   browser can only swap into a typed colour it will animate, and the research
   line that bought all of this is still true: cheap sites cut, award-winners
   move.

   EVERY VALUE HERE IS CONTRAST-CHECKED BY CONSTRUCTION, in both forms. They
   came out of a script that nudges any failing token along its own lightness
   ramp, holding hue and saturation, until it clears the bar:

     ink, ink2, ink3, vermText, blue    at least 4.5:1 on that form's paper
     ink2, ink3, vermText               at least 4.5:1 on paper-2 as well,
                                        because tinted panels sit on paper-2
     verm, ink4                         at least 3:1, display sizes only

   Measured worst case across all NINE plates in BOTH forms: 4.50:1 for small
   text, 3.26:1 for display. If you hand-edit a value, re-run the check rather
   than eyeballing it. Eighteen forms is too many to hold in your head, and a
   dark form that fails is the specific bug Jack reported on the contact plate.
   ========================================================================== */

/** Every token the page and the backdrops read. One concrete form. */
export interface SectionPalette {
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
  /** Emphasis vermilion, one step further from the paper. Hover, mostly. */
  vermDeep: string;
  blue: string;
  blueDeep: string;
  /** Hairline rule, already expressed against this paper. */
  rule: string;
  /** The mid rule. 37 uses. */
  ruleFirm: string;
  /**
   * The 2px structural rule under every plate eyebrow. 10 uses.
   *
   * THIS TOKEN IS WHY THE DARK MODE WAS BROKEN. All three rules used to be
   * fixed rgba() values on :root, built once from the light palette's ink, and
   * at 86% of near-black on near-black paper this is not a faint line, it is
   * no line at all. Five of the nine plates would have lost the rule that
   * holds the whole editorial grid together. Generated per form now.
   */
  ruleHard: string;
  /** True when this form is light-on-dark, so components can branch. */
  dark?: boolean;
}

export type PaletteMode = 'light' | 'dark';

/** A plate: an identity, and the same identity in both forms. */
export interface Plate {
  /** Section id. `top` is the hero, which is not a section but has a palette. */
  id: string;
  /** Short human name, for the bench and for commit messages. */
  name: string;
  /** One line on the intent, so a later edit knows what it is preserving. */
  mood: string;
  /** Which form this plate settles in as you read it. */
  mode: PaletteMode;
  /**
   * Which device narrates the change INTO this plate, when there is one.
   *
   * It belongs to the plate being entered rather than the one being left,
   * because scrolling back up has to play the same device in reverse: the
   * sun that went down over the gritstone is the sun that comes back up.
   * Defaults to the switch. Only the outdoor plate overrides it.
   */
  via?: 'switch' | 'dial';
  light: SectionPalette;
  dark: SectionPalette;
}

export const PLATES: readonly Plate[] = [
  {
    id: 'top',
    name: 'Ridgeline',
    mood: 'the opening sheet. Paper, and the particles on it',
    mode: 'light',
    light: {
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
      vermDeep: '#832A1B',
      blue: '#2A4C7D',
      blueDeep: '#203C64',
      rule: 'rgba(23, 20, 15, 0.16)',
      ruleFirm: 'rgba(23, 20, 15, 0.42)',
      ruleHard: 'rgba(23, 20, 15, 0.86)',
    },
    dark: {
      paper: '#15130E',
      paper2: '#1D1A14',
      paper3: '#28241B',
      paperHi: '#0E0C08',
      ink: '#E6E1D5',
      ink2: '#C6BFAF',
      ink3: '#A29A8A',
      ink4: '#847C6D',
      verm: '#DC6A4C',
      vermText: '#E4805F',
      vermDeep: '#EB977B',
      blue: '#8CB0E4',
      blueDeep: '#A8C4EC',
      rule: 'rgba(230, 225, 213, 0.2)',
      ruleFirm: 'rgba(230, 225, 213, 0.46)',
      ruleHard: 'rgba(230, 225, 213, 0.9)',
      dark: true,
    },
  },
  {
    id: 'from-scratch',
    name: 'Drafting table',
    mood: 'the lamp on and the room off. Construction lines on black paper',
    mode: 'dark',
    light: {
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
      vermDeep: '#832A1B',
      blue: '#2A4C7D',
      blueDeep: '#203C64',
      rule: 'rgba(23, 20, 15, 0.16)',
      ruleFirm: 'rgba(23, 20, 15, 0.42)',
      ruleHard: 'rgba(23, 20, 15, 0.86)',
    },
    dark: {
      paper: '#100F0C',
      paper2: '#181712',
      paper3: '#242219',
      paperHi: '#0A0907',
      ink: '#EDE8DA',
      ink2: '#CCC5B4',
      ink3: '#A8A08F',
      ink4: '#8A8271',
      verm: '#E06B4C',
      vermText: '#EA8360',
      vermDeep: '#F09B7D',
      blue: '#8FB6EE',
      blueDeep: '#ADCAF4',
      rule: 'rgba(237, 232, 218, 0.2)',
      ruleFirm: 'rgba(237, 232, 218, 0.46)',
      ruleHard: 'rgba(237, 232, 218, 0.9)',
      dark: true,
    },
  },
  {
    id: 'models',
    name: 'Machine room',
    mood: 'cooler and bluer, a screen in a dark office',
    mode: 'dark',
    light: {
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
      vermDeep: '#732C1A',
      blue: '#1F4E8C',
      blueDeep: '#173D70',
      rule: 'rgba(17, 24, 32, 0.16)',
      ruleFirm: 'rgba(17, 24, 32, 0.42)',
      ruleHard: 'rgba(17, 24, 32, 0.86)',
    },
    dark: {
      paper: '#0B1016',
      paper2: '#12181F',
      paper3: '#1C242D',
      paperHi: '#070A0E',
      ink: '#DFE6EC',
      ink2: '#B6C2CD',
      ink3: '#93A2AF',
      ink4: '#788895',
      verm: '#E06E4E',
      vermText: '#EE8663',
      vermDeep: '#F49E81',
      blue: '#79ABF2',
      blueDeep: '#98BFF7',
      rule: 'rgba(223, 230, 236, 0.2)',
      ruleFirm: 'rgba(223, 230, 236, 0.46)',
      ruleHard: 'rgba(223, 230, 236, 0.9)',
      dark: true,
    },
  },
  {
    id: 'recensorium',
    name: 'Ledger',
    mood: 'clinical, faintly green, a book of record',
    mode: 'light',
    light: {
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
      vermDeep: '#712818',
      blue: '#2A5560',
      blueDeep: '#1E3F48',
      rule: 'rgba(20, 23, 15, 0.16)',
      ruleFirm: 'rgba(20, 23, 15, 0.42)',
      ruleHard: 'rgba(20, 23, 15, 0.86)',
    },
    dark: {
      paper: '#0D100B',
      paper2: '#141810',
      paper3: '#1F251A',
      paperHi: '#080A07',
      ink: '#E4E8DC',
      ink2: '#C0C8B4',
      ink3: '#9EA891',
      ink4: '#828C75',
      verm: '#DA6D46',
      vermText: '#E6845F',
      vermDeep: '#ED9B7C',
      blue: '#77BACB',
      blueDeep: '#8FC8D6',
      rule: 'rgba(228, 232, 220, 0.2)',
      ruleFirm: 'rgba(228, 232, 220, 0.46)',
      ruleHard: 'rgba(228, 232, 220, 0.9)',
      dark: true,
    },
  },
  {
    id: 'delivery',
    name: 'Ochre',
    mood: 'warmer, worked-in, a workshop wall',
    mode: 'light',
    light: {
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
      vermDeep: '#7A2914',
      blue: '#2F4C6B',
      blueDeep: '#233A53',
      rule: 'rgba(26, 20, 11, 0.16)',
      ruleFirm: 'rgba(26, 20, 11, 0.42)',
      ruleHard: 'rgba(26, 20, 11, 0.86)',
    },
    dark: {
      paper: '#13100A',
      paper2: '#1B170E',
      paper3: '#272117',
      paperHi: '#0C0A06',
      ink: '#EFE6D2',
      ink2: '#CFC2A6',
      ink3: '#AC9E80',
      ink4: '#8D8067',
      verm: '#E17A4E',
      vermText: '#EE8A5C',
      vermDeep: '#F4A07A',
      blue: '#8FB3DE',
      blueDeep: '#A9C6E7',
      rule: 'rgba(239, 230, 210, 0.2)',
      ruleFirm: 'rgba(239, 230, 210, 0.46)',
      ruleHard: 'rgba(239, 230, 210, 0.9)',
      dark: true,
    },
  },
  {
    id: 'road',
    name: 'Sun-bleached',
    mood: 'sand and terracotta, the light too strong',
    mode: 'light',
    light: {
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
      vermDeep: '#812E12',
      blue: '#39607A',
      blueDeep: '#2D4D63',
      rule: 'rgba(31, 21, 9, 0.16)',
      ruleFirm: 'rgba(31, 21, 9, 0.42)',
      ruleHard: 'rgba(31, 21, 9, 0.86)',
    },
    dark: {
      paper: '#16100A',
      paper2: '#1F170E',
      paper3: '#2C2116',
      paperHi: '#0E0A06',
      ink: '#F2E6D4',
      ink2: '#D3BF9F',
      ink3: '#B09876',
      ink4: '#907B5D',
      verm: '#E46A38',
      vermText: '#F08350',
      vermDeep: '#F5996E',
      blue: '#79ADC9',
      blueDeep: '#91BDD5',
      rule: 'rgba(242, 230, 212, 0.2)',
      ruleFirm: 'rgba(242, 230, 212, 0.46)',
      ruleHard: 'rgba(242, 230, 212, 0.9)',
      dark: true,
    },
  },
  {
    id: 'practice',
    name: 'Gritstone',
    mood: 'wet rock after the sun has gone off it',
    mode: 'dark',
    via: 'dial',
    light: {
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
      vermDeep: '#742E1E',
      blue: '#38505F',
      blueDeep: '#2A3D49',
      rule: 'rgba(21, 21, 15, 0.16)',
      ruleFirm: 'rgba(21, 21, 15, 0.42)',
      ruleHard: 'rgba(21, 21, 15, 0.86)',
    },
    dark: {
      paper: '#0E0F0D',
      paper2: '#161713',
      paper3: '#22231D',
      paperHi: '#090A08',
      ink: '#E6E5DC',
      ink2: '#C3C3B7',
      ink3: '#A09F93',
      ink4: '#838276',
      verm: '#D9694A',
      vermText: '#E7825F',
      vermDeep: '#EE997C',
      blue: '#7FAEC4',
      blueDeep: '#96BED0',
      rule: 'rgba(230, 229, 220, 0.2)',
      ruleFirm: 'rgba(230, 229, 220, 0.46)',
      ruleHard: 'rgba(230, 229, 220, 0.9)',
      dark: true,
    },
  },
  {
    id: 'cv',
    name: 'Foolscap',
    mood: 'plain office paper, read late',
    mode: 'dark',
    light: {
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
      vermDeep: '#782B1D',
      blue: '#33506E',
      blueDeep: '#273E57',
      rule: 'rgba(22, 21, 15, 0.16)',
      ruleFirm: 'rgba(22, 21, 15, 0.42)',
      ruleHard: 'rgba(22, 21, 15, 0.86)',
    },
    dark: {
      paper: '#101010',
      paper2: '#181816',
      paper3: '#242420',
      paperHi: '#0A0A09',
      ink: '#E9E7DE',
      ink2: '#C7C5B9',
      ink3: '#A4A296',
      ink4: '#87857A',
      verm: '#DC6A4A',
      vermText: '#E9835F',
      vermDeep: '#F09A7C',
      blue: '#87AEDC',
      blueDeep: '#A1C1E5',
      rule: 'rgba(233, 231, 222, 0.2)',
      ruleFirm: 'rgba(233, 231, 222, 0.46)',
      ruleHard: 'rgba(233, 231, 222, 0.9)',
      dark: true,
    },
  },
  {
    id: 'contact',
    name: 'Evening',
    mood: 'the last plate, and the only one asking for anything',
    mode: 'dark',
    light: {
      paper: '#E9E5D9',
      paper2: '#DFDACB',
      paper3: '#CFC9B7',
      paperHi: '#F4F1E9',
      ink: '#16150F',
      ink2: '#413D33',
      ink3: '#615C50',
      ink4: '#7C776B',
      verm: '#B04430',
      vermText: '#963725',
      vermDeep: '#7B2B1C',
      blue: '#2E4F76',
      blueDeep: '#233E5D',
      rule: 'rgba(22, 21, 15, 0.16)',
      ruleFirm: 'rgba(22, 21, 15, 0.42)',
      ruleHard: 'rgba(22, 21, 15, 0.86)',
    },
    dark: {
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
      vermDeep: '#EF997C',
      blue: '#8FB4E6',
      blueDeep: '#ABC7EE',
      rule: 'rgba(237, 232, 219, 0.2)',
      ruleFirm: 'rgba(237, 232, 219, 0.46)',
      ruleHard: 'rgba(237, 232, 219, 0.9)',
      dark: true,
    },
  },
];

const BY_ID = new Map(PLATES.map((p) => [p.id, p]));

/** The opening sheet. Used before the reader reaches the first plate. */
export const BASE_PLATE = PLATES[0];
export const BASE_PALETTE = BASE_PLATE.light;

export function plateFor(id: string): Plate {
  return BY_ID.get(id) ?? BASE_PLATE;
}

/** The mode a plate settles in. What drives the switch and the dial. */
export function modeForSection(id: string): PaletteMode {
  return plateFor(id).mode;
}

/**
 * The concrete colours for a plate in a given form.
 *
 * `mode` is passed rather than read off the plate because during a transition
 * the page is deliberately showing a plate in the form it does NOT settle in:
 * that is the whole point of the light switch. Half a second before the bird
 * pulls the cord, plate 01 is being rendered in its light form.
 */
export function paletteForSection(id: string, mode: PaletteMode): SectionPalette {
  const p = plateFor(id);
  return mode === 'dark' ? p.dark : p.light;
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
  ['vermDeep', '--verm-deep'],
  ['blue', '--blue'],
  ['blueDeep', '--blue-deep'],
  ['rule', '--rule'],
  ['ruleFirm', '--rule-firm'],
  ['ruleHard', '--rule-hard'],
];
