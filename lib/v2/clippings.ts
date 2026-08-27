/* ============================================================================
   clippings — the five awards, the wall they are pinned to, and the article
   behind each one.

   Jack, 2026-08-27: "The newspaper clippings should lead to their own
   article/blog pages on this site."

   WHY THIS FILE EXISTS AT ALL. The stories used to be a `const STORIES` inside
   components/v2/AwardsClippings.tsx, which was correct while a cutting was the
   only thing that ever rendered them. It is not any more: the wall renders
   them, /clippings renders them, and /clippings/[id] renders one of them in
   full. Three consumers means the data is not a detail of one component, and
   leaving it there would have made the article pages import a client component
   in order to read a string.

   THE RECORD AND THE ARTICLE ARE KEPT APART, ON PURPOSE.

   `headline`, `place`, `date`, `citation` and `badges` are VERBATIM from
   public/context.json -> awards[]. They can be diffed against it, and they are
   the only things on any of these pages that count as the record.

   `article` is written. It is drawn from the record, from lib/projects-data.ts
   where an award produced a project, and from nothing else — but it is prose
   about events I was not at, so it stays in its own field where it is obvious
   which half is which. Where the record holds one sentence and no detail, the
   article says what the record says and stops rather than inventing a texture
   for it. The Snapchat lens is the clearest case of that: what is actually
   known is the number of uses, the prize, and where the prize went.

   ANYTHING IN `article` IS FAIR GAME TO REWRITE. It is the one part of this
   repository that is a draft in Jack's voice rather than a fact about him.
   ========================================================================== */

import type { BackdropName } from '@/components/v2/backdrops/types';
import { modeForSection, plateFor } from '@/lib/v2/palettes';

/** Torn-edge bitmask: 1 top, 2 right, 4 bottom, 8 left. */
export const T_TOP = 1;
export const T_RIGHT = 2;
export const T_BOTTOM = 4;
export const T_LEFT = 8;

/** How the cutting is fixed to the wall. */
export type Fastener = 'tape' | 'tape2' | 'pin';

/** How much room the story is given on the wall. */
export type Weight = 'lead' | 'story' | 'brief';

/** The halftone block: where a photograph would have run. */
export type Cut = 'wide' | 'block' | null;

export interface ClippingSection {
  heading: string;
  body: string[];
}

export interface ClippingArticle {
  /** The line under the headline. One sentence, written to be read first. */
  standfirst: string;
  sections: ClippingSection[];
  /** A line lifted out of the article, set large after the second section. */
  pull?: string;
  /** Small figures, all of them traceable. */
  shelf?: Array<{ value: string; label: string }>;
  /** Where else this lives on the site or off it. */
  links?: Array<{ href: string; label: string; lead?: boolean }>;
}

export interface Story {
  id: string;
  /** The award title, set as the headline. */
  headline: string;
  /** 'Cash Prize', '1st Place'. Runs in the dateline, in vermilion. */
  place: string;
  date: string;
  /** Machine-readable form of `date`, for <time>. */
  iso: string;
  /** The citation, verbatim from public/context.json. */
  citation: string;
  /**
   * A phrase inside `citation` to set off, the way a reader underlines the
   * line that made them keep the cutting. Must appear in `citation` exactly.
   */
  emph?: string;
  badges: string[];
  weight: Weight;
  cut: Cut;
  /** Pinned by hand, so nothing is square. Fixed, never random at runtime. */
  rot: number;
  /** Seeds the tear, the grain and the creases. */
  seed: number;
  torn: number;
  fastener: Fastener;
  /** Palette plate and backdrop world for this story's own page. */
  dress: { plate: string; world: BackdropName; intensity: number };
  article: ClippingArticle;
}

export interface Posting {
  role: string;
  company: string;
  period: string;
  /** One line, compressed from the description in public/context.json. */
  line: string;
}

/* Five awards, in the order they were won. The only editorial act on the
   record half is the headline for the first: its title carries "Cash Prize"
   and the dateline already says so, so it is not set twice. */
