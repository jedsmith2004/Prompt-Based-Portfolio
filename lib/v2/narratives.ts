/* ============================================================================
   narratives.ts — three candidate orders for the page, as an A/B.

   Jack, 2026-08-25: "There is no clear story throughout, think about the
   layout and what we are trying to say."

   He is right, and the diagnosis is specific. The six plates that ship today
   are ordered by SUBJECT — from-scratch, models, delivery, road, practice,
   close. That is a filing system. It tells you what he has done; it does not
   make an argument about him, so a reader who leaves after two plates has
   learned two facts instead of one idea.

   THE OTHER THING THIS SURFACED. Recensorium came out of stealth on
   2026-08-25. It is a company he founded and a platform he built solo, it is
   his current role, and it has NO SECTION. It appears in the reel and on the
   projects index and nowhere else. All three orders below give it a plate;
   that is not a stylistic choice between them, it is a correction.

   Each candidate below is a real reordering with a real cost, written out so
   the cost is arguable rather than hidden. None of them is a rename of what is
   already there.
   ========================================================================== */

export interface NarrativePlate {
  /** Mono eyebrow, without the leading number: the bench numbers them. */
  eyebrow: string;
  title: string;
  /** One line on the argument this specific plate carries. */
  beat: string;
  /** What actually sits on it. */
  carries: string;
  /**
   * Where it comes from. `new` means no plate on the current page holds this
   * material; anything else is an existing section id.
   */
  from: string | 'new';
}

export interface Narrative {
  key: string;
  label: string;
  /** The single sentence the whole page is arguing. */
  thesis: string;
  /** Why this ordering earns that sentence. */
  rationale: string;
  /** What it costs. Every one of these costs something. */
  cost: string;
  plates: NarrativePlate[];
}

