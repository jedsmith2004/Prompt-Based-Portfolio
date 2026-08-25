# v2 portfolio — A/B log

Every option put in front of Jack, his verdict verbatim, and what was decided.
Verbatim matters: paraphrasing a verdict is how a decision drifts.

Live benches: `/v2/backdrops` (keys 1-8, D palette, T type), `/v2/awards`
(keys 1-4, D palette), `/v2/skills` (keys 1-2) and `/v2/story`. `/v2/bench` is
the index of what is still open. `?bd=<name>` pins one world to every section of
`/v2`; `?bd=off` gives a clean read.

Anything marked **provisionally** was decided by me under Jack's 2026-08-25
instruction to figure most of it out myself. Every one of those is live, its
bench is still standing, and reversing it costs a sentence.

---

## AB-01 — Direction (4 up) · 2026-08-24 · **SYNTHESISED**

Four whole-site directions, prototyped as standalone pages.

| Option | Verdict |
|---|---|
| A | *"I like the vibe of A"* |
| B | *"I LOVE the latent field of B"* |
| C | *"I like the creative layout of C"* |
| D | *"I like the colours of D (but not the Japanese - I am not Japanese nor do I speak it)"* |

**Decision:** synthesise, not pick. D's palette, B's latent field as the ink
field, C's layout ideas, A's overall vibe. **No Japanese glyphs anywhere** —
standing constraint. Direction D's solver preserved at
`docs/reference/four-ways-in-prototype.html`.

## AB-02 — Companion form · 2026-08-24 · **DECIDED**

> *"A cute pixel art sparrow. The animations need to be smoother with a ton of
> idle animations, as well as idle hopping and moving about, about as equally as
> staying still."*

**Decision:** pixel sparrow. "About as equally" became a measured target —
locomotion reached 47.9% of idle time after the eligibility fix.

## AB-03 — Hero treatment · 2026-08-24 · **DECIDED**

> *"Full hero + scroll spine"*

## AB-04 — Backdrops, first pass (8 up) · 2026-08-24

| # | World | Verdict | Outcome |
|---|---|---|---|
| 1 | Ink wash | *"this effect doesn't work at all, go back and take inspiration from the 'Four Ways in' A/B test, the Japanese one was cool"* | reworked |
| 2 | Geometry | *"very very cool... the small circles fractal in the bottom right is cool but I don't like the fact it's static"* | partly addressed |
| 3 | Fluid | *"not working at all, they're not fluid and barely merge. This screen needs a whole rework"* | reworked to metaballs on an implicit surface |
| 4 | Watercolour | *"almost nothing on it at the beginning, it takes ages to paint on... I was more thinking of this work https://surya.website/rling-qwen-to-paint-with-code"* | reworked |
| 5 | Techno | *"very cool, the neural network could do with slowing down a significant amount and looking more like a neural network"* | slowed |
| 6 | Scrapbook | *"extremely cool... might be worth subtly highlighting the different counties around it"* | — |
| 7 | Topography | *"Love this a lot"* | **keep** |
| 8 | Celestial | *"Also like this a lot, although the compass seems slightly out of place"* | compass open |

## AB-05 — Backdrops, second pass (8 up) · 2026-08-25

| # | World | Verdict | Outcome |
|---|---|---|---|
| 1 | Ink wash | *"still kind of ugly, but closer"* | third pass needed |
| 2 | Geometry | *"very cool, it's just the smaller elements should perpetually animate"* | **open — asked twice now** |
| 3 | Fluid | *"you can't see anything, it is broken I think"* | **regression. Believe the client.** I twice reported Fluid working on instrumentation and twice blamed my own probes. The client has now independently said it is broken twice. Treat as broken. |
| 4 | Watercolour | *"This is beautiful. Maybe they should fade faster?"* | **approved**, fade faster |
| 5 | Techno | *"This is good, what page would we use it for?"* | proposed `models` |
| 6 | Scrapbook | *"I think this should be the main way we interact with the hitchhiking"* | **promoted from backdrop to interaction** — see P1-SCRAPBOOK |
| 7 | Topography | *"This is good, what page would we use it for?"* | proposed `practice` |
| 8 | Celestial | *"This is good, what page would we use it for?"* | proposed `contact` |

Also, twice: *"think about what we are putting on each page and where the text
is going. We should think about these integrations soon, before the two versions
diverge too much. Even if we have to get rid of the smaller elements for the
text, that's fine it just needs to know what text is going where."*

## AB-06 — Recognition treatments (4 up) · 2026-08-25

Three treatments of the same five awards, plus the career timeline.

