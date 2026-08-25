import type { Backdrop, BackdropName, BackdropPalette } from './types';

import InkWash from './InkWash';
import Geometry from './Geometry';
import Fluid from './Fluid';
import Watercolour from './Watercolour';
import Techno from './Techno';
import Scrapbook from './Scrapbook';
import Topography from './Topography';
import Celestial from './Celestial';

/* ============================================================================
   registry — every backdrop world, and the palettes they are drawn with.

   Backdrops are interchangeable by design, so the page never imports one
   directly. It asks for a name and gets a component. That is what makes the
   A/B switcher possible, and what will let a section change its world without
   touching any drawing code.
   ========================================================================== */

export interface BackdropEntry {
  name: BackdropName;
  /** Shown in the switcher. */
  label: string;
  /** One line on what it is doing, so two worlds can be compared honestly. */
  note: string;
  Component: Backdrop;
}

export const BACKDROPS: readonly BackdropEntry[] = [
  {
    name: 'inkwash',
    label: 'Ink wash',
    note: 'Pigment that bleeds and pools, with edge darkening and paper granulation.',
    Component: InkWash
  },
  {
    name: 'geometry',
    label: 'Geometry',
    note: 'Rolling circles tracing epicycloids, construction marks, a recursive fractal.',
    Component: Geometry
  },
  {
    name: 'fluid',
    label: 'Fluid',
    note: 'Metaballs on a real implicit surface, so blobs stretch and snap together.',
    Component: Fluid
  },
  {
    name: 'watercolour',
    label: 'Watercolour',
    note: 'Draws itself in: pencil underdrawing, then washes, then ink on top.',
    Component: Watercolour
  },
  {
    name: 'techno',
    label: 'Techno',
    note: 'Glyph-grid telemetry: a live forward pass, a ground track, a radar sweep.',
    Component: Techno
  },
  {
    name: 'scrapbook',
    label: 'Scrapbook',
    note: 'Tape, torn edges and stubs, threaded by the real Split to Tagounite route.',
    Component: Scrapbook
  },
  {
    name: 'topography',
    label: 'Topography',
    note: 'Marching-squares contours that branch and form saddles, like a real survey.',
    Component: Topography
  },
  {
    name: 'celestial',
    label: 'Celestial',
    note: "A navigator's plate: star magnitudes, sextant arcs, rhumb lines.",
    Component: Celestial
  }
];

export function getBackdrop(name: BackdropName): BackdropEntry {
  return BACKDROPS.find((b) => b.name === name) ?? BACKDROPS[0];
}

/* ---------------------------------------------------------------------------
   Palettes. Every backdrop draws only from these five, which is what lets the
   whole page flip between paper and ink without a single backdrop knowing.
   --------------------------------------------------------------------------- */

export const LIGHT_PALETTE: BackdropPalette = {
  surface: '#E4DFD3',
  ink: '#17140F',
  ink2: '#443E34',
  accent: '#A83A29',
  accent2: '#2A4C7D'
};

export const DARK_PALETTE: BackdropPalette = {
  surface: '#14120E',
  ink: '#E4DFD3',
  ink2: '#9A9080',
  accent: '#D4674F',
  accent2: '#7FA0FF'
};

export function paletteFor(mode: 'light' | 'dark'): BackdropPalette {
  return mode === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
}
