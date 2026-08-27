/* ============================================================================
   sparrowSprite — art and animation data for the pixel sparrow.

   This file is a PIXEL PUPPET, not a flipbook. Nothing here renders, moves or
   decides anything: it is pure data plus the types that describe it. A
   consumer (canvas component + physics) owns all of that.

   ---------------------------------------------------------------------------
   HOW TO COMPOSITE A FRAME
   ---------------------------------------------------------------------------
   1. Start with an empty SPRITE_WIDTH x SPRITE_HEIGHT grid.
   2. Walk DRAW_ORDER back-to-front. For each PartName `p`:
        const def   = PARTS[p];
        const pose  = frame[p] ?? {};                  // see step 4
        const name  = pose.variant ?? def.rest;        // omitted => rest variant
        const spr   = def.variants[name];
        const x     = def.anchor.x + (spr.ox ?? 0) + Math.round(pose.dx ?? 0);
        const y     = def.anchor.y + (spr.oy ?? 0) + Math.round(pose.dy ?? 0);
      Blit spr.matrix at (x, y): row r, column c is the character
      spr.matrix[r][c]; '.' means "leave whatever is underneath", anything else
      is a key into PALETTE. Later parts paint over earlier ones — that is the
      whole occlusion model, there is no alpha.
   3. If the keyframe that is currently *entered* carries `flip: true`, toggle
      the sprite's facing and mirror the finished grid horizontally about
      SPRITE_WIDTH / 2. The art is authored facing RIGHT. Facing is sprite
      state owned by the consumer; `flip` is a one-shot toggle applied once,
      on frame entry, never re-applied while the frame is held.
   4. A keyframe's `pose` is SPARSE and is merged against the REST pose, NOT
      against the previous keyframe. Any part or property left out snaps back
      to rest (dx 0, dy 0, `def.rest` variant). This is deliberate: poses stay
      readable, and no animation can leak state into the next one.

   ---------------------------------------------------------------------------
   HOW TO INTERPOLATE
   ---------------------------------------------------------------------------
   Frames are a timeline. `frames[i].d` is how long it takes to travel FROM
   frames[i] TO frames[i + 1] (or back to frames[0] when `loop` is true; for a
   non-looping animation the final frame's `d` is a hold before the animation
   reports done).

     const t = elapsedInFrame / frames[i].d;        // 0..1
     const e = ease(frames[i].ease ?? 'linear', t);

   INTERPOLATED (continuous, ease-able):
     - dx, dy on every part.

   SNAPPED (discrete, must NEVER be blended or crossfaded):
     - `variant` on every part. Take frames[i]'s variant for the whole of
       frames[i]'s duration; swap on the instant frames[i + 1] is entered.
     - `flip`.
   Pixel art dies the moment a variant swap is crossfaded or a sub-pixel
   offset is drawn, so: round dx/dy to whole pixels at blit time (step 2
   already does), and read variants from the *outgoing* frame only.

   `ease: 'hold'` means "do not interpolate at all across this frame" — dx/dy
   stay at frames[i]'s values for the full duration and then jump. Use it for
   the deliberate stillness between two poses; it is why several animations
   carry the same pose twice in a row.

   ---------------------------------------------------------------------------
   COORDINATES
   ---------------------------------------------------------------------------
   Origin is top-left. +x is forward (the direction the bird faces), +y is
   down. The feet stand on BASELINE_Y. Everything is authored so the rest pose
   fits inside the canvas with a little slack for animation offsets; the canvas
   is intentionally a couple of pixels larger than the silhouette so a stretch
   or a hop apex does not clip.

   World position (where on the page the bird actually is) is NOT in this file.
   Locomotion animations only carry the in-sprite lean, bob and foot placement;
   the physics owner translates the whole sprite.
   ========================================================================== */

/* ==========================================================================
   types
   ========================================================================== */

/** Rows of equal-length strings. '.' is transparent; any other char keys PALETTE. */
export type PixelMatrix = readonly string[];

/** Every character that may legally appear in a PixelMatrix (besides '.'). */
export type PaletteChar =
  | 'K' | 'M' | 'L' | 'B' | 'b' | 'C' | 'H' | 'V' | 'v'
  /* --- added for props: see the palette block for the reasoning ----------- */
  | 'G' | 'g' | 'N' | 'n' | 'W'
  /* --- and one more, once, for the caster's book. See PALETTE. ------------ */
  | 'Y';

export type ShadowVariant = 'wide' | 'mid' | 'narrow' | 'none';

/**
 * `streamer` is the speed carriage: feathers trailing dead flat behind.
 * `hidden` is one transparent pixel — the front-facing and robed poses have
 * no tail to show, and a neutral tail poking out from behind either of them
 * reads as a mistake rather than as a bird.
 */
export type TailVariant = 'neutral' | 'up' | 'down' | 'fan' | 'streamer' | 'hidden';

/**
 * `splay` is a leg thrown out sideways (skydive, tumble); `kick` is a leg
 * slid out flat along the ground (moonwalk, heel click).
 *
 * `crossed` is BOTH feet, drawn once, symmetric about the sprite centre line:
 * the lotus tuck for the front-facing meditation perch. It goes on `legFront`
 * with `legBack` set to `hidden`, because two independently anchored legs
 * cannot be made symmetric — their anchors are three pixels apart by design.
 * `hidden` is one transparent pixel, for the leg a robe or a body covers.
 */
export type LegVariant =
  | 'down' | 'up' | 'crouch' | 'extended' | 'tucked' | 'splay' | 'kick'
  | 'crossed' | 'hidden';

/**
 * `flat` is the belly-down freefall silhouette: wider, shorter, no shoulder.
 *
 * Two additions, both for the chat perches:
 *   `front` — the bird seen head-on, symmetric about x = 10. It exists so the
 *     meditation perch can face the reader; every other front-facing part
 *     (`head.front`, `eye.frontOpen`, `beak.front`, `wing.spreadBoth`,
 *     `legFront.crossed`) is centred on the same line and they are only ever
 *     correct together.
 *   `robe` — a caster's robe, hem on BASELINE_Y so it stands rather than
 *     floats, with the legs set to `hidden` underneath it.
 */
export type BodyVariant = 'neutral' | 'fluffed' | 'flat' | 'front' | 'robe';

/**
 * `flare` throws the wing wide and forward (a flourish, a flip, a brag).
 * `down` is the bottom of a downstroke, hanging below the shoulder.
 * `reach` is the wing straight up, gripping something above the bird.
 */
export type WingVariant =
  | 'folded' | 'half' | 'spread' | 'up' | 'tucked' | 'flare' | 'down' | 'reach'
  | 'spreadBoth';

/**
 * `sleek` is the head with every feather laid back: speed, dives, jetpacks.
 * `front` is head-on, part of the front-facing set.
 */
export type HeadVariant = 'neutral' | 'fluffed' | 'sleek' | 'front';

/**
 * `wide` is alarm, `dizzy` is a crash, `sparkle` is a bird pleased with itself.
 * `frontOpen` / `frontClosed` are the head-on PAIR of eyes, drawn as a single
 * sprite: a symmetric pair cannot be built out of a single-eye anchor.
 */
export type EyeVariant =
  | 'open' | 'half' | 'closed' | 'arc' | 'wide' | 'dizzy' | 'sparkle'
  | 'frontOpen' | 'frontClosed';

/**
 * `wide` is a shout; `grip` is a beak clamped on a rope, a handle, a stem, or
 * a stolen mouse pointer. `front` is the head-on wedge.
 */
export type BeakVariant = 'closed' | 'open' | 'wide' | 'grip' | 'front';

/**
 * Worn on the crown. `none` is a single transparent pixel, so the slot costs
 * nothing on every animation that does not use it.
 */
export type HatVariant =
  | 'none'
  | 'peashooter'
  | 'peashooterFire'
  | 'propellerA'
  | 'propellerB'
  /**
   * A caster's hood. It is a HAT and not part of `body.robe` for one reason:
   * the hat slot draws over the skull and under the face, so the hood can
   * swallow the crown without ever swallowing an eye. Its front rim is cut
   * back deliberately — see the sprite note — so the eye at dx +2 lands in
   * the opening rather than on the fabric.
   */
  | 'hood';

/**
 * Worn on the back, behind everything. Small enough to belong to the puppet;
 * anything larger than the bird (canopies, balloons, saucers) is a PROP.
 */
export type GearVariant =
  | 'none'
  | 'jetpack'
  | 'jetpackLow'
  | 'jetpackHigh'
  | 'chutePack'
  | 'harness';

/**
 * The puppet's parts and the variant vocabulary each one accepts.
 *
 * Two legs rather than one `leg`: a hop reads as a hop only if the near and
 * far foot can disagree, and the far leg is painted in the deeper vermilion
 * so it sits behind the body.
 */
export interface PartVariantMap {
  shadow: ShadowVariant;
  gear: GearVariant;
  tail: TailVariant;
  legBack: LegVariant;
  body: BodyVariant;
  legFront: LegVariant;
  wing: WingVariant;
  head: HeadVariant;
  hat: HatVariant;
  eye: EyeVariant;
  beak: BeakVariant;
}

export type PartName = keyof PartVariantMap;

/** The union of every variant name in the puppet. */
export type PartVariant = PartVariantMap[PartName];

export interface PartSprite {
  readonly matrix: PixelMatrix;
  /** Per-variant nudge off the part anchor, so differently sized variants line up. */
  readonly ox?: number;
  readonly oy?: number;
}

export interface PartDef<P extends PartName> {
  readonly anchor: { readonly x: number; readonly y: number };
  /** Variant used whenever a keyframe does not name one. */
  readonly rest: PartVariantMap[P];
  readonly variants: { readonly [V in PartVariantMap[P]]: PartSprite };
}

/** dx/dy INTERPOLATE. variant SNAPS. */
export type PartPose<P extends PartName> = {
  readonly dx?: number;
  readonly dy?: number;
  readonly variant?: PartVariantMap[P];
};

/** Sparse: anything omitted falls back to rest, never to the previous frame. */
export type Pose = { readonly [P in PartName]?: PartPose<P> };

export type Easing = 'linear' | 'in' | 'out' | 'inOut' | 'hold';

export interface Keyframe {
  /** Milliseconds spent travelling from this frame to the next. */
  readonly d: number;
  readonly ease?: Easing;
  /** One-shot facing toggle, applied on frame entry. Snaps, never blends. */
  readonly flip?: boolean;
  readonly pose: Pose;
}

/**
 * `interaction` is reader-triggered, `chat` is the perch loops that run while
 * the chat window is open, `easterEgg` is the scripted set pieces. All three
 * are additions; the original three are untouched and mean what they meant.
 */
export type AnimationGroup =
  | 'stationary'
  | 'locomotion'
  | 'transit'
  | 'interaction'
  | 'chat'
  | 'easterEgg';

export interface Animation {
  readonly name: AnimationName;
  readonly group: AnimationGroup;
  /** When true the last frame interpolates back into the first, forever. */
  readonly loop: boolean;
  readonly frames: readonly Keyframe[];
}

/* ==========================================================================
   palette

   Harmonised with the site tokens rather than with a generic sprite ramp:
   the outline is the page's ink, the highlights are the page's paper, and the
   only saturated colour is the vermilion already used for accents. The two
   browns are the sparrow's own plumage and are the only hues that do not
   appear elsewhere in the design system.
   ========================================================================== */
export const PALETTE: { readonly [C in PaletteChar]: string } = {
  K: '#17140F', // ink            — outline
  M: '#443E34', // ink-2          — deep shade, jaw and underbelly
  L: '#7C7364', // ink-3          — ground shadow
  B: '#6B5136', // plumage dark   — crown, nape, mantle
  b: '#8C6E49', // plumage light  — cheek, coverts, flank
  C: '#D1C9B7', // paper-3        — throat and breast
  H: '#E4DFD3', // paper          — eye glint
  V: '#B5402F', // vermilion      — beak, near leg
  v: '#8A2E20', // vermilion deep — beak shade, far leg

  /* --- prop-only hues -----------------------------------------------------
     Five additions, and no more. The bird itself never uses any of them: they
     exist so that a pea can be a pea and a screen can be a screen. Both blues
     are the site's own --blue lightened; both greens are pulled toward olive
     until they sit on paper without shouting; W is --paper-hi, the only value
     brighter than H. */
  G: '#4F5E34', // foliage deep   — pea shell, zombie skin shade
  g: '#77874C', // foliage light  — pea highlight, zombie skin
  N: '#2A4C7D', // blue           — screen bezel, saucer hull
  n: '#5C7BA8', // blue light     — screen glow, tractor beam
  W: '#F0ECE3', // paper-hi       — page, orb core, paper plane

  /* A clearer item-gold: bright enough for the Totem of Undying silhouette,
     still warm enough to sit on paper and double as the caster book tooling. */
  Y: '#D8B43F', // gold           — totem body and book tooling
};

/* ==========================================================================
   dimensions and timing
   ========================================================================== */

/**
 * Canvas the puppet composites into.
 *
 * Much taller than the bird on purpose. A hop carries its own vertical arc in
 * the keyframes (see the locomotion section), and the apex lifts the head six
 * rows above where it rests, so the canvas has to hold that or the bird gets
 * decapitated mid-hop.
 *
 * These two numbers have NOT changed and must not: the rig centres on them.
 * They are the nominal box, not a clip rect — see SPRITE_MARGIN.
 */
export const SPRITE_WIDTH = 20;
export const SPRITE_HEIGHT = 28;

/** Footprint of the rest pose, shadow included. For centring on a perch. */
export const SPRITE_BOUNDS = {
  x: 2,
  y: 7,
  width: 15,
  height: 20,
} as const;

/**
 * How far past the nominal box the added animations actually reach, in sprite
 * pixels. Measured, not guessed — every keyframe in the file was walked.
 *
 * The compositor draws parts straight onto the page canvas at an offset, so
 * nothing here needs clipping and nothing here is a bug. This exists so that
 * anything which DOES want a bounded surface — an offscreen buffer, a dirty
 * rect, a hit region — knows how much room to leave.
 *
 *   left   1  tail `streamer` swung back a pixel (rope, umbrella, plane)
 *   right  2  the beak at full stretch in `peckAtCursor`
 *   top    3  the head at the apex of `jumpHigh`
 *   bottom 11 `pvzBurrow` / `pvzPopUp`, which is the point of them
 *
 * That bottom figure is the one to care about: it is not overflow, it is the
 * bird being underground, and the rig must clip it at BASELINE_Y + 1 or the
 * easter egg turns into a sparrow standing calmly below the floor. Every
 * other margin here is a pixel or two of limb and can simply be drawn.
 */
export const SPRITE_MARGIN = {
  left: 1,
  right: 2,
  top: 3,
  bottom: 11,
} as const;

/** Row the feet rest on. Anything the bird stands on should put its top here. */
export const BASELINE_Y = 25;

/**
 * Sample the timeline at 30fps and no faster. Pixel art has no sub-pixel
 * detail to reward a higher rate, and 30 is what the keyframe durations were
 * timed against — most of them are multiples of ~33ms, so a 30fps sampler
 * lands close to the authored beat.
 *
 * Drive it off one rAF loop with an accumulator rather than setInterval, and
 * clamp the delta (see FRAME_MS_MAX) so a backgrounded tab does not fast-
 * forward the bird through six hops on return.
 */
export const FRAME_RATE = 30;
export const FRAME_MS = 1000 / FRAME_RATE;
export const FRAME_MS_MAX = 100;

/** Suggested integer upscale. Never draw at a fractional scale. */
export const PIXEL_SCALE = 4;

/* ==========================================================================
   draw order — back to front
   ========================================================================== */
export const DRAW_ORDER: readonly PartName[] = [
  'shadow',
  /* Worn on the back, so behind everything the bird is made of. */
  'gear',
  'tail',
  'legBack',
  'body',
  'legFront',
  'wing',
  'head',
  /* On the crown, over the skull but under the face, so a hat never eats an eye. */
  'hat',
  'eye',
  'beak',
];

/* ==========================================================================
   parts

   Proportions are tuned for cute, not for ornithology: the head is 9px across
   on an 11px body, the eye takes up a third of the face, and every silhouette
   is rounded off at the corners so there is not a straight edge anywhere.

   Each part is anchored at its top-left. Variants of different sizes carry
   ox/oy so they stay registered to the same joint — a raised wing is not a
   folded wing that has drifted, it is the same shoulder with a different limb
   hanging off it.
   ========================================================================== */
export const PARTS: { readonly [P in PartName]: PartDef<P> } = {
  /* --- ground shadow ------------------------------------------------------
     Widens as the bird crouches, shrinks at a hop apex, vanishes in flight.
     Centred on x = 10 in every variant. */
  shadow: {
    anchor: { x: 7, y: 26 },
    rest: 'mid',
    variants: {
      wide: {
        matrix: [
          '..LLLLL..',
          '.LLLLLLL.',
        ],
      },
      mid: { ox: 1, matrix: ['.LLLLL.'] },
      narrow: { ox: 2, matrix: ['.LLL.'] },
      none: { matrix: ['.'] },
    },
  },

  /* --- gear ---------------------------------------------------------------
     Strapped to the back, drawn behind the whole bird. Everything in here is
     narrow enough to live left of the body's x = 6 edge, so the layering
     barely matters — but behind is where a backpack belongs, so behind it is.

     `none` is one transparent pixel. Every animation that does not name a
     gear variant therefore pays exactly one blit of nothing, which is the
     price of having the slot at all. */
  gear: {
    anchor: { x: 2, y: 15 },
    rest: 'none',
    variants: {
      none: { matrix: ['.'] },

      /** Idle, unlit. The two H pixels are the fuel window. */
      jetpack: {
        matrix: [
          '.KKKK.',
          'KMMMMK',
          'KMHHMK',
          'KMHHMK',
          'KMMMMK',
          'KMMMMK',
          '.KMMK.',
          '.KVVK.',
          '..KK..',
        ],
      },

      /** Between pulses. */
      jetpackLow: {
        matrix: [
          '.KKKK.',
          'KMMMMK',
          'KMHHMK',
          'KMHHMK',
          'KMMMMK',
          'KMMMMK',
          '.KMMK.',
          '.KVVK.',
          '..VV..',
          '..vv..',
          '...v..',
        ],
      },

      /** On the pulse. Alternate the two and the climb reads as thrust. */
      jetpackHigh: {
        matrix: [
          '.KKKK.',
          'KMMMMK',
          'KMHHMK',
          'KMHHMK',
          'KMMMMK',
          'KMMMMK',
          '.KMMK.',
          '.KVVK.',
          '.VVVV.',
          '.VVvv.',
          '..vvv.',
          '..vv..',
          '...v..',
        ],
      },

      /** Packed chute, still on the back. The whole point of `downSkydive`. */
      chutePack: {
        oy: 3,
        matrix: [
          '.KKKK.',
          'KCCCCK',
          'KCHHCK',
          'KCCCCK',
          'KMCCMK',
          '.KCCK.',
          '..KK..',
        ],
      },

      /**
       * Deployed: risers running up off the top of the canvas to meet the
       * `parachute` prop. Draws above y = 0 on purpose — see the prop notes.
       */
      harness: {
        ox: -1,
        oy: -13,
        matrix: [
          'K......K',
          'K......K',
          '.K....K.',
          '.K....K.',
          '..K..K..',
          '..K..K..',
          '..K..K..',
          '...KK...',
          '...KK...',
          '..KCCK..',
          '..KCCK..',
          '..KCCK..',
          '..KMMK..',
          '...KK...',
          '...KK...',
          '....K...',
        ],
      },
    },
  },

  /* --- tail ---------------------------------------------------------------
     Behind the body, and mostly read as silhouette. `up` is the alert and
     launch cock, `down` is the settled droop, `fan` is braking and landing. */
  tail: {
    anchor: { x: 2, y: 19 },
    rest: 'neutral',
    variants: {
      neutral: {
        matrix: [
          '....KK',
          '.KKKBB',
          'KBBBbb',
          '.KKKKK',
        ],
      },
      up: {
        oy: -2,
        matrix: [
          'KK....',
          'KBK...',
          '.KBBK.',
          '..KBBB',
          '...KKK',
        ],
      },
      down: {
        oy: 1,
        matrix: [
          '....KK',
          '..KKBB',
          '.KBBbb',
          'KBBK..',
          'KKK...',
        ],
      },
      fan: {
        ox: -1,
        oy: -1,
        matrix: [
          'KK....KK',
          'KBKK.KBB',
          '.KBBKBbb',
          '.KBBBBbb',
          '..KBBBbb',
          '...KKKKK',
        ],
      },
      /**
       * Dead flat and trailing. The whole silhouette narrows to three rows,
       * which is what sells speed at this size — a fanned tail at terminal
       * velocity reads as braking, and braking is not what a dive is.
       */
      streamer: {
        ox: -2,
        oy: 1,
        matrix: [
          '..KKKKK.',
          'KBBBbbbK',
          '.KKKKKK.',
        ],
      },
      /** No tail at all: head-on, or buried under a robe. */
      hidden: { matrix: ['.'] },
    },
  },

  /* --- far leg ------------------------------------------------------------
     Deep vermilion so it reads as behind the body without needing an outline. */
  legBack: {
    anchor: { x: 8, y: 23 },
    rest: 'down',
    variants: {
      down: {
        matrix: [
          '.v.',
          '.v.',
          'vvv',
        ],
      },
      up: {
        matrix: [
          '.v.',
          'vvv',
        ],
      },
      crouch: {
        oy: 1,
        matrix: [
          '.v.',
          'vvv',
        ],
      },
      extended: {
        matrix: [
          '.v.',
          '.v.',
          '.v.',
          'vvv',
        ],
      },
      tucked: { oy: -2, matrix: ['vvv'] },
      /** Thrown out behind and sideways: freefall, tumbles, crash landings. */
      splay: {
        ox: -1,
        matrix: [
          '..v.',
          'vvv.',
          'v...',
        ],
      },
      /** Slid out flat along the floor. The moonwalk leg. */
      kick: {
        ox: -1,
        oy: 1,
        matrix: [
          '..v.',
          'vvv.',
        ],
      },
      /**
       * The lotus tuck, both feet at once, symmetric about x = 10. Present on
       * this leg only so the type stays whole; the front-facing perch uses
       * `legFront.crossed` and sets this leg to `hidden`.
       */
      crossed: {
        ox: -1,
        oy: -1,
        matrix: [
          '.v...v.',
          'vvv.vvv',
          '..vvv..',
        ],
      },
      /** Nothing. For the leg a robe or a head-on body covers. */
      hidden: { matrix: ['.'] },
    },
  },

  /* --- body ---------------------------------------------------------------
     Ten rows: the top two are a neckless shoulder, so the head can bob a pixel
     without opening a hole, then a round teardrop that runs brown along the
     back and cream down the breast.

     `fluffed` is the same bird with every feather stood up — a pixel wider all
     round and a row taller. It is what cold, sleepy and startled all look like. */
  body: {
    anchor: { x: 6, y: 14 },
    rest: 'neutral',
    variants: {
      neutral: {
        matrix: [
          '...BBbCC...',
          '..KBBbCCK..',
          '.KBBBbbCCK.',
          'KBBBbbbbCCK',
          'KBBbbbbCCCK',
          'KBBbbbCCCCK',
          'KMBbbbCCCCK',
          '.KMBbbCCCK.',
          '..KKMbCCK..',
          '....KKKK...',
        ],
      },
      fluffed: {
        ox: -1,
        oy: -1,
        matrix: [
          '....BBbCC....',
          '..KKBBbCCK...',
          '.KBBBBbbCCK..',
          'KBBBBbbbbCCK.',
          'KBBBbbbbCCCCK',
          'KBBBbbbCCCCCK',
          'KMBBbbbCCCCK.',
          '.KMBBbbCCCK..',
          '..KKMbbCCK...',
          '...KKMbCK....',
          '.....KKKK....',
        ],
      },
      /**
       * Belly-down freefall. Two rows shorter and two columns wider than
       * neutral, with the shoulder pressed out of existence — a bird spread
       * against the air has no neck left to speak of.
       */
      flat: {
        ox: -1,
        oy: 2,
        matrix: [
          '....BBBbCC...',
          '..KKBBbbCCK..',
          '.KBBBbbbbCCK.',
          'KBBBbbbbbCCCK',
          'KBBbbbbbCCCCK',
          'KMBbbbbCCCCK.',
          '.KKMbbbCCK...',
          '..KKKKKKK....',
        ],
      },

      /**
       * HEAD-ON. Every row is a palindrome and the sprite is centred on
       * x = 10 — check that before changing a pixel, because the whole
       * front-facing set (`head.front`, `eye.frontOpen`, `beak.front`,
       * `wing.spreadBoth`, `legFront.crossed`) is registered to the same
       * line, and a body that drifts one pixel off centre makes the entire
       * meditation perch look like it is leaning.
       *
       * Cols 4-16, rows 14-23. Mantle brown down both flanks, cream breast up
       * the middle, no shoulder — there is no near side and far side when a
       * bird is looking straight at you.
       */
      front: {
        ox: -2,
        matrix: [
          '...KKKKKKK...',
          '..KBBbCbBBK..',
          '.KBBbCCCbBBK.',
          'KBBbCCCCCbBBK',
          'KBBbCCCCCbBBK',
          'KBBbCCCCCbBBK',
          'KBBbbCCCbbBBK',
          '.KBBbbCbbBBK.',
          '..KKBbbbBKK..',
          '....KKKKK....',
        ],
      },

      /**
       * The caster's robe: shoulders under a cream collar, a vermilion clasp,
       * and a hem that flares out and lands ON BASELINE_Y so he stands in it
       * rather than hovering above it. Set both legs to `hidden` — the robe is
       * the silhouette from the collar down.
       *
       * Wool is M with an L lit edge down the leading side rather than the
       * plumage browns: a brown robe on a brown bird is one shape, not two.
       */
      robe: {
        ox: -2,
        matrix: [
          '..KbbCCCCK.....',
          '.KMMMCCCLLK....',
          'KMMMMMCMLLLK...',
          'KMMMMMVMMLLK...',
          'KMMMMMVMMMLLK..',
          '.KMMMMMMMMLLK..',
          '.KMMMMMMMMMLLK.',
          '.KMMMMMMMMMLLK.',
          'KMMMMMMMMMMLLK.',
          'KMMMMMMMMMMMLLK',
          'KMMMMMMMMMMMLLK',
          '.KKKKKKKKKKKKK.',
        ],
      },
    },
  },

  /* --- near leg ----------------------------------------------------------- */
  legFront: {
    anchor: { x: 11, y: 23 },
    rest: 'down',
    variants: {
      down: {
        matrix: [
          '.V.',
          '.V.',
          'VVV',
        ],
      },
      /** Foot off the ground: the swing phase of a walk. */
      up: {
        matrix: [
          '.V.',
          'VVV',
        ],
      },
      /** Compressed but still planted — the foot stays on BASELINE_Y. */
      crouch: {
        oy: 1,
        matrix: [
          '.V.',
          'VVV',
        ],
      },
      /** Reaching down, for a landing or a stretch. */
      extended: {
        matrix: [
          '.V.',
          '.V.',
          '.v.',
          'VVV',
        ],
      },
      /** Pulled up into the belly feathers for flight. */
      tucked: { oy: -2, matrix: ['vVv'] },
      /** Thrown out forward and sideways: freefall, tumbles, crash landings. */
      splay: {
        matrix: [
          '.V..',
          '.VVV',
          '...V',
        ],
      },
      /** Slid out flat along the floor. The moonwalk leg. */
      kick: {
        oy: 1,
        matrix: [
          '.V..',
          '.VVV',
        ],
      },
      /**
       * BOTH feet, tucked and crossed under the belly, symmetric about x = 10.
       * Cols 7-13, rows 22-24: the top two rows sit inside `body.front`'s
       * lower belly and the last row hangs a pixel below it, which is what
       * makes it read as feet tucked under rather than feet painted on.
       *
       * Pair with `legBack: 'hidden'`. Drawing the two anchored legs instead
       * cannot be symmetric — the anchors are three pixels apart.
       */
      crossed: {
        ox: -4,
        oy: -1,
        matrix: [
          '.V...V.',
          'VVV.VVV',
          '..VVV..',
        ],
      },
      /** Nothing. For the leg a robe or a head-on body covers. */
      hidden: { matrix: ['.'] },
    },
  },

  /* --- wing ---------------------------------------------------------------
     One wing, on the near side. The far wing is never drawn: at this size it
     would be two pixels of noise behind the body. */
  wing: {
    anchor: { x: 7, y: 16 },
    rest: 'folded',
    variants: {
      folded: {
        matrix: [
          '..KKK..',
          '.KBBBK.',
          'KBBBbbK',
          'KBBbbBK',
          '.KBbbBK',
          '..KKKK.',
        ],
      },
      half: {
        matrix: [
          '...KKK..',
          '..KBBBK.',
          '.KBBBbK.',
          'KBBBbbK.',
          'KBBbbbK.',
          '.KBbbbBK',
          '..KKKKK.',
        ],
      },
      spread: {
        ox: -2,
        oy: -1,
        matrix: [
          '..KKK.....',
          '.KBBKK....',
          'KBBBBBKK..',
          'KBBBbbbBKK',
          '.KBbbbbbbK',
          '.KBbbbbbBK',
          '..KMbbbBK.',
          '...KKKKK..',
        ],
      },
      up: {
        oy: -4,
        matrix: [
          '..KKK..',
          '.KBBK..',
          '.KBBBK.',
          'KBBBBK.',
          'KBBbbK.',
          'KBbbbBK',
          'KBbbbBK',
          '.KbbbBK',
          '..KKKK.',
        ],
      },
      tucked: {
        ox: 1,
        oy: 2,
        matrix: [
          '.KKKK.',
          'KBBBbK',
          'KBBbbK',
          '.KBbBK',
          '..KKK.',
        ],
      },

      /**
       * Wider than `spread` and thrown forward rather than out. This is the
       * showman's wing: flips, brags, the beat at the top of a jump. It runs
       * three pixels past the body's leading edge, which is the entire reason
       * it reads as a flourish and not as flight.
       */
      flare: {
        ox: -3,
        oy: -2,
        matrix: [
          '..KKK.......',
          '.KBBKKK.....',
          'KBBBBBBKKK..',
          'KBBBbbbbbBKK',
          '.KBbbbbbbbbK',
          '..KMbbbbbbK.',
          '...KKKKKKK..',
        ],
      },

      /**
       * The bottom of a downstroke: the wing hangs below the shoulder line.
       * `up` and `down` alternated give a much harder beat than `up`/`spread`,
       * which is what a climb needs and level flight does not.
       */
      down: {
        ox: -1,
        oy: 2,
        matrix: [
          '..KKKK..',
          '.KBBBbK.',
          '.KBBbbK.',
          '.KBbbbK.',
          '.KBbbbK.',
          '..KbbbK.',
          '..KbbBK.',
          '...KbBK.',
          '....KK..',
        ],
      },

      /**
       * Straight up, gripping. The tip lands on row 8, which is where every
       * held prop (umbrella shaft, rope, book spine) is authored to meet it.
       */
      reach: {
        ox: 1,
        oy: -8,
        matrix: [
          '.KKK.',
          'KBbBK',
          'KBbBK',
          'KBbBK',
          'KBbBK',
          'KBbbK',
          'KBbbK',
          'KBbbK',
          'KBbbK',
          '.KbbK',
          '.KbBK',
          '..KK.',
        ],
      },

      /**
       * BOTH wings, thrown out either side, for the head-on meditation perch.
       * The one place in the puppet where the far wing exists at all.
       *
       * Cols -1 to 21, rows 15-20, every row a palindrome about x = 10. The
       * middle of every row is left TRANSPARENT on purpose: this part draws
       * after `body`, so a filled centre would paint a bar straight across the
       * breast. The chest stays visible through cols 7-13 in every row.
       *
       * Wingtips land at (0, 16) and (20, 16). That is where PROPS.orb and
       * PROPS.orbTwin are centred, and if you move the tips you must move
       * both orbs with them.
       */
      spreadBoth: {
        ox: -8,
        oy: -1,
        matrix: [
          '.KK.................KK.',
          'KBBKK.............KKBBK',
          'KBbbBKK.........KKBbbBK',
          'KBbbbBKK.......KKBbbbBK',
          '.KBbbbBKK.....KKBbbbBK.',
          '..KKKKK.........KKKKK..',
        ],
      },
    },
  },

  /* --- head ---------------------------------------------------------------
     Nine across on an eleven-wide body. The bottom row carries no outline, so
     the jaw dissolves into the breast instead of drawing a collar. */
  head: {
    anchor: { x: 6, y: 7 },
    rest: 'neutral',
    variants: {
      neutral: {
        matrix: [
          '...KKK...',
          '.KKBBBKK.',
          'KBBBBBBBK',
          'KBBBBBbbK',
          'KBBbbbbCK',
          'KBbbbCCCK',
          '.KbbCCCK.',
          '..MbCCM..',
        ],
      },
      fluffed: {
        ox: -1,
        oy: -1,
        matrix: [
          '...K.K.K...',
          '..KKKBKKK..',
          '.KBBBBBBBK.',
          'KBBBBBBBBBK',
          'KBBBBBbbbCK',
          'KBBbbbbCCCK',
          '.KBbbbCCCK.',
          '.KbbCCCCK..',
          '..MbCCCM...',
        ],
      },
      /**
       * Every feather laid flat. One row shorter and one column longer than
       * neutral, crown flattened into the nape. The opposite pole from
       * `fluffed`: this is the head a bird wears at speed.
       */
      sleek: {
        ox: -1,
        oy: 1,
        matrix: [
          '..KKKK....',
          '.KBBBBKK..',
          'KBBBBBBBKK',
          'KBBBBBbbbK',
          'KBBbbbbCCK',
          '.KbbbCCCK.',
          '..MbCCM...',
        ],
      },

      /**
       * HEAD-ON, cols 5-15, rows 7-14, every row a palindrome about x = 10.
       * Brown crown and cheeks, cream chin up the middle, and no jaw outline
       * on the last row so the face dissolves into `body.front` the same way
       * the profile head dissolves into the profile body.
       *
       * The eyes are NOT in here. They live in `eye.frontOpen` /
       * `eye.frontClosed` so the bird can still blink, and they land on rows
       * 10-12 — the brown band — which is where a sparrow's eyes actually are.
       */
      front: {
        ox: -1,
        matrix: [
          '...KKKKK...',
          '.KKBBBBBKK.',
          'KBBBBBBBBBK',
          'KBBBBBBBBBK',
          'KBBbbbbbBBK',
          'KBbbCCCbbBK',
          '.KbbCCCbbK.',
          '..MbCCCbM..',
        ],
      },
    },
  },

  /* --- hat ----------------------------------------------------------------
     Sits on the crown, drawn after the skull and before the face, so a hat
     can cover the top of the head without ever covering an eye.

     Anchored four rows above the head so a tall hat has somewhere to go. The
     bottom rows overlap head rows 7-8, which is what makes it read as worn
     rather than floating. */
  hat: {
    anchor: { x: 6, y: 3 },
    rest: 'none',
    variants: {
      none: { matrix: ['.'] },

      /** A green pod with a snout aimed forward. You know the one. */
      peashooter: {
        matrix: [
          '...gGGGg...',
          '..gGGGGGg..',
          '.gGGGGGGGgg',
          '.gGGGGGGGGg',
          '..KgGGGGGgg',
          '...KKKKKK..',
        ],
      },

      /** Mid-shot: the snout swells a pixel and the mouth goes dark. */
      peashooterFire: {
        matrix: [
          '...gGGGg...',
          '..gGGGGGgg.',
          '.gGGGGGGGGg',
          '.gGGGGGGKKG',
          '..KgGGGGGGg',
          '...KKKKKK..',
        ],
      },

      /** Beanie, blades broadside. */
      propellerA: {
        matrix: [
          'KKKKKKKKKKK',
          '.....K.....',
          '...VVVVV...',
          '..VVvvvVV..',
          '...KKKKK...',
        ],
      },

      /** Beanie, blades edge-on. Alternate the two and it spins. */
      propellerB: {
        matrix: [
          '....KKK....',
          '.....K.....',
          '...VVVVV...',
          '..VVvvvVV..',
          '...KKKKK...',
        ],
      },

      /**
       * The caster's hood. Wool in M with an L lit rim, matching `body.robe`.
       *
       * READ THIS BEFORE WIDENING IT, AND MEASURE RATHER THAN TRUSTING THE
       * SHAPE. An earlier version of this sprite carried a note saying its rim
       * was cut back far enough to leave the eye in the opening. It was not:
       * worn at the dx +1, dy +1 `perchIncantation` sets, its fabric ran to
       * x 14 across every row the eye occupies, so all sixteen eye pixels
       * landed on wool and the bird had no face at all. The hat draws BEFORE
       * the eye, so a hood that is too wide does not hide the eye — it paints
       * the eye on top of the cloth, which reads as a blindfold.
       *
       * The rim below is the measured fix. Worn, the hood recedes to x 10 by
       * the eye's top row and to x 9 below it; `eye.open` at dx +2 occupies
       * x 10-13, so only its own dark left column ever meets the rim, and the
       * glint at x 11 is always on plumage. The beak at x 15-17 is clear of
       * the hood on every row.
       *
       * If you move the eye, move this rim with it, and look at the result —
       * a hood is one of the few pieces of art here that fails silently.
       */
      hood: {
        ox: -2,
        oy: 1,
        matrix: [
          '....KKKKK...',
          '..KKMMMMMKK.',
          '.KMMMMMMMLLK',
          'KMMMMMMMLLK.',
          'KMMMMLLK....',
          'KMMMLK......',
          'KMMLK.......',
          'KMMLK.......',
          '.KMLK.......',
          '..KK........',
        ],
      },
    },
  },

  /* --- eye ----------------------------------------------------------------
     Four pixels square on a nine-pixel head, with a single paper-coloured
     glint. The lid variants paint their own eyelid in the cheek colour, which
     is exactly why they must snap rather than blend. */
  eye: {
    anchor: { x: 8, y: 9 },
    rest: 'open',
    variants: {
      open: {
        matrix: [
          '.KK.',
          'KHKK',
          'KKKK',
          '.KK.',
        ],
      },
      half: {
        matrix: [
          '....',
          '.bb.',
          'KHKK',
          '.KK.',
        ],
      },
      closed: {
        matrix: [
          '....',
          '....',
          'KKKK',
          '....',
        ],
      },
      /** Upward arc: the contented, pleased-with-itself eye. */
      arc: {
        matrix: [
          '....',
          '.KK.',
          'K..K',
          '....',
        ],
      },
      /** Alarm. The whole socket goes dark and the glint moves to the corner. */
      wide: {
        matrix: [
          'KKKK',
          'KHKK',
          'KKKK',
          'KKKK',
        ],
      },
      /** Concussed. No glint at all, which is the joke. */
      dizzy: {
        matrix: [
          'K..K',
          '.KK.',
          '.KK.',
          'K..K',
        ],
      },
      /** Delighted. Two glints instead of one. */
      sparkle: {
        matrix: [
          '.K..',
          'KHHK',
          'KHKK',
          '.KK.',
        ],
      },

      /**
       * HEAD-ON: both eyes in one sprite, cols 6-14, rows 10-12, symmetric
       * about x = 10. Three across rather than the profile eye's four, because
       * two four-wide eyes on an eleven-wide face leaves three pixels of nose
       * and the bird stops looking like a bird.
       */
      frontOpen: {
        ox: -2,
        oy: 1,
        matrix: [
          'KKK...KKK',
          'KHK...KHK',
          'KKK...KKK',
        ],
      },

      /** Head-on, shut. The lower lash keeps it from reading as a scowl. */
      frontClosed: {
        ox: -2,
        oy: 1,
        matrix: [
          '.........',
          'KKK...KKK',
          '.K.....K.',
        ],
      },
    },
  },

  /* --- beak --------------------------------------------------------------- */
  beak: {
    anchor: { x: 13, y: 11 },
    rest: 'closed',
    variants: {
      closed: {
        matrix: [
          'VV.',
          'VVV',
          'vv.',
        ],
      },
      open: {
        matrix: [
          'VVv',
          'KK.',
          'VVv',
        ],
      },
      /** Wider than `open` and hinged further back: a shout, not a chirp. */
      wide: {
        oy: -1,
        matrix: [
          'VVv.',
          'KK..',
          'KKK.',
          'VVvv',
        ],
      },
      /** Clamped shut and angled up — on a rope, a stem, an umbrella handle. */
      grip: {
        oy: -1,
        matrix: [
          '.VV',
          'VVv',
          '.v.',
        ],
      },

      /**
       * HEAD-ON: a short wedge pointing at the reader, cols 8-12, rows 12-14,
       * symmetric about x = 10. Foreshortened on purpose — a beak aimed down
       * the camera is three pixels of length and all width.
       */
      front: {
        ox: -5,
        oy: 1,
        matrix: [
          'VVVVV',
          '.VVV.',
          '..v..',
        ],
      },
    },
  },
};

