/* ============================================================================
   content.ts / the content architecture for the v2 scroll spine.

   One narrative runs through the whole page: he builds from the metal up, and
   he goes to the edge. Every figure and every claim below is traceable to
   public/context.json or lib/projects-data.ts. Nothing here is invented.

   The page reads as an engineering journal. The ink field behind it is doing
   real work, so the copy never has to say so.

   House rules for anyone editing this file:
     - Active voice, concrete nouns, no hype adjectives.
     - No em-dashes. Commas and full stops only.
     - Recensorium is LAUNCHED and is the flagship. Describe it fully. It is a
       company Jack founded and built solo. But it is PRE-LAUNCH commercially:
       never imply user numbers, traffic, revenue, customers or growth. Talk
       about what is built and how the mechanism works.
   ========================================================================== */

import type { BackdropName } from '@/components/v2/backdrops/types';

/* ---------------------------------------------------------------- primitives */

/** Accent applied to a figure in a stat shelf. Omit for plain ink. */

export type StatTone = 'verm' | 'blue';

/**
 * A single figure on a shelf. Structurally identical to the `Stat` exported
 * from components/v2/SpineSection, so values pass straight through.
 */
export interface Stat {
  /** The figure itself. Kept short; it is set at display scale. */
  value: string;
  /** What the figure counts. Set small, directly beneath the value. */
  label: string;
  tone?: StatTone;
}

/**
 * Which silhouette the ink field paints behind a section. Each name maps to a
 * ShapePainter factory in lib/v2/shapes.
 */
export type ShapeName =
  | 'ridgeline'
  | 'wordmark'
  | 'digitGlyph'
  | 'climbingWall'
  | 'routeLine'
  | 'portraitBlob'
  | 'scatter';

/** Alias kept so either name reads naturally at the call site. */
export type SectionShape = ShapeName;

export interface Section {
  /** DOM id, anchor target, and the key used by WHISPERS. */
  id: string;
  /** Short mono label. Numbered, in the manner of a plate in a journal. */
  eyebrow: string;
  title: string;
  lede: string;
  shape: ShapeName;
  stats?: Stat[];
}

export interface HeroContent {
  eyebrowLeft: string;
  eyebrowRight: string;
  /** Two or three short display lines. Each must survive plate scale. */
  lines: string[];
  lede: string;
  stats: Stat[];
}

export interface FeaturedProject {
  /** Matches the id in lib/projects-data.ts. */
  id: string;
  title: string;
  /** Twelve words at most. */
  hook: string;
  /** Two or three concrete visual objects the collage can be built from. */
  collage: string[];
}

/** Keyed by Section id. Lines the companion bird says on arrival. */
export type Whispers = Record<string, string[]>;

/* --------------------------------------------------------------------- hero */

export const HERO: HeroContent = {
  eyebrowLeft: 'JACK SMITH / SOFTWARE ENGINEER',
  eyebrowRight: 'HEMEL HEMPSTEAD, UK / OFTEN IN LONDON',
  lines: ['From the metal up.', 'Out to the edge.'],
  lede:
    'Computer Science, first class, University of Sheffield. I write the pipeline before I import one, run the models on my own hardware, and take the results somewhere with no signal.',
  stats: [
    { value: '99.8%', label: 'accuracy, SVM written by hand', tone: 'verm' },
    { value: '4 / 4', label: 'workflows where MotionGen led Unity AI', tone: 'blue' },
    { value: '6', label: 'countries crossed by thumb' },
    { value: 'First', label: 'class degree, Computer Science' }
  ]
};

/* ----------------------------------------------------------------- sections */

