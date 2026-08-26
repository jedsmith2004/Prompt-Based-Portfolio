/* ============================================================================
   projectPages — what each project's own page is dressed in.

   Jack, 2026-08-26: "there is no link to each project (each should have its
   own custom page, with a custom background like we're doing here, like a blog
   post)."

   "Like we're doing here" is the load-bearing half. The spine works because
   each plate is a different room: its own palette, its own world running
   behind the type, its own key. A project page that inherited the front page's
   colours would be a template with a title swapped into it, which is the thing
   the whole site is arguing against.

   So every project gets a PLATE and a WORLD, and they are chosen rather than
   hashed. The pairing is the argument in each case:

     the from-scratch plate      goes to the two things written from nothing
     the models plate            goes to the things that run locally
     the road plate              goes to the things built for other people
     the practice plate          goes to the ones that were an experiment

   Falling back on a hash would be fine and would also be a lie: it would look
   deliberate and mean nothing. Anything not named below gets a stable
   arrangement from its id, so a project added to lib/projects-data.ts has a
   page immediately rather than a broken one, and the fallback is a placeholder
   for a decision, not the decision.
   ========================================================================== */

import type { BackdropName } from '@/components/v2/backdrops/types';
import { plateFor, modeForSection, type PaletteMode } from '@/lib/v2/palettes';

export interface ProjectDress {
  /** Plate id from lib/v2/palettes. Drives the whole page's colour. */
  plate: string;
  /** Which world runs behind the type. */
  world: BackdropName;
  /**
   * 0..1, how loud that world is allowed to be under this much body copy.
   *
   * Quieter than the same world runs on the spine, and deliberately. A spine
   * plate is mostly figure and air with a short lede; a project page is one
   * long column of reading. A world at spine volume behind six hundred words
   * is not a background, it is interference.
   */
  intensity: number;
  /** The form the page settles in. */
  mode: PaletteMode;
}

/* Every world is used, and no plate carries more than three projects. */
const DRESS: Record<string, Omit<ProjectDress, 'mode'>> = {
  /* the company: work handed sideways between agents that did not ask for it */
  recensorium: { plate: 'recensorium', world: 'braid', intensity: 0.44 },
  /* three motion models served off a machine with the cable out */
  motiongen: { plate: 'models', world: 'techno', intensity: 0.4 },
  /* streaks, read as a survey */
  habitflow: { plate: 'delivery', world: 'topography', intensity: 0.48 },
  /* a neighbourhood, pinned together */
  neighbourly: { plate: 'road', world: 'scrapbook', intensity: 0.42 },
  'alexnet-transfer-classifier': { plate: 'models', world: 'techno', intensity: 0.36 },
  'natural-systems-and-rl': { plate: 'practice', world: 'topography', intensity: 0.44 },
  'client-website-sheffield': { plate: 'delivery', world: 'watercolour', intensity: 0.4 },
  'old-personal-portfolio': { plate: 'cv', world: 'inkwash', intensity: 0.32 },
  'language-learning-app': { plate: 'road', world: 'braid', intensity: 0.4 },
  /* written from nothing: construction marks up */
  'mnist-from-scratch-classifier': { plate: 'from-scratch', world: 'geometry', intensity: 0.5 },
  '3d-rasterizer-engine': { plate: 'from-scratch', world: 'geometry', intensity: 0.52 },
  'eyh-swarm-pipe-robots': { plate: 'contact', world: 'braid', intensity: 0.42 },
  'interactive-ai-portfolio': { plate: 'top', world: 'inkwash', intensity: 0.34 },
  /* the one you take somewhere with no signal */
  'offline-ai-app': { plate: 'contact', world: 'celestial', intensity: 0.48 },
  'texas-holdem-haskell': { plate: 'practice', world: 'geometry', intensity: 0.42 }
};

const PLATE_CYCLE = ['from-scratch', 'models', 'recensorium', 'delivery', 'road', 'practice', 'cv', 'contact'];
const WORLD_CYCLE: BackdropName[] = [
  'geometry', 'techno', 'braid', 'watercolour', 'scrapbook', 'topography', 'celestial', 'inkwash'
];

/** Stable per-id fallback. Not a design; a placeholder that will not crash. */
function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function dressFor(id: string): ProjectDress {
  const named = DRESS[id];
  if (named) {
    return { ...named, mode: modeForSection(plateFor(named.plate).id) };
  }
  const h = hash(id);
  const plate = PLATE_CYCLE[h % PLATE_CYCLE.length];
  return {
    plate,
    world: WORLD_CYCLE[(h >> 5) % WORLD_CYCLE.length],
    intensity: 0.42,
    mode: modeForSection(plate)
  };
}