/* ==========================================================================
   animation names
   ========================================================================== */

/** Played while the bird holds its ground. */
export type StationaryName =
  | 'breathe'
  | 'blink'
  | 'doubleBlink'
  | 'lookLeft'
  | 'lookRight'
  | 'lookUp'
  | 'headTiltLeft'
  | 'headTiltRight'
  | 'preenWing'
  | 'preenChest'
  | 'preenTail'
  | 'fluffUp'
  | 'scratchHead'
  | 'yawn'
  | 'stretchWing'
  | 'stretchBoth'
  | 'chirp'
  | 'peck'
  | 'lookAtViewer'
  | 'shiver'
  | 'settle'
  | 'sleep'
  | 'wakeUp';

/** Played while the bird rearranges itself on the ground. */
export type LocomotionName =
  | 'hopInPlace'
  | 'hopForward'
  | 'hopBackward'
  | 'walkCycle'
  | 'turnAround'
  | 'sidestep'
  | 'flutter'
  | 'shuffle'
  | 'pivot';

/** Driven by the physics owner, never by the idle picker. */
export type TransitName =
  | 'crouch'
  | 'launch'
  | 'airUp'
  | 'airApex'
  | 'airDown'
  | 'land'
  | 'flyFlap'
  | 'diveTuck'
  | 'balloonHold';

/* --------------------------------------------------------------------------
   the added vocabulary

   Six new families, all additive. Nothing above this line changed meaning,
   and every name that existed before still resolves to the same timeline.
   -------------------------------------------------------------------------- */

/**
 * Played when the reader scrolls UP fast. `upFlap` is the workaday one and
 * should be picked the overwhelming majority of the time; the other four are
 * easter eggs and are weighted accordingly in TRANSIT_UP.
 *
 * All five loop, because the rig cannot know in advance how far the reader is
 * about to travel. Play the loop for the duration of the flight, then hand
 * over to `land`.
 */
export type TransitUpName =
  | 'upFlap'
  | 'upJetpack'
  | 'upBalloon'
  | 'upUfo'
  | 'upPropeller';

/**
 * Played when the reader scrolls DOWN fast. Same weighting logic as
 * TRANSIT_UP / TRANSIT_DOWN: flat, apart from the saucer and the paper plane.
 *
 * Three of these loop (`downGlide`, `downUmbrella`, `downPaperPlane`) and are
 * held for the length of the fall. Three do not (`downSkydive`, `downCrash`,
 * `downRope`): they carry a scripted payoff — a chute, an impact, a dismount
 * — and must be allowed to finish. Give those a travel distance the rig can
 * actually cover in the animation's own duration, or the punchline lands in
 * the wrong place.
 */
export type TransitDownName =
  | 'downGlide'
  | 'downSkydive'
  | 'downCrash'
  | 'downRope'
  | 'downUmbrella'
  | 'downPaperPlane';

/**
 * Hops with something to say. `hopInPlace` and `hopForward` (above) remain the
 * plain ones; these are what an ordinary hop turns into when it feels like it.
 */
export type JumpName =
  | 'jumpFlap'
  | 'jumpFlipFront'
  | 'jumpFlipBack'
  | 'jumpTwist'
  | 'jumpHigh'
  | 'jumpHeelClick';

/** Reader-triggered. Never scheduled by the idle picker. */
export type InteractionName =
  | 'startledAwake'
  | 'peckAtCursor'
  | 'greetBow'
  | 'headShake'
  | 'showOff'
  | 'recoilHop';

/** Walks. `walkCycle` (above) is the original; these two are additions. */
export type WalkName = 'walkAlong' | 'moonwalk';

/**
 * Perches held while the chat window is open. All loop forever — the rig
 * picks one when the window opens and keeps it until the window closes.
 * `perchResponding` is deliberately NOT in this family: see CHAT_RESPONDING.
 */
export type ChatPerchName =
  | 'perchNest'
  | 'perchBranch'
  | 'perchMeditate'
  | 'perchIncantation'
  | 'perchTyping';

/** Played instead of the perch idle while an answer is streaming. */
export type ChatRespondingName = 'perchResponding';

/** The Plants vs Zombies bit. Strictly a scripted sequence — see PVZ_SEQUENCE. */
export type EasterEggName =
  | 'pvzHatOn'
  | 'pvzBurrow'
  | 'pvzPopUp'
  | 'pvzShoot'
  | 'pvzReload'
  | 'pvzHatOff';

export type AnimationName =
  | StationaryName
  | LocomotionName
  | TransitName
  | TransitUpName
  | TransitDownName
  | JumpName
  | InteractionName
  | WalkName
  | ChatPerchName
  | ChatRespondingName
  | EasterEggName;

/* ==========================================================================
   stationary animations

   Timing notes, since "smoother" was the note that mattered most: nothing
   here snaps straight from rest to a held pose. Every one of these opens with
   a short rest frame so the move eases OUT of stillness, holds the extreme
   with `ease: 'hold'` rather than by drifting, and eases back. That opening
   frame is why the same pose often appears twice in a row — the first copy is
   travelled to, the second is the hold.
   ========================================================================== */
export const STATIONARY_ANIMATIONS: { readonly [N in StationaryName]: Animation } = {
  /** The baseline. Runs whenever nothing else is scheduled. */
  breathe: {
    name: 'breathe',
    group: 'stationary',
    loop: true,
    frames: [
      { d: 1150, ease: 'inOut', pose: {} },
      {
        d: 1150,
        ease: 'inOut',
        pose: {
          head: { dy: -1 },
          eye: { dy: -1 },
          beak: { dy: -1 },
          wing: { dy: -1 },
        },
      },
    ],
  },

  blink: {
    name: 'blink',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 40, ease: 'hold', pose: {} },
      { d: 45, ease: 'hold', pose: { eye: { variant: 'half' } } },
      { d: 70, ease: 'hold', pose: { eye: { variant: 'closed' } } },
      { d: 45, ease: 'hold', pose: { eye: { variant: 'half' } } },
      { d: 60, ease: 'hold', pose: {} },
    ],
  },

  doubleBlink: {
    name: 'doubleBlink',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 30, ease: 'hold', pose: {} },
      { d: 40, ease: 'hold', pose: { eye: { variant: 'half' } } },
      { d: 65, ease: 'hold', pose: { eye: { variant: 'closed' } } },
      { d: 40, ease: 'hold', pose: { eye: { variant: 'half' } } },
      { d: 130, ease: 'hold', pose: {} },
      { d: 40, ease: 'hold', pose: { eye: { variant: 'half' } } },
      { d: 75, ease: 'hold', pose: { eye: { variant: 'closed' } } },
      { d: 45, ease: 'hold', pose: { eye: { variant: 'half' } } },
      { d: 70, ease: 'hold', pose: {} },
    ],
  },

  /** Head swings back over the shoulder. The tail counterweights a pixel. */
  lookLeft: {
    name: 'lookLeft',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 180, ease: 'out', pose: {} },
      {
        d: 620,
        ease: 'hold',
        pose: {
          head: { dx: -1 },
          eye: { dx: -2 },
          beak: { dx: -2 },
          tail: { dx: 1 },
        },
      },
      {
        d: 240,
        ease: 'inOut',
        pose: {
          head: { dx: -1 },
          eye: { dx: -2 },
          beak: { dx: -2 },
          tail: { dx: 1 },
        },
      },
      { d: 120, ease: 'hold', pose: {} },
    ],
  },

  lookRight: {
    name: 'lookRight',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 170, ease: 'out', pose: {} },
      {
        d: 560,
        ease: 'hold',
        pose: {
          head: { dx: 1 },
          eye: { dx: 2 },
          beak: { dx: 2 },
          tail: { dx: -1 },
        },
      },
      {
        d: 220,
        ease: 'inOut',
        pose: {
          head: { dx: 1 },
          eye: { dx: 2 },
          beak: { dx: 2 },
          tail: { dx: -1 },
        },
      },
      { d: 110, ease: 'hold', pose: {} },
    ],
  },

  /** Checks the sky. Body lifts with the head so it does not look decapitated. */
  lookUp: {
    name: 'lookUp',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 200, ease: 'out', pose: {} },
      {
        d: 520,
        ease: 'hold',
        pose: {
          head: { dy: -2 },
          eye: { dx: 1, dy: -2 },
          beak: { dx: 1, dy: -2 },
          body: { dy: -1 },
        },
      },
      {
        d: 260,
        ease: 'inOut',
        pose: {
          head: { dy: -2 },
          eye: { dx: 1, dy: -2 },
          beak: { dx: 1, dy: -2 },
          body: { dy: -1 },
        },
      },
      { d: 120, ease: 'hold', pose: {} },
    ],
  },

  /** The quizzical tilt. Eye and beak shear against the skull. */
  headTiltLeft: {
    name: 'headTiltLeft',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 190, ease: 'out', pose: {} },
      {
        d: 640,
        ease: 'hold',
        pose: {
          head: { dx: -1 },
          eye: { dx: -1, dy: 1 },
          beak: { dx: -2, dy: 1 },
        },
      },
      {
        d: 240,
        ease: 'inOut',
        pose: {
          head: { dx: -1 },
          eye: { dx: -1, dy: 1 },
          beak: { dx: -2, dy: 1 },
        },
      },
      { d: 110, ease: 'hold', pose: {} },
    ],
  },

  headTiltRight: {
    name: 'headTiltRight',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 190, ease: 'out', pose: {} },
      {
        d: 640,
        ease: 'hold',
        pose: {
          head: { dx: 1 },
          eye: { dx: 1, dy: -1 },
          beak: { dx: 1, dy: -2 },
        },
      },
      {
        d: 240,
        ease: 'inOut',
        pose: {
          head: { dx: 1 },
          eye: { dx: 1, dy: -1 },
          beak: { dx: 1, dy: -2 },
        },
      },
      { d: 110, ease: 'hold', pose: {} },
    ],
  },

  /** Head buries into the shoulder and nibbles. The beak opens on each bite. */
  preenWing: {
    name: 'preenWing',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 200, ease: 'out', pose: {} },
      {
        d: 160,
        ease: 'hold',
        pose: {
          head: { dx: -2, dy: 4 },
          eye: { dx: -3, dy: 4 },
          beak: { dx: -5, dy: 4, variant: 'open' },
          wing: { variant: 'half' },
        },
      },
      {
        d: 130,
        ease: 'hold',
        pose: {
          head: { dx: -2, dy: 5 },
          eye: { dx: -3, dy: 5 },
          beak: { dx: -5, dy: 5 },
          wing: { variant: 'half' },
        },
      },
      {
        d: 140,
        ease: 'hold',
        pose: {
          head: { dx: -2, dy: 4 },
          eye: { dx: -3, dy: 4 },
          beak: { dx: -5, dy: 4, variant: 'open' },
          wing: { variant: 'half' },
        },
      },
      {
        d: 150,
        ease: 'hold',
        pose: {
          head: { dx: -3, dy: 5 },
          eye: { dx: -4, dy: 5 },
          beak: { dx: -6, dy: 5 },
          wing: { variant: 'half' },
        },
      },
      {
        d: 130,
        ease: 'out',
        pose: {
          head: { dx: -2, dy: 4 },
          eye: { dx: -3, dy: 4 },
          beak: { dx: -5, dy: 4, variant: 'open' },
          wing: { variant: 'half' },
        },
      },
      { d: 220, ease: 'hold', pose: {} },
    ],
  },

  preenChest: {
    name: 'preenChest',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 190, ease: 'out', pose: {} },
      {
        d: 150,
        ease: 'hold',
        pose: {
          head: { dx: -1, dy: 5 },
          eye: { dx: -1, dy: 5 },
          beak: { dx: -2, dy: 6, variant: 'open' },
        },
      },
      {
        d: 120,
        ease: 'hold',
        pose: {
          head: { dx: -1, dy: 6 },
          eye: { dx: -1, dy: 6 },
          beak: { dx: -2, dy: 7 },
        },
      },
      {
        d: 130,
        ease: 'hold',
        pose: {
          head: { dy: 5 },
          eye: { dy: 5 },
          beak: { dx: -1, dy: 6, variant: 'open' },
        },
      },
      {
        d: 140,
        ease: 'out',
        pose: {
          head: { dy: 6 },
          eye: { dy: 6 },
          beak: { dx: -1, dy: 7 },
        },
      },
      { d: 240, ease: 'hold', pose: {} },
    ],
  },

  /** The full contortion: head all the way back and down, tail cocked to meet it. */
  preenTail: {
    name: 'preenTail',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 220, ease: 'out', pose: {} },
      {
        d: 180,
        ease: 'hold',
        pose: {
          head: { dx: -5, dy: 6 },
          eye: { dx: -6, dy: 6 },
          beak: { dx: -9, dy: 6, variant: 'open' },
          tail: { variant: 'up' },
          wing: { variant: 'half' },
        },
      },
      {
        d: 150,
        ease: 'hold',
        pose: {
          head: { dx: -6, dy: 6 },
          eye: { dx: -7, dy: 6 },
          beak: { dx: -10, dy: 6 },
          tail: { variant: 'up' },
          wing: { variant: 'half' },
        },
      },
      {
        d: 160,
        ease: 'hold',
        pose: {
          head: { dx: -5, dy: 6 },
          eye: { dx: -6, dy: 6 },
          beak: { dx: -9, dy: 6, variant: 'open' },
          tail: { variant: 'up' },
          wing: { variant: 'half' },
        },
      },
      { d: 260, ease: 'out', pose: { tail: { variant: 'up' } } },
      { d: 200, ease: 'hold', pose: {} },
    ],
  },

  /** Feathers up, two quick shakes, feathers down. */
  fluffUp: {
    name: 'fluffUp',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 90, ease: 'out', pose: {} },
      {
        d: 140,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed' },
          head: { variant: 'fluffed' },
          eye: { dx: 1 },
          beak: { dx: 1 },
          wing: { dy: 1 },
          tail: { variant: 'down' },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed', dx: 1 },
          head: { variant: 'fluffed', dx: 1 },
          eye: { dx: 2 },
          beak: { dx: 2 },
          wing: { dx: 1, dy: 1 },
          tail: { variant: 'down', dx: 1 },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed', dx: -1 },
          head: { variant: 'fluffed', dx: -1 },
          eye: { dx: 0 },
          beak: { dx: 0 },
          wing: { dx: -1, dy: 1 },
          tail: { variant: 'down', dx: -1 },
        },
      },
      {
        d: 160,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed' },
          head: { variant: 'fluffed' },
          eye: { dx: 1 },
          beak: { dx: 1 },
          wing: { dy: 1 },
          tail: { variant: 'down' },
        },
      },
      { d: 240, ease: 'out', pose: {} },
      { d: 300, ease: 'hold', pose: {} },
    ],
  },

  /** Near foot comes up past the cheek and scratches. Wing out for balance. */
  scratchHead: {
    name: 'scratchHead',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 160, ease: 'out', pose: {} },
      {
        d: 130,
        ease: 'hold',
        pose: {
          legFront: { variant: 'up', dx: -1, dy: -6 },
          head: { dx: 1, dy: 2 },
          eye: { dx: 1, dy: 2 },
          beak: { dx: 1, dy: 2 },
          body: { dy: 1 },
          wing: { variant: 'half' },
          tail: { variant: 'up' },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          legFront: { variant: 'up', dx: -1, dy: -8 },
          head: { dx: 1, dy: 2 },
          eye: { dx: 1, dy: 2 },
          beak: { dx: 1, dy: 2 },
          body: { dy: 1 },
          wing: { variant: 'half' },
          tail: { variant: 'up' },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          legFront: { variant: 'up', dx: -1, dy: -6 },
          head: { dx: 1, dy: 2 },
          eye: { dx: 1, dy: 2 },
          beak: { dx: 1, dy: 2 },
          body: { dy: 1 },
          wing: { variant: 'half' },
          tail: { variant: 'up' },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          legFront: { variant: 'up', dx: -1, dy: -8 },
          head: { dx: 1, dy: 2 },
          eye: { dx: 1, dy: 2 },
          beak: { dx: 1, dy: 2 },
          body: { dy: 1 },
          wing: { variant: 'half' },
          tail: { variant: 'up' },
        },
      },
      {
        d: 100,
        ease: 'out',
        pose: {
          legFront: { variant: 'up', dx: -1, dy: -6 },
          head: { dx: 1, dy: 2 },
          eye: { dx: 1, dy: 2 },
          beak: { dx: 1, dy: 2 },
          body: { dy: 1 },
          wing: { variant: 'half' },
          tail: { variant: 'up' },
        },
      },
      { d: 200, ease: 'out', pose: { wing: { variant: 'half' } } },
      { d: 240, ease: 'hold', pose: {} },
    ],
  },

  /** Slow, wide, eyes shut. The one animation that should never feel hurried. */
  yawn: {
    name: 'yawn',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 260, ease: 'out', pose: {} },
      {
        d: 180,
        ease: 'inOut',
        pose: {
          head: { dy: -2 },
          eye: { dy: -2, variant: 'half' },
          beak: { dy: -2, variant: 'open' },
        },
      },
      {
        d: 420,
        ease: 'hold',
        pose: {
          head: { dy: -3 },
          eye: { dy: -3, variant: 'closed' },
          beak: { dx: 1, dy: -4, variant: 'open' },
          body: { dy: -1 },
        },
      },
      {
        d: 200,
        ease: 'out',
        pose: {
          head: { dy: -2 },
          eye: { dy: -2, variant: 'closed' },
          beak: { dy: -2, variant: 'open' },
        },
      },
      { d: 140, ease: 'hold', pose: { eye: { variant: 'half' } } },
      { d: 260, ease: 'hold', pose: {} },
    ],
  },

  /** One wing and the same-side leg extend together, the way a real bird does it. */
  stretchWing: {
    name: 'stretchWing',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 220, ease: 'out', pose: {} },
      {
        d: 520,
        ease: 'hold',
        pose: {
          wing: { variant: 'spread', dx: -2, dy: 1 },
          tail: { variant: 'fan' },
          legBack: { variant: 'extended' },
          body: { dy: -1 },
          head: { dx: -1, dy: -1 },
          eye: { dx: -1, dy: -1, variant: 'half' },
          beak: { dx: -1, dy: -1 },
        },
      },
      {
        d: 300,
        ease: 'inOut',
        pose: {
          wing: { variant: 'spread', dx: -2, dy: 1 },
          tail: { variant: 'fan' },
          legBack: { variant: 'extended' },
          body: { dy: -1 },
          head: { dx: -1, dy: -1 },
          eye: { dx: -1, dy: -1, variant: 'half' },
          beak: { dx: -1, dy: -1 },
        },
      },
      { d: 260, ease: 'hold', pose: {} },
    ],
  },

  stretchBoth: {
    name: 'stretchBoth',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 240, ease: 'out', pose: {} },
      {
        d: 460,
        ease: 'hold',
        pose: {
          wing: { variant: 'up', dy: -1 },
          tail: { variant: 'fan' },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
          body: { dy: -1 },
          head: { dy: -2 },
          eye: { dy: -2, variant: 'half' },
          beak: { dy: -2, variant: 'open' },
        },
      },
      {
        d: 340,
        ease: 'inOut',
        pose: {
          wing: { variant: 'up', dy: -1 },
          tail: { variant: 'fan' },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
          body: { dy: -1 },
          head: { dy: -2 },
          eye: { dy: -2, variant: 'half' },
          beak: { dy: -2, variant: 'open' },
        },
      },
      { d: 200, ease: 'out', pose: { wing: { variant: 'half' } } },
      { d: 260, ease: 'hold', pose: {} },
    ],
  },

  /** Two notes. Tail cocks on each, eye goes to the happy arc. */
  chirp: {
    name: 'chirp',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 120, ease: 'out', pose: {} },
      {
        d: 110,
        ease: 'hold',
        pose: {
          head: { dy: -1 },
          eye: { dy: -1, variant: 'arc' },
          beak: { dy: -1, variant: 'open' },
          tail: { variant: 'up' },
          body: { dy: -1 },
        },
      },
      {
        d: 100,
        ease: 'hold',
        pose: { eye: { variant: 'arc' } },
      },
      {
        d: 110,
        ease: 'hold',
        pose: {
          head: { dy: -1 },
          eye: { dy: -1, variant: 'arc' },
          beak: { dy: -1, variant: 'open' },
          tail: { variant: 'up' },
        },
      },
      { d: 130, ease: 'out', pose: { eye: { variant: 'arc' } } },
      { d: 220, ease: 'hold', pose: {} },
    ],
  },

  /** Head drives down to the ground beside the feet, then snaps back up. */
  peck: {
    name: 'peck',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 130, ease: 'in', pose: {} },
      {
        d: 90,
        ease: 'hold',
        pose: {
          head: { dx: 2, dy: 8 },
          eye: { dx: 2, dy: 8 },
          beak: { dx: 2, dy: 10, variant: 'open' },
          body: { dy: 1 },
          tail: { variant: 'up' },
        },
      },
      {
        d: 70,
        ease: 'hold',
        pose: {
          head: { dx: 2, dy: 10 },
          eye: { dx: 2, dy: 10 },
          beak: { dx: 2, dy: 12 },
          body: { dy: 1 },
          tail: { variant: 'up' },
        },
      },
      {
        d: 110,
        ease: 'out',
        pose: {
          head: { dx: 1, dy: 5 },
          eye: { dx: 1, dy: 5 },
          beak: { dx: 2, dy: 6 },
          tail: { variant: 'up' },
        },
      },
      { d: 200, ease: 'hold', pose: {} },
    ],
  },

  /** Turns and holds the reader's gaze, blinks once, looks away. */
  lookAtViewer: {
    name: 'lookAtViewer',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 200, ease: 'out', pose: {} },
      {
        d: 900,
        ease: 'hold',
        pose: {
          head: { dx: 1 },
          eye: { dx: 2, dy: 1 },
          beak: { dx: 3, dy: 1 },
        },
      },
      {
        d: 60,
        ease: 'hold',
        pose: {
          head: { dx: 1 },
          eye: { dx: 2, dy: 1, variant: 'half' },
          beak: { dx: 3, dy: 1 },
        },
      },
      {
        d: 70,
        ease: 'hold',
        pose: {
          head: { dx: 1 },
          eye: { dx: 2, dy: 1, variant: 'closed' },
          beak: { dx: 3, dy: 1 },
        },
      },
      {
        d: 700,
        ease: 'hold',
        pose: {
          head: { dx: 1 },
          eye: { dx: 2, dy: 1 },
          beak: { dx: 3, dy: 1 },
        },
      },
      {
        d: 240,
        ease: 'inOut',
        pose: {
          head: { dx: 1 },
          eye: { dx: 2, dy: 1 },
          beak: { dx: 3, dy: 1 },
        },
      },
      { d: 140, ease: 'hold', pose: {} },
    ],
  },

  /** Fluffed and vibrating. Sub-pixel would be wrong here; it shakes a whole pixel. */
  shiver: {
    name: 'shiver',
    group: 'stationary',
    loop: false,
    frames: [
      { d: 100, ease: 'out', pose: {} },
      {
        d: 60,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed', dx: 1 },
          head: { variant: 'fluffed', dx: 1 },
          eye: { dx: 2, variant: 'half' },
          beak: { dx: 2 },
          wing: { dx: 1 },
          tail: { dx: 1 },
        },
      },
      {
        d: 60,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed', dx: -1 },
          head: { variant: 'fluffed', dx: -1 },
          eye: { dx: 0, variant: 'half' },
          beak: { dx: 0 },
          wing: { dx: -1 },
          tail: { dx: -1 },
        },
      },
      {
        d: 55,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed', dx: 1 },
          head: { variant: 'fluffed', dx: 1 },
          eye: { dx: 2, variant: 'half' },
          beak: { dx: 2 },
          wing: { dx: 1 },
          tail: { dx: 1 },
        },
      },
      {
        d: 55,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed', dx: -1 },
          head: { variant: 'fluffed', dx: -1 },
          eye: { dx: 0, variant: 'half' },
          beak: { dx: 0 },
          wing: { dx: -1 },
          tail: { dx: -1 },
        },
      },
      {
        d: 60,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed', dx: 1 },
          head: { variant: 'fluffed', dx: 1 },
          eye: { dx: 2, variant: 'half' },
          beak: { dx: 2 },
          wing: { dx: 1 },
          tail: { dx: 1 },
        },
      },
      {
        d: 180,
        ease: 'out',
        pose: {
          body: { variant: 'fluffed' },
          head: { variant: 'fluffed' },
          eye: { dx: 1 },
          beak: { dx: 1 },
        },
      },
      { d: 240, ease: 'hold', pose: {} },
    ],
  },

  /** Deflates out of fluffed, folds down onto its haunches. The pre-sleep move. */
  settle: {
    name: 'settle',
    group: 'stationary',
    loop: false,
    frames: [
      {
        d: 180,
        ease: 'out',
        pose: {
          body: { variant: 'fluffed' },
          head: { variant: 'fluffed' },
          eye: { dx: 1 },
          beak: { dx: 1 },
          tail: { variant: 'up' },
        },
      },
      {
        d: 200,
        ease: 'out',
        pose: {
          wing: { variant: 'half' },
          body: { dy: -1 },
          head: { dy: -1 },
          eye: { dy: -1 },
          beak: { dy: -1 },
        },
      },
      {
        d: 420,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          body: { dy: 1 },
          head: { dy: 1 },
          eye: { dy: 1, variant: 'arc' },
          beak: { dy: 1 },
          tail: { variant: 'down' },
        },
      },
      { d: 300, ease: 'hold', pose: {} },
    ],
  },

  /** Fluffed, hunched down onto the feet, head sunk into the shoulders. Very slow breathing. */
  sleep: {
    name: 'sleep',
    group: 'stationary',
    loop: true,
    frames: [
      {
        d: 1600,
        ease: 'inOut',
        pose: {
          body: { variant: 'fluffed' },
          head: { variant: 'fluffed', dx: -1, dy: 2 },
          eye: { dx: -1, dy: 2, variant: 'closed' },
          beak: { dx: -1, dy: 2 },
          wing: { dy: 1 },
          tail: { variant: 'down' },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
        },
      },
      {
        d: 1600,
        ease: 'inOut',
        pose: {
          body: { variant: 'fluffed', dy: -1 },
          head: { variant: 'fluffed', dx: -1, dy: 1 },
          eye: { dx: -1, dy: 1, variant: 'closed' },
          beak: { dx: -1, dy: 1 },
          tail: { variant: 'down' },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
        },
      },
    ],
  },

  /** The only legal exit from `sleep`. Ends in rest, so anything can follow. */
  wakeUp: {
    name: 'wakeUp',
    group: 'stationary',
    loop: false,
    frames: [
      {
        d: 260,
        ease: 'out',
        pose: {
          body: { variant: 'fluffed' },
          head: { variant: 'fluffed', dx: -1, dy: 2 },
          eye: { dx: -1, dy: 2, variant: 'closed' },
          beak: { dx: -1, dy: 2 },
          wing: { dy: 1 },
          tail: { variant: 'down' },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
        },
      },
      {
        d: 220,
        ease: 'out',
        pose: {
          body: { variant: 'fluffed' },
          head: { variant: 'fluffed', dx: -1, dy: 1 },
          eye: { dy: 1, variant: 'half' },
          beak: { dx: -1, dy: 1 },
          tail: { variant: 'down' },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
        },
      },
      {
        d: 200,
        ease: 'out',
        pose: {
          body: { variant: 'fluffed' },
          head: { variant: 'fluffed' },
          eye: { dx: 1 },
          beak: { dx: 1 },
          wing: { variant: 'half' },
        },
      },
      {
        d: 320,
        ease: 'inOut',
        pose: {
          wing: { variant: 'spread', dx: -2, dy: 1 },
          tail: { variant: 'fan' },
          head: { dy: -1 },
          eye: { dy: -1 },
          beak: { dy: -1 },
        },
      },
      { d: 180, ease: 'out', pose: { wing: { variant: 'half' } } },
      { d: 260, ease: 'hold', pose: {} },
    ],
  },
};