export const STORIES: Story[] = [
  {
    id: 'lens',
    headline: 'Snapchat Lens Competition',
    place: 'Cash Prize',
    date: 'March 2022',
    iso: '2022-03',
    citation:
      'Created a Snapchat lens used over 1 million times, securing £1500 for school technology resources as a top-performing creative entry.',
    emph: 'used over 1 million times',
    badges: ['AR', 'INNOVATION', 'IMPACT'],
    weight: 'lead',
    cut: 'block',
    rot: -1.2,
    seed: 10427,
    torn: T_BOTTOM | T_RIGHT,
    fastener: 'tape2',
    dress: { plate: 'recensorium', world: 'watercolour', intensity: 0.42 },
    article: {
      standfirst:
        'An augmented reality lens made at school, opened by more than a million people, and a prize that went to the department rather than to me.',
      sections: [
        {
          heading: 'A million of anything',
          body: [
            'The figure on the cutting is the only one that matters and it is the one I still find hard to hold in my head. A lens is a small thing. You build it, you publish it, and then a number goes up somewhere without you, and at some point that number passed a million.',
            'Nothing about making it felt like that. It was a competition entry, built to a brief, in a tool I had to learn on the way. The distance between how small the work felt and how large the number got is the first time I understood that software is not paid for by effort. It is paid for by how many people happen to be standing where you put it.'
          ]
        },
        {
          heading: 'What the prize was for',
          body: [
            'The £1500 was not mine. It was awarded to the school for technology resources, which is the detail I would keep if I could only keep one, because it changes what the entry was. I was not competing for a payout. I was competing for the equipment the next set of people through that department would get to use.',
            'That is a good shape for a first piece of work and I have not really stopped preferring it. The projects on this site that I am proudest of are the ones where the thing built outlasts my involvement in it: the tools left behind in London, the studio sites still running for clients who no longer need me, a repository somebody else can read.'
          ]
        },
        {
          heading: 'What I would do differently',
          body: [
            'I kept no telemetry, no source I can point at now, and no write-up. A million uses and I cannot show you a single frame of it. Everything since has a repository and a README, and that is not a coincidence: this is the piece of work that taught me the difference between having done something and being able to prove it.'
          ]
        }
      ],
      pull:
        'Software is not paid for by effort. It is paid for by how many people happen to be standing where you put it.',
      shelf: [
        { value: '1M+', label: 'times the lens was opened' },
        { value: '£1,500', label: 'to the school, for technology' },
        { value: '2022', label: 'made at sixteen' }
      ]
    }
  },
  {
    id: 'dragons',
    headline: "Dragon's Apprentice Challenge",
    place: '1st Place',
    date: 'March 2022',
    iso: '2022-03',
    citation:
      'Led a winning charity venture that multiplied a £100 seed fund through events including a balloon race, auction, and milkshake stand, and received a creativity award.',
    emph: 'multiplied a £100 seed fund',
    badges: ['LEADERSHIP', 'CHARITY', 'ENTREPRENEUR'],
    weight: 'story',
    cut: null,
    rot: 1.5,
    seed: 20915,
    torn: T_LEFT | T_BOTTOM,
    fastener: 'tape',
    dress: { plate: 'delivery', world: 'scrapbook', intensity: 0.46 },
    article: {
      standfirst:
        'A hundred pounds, a term, and a team. First place, and a separate award for creativity, which I have always taken as the more useful of the two.',
      sections: [
        {
          heading: 'The constraint was the whole exercise',
          body: [
            'Every team is handed the same hundred pounds. That is what makes it a real problem: you cannot win it by spending more than anybody else, and you cannot win it with an idea that only works at scale. A hundred pounds buys you one attempt at being wrong.',
            'So the question stops being what would make the most money and becomes what can we actually run, with the people we have, in the time we have, more than once. That is a question about logistics rather than ambition, and I liked it immediately.'
          ]
        },
        {
          heading: 'Three things that worked',
          body: [
            'A balloon race, an auction, and a milkshake stand. They are not one idea, they are three, and running three is the part I would defend. They fail differently: the race depends on selling ahead of the day, the auction depends entirely on what people donate, and the stand depends on footfall and on the weather. Any one of them could have gone badly without taking the total with it.',
            'The stand also did something the other two could not, which was run repeatedly. An auction happens once. A stand can be set up again the following week with what you learnt the first time, and it is the only one of the three where we got to iterate.'
          ]
        },
        {
          heading: 'Why it is on an engineering page',
          body: [
            'Because it is the same job. Fixed budget, real deadline, a team who need to know what they are doing on the day, and a result you cannot argue with at the end because it is a number. The only difference between this and shipping software for a client is which units the number is in.',
            'The creativity award is the part I would point at. Winning on takings alone would have said we found a good stall. Winning that as well says the shape of the thing was worth something, and shape is what I am usually being paid for now.'
          ]
        }
      ],
      pull: 'A hundred pounds buys you one attempt at being wrong.',
      shelf: [
        { value: '£100', label: 'seed fund, the same for every team' },
        { value: '3', label: 'separate ventures run' },
        { value: '1st', label: 'place, plus a creativity award' }
      ]
    }
  },
  {
    id: 'speaking',
    headline: 'Public Speaking Competition',
    place: '2nd Place',
    date: 'March 2023',
    iso: '2023-03',
    citation:
      'Delivered a talk on the legalisation of psychedelics to an audience including an RAF Officer, a police lieutenant, and an advisor to the Prime Minister.',
    emph: 'an advisor to the Prime Minister',
    badges: ['ADVOCACY', 'COMMUNICATION', 'STAGE'],
    weight: 'story',
    cut: null,
    rot: -1.6,
    seed: 31338,
    torn: T_TOP | T_RIGHT,
    fastener: 'pin',
    dress: { plate: 'contact', world: 'celestial', intensity: 0.46 },
    article: {
      standfirst:
        'A talk on the legalisation of psychedelics, given to a room that included an RAF officer, a police lieutenant, and an advisor to the Prime Minister.',
      sections: [
        {
          heading: 'Choosing the harder room',
          body: [
            'You get to pick your subject, and the safe move is to pick one the room already agrees with. I picked the one where I could see, from the list of who was going to be sitting there, that a good part of the audience had professional reasons to start out against it.',
            'That is not bravado, it is the only version of the exercise that teaches you anything. A talk to people who already agree measures how well you can phrase a thing. A talk to a police lieutenant about drug policy measures whether you have actually understood the objections, because you will be making them yourself, out loud, before he can.'
          ]
        },
        {
          heading: 'What it changed about how I argue',
          body: [
            'The version of the talk that worked was the one that led with the strongest case against and dealt with it first. Not as a rhetorical move. If you cannot state the other side better than they would state it, you do not understand the subject well enough to be at the front of the room.',
            'I use that constantly now and it is the single most transferable thing on this page. It is how I write a design document, how I argue for a technical decision, and it is why most of the comments in this repository open by saying what the previous approach was and why it failed rather than announcing what the current one does.'
          ]
        },
        {
          heading: 'Second, and rightly',
          body: [
            'Second place. I have never been sure I would have voted for myself either: a subject that difficult buys attention it has not yet earned, and the delivery had to carry more weight than it could. But it is the only thing I have ever been marked on where the audience was the point, and I have been more careful about who I am actually talking to ever since.'
          ]
        }
      ],
      pull:
        'If you cannot state the other side better than they would state it, you do not understand the subject well enough to be at the front of the room.',
      shelf: [
        { value: '2nd', label: 'place' },
        { value: '2023', label: 'March' }
      ]
    }
  },
  {
    id: 'hacksheffield',
    headline: 'hackSheffield 9',
    place: '1st Place',
    date: 'November 2024',
    iso: '2024-11',
    citation:
      'Won best GitHub repository award by engineering strong project structure, documentation, and developer experience, resulting in the top-scoring repository.',
    emph: 'best GitHub repository award',
    badges: ['OPEN-SOURCE', 'ENGINEERING', 'DX'],
    weight: 'story',
    cut: null,
    rot: 1.1,
    seed: 44201,
    torn: T_TOP | T_LEFT,
    fastener: 'tape',
    dress: { plate: 'from-scratch', world: 'braid', intensity: 0.44 },
    article: {
      standfirst:
        'A twenty-four hour hackathon, a team of four, and a prize for the one thing nobody optimises for at a hackathon: the repository.',
      sections: [
        {
          heading: 'The prize nobody is playing for',
          body: [
            'Every other award at a hackathon goes to the demo. This one goes to what you would find if you cloned the thing on Monday: the structure, the documentation, the developer experience, whether a stranger can run it.',
            'That is a genuinely different objective and it pulls against the obvious one, because every hour spent on a README is an hour not spent on the thing being shown at the front. We spent them anyway, and it is the award we won.'
          ]
        },
        {
          heading: 'Why that was not a sacrifice',
          body: [
            'Four people committing into one repository for twenty-four hours is not a documentation problem, it is a collision problem. Structure is what stops two of you writing the same module and neither of you noticing until the merge. The work that won the repository prize is the same work that let four people move at once, and we would have had to do most of it regardless.',
            'The honest version is that we optimised for not standing on each other, and the prize was for the artefact that fell out of it.'
          ]
        },
        {
          heading: 'It did not stop at the weekend',
          body: [
            'The entry became Neighbourly: a map of who needs help and who is nearby, with requests posted by people who need groceries, errands or company, and volunteers picking them up over a real-time chat. That it survived being carried out of the hackathon at all is the strongest evidence I have that the repository work was worth the hours.',
            /* The line that was here was the pull, verbatim, two paragraphs
               after the pull had already run it. A lift that appears BEFORE
               the sentence it lifted reads as the article repeating itself. */
            'Every other entry that weekend was better looking than ours on the Saturday night. The difference showed up on the Monday.'
          ]
        }
      ],
      pull: 'Almost nothing built in twenty-four hours is worth continuing. The ones that are, are the ones you can still read afterwards.',
      shelf: [
        { value: '1st', label: 'best GitHub repository' },
        { value: '4', label: 'people in the team' },
        { value: '24h', label: 'to build it' }
      ],
      links: [
        { href: '/projects/neighbourly', label: 'What it became', lead: true }
      ]
    }
  },
  {
    id: 'hired',
    headline: "Engineering You're Hired",
    place: '3rd Place',
    date: 'March 2025',
    iso: '2025-03',
    citation:
      'Designed a pipe inspection and repair concept using decentralised swarm robotics, contributing swarm behaviour mechanics and AI-based visual inspection ideas.',
    emph: 'decentralised swarm robotics',
    badges: ['SWARM', 'ROBOTICS', 'AI'],
    weight: 'brief',
    cut: null,
    rot: -1.7,
    seed: 51066,
    torn: T_TOP | T_BOTTOM,
    fastener: 'pin',
    dress: { plate: 'practice', world: 'topography', intensity: 0.46 },
    article: {
      standfirst:
        'A decentralised swarm of pipe-crawling robots for inspection and leak detection, designed in a week against a real brief, with a panel at the end of it.',
      sections: [
        {
          heading: 'Decentralised, and why that was the argument',
          body: [
            'A pipe network is the worst possible place to put a robot that needs to be told what to do. It is enclosed, it is unmapped in the places that matter, and the moment one unit fails inside it you have both a broken robot and a blocked pipe.',
            'So the design was a swarm with no central controller: cohesion and coverage rules that let the units spread out, cover the network without going over the same section twice, and carry on if one of them stops. My part of it was those rules and the visual inspection side, which is the half where the interesting failure modes live.'
          ]
        },
        {
          heading: 'Designing for the failure first',
          body: [
            'The locomotion is caterpillar-like, grippers and motors, and the part I would point a reviewer at is that it extends by spring on power loss. A robot that loses power in a pipe should wedge itself and stay put, not slide back down it. That is a mechanical answer to a software problem and it was the right one.',
            'The rest of the protocols are the same instinct: what happens at a corner, what happens when a unit disconnects, how one gets rescued. The concept spends most of its design budget on the situations where things have already gone wrong, which is the part of a system that decides whether it is deployable.'
          ]
        },
        {
          heading: 'Sensing, and the honest limits',
          body: [
            'Leak detection combines vision, LiDAR and ultrasonic, because no one of them is sufficient in a wet metal tube: vision gives you the crack you can see, ultrasonic gives you the wall thickness you cannot, and LiDAR gives you the geometry to know where either of them was pointing.',
            'It is a concept and it is worth saying so plainly. Nothing was built. What was produced was a design, the mechanics, the protocols, the animations that made it legible to a panel, and a business case, judged third against everyone else in the year.'
          ]
        }
      ],
      pull:
        'A robot that loses power in a pipe should wedge itself and stay put, not slide back down it.',
      shelf: [
        { value: '3rd', label: 'place, judged' },
        { value: '3', label: 'sensing methods combined' },
        { value: '2025', label: 'March' }
      ],
      links: [
        { href: '/projects/eyh-swarm-pipe-robots', label: 'The full design', lead: true }
      ]
    }
  }
];

/* The appointments column. A press wall carries one, set narrow beside the
   stories: who took which post, and when. Roles, companies and periods are
   verbatim from public/context.json -> experience[]; each line is a
   compression of that entry's own description, nothing added. */
export const POSTINGS: Posting[] = [
  {
    role: 'Missions Engineer',
    company: 'Project Falcon',
    period: '2023 to 2024',
    line: 'Real-time analytics dashboard on scalable backend infrastructure.'
  },
  {
    role: 'Full Stack Developer',
    company: 'UCD',
    period: '2025',
    line: 'Co-founded a web studio. Discovery and design through deployment.'
  },
  {
    role: 'Software Engineer',
    company: 'AI startup, London',
    period: '2026, two weeks',
    line: 'Internal API, Cloudflare Workers, a CLI, a dashboard, an MCP server.'
  }
];

/** Newest first, which is the order the article pages number themselves in. */
export const ORDERED_STORIES = STORIES.slice().reverse();

export function storyById(id: string): Story | undefined {
  return STORIES.find((s) => s.id === id);
}

/** The palette mode a clipping page settles in. Same rule the plates use. */
export function modeForStory(s: Story) {
  return modeForSection(plateFor(s.dress.plate).id);
}