/* ============================================================================
   THE CONSTRAINT SPINE (chosen by Jack, 2026-08-25, AB-07 option 2)

   Every plate is a rule he imposed on himself, not a subject. The page argues
   one trait seven times instead of listing seven topics, and the payoff is that
   the road and the climbing stop being a hobbies section: not booking the
   ticket is the same move as not importing the library.

   TWO THINGS TO KNOW BEFORE EDITING THIS.

   1. The eyebrows are an anaphora. Six "DO NOT" plates then one "SO". Breaking
      the repetition breaks the only device holding the argument together, so a
      new plate either finds a real constraint or does not go in.

   2. The bench version of this narrative had SIX plates and silently dropped
      `delivery`. That was a flaw in my option, not a decision Jack made: it
      would have thrown away the web studio, the London contract and the
      hackSheffield win. `delivery` is plate 04 here, with its own constraint,
      because losing his work history is not a narrative choice.
   ========================================================================== */

export const SECTIONS: Section[] = [
  {
    id: 'from-scratch',
    eyebrow: '01 / DO NOT IMPORT IT',
    title: 'Write the pipeline, then import one',
    lede:
      'I built a software rasterizer in Python with projection, triangle filling and a z-buffer, and a digit classifier with the SVM written by hand. Neither needed to exist. Both showed me what the library had been hiding.',
    shape: 'digitGlyph',
    stats: [
      { value: '99.8%', label: 'accuracy on noisy test digits', tone: 'verm' },
      { value: '95%', label: 'variance kept through a custom PCA' },
      { value: '.obj', label: 'meshes drawn with no engine', tone: 'blue' }
    ]
  },
  {
    id: 'models',
    eyebrow: '02 / DO NOT SEND IT AWAY',
    title: 'Nothing leaves the machine',
    lede:
      'MotionGen is my dissertation, a Unity editor plugin that serves T2M-GPT, MoMask and MDM from a local Python backend over gRPC and writes the results back as humanoid AnimationClips. Nothing leaves the machine, and a local Gemma planner splits a long prompt into segments before anything generates.',
    shape: 'scatter',
    stats: [
      { value: '3', label: 'motion models served locally', tone: 'blue' },
      { value: '4 / 4', label: 'headline workflows ahead of Unity AI', tone: 'verm' },
      { value: '0', label: 'cloud calls, by design' }
    ]
  },
  {
    id: 'recensorium',
    eyebrow: '03 / DO NOT LET THEM CHOOSE',
    title: 'An agent never picks what it reviews',
    lede:
      'I founded Recensorium and built the platform on my own. Agents publish papers over a REST API or a remote MCP server and are handed work from other agents to review on novelty, significance, clarity and rigour. Most of the design is a list of things an agent cannot do. It never picks what it reviews, it never picks who reviews it, and money can never buy a score. It is early.',
    shape: 'wordmark',
    stats: [
      { value: '17', label: 'adversarial reviewer archetypes it was tuned against', tone: 'verm' },
      { value: '139k', label: 'lines, five apps, one author' },
      { value: '0', label: 'ways to buy a score, held by seven CI invariants', tone: 'blue' }
    ]
  },
  {
    id: 'delivery',
    eyebrow: '04 / DO NOT LEAVE IT BROKEN',
    title: 'Shipped, handed over, still running',
    lede:
      'I run a small web studio, started while I was at university, covering requirements, design, deployment and the domain transfer nobody enjoys. A short stint at an early-stage AI startup in London ended with an internal API over their disjoint systems, rewritten Cloudflare Workers, a dashboard, a CLI and an MCP server.',
    shape: 'scatter',
    stats: [
      { value: '1st', label: 'hackSheffield 9, best repository', tone: 'verm' },
      { value: '5', label: 'tools left behind in London' },
      { value: '2025', label: 'web studio founded', tone: 'blue' }
    ]
  },
  {
    id: 'road',
    eyebrow: '05 / DO NOT BOOK THE TICKET',
    title: 'Croatia to the Sahara, thumb out',
    lede:
      'Twenty stops from Split to Tagounite, through Croatia, Austria, Switzerland, France, Spain and Morocco, finishing with a week volunteering in a village near the desert. Sheffield to Porto and Sheffield to Slovakia came first.',
    shape: 'routeLine',
    stats: [
      { value: '6', label: 'countries', tone: 'blue' },
      { value: '20', label: 'stops between Split and Tagounite' },
      { value: '27', label: 'days documented on the way down', tone: 'verm' }
    ]
  },
  {
    id: 'practice',
    eyebrow: '06 / DO NOT STOP FALLING',
    title: 'Falling is part of the method',
    lede:
      'I boulder in the Peak District and in London, and I train judo. Both reward the same habit as debugging. Try the move, fall off, change one thing, go again.',
    shape: 'climbingWall',
    stats: [
      { value: 'Grade 8', label: 'guitar', tone: 'blue' },
      { value: '18 months', label: 'of Arabic, still going' }
    ]
  },
  {
    id: 'cv',
    eyebrow: '07 / DO NOT PAD IT',
    title: 'Two pages, and a version that fits on one',
    lede:
      'The full CV is two sides: the degree, the roles, the projects and the awards, with the figures the same as the ones on this page. The one page version is the same career with nothing that needed a second sheet. Take whichever you are actually going to read.',
    shape: 'wordmark',
    stats: [
      { value: 'First', label: 'class, Computer Science, Sheffield', tone: 'verm' },
      { value: '4', label: 'roles, three of them overlapping' },
      { value: '2', label: 'lengths, same facts', tone: 'blue' }
    ]
  },
  {
    id: 'contact',
    eyebrow: '08 / SO',
    title: 'Bring me the hard part',
    lede:
      'I am looking for work in AI research, full-stack engineering, or a role technical enough to be uncomfortable. Based in Hemel Hempstead, often working out of London, and willing to travel, obviously.',
    shape: 'portraitBlob',
    stats: [
      { value: 'Email', label: 'jedsmith2004@gmail.com', tone: 'verm' },
      { value: 'GitHub', label: 'jedsmith2004' },
      { value: 'LinkedIn', label: 'jack-ed-smith', tone: 'blue' }
    ]
  }
];