| Option | Thesis | Verdict |
|---|---|---|
| Trophy Case | Five awards as five procedural 3D objects, hand-rolled rasterizer, inverted glyph ramp on paper | *"I love the trophy case, this is sort of the idea I had with my projects but we can think of something else for them. Dark mode doesn't work too well though."* |
| Reach | One log axis; the Snapchat lens draws an open-ended rule across the plate and dwarfs the rest; four of five awards have no recorded reach and are drawn as hollow rings rather than estimated | no verdict given |
| Clippings | Torn newsprint pinned to a wall, canvas draws material only, all words real DOM text | *"I like the clippings, hold this for something else maybe."* |
| Career line | Roles as concurrent bars on one time axis, degree as a band underneath | *"The career line is great, slightly off and we can add a lot too it but a nice touch, we can combine it with the trophy case."* |

**Decisions:**
- **Trophy Case → projects**, not awards. It becomes the projects treatment.
- **Clippings → held** for another use.
- **Career line → keep**, extend, and combine with the trophy case.
- Awards themselves now need a *different* treatment. Reach sits on `/v2/contact`
  as a placeholder until that is decided.
- **Trophy case dark mode is broken** and must be fixed in the port.

My note on Reach, unresolved: it has zero focusable elements, which I checked
before calling it a fault — it is a static plot with real `<ol>`/`<figure>`
semantics, so there is nothing to operate. Recording it because "0 focusable"
looks like a defect in any future audit and is not one.

## AB-07 — Narrative order (3 up) · 2026-08-25 · **DECIDED: option 2**

Bench at `/v2/story`, keys 1-3, C shows the order that ships today.

Prompted by: *"There is no clear story throughout, think about the layout and
what we are trying to say."*

**The diagnosis.** The six plates are ordered by subject, which is a filing
system, not an argument. And a second thing fell out of it: Recensorium came out
of stealth the same day, and it has **no plate at all** — the company he founded,
the platform he built solo, his current role, appearing only in the reel and the
projects index. All three candidates add one. That part is a correction, not a
choice.

| Option | Thesis | Cost |
|---|---|---|
| **1 The ladder** | Competence compounds: he has already built every layer beneath the one he works at | Road and climbing collapse into one closing plate and read as biography rather than evidence |
| **2 The constraint** *(my pick)* | Every good thing here came from a rule he imposed on himself | It is a conceit; if it is not caught in the first two plates it reads like the current order |
| **3 Lead with the company** | He founded a company and built the platform solo; everything else explains how | Peaks on plate one and descends — everything after is backstory |

**Verdict:** *"Lets go with story number 2"* — the constraint spine. Built and
live on `/v2`.

**One thing I had to correct while building it.** My bench version of option 2
had six plates and silently dropped `delivery` — the web studio, the London
contract, the hackSheffield win. That was a flaw in the option I wrote, not a
decision Jack made, so it is now seven plates with `delivery` at 04 under its
own constraint, **DO NOT LEAVE IT BROKEN**. Losing his work history is not a
narrative choice.

**Why I would take 2.** It is the only ordering where the hitchhiking, the
climbing and the judo are evidence rather than decoration. Every version of this
page has had the same weakness: the personal half reads as a hobbies section
bolted onto an engineering CV. The constraint spine makes *not booking the
ticket* the same move as *not importing the library*, and gives Recensorium its
sharpest framing, because that platform genuinely is defined by what an agent is
not allowed to do.

## AB-08 — Dithering onto the paper palette (5 up) · 2026-08-25 · **DECIDED: Atkinson** (see AB-10)

From the research pass. Rendered offline as a PNG strip rather than benched,
because the browser pane cannot composite.

| Option | Result |
|---|---|
| Flat posterise, 4 tones | Roughly what the polaroids do today. Hard banding, the form collapses into slabs. |
| Bayer 4x4 | Visible cross-hatch grid. Reads as a texture laid over the image rather than as tone. |
| Floyd-Steinberg | Smooth and faithful, form fully recovered, but the midtones go grey and muddy. |
| **Atkinson** *(my pick)* | Same four tones, visibly higher contrast. Clean paper on the lit side, darker shadow, form intact. |
| Atkinson 1-bit | Striking, very newsprint, too heavy for a polaroid on a paper page. |

Atkinson discards 25% of the diffused error rather than passing all of it on.
That is "wrong" and it is exactly why it suits a four-tone paper palette: the
discarded error is what stops highlights silting up into grey.

Implemented in `lib/v2/dither.ts`, shipped into the Polaroids. The InkWash
half turned into a different decision once it was built: see AB-10.

## AB-09 — The technologies (2 up) · 2026-08-25 · **LIVE as constellation, provisionally**

Bench at `/v2/skills`, keys 1-2.

Prompted by: *"The 100 technologies should be displayed in a more creative way,
like the current portfolio but even more creative if you can think of it."*

The live site's version is the thing to beat: a segmented cloud, frequency-sized
pills clustered per category, roughly seventy technologies with counts.

| Option | What it encodes | Verdict |
|---|---|---|
| **1 Constellation** *(my pick, now live)* | Magnitude = recency-weighted use, colour = era, **lines = used together**. Each project is a named constellation; shared technologies are where two cross. | — |
| 2 Ledger | Rank, count, year span, and a bar you can count the segments of. | — |