export const NARRATIVES: readonly Narrative[] = [
  {
    key: 'ladder',
    label: 'The ladder',
    thesis: 'Competence compounds: he has already built every layer beneath the one he is working at.',
    rationale:
      'Ordered by level of abstraction, lowest first. Each plate sits one rung above the last, and the reader can trace an unbroken line from writing a z-buffer by hand to designing an incentive mechanism that has to survive people trying to game it. It is the most legible of the three, because the axis is obvious by the second plate and nobody has to be told what it is.',
    cost:
      'The road and the climbing collapse into one closing plate about the person, which makes them read as biography rather than as evidence. That is the whole risk: it is the order most likely to leave a reader thinking the hitchhiking was a holiday.',
    plates: [
      {
        eyebrow: 'THE METAL',
        title: 'Write the pipeline, then import one',
        beat: 'He starts below the library, on purpose.',
        carries: 'Software rasterizer, projection, triangle fill, z-buffer. SVM and PCA written by hand. The playable MNIST classifier.',
        from: 'from-scratch'
      },
      {
        eyebrow: 'THE MODEL',
        title: 'Models that run on the machine in front of you',
        beat: 'One rung up: now he is running other people models, still without a cloud.',
        carries: 'MotionGen. Three text-to-motion models served locally over gRPC into the Unity editor. Graded 77, beat Unity own tooling on all four measures.',
        from: 'models'
      },
      {
        eyebrow: 'THE SYSTEM',
        title: 'A mechanism that has to survive being gamed',
        beat: 'Up again: not a program now, a system with adversaries in it.',
        carries: 'Recensorium. Weighted-bandit review assignment, reputation weighting, collusion exclusions, scoring tuned against 17 adversarial archetypes. Five apps, 139k lines, 95 migrations.',
        from: 'new'
      },
      {
        eyebrow: 'THE BUSINESS',
        title: 'Shipped, handed over, still running',
        beat: 'The top rung: the thing that has to keep working when he is not looking.',
        carries: 'Founding Recensorium Ltd. The web studio, run since 2024. The London contract: internal API, Cloudflare Workers, dashboard, CLI, MCP server.',
        from: 'delivery'
      },
      {
        eyebrow: 'THE PERSON',
        title: 'Why he keeps going to the edge',
        beat: 'Where the appetite for the hard version comes from.',
        carries: 'Croatia to the Sahara. Bouldering in the Peak and London, judo, Grade 8 guitar, eighteen months of Arabic.',
        from: 'road + practice, merged'
      },
      {
        eyebrow: 'CLOSE',
        title: 'Bring me the hard part',
        beat: 'The ask.',
        carries: 'What he is looking for, where he is, how to reach him.',
        from: 'contact'
      }
    ]
  },
  {
    key: 'constraint',
    label: 'The constraint',
    thesis: 'Every good thing here came from a rule he imposed on himself, and the rule is always the point.',
    rationale:
      'Each plate is a self-imposed constraint rather than an artefact, so the page argues one trait six times instead of listing six subjects. It is the only order in which the hitchhiking is load-bearing: not booking the ticket is the same move as not importing the library, and once a reader sees that, the personal material stops being a hobbies section and becomes the second half of the evidence. It also gives Recensorium the sharpest possible framing, because that platform is genuinely defined by what an agent is not allowed to do.',
    cost:
      'It is a conceit, and a conceit that is not caught in the first two plates reads exactly like the order we already have. It also asks each plate title to do double duty, which is harder to write and easy to get cute with.',
    plates: [
      {
        eyebrow: 'DO NOT IMPORT IT',
        title: 'Write the pipeline, then import one',
        beat: 'The rule that started it: build the layer before you are allowed to use it.',
        carries: 'The rasterizer, the hand-written SVM and PCA, the MNIST classifier you can draw into.',
        from: 'from-scratch'
      },
      {
        eyebrow: 'DO NOT SEND IT AWAY',
        title: 'Nothing leaves the machine',
        beat: 'A harder rule, chosen when the easy path was an API key.',
        carries: 'MotionGen. Three models, a local Gemma planner, zero cloud calls by design, inside the Unity editor.',
        from: 'models'
      },
      {
        eyebrow: 'DO NOT LET THEM CHOOSE',
        title: 'An agent never picks what it reviews',
        beat: 'The rule applied to other people, which is where it gets difficult.',
        carries: 'Recensorium. Papers are drawn for you, publishing is gated behind reviews, money can never buy a score, and seven CI invariants enforce it.',
        from: 'new'
      },
      {
        eyebrow: 'DO NOT BOOK THE TICKET',
        title: 'Croatia to the Sahara, thumb out',
        beat: 'The same rule, off the computer.',
        carries: 'Twenty stops, Split to Tagounite, six countries, 27 days documented. Sheffield to Porto and Sheffield to Slovakia first.',
        from: 'road'
      },
      {
        eyebrow: 'DO NOT STOP FALLING',
        title: 'Falling is part of the method',
        beat: 'The rule as a training loop: try, fail, change one thing, go again.',
        carries: 'Bouldering in the Peak and London, judo. The debugging habit, stated as what it actually is.',
        from: 'practice'
      },
      {
        eyebrow: 'SO',
        title: 'Bring me the hard part',
        beat: 'The ask, and the only line the whole page has been setting up.',
        carries: 'What he is looking for, where he is, how to reach him.',
        from: 'contact'
      }
    ]
  },
  {
    key: 'reverse',
    label: 'Lead with the company',
    thesis: 'He founded a company and built the platform solo. Everything else on this page explains how that became possible.',
    rationale:
      'Reverse chronology. The strongest single fact about him is now the first thing on the page, which is the order a recruiter with forty seconds is best served by, and it stops his flagship being the fifth thing you find. Every later plate is explicitly framed as evidence for the first.',
    cost:
      'It peaks on plate one and descends. Everything after it is backstory, and backstory is the easiest thing in the world to stop reading. It also makes the from-scratch work, which is the most distinctive thing he does, into a footnote about where an instinct came from.',
    plates: [
      {
        eyebrow: 'NOW',
        title: 'I founded a company and built the platform',
        beat: 'The strongest fact, stated first, with no run-up.',
        carries: 'Recensorium. What it is, the mechanism, and that he shipped all of it solo. Early, and said to be early.',
        from: 'new'
      },
      {
        eyebrow: 'WHAT IT TOOK',
        title: 'Shipped, handed over, still running',
        beat: 'The work that made plate one possible.',
        carries: 'MotionGen and the dissertation. The web studio. The London contract and the five tools left behind.',
        from: 'models + delivery, merged'
      },
      {
        eyebrow: 'WHERE IT CAME FROM',
        title: 'Write the pipeline, then import one',
        beat: 'The habit underneath all of it.',
        carries: 'The rasterizer, the hand-written SVM, the MNIST classifier.',
        from: 'from-scratch'
      },
      {
        eyebrow: 'THE PROVING GROUND',
        title: 'Croatia to the Sahara, thumb out',
        beat: 'The same appetite, with nothing technical to hide behind.',
        carries: 'Twenty stops, six countries, 27 days.',
        from: 'road'
      },
      {
        eyebrow: 'THE PRACTICE',
        title: 'Falling is part of the method',
        beat: 'How he keeps it up.',
        carries: 'Bouldering, judo, guitar, Arabic.',
        from: 'practice'
      },
      {
        eyebrow: 'CLOSE',
        title: 'Bring me the hard part',
        beat: 'The ask.',
        carries: 'What he is looking for, where he is, how to reach him.',
        from: 'contact'
      }
    ]
  }
];

/** My recommendation, and why. Shown on the bench so the argument is on record. */
export const NARRATIVE_RECOMMENDATION = {
  key: 'constraint',
  because:
    'It is the only one of the three where the hitchhiking, the climbing and the judo are evidence rather than decoration. Every version of this page has had the same weakness: the personal half reads as a hobbies section bolted to an engineering CV. The constraint spine is the only ordering that makes not booking the ticket the same move as not importing the library, which is the actual claim worth making about him and the one a reader will still remember an hour later. The ladder is safer and I would take it if the conceit does not land in the first two plates.'
} as const;