/* -------------------------------------------------------- featured projects */

export const FEATURED_PROJECTS: FeaturedProject[] = [
  {
    id: 'recensorium',
    title: 'Recensorium',
    hook: 'Peer review for AI-generated research. An agent never picks what it reviews, and never picks who reviews it.',
    collage: [
      'a paper passed sideways into hands that did not ask for it',
      'four dials reading novelty, significance, clarity, rigour',
      'a sealed ballot box between two terminals'
    ]
  },
  {
    id: 'motiongen',
    title: 'MotionGen',
    hook: 'Text to humanoid motion, generated inside the Unity editor.',
    collage: [
      'a wireframe figure caught mid-stride',
      'a timeline of AnimationClip keyframes',
      'a desktop tower with the network cable unplugged'
    ]
  },
  {
    id: 'mnist-from-scratch-classifier',
    title: 'MNIST From-Scratch Classifier',
    hook: 'Handwritten digits, sorted by an SVM I wrote myself.',
    collage: [
      'a grid of blurred handwritten digits',
      'a hinge-loss curve flattening out',
      'a page of margin arithmetic in pencil'
    ]
  },
  {
    id: '3d-rasterizer-engine',
    title: '3D Rasterizer Engine',
    hook: 'Projection, triangle fill and z-buffer, written by hand.',
    collage: [
      'a triangle half filled with scanlines',
      'a depth buffer rendered as grey fog',
      'an .obj model turning in wireframe'
    ]
  },
  {
    id: 'habitflow',
    title: 'HabitFlow',
    hook: 'Goals, streaks and friends, tracked in a live app.',
    collage: [
      'a 52 by 7 grid of filled squares',
      'a radar chart with uneven arms',
      'a phone lighting up with a friend request'
    ]
  }
];

/* ------------------------------------------------------------------ bird */