**Why 1.** The ledger is the more rigorous document and it is the wrong answer
to the question asked. A cloud encodes one number per technology and encodes it
loosely; the ledger encodes the same number precisely and is duller for it.
Neither can tell you that gRPC and Unity belong to the same piece of work. The
chart can, and that is a real fact about the work rather than a prettier way of
saying "he has used a lot of things".

## AB-10 — Where the dither goes · 2026-08-26 · **DECIDED: both, differently**

AB-08 chose Atkinson and named two intended targets. Building the second one
turned that into a split rather than a rollout, and the reason is worth keeping.

| Target | Quantiser | Why |
|---|---|---|
| Polaroids | **Atkinson**, error diffusion | Stills. Diffusion is the better quantiser and the crunch suits four tones. |
| InkWash | **Ordered, 8x8 Bayer** | It moves. |

**Error diffusion cannot be used on animated content.** The error propagates
from a different starting point every frame, so the whole pattern reorganises
between frames and the image boils. An ordered matrix is fixed in screen space,
so the grain sits still while the ink moves through it — which is also the
honest reading, since the grain belongs to the printing and not to the wash.

Note that AB-08 ranked Bayer *fourth of five* for a still, calling it "a texture
laid over the image rather than tone". Both readings are correct; they are
answers to different questions. The bench was a still.

**One number, measured rather than recalled.** The threshold has to be centred
on the matrix's true mean or bare paper speckles: 64 distinct values, mean
0.4921875. Centred at 0.46875, which is what I first wrote, the excursion is
+0.1719 against a first-level boundary of 0.16667, and one texel in sixty-four
of empty paper prints a dot.

## AB-11 — The case treatment · 2026-08-26 · **DECIDED: it is the projects one**

> *"I love the trophy case, this is sort of the idea I had with my projects but
> we can think of something else for them."*

**Decision:** the case renderer is generalised and now has two callers. The
awards keep theirs on the bench at `/v2/awards`; the projects get a fifteen
object case at the head of `/v2/projects`.

**The reel is not replaced by it, and that is deliberate.** They answer opposite
questions. The case says *what is all of it* and belongs on the index. The reel
says *what is this one* and belongs on the spine, where Jack specified it: one
object, large, arrows either side, neighbours faded and blurred.

**What fifteen needed that five did not:** a depth of field. Five objects on a
shallow ellipse is a case you can read. Fifteen measured as one continuous band
of dots with the selection lost inside it. Anything past 2.4 slots from the
front fades out over 1.3 more and is skipped outright. It is a no-op at five, so
the awards plate is unchanged.

## AB-12 — A name for the sparrow (7 up) · 2026-08-26 · **awaiting verdict**

> *"We need a name for this little guy."*

Not benched as code — it is a word. The rule I set was that it has to mean two
things at once: one about a small brown bird, one about the work. Anything that
only does the first is a pet name and anything that only does the second is a
variable.

| Name | Bird | Work |
|---|---|---|
| **Pip** *(my pick)* | A sparrow eats pips | A printed mark; the pips are a time signal; `pip` is the tool every Python engineer types daily |
| Crumb | What a sparrow lives on | Two bits — the real unit, between a bit and a nibble |
| Nibble | What a sparrow does | Four bits |
| Passer | *Passer domesticus*, the actual genus | A compiler pass |
| Nib | His beak is one | The site is ink on paper |
| Dunnock | The real English name of a hedge sparrow | Nothing, and nobody else has taken it |
| Chip | A sparrow's call, onomatopoeically | Silicon |

**Why Pip.** It is the smallest possible name for the smallest thing on the
page, and it is true four times rather than twice. The time-signal reading is
the one that decided it: the pips are a small regular interruption you come to
expect and would miss, which is exactly what he is meant to be. MotionGen's
backend is Python, so `pip` is not a generic engineering pun, it is a tool from
his own work.

**Runners-up, honestly.** Crumb and Nibble are better jokes and a shade too
pleased with themselves. Passer is the most accurate and the least sayable.
Dunnock is the most English and means nothing to anyone outside these islands.

---

## Open questions for Jack

1. **AB-12** — the name. Seven candidates above, `Pip` recommended.
2. **AB-06** — what treatment do the *awards* get, now that the case has moved
   to projects? `Reach` is holding the slot.
3. **Career line, "slightly off"** — best guess is the derived 2023-2026 degree
   span, the one inferred figure on the plate. Confirm what you saw.
4. **AB-05 #5, #7, #8** — Techno, Topography and Celestial are live on `models`,
   `practice`/`cv` and `contact`. Confirm or move.
5. **P2-VOCABULARY** — eight worlds, a companion, an ASCII wall, a neural
   playground, polaroids, a 3D reel, two cases, a route map and a constellation.
   Which of those are the vocabulary and which are noise? Not a code task, and
   probably the most valuable conversation left.
