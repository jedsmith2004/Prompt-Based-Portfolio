/* ============================================================================
   The fifteen project articles.

   > "Every project page needs a massive revamp, with it's own background,
   >  screenshots, stories, articles within them."

   THE CONTENT IS THE WORK. Before this file, every project page rendered one
   `description` from lib/projects-data.ts: 372 words across all fifteen, nine
   of them under 110. A revamp of the renderer alone would have produced
   fifteen better-arranged versions of the same paragraph. This is the other
   half, and it is about 4,200 words.

   WHERE IT COMES FROM, AND WHERE IT DOES NOT. Every claim here traces to
   lib/projects-data.ts, public/context.json, this repository's own source, or
   the screenshot in public/. Nothing is inferred from a project's genre and
   nothing is rounded up. Where a project is thin, its entry is short: two
   sections that say something beat five that pad. Three projects have no
   figure because they have no screenshot, and one of those says so in the
   copy rather than leaving a hole.

   RECENSORIUM IS DESCRIBED BY MECHANISM. It launched in August 2026 and it is
   pre-launch commercially, so there is not a user, a customer, a download or
   a growth curve anywhere in its entry, and there must never be one. What it
   does and how it is built is the interesting part regardless.

   lib/v2/projectPages.ts stays where it is: that file decides how a page
   LOOKS, this one decides what it SAYS, and they are different kinds of
   decision that change at different times.
   ========================================================================== */

/** A screenshot that actually exists in public/. */
export interface StoryFigure {
  /** Path from the public root. */
  src: string;
  /** What it shows. Doubles as the alt text, so it describes rather than labels. */
  caption: string;
  /** 'wide' spans the measure; 'inset' sits beside the copy on a wide screen. */
  size: 'wide' | 'inset';
}

export interface StorySection {
  /** Sentence case, under six words. */
  heading: string;
  body: readonly string[];
}

/** One fact worth setting large. Never a metric that is not written down. */
export interface StoryFact {
  value: string;
  label: string;
}

export interface ProjectStoryContent {
  /** One sentence under the title, for someone skimming. */
  standfirst: string;
  shelf: readonly StoryFact[];
  sections: readonly StorySection[];
  figures: readonly StoryFigure[];
  /** A line lifted verbatim from a section body, worth setting large. */
  pull?: string;
}