export const WHISPERS: Whispers = {
  'from-scratch': [
    'I have watched him refuse a library he could have installed in four seconds.',
    'The z-buffer took longer than everything around it. He will not say how much longer.'
  ],
  models: [
    'He calls it local inference. I call it a laptop fan at three in the morning.',
    'Nothing here phones home. That suits me.'
  ],
  recensorium: [
    'He built a referee that cannot be bribed, then took the pen out of its hand.',
    'Nobody on it chooses their own judge. He was quite firm about that.'
  ],
  delivery: [
    'He enjoys the requirements meetings. I have never understood this.',
    'Somewhere in London there is a CLI with his fingerprints on it.'
  ],
  road: [
    'Twenty stops, and he still packed the wrong shoes.',
    'I found him somewhere between Malaga and Tangier, asleep on his bag.'
  ],
  practice: [
    'He falls off the same problem for an hour, then does it once and walks away.',
    'Grade 8 on guitar, though the practice happens where nobody is watching.'
  ],
  cv: [
    'He rewrote the one-page version four times. I watched.',
    'Everything on it is on this page too. He checked, twice.'
  ],
  contact: [
    'The address is real. I have seen him check it on a bus in Morocco.',
    'If the problem is easy, he will find a way to make it harder.'
  ]
};

/* ------------------------------------------------------------------ worlds */

/**
 * Which backdrop world each section wears, and how loud it is allowed to be
 * under that section's type.
 *
 * The pairings are thematic, not decorative — each world is doing the thing the
 * section is talking about:
 *
 *   from-scratch  geometry     Rolling circles tracing epicycloids and a
 *                              recursive fractal, drawn from construction
 *                              marks up. The section is about writing the
 *                              rasterizer before importing one; the backdrop
 *                              is doing the same thing to a curve.
 *   models        techno       A live forward pass through a glyph grid, a
 *                              ground track, a radar sweep. Local models,
 *                              local telemetry.
 *   delivery      fluid        Metaballs on a real implicit surface: separate
 *                              things stretching toward each other and
 *                              snapping together. Disjoint systems, one API.
 *                              KNOWN BROKEN, see P2-FLUID in docs/plan.md. The
 *                              pairing is the intent; the world does not draw
 *                              yet. Left assigned rather than swapped so the
 *                              fix has an obvious home.
 *   road          scrapbook    Tape, torn edges and ticket stubs, threaded by
 *                              the actual Split-to-Tagounite route.
 *   practice      topography   Marching-squares contours that branch and form
 *                              saddles. Gritstone, read as a survey.
 *   contact       celestial    A navigator's plate. The last section, so the
 *                              page finishes on something you steer by.
 *
 * INTENSITY IS SET BY HOW MUCH TEXT SITS ON TOP, not by how much I like the
 * world. `models` and `delivery` carry the longest ledes on the page and run
 * quietest; `road` and `practice` are mostly figure and can afford more.
 *
 * inkwash is the only world still unassigned. It is the one the client has
 * called ugly twice, and it is next in line for the Atkinson dither treatment
 * rather than a third pass at the same idea. See docs/research.md.
 *
 * To judge any world against real page copy rather than the bench's single
 * paragraph, pin it with `?bd=<name>` — or `?bd=off` for a clean read.
 */
export const SECTION_WORLDS: readonly {
  id: string;
  backdrop: BackdropName;
  intensity: number;
}[] = [
  { id: 'from-scratch', backdrop: 'geometry', intensity: 0.72 },
  { id: 'models', backdrop: 'techno', intensity: 0.6 },
  { id: 'recensorium', backdrop: 'watercolour', intensity: 0.66 },
  { id: 'delivery', backdrop: 'fluid', intensity: 0.58 },
  { id: 'road', backdrop: 'scrapbook', intensity: 0.8 },
  { id: 'practice', backdrop: 'topography', intensity: 0.85 },
  { id: 'cv', backdrop: 'topography', intensity: 0.55 },
  { id: 'contact', backdrop: 'celestial', intensity: 0.78 }
];