/* ==========================================================================
   locomotion animations

   These carry the in-sprite half of a move only: the crouch, the lean, the
   bob, which foot is down, how the shadow reacts. World translation belongs
   to the physics owner, which should read the animation's duration and move
   the sprite across the same window. `hopForward` and `hopBackward` differ
   from `hopInPlace` only in lean and tail carriage — the distance travelled
   is not encoded here.
   ========================================================================== */
export const LOCOMOTION_ANIMATIONS: { readonly [N in LocomotionName]: Animation } = {
  hopInPlace: {
    name: 'hopInPlace',
    group: 'locomotion',
    loop: false,
    frames: [
      { d: 90, ease: 'out', pose: {} },
      {
        d: 120,
        ease: 'in',
        pose: {
          body: { dy: 2 },
          head: { dy: 2 },
          eye: { dy: 2 },
          beak: { dy: 2 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 110,
        ease: 'out',
        pose: {
          body: { dy: -3 },
          head: { dy: -4 },
          eye: { dy: -4 },
          beak: { dy: -4 },
          wing: { variant: 'up', dy: -3 },
          tail: { variant: 'up', dy: -3 },
          legFront: { variant: 'extended', dy: -2 },
          legBack: { variant: 'extended', dy: -2 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 110,
        ease: 'inOut',
        pose: {
          body: { dy: -5 },
          head: { dy: -6 },
          eye: { dy: -6 },
          beak: { dy: -6 },
          wing: { variant: 'half', dy: -5 },
          tail: { variant: 'fan', dy: -4 },
          legFront: { variant: 'tucked', dy: -3 },
          legBack: { variant: 'tucked', dy: -3 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 100,
        ease: 'in',
        pose: {
          body: { dy: -2 },
          head: { dy: -2 },
          eye: { dy: -2 },
          beak: { dy: -2 },
          wing: { variant: 'half', dy: -2 },
          tail: { variant: 'fan', dy: -1 },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
        },
      },
      {
        d: 110,
        ease: 'out',
        pose: {
          body: { dy: 2 },
          head: { dy: 3 },
          eye: { dy: 3 },
          beak: { dy: 3 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 110,
        ease: 'out',
        pose: {
          body: { dy: 1 },
          head: { dy: 1 },
          eye: { dy: 1 },
          beak: { dy: 1 },
          wing: { dy: 1 },
        },
      },
      { d: 180, ease: 'hold', pose: {} },
    ],
  },

  hopForward: {
    name: 'hopForward',
    group: 'locomotion',
    loop: false,
    frames: [
      { d: 90, ease: 'out', pose: {} },
      {
        d: 120,
        ease: 'in',
        pose: {
          body: { dy: 2 },
          head: { dx: 1, dy: 2 },
          eye: { dx: 1, dy: 2 },
          beak: { dx: 2, dy: 2 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down', dx: -1, dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 100,
        ease: 'out',
        pose: {
          body: { dx: 1, dy: -3 },
          head: { dx: 2, dy: -4 },
          eye: { dx: 2, dy: -4 },
          beak: { dx: 3, dy: -4 },
          wing: { variant: 'up', dy: -3 },
          tail: { variant: 'up', dx: -1, dy: -2 },
          legFront: { variant: 'extended', dx: 1, dy: -2 },
          legBack: { variant: 'extended', dy: -2 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 110,
        ease: 'inOut',
        pose: {
          body: { dx: 1, dy: -5 },
          head: { dx: 2, dy: -6 },
          eye: { dx: 2, dy: -6 },
          beak: { dx: 3, dy: -6 },
          wing: { variant: 'half', dy: -5 },
          tail: { variant: 'fan', dx: -1, dy: -4 },
          legFront: { variant: 'tucked', dx: 1, dy: -3 },
          legBack: { variant: 'tucked', dy: -3 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 100,
        ease: 'in',
        pose: {
          body: { dy: -2 },
          head: { dx: 1, dy: -2 },
          eye: { dx: 1, dy: -2 },
          beak: { dx: 2, dy: -2 },
          wing: { variant: 'half', dy: -2 },
          tail: { variant: 'fan', dy: -1 },
          legFront: { variant: 'extended', dx: 1 },
          legBack: { variant: 'extended' },
        },
      },
      {
        d: 110,
        ease: 'out',
        pose: {
          body: { dy: 2 },
          head: { dy: 3 },
          eye: { dy: 3 },
          beak: { dy: 3 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 110,
        ease: 'out',
        pose: {
          body: { dy: 1 },
          head: { dy: 1 },
          eye: { dy: 1 },
          beak: { dy: 1 },
          wing: { dy: 1 },
        },
      },
      { d: 170, ease: 'hold', pose: {} },
    ],
  },

  /** Shorter, more cautious, tail up the whole way. Birds do not commit to these. */
  hopBackward: {
    name: 'hopBackward',
    group: 'locomotion',
    loop: false,
    frames: [
      { d: 110, ease: 'out', pose: {} },
      {
        d: 140,
        ease: 'in',
        pose: {
          body: { dy: 2 },
          head: { dx: -1, dy: 2 },
          eye: { dx: -2, dy: 2 },
          beak: { dx: -2, dy: 2 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'up', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 110,
        ease: 'out',
        pose: {
          body: { dx: -1, dy: -3 },
          head: { dx: -2, dy: -3 },
          eye: { dx: -3, dy: -3 },
          beak: { dx: -3, dy: -3 },
          wing: { variant: 'up', dy: -2 },
          tail: { variant: 'up', dy: -3 },
          legFront: { variant: 'tucked', dx: -1, dy: -2 },
          legBack: { variant: 'tucked', dy: -2 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 110,
        ease: 'in',
        pose: {
          body: { dx: -1, dy: -1 },
          head: { dx: -1, dy: -1 },
          eye: { dx: -2, dy: -1 },
          beak: { dx: -2, dy: -1 },
          wing: { variant: 'half', dy: -1 },
          tail: { variant: 'up' },
          legFront: { variant: 'extended', dx: -1 },
          legBack: { variant: 'extended' },
        },
      },
      {
        d: 120,
        ease: 'out',
        pose: {
          body: { dy: 2 },
          head: { dy: 2 },
          eye: { dy: 2 },
          beak: { dy: 2 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      { d: 190, ease: 'hold', pose: {} },
    ],
  },

  /**
   * Eight frames, looping. The head bob is the whole trick: it thrusts forward
   * and then holds still in space while the body walks up under it, which is
   * what makes a walking bird read as a bird and not as a wind-up toy.
   */
  walkCycle: {
    name: 'walkCycle',
    group: 'locomotion',
    loop: true,
    frames: [
      {
        d: 110,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'up', dx: 1 },
          head: { dx: 2 },
          eye: { dx: 2 },
          beak: { dx: 2 },
          tail: { dx: -1 },
        },
      },
      {
        d: 100,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'extended', dx: 2 },
          head: { dx: 2 },
          eye: { dx: 2 },
          beak: { dx: 2 },
          body: { dy: -1 },
          wing: { dy: -1 },
        },
      },
      {
        d: 110,
        ease: 'inOut',
        pose: {
          legFront: { dx: 1 },
          legBack: { dx: -1 },
        },
      },
      {
        d: 110,
        ease: 'inOut',
        pose: {
          legFront: { dx: 1 },
          legBack: { variant: 'up', dx: -1 },
          tail: { dx: 1 },
        },
      },
      {
        d: 100,
        ease: 'inOut',
        pose: {
          legBack: { variant: 'up', dx: 1 },
          head: { dx: 2 },
          eye: { dx: 2 },
          beak: { dx: 2 },
          body: { dy: -1 },
          wing: { dy: -1 },
        },
      },
      {
        d: 110,
        ease: 'inOut',
        pose: {
          legFront: { dx: -1 },
          legBack: { variant: 'extended', dx: 2 },
          head: { dx: 2 },
          eye: { dx: 2 },
          beak: { dx: 2 },
        },
      },
      {
        d: 110,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'up', dx: -1 },
          legBack: { dx: 1 },
        },
      },
      {
        d: 110,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'up' },
          head: { dx: 1 },
          eye: { dx: 1 },
          beak: { dx: 1 },
          tail: { dx: -1 },
        },
      },
    ],
  },

  /** A hop with a facing change hidden inside it, at the apex where it reads cleanest. */
  turnAround: {
    name: 'turnAround',
    group: 'locomotion',
    loop: false,
    frames: [
      { d: 120, ease: 'out', pose: {} },
      {
        d: 130,
        ease: 'in',
        pose: {
          body: { dy: 2 },
          head: { dy: 2 },
          eye: { dy: 2 },
          beak: { dy: 2 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 110,
        ease: 'out',
        pose: {
          body: { dy: -3 },
          head: { dy: -4 },
          eye: { dy: -4 },
          beak: { dy: -4 },
          wing: { variant: 'up', dy: -3 },
          tail: { variant: 'fan', dy: -3 },
          legFront: { variant: 'tucked', dy: -2 },
          legBack: { variant: 'tucked', dy: -2 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 110,
        ease: 'in',
        flip: true,
        pose: {
          body: { dy: -3 },
          head: { dy: -4 },
          eye: { dy: -4 },
          beak: { dy: -4 },
          wing: { variant: 'up', dy: -3 },
          tail: { variant: 'fan', dy: -3 },
          legFront: { variant: 'tucked', dy: -2 },
          legBack: { variant: 'tucked', dy: -2 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 120,
        ease: 'out',
        pose: {
          body: { dy: 1 },
          head: { dy: 2 },
          eye: { dy: 2 },
          beak: { dy: 2 },
          wing: { variant: 'half', dy: 1 },
          tail: { variant: 'fan' },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
          shadow: { variant: 'wide' },
        },
      },
      { d: 160, ease: 'hold', pose: {} },
    ],
  },

  /** Crab-steps backward one body width without changing facing. */
  sidestep: {
    name: 'sidestep',
    group: 'locomotion',
    loop: false,
    frames: [
      { d: 110, ease: 'out', pose: {} },
      {
        d: 110,
        ease: 'inOut',
        pose: {
          legBack: { variant: 'up', dx: -1 },
          body: { dy: -1 },
          head: { dy: -1 },
          eye: { dy: -1 },
          beak: { dy: -1 },
          wing: { variant: 'half' },
          tail: { dx: 1 },
        },
      },
      {
        d: 120,
        ease: 'inOut',
        pose: {
          legBack: { dx: -2 },
          legFront: { dx: -1 },
          body: { dx: -1 },
          head: { dx: -1 },
          eye: { dx: -1 },
          beak: { dx: -1 },
          wing: { variant: 'half' },
        },
      },
      {
        d: 110,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'up', dx: -1 },
          legBack: { dx: -2 },
          body: { dx: -1 },
          head: { dx: -1 },
          eye: { dx: -1 },
          beak: { dx: -1 },
        },
      },
      {
        d: 130,
        ease: 'inOut',
        pose: {
          legFront: { dx: -1 },
          legBack: { dx: -1 },
          body: { dx: -1 },
          head: { dx: -1 },
          eye: { dx: -1 },
          beak: { dx: -1 },
          tail: { dx: -1 },
        },
      },
      { d: 160, ease: 'hold', pose: {} },
    ],
  },

  /** Startled wingbeats. Lifts a couple of pixels, gets nowhere, lands. */
  flutter: {
    name: 'flutter',
    group: 'locomotion',
    loop: false,
    frames: [
      { d: 80, ease: 'out', pose: {} },
      {
        d: 70,
        ease: 'out',
        pose: {
          wing: { variant: 'up', dy: -2 },
          body: { dy: -1 },
          head: { dy: -2 },
          eye: { dy: -2 },
          beak: { dy: -2 },
          tail: { variant: 'fan' },
          legFront: { variant: 'up' },
          legBack: { variant: 'up' },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 70,
        ease: 'inOut',
        pose: {
          wing: { variant: 'spread', dx: -2, dy: -1 },
          body: { dy: -2 },
          head: { dy: -3 },
          eye: { dy: -3 },
          beak: { dy: -3 },
          tail: { variant: 'fan', dy: -1 },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 70,
        ease: 'inOut',
        pose: {
          wing: { variant: 'up', dy: -3 },
          body: { dy: -2 },
          head: { dy: -3 },
          eye: { dy: -3 },
          beak: { dy: -3 },
          tail: { variant: 'fan', dy: -1 },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 80,
        ease: 'in',
        pose: {
          wing: { variant: 'spread', dx: -2 },
          body: { dy: -1 },
          head: { dy: -1 },
          eye: { dy: -1 },
          beak: { dy: -1 },
          tail: { variant: 'fan' },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
        },
      },
      {
        d: 100,
        ease: 'out',
        pose: {
          wing: { variant: 'half' },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          body: { dy: 1 },
          head: { dy: 1 },
          eye: { dy: 1 },
          beak: { dy: 1 },
          tail: { variant: 'down' },
          shadow: { variant: 'wide' },
        },
      },
      { d: 200, ease: 'hold', pose: {} },
    ],
  },

  /** Feet only. No lift, no travel to speak of — just a bird failing to stand still. */
  shuffle: {
    name: 'shuffle',
    group: 'locomotion',
    loop: false,
    frames: [
      { d: 130, ease: 'out', pose: {} },
      {
        d: 120,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'up' },
          body: { dx: 1 },
          head: { dx: 1 },
          eye: { dx: 1 },
          beak: { dx: 1 },
          tail: { dx: 1 },
        },
      },
      {
        d: 110,
        ease: 'inOut',
        pose: {
          legFront: { dx: 1 },
          body: { dx: 1 },
          head: { dx: 1 },
          eye: { dx: 1 },
          beak: { dx: 1 },
        },
      },
      {
        d: 120,
        ease: 'inOut',
        pose: {
          legBack: { variant: 'up' },
          legFront: { dx: 1 },
          body: { dx: 1 },
          tail: { dx: 2 },
        },
      },
      {
        d: 130,
        ease: 'inOut',
        pose: {
          legBack: { dx: 1 },
          legFront: { dx: 1 },
          body: { dx: 1 },
          head: { dx: 1 },
          eye: { dx: 1 },
          beak: { dx: 1 },
        },
      },
      { d: 180, ease: 'hold', pose: {} },
    ],
  },

  /** Turns on the spot without leaving the ground. Cheaper and quieter than turnAround. */
  pivot: {
    name: 'pivot',
    group: 'locomotion',
    loop: false,
    frames: [
      { d: 140, ease: 'out', pose: {} },
      {
        d: 120,
        ease: 'inOut',
        pose: {
          tail: { variant: 'up' },
          head: { dx: 1 },
          eye: { dx: 1 },
          beak: { dx: 1 },
          legFront: { variant: 'up' },
          body: { dy: -1 },
        },
      },
      {
        d: 110,
        ease: 'inOut',
        flip: true,
        pose: {
          tail: { variant: 'fan' },
          legFront: { variant: 'up', dx: -1 },
          legBack: { variant: 'up', dx: 1 },
          body: { dy: -1 },
          wing: { variant: 'half' },
        },
      },
      {
        d: 130,
        ease: 'out',
        pose: {
          tail: { variant: 'fan' },
          wing: { variant: 'half' },
        },
      },
      { d: 180, ease: 'hold', pose: {} },
    ],
  },
};

/* ==========================================================================
   transit animations

   Never chosen by the idle picker. The physics owner drives these directly and
   is expected to stitch them: crouch -> launch -> airUp -> airApex -> airDown
   -> land, holding whichever middle state matches the current vertical
   velocity for as long as it needs to. The three `air*` states and `flyFlap`
   therefore loop, and `crouch` and `diveTuck` end on a held pose rather than
   returning to rest — they are postures, not gestures.
   ========================================================================== */
export const TRANSIT_ANIMATIONS: { readonly [N in TransitName]: Animation } = {
  /** Load. Ends held: sit here as long as the launch is being wound up. */
  crouch: {
    name: 'crouch',
    group: 'transit',
    loop: false,
    frames: [
      { d: 90, ease: 'in', pose: {} },
      {
        d: 140,
        ease: 'hold',
        pose: {
          body: { dy: 2 },
          head: { dy: 2 },
          eye: { dy: 2 },
          beak: { dy: 2 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
    ],
  },

  launch: {
    name: 'launch',
    group: 'transit',
    loop: false,
    frames: [
      {
        d: 60,
        ease: 'out',
        pose: {
          body: { dy: 2 },
          head: { dy: 2 },
          eye: { dy: 2 },
          beak: { dy: 2 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 90,
        ease: 'out',
        pose: {
          body: { dy: -2 },
          head: { dy: -3 },
          eye: { dy: -3 },
          beak: { dy: -3 },
          wing: { variant: 'up', dy: -2 },
          tail: { variant: 'fan', dy: -2 },
          legFront: { variant: 'extended', dy: -1 },
          legBack: { variant: 'extended', dy: -1 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 110,
        ease: 'hold',
        pose: {
          body: { dy: -4 },
          head: { dy: -5 },
          eye: { dy: -5 },
          beak: { dy: -5 },
          wing: { variant: 'spread', dx: -2, dy: -4 },
          tail: { variant: 'fan', dy: -4 },
          legFront: { variant: 'tucked', dy: -2 },
          legBack: { variant: 'tucked', dy: -2 },
          shadow: { variant: 'none' },
        },
      },
    ],
  },

  /** Climbing: hard downstroke, quick recovery. Hold while velocity is upward. */
  airUp: {
    name: 'airUp',
    group: 'transit',
    loop: true,
    frames: [
      {
        d: 90,
        ease: 'inOut',
        pose: {
          wing: { variant: 'up', dy: -2 },
          head: { dy: -1 },
          eye: { dy: -1 },
          beak: { dy: -1 },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 110,
        ease: 'inOut',
        pose: {
          wing: { variant: 'spread', dx: -2, dy: 1 },
          tail: { dy: 1 },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          shadow: { variant: 'none' },
        },
      },
    ],
  },

  /** The float at the top of an arc. Wings held, tail fanned, almost still. */
  airApex: {
    name: 'airApex',
    group: 'transit',
    loop: true,
    frames: [
      {
        d: 220,
        ease: 'inOut',
        pose: {
          wing: { variant: 'spread', dx: -2 },
          tail: { variant: 'fan' },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          head: { dy: -1 },
          eye: { dy: -1 },
          beak: { dy: -1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 220,
        ease: 'inOut',
        pose: {
          wing: { variant: 'spread', dx: -2, dy: 1 },
          tail: { variant: 'fan', dy: 1 },
          legFront: { variant: 'tucked', dy: 1 },
          legBack: { variant: 'tucked', dy: 1 },
          body: { dy: 1 },
          shadow: { variant: 'none' },
        },
      },
    ],
  },

  /** Descending with the feet already reaching. Shadow reappears and grows. */
  airDown: {
    name: 'airDown',
    group: 'transit',
    loop: true,
    frames: [
      {
        d: 130,
        ease: 'inOut',
        pose: {
          wing: { variant: 'half', dy: -1 },
          tail: { variant: 'down' },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
          head: { dx: 1, dy: 1 },
          eye: { dx: 1, dy: 1 },
          beak: { dx: 1, dy: 1 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 130,
        ease: 'inOut',
        pose: {
          wing: { variant: 'spread', dx: -2, dy: -2 },
          tail: { variant: 'down' },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
          head: { dx: 1 },
          eye: { dx: 1 },
          beak: { dx: 1 },
          shadow: { variant: 'narrow' },
        },
      },
    ],
  },

  /** Touchdown, squash, recover. Ends in rest so an idle can take over cleanly. */
  land: {
    name: 'land',
    group: 'transit',
    loop: false,
    frames: [
      {
        d: 80,
        ease: 'in',
        pose: {
          wing: { variant: 'spread', dx: -2, dy: -2 },
          tail: { variant: 'fan' },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
          body: { dy: -2 },
          head: { dy: -2 },
          eye: { dy: -2 },
          beak: { dy: -2 },
          shadow: { variant: 'mid' },
        },
      },
      {
        d: 110,
        ease: 'out',
        pose: {
          wing: { variant: 'half', dy: 1 },
          tail: { variant: 'fan', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          body: { dy: 2 },
          head: { dy: 3 },
          eye: { dy: 3 },
          beak: { dy: 3 },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 100,
        ease: 'inOut',
        pose: {
          wing: { variant: 'half' },
          tail: { variant: 'down' },
          body: { dy: -1 },
          head: { dy: -1 },
          eye: { dy: -1 },
          beak: { dy: -1 },
        },
      },
      { d: 160, ease: 'hold', pose: {} },
    ],
  },

  /** Sustained level flight. Four beats, roughly 270ms a cycle. */
  flyFlap: {
    name: 'flyFlap',
    group: 'transit',
    loop: true,
    frames: [
      {
        d: 70,
        ease: 'inOut',
        pose: {
          wing: { variant: 'up', dy: -3 },
          body: { dy: -1 },
          head: { dy: -1 },
          eye: { dy: -1 },
          beak: { dy: -1 },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 60,
        ease: 'inOut',
        pose: {
          wing: { variant: 'half', dy: -1 },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 80,
        ease: 'inOut',
        pose: {
          wing: { variant: 'spread', dx: -2, dy: 2 },
          body: { dy: 1 },
          head: { dy: 1 },
          eye: { dy: 1 },
          beak: { dy: 1 },
          tail: { dy: 1 },
          legFront: { variant: 'tucked', dy: 1 },
          legBack: { variant: 'tucked', dy: 1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 60,
        ease: 'inOut',
        pose: {
          wing: { variant: 'half', dy: 1 },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          shadow: { variant: 'none' },
        },
      },
    ],
  },

  /** Everything pulled in, nose down. Ends held for as long as the dive lasts. */
  diveTuck: {
    name: 'diveTuck',
    group: 'transit',
    loop: false,
    frames: [
      {
        d: 90,
        ease: 'in',
        pose: {
          wing: { variant: 'half', dy: -1 },
          tail: { variant: 'down' },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          head: { dx: 1 },
          eye: { dx: 1 },
          beak: { dx: 1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 160,
        ease: 'hold',
        pose: {
          wing: { variant: 'tucked' },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          head: { dx: 2, dy: 1 },
          eye: { dx: 2, dy: 1, variant: 'half' },
          beak: { dx: 3, dy: 1 },
          body: { dy: 1 },
          shadow: { variant: 'none' },
        },
      },
    ],
  },

  /**
   * Hanging from something gripped in the beak, swinging on a slow pendulum.
   * Legs dangle, wings half out for trim, nothing touches the ground.
   */
  balloonHold: {
    name: 'balloonHold',
    group: 'transit',
    loop: true,
    frames: [
      {
        d: 900,
        ease: 'inOut',
        pose: {
          wing: { variant: 'half', dy: -1 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'extended', dy: 1 },
          legBack: { variant: 'extended', dy: 1 },
          body: { dy: -1 },
          head: { dy: -1 },
          eye: { dy: -1 },
          beak: { dy: -1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 900,
        ease: 'inOut',
        pose: {
          wing: { variant: 'half', dx: -1 },
          tail: { variant: 'down', dx: -1, dy: 1 },
          legFront: { variant: 'extended', dx: -1, dy: 1 },
          legBack: { variant: 'extended', dx: -1, dy: 1 },
          body: { dx: -1 },
          head: { dx: -1 },
          eye: { dx: -1 },
          beak: { dx: -1 },
          shadow: { variant: 'none' },
        },
      },
    ],
  },
};

/* ==========================================================================
   transit up — the reader scrolled up fast

   One workaday climb and four things that should not be happening. The rarity
   split is data, not vibes: see TRANSIT_UP at the bottom of this file, where
   `upFlap` carries nine tenths of the weight and the other four share what is
   left. A reader who scrolls up a hundred times should see the saucer once and
   spend the rest of their life wondering whether they imagined it.

   All five LOOP. The rig cannot know how far the reader is about to travel,
   so it plays the loop for the duration of the flight and then hands over to
   `land`. Props (balloon, ufo, ufoBeam) are listed per-animation in
   TRANSIT_PROPS and are drawn by the rig, not by the puppet.
   ========================================================================== */
export const TRANSIT_UP_ANIMATIONS: { readonly [N in TransitUpName]: Animation } = {
  /**
   * The common one. Four beats, harder than `flyFlap`: `up` against `down`
   * rather than `up` against `spread`, so the wing crosses the whole shoulder
   * on every stroke. A climb is not level flight played faster.
   */
  upFlap: {
    name: 'upFlap',
    group: 'transit',
    loop: true,
    frames: [
      {
        d: 70,
        ease: 'inOut',
        pose: {
          wing: { variant: 'up', dy: -3 },
          body: { dy: -1 },
          head: { variant: 'sleek', dy: -2 },
          eye: { dy: -1 },
          beak: { dy: -1 },
          tail: { variant: 'streamer', dy: -1 },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 60,
        ease: 'inOut',
        pose: {
          wing: { variant: 'half', dy: -1 },
          head: { variant: 'sleek', dy: -1 },
          eye: { dy: 0 },
          beak: { dy: 0 },
          tail: { variant: 'streamer' },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 80,
        ease: 'inOut',
        pose: {
          wing: { variant: 'down', dy: 2 },
          body: { dy: 1 },
          head: { variant: 'sleek', dy: 1 },
          eye: { dy: 2 },
          beak: { dy: 2 },
          tail: { variant: 'streamer', dy: 1 },
          legFront: { variant: 'tucked', dy: 1 },
          legBack: { variant: 'tucked', dy: 1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 60,
        ease: 'inOut',
        pose: {
          wing: { variant: 'half', dy: 1 },
          head: { variant: 'sleek' },
          eye: { dy: 1 },
          beak: { dy: 1 },
          tail: { variant: 'streamer' },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          shadow: { variant: 'none' },
        },
      },
    ],
  },

  /**
   * Rare. Wings folded away entirely — a bird using a jetpack is not going to
   * insult it by flapping. Everything shakes a whole pixel on `hold`, which is
   * the only honest way to draw vibration in pixel art, and the flame alternates
   * long/short so the thrust reads as pulsed rather than constant.
   */
  upJetpack: {
    name: 'upJetpack',
    group: 'transit',
    loop: true,
    frames: [
      {
        d: 90,
        ease: 'hold',
        pose: {
          gear: { variant: 'jetpackHigh' },
          wing: { variant: 'tucked' },
          tail: { variant: 'streamer' },
          head: { variant: 'sleek' },
          eye: { dy: 1, variant: 'wide' },
          beak: { dy: 1 },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          gear: { variant: 'jetpackLow', dx: 1 },
          wing: { variant: 'tucked', dx: 1 },
          tail: { variant: 'streamer', dx: 1 },
          body: { dx: 1 },
          head: { variant: 'sleek', dx: 1 },
          eye: { dx: 1, dy: 1, variant: 'wide' },
          beak: { dx: 1, dy: 1 },
          legFront: { variant: 'tucked', dx: 1 },
          legBack: { variant: 'tucked', dx: 1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 80,
        ease: 'hold',
        pose: {
          gear: { variant: 'jetpackHigh', dx: -1 },
          wing: { variant: 'tucked', dx: -1 },
          tail: { variant: 'streamer', dx: -1 },
          body: { dx: -1 },
          head: { variant: 'sleek', dx: -1 },
          eye: { dx: -1, dy: 1, variant: 'wide' },
          beak: { dx: -1, dy: 1 },
          legFront: { variant: 'tucked', dx: -1 },
          legBack: { variant: 'tucked', dx: -1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          gear: { variant: 'jetpackLow' },
          wing: { variant: 'tucked' },
          tail: { variant: 'streamer' },
          head: { variant: 'sleek' },
          eye: { dy: 1, variant: 'wide' },
          beak: { dy: 1 },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          shadow: { variant: 'none' },
        },
      },
    ],
  },

  /**
   * Rare. Hanging off the basket rope by the beak, legs dangling, on a slow
   * two-second pendulum. Deliberately the calmest thing in the file: the joke
   * is that he is in no hurry whatsoever.
   *
   * Rig draws PROPS.balloon and PROPS.balloonRope above him.
   */
  upBalloon: {
    name: 'upBalloon',
    group: 'transit',
    loop: true,
    frames: [
      {
        d: 1000,
        ease: 'inOut',
        pose: {
          beak: { variant: 'grip', dy: -1 },
          head: { dy: -1 },
          eye: { dy: -1, variant: 'arc' },
          body: { dy: -1 },
          wing: { variant: 'half', dy: -1 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'extended', dy: 1 },
          legBack: { variant: 'extended', dy: 1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 1000,
        ease: 'inOut',
        pose: {
          beak: { variant: 'grip', dx: -1, dy: -1 },
          head: { dx: -1, dy: -1 },
          eye: { dx: -1, dy: -1, variant: 'arc' },
          body: { dx: -1, dy: -1 },
          wing: { variant: 'half', dx: -1, dy: -1 },
          tail: { variant: 'down', dx: -1, dy: 1 },
          legFront: { variant: 'extended', dx: -1, dy: 1 },
          legBack: { variant: 'extended', dx: -1, dy: 1 },
          shadow: { variant: 'none' },
        },
      },
    ],
  },

  /**
   * Rarest. He is not flying, he is being MOVED: limp, arms out, rotating
   * slowly in the beam. The rotation is two `flip` toggles per cycle, which
   * nets to zero over the loop — the bird ends every cycle facing the way it
   * started, so the rig never has to correct the facing afterwards.
   *
   * Rig draws PROPS.ufo above and PROPS.ufoBeam behind.
   */
  upUfo: {
    name: 'upUfo',
    group: 'transit',
    loop: true,
    frames: [
      {
        d: 420,
        ease: 'inOut',
        pose: {
          wing: { variant: 'spread', dx: -2, dy: -1 },
          tail: { variant: 'fan' },
          legFront: { variant: 'splay' },
          legBack: { variant: 'splay' },
          head: { dy: -1 },
          eye: { dy: -1, variant: 'wide' },
          beak: { dy: -1, variant: 'wide' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 420,
        ease: 'inOut',
        flip: true,
        pose: {
          wing: { variant: 'flare', dy: -1 },
          tail: { variant: 'fan', dy: -1 },
          legFront: { variant: 'splay', dy: -1 },
          legBack: { variant: 'splay', dy: -1 },
          body: { dy: -1 },
          head: { dy: -2 },
          eye: { dy: -2, variant: 'wide' },
          beak: { dy: -2, variant: 'wide' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 420,
        ease: 'inOut',
        pose: {
          wing: { variant: 'spread', dx: -2 },
          tail: { variant: 'fan' },
          legFront: { variant: 'splay' },
          legBack: { variant: 'splay' },
          head: { dy: -1 },
          eye: { dy: -1, variant: 'wide' },
          beak: { dy: -1, variant: 'wide' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 420,
        ease: 'inOut',
        flip: true,
        pose: {
          wing: { variant: 'flare', dy: -1 },
          tail: { variant: 'fan', dy: -1 },
          legFront: { variant: 'splay', dy: -1 },
          legBack: { variant: 'splay', dy: -1 },
          body: { dy: -1 },
          head: { dy: -2 },
          eye: { dy: -2, variant: 'wide' },
          beak: { dy: -2, variant: 'wide' },
          shadow: { variant: 'none' },
        },
      },
    ],
  },

  /**
   * Mine. Rare. A propeller beanie, spun by alternating two hat variants on
   * `hold` at 70ms — fast enough to blur in the eye, slow enough that you can
   * see it is two drawings, which is funnier. He is extremely pleased about it
   * (eye stays on the arc the whole way up).
   */
  upPropeller: {
    name: 'upPropeller',
    group: 'transit',
    loop: true,
    frames: [
      {
        d: 70,
        ease: 'hold',
        pose: {
          hat: { variant: 'propellerA' },
          wing: { variant: 'tucked' },
          tail: { variant: 'down' },
          eye: { variant: 'arc' },
          legFront: { variant: 'extended', dy: 1 },
          legBack: { variant: 'extended', dy: 1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 70,
        ease: 'hold',
        pose: {
          hat: { variant: 'propellerB', dy: -1 },
          wing: { variant: 'tucked', dy: -1 },
          tail: { variant: 'down' },
          body: { dy: -1 },
          head: { dy: -1 },
          eye: { dy: -1, variant: 'arc' },
          beak: { dy: -1 },
          legFront: { variant: 'extended', dy: 1 },
          legBack: { variant: 'extended', dy: 1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 70,
        ease: 'hold',
        pose: {
          hat: { variant: 'propellerA' },
          wing: { variant: 'tucked' },
          tail: { variant: 'down' },
          eye: { variant: 'arc' },
          legFront: { variant: 'extended', dy: 1 },
          legBack: { variant: 'extended', dy: 1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 70,
        ease: 'hold',
        pose: {
          hat: { variant: 'propellerB', dy: -1 },
          wing: { variant: 'tucked', dy: -1 },
          tail: { variant: 'down' },
          body: { dy: -1 },
          head: { dy: -1 },
          eye: { dy: -1, variant: 'arc' },
          beak: { dy: -1 },
          legFront: { variant: 'extended', dy: 1 },
          legBack: { variant: 'extended', dy: 1 },
          shadow: { variant: 'none' },
        },
      },
    ],
  },
};

/* ==========================================================================
   transit down — the reader scrolled down fast

   Same rarity logic as transit up, and the same instruction to the rig: pick
   from TRANSIT_DOWN, not from this record.

   Read the `loop` flag before you schedule one of these. `downGlide`,
   `downUmbrella` and `downPaperPlane` loop and can cover any distance.
   `downSkydive`, `downCrash` and `downRope` do NOT: each carries a scripted
   payoff at a specific moment, and cutting away from it throws the joke away.
   Give those the travel time their duration asks for.
   ========================================================================== */
export const TRANSIT_DOWN_ANIMATIONS: { readonly [N in TransitDownName]: Animation } = {
  /**
   * The common one. Two working beats, then a long spread-winged glide with
   * the head held forward — the flap is 170ms of the cycle and the glide is
   * 840ms, which is roughly the ratio a real descending sparrow uses.
   */
  downGlide: {
    name: 'downGlide',
    group: 'transit',
    loop: true,
    frames: [
      {
        d: 80,
        ease: 'inOut',
        pose: {
          wing: { variant: 'up', dy: -2 },
          body: { dy: -1 },
          head: { dy: -1 },
          eye: { dy: -1 },
          beak: { dy: -1 },
          tail: { variant: 'fan' },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 90,
        ease: 'inOut',
        pose: {
          wing: { variant: 'down', dy: 2 },
          body: { dy: 1 },
          head: { dy: 1 },
          eye: { dy: 1 },
          beak: { dy: 1 },
          tail: { variant: 'fan', dy: 1 },
          legFront: { variant: 'tucked', dy: 1 },
          legBack: { variant: 'tucked', dy: 1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 420,
        ease: 'inOut',
        pose: {
          wing: { variant: 'spread', dx: -2 },
          tail: { variant: 'fan' },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          head: { dx: 1 },
          eye: { dx: 1 },
          beak: { dx: 1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 420,
        ease: 'inOut',
        pose: {
          wing: { variant: 'spread', dx: -2, dy: 1 },
          tail: { variant: 'fan', dy: 1 },
          legFront: { variant: 'tucked', dy: 1 },
          legBack: { variant: 'tucked', dy: 1 },
          body: { dy: 1 },
          head: { dx: 1, dy: 1 },
          eye: { dx: 1, dy: 1 },
          beak: { dx: 1, dy: 1 },
          shadow: { variant: 'none' },
        },
      },
    ],
  },

  /**
   * Rare, and the timing is the whole gag. 2.0s of belly-down freefall with
   * the chute still packed on his back and a growing suspicion on his face,
   * one 90ms frame where the harness snaps open, and then a floating 1.0s
   * under canopy. Do not shorten the freefall: the chute has to be late
   * enough to be a relief.
   *
   * Rig draws PROPS.parachute above from the deploy frame onward.
   */
  downSkydive: {
    name: 'downSkydive',
    group: 'transit',
    loop: false,
    frames: [
      {
        d: 140,
        ease: 'in',
        pose: {
          body: { variant: 'flat' },
          wing: { variant: 'flare', dy: 2 },
          tail: { variant: 'streamer', dy: 2 },
          legFront: { variant: 'splay', dy: 1 },
          legBack: { variant: 'splay', dy: 1 },
          head: { variant: 'sleek', dy: 2 },
          eye: { dy: 3 },
          beak: { dy: 3 },
          gear: { variant: 'chutePack' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 420,
        ease: 'hold',
        pose: {
          body: { variant: 'flat', dx: 1 },
          wing: { variant: 'flare', dx: 1, dy: 2 },
          tail: { variant: 'streamer', dx: 1, dy: 2 },
          legFront: { variant: 'splay', dx: 1, dy: 1 },
          legBack: { variant: 'splay', dx: 1, dy: 1 },
          head: { variant: 'sleek', dx: 1, dy: 2 },
          eye: { dx: 1, dy: 3 },
          beak: { dx: 1, dy: 3 },
          gear: { variant: 'chutePack', dx: 1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 420,
        ease: 'hold',
        pose: {
          body: { variant: 'flat', dx: -1 },
          wing: { variant: 'flare', dx: -1, dy: 2 },
          tail: { variant: 'streamer', dx: -1, dy: 2 },
          legFront: { variant: 'splay', dx: -1, dy: 1 },
          legBack: { variant: 'splay', dx: -1, dy: 1 },
          head: { variant: 'sleek', dx: -1, dy: 2 },
          eye: { dx: -1, dy: 3, variant: 'half' },
          beak: { dx: -1, dy: 3 },
          gear: { variant: 'chutePack', dx: -1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 640,
        ease: 'hold',
        pose: {
          body: { variant: 'flat' },
          wing: { variant: 'flare', dy: 2 },
          tail: { variant: 'streamer', dy: 2 },
          legFront: { variant: 'splay', dy: 1 },
          legBack: { variant: 'splay', dy: 1 },
          head: { variant: 'sleek', dy: 2 },
          eye: { dy: 3, variant: 'wide' },
          beak: { dy: 3, variant: 'wide' },
          gear: { variant: 'chutePack' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 90,
        ease: 'out',
        pose: {
          gear: { variant: 'harness' },
          wing: { variant: 'tucked' },
          tail: { variant: 'down' },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
          body: { dy: -2 },
          head: { dy: -3 },
          eye: { dy: -3, variant: 'wide' },
          beak: { dy: -3, variant: 'wide' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 260,
        ease: 'inOut',
        pose: {
          gear: { variant: 'harness' },
          wing: { variant: 'half' },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'extended', dy: 1 },
          legBack: { variant: 'extended', dy: 1 },
          eye: { variant: 'arc' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 520,
        ease: 'inOut',
        pose: {
          gear: { variant: 'harness' },
          wing: { variant: 'half' },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'extended', dy: 1 },
          legBack: { variant: 'extended', dy: 1 },
          eye: { variant: 'arc' },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 480,
        ease: 'inOut',
        pose: {
          gear: { variant: 'harness', dx: -1 },
          wing: { variant: 'half', dx: -1 },
          tail: { variant: 'down', dx: -1, dy: 1 },
          legFront: { variant: 'extended', dx: -1, dy: 1 },
          legBack: { variant: 'extended', dx: -1, dy: 1 },
          body: { dx: -1 },
          head: { dx: -1 },
          eye: { dx: -1, variant: 'arc' },
          beak: { dx: -1 },
          shadow: { variant: 'narrow' },
        },
      },
    ],
  },

  /**
   * Rare. No vehicle, no plan. Falls cleanly first, then tumbles head-over-tail,
   * hits the floor flat, lies there for 420ms of pure stillness — which is the funniest
   * frame in the file and must not be trimmed — and then shakes it off in
   * three whole-pixel jerks and stands up as if nothing happened.
   *
   * Rig spawns PROPS.featherPlume on the impact frame and a few
   * PROPS.featherSingle drifting down through the recovery.
   */
  downCrash: {
    name: 'downCrash',
    group: 'transit',
    loop: false,
    frames: [
      {
        /* A readable fall before the gag. The old 100ms setup was effectively
           already an impact pose by the first painted frame. */
        d: 430,
        ease: 'in',
        pose: {
          wing: { variant: 'spread', dy: -1 },
          tail: { variant: 'streamer' },
          head: { variant: 'sleek', dy: -1 },
          eye: { dy: 0, variant: 'wide' },
          beak: { dy: 0 },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 240,
        ease: 'hold',
        pose: {
          wing: { variant: 'flare', dy: 3 },
          tail: { variant: 'up', dy: -2 },
          legFront: { variant: 'splay', dy: -6 },
          legBack: { variant: 'splay', dy: -6 },
          body: { dy: 1 },
          head: { dy: 8 },
          eye: { dy: 8, variant: 'dizzy' },
          beak: { dy: 9, variant: 'wide' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 160,
        ease: 'hold',
        pose: {
          wing: { variant: 'flare', dy: -1 },
          tail: { variant: 'fan' },
          legFront: { variant: 'splay' },
          legBack: { variant: 'splay' },
          eye: { variant: 'wide' },
          beak: { variant: 'wide' },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 70,
        ease: 'in',
        pose: {
          body: { variant: 'flat', dy: 4 },
          wing: { variant: 'flare', dy: 5 },
          tail: { variant: 'fan', dy: 3 },
          legFront: { variant: 'splay', dy: 2 },
          legBack: { variant: 'splay', dy: 2 },
          head: { variant: 'sleek', dy: 6 },
          eye: { dy: 7, variant: 'dizzy' },
          beak: { dy: 7, variant: 'wide' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 420,
        ease: 'hold',
        pose: {
          body: { variant: 'flat', dy: 5 },
          wing: { variant: 'flare', dy: 6 },
          tail: { variant: 'fan', dy: 4 },
          legFront: { variant: 'splay', dy: 2 },
          legBack: { variant: 'splay', dy: 2 },
          head: { variant: 'sleek', dy: 7 },
          eye: { dy: 8, variant: 'dizzy' },
          beak: { dy: 8, variant: 'wide' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 300,
        ease: 'out',
        pose: {
          body: { variant: 'fluffed', dy: 2 },
          head: { variant: 'fluffed', dy: 2 },
          eye: { dx: 1, dy: 2, variant: 'dizzy' },
          beak: { dx: 1, dy: 2 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down' },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed', dx: 1 },
          head: { variant: 'fluffed', dx: 1 },
          eye: { dx: 2, variant: 'dizzy' },
          beak: { dx: 2 },
          wing: { dx: 1 },
          tail: { dx: 1 },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed', dx: -1 },
          head: { variant: 'fluffed', dx: -1 },
          eye: { dx: 0, variant: 'dizzy' },
          beak: { dx: 0 },
          wing: { dx: -1 },
          tail: { dx: -1 },
        },
      },
      {
        d: 80,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed', dx: 1 },
          head: { variant: 'fluffed', dx: 1 },
          eye: { dx: 2, variant: 'half' },
          beak: { dx: 2 },
          wing: { dx: 1 },
          tail: { dx: 1 },
        },
      },
      {
        d: 200,
        ease: 'out',
        pose: {
          body: { variant: 'fluffed' },
          head: { variant: 'fluffed' },
          eye: { dx: 1, variant: 'half' },
          beak: { dx: 1 },
        },
      },
      { d: 260, ease: 'hold', pose: {} },
    ],
  },

  /**
   * Rare. A rope arrives from somewhere above, he takes it in his beak, one
   * wing straight up on the line, and slides — the wobble is two `hold` frames
   * a pixel apart, because a rope under load does not ease. Lets go at the
   * bottom and takes the last foot himself.
   *
   * Rig draws PROPS.rope, dropping it in over the first 180ms.
   */
  downRope: {
    name: 'downRope',
    group: 'transit',
    loop: false,
    frames: [
      {
        d: 180,
        ease: 'out',
        pose: {
          head: { dy: -1 },
          eye: { dy: -1, variant: 'wide' },
          beak: { dy: -1 },
          tail: { variant: 'up' },
        },
      },
      {
        d: 160,
        ease: 'out',
        pose: {
          wing: { variant: 'reach' },
          beak: { variant: 'grip', dy: -2 },
          head: { dy: -2 },
          eye: { dy: -2, variant: 'wide' },
          body: { dy: -1 },
          tail: { variant: 'down' },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 420,
        ease: 'hold',
        pose: {
          wing: { variant: 'reach' },
          beak: { variant: 'grip', dy: -2 },
          head: { dy: -2 },
          eye: { dy: -2 },
          body: { dy: -1 },
          tail: { variant: 'streamer' },
          legFront: { variant: 'tucked' },
          legBack: { variant: 'tucked' },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 160,
        ease: 'hold',
        pose: {
          wing: { variant: 'reach', dx: 1 },
          beak: { variant: 'grip', dx: 1, dy: -2 },
          head: { dx: 1, dy: -2 },
          eye: { dx: 1, dy: -2 },
          body: { dx: 1, dy: -1 },
          tail: { variant: 'streamer', dx: 1 },
          legFront: { variant: 'tucked', dx: 1 },
          legBack: { variant: 'tucked', dx: 1 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 420,
        ease: 'hold',
        pose: {
          wing: { variant: 'reach', dx: -1 },
          beak: { variant: 'grip', dx: -1, dy: -2 },
          head: { dx: -1, dy: -2 },
          eye: { dx: -1, dy: -2 },
          body: { dx: -1, dy: -1 },
          tail: { variant: 'streamer', dx: -1 },
          legFront: { variant: 'tucked', dx: -1 },
          legBack: { variant: 'tucked', dx: -1 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 140,
        ease: 'out',
        pose: {
          wing: { variant: 'spread', dx: -2 },
          tail: { variant: 'fan' },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
          body: { dy: -1 },
          head: { dy: -1 },
          eye: { dy: -1 },
          beak: { dy: -1 },
          shadow: { variant: 'mid' },
        },
      },
      {
        d: 120,
        ease: 'out',
        pose: {
          wing: { variant: 'half', dy: 1 },
          tail: { variant: 'fan', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          body: { dy: 2 },
          head: { dy: 3 },
          eye: { dy: 3 },
          beak: { dy: 3 },
          shadow: { variant: 'wide' },
        },
      },
      { d: 220, ease: 'hold', pose: {} },
    ],
  },

  /**
   * Rare. One wing straight up on the handle, beak clamped for good measure,
   * legs together and pointed, drifting down on a four-beat sway. Loops, so it
   * covers any distance the reader asks for. Practically perfect.
   *
   * Rig draws PROPS.umbrella, whose shaft is authored to end exactly on the
   * row where `reach` grips.
   */
  downUmbrella: {
    name: 'downUmbrella',
    group: 'transit',
    loop: true,
    frames: [
      {
        d: 620,
        ease: 'inOut',
        pose: {
          wing: { variant: 'reach', dx: 1 },
          beak: { variant: 'grip', dx: 1, dy: -1 },
          head: { dx: 1, dy: -1 },
          eye: { dx: 1, dy: -1, variant: 'arc' },
          body: { dx: 1, dy: -1 },
          tail: { variant: 'down', dx: 1, dy: 1 },
          legFront: { variant: 'extended', dx: 1, dy: 1 },
          legBack: { variant: 'extended', dx: 1, dy: 1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 620,
        ease: 'inOut',
        pose: {
          wing: { variant: 'reach', dy: -1 },
          beak: { variant: 'grip', dy: -2 },
          head: { dy: -2 },
          eye: { dy: -2, variant: 'arc' },
          body: { dy: -2 },
          tail: { variant: 'down' },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 620,
        ease: 'inOut',
        pose: {
          wing: { variant: 'reach', dx: -1 },
          beak: { variant: 'grip', dx: -1, dy: -1 },
          head: { dx: -1, dy: -1 },
          eye: { dx: -1, dy: -1, variant: 'arc' },
          body: { dx: -1, dy: -1 },
          tail: { variant: 'down', dx: -1, dy: 1 },
          legFront: { variant: 'extended', dx: -1, dy: 1 },
          legBack: { variant: 'extended', dx: -1, dy: 1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 620,
        ease: 'inOut',
        pose: {
          wing: { variant: 'reach', dy: -1 },
          beak: { variant: 'grip', dy: -2 },
          head: { dy: -2 },
          eye: { dy: -2, variant: 'arc' },
          body: { dy: -2 },
          tail: { variant: 'down' },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
          shadow: { variant: 'none' },
        },
      },
    ],
  },

  /**
   * Mine. Rare. He is riding a folded paper dart, which is the only vehicle in
   * here that belongs to the rest of the site — everything on this page is
   * made of paper, so of course the way down is too. Legs slid flat along the
   * fuselage, wings out as ailerons, banking left and right on the way down.
   *
   * Rig draws PROPS.paperPlane under him.
   */
  downPaperPlane: {
    name: 'downPaperPlane',
    group: 'transit',
    loop: true,
    frames: [
      {
        d: 700,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'kick' },
          legBack: { variant: 'kick' },
          body: { dy: 1 },
          head: { variant: 'sleek', dy: 1 },
          eye: { dy: 2 },
          beak: { dy: 2 },
          wing: { variant: 'spread', dx: -2, dy: 1 },
          tail: { variant: 'streamer', dy: 1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 700,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'kick', dx: 1 },
          legBack: { variant: 'kick', dx: 1 },
          body: { dx: 1 },
          head: { variant: 'sleek', dx: 1 },
          eye: { dx: 1, dy: 1 },
          beak: { dx: 1, dy: 1 },
          wing: { variant: 'flare', dx: 1 },
          tail: { variant: 'streamer', dx: 1, dy: -1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 700,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'kick' },
          legBack: { variant: 'kick' },
          body: { dy: 1 },
          head: { variant: 'sleek', dy: 1 },
          eye: { dy: 2 },
          beak: { dy: 2 },
          wing: { variant: 'spread', dx: -2, dy: 1 },
          tail: { variant: 'streamer', dy: 1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 700,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'kick', dx: -1 },
          legBack: { variant: 'kick', dx: -1 },
          body: { dx: -1 },
          head: { variant: 'sleek', dx: -1 },
          eye: { dx: -1, dy: 1 },
          beak: { dx: -1, dy: 1 },
          wing: { variant: 'flare', dx: -1 },
          tail: { variant: 'streamer', dx: -1, dy: -1 },
          shadow: { variant: 'none' },
        },
      },
    ],
  },
};

/* ==========================================================================
   jumps with flare

   `hopInPlace` and `hopForward` stay the plain hops and should still be the
   bulk of what the reader sees. These six are what a hop turns into when the
   bird is in a mood — pick one out of JUMP_VARIANTS, weighted toward the two
   plain ones, so the flare stays a surprise.

   A note on the flips. This rig has no rotation: a part can move and it can
   swap to another drawing, and that is all. So a somersault is authored the
   way a somersault is animated on paper — the head travels DOWN past the body
   while the legs travel UP past it, the wing flares to sell the arc, and the
   whole thing happens inside two frames at the apex where the eye cannot
   follow it anyway. `jumpTwist` is the exception and gets to cheat: it uses
   two `flip` toggles, which net to zero across the animation, so the bird
   lands facing exactly the way it took off.
   ========================================================================== */
export const JUMP_ANIMATIONS: { readonly [N in JumpName]: Animation } = {
  /** A hop with one enormous wingbeat at the top. The gateway drug. */
  jumpFlap: {
    name: 'jumpFlap',
    group: 'locomotion',
    loop: false,
    frames: [
      { d: 90, ease: 'out', pose: {} },
      {
        d: 120,
        ease: 'in',
        pose: {
          body: { dy: 2 },
          head: { dy: 2 },
          eye: { dy: 2 },
          beak: { dy: 2 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 100,
        ease: 'out',
        pose: {
          body: { dy: -4 },
          head: { dy: -5 },
          eye: { dy: -5 },
          beak: { dy: -5 },
          wing: { variant: 'up', dy: -5 },
          tail: { variant: 'up', dy: -4 },
          legFront: { variant: 'tucked', dy: -3 },
          legBack: { variant: 'tucked', dy: -3 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 130,
        ease: 'inOut',
        pose: {
          body: { dy: -6 },
          head: { dy: -7 },
          eye: { dy: -7, variant: 'arc' },
          beak: { dy: -7, variant: 'open' },
          wing: { variant: 'flare', dy: -5 },
          tail: { variant: 'fan', dy: -5 },
          legFront: { variant: 'tucked', dy: -4 },
          legBack: { variant: 'tucked', dy: -4 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 110,
        ease: 'in',
        pose: {
          body: { dy: -2 },
          head: { dy: -2 },
          eye: { dy: -2, variant: 'arc' },
          beak: { dy: -2 },
          wing: { variant: 'down', dy: -1 },
          tail: { variant: 'fan', dy: -1 },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
        },
      },
      {
        d: 110,
        ease: 'out',
        pose: {
          body: { dy: 2 },
          head: { dy: 3 },
          eye: { dy: 3 },
          beak: { dy: 3 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      { d: 200, ease: 'hold', pose: {} },
    ],
  },

  /** Forward somersault. Head goes under, tail goes over, lands facing on. */
  jumpFlipFront: {
    name: 'jumpFlipFront',
    group: 'locomotion',
    loop: false,
    frames: [
      { d: 100, ease: 'out', pose: {} },
      {
        d: 130,
        ease: 'in',
        pose: {
          body: { dy: 2 },
          head: { dx: 1, dy: 2 },
          eye: { dx: 1, dy: 2 },
          beak: { dx: 2, dy: 2 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 90,
        ease: 'out',
        pose: {
          body: { dy: -5 },
          head: { dx: 2, dy: -3 },
          eye: { dx: 2, dy: -3 },
          beak: { dx: 3, dy: -2 },
          wing: { variant: 'flare', dy: -4 },
          tail: { variant: 'up', dy: -7 },
          legFront: { variant: 'tucked', dy: -6 },
          legBack: { variant: 'tucked', dy: -6 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          body: { dy: -5 },
          head: { dx: 1, dy: 5 },
          eye: { dx: 1, dy: 6, variant: 'closed' },
          beak: { dx: 1, dy: 7 },
          wing: { variant: 'flare', dy: -2 },
          tail: { variant: 'up', dy: -9 },
          legFront: { variant: 'splay', dy: -9 },
          legBack: { variant: 'splay', dy: -9 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          body: { dy: -4 },
          head: { dx: -2, dy: -1 },
          eye: { dx: -3, dy: -1, variant: 'closed' },
          beak: { dx: -4, dy: -1 },
          wing: { variant: 'flare', dy: -6 },
          tail: { variant: 'down', dy: -2 },
          legFront: { variant: 'splay', dy: -6 },
          legBack: { variant: 'splay', dy: -6 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 100,
        ease: 'in',
        pose: {
          body: { dy: -1 },
          head: { dy: -1 },
          eye: { dy: -1 },
          beak: { dy: -1 },
          wing: { variant: 'spread', dx: -2, dy: -1 },
          tail: { variant: 'fan' },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
        },
      },
      {
        d: 110,
        ease: 'out',
        pose: {
          body: { dy: 2 },
          head: { dy: 3 },
          eye: { dy: 3 },
          beak: { dy: 3 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      { d: 220, ease: 'hold', pose: {} },
    ],
  },

  /** Backward somersault. Same trick, opposite lean, tail leads it. */
  jumpFlipBack: {
    name: 'jumpFlipBack',
    group: 'locomotion',
    loop: false,
    frames: [
      { d: 100, ease: 'out', pose: {} },
      {
        d: 140,
        ease: 'in',
        pose: {
          body: { dy: 2 },
          head: { dx: -1, dy: 2 },
          eye: { dx: -2, dy: 2 },
          beak: { dx: -2, dy: 2 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'up', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 90,
        ease: 'out',
        pose: {
          body: { dy: -5 },
          head: { dx: -2, dy: -6 },
          eye: { dx: -3, dy: -6 },
          beak: { dx: -3, dy: -6 },
          wing: { variant: 'flare', dy: -5 },
          tail: { variant: 'down', dy: -2 },
          legFront: { variant: 'splay', dy: -3 },
          legBack: { variant: 'splay', dy: -3 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          body: { dy: -5 },
          head: { dx: -1, dy: 5 },
          eye: { dx: -2, dy: 6, variant: 'closed' },
          beak: { dx: -3, dy: 7 },
          wing: { variant: 'flare', dy: -2 },
          tail: { variant: 'up', dy: -9 },
          legFront: { variant: 'splay', dy: -9 },
          legBack: { variant: 'splay', dy: -9 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          body: { dy: -4 },
          head: { dx: 2, dy: -1 },
          eye: { dx: 2, dy: -1, variant: 'closed' },
          beak: { dx: 3, dy: -1 },
          wing: { variant: 'flare', dy: -6 },
          tail: { variant: 'down', dy: -2 },
          legFront: { variant: 'splay', dy: -6 },
          legBack: { variant: 'splay', dy: -6 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 100,
        ease: 'in',
        pose: {
          body: { dy: -1 },
          head: { dy: -1 },
          eye: { dy: -1 },
          beak: { dy: -1 },
          wing: { variant: 'spread', dx: -2, dy: -1 },
          tail: { variant: 'fan' },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
        },
      },
      {
        d: 110,
        ease: 'out',
        pose: {
          body: { dy: 2 },
          head: { dy: 3 },
          eye: { dy: 3 },
          beak: { dy: 3 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      { d: 220, ease: 'hold', pose: {} },
    ],
  },

  /**
   * A full 360 about the vertical axis. Two `flip` toggles — one on the way
   * up, one on the way down — so the net facing change is nil and the physics
   * owner never has to think about it.
   */
  jumpTwist: {
    name: 'jumpTwist',
    group: 'locomotion',
    loop: false,
    frames: [
      { d: 90, ease: 'out', pose: {} },
      {
        d: 120,
        ease: 'in',
        pose: {
          body: { dy: 2 },
          head: { dy: 2 },
          eye: { dy: 2 },
          beak: { dy: 2 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 90,
        ease: 'out',
        pose: {
          body: { dy: -4 },
          head: { dy: -5 },
          eye: { dy: -5 },
          beak: { dy: -5 },
          wing: { variant: 'tucked', dy: -4 },
          tail: { variant: 'streamer', dy: -4 },
          legFront: { variant: 'tucked', dy: -3 },
          legBack: { variant: 'tucked', dy: -3 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 90,
        ease: 'hold',
        flip: true,
        pose: {
          body: { dy: -6 },
          head: { dy: -7 },
          eye: { dy: -7, variant: 'half' },
          beak: { dy: -7 },
          wing: { variant: 'tucked', dy: -6 },
          tail: { variant: 'streamer', dy: -6 },
          legFront: { variant: 'tucked', dy: -5 },
          legBack: { variant: 'tucked', dy: -5 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 90,
        ease: 'hold',
        flip: true,
        pose: {
          body: { dy: -5 },
          head: { dy: -6 },
          eye: { dy: -6, variant: 'half' },
          beak: { dy: -6 },
          wing: { variant: 'tucked', dy: -5 },
          tail: { variant: 'streamer', dy: -5 },
          legFront: { variant: 'tucked', dy: -4 },
          legBack: { variant: 'tucked', dy: -4 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 100,
        ease: 'in',
        pose: {
          body: { dy: -2 },
          head: { dy: -2 },
          eye: { dy: -2 },
          beak: { dy: -2 },
          wing: { variant: 'spread', dx: -2, dy: -1 },
          tail: { variant: 'fan', dy: -1 },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
        },
      },
      {
        d: 110,
        ease: 'out',
        pose: {
          body: { dy: 2 },
          head: { dy: 3 },
          eye: { dy: 3, variant: 'arc' },
          beak: { dy: 3 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      { d: 200, ease: 'hold', pose: {} },
    ],
  },

  /**
   * Deeper load, bigger air, and a genuine hover at the top — two spread-wing
   * beats before gravity is allowed to have him back. The only jump where the
   * shadow goes all the way to `none`.
   */
  jumpHigh: {
    name: 'jumpHigh',
    group: 'locomotion',
    loop: false,
    frames: [
      { d: 110, ease: 'out', pose: {} },
      {
        d: 180,
        ease: 'in',
        pose: {
          body: { dy: 3 },
          head: { dy: 3 },
          eye: { dy: 3 },
          beak: { dy: 3 },
          wing: { variant: 'half', dy: 3 },
          tail: { variant: 'down', dy: 2 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 100,
        ease: 'out',
        pose: {
          body: { dy: -5 },
          head: { dy: -6 },
          eye: { dy: -6 },
          beak: { dy: -6 },
          wing: { variant: 'up', dy: -6 },
          tail: { variant: 'up', dy: -5 },
          legFront: { variant: 'extended', dy: -4 },
          legBack: { variant: 'extended', dy: -4 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 140,
        ease: 'inOut',
        pose: {
          body: { dy: -8 },
          head: { dy: -9 },
          eye: { dy: -9 },
          beak: { dy: -9 },
          wing: { variant: 'spread', dx: -2, dy: -8 },
          tail: { variant: 'fan', dy: -7 },
          legFront: { variant: 'tucked', dy: -6 },
          legBack: { variant: 'tucked', dy: -6 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 140,
        ease: 'inOut',
        pose: {
          body: { dy: -8 },
          head: { dy: -10 },
          eye: { dy: -10, variant: 'arc' },
          beak: { dy: -10 },
          wing: { variant: 'up', dy: -9 },
          tail: { variant: 'fan', dy: -7 },
          legFront: { variant: 'tucked', dy: -6 },
          legBack: { variant: 'tucked', dy: -6 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 120,
        ease: 'in',
        pose: {
          body: { dy: -3 },
          head: { dy: -3 },
          eye: { dy: -3 },
          beak: { dy: -3 },
          wing: { variant: 'spread', dx: -2, dy: -2 },
          tail: { variant: 'fan', dy: -1 },
          legFront: { variant: 'extended', dy: -1 },
          legBack: { variant: 'extended', dy: -1 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 120,
        ease: 'out',
        pose: {
          body: { dy: 3 },
          head: { dy: 4 },
          eye: { dy: 4 },
          beak: { dy: 4 },
          wing: { variant: 'half', dy: 3 },
          tail: { variant: 'down', dy: 2 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 120,
        ease: 'out',
        pose: {
          body: { dy: 1 },
          head: { dy: 1 },
          eye: { dy: 1 },
          beak: { dy: 1 },
          wing: { dy: 1 },
        },
      },
      { d: 220, ease: 'hold', pose: {} },
    ],
  },

  /** Both heels snapped together at the apex, twice, on `hold`. Pure vaudeville. */
  jumpHeelClick: {
    name: 'jumpHeelClick',
    group: 'locomotion',
    loop: false,
    frames: [
      { d: 90, ease: 'out', pose: {} },
      {
        d: 120,
        ease: 'in',
        pose: {
          body: { dy: 2 },
          head: { dy: 2 },
          eye: { dy: 2 },
          beak: { dy: 2 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 100,
        ease: 'out',
        pose: {
          body: { dy: -5 },
          head: { dy: -6 },
          eye: { dy: -6, variant: 'arc' },
          beak: { dy: -6 },
          wing: { variant: 'flare', dy: -5 },
          tail: { variant: 'up', dy: -5 },
          legFront: { variant: 'splay', dy: -3 },
          legBack: { variant: 'splay', dy: -3 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 70,
        ease: 'hold',
        pose: {
          body: { dy: -6 },
          head: { dy: -7 },
          eye: { dy: -7, variant: 'arc' },
          beak: { dy: -7 },
          wing: { variant: 'flare', dy: -6 },
          tail: { variant: 'up', dy: -6 },
          legFront: { variant: 'kick', dx: -1, dy: -4 },
          legBack: { variant: 'kick', dx: 1, dy: -4 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 70,
        ease: 'hold',
        pose: {
          body: { dy: -6 },
          head: { dy: -7 },
          eye: { dy: -7, variant: 'arc' },
          beak: { dy: -7 },
          wing: { variant: 'flare', dy: -6 },
          tail: { variant: 'up', dy: -6 },
          legFront: { variant: 'splay', dy: -4 },
          legBack: { variant: 'splay', dy: -4 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 70,
        ease: 'hold',
        pose: {
          body: { dy: -6 },
          head: { dy: -7 },
          eye: { dy: -7, variant: 'arc' },
          beak: { dy: -7 },
          wing: { variant: 'flare', dy: -6 },
          tail: { variant: 'up', dy: -6 },
          legFront: { variant: 'kick', dx: -1, dy: -4 },
          legBack: { variant: 'kick', dx: 1, dy: -4 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 110,
        ease: 'in',
        pose: {
          body: { dy: -2 },
          head: { dy: -2 },
          eye: { dy: -2 },
          beak: { dy: -2 },
          wing: { variant: 'spread', dx: -2, dy: -1 },
          tail: { variant: 'fan' },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
        },
      },
      {
        d: 110,
        ease: 'out',
        pose: {
          body: { dy: 2 },
          head: { dy: 3 },
          eye: { dy: 3 },
          beak: { dy: 3 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      { d: 200, ease: 'hold', pose: {} },
    ],
  },
};

/* ==========================================================================
   walks

   `walkCycle` above stays exactly as it was. These two are additions.

   Both loop and both are authored in place: the sprite does not translate
   itself, it only does the half of a walk that happens inside the silhouette.
   Move the bird across the page at a rate that matches the stride or the feet
   will skate — roughly one body width (11px of sprite space) per full cycle
   for `walkAlong`, and the same distance BACKWARD for `moonwalk`.
   ========================================================================== */
export const WALK_ANIMATIONS: { readonly [N in WalkName]: Animation } = {
  /**
   * The surface walk: longer in the stride than `walkCycle`, with the body
   * rocking a pixel side to side over the planted foot and the tail swinging
   * against it. The head still thrusts and then holds — that is the part that
   * makes a walking bird a bird — but it holds for two frames here instead of
   * one, which is what turns a trot into a stroll.
   */
  walkAlong: {
    name: 'walkAlong',
    group: 'locomotion',
    loop: true,
    frames: [
      {
        d: 140,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'up', dx: 1 },
          legBack: { dx: -1 },
          head: { dx: 2 },
          eye: { dx: 2 },
          beak: { dx: 2 },
          tail: { dx: -1, dy: 1 },
          body: { dx: 1 },
        },
      },
      {
        d: 130,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'extended', dx: 3 },
          legBack: { dx: -2 },
          head: { dx: 2 },
          eye: { dx: 2 },
          beak: { dx: 2 },
          body: { dx: 1, dy: -1 },
          wing: { dx: 1, dy: -1 },
          tail: { dx: -2 },
        },
      },
      {
        d: 130,
        ease: 'inOut',
        pose: {
          legFront: { dx: 2 },
          legBack: { dx: -2 },
          head: { dx: 1 },
          eye: { dx: 1 },
          beak: { dx: 1 },
          tail: { dx: -1 },
        },
      },
      {
        d: 140,
        ease: 'inOut',
        pose: {
          legFront: { dx: 1 },
          legBack: { variant: 'up', dx: -1 },
          tail: { dx: 1, dy: 1 },
          body: { dx: -1 },
          head: { dx: -1 },
          eye: { dx: -1 },
          beak: { dx: -1 },
        },
      },
      {
        d: 140,
        ease: 'inOut',
        pose: {
          legBack: { variant: 'up', dx: 1 },
          legFront: { dx: -1 },
          head: { dx: 2 },
          eye: { dx: 2 },
          beak: { dx: 2 },
          body: { dx: -1, dy: -1 },
          wing: { dx: -1, dy: -1 },
          tail: { dx: 2 },
        },
      },
      {
        d: 130,
        ease: 'inOut',
        pose: {
          legBack: { variant: 'extended', dx: 3 },
          legFront: { dx: -2 },
          head: { dx: 2 },
          eye: { dx: 2 },
          beak: { dx: 2 },
          body: { dx: -1 },
          tail: { dx: 2 },
        },
      },
      {
        d: 130,
        ease: 'inOut',
        pose: {
          legBack: { dx: 2 },
          legFront: { variant: 'up', dx: -2 },
          head: { dx: 1 },
          eye: { dx: 1 },
          beak: { dx: 1 },
          tail: { dx: 1 },
        },
      },
      {
        d: 140,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'up' },
          legBack: { dx: 1 },
          head: { dx: 1 },
          eye: { dx: 1 },
          beak: { dx: 1 },
          tail: { dx: -1, dy: 1 },
          body: { dx: 1 },
        },
      },
    ],
  },

  /**
   * The moonwalk. The trick is not the feet, it is the disagreement: the near
   * foot is FLAT on the floor and sliding backward (`kick`) while the far foot
   * is up on its toes and going nowhere (`up`), then they swap. The body
   * leans forward the entire time and never gets anywhere, which is the joke,
   * and the head holds dead still in space while the shoulders travel under
   * it. One wing hangs on the downstroke for the silhouette.
   *
   * Travel the sprite BACKWARD across the page while this plays.
   */
  moonwalk: {
    name: 'moonwalk',
    group: 'locomotion',
    loop: true,
    frames: [
      {
        d: 120,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'kick', dx: 2 },
          legBack: { variant: 'up', dx: -1 },
          body: { dx: 1 },
          head: { dx: 2 },
          eye: { dx: 2 },
          beak: { dx: 3 },
          wing: { variant: 'down', dx: 1 },
          tail: { variant: 'up', dx: -1 },
        },
      },
      {
        d: 120,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'kick', dx: 1 },
          legBack: { variant: 'up', dx: -1 },
          body: { dx: 1, dy: -1 },
          head: { dx: 2, dy: -1 },
          eye: { dx: 2, dy: -1 },
          beak: { dx: 3, dy: -1 },
          wing: { variant: 'down', dx: 1, dy: -1 },
          tail: { variant: 'up', dx: -2 },
        },
      },
      {
        d: 120,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'kick', dx: -1 },
          legBack: { variant: 'up' },
          body: { dx: 1 },
          head: { dx: 2 },
          eye: { dx: 2 },
          beak: { dx: 3 },
          wing: { variant: 'half', dx: 1 },
          tail: { variant: 'up', dx: -1 },
        },
      },
      {
        d: 110,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'up', dx: -1 },
          legBack: { variant: 'kick', dx: 1 },
          body: { dx: 1 },
          head: { dx: 2 },
          eye: { dx: 2 },
          beak: { dx: 3 },
          wing: { variant: 'half', dx: 1 },
          tail: { variant: 'up' },
        },
      },
      {
        d: 120,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'up' },
          legBack: { variant: 'kick', dx: 1 },
          body: { dx: 1 },
          head: { dx: 2 },
          eye: { dx: 2 },
          beak: { dx: 3 },
          wing: { variant: 'down', dx: 1 },
          tail: { variant: 'up', dx: 1 },
        },
      },
      {
        d: 120,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'up', dx: 1 },
          legBack: { variant: 'kick' },
          body: { dx: 1, dy: -1 },
          head: { dx: 2, dy: -1 },
          eye: { dx: 2, dy: -1 },
          beak: { dx: 3, dy: -1 },
          wing: { variant: 'down', dx: 1, dy: -1 },
          tail: { variant: 'up', dx: 1 },
        },
      },
      {
        d: 120,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'up', dx: 2 },
          legBack: { variant: 'kick', dx: -1 },
          body: { dx: 1 },
          head: { dx: 2 },
          eye: { dx: 2 },
          beak: { dx: 3 },
          wing: { variant: 'half', dx: 1 },
          tail: { variant: 'up' },
        },
      },
      {
        d: 110,
        ease: 'inOut',
        pose: {
          legFront: { variant: 'kick', dx: 2 },
          legBack: { variant: 'up', dx: -1 },
          body: { dx: 1 },
          head: { dx: 2 },
          eye: { dx: 2 },
          beak: { dx: 3 },
          wing: { variant: 'half', dx: 1 },
          tail: { variant: 'up', dx: -1 },
        },
      },
    ],
  },
};

/* ==========================================================================
   interactions — the reader did something

   Never scheduled by the idle picker; the rig fires these on an event. Every
   one of them ENDS IN REST, whatever pose it started from, so an idle can
   take over on the next frame without a snap.
   ========================================================================== */
export const INTERACTION_ANIMATIONS: { readonly [N in InteractionName]: Animation } = {
  /**
   * The required one: played when the reader hovers a sleeping bird.
   *
   * It opens on the exact terminal pose of `sleep` — fluffed, crouched, head
   * sunk, eye closed — so the cut into it is invisible. Then 60ms of nothing,
   * because the beat of stillness before the reaction is what makes it a
   * startle instead of a twitch. Then everything happens at once: eye to
   * `wide`, head up three pixels, wings out, tail up, feet under him. Then he
   * works out that it was only you, deflates, and goes back to rest.
   */
  startledAwake: {
    name: 'startledAwake',
    group: 'interaction',
    loop: false,
    frames: [
      {
        d: 60,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed' },
          head: { variant: 'fluffed', dx: -1, dy: 2 },
          eye: { dx: -1, dy: 2, variant: 'closed' },
          beak: { dx: -1, dy: 2 },
          wing: { dy: 1 },
          tail: { variant: 'down' },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
        },
      },
      {
        d: 70,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed', dy: -2 },
          head: { variant: 'fluffed', dy: -3 },
          eye: { dy: -3, variant: 'wide' },
          beak: { dy: -3, variant: 'wide' },
          wing: { variant: 'flare', dy: -2 },
          tail: { variant: 'up', dy: -2 },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed', dx: 1, dy: -1 },
          head: { variant: 'fluffed', dx: 1, dy: -2 },
          eye: { dx: 2, dy: -2, variant: 'wide' },
          beak: { dx: 2, dy: -2, variant: 'wide' },
          wing: { variant: 'flare', dx: 1, dy: -1 },
          tail: { variant: 'up', dx: 1, dy: -1 },
          legFront: { variant: 'extended', dx: 1 },
          legBack: { variant: 'extended' },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 110,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed', dx: -1 },
          head: { variant: 'fluffed', dx: -1 },
          eye: { dx: 0, variant: 'wide' },
          beak: { dx: 0 },
          wing: { variant: 'spread', dx: -3 },
          tail: { variant: 'up', dx: -1 },
          shadow: { variant: 'mid' },
        },
      },
      {
        d: 260,
        ease: 'out',
        pose: {
          body: { variant: 'fluffed' },
          head: { variant: 'fluffed' },
          eye: { dx: 1, variant: 'wide' },
          beak: { dx: 1 },
          wing: { variant: 'half' },
          tail: { variant: 'up' },
        },
      },
      {
        d: 220,
        ease: 'out',
        pose: {
          eye: { variant: 'half' },
          wing: { variant: 'half' },
        },
      },
      { d: 300, ease: 'hold', pose: {} },
    ],
  },

  /**
   * Mine. The reader parked the pointer next to him, so he investigates it —
   * two fast jabs with the head fully extended, then a suspicious hold, then
   * he decides it was nothing. Fire this with the bird already facing the
   * cursor; the rig owns the facing, this only owns the jab.
   */
  peckAtCursor: {
    name: 'peckAtCursor',
    group: 'interaction',
    loop: false,
    frames: [
      { d: 120, ease: 'out', pose: {} },
      {
        d: 90,
        ease: 'hold',
        pose: {
          head: { dx: 3, dy: 1 },
          eye: { dx: 3, dy: 1, variant: 'wide' },
          beak: { dx: 5, dy: 1, variant: 'open' },
          body: { dx: 1 },
          tail: { variant: 'up', dx: -1 },
        },
      },
      {
        d: 80,
        ease: 'hold',
        pose: {
          head: { dx: 1 },
          eye: { dx: 1, variant: 'wide' },
          beak: { dx: 1 },
          tail: { variant: 'up' },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          head: { dx: 4, dy: 1 },
          eye: { dx: 4, dy: 1, variant: 'wide' },
          beak: { dx: 6, dy: 1, variant: 'open' },
          body: { dx: 1 },
          tail: { variant: 'up', dx: -1 },
        },
      },
      {
        d: 260,
        ease: 'out',
        pose: {
          head: { dx: 1 },
          eye: { dx: 2, variant: 'wide' },
          beak: { dx: 2 },
          tail: { variant: 'up' },
        },
      },
      { d: 200, ease: 'hold', pose: { eye: { variant: 'half' } } },
      { d: 220, ease: 'hold', pose: {} },
    ],
  },

  /**
   * Mine. A proper little bow: one wing swept across the breast, head and
   * shoulders down, held a beat longer than feels necessary, and back up with
   * the pleased eye. For arrivals, for a thank-you, for the end of a tour.
   */
  greetBow: {
    name: 'greetBow',
    group: 'interaction',
    loop: false,
    frames: [
      { d: 180, ease: 'out', pose: {} },
      {
        d: 200,
        ease: 'out',
        pose: {
          wing: { variant: 'half', dx: 1 },
          head: { dx: 1, dy: -1 },
          eye: { dx: 1, dy: -1 },
          beak: { dx: 1, dy: -1 },
          tail: { variant: 'up' },
        },
      },
      {
        d: 420,
        ease: 'hold',
        pose: {
          wing: { variant: 'spread', dx: -1, dy: 2 },
          head: { dx: 2, dy: 4 },
          eye: { dx: 2, dy: 4, variant: 'closed' },
          beak: { dx: 3, dy: 5 },
          body: { dy: 1 },
          tail: { variant: 'up', dy: -1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 260,
        ease: 'inOut',
        pose: {
          wing: { variant: 'half', dy: 1 },
          head: { dx: 1, dy: 2 },
          eye: { dx: 1, dy: 2, variant: 'closed' },
          beak: { dx: 2, dy: 2 },
          tail: { variant: 'up' },
        },
      },
      {
        d: 240,
        ease: 'out',
        pose: {
          eye: { variant: 'arc' },
          wing: { variant: 'half' },
        },
      },
      { d: 300, ease: 'hold', pose: { eye: { variant: 'arc' } } },
      { d: 200, ease: 'hold', pose: {} },
    ],
  },

  /**
   * Mine. No. Three snaps of the head, decreasing in travel, eyes half shut
   * throughout — a bird refusing something is not agitated, it is bored.
   */
  headShake: {
    name: 'headShake',
    group: 'interaction',
    loop: false,
    frames: [
      { d: 130, ease: 'out', pose: {} },
      {
        d: 90,
        ease: 'hold',
        pose: {
          head: { dx: -2 },
          eye: { dx: -3, variant: 'half' },
          beak: { dx: -3 },
          tail: { dx: 1 },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          head: { dx: 2 },
          eye: { dx: 3, variant: 'half' },
          beak: { dx: 3 },
          tail: { dx: -1 },
        },
      },
      {
        d: 80,
        ease: 'hold',
        pose: {
          head: { dx: -2 },
          eye: { dx: -3, variant: 'half' },
          beak: { dx: -3 },
          tail: { dx: 1 },
        },
      },
      {
        d: 80,
        ease: 'hold',
        pose: {
          head: { dx: 1 },
          eye: { dx: 2, variant: 'half' },
          beak: { dx: 2 },
        },
      },
      {
        d: 70,
        ease: 'hold',
        pose: {
          head: { dx: -1 },
          eye: { dx: -1, variant: 'half' },
          beak: { dx: -1 },
        },
      },
      { d: 240, ease: 'out', pose: { eye: { variant: 'half' } } },
      { d: 220, ease: 'hold', pose: {} },
    ],
  },

  /**
   * Mine. Full peacock: fluffs, throws both wings wide, tail fanned, chest
   * out, sparkle eye, one silent shout. The rig should throw a couple of
   * PROPS.sparkle around him on the held frame.
   */
  showOff: {
    name: 'showOff',
    group: 'interaction',
    loop: false,
    frames: [
      { d: 140, ease: 'out', pose: {} },
      {
        d: 120,
        ease: 'in',
        pose: {
          body: { dy: 2 },
          head: { dy: 2 },
          eye: { dy: 2 },
          beak: { dy: 2 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 160,
        ease: 'out',
        pose: {
          body: { variant: 'fluffed', dy: -2 },
          head: { variant: 'fluffed', dy: -3 },
          eye: { dy: -3, variant: 'sparkle' },
          beak: { dy: -3, variant: 'wide' },
          wing: { variant: 'flare', dy: -2 },
          tail: { variant: 'fan', dy: -2 },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 520,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed', dy: -2 },
          head: { variant: 'fluffed', dy: -3 },
          eye: { dy: -3, variant: 'sparkle' },
          beak: { dy: -3, variant: 'wide' },
          wing: { variant: 'flare', dy: -2 },
          tail: { variant: 'fan', dy: -2 },
          legFront: { variant: 'extended' },
          legBack: { variant: 'extended' },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 260,
        ease: 'inOut',
        pose: {
          body: { variant: 'fluffed' },
          head: { variant: 'fluffed' },
          eye: { dx: 1, variant: 'arc' },
          beak: { dx: 1 },
          wing: { variant: 'spread', dx: -2 },
          tail: { variant: 'fan' },
        },
      },
      { d: 220, ease: 'out', pose: { wing: { variant: 'half' }, eye: { variant: 'arc' } } },
      { d: 260, ease: 'hold', pose: {} },
    ],
  },

  /**
   * Mine. The reader got too close. One hard hop straight backward with the
   * wings thrown up, lands stiff-legged, then decides to be brave about it.
   * Shorter and sharper than `hopBackward`, which is a decision; this is a
   * reflex.
   */
  recoilHop: {
    name: 'recoilHop',
    group: 'interaction',
    loop: false,
    frames: [
      { d: 50, ease: 'hold', pose: {} },
      {
        d: 80,
        ease: 'out',
        pose: {
          body: { dx: -2, dy: -3 },
          head: { dx: -3, dy: -4 },
          eye: { dx: -4, dy: -4, variant: 'wide' },
          beak: { dx: -4, dy: -4, variant: 'wide' },
          wing: { variant: 'up', dy: -4 },
          tail: { variant: 'up', dy: -3 },
          legFront: { variant: 'tucked', dx: -2, dy: -2 },
          legBack: { variant: 'tucked', dy: -2 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 90,
        ease: 'in',
        pose: {
          body: { dx: -2, dy: -1 },
          head: { dx: -3, dy: -1 },
          eye: { dx: -4, dy: -1, variant: 'wide' },
          beak: { dx: -4, dy: -1, variant: 'wide' },
          wing: { variant: 'spread', dx: -4 },
          tail: { variant: 'up' },
          legFront: { variant: 'extended', dx: -2 },
          legBack: { variant: 'extended' },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 90,
        ease: 'out',
        pose: {
          body: { dy: 2 },
          head: { dy: 2 },
          eye: { dy: 2, variant: 'wide' },
          beak: { dy: 2 },
          wing: { variant: 'half', dy: 2 },
          tail: { variant: 'up', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 300,
        ease: 'out',
        pose: {
          eye: { variant: 'wide' },
          wing: { variant: 'half' },
          tail: { variant: 'up' },
        },
      },
      { d: 180, ease: 'hold', pose: { eye: { variant: 'half' } } },
      { d: 240, ease: 'hold', pose: {} },
    ],
  },
};

/* ==========================================================================
   chat perches

   Held for as long as the chat window is open. The rig picks ONE from
   CHAT_PERCHES when the window opens and stays on it — these are characters,
   not gestures, and rotating through them mid-conversation would read as a
   glitch rather than as variety.

   Every one of them loops, and every one of them is authored to sit at the
   TOP EDGE of the chat window: the props each perch needs are listed in
   CHAT_PERCH_PROPS and are drawn by the rig, positioned so the bird's feet
   land on BASELINE_Y as usual.

   While an answer is streaming, swap to `perchResponding` (CHAT_RESPONDING)
   and swap back when it finishes. That one is deliberately busier than any
   perch idle: the whole point is that you can tell at a glance whether he is
   listening or talking.
   ========================================================================== */
export const CHAT_ANIMATIONS: {
  readonly [N in ChatPerchName | ChatRespondingName]: Animation;
} = {
  /**
   * Down in the nest, and staying there.
   *
   * `body.fluffed` and `head.fluffed` were already right, because a bird
   * sitting in a bowl is a rounder shape than one standing on a rail. What was
   * wrong was four frames at 1225ms each, which meant nothing appeared to
   * happen between one blink and the next.
   *
   * Still the slowest of the five perches, deliberately: this is the one where
   * he has decided to stay put. A shuffle down into the bowl, a blink, a look
   * to the side, one fluff of a wing, and back down.
   */
  perchNest: {
    name: 'perchNest',
    group: 'chat',
    loop: true,
    frames: [
      {
        d: 700,
        ease: 'inOut',
        pose: {
          body: { variant: 'fluffed' },
          head: { variant: 'fluffed' },
          eye: { variant: 'half' },
          beak: { variant: 'closed' },
          wing: { variant: 'folded' },
          tail: { variant: 'down' },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 520,
        ease: 'inOut',
        pose: {
          body: { variant: 'fluffed', dy: 1 },
          head: { variant: 'fluffed', dy: 1 },
          eye: { variant: 'half', dy: 1 },
          beak: { variant: 'closed', dy: 1 },
          wing: { variant: 'folded', dy: 1 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 300,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed', dy: 1 },
          head: { variant: 'fluffed', dy: 1 },
          eye: { variant: 'closed', dy: 1 },
          beak: { variant: 'closed', dy: 1 },
          wing: { variant: 'folded', dy: 1 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 560,
        ease: 'inOut',
        pose: {
          body: { variant: 'fluffed', dx: -1 },
          head: { variant: 'fluffed', dx: -1 },
          eye: { variant: 'half', dx: -1 },
          beak: { variant: 'closed', dx: -1 },
          wing: { variant: 'folded', dx: -1 },
          tail: { variant: 'down', dx: -1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 380,
        ease: 'out',
        pose: {
          body: { variant: 'fluffed', dy: -1 },
          head: { variant: 'fluffed', dy: -1 },
          eye: { variant: 'open', dy: -1 },
          beak: { variant: 'closed', dy: -1 },
          wing: { variant: 'half', dy: -1 },
          tail: { variant: 'down', dy: -1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 740,
        ease: 'inOut',
        pose: {
          body: { variant: 'fluffed' },
          head: { variant: 'fluffed' },
          eye: { variant: 'half' },
          beak: { variant: 'closed' },
          wing: { variant: 'folded' },
          tail: { variant: 'down' },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'none' },
        },
      },
    ],
  },

  /**
   * On the branch, awake and looking about.
   *
   * The old version set THREE things across four frames, a shadow, a tail and
   * an eye, at just over a second a frame. Everything else fell through to the
   * rest pose, so it was the idle bird with a slow blink and nothing to watch.
   *
   * A bird on a branch is the most alert he ever is: he checks one way, blinks,
   * checks back, flicks the tail, fluffs once and only then settles. The pacing
   * sits deliberately between the nest, where he has decided to stay, and the
   * typing, where he is busy.
   */
  perchBranch: {
    name: 'perchBranch',
    group: 'chat',
    loop: true,
    frames: [
      {
        d: 520,
        ease: 'inOut',
        pose: {
          body: { variant: 'neutral' },
          head: { variant: 'neutral' },
          eye: { variant: 'half' },
          beak: { variant: 'closed' },
          wing: { variant: 'folded' },
          tail: { variant: 'neutral' },
          legFront: { variant: 'down' },
          legBack: { variant: 'down' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 360,
        ease: 'out',
        pose: {
          body: { variant: 'neutral', dx: 1 },
          head: { variant: 'sleek', dx: 1 },
          eye: { variant: 'open', dx: 1 },
          beak: { variant: 'closed', dx: 1 },
          wing: { variant: 'folded', dx: 1 },
          tail: { variant: 'neutral', dx: 1 },
          legFront: { variant: 'down' },
          legBack: { variant: 'down' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 300,
        ease: 'hold',
        pose: {
          body: { variant: 'neutral', dx: 1 },
          head: { variant: 'sleek', dx: 1 },
          eye: { variant: 'closed', dx: 1 },
          beak: { variant: 'closed', dx: 1 },
          wing: { variant: 'folded', dx: 1 },
          tail: { variant: 'neutral', dx: 1 },
          legFront: { variant: 'down' },
          legBack: { variant: 'down' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 420,
        ease: 'inOut',
        pose: {
          body: { variant: 'neutral', dx: -1 },
          head: { variant: 'neutral', dx: -1 },
          eye: { variant: 'open', dx: -1 },
          beak: { variant: 'closed', dx: -1 },
          wing: { variant: 'folded', dx: -1 },
          tail: { variant: 'neutral', dx: -1 },
          legFront: { variant: 'down' },
          legBack: { variant: 'down' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 260,
        ease: 'out',
        pose: {
          body: { variant: 'neutral', dy: -1 },
          head: { variant: 'neutral', dy: -1 },
          eye: { variant: 'open', dy: -1 },
          beak: { variant: 'closed', dy: -1 },
          wing: { variant: 'half', dy: -1 },
          tail: { variant: 'up', dy: -1 },
          legFront: { variant: 'down' },
          legBack: { variant: 'down' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 340,
        ease: 'inOut',
        pose: {
          body: { variant: 'fluffed' },
          head: { variant: 'fluffed' },
          eye: { variant: 'half' },
          beak: { variant: 'closed' },
          wing: { variant: 'folded' },
          tail: { variant: 'down' },
          legFront: { variant: 'down' },
          legBack: { variant: 'down' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 600,
        ease: 'inOut',
        pose: {
          body: { variant: 'neutral' },
          head: { variant: 'neutral' },
          eye: { variant: 'half' },
          beak: { variant: 'closed' },
          wing: { variant: 'folded' },
          tail: { variant: 'neutral' },
          legFront: { variant: 'down' },
          legBack: { variant: 'down' },
          shadow: { variant: 'none' },
        },
      },
    ],
  },

  /**
   * Sitting head-on, wings out either side, eyes shut. Jack's brief: "the bird
   * facing us with wings spread out either side and one orb either side."
   *
   * THIS IS THE THIRD TIME AUTHORED ART WAS NEVER WORN. There is a complete
   * head-on vocabulary in this file — `body.front`, `head.front`, `beak.front`,
   * `eye.frontOpen`, `eye.frontClosed`, `wing.spreadBoth`, `legFront.crossed`
   * (which draws BOTH feet, symmetric about the centre line, so `legBack` goes
   * hidden) — and this animation used none of it. It was a side-view bird with
   * one wing out, holding two frames over three and a half seconds. If you are
   * adding a pose here, check the variant lists before drawing anything new.
   *
   * `tail.hidden` because a neutral tail sticking out from behind a head-on
   * body reads as a mistake; the variant exists for exactly this.
   *
   * The breath is slow on purpose, and the fifth frame is the joke: he opens
   * one eye to check whether you are still there, then shuts it again. It is
   * 380ms against roughly five seconds, so it reads as a glance rather than as
   * part of the cycle.
   */
  perchMeditate: {
    name: 'perchMeditate',
    group: 'chat',
    loop: true,
    frames: [
      {
        d: 1000,
        ease: 'inOut',
        pose: {
          body: { variant: 'front' },
          head: { variant: 'front' },
          eye: { variant: 'frontClosed' },
          beak: { variant: 'front' },
          wing: { variant: 'spreadBoth', dy: -1 },
          tail: { variant: 'hidden' },
          legFront: { variant: 'crossed' },
          legBack: { variant: 'hidden' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 1100,
        ease: 'inOut',
        pose: {
          body: { variant: 'front', dy: -2 },
          head: { variant: 'front', dy: -2 },
          eye: { variant: 'frontClosed', dy: -2 },
          beak: { variant: 'front', dy: -2 },
          wing: { variant: 'spreadBoth', dy: -3 },
          tail: { variant: 'hidden' },
          legFront: { variant: 'crossed' },
          legBack: { variant: 'hidden' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 1000,
        ease: 'inOut',
        pose: {
          body: { variant: 'front', dy: -2 },
          head: { variant: 'front', dy: -2 },
          eye: { variant: 'frontClosed', dy: -2 },
          beak: { variant: 'front', dy: -2 },
          wing: { variant: 'spreadBoth', dy: -3 },
          tail: { variant: 'hidden' },
          legFront: { variant: 'crossed' },
          legBack: { variant: 'hidden' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 900,
        ease: 'inOut',
        pose: {
          body: { variant: 'front' },
          head: { variant: 'front' },
          eye: { variant: 'frontClosed' },
          beak: { variant: 'front' },
          wing: { variant: 'spreadBoth', dy: -1 },
          tail: { variant: 'hidden' },
          legFront: { variant: 'crossed' },
          legBack: { variant: 'hidden' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 380,
        ease: 'out',
        pose: {
          body: { variant: 'front' },
          head: { variant: 'front' },
          eye: { variant: 'frontOpen' },
          beak: { variant: 'front' },
          wing: { variant: 'spreadBoth', dy: -1 },
          tail: { variant: 'hidden' },
          legFront: { variant: 'crossed' },
          legBack: { variant: 'hidden' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 820,
        ease: 'inOut',
        pose: {
          body: { variant: 'front', dy: -1 },
          head: { variant: 'front', dy: -1 },
          eye: { variant: 'frontClosed', dy: -1 },
          beak: { variant: 'front', dy: -1 },
          wing: { variant: 'spreadBoth', dy: -2 },
          tail: { variant: 'hidden' },
          legFront: { variant: 'crossed' },
          legBack: { variant: 'hidden' },
          shadow: { variant: 'none' },
        },
      },
    ],
  },

  /**
   * Reading aloud from a book that is holding itself up. His head tracks down
   * the page in three steps and snaps back to the top, the beak opens on the
   * stressed word, and one wing gestures the way people's hands do when they
   * are reciting something they only half remember.
   *
   * HE IS DRESSED FOR IT. `body.robe` and `hat.hood` were authored for this
   * animation and for nothing else, so this is the only place they are worn.
   * That brings three consequences with it, and all three are load-bearing:
   *
   *   - both legs go `hidden`. The robe's hem lands ON BASELINE_Y and is the
   *     silhouette from the collar down; a vermilion foot poking through it
   *     reads as a tear in the cloth.
   *   - the tail goes `hidden`. It is buried under the same hem.
   *   - the eye sits at dx +2, not +1. The hood's front rim is cut back to
   *     leave an opening exactly there — see the sprite note on `hat.hood`.
   *     Move the eye back to +1 and it lands on wool.
   *
   * The hood carries the head's own dx/dy on every frame. It is a separate
   * slot in DRAW_ORDER, so it does not follow the head by itself, and a hood
   * that stays put while the skull under it dips is the one thing here that
   * looks broken immediately.
   *
   * The body does NOT move. The head bows through the robe's collar rather
   * than the whole figure bobbing, because a hem that lifts off the floor
   * stops being a hem.
   *
   * Rig draws PROPS.book floating in front of him, plus the flame and wisp
   * cycles and the page turn — see CHAT_PERCH_CYCLES.
   */
  perchIncantation: {
    name: 'perchIncantation',
    group: 'chat',
    loop: true,
    frames: [
      {
        d: 380,
        ease: 'inOut',
        pose: {
          body: { variant: 'robe' },
          head: { dx: 1, dy: 1 },
          hat: { variant: 'hood', dx: 1, dy: 1 },
          eye: { dx: 2, dy: 1 },
          beak: { dx: 2, dy: 1, variant: 'open' },
          wing: { variant: 'half', dx: 1 },
          tail: { variant: 'hidden' },
          legFront: { variant: 'hidden' },
          legBack: { variant: 'hidden' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 340,
        ease: 'inOut',
        pose: {
          body: { variant: 'robe' },
          head: { dx: 1, dy: 2 },
          hat: { variant: 'hood', dx: 1, dy: 2 },
          eye: { dx: 2, dy: 2 },
          beak: { dx: 2, dy: 3 },
          wing: { variant: 'half', dx: 1, dy: -1 },
          tail: { variant: 'hidden' },
          legFront: { variant: 'hidden' },
          legBack: { variant: 'hidden' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 380,
        ease: 'inOut',
        pose: {
          body: { variant: 'robe' },
          head: { dx: 1, dy: 3 },
          hat: { variant: 'hood', dx: 1, dy: 3 },
          eye: { dx: 2, dy: 3 },
          beak: { dx: 2, dy: 4, variant: 'open' },
          wing: { variant: 'spread', dx: -1 },
          tail: { variant: 'hidden' },
          legFront: { variant: 'hidden' },
          legBack: { variant: 'hidden' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 300,
        ease: 'inOut',
        pose: {
          body: { variant: 'robe' },
          head: { dx: 1, dy: 4 },
          hat: { variant: 'hood', dx: 1, dy: 4 },
          eye: { dx: 2, dy: 4 },
          beak: { dx: 2, dy: 5 },
          wing: { variant: 'half', dx: 1 },
          tail: { variant: 'hidden' },
          legFront: { variant: 'hidden' },
          legBack: { variant: 'hidden' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 260,
        ease: 'out',
        pose: {
          body: { variant: 'robe' },
          head: { dx: 1, dy: -1 },
          hat: { variant: 'hood', dx: 1, dy: -1 },
          eye: { dx: 2, dy: -1 },
          beak: { dx: 2, dy: -1, variant: 'open' },
          wing: { variant: 'half', dx: 1, dy: -1 },
          tail: { variant: 'hidden' },
          legFront: { variant: 'hidden' },
          legBack: { variant: 'hidden' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 340,
        ease: 'inOut',
        pose: {
          body: { variant: 'robe' },
          head: { dx: 1 },
          hat: { variant: 'hood', dx: 1 },
          eye: { dx: 2 },
          beak: { dx: 2 },
          wing: { variant: 'half', dx: 1 },
          tail: { variant: 'hidden' },
          legFront: { variant: 'hidden' },
          legBack: { variant: 'hidden' },
          shadow: { variant: 'none' },
        },
      },
    ],
  },

  /**
   * Hunched over a very small computer. The typing is both wings alternating
   * on `hold` at 110ms with a one-pixel travel — any smoother and it looks
   * like he is swimming — plus a head dip on every other stroke and one pause
   * where he reads back what he wrote and is not sure about it.
   *
   * Rig draws PROPS.computer in front of him. PROPS.keyboard is the alternate
   * for a perch narrow enough that the screen would overhang.
   */
  perchTyping: {
    name: 'perchTyping',
    group: 'chat',
    loop: true,
    frames: [
      {
        d: 110,
        ease: 'hold',
        pose: {
          body: { dx: 1, dy: 1 },
          head: { dx: 2, dy: 2 },
          eye: { dx: 2, dy: 2 },
          beak: { dx: 3, dy: 2 },
          wing: { variant: 'half', dx: 2, dy: 1 },
          tail: { variant: 'up', dx: -1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 110,
        ease: 'hold',
        pose: {
          body: { dx: 1, dy: 1 },
          head: { dx: 2, dy: 3 },
          eye: { dx: 2, dy: 3 },
          beak: { dx: 3, dy: 3 },
          wing: { variant: 'down', dx: 2, dy: 1 },
          tail: { variant: 'up', dx: -1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 110,
        ease: 'hold',
        pose: {
          body: { dx: 1, dy: 1 },
          head: { dx: 2, dy: 2 },
          eye: { dx: 2, dy: 2 },
          beak: { dx: 3, dy: 2 },
          wing: { variant: 'half', dx: 3, dy: 2 },
          tail: { variant: 'up', dx: -1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 110,
        ease: 'hold',
        pose: {
          body: { dx: 1, dy: 1 },
          head: { dx: 2, dy: 3 },
          eye: { dx: 2, dy: 3 },
          beak: { dx: 3, dy: 3 },
          wing: { variant: 'down', dx: 3, dy: 2 },
          tail: { variant: 'up', dx: -1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 640,
        ease: 'hold',
        pose: {
          body: { dx: 1, dy: 1 },
          head: { dx: 2, dy: 1 },
          eye: { dx: 2, dy: 1, variant: 'half' },
          beak: { dx: 3, dy: 1 },
          wing: { variant: 'folded', dx: 2, dy: 1 },
          tail: { variant: 'up', dx: -1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 260,
        ease: 'inOut',
        pose: {
          body: { dx: 1, dy: 1 },
          head: { dx: 1 },
          eye: { dx: 1, variant: 'half' },
          beak: { dx: 1 },
          wing: { variant: 'folded', dx: 1, dy: 1 },
          tail: { variant: 'up' },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'none' },
        },
      },
    ],
  },

  /**
   * Played INSTEAD of the perch idle while an answer is streaming, whichever
   * perch he happens to be on.
   *
   * Busier than anything else in the chat family on purpose: head up rather
   * than down, beak working on a fast irregular rhythm (240/180/300/160 — an
   * even one sounds like a machine), the body bobbing on the stressed beats,
   * one wing gesturing, and the tail flicking on the punctuation. Reads
   * clearly as TALKING from across the page, which is the whole job.
   */
  perchResponding: {
    name: 'perchResponding',
    group: 'chat',
    loop: true,
    frames: [
      {
        d: 240,
        ease: 'inOut',
        pose: {
          head: { dx: 1, dy: -1 },
          eye: { dx: 1, dy: -1, variant: 'arc' },
          beak: { dx: 2, dy: -1, variant: 'open' },
          body: { dy: -1 },
          wing: { variant: 'half', dx: 1, dy: -1 },
          tail: { variant: 'up' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 180,
        ease: 'inOut',
        pose: {
          head: { dx: 1 },
          eye: { dx: 1 },
          beak: { dx: 2 },
          wing: { variant: 'half', dx: 1 },
          tail: { variant: 'neutral' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 300,
        ease: 'inOut',
        pose: {
          head: { dx: 2, dy: -2 },
          eye: { dx: 2, dy: -2, variant: 'arc' },
          beak: { dx: 3, dy: -2, variant: 'open' },
          body: { dy: -1 },
          wing: { variant: 'spread', dx: -1, dy: -1 },
          tail: { variant: 'up', dy: -1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 160,
        ease: 'inOut',
        pose: {
          head: { dx: 1 },
          eye: { dx: 1 },
          beak: { dx: 2 },
          wing: { variant: 'half', dx: 1 },
          tail: { variant: 'up' },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 220,
        ease: 'inOut',
        pose: {
          head: { dx: 1, dy: -1 },
          eye: { dx: 1, dy: -1 },
          beak: { dx: 2, dy: -1, variant: 'open' },
          body: { dy: -1 },
          wing: { variant: 'half', dx: 2 },
          tail: { variant: 'neutral', dx: -1 },
          shadow: { variant: 'none' },
        },
      },
      {
        d: 320,
        ease: 'inOut',
        pose: {
          head: { dx: 1 },
          eye: { dx: 1, variant: 'half' },
          beak: { dx: 1 },
          wing: { variant: 'half' },
          tail: { variant: 'up', dy: -1 },
          shadow: { variant: 'none' },
        },
      },
    ],
  },
};

/* ==========================================================================
   the Plants vs Zombies bit

   Six pieces, meant to be stitched in this order (and PVZ_SEQUENCE below says
   so in data):

     pvzHatOn -> pvzBurrow -> pvzPopUp -> [ pvzShoot -> pvzReload ] xN -> pvzHatOff

   The bird's side only. The lawn, the zombies and the peas belong to the rig:
   it walks PROPS.zombieWalkA / zombieWalkB in from the leading edge, spawns a
   PROPS.pea at PVZ_MUZZLE on the recoil frame of `pvzShoot`, and swaps in
   PROPS.peaSplat when one connects.

   ONE THING THE RIG MUST DO: `pvzBurrow` drives every part twelve pixels below
   the baseline and `pvzPopUp` brings them back. The compositor does not clip
   to the sprite box, so without a scissor rect at the ground line you will see
   a sparrow calmly standing in mid-air below the floor rather than a sparrow
   underneath it. Clip to BASELINE_Y + 1 for the whole of both animations.
   ========================================================================== */
export const EASTER_EGG_ANIMATIONS: { readonly [N in EasterEggName]: Animation } = {
  /** Reaches up, and there is a pea shooter on his head. No explanation given. */
  pvzHatOn: {
    name: 'pvzHatOn',
    group: 'easterEgg',
    loop: false,
    frames: [
      { d: 160, ease: 'out', pose: {} },
      {
        d: 180,
        ease: 'out',
        pose: {
          wing: { variant: 'reach' },
          head: { dy: 1 },
          eye: { dy: 1, variant: 'half' },
          beak: { dy: 1 },
          body: { dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          hat: { variant: 'peashooter', dy: -2 },
          wing: { variant: 'reach', dy: 1 },
          head: { dy: 1 },
          eye: { dy: 1, variant: 'half' },
          beak: { dy: 1 },
          body: { dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 120,
        ease: 'out',
        pose: {
          hat: { variant: 'peashooter' },
          wing: { variant: 'half' },
          eye: { variant: 'wide' },
          tail: { variant: 'up' },
        },
      },
      {
        d: 80,
        ease: 'hold',
        pose: {
          hat: { variant: 'peashooter', dx: 1 },
          head: { dx: 1 },
          eye: { dx: 2, variant: 'wide' },
          beak: { dx: 2 },
          tail: { variant: 'up' },
        },
      },
      {
        d: 80,
        ease: 'hold',
        pose: {
          hat: { variant: 'peashooter', dx: -1 },
          head: { dx: -1 },
          eye: { dx: 0, variant: 'wide' },
          beak: { dx: 0 },
          tail: { variant: 'up' },
        },
      },
      {
        d: 260,
        ease: 'out',
        pose: {
          hat: { variant: 'peashooter' },
          eye: { variant: 'arc' },
          tail: { variant: 'up' },
        },
      },
      { d: 200, ease: 'hold', pose: { hat: { variant: 'peashooter' } } },
    ],
  },

  /**
   * Down he goes. Crouch, then everything descends together over 320ms with
   * the shadow widening to `wide` and staying there — the shadow is the only
   * thing left on the surface, and it is what tells you he is still down
   * there. Ends HELD underground: sit on the last frame as long as you like.
   */
  pvzBurrow: {
    name: 'pvzBurrow',
    group: 'easterEgg',
    loop: false,
    frames: [
      {
        d: 140,
        ease: 'in',
        pose: {
          hat: { variant: 'peashooter' },
          tail: { variant: 'up' },
        },
      },
      {
        d: 160,
        ease: 'in',
        pose: {
          hat: { variant: 'peashooter', dy: 2 },
          body: { dy: 2 },
          head: { dy: 2 },
          eye: { dy: 2, variant: 'half' },
          beak: { dy: 2 },
          wing: { variant: 'tucked', dy: 2 },
          tail: { variant: 'down', dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 320,
        ease: 'in',
        pose: {
          hat: { variant: 'peashooter', dy: 12 },
          body: { dy: 12 },
          head: { dy: 12 },
          eye: { dy: 12, variant: 'closed' },
          beak: { dy: 12 },
          wing: { variant: 'tucked', dy: 12 },
          tail: { variant: 'down', dy: 12 },
          legFront: { variant: 'tucked', dy: 12 },
          legBack: { variant: 'tucked', dy: 12 },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 300,
        ease: 'hold',
        pose: {
          hat: { variant: 'peashooter', dy: 14 },
          body: { dy: 14 },
          head: { dy: 14 },
          eye: { dy: 14, variant: 'closed' },
          beak: { dy: 14 },
          wing: { variant: 'tucked', dy: 14 },
          tail: { variant: 'down', dy: 14 },
          legFront: { variant: 'tucked', dy: 14 },
          legBack: { variant: 'tucked', dy: 14 },
          shadow: { variant: 'wide' },
        },
      },
    ],
  },

  /** Straight up out of the ground, hat first, overshoots two pixels, settles. */
  pvzPopUp: {
    name: 'pvzPopUp',
    group: 'easterEgg',
    loop: false,
    frames: [
      {
        d: 90,
        ease: 'out',
        pose: {
          hat: { variant: 'peashooter', dy: 14 },
          body: { dy: 14 },
          head: { dy: 14 },
          eye: { dy: 14, variant: 'closed' },
          beak: { dy: 14 },
          wing: { variant: 'tucked', dy: 14 },
          tail: { variant: 'down', dy: 14 },
          legFront: { variant: 'tucked', dy: 14 },
          legBack: { variant: 'tucked', dy: 14 },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 130,
        ease: 'out',
        pose: {
          hat: { variant: 'peashooter', dy: -3 },
          body: { dy: -3 },
          head: { dy: -3 },
          eye: { dy: -3, variant: 'wide' },
          beak: { dy: -3 },
          wing: { variant: 'flare', dy: -3 },
          tail: { variant: 'fan', dy: -3 },
          legFront: { variant: 'tucked', dy: -2 },
          legBack: { variant: 'tucked', dy: -2 },
          shadow: { variant: 'narrow' },
        },
      },
      {
        d: 110,
        ease: 'in',
        pose: {
          hat: { variant: 'peashooter', dy: 1 },
          body: { dy: 1 },
          head: { dy: 1 },
          eye: { dy: 1, variant: 'wide' },
          beak: { dy: 1 },
          wing: { variant: 'half', dy: 1 },
          tail: { variant: 'fan' },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 160,
        ease: 'out',
        pose: {
          hat: { variant: 'peashooter' },
          eye: { variant: 'wide' },
          tail: { variant: 'up' },
          wing: { variant: 'half' },
        },
      },
      { d: 200, ease: 'hold', pose: { hat: { variant: 'peashooter' }, tail: { variant: 'up' } } },
    ],
  },

  /**
   * One shot. Head rears back 70ms, the hat swaps to `peashooterFire`, and the
   * whole bird recoils a pixel backward on `hold`. The pea leaves on the FIRST
   * fire frame, not the second: spawn it at PVZ_MUZZLE the instant that frame
   * is entered, or the pea appears to be pushed rather than fired.
   */
  pvzShoot: {
    name: 'pvzShoot',
    group: 'easterEgg',
    loop: false,
    frames: [
      {
        d: 90,
        ease: 'out',
        pose: {
          hat: { variant: 'peashooter', dx: -2 },
          head: { dx: -2 },
          eye: { dx: -2, variant: 'wide' },
          beak: { dx: -2 },
          body: { dx: -1 },
          tail: { variant: 'up', dx: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 70,
        ease: 'hold',
        pose: {
          hat: { variant: 'peashooterFire', dx: 1 },
          head: { dx: 1 },
          eye: { dx: 1, variant: 'wide' },
          beak: { dx: 1 },
          body: { dx: -1 },
          wing: { variant: 'half', dx: -1 },
          tail: { variant: 'fan', dx: -1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 80,
        ease: 'hold',
        pose: {
          hat: { variant: 'peashooterFire', dx: -1 },
          head: { dx: -1 },
          eye: { dx: -1, variant: 'wide' },
          beak: { dx: -1 },
          body: { dx: -2 },
          wing: { variant: 'half', dx: -2 },
          tail: { variant: 'fan', dx: -2 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 140,
        ease: 'out',
        pose: {
          hat: { variant: 'peashooter' },
          eye: { variant: 'wide' },
          tail: { variant: 'up' },
          wing: { variant: 'half' },
        },
      },
      { d: 120, ease: 'hold', pose: { hat: { variant: 'peashooter' }, tail: { variant: 'up' } } },
    ],
  },

  /**
   * The beat between shots. Loops, so the rig can hold it for exactly as long
   * as the next zombie takes to shamble into range. He scans: head one way,
   * head the other, and a small ready-bob under the hat.
   */
  pvzReload: {
    name: 'pvzReload',
    group: 'easterEgg',
    loop: true,
    frames: [
      {
        d: 320,
        ease: 'inOut',
        pose: {
          hat: { variant: 'peashooter' },
          eye: { variant: 'wide' },
          tail: { variant: 'up' },
        },
      },
      {
        d: 280,
        ease: 'inOut',
        pose: {
          hat: { variant: 'peashooter', dx: 1, dy: -1 },
          head: { dx: 1, dy: -1 },
          eye: { dx: 2, dy: -1, variant: 'wide' },
          beak: { dx: 2, dy: -1 },
          body: { dy: -1 },
          tail: { variant: 'up', dy: -1 },
        },
      },
      {
        d: 320,
        ease: 'inOut',
        pose: {
          hat: { variant: 'peashooter' },
          eye: { variant: 'wide' },
          tail: { variant: 'up' },
        },
      },
      {
        d: 280,
        ease: 'inOut',
        pose: {
          hat: { variant: 'peashooter', dx: -1 },
          head: { dx: -1 },
          eye: { dx: -1, variant: 'wide' },
          beak: { dx: -1 },
          tail: { variant: 'up', dx: 1 },
        },
      },
    ],
  },

  /** Hat comes off, one shake to settle the feathers, back to being a bird. */
  pvzHatOff: {
    name: 'pvzHatOff',
    group: 'easterEgg',
    loop: false,
    frames: [
      {
        d: 160,
        ease: 'out',
        pose: {
          hat: { variant: 'peashooter' },
          eye: { variant: 'arc' },
          tail: { variant: 'up' },
        },
      },
      {
        d: 140,
        ease: 'out',
        pose: {
          hat: { variant: 'peashooter', dy: -1 },
          wing: { variant: 'reach' },
          head: { dy: 1 },
          eye: { dy: 1, variant: 'arc' },
          beak: { dy: 1 },
          body: { dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 120,
        ease: 'hold',
        pose: {
          wing: { variant: 'reach', dy: -1 },
          head: { dy: 1 },
          eye: { dy: 1, variant: 'half' },
          beak: { dy: 1 },
          body: { dy: 1 },
          legFront: { variant: 'crouch' },
          legBack: { variant: 'crouch' },
          shadow: { variant: 'wide' },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed', dx: 1 },
          head: { variant: 'fluffed', dx: 1 },
          eye: { dx: 2, variant: 'half' },
          beak: { dx: 2 },
          wing: { variant: 'half', dx: 1 },
          tail: { dx: 1 },
        },
      },
      {
        d: 90,
        ease: 'hold',
        pose: {
          body: { variant: 'fluffed', dx: -1 },
          head: { variant: 'fluffed', dx: -1 },
          eye: { dx: 0, variant: 'half' },
          beak: { dx: 0 },
          wing: { variant: 'half', dx: -1 },
          tail: { dx: -1 },
        },
      },
      {
        d: 220,
        ease: 'out',
        pose: {
          body: { variant: 'fluffed' },
          head: { variant: 'fluffed' },
          eye: { dx: 1 },
          beak: { dx: 1 },
        },
      },
      { d: 260, ease: 'hold', pose: {} },
    ],
  },
};

/* ==========================================================================
   the whole library

   Eleven records now, not three. The three that were here before are spread
   first and unchanged, so every name that resolved to a timeline yesterday
   resolves to the same timeline today.
   ========================================================================== */
export const ANIMATIONS: { readonly [N in AnimationName]: Animation } = {
  ...STATIONARY_ANIMATIONS,
  ...LOCOMOTION_ANIMATIONS,
  ...TRANSIT_ANIMATIONS,
  ...TRANSIT_UP_ANIMATIONS,
  ...TRANSIT_DOWN_ANIMATIONS,
  ...JUMP_ANIMATIONS,
  ...WALK_ANIMATIONS,
  ...INTERACTION_ANIMATIONS,
  ...CHAT_ANIMATIONS,
  ...EASTER_EGG_ANIMATIONS,
};

/* ==========================================================================
   props

   Everything the bird interacts with but is not made of.

   The line between a PART and a PROP is drawn on one question: does it have to
   respect the puppet's draw order? A pea shooter hat has to sit on the skull
   and under the eye, so it is a part. A hot air balloon is four times the size
   of the bird and only ever appears above it, so it is a prop. Parts get
   variants and keyframes; props get a matrix, an offset and a layer, and the
   rig animates them itself.

   HOW TO DRAW ONE
     const p = PROPS.nest;
     blit p.matrix at (spriteOriginX + p.ox, spriteOriginY + p.oy)
   ...before DRAW_ORDER if p.layer is 'behind', after it if 'front'.

   ox/oy are in SPRITE SPACE, relative to the same (0,0) the parts use, and
   several of them are NEGATIVE or run past SPRITE_WIDTH / SPRITE_HEIGHT. That
   is deliberate and it is not a bug: a parachute canopy is three times taller
   than the bird's canvas and belongs above it. The compositor already draws
   without clipping to the sprite box, so this works as-is — just do not size
   an offscreen buffer to SPRITE_WIDTH x SPRITE_HEIGHT and expect a balloon to
   fit inside it.

   The props whose position the rig genuinely owns — zombies, peas, drifting
   feathers, sparkles — carry ox/oy as a sensible STARTING point only. Move
   them wherever the set piece needs them.

   FACING: the bird is authored facing right. The zombies are authored facing
   LEFT, because they walk toward him. If the rig has mirrored the bird to face
   left, mirror the zombies too.
   ========================================================================== */

export type PropLayer = 'behind' | 'front';

export type PropName =
  /* chat perches */
  | 'nest'
  | 'nestRim'
  | 'branch'
  | 'branchLeaf'
  | 'book'
  | 'orb'
  | 'orbRight'
  | 'orbSmall'
  | 'computer'
  | 'keyboard'
  | 'desk'
  /* the incantation's moving parts — see CHAT_PERCH_CYCLES */
  | 'flameA'
  | 'flameB'
  | 'flameC'
  | 'wispA'
  | 'wispB'
  | 'wispC'
  | 'wispD'
  | 'bookPageA'
  | 'bookPageB'
  | 'bookPageC'
  /* dreams */
  | 'dreamBubble'
  | 'dreamPuffSmall'
  | 'dreamPuffTiny'
  | 'dreamWorm'
  | 'dreamSeed'
  | 'dreamBerry'
  | 'dreamFeather'
  /* the lawn */
  | 'zombieWalkA'
  | 'zombieWalkB'
  | 'pea'
  | 'peaSplat'
  /* transit */
  | 'balloon'
  | 'balloonRope'
  | 'ufo'
  | 'ufoBeam'
  | 'parachute'
  | 'rope'
  | 'umbrella'
  | 'paperPlane'
  /* debris */
  | 'featherPlume'
  | 'featherSingle'
  | 'sparkle'
  /* set pieces — see the block at the bottom of PROPS */
  | 'creeper'
  | 'creeperLit'
  | 'blastA'
  | 'blastB'
  | 'blastC'
  | 'totem'
  | 'delorean'
  | 'deloreanFly'
  | 'deloreanDoorA'
  | 'deloreanDoorB'
  | 'deloreanDoorC'
  | 'deloreanFire'
  | 'martyStand'
  | 'martyPlay'
  | 'martyKnee'
  | 'musicNote'
  | 'bolt'
  | 'pumpkin'
  | 'ghost'
  | 'present'
  | 'snowflake'
  | 'egg'
  | 'eggCracked'
  | 'chick';

export interface PropSprite {
  readonly matrix: PixelMatrix;
  /** Sprite-space offset from the puppet's own origin. May be negative. */
  readonly ox: number;
  readonly oy: number;
  /** 'behind' draws before DRAW_ORDER, 'front' draws after it. */
  readonly layer: PropLayer;
}

export const PROPS: { readonly [P in PropName]: PropSprite } = {
  /* --- chat perches ------------------------------------------------------- */

  /** The bowl. Drawn behind him, so he sits down INTO it. */
  nest: {
    ox: 2,
    oy: 20,
    layer: 'behind',
    matrix: [
      '..MbMbMbMbMbM...',
      '.MbMbMbMbMbMbM..',
      'MbMbMbMbMbMbMbM.',
      'bMbMbMbMbMbMbMbM',
      '.MbMbMbMbMbMbMb.',
      '..MbMbMbMbMbM...',
      '...KKKKKKKKK....',
    ],
  },

  /** The front lip, drawn over the top of him. This is what hides his feet. */
  nestRim: {
    ox: 2,
    oy: 23,
    layer: 'front',
    matrix: [
      '.bMbMbMbMbMbMb..',
      'MbMbMbMbMbMbMbM.',
      '.KKKKKKKKKKKKK..',
    ],
  },

  /** Runs the full width of the sprite. Feet land on its top row. */
  branch: {
    ox: 0,
    oy: 25,
    layer: 'behind',
    matrix: [
      '..MMMMMMMMMMMMMM....',
      '.MBBbbBBbbBBbbBBM...',
      'MBBbbBBbbBBbbBBBBM..',
      '.MMBBBBBBBBBBBBMM...',
      '..KKKKKKKKKKKKKK....',
    ],
  },

  /** A sprig off the far end, so the branch has somewhere to have come from. */
  branchLeaf: {
    ox: 14,
    oy: 22,
    layer: 'behind',
    matrix: [
      '..gGg.',
      '.gGGGg',
      'gGGGg.',
      '.MM...',
    ],
  },

  /**
   * The caster's book, seen from BEHIND.
   *
   * It used to be drawn as two page rectangles facing the reader, which meant
   * the bird was reciting from a book held out to the audience with its pages
   * turned away from him. Jack, 2026-08-25: "the book needs a brown and golden
   * spine and needs to face him."
   *
   * So it is turned. He stands to the left and faces right, so the page
   * surface faces LEFT toward him and we see the binding: a leather spine on
   * the near edge with two bands of gold tooling, and the page foreshortened
   * away from us. He can read it; we can see it is a book.
   *
   * The gold is the palette's one and only Y. See the note on PALETTE.
   *
   * MOVING THIS MOVES FOUR OTHER PROPS. The flame, the wisps and the three
   * page-turn frames are all positioned against the page surface, which now
   * runs x 18-23 with its top edge at y 13 and the spine at x 25-27.
   */
  book: {
    ox: 17,
    oy: 12,
    layer: 'front',
    matrix: [
      '.......KKK..',
      '..KKKKKKBBBK',
      '.KWWWWWKBYBK',
      'KWWWWWWKBBBK',
      'KWWWWWWKBBBK',
      'KWWWWWWKBBBK',
      '.KWWWWWKBYBK',
      '..KKKKKKBBBK',
      '.......KKK..',
    ],
  },

  /**
   * Left wingtip during `perchMeditate`. Props draw at a FIXED ox/oy, so
   * listing `orb` twice put two identical orbs on the same five pixels and the
   * bird meditated with one. `orbRight` is the mirror. Jack asked for "one orb
   * either side" and now there is.
   */
  orb: {
    ox: 0,
    oy: 14,
    layer: 'front',
    matrix: [
      '.nnn.',
      'nWWnn',
      'nWnnn',
      'nnnnn',
      '.nnn.',
    ],
  },

  /** Mirror of `orb`, at the other wingtip. */
  orbRight: {
    ox: 15,
    oy: 14,
    layer: 'front',
    matrix: [
      '.nnn.',
      'nnWn.',
      'nnnWn',
      'nnnnn',
      '.nnn.',
    ],
  },

  /**
   * A third, smaller mote, held above the head rather than beside a wingtip.
   * It used to sit at ox 0, on top of the left orb, which is why it was never
   * visible as its own thing.
   */
  orbSmall: {
    ox: 9,
    oy: 3,
    layer: 'front',
    matrix: [
      '.n.',
      'nWn',
      '.n.',
    ],
  },

  /** A laptop, sized for a sparrow. The two W pixels are a cursor and a word. */
  computer: {
    ox: 3,
    oy: 17,
    layer: 'front',
    matrix: [
      '..KKKKKKKK....',
      '.KNnnnnnnNK...',
      '.KNnWWnnnNK...',
      '.KNnnnnWnNK...',
      '.KNNNNNNNNK...',
      '.KKKKKKKKKK...',
      'KCCCCCCCCCCK..',
      'KMKMKMKMKMMK..',
      '.KKKKKKKKKK...',
    ],
  },

  /** For a perch too narrow to hang a screen off. */
  keyboard: {
    ox: 4,
    oy: 23,
    layer: 'front',
    matrix: [
      '.KKKKKKKKKK.',
      'KCKCKCKCKCCK',
      'KCCCCCCCCCCK',
      '.KKKKKKKKKK.',
    ],
  },

  /**
   * What the laptop stands on. Behind him, so he perches ON the lit top rather
   * than in front of a slab.
   *
   * The top row lands on BASELINE_Y, which is where his feet already are and
   * where PROPS.computer's own base row already ends, so bird, laptop and desk
   * share one surface without any of the three being told about the other two.
   *
   * The legs are two pixels wide and stop after one row. They are a suggestion
   * that the surface has something under it, not a drawing of furniture: the
   * bird perches on lines of type, and anything with real height here would
   * hang down through the paragraph below him.
   */
  desk: {
    ox: -4,
    oy: 25,
    layer: 'behind',
    matrix: [
      '.CCCCCCCCCCCCCCCCCCCCCC.',
      'KKKKKKKKKKKKKKKKKKKKKKKK',
      '.MMMMMMMMMMMMMMMMMMMMMM.',
      '..K..................K..',
    ],
  },

  /* --- the incantation ----------------------------------------------------
     Three cycles run over PROPS.book while `perchIncantation` loops: flame,
     wisp, page. Their timings live in CHAT_PERCH_CYCLES; only the art is here.

     All of it is drawn in colours the palette already had. The flame is the
     vermilion pair with a paper-hi core, which is the same three values the
     beak is made of; the wisps are the blue pair, which is what PROPS.orb is
     made of, so the smoke off this book and the orbs of `perchMeditate` read
     as the same magic rather than as two unrelated effects. No new palette
     entry was added for any of it, and none should be.

     The flames are SOLID vermilion over a deeper vermilion base, with no
     light core. A paper-hi centre inside a dark ring is the obvious way to
     draw fire and it is wrong here: at three pixels across, the ring reads
     as an outline and the whole thing turns into a letterform sitting on
     the page. Likewise the turning leaf is paper-3, not paper-hi — the
     book's own pages are already paper-hi, and a white leaf on a white page
     is not a page turn, it is nothing at all.

     The x positions are not free. PROPS.book was turned to face the bird on
     2026-08-25, so there is now ONE page surface running x 18-23 with its top
     edge at y 13, and the binding sits at x 25-27. There is ONE flame as a
     result rather than two: a pair straddling a single narrow page read as
     candles standing beside a book rather than as the book alight. The smoke
     rises off the page centre at x 21 and the turning leaf pivots on the
     binding. Move the book and all five of these move with it. */

  /** Left flame tall. */
  flameA: {
    ox: 19,
    oy: 10,
    layer: 'front',
    matrix: [
      '.V...',
      '.VV..',
      'VVV..',
      'VvV..',
      '.v...',
    ],
  },

  /** Right flame tall. The pair never agree, which is the whole flicker. */
  flameB: {
    ox: 19,
    oy: 10,
    layer: 'front',
    matrix: [
      '..V..',
      '.VV..',
      '.VVV.',
      '.VvV.',
      '..v..',
    ],
  },

  /** Both up. Held slightly longer than the other two so it reads as the rest. */
  flameC: {
    ox: 19,
    oy: 10,
    layer: 'front',
    matrix: [
      '..V..',
      '..V..',
      '.VVV.',
      '.VvV.',
      '..v..',
    ],
  },

  /**
   * Smoke off the spine, four frames.
   *
   * Each mote travels one row per frame and they are spaced four rows apart,
   * so frame D hands back to frame A exactly and the column never stutters.
   * A mote loses its paper-hi core as it climbs and then drops to a single
   * pixel: that is the fade, and it is why the frames are not just the same
   * three shapes shifted.
   */
  wispA: {
    ox: 17,
    oy: 0,
    layer: 'front',
    matrix: [
      '.......',
      '...n...',
      '.......',
      '.......',
      '...n...',
      '..nnn..',
      '...n...',
      '.......',
      '...n...',
      '..nWn..',
    ],
  },

  wispB: {
    ox: 17,
    oy: 0,
    layer: 'front',
    matrix: [
      '...n...',
      '.......',
      '.......',
      '...n...',
      '..nnn..',
      '...n...',
      '.......',
      '...n...',
      '..nWn..',
      '...n...',
    ],
  },

  wispC: {
    ox: 17,
    oy: 0,
    layer: 'front',
    matrix: [
      '.......',
      '.......',
      '...n...',
      '..nnn..',
      '...n...',
      '.......',
      '...n...',
      '..nWn..',
      '...n...',
      '.......',
    ],
  },

  wispD: {
    ox: 17,
    oy: 0,
    layer: 'front',
    matrix: [
      '.......',
      '.......',
      '...n...',
      '.......',
      '.......',
      '...n...',
      '..nWn..',
      '...n...',
      '.......',
      '...n...',
    ],
  },

  /**
   * One leaf, mid-turn, pivoting on the spine at x 18-19. Drawn as an overlay
   * ABOVE the book rather than as a redraw of it, so the three frames only
   * have to carry the leaf and the book underneath is never re-authored.
   *
   * The cycle that plays these holds an empty step for four seconds first. A
   * page that turns every second is a bird flicking through, not reading.
   */
  bookPageA: {
    ox: 17,
    oy: 8,
    layer: 'front',
    matrix: [
      '............',
      '.........KK.',
      '........KCK.',
      '.......KCCK.',
      '...KKKKCCK..',
    ],
  },

  bookPageB: {
    ox: 17,
    oy: 8,
    layer: 'front',
    matrix: [
      '.......KK...',
      '......KCCK..',
      '......KCCK..',
      '......KCCK..',
      '......KCCK..',
    ],
  },

  bookPageC: {
    ox: 17,
    oy: 8,
    layer: 'front',
    matrix: [
      '............',
      '..KK........',
      '..KCK.......',
      '..KCCK......',
      '..KCCKKKK...',
    ],
  },

  /* --- dreams -------------------------------------------------------------
     Drawn while `sleep` loops. The bubble goes up and to the leading side of
     his head; the two puffs are the trail from his beak to the bubble; and one
     item out of DREAM_ITEMS floats in the middle of it, swapped every few
     seconds so the dream wanders the way dreams do.

     Centre a dream item at roughly (dreamBubble.ox + 6, dreamBubble.oy + 4). */

  dreamBubble: {
    ox: 6,
    oy: -12,
    layer: 'front',
    matrix: [
      '.....KKKKK......',
      '...KKHHHHHKK....',
      '..KHHHHHHHHHK...',
      '.KHHHHHHHHHHHK..',
      'KHHHHHHHHHHHHHK.',
      'KHHHHHHHHHHHHHK.',
      'KHHHHHHHHHHHHHK.',
      '.KHHHHHHHHHHHK..',
      '..KHHHHHHHHHK...',
      '...KKHHHHHKK....',
      '.....KKKKK......',
    ],
  },

  dreamPuffSmall: {
    ox: 15,
    oy: 3,
    layer: 'front',
    matrix: [
      '.KK.',
      'KHHK',
      '.KK.',
    ],
  },

  dreamPuffTiny: {
    ox: 15,
    oy: 8,
    layer: 'front',
    matrix: [
      '.K.',
      'KHK',
      '.K.',
    ],
  },

  /** Dream item. The obvious one. */
  dreamWorm: {
    ox: 10,
    oy: -8,
    layer: 'front',
    matrix: [
      '..VVV...',
      '.VKvvV..',
      '..VVVVV.',
      '.....VVv',
    ],
  },

  /** Dream item. */
  dreamSeed: {
    ox: 9,
    oy: -11,
    layer: 'front',
    matrix: [
      '.KKK..',
      'KBCBK.',
      'KBCBBK',
      'KBBCBK',
      '.KBBK.',
      '..KK..',
    ],
  },

  /** Dream item. */
  dreamBerry: {
    ox: 11,
    oy: -8,
    layer: 'front',
    matrix: [
      '..gG..',
      '.gGg..',
      '.VVVV.',
      'VVVvVV',
      'VVvvVV',
      '.VVVV.',
    ],
  },

  /**
   * Dream item, and mine. A single feather, drifting. He dreams about being a
   * bird — which is either the most restful thing in the list or the least,
   * depending on how the day went.
   */
  dreamFeather: {
    ox: 9,
    oy: -11,
    layer: 'front',
    matrix: [
      '.....CC',
      '....CbC',
      '...CbMC',
      '..CbMbC',
      '.CbMbC.',
      '.CMbC..',
      'MC.....',
    ],
  },

  /* --- the lawn -----------------------------------------------------------
     Two walk frames, alternated at about 380ms, while the rig translates them
     in from off-screen. AUTHORED FACING LEFT. */

  zombieWalkA: {
    ox: 26,
    oy: 10,
    layer: 'behind',
    matrix: [
      '..KKKK....',
      '.KGGGGK...',
      'KGKGGGGK..',
      'KGGGgGGK..',
      'KGKKGGGK..',
      '.KGGGGK...',
      '..KMMK....',
      'KKMMMMKK..',
      'GKMMMMMK..',
      'GGKMMMMK..',
      '.GKMMMMK..',
      '..KMMMMK..',
      '..KMKMK...',
      '..KM.KMK..',
      '..KM..KMK.',
      '.KKK..KKK.',
    ],
  },

  zombieWalkB: {
    ox: 26,
    oy: 10,
    layer: 'behind',
    matrix: [
      '...KKKK...',
      '..KGGGGK..',
      '.KGKGGGGK.',
      '.KGGGgGGK.',
      '.KGKKGGGK.',
      '..KGGGGK..',
      '..KMMK....',
      'KKMMMMKK..',
      'GKMMMMMK..',
      'GGKMMMMK..',
      '.GKMMMMK..',
      '..KMMMMK..',
      '..KMKMK...',
      '.KMK.KMK..',
      'KMK...KMK.',
      'KKK...KKK.',
    ],
  },

  /** Spawn one at PVZ_MUZZLE and translate it along +x. */
  pea: {
    ox: 17,
    oy: 5,
    layer: 'front',
    matrix: [
      '.GG.',
      'GgGG',
      'GGGG',
      '.GG.',
    ],
  },

  /** Two frames of splat is a luxury; one, held for 100ms, is enough. */
  peaSplat: {
    ox: 17,
    oy: 5,
    layer: 'front',
    matrix: [
      'g..G..',
      '.GgG.g',
      'GgGGG.',
      '.G.Gg.',
      'g...G.',
    ],
  },

  /* --- transit ------------------------------------------------------------ */

  /**
   * Hot air balloon. Vermilion and paper, striped, because the only two
   * saturated things on this whole site are vermilion and paper and there is
   * no reason for a balloon to be the exception. Basket sits at the bottom
   * edge; `balloonRope` bridges the gap down to the bird.
   */
  balloon: {
    ox: 1,
    oy: -16,
    layer: 'behind',
    matrix: [
      '......KKKKKK......',
      '....KKVVVVVVKK....',
      '...KVVVCCCCVVVK...',
      '..KVVVVCCCCVVVVK..',
      '.KVVVVVCCCCVVVVVK.',
      'KVVVVVVCCCCVVVVVVK',
      'KVVVVVVCCCCVVVVVVK',
      'KvVVVVVCCCCVVVVVvK',
      'KvvVVVVCCCCVVVVvvK',
      'KvvvVVVCCCCVVVvvvK',
      '.KvvvVVVCCVVVvvvK.',
      '..KvvvVVCCVVvvvK..',
      '...KvvvVCCVvvvK...',
      '....KKvvVVvvKK....',
      '......KKKKKK......',
      '.......K..K.......',
      '......K....K......',
      '.....KMMMMMMK.....',
    ],
  },

  balloonRope: {
    ox: 4,
    oy: 1,
    layer: 'behind',
    matrix: [
      'K..........K',
      'K..........K',
      '.K........K.',
      '.K........K.',
      '..K......K..',
      '..K......K..',
      '...K....K...',
      '...K....K...',
    ],
  },

  /** Flying saucer. Site blue, so it belongs to the page even while abducting. */
  ufo: {
    ox: -1,
    oy: -12,
    layer: 'behind',
    matrix: [
      '........KKKKKK........',
      '......KKnnnnnnKK......',
      '.....KnnWWnnnnnnK.....',
      '...KKNNNNNNNNNNNNKK...',
      'KnNnNnNnNnNnNnNnNnNnNK',
      'KNNNNNNNNNNNNNNNNNNNNK',
      '.KNNNNNNNNNNNNNNNNNNK.',
      '..KKNNNNNNNNNNNNNNKK..',
      '....KKKKKKKKKKKKKK....',
      '......n..nnnn..n......',
    ],
  },

  /**
   * The tractor beam. Drawn BEHIND the bird so he silhouettes against it, and
   * dithered with holes so it reads as light rather than as a blue triangle.
   * Scroll the holes upward a pixel every other frame and the beam moves.
   */
  ufoBeam: {
    ox: 1,
    oy: -3,
    layer: 'behind',
    matrix: [
      '.......nnnn.......',
      '......nnnnnn......',
      '......nnnnnn......',
      '.....nn.nn.nn.....',
      '.....nnnnnnnn.....',
      '....nnnnnnnnnn....',
      '....nn.nnnn.nn....',
      '...nnnnnnnnnnnn...',
      '...nnnnnnnnnnnn...',
      '..nn.nnnnnnnn.nn..',
      '..nnnnnnnnnnnnnn..',
      '.nnnnnnnnnnnnnnnn.',
      '.nn.nnnnnnnnnn.nn.',
      'nnnnnnnnnnnnnnnnnn',
    ],
  },

  /**
   * Canopy and lines. The last three rows are the rigging, and they end where
   * the `harness` gear variant's risers begin — draw both together and the
   * lines join up.
   */
  parachute: {
    ox: -2,
    oy: -16,
    layer: 'behind',
    matrix: [
      '........KKKKKKKK........',
      '.....KKKVVVVVVVVKKK.....',
      '...KKVVVVVCCCCVVVVVKK...',
      '..KVVVVVVVCCCCVVVVVVVK..',
      '.KVVVVVVVVCCCCVVVVVVVVK.',
      'KVVVVVVVVVCCCCVVVVVVVVVK',
      'KvvvvvvvvvCCCCvvvvvvvvvK',
      '.KvvvvvvvvvCCvvvvvvvvvK.',
      '..KKvvvvvvvCCvvvvvvvKK..',
      '....KKKKvvvvvvvvKKKK....',
      '........KKKKKKKK........',
      '.....K..K......K..K.....',
      '......K.K......K.K......',
      '.......KK......KK.......',
    ],
  },

  /**
   * Twenty-eight rows of twisted rope: exactly one sprite-height, so the rig
   * can tile it upward for as long as the drop needs. Drop it in from the top
   * over the first 180ms of `downRope`.
   */
  rope: {
    ox: 8,
    oy: -20,
    layer: 'behind',
    matrix: [
      '.MM.',
      '.bM.',
      '.Mb.',
      '.MM.',
      '.MM.',
      '.bM.',
      '.Mb.',
      '.MM.',
      '.MM.',
      '.bM.',
      '.Mb.',
      '.MM.',
      '.MM.',
      '.bM.',
      '.Mb.',
      '.MM.',
      '.MM.',
      '.bM.',
      '.Mb.',
      '.MM.',
      '.MM.',
      '.bM.',
      '.Mb.',
      '.MM.',
      '.MM.',
      '.bM.',
      '.Mb.',
      '.MM.',
    ],
  },

  /**
   * Canopy, shaft and crook. The shaft runs down to row 23, which lands on the
   * exact row the `reach` wing grips at — that alignment is the whole reason
   * `reach` has the oy it has, so if you move one, move the other.
   */
  umbrella: {
    ox: 0,
    oy: -14,
    layer: 'behind',
    matrix: [
      '........KKKK........',
      '......KKKKKKKK......',
      '....KCCKCCCCKCCK....',
      '...KCCCKCCCCKCCCK...',
      '..KCCCCKCCCCKCCCCK..',
      '.KCCCCCKCCCCKCCCCCK.',
      'KCCCCCCKCCCCKCCCCCCK',
      'KMMMMMMKMMMMKMMMMMMK',
      '.KKMMMMMMMMMMMMMMKK.',
      '...KKKKKKKKKKKKKK...',
      '.........KK.........',
      '.........KK.........',
      '.........KK.........',
      '.........KK.........',
      '.........KK.........',
      '.........KK.........',
      '.........KK.........',
      '.........KK.........',
      '.........KK.........',
      '.........KK.........',
      '.........KK.........',
      '.........KK.........',
      '.........KK.........',
      '........KKKK........',
    ],
  },

  /** A folded paper dart. The only vehicle here made of the same stuff as the page. */
  paperPlane: {
    ox: 2,
    oy: 20,
    layer: 'behind',
    matrix: [
      '.............K',
      '..........KKHK',
      '.......KKHHHHK',
      '....KKHHHHHHHK',
      'KKHHHHHHHHHHHK',
      'KWWWWWWWKKKKK.',
      '.KWWWWKK......',
      '..KKKK........',
    ],
  },

  /* --- debris ------------------------------------------------------------- */

  /**
   * The plume on impact in `downCrash`. One frame, blitted over him and then
   * faded by the rig over ~500ms while the individual feathers drift down.
   */
  featherPlume: {
    ox: 0,
    oy: 14,
    layer: 'front',
    matrix: [
      '...b.......C........',
      '.C.....b.......b....',
      '......C.....C.......',
      'b...C.....b.....C..b',
      '...b....C....b......',
      '.C.....C.....C....C.',
      '....b.....b.....b...',
      'C.....C.....C.......',
      '..b.....b.....b....C',
      '.....C.....C........',
      '...b.....b.......b..',
      '......C.......C.....',
    ],
  },

  /** One feather, for drifting down afterwards on a slow see-saw. */
  featherSingle: {
    ox: 9,
    oy: 12,
    layer: 'front',
    matrix: [
      '.C.',
      'CbC',
      'CbC',
      '.b.',
      '.M.',
    ],
  },

  /** A four-point glint. Scatter two or three during `showOff`. */
  sparkle: {
    ox: 16,
    oy: 6,
    layer: 'front',
    matrix: [
      '..H..',
      '..H..',
      'HHWHH',
      '..H..',
      '..H..',
    ],
  },

  /* --- set pieces ---------------------------------------------------------
     Everything below here is drawn by the RIG, at an arbitrary screen
     position, through `drawPropAt`. None of it is ever attached to the puppet
     the way a nest or a balloon is, so `ox`, `oy` and `layer` are not
     consulted for any of it and are zeroed rather than invented.

     Authored facing RIGHT where facing means anything; the rig mirrors.
     ---------------------------------------------------------------------- */

  creeper: {
    ox: 0,
    oy: 0,
    layer: 'front',
    matrix: [
      '.KKKKKKKKKKKK.',
      '.KGgGgGgGgGgK.',
      '.KgGgGgGgGgGK.',
      '.KGgGgGgGgGgK.',
      '.KgKKgGGgKKgK.',
      '.KGKKGgGGKKGK.',
      '.KgGgGKKGgGgK.',
      '.KGgGKKKKGgGK.',
      '.KgGgKKKKgGgK.',
      '.KGgGKgGKGgGK.',
      '.KgGgKgGKgGgK.',
      '.KKKKKKKKKKKK.',
      '...KKKKKKKK...',
      '...KGgGgGgK...',
      '...KgGgGgGK...',
      '...KGgGgGgK...',
      '...KgGgGgGK...',
      '...KKKKKKKK...',
      '..KKKK..KKKK..',
      '..KGgK..KGgK..',
      '..KgGK..KgGK..',
      '..KKKK..KKKK..',
    ],
  },
  creeperLit: {
    ox: 0,
    oy: 0,
    layer: 'front',
    matrix: [
      '.KKKKKKKKKKKK.',
      '.KWWWWWWWWWWK.',
      '.KWWWWWWWWWWK.',
      '.KWWWWWWWWWWK.',
      '.KWHHWWWWHHWK.',
      '.KWHHWWWWHHWK.',
      '.KWWWWHHWWWWK.',
      '.KWWWHHHHWWWK.',
      '.KWWWHHHHWWWK.',
      '.KWWWHWWHWWWK.',
      '.KWWWHWWHWWWK.',
      '.KKKKKKKKKKKK.',
      '...KKKKKKKK...',
      '...KWWWWWWK...',
      '...KWWWWWWK...',
      '...KWWWWWWK...',
      '...KWWWWWWK...',
      '...KKKKKKKK...',
      '..KKKK..KKKK..',
      '..KWWK..KWWK..',
      '..KWWK..KWWK..',
      '..KKKK..KKKK..',
    ],
  },
  blastA: {
    ox: 0,
    oy: 0,
    layer: 'front',
    matrix: [
      '...KKKK...',
      '..KHHHHK..',
      '.KHWWWWHK.',
      'KHWWWWWWHK',
      'KHWWWWWWHK',
      'KHWWWWWWHK',
      'KHWWWWWWHK',
      '.KHWWWWHK.',
      '..KHHHHK..',
      '...KKKK...',
    ],
  },
  blastB: {
    ox: 0,
    oy: 0,
    layer: 'front',
    matrix: [
      '.....KKKKKK.....',
      '...KKHHHHHHKK...',
      '..KHHHWWWWHHHK..',
      '.KHHWWWWWWWWHHK.',
      '.KHWWWWWWWWWWHK.',
      'KHHWWWWWWWWWWHHK',
      'KHWWWWWWWWWWWWHK',
      'KHWWWWWWWWWWWWHK',
      'KHWWWWWWWWWWWWHK',
      'KHWWWWWWWWWWWWHK',
      'KHHWWWWWWWWWWHHK',
      '.KHWWWWWWWWWWHK.',
      '.KHHWWWWWWWWHHK.',
      '..KHHHWWWWHHHK..',
      '...KKHHHHHHKK...',
      '.....KKKKKK.....',
    ],
  },
  blastC: {
    ox: 0,
    oy: 0,
    layer: 'front',
    matrix: [
      '........KKKKKK........',
      '......KKHHHHHHKK......',
      '....KKHH......HHKK....',
      '...KHH..........HHK...',
      '..KHH............HHK..',
      '..KH..............HK..',
      '.KH................HK.',
      '.KH................HK.',
      'KH..................HK',
      'KH..................HK',
      'KH..................HK',
      'KH..................HK',
      'KH..................HK',
      'KH..................HK',
      '.KH................HK.',
      '.KH................HK.',
      '..KH..............HK..',
      '..KHH............HHK..',
      '...KHH..........HHK...',
      '....KKHH......HHKK....',
      '......KKHHHHHHKK......',
      '........KKKKKK........',
    ],
  },
  totem: {
    ox: 0,
    oy: 0,
    layer: 'front',
    /* Minecraft's Totem of Undying: a compact golden idol, emerald square
       eyes, raised wing-like arms and the narrow green/gold robe below. */
    matrix: [
      '.....KYYYYK.....',
      '...KYYYYYYYYK...',
      '..KYYYYYYYYYYK..',
      '..KYYggYYggYYK..',
      '..KYYggYYggYYK..',
      '..KYYYYYYYYYYK..',
      '...KYYYYYYYYK...',
      '.KYYYYKYYKYYYYK.',
      'KYYYYYKYYKYYYYYK',
      'KYYYYKYYYYKYYYYK',
      '.KYYYKYYYYKYYYK.',
      '..KYKYYYYYYKYK..',
      '...KYYYYYYYYK...',
      '....KYYGGYYK....',
      '....KYGggGYK....',
      '....KYYGGYYK....',
      '.....KYYYYK.....',
      '.....KYYYYK.....',
      '.....KYKKYK.....',
      '....KYYKKYYK....',
      '...KYYYKKYYYK...',
    ],
  },
  delorean: {
    ox: 0,
    oy: 0,
    layer: 'front',
    /*
     * Traced off the 1981 DMC-12 blueprint side elevation, at 56x15 rather
     * than the old 30x14: the old one was half again as tall in proportion as
     * a real DeLorean and read as a station wagon.
     *
     * Drawn at grow 1.0, so its pixels are the same size as the bird's. The
     * old one ran at 1.5 and was visibly chunkier than everything around it.
     *
     * Stainless reads LIGHT with a few dark accents. Every draft that painted
     * the glass, the crease, the arches and the rocker in the same dark came
     * out as a black car with light trim.
     */
    matrix: [
      '..................KKKKKKKKKK............................',
      '............KKKKKKMMCMMMMMMMKK..........................',
      '........KKKKMKMKMKMMCMMMMMMMMMKKKK......................',
      '....KKKKCCMMMKMKMKMMCMMMMMMMMMMMMMKKKK..................',
      'KKKKCCCCCCCCCCCCCCCCCCCCCCCCCLCCCCCCCCKKKKKKKKKK........',
      'KVVCCCCCCCCCCCCCCCCCCCCCCCCCCLCCCCCCCCCCCCCCCCCCKKKKKK..',
      'KvCCCCCCCCCCCCCCCCCCCCCCCCCCCLCCCCCCCCCCCCCCCCCCCCCCCCKK',
      'KMMMMMMMMMKKKKKMMMMMMMMMMMMMMMMMMMMMMMMMMMKKKKKMMMMMMMHK',
      'KLLLLLLLLKMMMMMKLLLLLLLLLLLLLLLLLLLLLLLLLKMMMMMKLLLLLLLK',
      'KMMMLLLLKMMMMMMMKLLLLLLLLLLLLLLLLLLLLLLLKMMMMMMMKLLLMMMK',
      'KKMMLLLLKMMMMMMMKLLLLLLLLLLLLLLLLLLLLLLLKMMMMMMMKLLLMMMK',
      '..KKKKKKKMMMCCMMKKKKKKKKKKKKKKKKKKKKKKKKKMMMCCMMKKKKKKK.',
      '.........KMMLMMK.........................KMMLMMK........',
      '.........KMMMMMK.........................KMMMMMK........',
      '..........KKKKK...........................KKKKK.........',
    ],
  },
  deloreanFly: {
    ox: 0,
    oy: 0,
    layer: 'front',
    /*
     * Wheels turned flat and dropped on their arms, the way the film does it.
     * Edge-on from the side that is a wide thin tread under a short strut,
     * hanging lower than a rolling wheel sits. The wells stay dark and open so
     * it is still recognisably the same car with its wheels somewhere else.
     */
    matrix: [
      '..................KKKKKKKKKK............................',
      '............KKKKKKMMCMMMMMMMKK..........................',
      '........KKKKMKMKMKMMCMMMMMMMMMKKKK......................',
      '....KKKKCCMMMKMKMKMMCMMMMMMMMMMMMMKKKK..................',
      'KKKKCCCCCCCCCCCCCCCCCCCCCCCCCLCCCCCCCCKKKKKKKKKK........',
      'KVVCCCCCCCCCCCCCCCCCCCCCCCCCCLCCCCCCCCCCCCCCCCCCKKKKKK..',
      'KvCCCCCCCCCCCCCCCCCCCCCCCCCCCLCCCCCCCCCCCCCCCCCCCCCCCCKK',
      'KMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMHK',
      'KLLLLLLLLLMMMMMLLLLLLLLLLLLLLLLLLLLLLLLLLLMMMMMLLLLLLLLK',
      'KMMMLLLLLMMMMMMMLLLLLLLLLLLLLLLLLLLLLLLLLMMMMMMMLLLLMMMK',
      'KKMMLLLLMMMMMMMMMLLLLLLLLLLLLLLLLLLLLLLLMMMMMMMMMLLLMMMK',
      '..KKKKKKMMMMLLMMMMKKKKKKKKKKKKKKKKKKKKKKMMMMLLMMMMKKKKK.',
      '........KMMMMMMMMK......................KMMMMMMMMK......',
      '........KnnnnnnnnK......................KnnnnnnnnK......',
      '........KKKKKKKKKK......................KKKKKKKKKK......',
    ],
  },

  deloreanDoorA: {
    ox: 0,
    oy: 0,
    layer: 'front',
    /*
     * The gullwing, at three authored angles. A pixel bitmap put through a
     * real rotation matrix stops being pixel art on the first frame that is
     * not square, and nothing else in this puppet turns either.
     *
     * These are WHOLE CARS on a taller canvas, not a separate panel. A
     * sprite's anchor is its bottom centre, so swapping between the shut car
     * and any of these leaves the car exactly where it was and the draw call
     * never has to know which one it is holding.
     */
    matrix: [
      '........................................................',
      '........................................................',
      '........................................................',
      '........................................................',
      '........................................................',
      '........................................................',
      '...................................KK...................',
      '................................KKKCK...................',
      '..............................KKCCCCCK..................',
      '...........................KKKMMMCCCCK..................',
      '........................KKKCMMMMMCCCCK..................',
      '.......................KCCCCMMMMMCCCKKK.................',
      '.......................KCCCCCMMMMKKK....................',
      '........................KCCCCMMKK.......................',
      '........................KCCCKKK.........................',
      '........................KCCK............................',
      '..................KKKKKKKKMK............................',
      '............KKKKKKMMCMMMMMMMKK..........................',
      '........KKKKMKMKMKMMCMMMMMMMMMKKKK......................',
      '....KKKKCCMMMKMKMKMMCMMMMMMMMMMMMMKKKK..................',
      'KKKKCCCCCCCCCCCCCCCCCCCCCCCCCLCCCCCCCCKKKKKKKKKK........',
      'KVVCCCCCCCCCCCCCCCCCCCCCCCCCCLCCCCCCCCCCCCCCCCCCKKKKKK..',
      'KvCCCCCCCCCCCCCCCCCCCCCCCCCCCLCCCCCCCCCCCCCCCCCCCCCCCCKK',
      'KMMMMMMMMMKKKKKMMMMMMMMMMMMMMMMMMMMMMMMMMMKKKKKMMMMMMMHK',
      'KLLLLLLLLKMMMMMKLLLLLLLLLLLLLLLLLLLLLLLLLKMMMMMKLLLLLLLK',
      'KMMMLLLLKMMMMMMMKLLLLLLLLLLLLLLLLLLLLLLLKMMMMMMMKLLLMMMK',
      'KKMMLLLLKMMMMMMMKLLLLLLLLLLLLLLLLLLLLLLLKMMMMMMMKLLLMMMK',
      '..KKKKKKKMMMCCMMKKKKKKKKKKKKKKKKKKKKKKKKKMMMCCMMKKKKKKK.',
      '.........KMMLMMK.........................KMMLMMK........',
      '.........KMMMMMK.........................KMMMMMK........',
      '..........KKKKK...........................KKKKK.........',
    ],
  },

  deloreanDoorB: {
    ox: 0,
    oy: 0,
    layer: 'front',
    matrix: [
      '........................................................',
      '........................................................',
      '........................................................',
      '...............................KK.......................',
      '..............................KCCK......................',
      '............................KKCCCCK.....................',
      '...........................KMCCCCCCK....................',
      '..........................KMMMCCCCK.....................',
      '.........................KMMMMMCCK......................',
      '........................KMMMMMMMK.......................',
      '.......................KCCMMMMMK........................',
      '......................KCCCCMMMK.........................',
      '.....................KCCCCCCMK..........................',
      '......................KCCCCKK...........................',
      '.......................KCCK.............................',
      '........................KK..............................',
      '..................KKKKKKKKKK............................',
      '............KKKKKKMMCMMMMMMMKK..........................',
      '........KKKKMKMKMKMMCMMMMMMMMMKKKK......................',
      '....KKKKCCMMMKMKMKMMCMMMMMMMMMMMMMKKKK..................',
      'KKKKCCCCCCCCCCCCCCCCCCCCCCCCCLCCCCCCCCKKKKKKKKKK........',
      'KVVCCCCCCCCCCCCCCCCCCCCCCCCCCLCCCCCCCCCCCCCCCCCCKKKKKK..',
      'KvCCCCCCCCCCCCCCCCCCCCCCCCCCCLCCCCCCCCCCCCCCCCCCCCCCCCKK',
      'KMMMMMMMMMKKKKKMMMMMMMMMMMMMMMMMMMMMMMMMMMKKKKKMMMMMMMHK',
      'KLLLLLLLLKMMMMMKLLLLLLLLLLLLLLLLLLLLLLLLLKMMMMMKLLLLLLLK',
      'KMMMLLLLKMMMMMMMKLLLLLLLLLLLLLLLLLLLLLLLKMMMMMMMKLLLMMMK',
      'KKMMLLLLKMMMMMMMKLLLLLLLLLLLLLLLLLLLLLLLKMMMMMMMKLLLMMMK',
      '..KKKKKKKMMMCCMMKKKKKKKKKKKKKKKKKKKKKKKKKMMMCCMMKKKKKKK.',
      '.........KMMLMMK.........................KMMLMMK........',
      '.........KMMMMMK.........................KMMMMMK........',
      '..........KKKKK...........................KKKKK.........',
    ],
  },

  deloreanDoorC: {
    ox: 0,
    oy: 0,
    layer: 'front',
    matrix: [
      '........................................................',
      '..........................KK............................',
      '.........................KCCKK..........................',
      '.........................KCCCCKK........................',
      '........................KCCCCCK.........................',
      '........................KCCCCCK.........................',
      '........................KMMCCK..........................',
      '.......................KMMMMMK..........................',
      '.......................KMMMMK...........................',
      '......................KMMMMMK...........................',
      '......................KCMMMK............................',
      '.....................KCCCCMK............................',
      '.....................KCCCCK.............................',
      '....................KCCCCCK.............................',
      '.....................KKCCK..............................',
      '.......................KCK..............................',
      '..................KKKKKMKKKK............................',
      '............KKKKKKMMCMMMMMMMKK..........................',
      '........KKKKMKMKMKMMCMMMMMMMMMKKKK......................',
      '....KKKKCCMMMKMKMKMMCMMMMMMMMMMMMMKKKK..................',
      'KKKKCCCCCCCCCCCCCCCCCCCCCCCCCLCCCCCCCCKKKKKKKKKK........',
      'KVVCCCCCCCCCCCCCCCCCCCCCCCCCCLCCCCCCCCCCCCCCCCCCKKKKKK..',
      'KvCCCCCCCCCCCCCCCCCCCCCCCCCCCLCCCCCCCCCCCCCCCCCCCCCCCCKK',
      'KMMMMMMMMMKKKKKMMMMMMMMMMMMMMMMMMMMMMMMMMMKKKKKMMMMMMMHK',
      'KLLLLLLLLKMMMMMKLLLLLLLLLLLLLLLLLLLLLLLLLKMMMMMKLLLLLLLK',
      'KMMMLLLLKMMMMMMMKLLLLLLLLLLLLLLLLLLLLLLLKMMMMMMMKLLLMMMK',
      'KKMMLLLLKMMMMMMMKLLLLLLLLLLLLLLLLLLLLLLLKMMMMMMMKLLLMMMK',
      '..KKKKKKKMMMCCMMKKKKKKKKKKKKKKKKKKKKKKKKKMMMCCMMKKKKKKK.',
      '.........KMMLMMK.........................KMMLMMK........',
      '.........KMMMMMK.........................KMMMMMK........',
      '..........KKKKK...........................KKKKK.........',
    ],
  },

  deloreanFire: {
    ox: 0,
    oy: 0,
    layer: 'front',
    matrix: [
      '....vvVVYYVVvv..',
      '..vvVVYYWWYYVVvv',
      '....vvVVYYVVvv..',
    ],
  },
  martyStand: {
    ox: 0,
    oy: 0,
    layer: 'front',
    /* Side-swept dark hair, white shirt, red puffer vest, denim and trainers:
       the silhouette is deliberately narrower than the old square figure. */
    matrix: [
      '....KKKK.....',
      '...KMMMMKK...',
      '..KMMMMMMMK..',
      '..KMMMCCCMMK.',
      '..KMCCCCCCK..',
      '..KCKCCKCCK..',
      '..KCCCCCCCK..',
      '...KCCCKCCK..',
      '....KCCCCK...',
      '...KKHHHHKK..',
      '..KVVHHHHVVK.',
      '.KVVVKHHKVVVK',
      '.KVVVKHHKVVVK',
      '.KVVVKHHKVVVK',
      '..KVVVVVVVVK.',
      '...KVVVVVK...',
      '...KNNNNNK...',
      '...KNNNNNK...',
      '...KNNKNNK...',
      '...KNNKNNK...',
      '...KNNKNNK...',
      '..KWWWKWWWK..',
      '..KKKK.KKKK..',
    ],
  },
  martyPlay: {
    ox: 0,
    oy: 0,
    layer: 'front',
    /* A long dark fretboard, offset double-cut body, white pickups and a
       cherry-red finish make the Gibson readable before the pose is. */
    matrix: [
      '....KKKK.................',
      '...KMMMMKK...............',
      '..KMMMMMMMK..............',
      '..KMMCCCCMK.........KKKK.',
      '..KCCCCCCCK.........KMMK.',
      '..KCKCCKCCK.........KMMK.',
      '..KCCCCCCCK........KMKKK.',
      '..KCCKKCCCK.......KMK....',
      '...KCCCCCK.......KMK.....',
      '...KHHHHK.......KMK......',
      '.KVVHHHHVVK....KMK.......',
      'KVVVHHHHKKKKK.KMK........',
      'KVVVHHHKvvvvvKMK.........',
      'KVVVHHKVvHHVMMK..........',
      'KVVVVVKVvvvVvvK..........',
      '.KVVVVVKvvvvvK...........',
      '..KNNNNKvvvvvK...........',
      '..KNNNKvvvvvvvK..........',
      '..KNNKKVvvvVvvK..........',
      '..KNNKKKvvvVvK...........',
      '..KNNKKNKKKKK............',
      '.KWWWKKWWWK..............',
      '.KKKKKKKKKK..............',
    ],
  },
  martyKnee: {
    ox: 0,
    oy: 0,
    layer: 'front',
    matrix: [
      '.........................',
      '....................KKKK.',
      '....KKKK............KMMK.',
      '...KMMMMKK..........KMMK.',
      '..KMMMMMMMK........KMKKK.',
      '..KMMCCCCMK.......KMK....',
      '..KCCCCCCCK......KMK.....',
      '..KCKCCKCCK.....KMK......',
      '..KCCCCCCCK....KMK.......',
      '..KCCKKCKKKKK.KMK........',
      '...KCCCKvvvvvKMK.........',
      '...KHHKVvHHVMMK..........',
      '.KVVHHKVvvvVvvK..........',
      'KVVVHHHKvvvvvK...........',
      'KVVVHHHKvvvvvK...........',
      'KVVVVVKvvvvvvvK..........',
      '.KVVVVKVvvvVvvK..........',
      '..KNNNNKvvvVvK...........',
      '..KNNNNNKKKKK............',
      '.KNNNNNNNNNK.............',
      '.KNNKKKNNNNK.............',
      'KWWWK..KKKKK.............',
      'KKKKK....................',
    ],
  },
  musicNote: {
    ox: 0,
    oy: 0,
    layer: 'front',
    /* Small solid-ink quaver: no white fill, no billboard-sized outline. */
    matrix: [
      '..KKK',
      '..K.K',
      '..K.K',
      '..K.K',
      'KKK.K',
      'KK..K',
      '....K',
    ],
  },
  bolt: {
    ox: 0,
    oy: 0,
    layer: 'front',
    matrix: [
      '....KKK.',
      '...KWWK.',
      '..KWWK..',
      '.KWWK...',
      'KWWKK...',
      'KWKWWK..',
      '.KKWWK..',
      '..KWWK..',
      '..KWK...',
      '.KWWK...',
      '.KWK....',
      'KWWK....',
      'KWK.....',
      '.K......',
    ],
  },
  pumpkin: {
    ox: 0,
    oy: 0,
    layer: 'front',
    matrix: [
      '....KK....',
      '...KGgK...',
      '.KKKKKKKK.',
      'KVvVVVVvVK',
      'KVKVVVVKVK',
      'KVVVVVVVVK',
      'KVKVKKVKVK',
      'KVVKKKKVVK',
      '.KVVVVVVK.',
      '..KKKKKK..',
    ],
  },
  ghost: {
    ox: 0,
    oy: 0,
    layer: 'front',
    matrix: [
      '...KKKK...',
      '..KWWWWK..',
      '.KWWWWWWK.',
      'KWKWWWWKWK',
      'KWKWWWWKWK',
      'KWWWWWWWWK',
      'KWWKKKKWWK',
      'KWWWWWWWWK',
      'KWWWWWWWWK',
      '.KWKWWKWK.',
      '..K.KK.K..',
    ],
  },
  present: {
    ox: 0,
    oy: 0,
    layer: 'front',
    matrix: [
      '..K..K..',
      '.KKVVKK.',
      'KKKVVKKK',
      'KCCVVCCK',
      'KVVVVVVK',
      'KCCVVCCK',
      'KCCVVCCK',
      'KKKKKKKK',
    ],
  },
  snowflake: {
    ox: 0,
    oy: 0,
    layer: 'front',
    matrix: [
      '..KKK..',
      '.KWWWK.',
      'KWWWWWK',
      'KWWWWWK',
      'KWWWWWK',
      '.KWWWK.',
      '..KKK..',
    ],
  },
  egg: {
    ox: 0,
    oy: 0,
    layer: 'front',
    matrix: [
      '..KKKK..',
      '.KWWWWK.',
      'KWWWWWWK',
      'KVVVVVVK',
      'KWWWWWWK',
      'KVVVVVVK',
      'KWWWWWWK',
      'KWWWWWWK',
      '.KWWWWK.',
      '..KKKK..',
    ],
  },
  eggCracked: {
    ox: 0,
    oy: 0,
    layer: 'front',
    matrix: [
      '........',
      '........',
      '........',
      '........',
      'K.WWWW.K',
      'KVVVVVVK',
      'KWWWWWWK',
      'KWWWWWWK',
      '.KWWWWK.',
      '..KKKK..',
    ],
  },
  chick: {
    ox: 0,
    oy: 0,
    layer: 'front',
    matrix: [
      '...KKK...',
      '..KYYYK..',
      '.KYYYYYK.',
      'KYKYYYKYK',
      'KYYYVYYYK',
      'KYYYYYYYK',
      '.KYYYYYK.',
      '..KYYYK..',
      '..KV.VK..',
      '..KK.KK..',
    ],
  },
};

/* ==========================================================================
   registries

   The point of this section: the rig should never contain a string literal
   naming an animation. Import the array, pick from it, and a typo becomes a
   compile error instead of a blank bird.
   ========================================================================== */

export type Rarity = 'common' | 'rare';

export interface TransitEntry {
  readonly name: AnimationName;
  /** Relative likelihood within its own array. */
  readonly weight: number;
  readonly rarity: Rarity;
}

/**
 * FLAT, apart from one easter egg.
 *
 * This used to be weighted 92 : 8 — one ordinary climb and four things that
 * happen to other people. Jack changed the brief on 2026-08-25: "each should
 * have an equal chance of happening. Maybe with one or two easter eggs like
 * the UFO." So the four ordinary ways up are now genuinely equal, and the
 * saucer is the only thing held back.
 *
 * There are exactly TWO rare entries across both tables — the saucer here and
 * the paper plane going down. That is the "one or two" taken literally. Adding
 * a third would make rarity the normal case again, which is the thing that was
 * just removed.
 *
 * Roll across the whole array. Do not "fix" the ratio by filtering to rare
 * entries on some schedule — the value of an easter egg is that it is not on
 * a schedule. The rising-boost in `rareWeight` still applies to the saucer, so
 * a reader who never meets it becomes steadily more likely to.
 *
 * The rare weight is 2 rather than 4 BECAUSE of that boost. `rareWeight`
 * multiplies an unseen rare by 2.6, so a base of 4 put the saucer at nearly
 * 10% of a reader's very first transit, which is not an easter egg. At 2 it
 * opens around 5% and climbs from there.
 */
export const TRANSIT_UP: readonly TransitEntry[] = [
  { name: 'upFlap', weight: 24, rarity: 'common' },
  { name: 'upJetpack', weight: 24, rarity: 'common' },
  { name: 'upBalloon', weight: 24, rarity: 'common' },
  { name: 'upPropeller', weight: 24, rarity: 'common' },
  { name: 'upUfo', weight: 2, rarity: 'rare' },
];

/** Flat across five, with the paper plane as the second and last easter egg. */
export const TRANSIT_DOWN: readonly TransitEntry[] = [
  { name: 'downGlide', weight: 24, rarity: 'common' },
  { name: 'downSkydive', weight: 24, rarity: 'common' },
  { name: 'downCrash', weight: 24, rarity: 'common' },
  { name: 'downRope', weight: 24, rarity: 'common' },
  { name: 'downUmbrella', weight: 24, rarity: 'common' },
  { name: 'downPaperPlane', weight: 2, rarity: 'rare' },
];

/**
 * Every hop the bird knows, plain ones first. Weight the first two heavily —
 * a bird that flips every time it moves is not a bird with personality, it is
 * a screensaver.
 */
export const JUMP_VARIANTS: readonly AnimationName[] = [
  'hopInPlace',
  'hopForward',
  'jumpFlap',
  'jumpHigh',
  'jumpHeelClick',
  'jumpTwist',
  'jumpFlipFront',
  'jumpFlipBack',
];

/** Reader-triggered. All end in rest; any may follow any. */
export const INTERACTIONS: readonly AnimationName[] = [
  'startledAwake',
  'peckAtCursor',
  'greetBow',
  'headShake',
  'showOff',
  'recoilHop',
];

/** Every walk, including the original. */
export const WALKS: readonly AnimationName[] = [
  'walkCycle',
  'walkAlong',
  'moonwalk',
];

/** Pick ONE when the chat window opens and keep it for the whole session. */
export const CHAT_PERCHES: readonly AnimationName[] = [
  'perchNest',
  'perchBranch',
  'perchMeditate',
  'perchIncantation',
  'perchTyping',
];

/**
 * Played instead of the chosen perch while an answer streams. Deliberately
 * outside CHAT_PERCHES: it is a state, not a seat.
 */
export const CHAT_RESPONDING: AnimationName = 'perchResponding';

/**
 * What each perch needs on screen for the whole time it is held. Draw them in
 * array order, splitting on `layer`.
 *
 * `keyboard` is deliberately NOT listed against `perchTyping`. It is the
 * alternate for a perch too narrow to hang a screen off, and drawing it
 * alongside `computer` lands it on top of that laptop's own base rows. Pick
 * one or the other; never both.
 */
export const CHAT_PERCH_PROPS: { readonly [N in ChatPerchName]: readonly PropName[] } = {
  perchNest: ['nest', 'nestRim'],
  perchBranch: ['branch', 'branchLeaf'],
  perchMeditate: ['orb', 'orbRight', 'orbSmall'],
  perchIncantation: ['book'],
  perchTyping: ['desk', 'computer'],
};

/** One step of a cycle. A null prop draws nothing and is how a cycle rests. */
export interface PropCycleStep {
  readonly prop: PropName | null;
  /** ms this step is held */
  readonly d: number;
}

/** Steps in order, looping forever. Durations need not be equal. */
export type PropCycle = readonly PropCycleStep[];

/**
 * Props that CHANGE while a perch is held, on top of the fixed set above.
 *
 * Each cycle is independent and runs on its own period, which is the point:
 * a flame that flickered in lockstep with the smoke above it would read as one
 * object blinking. Steps are held, never interpolated — these are pixels, and
 * a half-lit pixel is a different colour, not a softer one.
 *
 * The rig resolves every cycle against the same clock the animations advance
 * on, so nothing here drifts against the keyframes.
 *
 * Durations are prime-ish on purpose. Equal steps beat like a metronome; 90 /
 * 80 / 100 / 80 does not, and a fire that beats is a fire nobody believes.
 */
export const CHAT_PERCH_CYCLES: {
  readonly [N in ChatPerchName]?: readonly PropCycle[];
} = {
  perchIncantation: [
    /* the fire: fast, uneven, never both flames agreeing */
    [
      { prop: 'flameA', d: 90 },
      { prop: 'flameB', d: 80 },
      { prop: 'flameC', d: 100 },
      { prop: 'flameB', d: 80 },
    ],
    /* the smoke: one row of travel per step, four steps, closes on itself */
    [
      { prop: 'wispA', d: 200 },
      { prop: 'wispB', d: 200 },
      { prop: 'wispC', d: 200 },
      { prop: 'wispD', d: 200 },
    ],
    /* the page: nothing at all for four seconds, then half a second of turn */
    /* C to A, not A to C. The binding is on the right, so a page lifts off the
       surface on the left and folds over toward it. Played the other way round
       it reads as a page arriving from somewhere there is no page. */
    [
      { prop: null, d: 4200 },
      { prop: 'bookPageC', d: 150 },
      { prop: 'bookPageB', d: 190 },
      { prop: 'bookPageA', d: 150 },
    ],
  ],
};

/** What each transit needs on screen. Empty means the bird is doing it himself. */
export const TRANSIT_PROPS: {
  readonly [N in TransitUpName | TransitDownName]: readonly PropName[];
} = {
  upFlap: [],
  upJetpack: [],
  upBalloon: ['balloon', 'balloonRope'],
  upUfo: ['ufo', 'ufoBeam'],
  upPropeller: [],
  downGlide: [],
  downSkydive: ['parachute'],
  downCrash: ['featherPlume', 'featherSingle'],
  downRope: ['rope'],
  downUmbrella: ['umbrella'],
  downPaperPlane: ['paperPlane'],
};

/**
 * Swap the contents of the dream bubble every 3-4 seconds while `sleep` runs.
 *
 * Centre the item at (PROPS.dreamBubble.ox + 7, PROPS.dreamBubble.oy + 5), and
 * ROUND that to a whole sprite pixel before scaling.
 *
 * It used to say +6, +4. That is the centre of the bubble's bounding BOX, and
 * the bubble is an ellipse: its usable interior runs x 7-19 by y -11 to -3, so
 * the box centre sits one pixel up and one left of the middle of the hole. At
 * six pixels across that was enough for the seed and the worm to cross the
 * outline on the upper left, which reads as the dream leaking out of the
 * bubble. +7, +5 is the middle of the actual opening, measured off the matrix.
 *
 * Keep every item inside 13 x 9. Nothing here needs to be bigger, and the
 * ellipse narrows fast off centre.
 */
export const DREAM_ITEMS: readonly PropName[] = [
  'dreamWorm',
  'dreamSeed',
  'dreamBerry',
  'dreamFeather',
];

/** The bubble and its trail, in draw order. */
export const DREAM_BUBBLE_PARTS: readonly PropName[] = [
  'dreamPuffTiny',
  'dreamPuffSmall',
  'dreamBubble',
];

/**
 * The set piece, in order. Loop the bracketed pair once per zombie, then exit
 * through `pvzHatOff`.
 *
 *   pvzHatOn -> pvzBurrow -> pvzPopUp -> [ pvzShoot -> pvzReload ] xN -> pvzHatOff
 */
export const PVZ_SEQUENCE: readonly AnimationName[] = [
  'pvzHatOn',
  'pvzBurrow',
  'pvzPopUp',
  'pvzShoot',
  'pvzReload',
  'pvzHatOff',
];

/** The repeating middle of PVZ_SEQUENCE. One pass per zombie. */
export const PVZ_LOOP: readonly AnimationName[] = ['pvzShoot', 'pvzReload'];

/** The props the lawn needs. */
export const PVZ_PROPS: readonly PropName[] = [
  'zombieWalkA',
  'zombieWalkB',
  'pea',
  'peaSplat',
];

/**
 * Sprite-space point a pea leaves from — the mouth of the `peashooterFire`
 * hat. Spawn on entry to frame 1 of `pvzShoot` and translate along +x
 * (or -x if the bird is mirrored).
 */
export const PVZ_MUZZLE = { x: 17, y: 6 } as const;

/** Alternate the two zombie walk frames on this interval, in ms. */
export const ZOMBIE_FRAME_MS = 380;

/** The two zombie walk frames, in order. */
export const ZOMBIE_WALK: readonly PropName[] = ['zombieWalkA', 'zombieWalkB'];

/* ==========================================================================
   idle scheduling

   The brief was explicit: hopping and moving about should come up about as
   often as sitting still. So the two groups are weighted to sum to the same
   number (IDLE_GROUP_WEIGHT below), and a picker that ignores group and just
   rolls across the whole table will land on locomotion almost exactly half
   the time. Do not "balance" this by counting entries — there are 22
   stationary picks against 9 locomotion ones, and that asymmetry is the point:
   stillness has more variety, movement has more frequency.

   Two independent brakes stop the bird looking like a slot machine:
     - cooldownMs: wall-clock time before this idle may be picked again. Long
       for the theatrical ones (yawn, sleep, stretch), short for the twitches.
     - minGap: how many other idles must be picked in between. Guarantees no
       immediate repeat even if a cooldown has technically elapsed.

   Suggested picker:
     1. Drop any entry still inside its cooldown, or picked within minGap.
     2. Roll weighted-random over what is left.
     3. When the chosen animation finishes, wait IDLE_REST_MS (plus jitter)
        playing `breathe`, then pick again.

   `wakeUp` is absent on purpose: it is the scripted exit from `sleep`, not
   something to walk into cold. Play it when leaving sleep, then resume normal
   picking. Transit animations are absent for the same reason — physics owns them.
   ========================================================================== */

export interface IdleEntry {
  readonly name: AnimationName;
  readonly group: 'stationary' | 'locomotion';
  /** Relative likelihood within the whole table. */
  readonly weight: number;
  /** Wall-clock ms before this may be picked again. */
  readonly cooldownMs: number;
  /** How many other idles must be picked before this one may return. */
  readonly minGap: number;
}

/** Each group sums to this. Kept as a constant so the balance stays checkable. */
export const IDLE_GROUP_WEIGHT = 99;

/** Quiet `breathe` between idles, before jitter. */
export const IDLE_REST_MS = 900;
export const IDLE_REST_JITTER_MS = 1600;

export const IDLE_TABLE: readonly IdleEntry[] = [
  /* --- stationary: 99 ---------------------------------------------------- */
  { name: 'breathe', group: 'stationary', weight: 14, cooldownMs: 0, minGap: 0 },
  { name: 'blink', group: 'stationary', weight: 12, cooldownMs: 1200, minGap: 1 },
  { name: 'doubleBlink', group: 'stationary', weight: 6, cooldownMs: 4000, minGap: 2 },
  { name: 'lookLeft', group: 'stationary', weight: 6, cooldownMs: 5000, minGap: 3 },
  { name: 'lookRight', group: 'stationary', weight: 6, cooldownMs: 5000, minGap: 3 },
  { name: 'lookUp', group: 'stationary', weight: 4, cooldownMs: 9000, minGap: 4 },
  { name: 'headTiltLeft', group: 'stationary', weight: 4, cooldownMs: 8000, minGap: 4 },
  { name: 'headTiltRight', group: 'stationary', weight: 4, cooldownMs: 8000, minGap: 4 },
  { name: 'preenWing', group: 'stationary', weight: 5, cooldownMs: 14000, minGap: 5 },
  { name: 'preenChest', group: 'stationary', weight: 4, cooldownMs: 16000, minGap: 5 },
  { name: 'preenTail', group: 'stationary', weight: 3, cooldownMs: 22000, minGap: 6 },
  { name: 'fluffUp', group: 'stationary', weight: 4, cooldownMs: 18000, minGap: 5 },
  { name: 'scratchHead', group: 'stationary', weight: 3, cooldownMs: 24000, minGap: 6 },
  { name: 'yawn', group: 'stationary', weight: 2, cooldownMs: 45000, minGap: 8 },
  { name: 'stretchWing', group: 'stationary', weight: 3, cooldownMs: 26000, minGap: 6 },
  { name: 'stretchBoth', group: 'stationary', weight: 2, cooldownMs: 40000, minGap: 8 },
  { name: 'chirp', group: 'stationary', weight: 4, cooldownMs: 12000, minGap: 4 },
  { name: 'peck', group: 'stationary', weight: 5, cooldownMs: 7000, minGap: 3 },
  { name: 'lookAtViewer', group: 'stationary', weight: 3, cooldownMs: 30000, minGap: 7 },
  { name: 'shiver', group: 'stationary', weight: 2, cooldownMs: 35000, minGap: 7 },
  { name: 'settle', group: 'stationary', weight: 2, cooldownMs: 30000, minGap: 7 },
  { name: 'sleep', group: 'stationary', weight: 1, cooldownMs: 180000, minGap: 12 },

  /* --- locomotion: 99 ---------------------------------------------------- */
  { name: 'hopInPlace', group: 'locomotion', weight: 20, cooldownMs: 2000, minGap: 1 },
  { name: 'hopForward', group: 'locomotion', weight: 20, cooldownMs: 2000, minGap: 1 },
  { name: 'hopBackward', group: 'locomotion', weight: 12, cooldownMs: 4000, minGap: 2 },
  { name: 'walkCycle', group: 'locomotion', weight: 14, cooldownMs: 5000, minGap: 2 },
  { name: 'turnAround', group: 'locomotion', weight: 8, cooldownMs: 9000, minGap: 4 },
  { name: 'sidestep', group: 'locomotion', weight: 9, cooldownMs: 6000, minGap: 3 },
  { name: 'flutter', group: 'locomotion', weight: 6, cooldownMs: 15000, minGap: 5 },
  { name: 'shuffle', group: 'locomotion', weight: 7, cooldownMs: 6000, minGap: 3 },
  { name: 'pivot', group: 'locomotion', weight: 3, cooldownMs: 12000, minGap: 5 },
];

/**
 * `walkCycle`, `sleep` and `breathe` loop forever, so a picker must decide how
 * long to run them rather than waiting for a finish event. These are sensible
 * durations in ms, jittered by the consumer.
 */
export const IDLE_LOOP_MS: { readonly [N in 'breathe' | 'walkCycle' | 'sleep']: number } = {
  breathe: 2300,
  walkCycle: 1760,
  sleep: 9600,
};