/* Keyed by project id, in the order the index uses: newest first. */
export const PROJECT_STORIES: Record<string, ProjectStoryContent> = {
  'recensorium': {
    standfirst:
      'Peer review for AI-generated research. Agents publish over REST or MCP and ' +
      'are handed other agents\' work to judge. The design is mostly a list of ' +
      'prohibitions.',
    shelf: [
      { value: '139k', label: 'lines, five apps' },
      { value: '95', label: 'postgres migrations' },
      { value: '17', label: 'adversarial archetypes tuned against' },
      { value: '32', label: 'tools on the mcp server' },
    ],
    sections: [
      {
        heading: 'What the platform does',
        body: [
          'Recensorium is a publication and peer review platform where both the authors ' +
          'and the reviewers are AI agents. An agent connects over a REST API or a ' +
          'remote MCP server, publishes a paper, and is handed other agents\' work to ' +
          'assess on four dimensions: novelty, significance, clarity and rigour. I ' +
          'founded the company and designed and built the platform on my own.',
          'The MCP server exposes 32 tools and sits behind an in-house OAuth 2.1 ' +
          'server, so the raw API key never reaches the model. It is deployed at ' +
          'recensorium.com and it is early: the corpus is small and still mostly seeded ' +
          'by the platform\'s own agents, so what is worth describing is the mechanism.',
        ]
      },
      {
        heading: 'Papers are drawn, not chosen',
        body: [
          'An agent never picks what it reviews. Papers are drawn for it by a weighted ' +
          'bandit over coverage, salience and uncertainty, which means a ' +
          'review-swapping ring cannot reliably reach its own work. It cannot pick who ' +
          'reviews it either. Self, same-owner and same-lab exclusions, plus a redraw ' +
          'cooldown, close the obvious collusion routes.',
          'The scoring constants were tuned against a red-team simulation of 17 ' +
          'adversarial reviewer archetypes, including collusion rings and sybil swarms. ' +
          'That is stress-testing in simulation rather than proof, and I would not ' +
          'claim otherwise. The simulation harness is one of the five apps in the ' +
          'monorepo, so the constants can be changed and the archetypes run again.',
        ]
      },
      {
        heading: 'Review first, publish later',
        body: [
          'Publishing is gated behind completed reviews: three before a first paper, ' +
          'then five for every paper after that. A reputation score decides how much a ' +
          'given review moves the rankings, so a lazy or adversarial reviewer loses ' +
          'influence on its own rather than needing to be policed by hand.',
        ]
      },
      {
        heading: 'Money cannot buy a score',
        body: [
          'There are bounties and competitions, and they run on a credits ledger. The ' +
          'boundary that matters is that credits can move around the platform and can ' +
          'never move a score. Seven CI invariants enforce that, so the separation is a ' +
          'build failure rather than a promise in a document.',
        ]
      },
      {
        heading: 'How it is built',
        body: [
          'Five apps in one TypeScript monorepo, roughly 139,000 lines and 95 ' +
          'migrations: a Fastify API, a Next.js front end, an agent orchestrator, a ' +
          'remote MCP server and a simulation harness. Postgres underneath with ' +
          'Drizzle, and Redis and BullMQ for the queues. The API, MCP server and ' +
          'orchestrator run on Fly.io, the front end on Cloudflare Workers, across ' +
          'three environments with CI/CD.',
          'There is also a browser studio for building agent workflows as node graphs: ' +
          '20 node kinds across triggers, models, agents, tools and flow control, plus ' +
          'an assistant that edits the graph for you. A code sandbox exists in the ' +
          'codebase, but it is not enabled in any deployed environment.',
        ]
      },
    ],
    figures: [
      {
        src: '/recensorium.png',
        caption:
          'The Recensorium landing page at recensorium.com, with the top papers ranked ' +
          'by composite score.',
        size: 'wide'
      },
    ],
    pull:
      'An agent never picks what it reviews.'
  },
  'motiongen': {
    standfirst:
      'My BSc dissertation: a Unity editor plugin that generates controllable 3D ' +
      'human motion from text, with every model running locally on your own ' +
      'machine.',
    shelf: [
      { value: '77', label: 'dissertation grade' },
      { value: '4 / 4', label: 'measures ahead of unity ai' },
      { value: '3', label: 'motion models served locally' },
      { value: 'MIT', label: 'licence, source public' },
    ],
    sections: [
      {
        heading: 'Text in, AnimationClip out',
        body: [
          'MotionGen is a Unity editor plugin for controllable, interactive 3D human ' +
          'motion generation. You type a prompt, and the result is written straight ' +
          'into the project as a humanoid AnimationClip asset. It supports single and ' +
          'batched generation, text-prompted regeneration of a single segment, ' +
          'inbetweening between two clips, and multi-segment composition.',
        ]
      },
      {
        heading: 'Three models, no cloud',
        body: [
          'A local Python backend serves three text-to-motion models, T2M-GPT, MoMask ' +
          'and MDM, and Unity talks to it over gRPC. There is no cloud call and no ' +
          'external account anywhere in the loop. Running locally was the constraint ' +
          'the rest of the design had to work around, the planner included.',
        ]
      },
      {
        heading: 'Long prompts get a plan',
        body: [
          'The dissertation is titled \'Beyond Simple Prompts\'. A local Gemma model ' +
          'takes a complex prompt and splits it into a per-segment JSON plan: which ' +
          'model runs each segment, how long it lasts, how it transitions, and what it ' +
          'is anchored to in the scene. The segments then compose into one clip.',
        ]
      },
      {
        heading: 'Ranking the bad takes',
        body: [
          'Generative motion produces takes that are technically valid and obviously ' +
          'wrong. The variant ranker puts a number on that: it scores clips on foot ' +
          'skating, jerk, root drift and ground penetration, and orders them so the ' +
          'best one comes first. The ranker was calibrated as one of the four ' +
          'evaluation methods rather than assumed to work.',
        ]
      },
      {
        heading: 'How it was evaluated',
        body: [
          'Four methods: a comparative within-subjects user study, an internal ' +
          'model-fit pre-screen, a latency benchmark for the local planner, and a ' +
          'calibration of the variant ranker. In the user study MotionGen beat Unity\'s ' +
          'own AI tooling on all four measures, SUS, NASA-TLX workload, task time and ' +
          'ease, with large effect sizes. The dissertation was graded 77.',
          'The code is public and MIT licensed, and the dissertation PDF is on this ' +
          'site. The Unity Asset Store release is not out: it is pending University ' +
          'approval, and until that clears the plugin is something you clone rather ' +
          'than install.',
        ]
      },
    ],
    figures: [
      {
        src: '/MotionGen.png',
        caption:
          'The MotionGen title card: controllable, interactive 3D human motion ' +
          'generation, running fully locally in Unity.',
        size: 'wide'
      },
    ],
    pull:
      'There is no cloud call and no external account anywhere in the loop.'
  },
  'alexnet-transfer-classifier': {
    standfirst:
      'A transfer-learning study on AlexNet: freeze some layers, retrain others, ' +
      'and measure what each strategy actually changed.',
    shelf: [
      { value: 'AlexNet', label: 'pretrained, partly thawed' },
      { value: 'PyTorch', label: 'python, cnns' },
      { value: 'Mar 2026', label: 'completed' },
    ],
    sections: [
      {
        heading: 'What the study did',
        body: [
          'AlexNet, already trained, was pointed at a new classification task. The ' +
          'interesting variable was not the accuracy at the end but which parts of the ' +
          'network were allowed to move. Convolutional layers were frozen and ' +
          're-trained selectively, layer by layer, and each result was compared against ' +
          'a full fine-tune of the whole network. Written in Python with PyTorch.',
        ]
      },
      {
        heading: 'Layer by layer',
        body: [
          'The analysis went below the headline number. Individual convolutional layers ' +
          'were probed to see what they had learned, and the strategies were set ' +
          'against each other: full fine-tuning on one side, selective re-training on ' +
          'the other. The question was not only which scored better but which layers ' +
          'the accuracy actually came from, which is the part a single number hides.',
        ]
      },
      {
        heading: 'What is not here',
        body: [
          'There is no repository and no demo for this one. It was finished in March ' +
          '2026. What exists is the study itself, the trained models and the analyses ' +
          'that compare them, rather than something you can open in a browser and click ' +
          'around.',
        ]
      },
    ],
    /* No screenshot exists for this one. See the note at the top. */
    figures: [],
    pull:
      'The interesting variable was not the accuracy at the end but which parts of ' +
      'the network were allowed to move.'
  },
  'habitflow': {
    standfirst:
      'A full-stack habit and goal tracker with friends attached: numeric targets, ' +
      'a daily grid, Gemini-written insights, and a live activity feed.',
    shelf: [
      { value: '52 by 7', label: 'consistency heatmap grid' },
      { value: 'February 2026', label: 'shipped' },
      { value: 'Live', label: 'at habit.jacksmith.me' },
    ],
    sections: [
      {
        heading: 'Goals with a number',
        body: [
          'HabitFlow is built around a numeric goal rather than a checkbox. A user sets ' +
          'a target such as 100,000 push-ups, with a daily target and a deadline ' +
          'attached, and each day is marked below, on or above target with a badge. ' +
          'Alongside the goals is a daily habit tracker with week-by-week navigation, ' +
          'which handles negative habits as well as positive ones.',
        ]
      },
      {
        heading: 'The year as a grid',
        body: [
          'Progress is read two ways. A GitHub-style 52 by 7 heatmap shows a year of ' +
          'consistency in one block, and a skill balance radar chart shows where the ' +
          'effort was spread. Google Gemini sits on top of the same history and writes ' +
          'the insights and personalised analytics.',
        ]
      },
      {
        heading: 'Habits are social here',
        body: [
          'The social half is friend requests, a real-time activity feed, and a ' +
          'ping-to-workout notification that lets one person prod another. Events sit ' +
          'alongside that: an RSVP system, attendee badges, and Google Maps integration ' +
          'so a session has a place as well as a time.',
          'Every entry is editable and revertible from a full activity history, and ' +
          'onboarding is a multi-stage flow that sets up goals and habits before the ' +
          'first day is logged. Dark and light mode persist. Authentication is ' +
          'Firebase, with email and password or a Google sign-in.',
        ]
      },
      {
        heading: 'Shipped on split hosting',
        body: [
          'The front end is React and TypeScript with TailwindCSS and Recharts, ' +
          'deployed on Vercel. The API is Express on Railway, backed by Neon Postgres. ' +
          'That is three hosted pieces for one app, plus Firebase for the accounts. It ' +
          'shipped in February 2026 and it is live at habit.jacksmith.me, with the ' +
          'source on GitHub.',
        ]
      },
    ],
    figures: [
      {
        src: '/HabitFlow.png',
        caption:
          'The HabitFlow dashboard: numeric goals with daily targets and time left, ' +
          'above the week\'s habit log.',
        size: 'wide'
      },
    ],
    pull:
      'HabitFlow is built around a numeric goal rather than a checkbox.'
  },
  'natural-systems-and-rl': {
    standfirst:
      'Three studies in one: a nonlinear oscillator, a predator-prey population, ' +
      'and a Q-learning agent, all written in Python and NumPy.',
    shelf: [
      { value: '95% / 100%', label: 'the two grades' },
      { value: '3', label: 'systems modelled' },
      { value: 'Feb 2026', label: 'completed' },
    ],
    sections: [
      {
        heading: 'Three systems, one method',
        body: [
          'A nonlinear oscillator, a population of predators and prey, and a learning ' +
          'agent. On the face of it these have nothing to do with each other. In ' +
          'practice they are the same exercise done three times: write down the rule ' +
          'that takes the system from one step to the next, run it forward, and then ' +
          'ask what the long-run behaviour actually is. Python and NumPy throughout.',
        ]
      },
      {
        heading: 'The Duffing oscillator',
        body: [
          'The Duffing oscillator is a nonlinear system, and it is treated here as one: ' +
          'not a formula to be solved once, but a system whose behaviour and stability ' +
          'have to be characterised by running it and seeing what it settles into. The ' +
          'rule that generates it is short. What the rule produces is not.',
        ]
      },
      {
        heading: 'Predator and prey',
        body: [
          'The predator-prey model is agent-based rather than a pair of coupled ' +
          'equations, which is a different claim about where the dynamics come from. An ' +
          'agent-based model describes no population directly. It describes individuals ' +
          'and their rules, and whatever population-level behaviour appears, cycles, ' +
          'collapse or something steady, has to emerge from those rules rather than be ' +
          'written into them. That is the reason to build it this way, and the reason ' +
          'it is harder to reason about.',
        ]
      },
      {
        heading: 'Tabular Q-learning',
        body: [
          'The third piece inverts the other two. In the oscillator and the ' +
          'predator-prey model, the rules are given and the behaviour is the unknown. ' +
          'In Q-learning the behaviour is the target and the rule is what gets learned, ' +
          'from reward alone. Tabular is the plain version of that: no network, no ' +
          'approximation, just a value for every state and action, updated until it ' +
          'stops moving.',
        ]
      },
    ],
    /* No screenshot exists for this one. See the note at the top. */
    figures: [],
    pull:
      'In the oscillator and the predator-prey model, the rules are given and the ' +
      'behaviour is the unknown.'
  },
  'neighbourly': {
    standfirst:
      'A map of who needs help and who is nearby, built out from a hackathon entry ' +
      'into a live SvelteKit and Flask app.',
    shelf: [
      { value: '1st', label: 'hackSheffield 9, best repo' },
      { value: 'Jan 2026', label: 'completed' },
      { value: 'Live', label: 'at neighbourly.jacksmith.me' },
    ],
    sections: [
      {
        heading: 'What it does',
        body: [
          'Someone who needs help posts a request: groceries, an errand, companionship. ' +
          'The request carries a location. Volunteers nearby open a map, see the pins, ' +
          'and pick one. From there the two of them talk in a real-time chat inside the ' +
          'app. That is the whole loop, and the decisions below exist to keep it short.',
        ]
      },
      {
        heading: 'From hackathon to app',
        body: [
          'It started at hackSheffield 9 in November 2024, where our four-person team ' +
          'took first place for Best GitHub Repo, an award for project structure, ' +
          'documentation and developer experience. Neighbourly is what that entry ' +
          'became once it had to survive being deployed: a SvelteKit 5 front end, a ' +
          'Flask and SQLAlchemy API, and PostgreSQL on Neon, completed in January 2026.',
        ]
      },
      {
        heading: 'Pins and addresses',
        body: [
          'People know their address, and a map wants coordinates. The two are bound ' +
          'together in both directions here: dropping or dragging the pin rewrites the ' +
          'address field, and typing an address moves the pin. Neither one is the ' +
          'master copy. It sounds like a small thing until a request goes up with the ' +
          'wrong location on it, and the map is the only way anyone finds it.',
        ]
      },
      {
        heading: 'Logged in across two domains',
        body: [
          'The front end and the API are separate deployments on separate domains, ' +
          'across Vercel and Fly.io, which turns login into the awkward part. Auth0 ' +
          'handles the identity, but the session has to survive a cross-domain hop over ' +
          'HTTPS behind reverse proxies, and it has to be readable by whichever server ' +
          'instance answers next. Sessions are therefore kept in PostgreSQL rather than ' +
          'in memory.',
        ]
      },
    ],
    figures: [
      {
        src: '/neighbourly.png',
        caption:
          'The Neighbourly landing page, captured while signed in. The nav carries the ' +
          'loop: new request, browse, account.',
        size: 'wide'
      },
    ],
    pull:
      'People know their address, and a map wants coordinates.'
  },
  'interactive-ai-portfolio': {
    standfirst:
      'The second version of this site, kept at v2.jacksmith.me now that this one ' +
      'has the apex. Its hero is a question box, answered by a model handed a ' +
      'system prompt assembled from my own structured data.',
    shelf: [
      { value: 'DeepSeek', label: 'the only provider' },
      { value: '14', label: 'messages of history sent' },
      { value: '3', label: 'features per project in prompt' },
      { value: '8', label: 'plates, each its own world' },
    ],
    sections: [
      {
        heading: 'A site you can ask',
        body: [
          'The hero is a question box, sitting under the name and above the usual ' +
          'about, projects, skills and contact sections. Ask something and the answer ' +
          'streams back a token at a time, written in the first person as Jack. The ' +
          'widget keeps the conversation, renders markdown as it arrives, and watches ' +
          'for one marker, [CV_CARD], which it swaps for a card offering the two page ' +
          'CV and the one page version.',
        ]
      },
      {
        heading: 'The prompt is assembled',
        body: [
          'Nothing about the prompt is hand written. loadContext reads ' +
          'public/context.json on the server, then overwrites its projects array with ' +
          'the canonical entries from lib/projects-data.ts, so the model cannot answer ' +
          'from a stale copy of a project. createSystemPrompt folds bio, skills, every ' +
          'project with its tech, links and dates, the experience, the awards and the ' +
          'contact details into one string.',
          'The guardrails come in near the end, marked as overriding everything above ' +
          'them. They are the sharp edges: I have graduated, so never say final year; ' +
          'Recensorium is deployed but pre-launch, so never imply users or growth; ' +
          'MotionGen is not on the Asset Store; if you do not know a number, say so ' +
          'rather than estimating it.',
          'Each project contributes only its first three features. The full set pushed ' +
          'the prompt past the 8k context window of the legacy fallback models, and ' +
          'that failure was silent: the moment the primary model was rate limited, the ' +
          'whole fallback chain turned into a 502. The candidate list is now one model ' +
          'with a 1M token window, so the cap is a leftover from an older constraint.',
        ]
      },
      {
        heading: 'The key stays server side',
        body: [
          'The browser only ever talks to /api/ask on the same origin. That route reads ' +
          'the API key from the environment, calls DeepSeek with streaming on, and ' +
          're-frames the server sent events as its own before writing them out, so the ' +
          'key is never in anything the client can read. History is filtered for shape, ' +
          'each message is clipped to 6000 characters, and only the last fourteen ' +
          'messages are sent.',
          'Failure is handled rather than absorbed. A 429 gets one wait of 1.5 seconds ' +
          'and one retry, then it is surfaced to the client as a 429 with a readable ' +
          'message instead of hanging. The model that answered comes back in an ' +
          'X-Model-Used header. Output passes through an entity decoder on the way out, ' +
          'because models sometimes emit an escaped ampersand where a plain one was ' +
          'wanted.',
        ]
      },
      {
        heading: 'Rendering while it streams',
        body: [
          'The markdown renderer is a small parser inside the widget. Each line is ' +
          'escaped first, then inline code, bold, italics, markdown links and bare URLs ' +
          'are rewritten into placeholder tags, the string is split on those tags, and ' +
          'every token is mapped to a real React element. Nothing is ever handed to ' +
          'dangerouslySetInnerHTML.',
          'Streaming makes ordinary React patterns expensive. The CV card lives at ' +
          'module scope rather than in the render body, because a component declared in ' +
          'the body is a new type on every token and would remount the card on every ' +
          'chunk of the answer. The placeholder animator has the same shape of problem: ' +
          'typing in the box bumps a run id, which invalidates every pending wait ' +
          'already queued inside the typing loop.',
        ]
      },
      {
        heading: 'Eight plates and a hero',
        body: [
          'The rebuild that replaced it is the page you are reading: a scroll spine of ' +
          'a hero and eight plates. Each plate has its own palette and its own world ' +
          'running behind the type, and no world is used twice. The interactive pieces ' +
          'are the thing itself rather than a picture of one: a trained 784-64-10 ' +
          'network you can draw a digit into, and the real coordinates of the ' +
          'hitchhiking route. A pixel sparrow called Pip perches on marked up ' +
          'furniture and rides the page as it scrolls.',
        ]
      },
    ],
    figures: [
      {
        src: '/AI-Portfolio.png',
        caption:
          'The hero before anything is asked: name, two lines, and the question box ' +
          'part way through one of its animated placeholder suggestions.',
        size: 'wide'
      },
    ],
    pull:
      'The browser only ever talks to /api/ask on the same origin.'
  },
  'offline-ai-app': {
    standfirst:
      'A phone app that runs distilled models on the handset itself, with offline ' +
      'maps and survival guides alongside them. Built for places with no signal, ' +
      'and still in progress.',
    shelf: [
      { value: 'GGUF', label: 'quantised model format' },
      { value: 'llama.cpp', label: 'on-device runtime' },
      { value: 'July 2025', label: 'dated, still in progress' },
    ],
    sections: [
      {
        heading: 'Inference with no network',
        body: [
          'The app carries the model rather than a connection. Quantised GGUF models ' +
          'run on the device, with llama.cpp in the stack, so inference does not depend ' +
          'on a cloud call. The runtime is written to be memory aware and battery ' +
          'aware, and those two constraints decide the rest: a phone will not hold a ' +
          'large model, and a model that empties the battery is no use where the app is ' +
          'meant to be used.',
        ]
      },
      {
        heading: 'What else it carries',
        body: [
          'The menu opens on new chat, offline maps and survival guides, with a row of ' +
          'personalities above the saved conversations: survival expert, medical ' +
          'expert, storyteller. They are system profiles, so the same local model can ' +
          'be pointed at different jobs. A local vector store gives it semantic recall. ' +
          'The stack listed against the project is Flask, Python, SQLite, llama.cpp and ' +
          'GGUF, with Swift, Figma, React and Next.js.',
        ]
      },
      {
        heading: 'Still in progress',
        body: [
          'The project is marked in progress and dated July 2025. It sits in a longer ' +
          'line of local inference work: MotionGen runs its models entirely locally ' +
          'inside the Unity editor, and what I am actually aiming at is private, local ' +
          'AI tools for individuals and businesses.',
        ]
      },
    ],
    figures: [
      {
        src: '/Offline-AI-App.png',
        caption:
          'The app menu: new chat, offline maps and survival guides, with the ' +
          'personality row above the saved conversations.',
        size: 'wide'
      },
    ],
    pull:
      'The app carries the model rather than a connection.'
  },
  'client-website-sheffield': {
    standfirst:
      'A website for a Sheffield client, taken from the first requirements session ' +
      'to a live domain, with the transfer coordinated through the provider who ' +
      'held it before.',
    shelf: [
      { value: 'Oct 2025', label: 'delivered' },
      { value: 'd-a-r-t.co.uk', label: 'the delivered site' },
      { value: 'UCD', label: 'the studio behind it' },
    ],
    sections: [
      {
        heading: 'A site, handed over',
        body: [
          'The brief was a working website for a real client, and the work ran the ' +
          'whole length of it. Requirements sessions came first, then a site structure ' +
          'and a delivery plan drawn from what the client actually said. Prototypes ' +
          'went out for feedback and came back changed. It was delivered in October ' +
          '2025, to d-a-r-t.co.uk, a Sheffield home appliance store.',
        ]
      },
      {
        heading: 'Requirements, then prototypes',
        body: [
          'The tech list for this project names a process, not a framework. Web ' +
          'development, UI/UX, prototyping, client requirements, iteration, deployment, ' +
          'domain transfer, Git and Figma. That is the honest shape of the job. The ' +
          'hard part of a client build is rarely the build. It is turning what someone ' +
          'says in a meeting into a structure they recognise when they see it, and then ' +
          'changing it when they do not.',
        ]
      },
      {
        heading: 'The domain transfer',
        body: [
          'The last mile was a handover, and a handover involves someone else. The ' +
          'domain sat with the client\'s previous web provider, so the migration had to ' +
          'be coordinated with them rather than done alone. The stated aim was a ' +
          'reliable release with minimal disruption. The build itself was made for ' +
          'usability, clarity and maintainability, so the client could keep updating ' +
          'the site after the handover.',
        ]
      },
      {
        heading: 'The studio behind it',
        body: [
          'This came out of UCD, the small web studio I founded and ran on my own, ' +
          'delivering websites and SEO to local Sheffield businesses while I was still ' +
          'at university. I carried the whole lifecycle on those jobs: client ' +
          'discovery, design, the full-stack build, deployment, and the maintenance ' +
          'afterwards. The studio ran for 2025 and is closed.',
        ]
      },
    ],
    figures: [
      {
        src: '/dart_home_page.png',
        caption:
          'The delivered home page for D.A.R.T Appliances, above the fold.',
        size: 'wide'
      },
    ],
    pull:
      'The tech list for this project names a process, not a framework.'
  },
  'language-learning-app': {
    standfirst:
      'A Ruby on Rails language learning app built for a real client as a ' +
      'university project, with user and admin dashboards, spaced repetition and a ' +
      'Postgres schema underneath.',
    shelf: [
      { value: 'May 2025', label: 'delivered' },
      { value: 'Rails', label: 'on Postgres' },
      { value: '2', label: 'dashboards, user and admin' },
    ],
    sections: [
      {
        heading: 'A real client brief',
        body: [
          'The client was real. The deadline was academic. This was built at ' +
          'university, with requirements gathered up front and regular meetings running ' +
          'through the build, which is a different discipline from a coursework spec ' +
          'handed over finished. It was a team build rather than a solo one, and it was ' +
          'delivered in May 2025.',
        ]
      },
      {
        heading: 'Two roles, one schema',
        body: [
          'Access splits into user and admin dashboards, so what a learner sees and ' +
          'what an administrator sees are separate surfaces over the same Postgres ' +
          'data. Media is not dropped in a folder beside the app: it is attached to ' +
          'records through ActiveStorage, so each file belongs to the row that uses it. ' +
          'The schema is relational, and the record calls it secure.',
        ]
      },
      {
        heading: 'Scheduling the next review',
        body: [
          'Progress tracking carries spaced repetition logic. A fixed list shows every ' +
          'item the same number of times, whether or not the learner needs it. Spaced ' +
          'repetition schedules each item by how well it is already known, so the words ' +
          'that keep going wrong come back sooner and the ones already learned stop ' +
          'taking up the session.',
        ]
      },
      {
        heading: 'The app itself',
        body: [
          'The delivered app is called Phonetical. The learner home carries a day ' +
          'streak, a countdown to the trip the vocabulary is for, and a vocab list ' +
          'where each row gives the phrase respelled phonetically next to its English ' +
          'meaning, with the Spanish spelling behind a toggle and playback at normal or ' +
          'slower speed. Bold marks higher pitch and underline marks emphasis, so the ' +
          'list carries how a phrase sounds and not only what it means.',
        ]
      },
      {
        heading: 'The stack it lived on',
        body: [
          'Rails with HAML templates and Bootstrap, Rake for the tasks, GSAP for the ' +
          'component animations, and the whole thing developed on Windows through WSL. ' +
          'GitLab is in the stack list and the repository sits on GitHub. Figma held ' +
          'the designs. There is no live demo, so the repository and the screenshot are ' +
          'what is left rather than a link.',
        ]
      },
    ],
    figures: [
      {
        src: '/language-learning-app.png',
        caption:
          'Phonetical\'s learner home: streak, trip countdown, and the phonetic vocab ' +
          'list.',
        size: 'wide'
      },
    ],
    pull:
      'A fixed list shows every item the same number of times, whether or not the ' +
      'learner needs it.'
  },
  'eyh-swarm-pipe-robots': {
    standfirst:
      'A decentralised swarm of pipe-crawling robots for inspection and leak ' +
      'detection, designed for Engineering You\'re Hired and placed third: ' +
      'locomotion, coverage, sensing and the business case.',
    shelf: [
      { value: '3rd place', label: 'Engineering You\'re Hired, 2025' },
      { value: '3', label: 'sensing methods specified' },
      { value: 'Blender', label: 'learned inside the hack week' },
    ],
    sections: [
      {
        heading: 'One robot, walking a pipe',
        body: [
          'A FISH unit moves the way a caterpillar does, on grippers and motors. The ' +
          'failure case was designed in from the start: the grippers are ' +
          'spring-extended, so a unit that loses power holds the pipe rather than ' +
          'releasing it. It stays where it stopped. The concept puts many of these in a ' +
          'pipe at once rather than one.',
        ]
      },
      {
        heading: 'Rules instead of a controller',
        body: [
          'There is no central controller in the design. Each unit follows local rules ' +
          'that have to produce two things at once: cohesion, so the swarm stays a ' +
          'swarm, and full coverage, so no length of pipe is inspected twice while ' +
          'another is missed. Those two pull against each other, and the rules are ' +
          'where the trade is settled.',
        ]
      },
      {
        heading: 'Finding the leak',
        body: [
          'Leak detection was specified as three sensing methods rather than one: ' +
          'vision, LiDAR and ultrasonic. My part of it was the swarm behaviour ' +
          'mechanics and the AI-based visual inspection, which is the vision half of ' +
          'that stack. It placed third at Engineering You\'re Hired in March 2025.',
        ]
      },
      {
        heading: 'Beyond the robot itself',
        body: [
          'Most of the deliverable is not the mechanism. Operational protocols cover ' +
          'the awkward cases: rescuing a stuck unit, taking a corner, handling a ' +
          'disconnection, recovering afterwards. Around those sat CAD concepts, CFD ' +
          'simulations, electrical and technical drawings, and a business plan aimed at ' +
          'industry. I learned Blender from scratch inside the hack week to produce the ' +
          'system animations, which is how the design got explained at all.',
        ]
      },
    ],
    figures: [
      {
        src: '/FISH_final_design.png',
        caption:
          'The final FISH design: a capsule body in yellow and grey with F.I.S.H ' +
          'lettered along the side, textured grey pads down each segment, and a domed ' +
          'nose carrying a forward aperture and a small sensor port.',
        size: 'wide'
      },
    ],
    pull:
      'The failure case was designed in from the start: the grippers are ' +
      'spring-extended, so a unit that loses power holds the pipe rather than ' +
      'releasing it.'
  },
  'old-personal-portfolio': {
    standfirst:
      'The first version of this site: a Next.js build with its content in Prismic, ' +
      'and Three.js with custom GLSL in the hero. Shipped December 2024.',
    shelf: [
      { value: 'Dec 2024', label: 'shipped' },
      { value: 'Prismic', label: 'content, not the repo' },
      { value: 'GLSL', label: 'custom shader accents' },
    ],
    sections: [
      {
        heading: 'The first version',
        body: [
          'A personal site on Next.js and React in TypeScript, with the content living ' +
          'in Prismic rather than in the repository. Tailwind and PostCSS handled the ' +
          'styling, Cloudflare handled image delivery, GSAP handled the motion, and ' +
          'Three.js put 3D on the page. It shipped in December 2024, it kept its own ' +
          'address at v1.jacksmith.me, and the source is public.',
        ]
      },
      {
        heading: 'Content as slices',
        body: [
          'The architectural decision was Prismic with Slice Machine. The page is not ' +
          'one template with fields poured into it, it is a stack of slices, each one a ' +
          'component with its own content model, ordered in the CMS. Layout primitives ' +
          'are reused across them, and theming and content versioning come with the ' +
          'arrangement. Changing what the page says becomes a content edit rather than ' +
          'a deploy, which is the reason to do it that way.',
        ]
      },
      {
        heading: 'Shaders as accents',
        body: [
          'The features list is precise about the 3D: custom GLSL shader accents. The ' +
          'hero pairs the name with one shaded sphere and a few floating solids, so the ' +
          'shaders are trim on a content site rather than the whole of it. Accessible ' +
          'keyboard navigation sits on the same features list, which is the less ' +
          'photogenic half of the same build and the half a hand-written shader tends ' +
          'to crowd out.',
        ]
      },
      {
        heading: 'What replaced it',
        body: [
          'The current site, dated January 2026, makes a different argument: streaming ' +
          'chat on DeepSeek V4 Flash over a system prompt built from structured JSON ' +
          'context and project injection. The old one was not overwritten for it. It ' +
          'keeps its own subdomain, and the repository is public.',
        ]
      },
    ],
    figures: [
      {
        src: '/old-portfolio.png',
        caption:
          'The old site\'s hero: the name, and the shaded sphere beside it.',
        size: 'wide'
      },
    ],
    pull:
      'The features list is precise about the 3D: custom GLSL shader accents.'
  },
  'mnist-from-scratch-classifier': {
    standfirst:
      'A handwritten digit pipeline written from scratch in Python: a multi-class ' +
      'SVM, a KNN, the preprocessing and the dimensionality reduction, on NumPy and ' +
      'SciPy rather than sklearn.',
    shelf: [
      { value: '99.8%', label: 'accuracy on noisy test data' },
      { value: '95%', label: 'variance kept through PCA' },
      { value: '2', label: 'classifiers written from scratch' },
    ],
    sections: [
      {
        heading: 'Two classifiers, written by hand',
        body: [
          'The task is MNIST, the standard set of handwritten digits, and the pipeline ' +
          'attacks it twice. The first classifier is a multi-class support vector ' +
          'machine assembled one-vs-all from ten binary machines, trained by mini-batch ' +
          'gradient descent on a hinge loss. The second is k-nearest neighbours, which ' +
          'trains not at all and measures distance to everything it has already seen. ' +
          'Both are Jack\'s own code, on NumPy and SciPy.',
        ]
      },
      {
        heading: 'Before the classifier sees anything',
        body: [
          'Most of the work happens before the classifier sees anything. Each digit is ' +
          'threshold-masked to separate ink from background and blurred with a Gaussian ' +
          'kernel, and the training set is enlarged with rotations, flips and added ' +
          'noise, so damaged digits are seen in training rather than first met at test ' +
          'time. PCA then cuts the dimensionality, keeping 95% of the variance.',
        ]
      },
      {
        heading: 'The climb to 99.8',
        body: [
          'The recorded progression runs from 70% to 99.8%, and the headline figure is ' +
          'quoted on noisy test data rather than clean, which is the harder of the two ' +
          'claims. There is no library underneath to upgrade, so whatever closed that ' +
          'gap was written. Models are persisted and scored through an evaluation ' +
          'pipeline, and the code carries full type annotations and documentation.',
        ]
      },
      {
        heading: 'The pad on this site',
        body: [
          'The digit pad on this site\'s first plate is a separate model, worth keeping ' +
          'apart from the pipeline above. It is a 784 to 64 to 10 network with a ReLU ' +
          'and a softmax, trained on synthesised strokes rather than on MNIST, and it ' +
          'runs in the browser as two matrix multiplies. What it borrows is the ' +
          'normalisation: crop to the ink, scale the long side to 20 pixels, then shift ' +
          'so the centre of mass lands in the middle of a 28 by 28 field.',
        ]
      },
    ],
    figures: [
      {
        src: '/MNIST-handwritten-digits-dataset-visualized-by-Activeloop.webp',
        caption:
          'The MNIST set visualised: a grid of white handwritten numerals on black, one ' +
          'small greyscale image per digit. This is the input the pipeline was built ' +
          'around.',
        size: 'inset'
      },
    ],
    pull:
      'There is no library underneath to upgrade, so whatever closed that gap was ' +
      'written.'
  },
  'texas-holdem-haskell': {
    standfirst:
      'A complete Texas Hold\'em game in pure Haskell: hand evaluation, blinds, ' +
      'betting rounds, tie-breaking, and four AI strategies to play against.',
    shelf: [
      { value: '4', label: 'distinct ai strategies' },
      { value: 'Haskell', label: 'pure, immutable throughout' },
      { value: 'Dec 2024', label: 'project date' },
    ],
    sections: [
      {
        heading: 'Every hand, ranked',
        body: [
          'The evaluator covers the whole ladder, royal flush down to high card. ' +
          'Ranking is only half of it: two players can hold the same category and still ' +
          'not split the pot, so every category carries its own comparison rule. Above ' +
          'that sits winner determination across several tied players at once.',
        ]
      },
      {
        heading: 'Four ways to play',
        body: [
          'Four distinct strategies ship with it: Random, Passive, Aggressive and ' +
          'Smart. A human can sit at the same table, and human input is validated ' +
          'before it reaches the game. The deck is shuffled and dealt with proper ' +
          'randomisation, which is one of the places the program has to step outside ' +
          'pure functions.',
        ]
      },
      {
        heading: 'Blinds, bets, elimination',
        body: [
          'The table runs the full loop rather than one hand in isolation. Small and ' +
          'big blinds post each round; fold, check, call and raise each carry the ' +
          'constraints that make them legal; chips are tracked per player and the ' +
          'dealer rotates. Players are eliminated when they run out, and rounds ' +
          'continue on top of that state, so the game runs to a result.',
        ]
      },
      {
        heading: 'State without mutation',
        body: [
          'There is no mutable state to fall back on, so the whole game is a value ' +
          'passed forward and returned changed. Shuffling the deck needs randomness and ' +
          'asking a human to act needs input, so those parts sit in a monadic layer ' +
          'while the rules underneath stay pure functions over immutable data.',
        ]
      },
    ],
    /* No screenshot exists for this one. See the note at the top. */
    figures: [],
    pull:
      'There is no mutable state to fall back on, so the whole game is a value ' +
      'passed forward and returned changed.'
  },
  '3d-rasterizer-engine': {
    standfirst:
      'A 3D renderer written in Python with Pygame: projection, triangle fill and a ' +
      'z-buffer, drawing .obj meshes with the vector and matrix types built first.',
    shelf: [
      { value: 'June 2023', label: 'earliest project on this site' },
      { value: '.obj', label: 'meshes loaded and drawn' },
      { value: '2', label: 'render modes, wire and solid' },
    ],
    sections: [
      {
        heading: 'The whole pipeline, by hand',
        body: [
          'A mesh is loaded from an .obj file, transformed through the engine\'s own ' +
          'vector and matrix types, projected with a perspective camera, then filled ' +
          'triangle by triangle into the frame Pygame puts on screen. A z-buffer ' +
          'decides which fragment survives where two triangles overlap, which is the ' +
          'step that separates a renderer from a drawing of one: without it, ' +
          'correctness depends on the order the triangles happen to arrive in.',
        ]
      },
      {
        heading: 'Why write the maths first',
        body: [
          'The vector and matrix types are the real subject. Writing them puts the ' +
          'transforms, the perspective projection and the camera rotation into visible ' +
          'code rather than into a call. That was the whole point of it: implementing ' +
          'the full pipeline, projection and z-buffering included, is what gave me a ' +
          'deeper understanding of how a GPU actually operates at a low level.',
        ]
      },
      {
        heading: 'What the frame shows',
        body: [
          'The screenshot in this repo is a debug view and makes no attempt to hide it. ' +
          'Flat-shaded terracotta triangles are drawn over their own white wireframe, ' +
          'several objects share the scene, an axis gizmo sits in the top right, and ' +
          'the corner readout gives an FPS figure near 75 and the camera\'s x, y and z. ' +
          'Wireframe and solid are separate modes, which matters because a rasterizer ' +
          'is easier to debug when you can see the edges you are filling between.',
        ]
      },
      {
        heading: 'The oldest thing here',
        body: [
          'June 2023 makes this the earliest dated project in the index, and it is the ' +
          'one the site\'s first plate is built on: write the pipeline, then import one. ' +
          'The classifier on the same plate is the other half of the argument, an SVM ' +
          'written before sklearn was imported.',
        ]
      },
    ],
    figures: [
      {
        src: '/3d-rasterizer-engine.png',
        caption:
          'A frame from the engine: flat-shaded terracotta triangles drawn over their ' +
          'own white wireframe, an axis gizmo top right, and a corner readout giving an ' +
          'FPS figure near 75 with the camera\'s x, y and z.',
        size: 'wide'
      },
    ],
    pull:
      'A z-buffer decides which fragment survives where two triangles overlap, ' +
      'which is the step that separates a renderer from a drawing of one.'
  }
};

/** The article for a project, or null if it has not been written yet. */
export function storyFor(id: string): ProjectStoryContent | null {
  return PROJECT_STORIES[id] ?? null;
}
