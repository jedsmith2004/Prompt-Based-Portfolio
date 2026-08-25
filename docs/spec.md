# v2 portfolio — spec

The stable document. What the site is, what it is made of, and the rules that
do not change between rounds. Sequenced work lives in [plan.md](plan.md); what
actually happened lives in [devlog.md](devlog.md); every A/B and its verdict
lives in [ab-log.md](ab-log.md); techniques taken from award-winning work live
in [research.md](research.md).

---

## 1. Who it is for and what it has to do

Jack Smith, graduated 2026 with a first from Sheffield, now in Hemel Hempstead
and often working out of London. Looking for AI research, full-stack, or
"a role technical enough to be uncomfortable".

The brief, in his words: *the most creative, visually stunning website anyone
has ever seen* — while being **extremely performant, easy to use and navigate,
and extremely cool**. Those last three are not decoration on the ask. A site
that is stunning and sluggish has failed the brief, not half-passed it.

## 2. The thesis

**He builds from the metal up, and he goes to the edge.**

Everything on the page should be evidence for one of those two halves. He wrote
a software rasterizer before importing a renderer; he wrote the SVM before
importing sklearn; he built a peer-review platform for AI agents and founded the
company around it. And he hitchhiked Croatia to the Sahara, boulders in the Peak,
trains judo, plays guitar to Grade 8, is eighteen months into Arabic.

The corollary that governs the build: **the page demonstrates rather than
claims.** The backdrops are real simulations, the classifier is a real trained
network, the route is the real coordinates. Nothing is a picture of the thing.

> **Open question, raised by Jack 2026-08-25:** *"There is no clear story
> throughout, think about the layout and what we are trying to say."* The six
> sections below are ordered by subject, not by argument. Rework tracked as
> **P0-STORY** in the plan.

## 3. Structure

| # | id | Plate | Interactive piece | World |
|---|----|-------|-------------------|-------|
| — | `top` | Hero | InkField (gritstone ridgeline) | — |
| 01 | `from-scratch` | Write the pipeline, then import one | NeuralPlayground (real 784-64-10 MLP) | Geometry |
| 02 | `models` | Models that run on the machine in front of you | SkillsFromWork | Techno |
| 03 | `delivery` | Shipped, handed over, still running | HighlightReel + CareerLine | Fluid |
| 04 | `road` | Croatia to the Sahara, thumb out | RouteMap + Polaroids | Scrapbook |
| 05 | `practice` | Falling is part of the method | ClimbingWall (ASCII) | Topography |
| 07 | `cv` | Two pages, and a version that fits on one | CurriculumVitae | Topography |
| 08 | `contact` | Bring me the hard part | AwardsReach | Celestial |

Plus `/v2/projects` (15 projects, filters, chronological), and three benches:
`/v2/backdrops` (keys 1-8), `/v2/awards` (keys 1-4) and `/v2/story` (keys 1-3).

The CV plate is **07 / DO NOT PAD IT** and the close moved to 08. Eight plates.

## 4. The companion

A pixel sparrow, ~20x28 at PIXEL_SCALE 4, who lives on the page rather than on
the screen: he perches on real marked-up furniture (`data-perch`), hops between
it, and rides the page as it scrolls. Clicking him opens a chat about Jack.

He is a **puppet**, not a sprite sheet: parts (`shadow gear tail legBack body
legFront wing head hat eye beak`) each with a variant vocabulary, composited in
`DRAW_ORDER`. Keyframes interpolate positions and **snap** variant swaps.

- 55 perch surfaces, 5 chat perches, 11 transits, dozens of idles.
- **He needs a name.** Tracked as **P1-NAME**.

## 5. Design system

**Palette** (`app/v2/v2.css`). Paper `#E4DFD3`, ink `#17140F`, ink-2 `#443E34`,
ink-3 `#655C4F` (darkened from `#7C7364` for AA), ink-4 `#7C7364` decorative
only, vermilion `#B5402F` display-only, `--verm-text #9E3524` for small text,
blue `#2A4C7D`.

**Sprite palette** is 14 characters and is closed. Five prop-only hues were
added once and no more should be. A new effect reuses an existing hue or does
not ship — this is why the incantation's flames are the beak's three values and
its wisps are the meditation orbs' two.

**Type.** Bricolage Grotesque (display), Newsreader (reading), JetBrains Mono
(metadata).

**Non-negotiable floors.** WCAG AA on every text token against its real
background. 11.5px minimum text size. 0.14em maximum uppercase tracking. No
em-dashes anywhere in copy. Every canvas: `prefers-reduced-motion` draws one
correct static frame; pause on `document.hidden` and off-screen; DPR capped at 2.

**Backdrop contract** (`components/v2/backdrops/types.ts`): one canvas, five
palette colours handed in, never hardcode a colour, multiply final alpha by
`intensity`, visibility flag starts TRUE.

**Per-section palettes are live.** Seven, one per plate, in
`lib/v2/palettes.ts`. Every token is registered with `@property` as a `<color>`
so the browser interpolates it: a palette change is a 940ms move, not a cut.
The last plate (`contact`) is fully inverted, light on dark.

Every value is contrast-checked **by construction** — generated by a script
that nudges any failing token along its own ramp until it clears the bar, so a
palette cannot ship a token that fails. Verified live across all seven
palettes: zero failures over 370 text-bearing elements each, inverted plate
included.

## 6. Performance budget

- **At most two backdrop worlds mounted** — the live one plus the one fading
  out. Three of the eight own a WebGL context and browsers cap live contexts at
  roughly 8-16; six loops at once would also starve the ink field, the companion
  and the reel.
- Crossfade is CSS opacity, never a per-frame React render.
- `progress` is quantised to 25 steps per section.
- Frame loops allocate nothing.
- Release the GL context when a world is genuinely thrown away — never from
  inside a component, where React reuses the node and a lost context never
  returns.

## 7. Sources of truth

| Fact | Lives in |
|------|----------|
| Bio, awards, route, education | `public/context.json` |
| Projects | `lib/projects-data.ts` **on `origin/master`** |
| v2 copy, sections, worlds | `lib/v2/content.ts` |
| CV | `cv/cv.html` → headless Chrome → `public/CV Jack Smith.pdf` |

**The working tree is behind `origin/master`.** It was 7 commits behind on
2026-08-25, including `feat: launch Recensorium`. Every factual error made about
Jack on this project traces to reading the working tree as current. Check
`git log --oneline HEAD..origin/master` and read with
`git show origin/master:<path>`. Do not pull — v2 is a large untracked set.

**Recensorium is launched and is not stealth.** It is the flagship: peer review
for AI-generated research, agents publishing and reviewing over REST and a
remote MCP server, never choosing what they review or who reviews them. Jack
founded the company and built it solo — five-app monorepo, ~139k lines, 95
migrations, live at recensorium.com. Any redaction bar or "Coming soon" framing
left anywhere is a bug.

## 8. What this environment can and cannot verify

**One root cause explains nearly all of it: `document.hidden === true`.** The
Browser pane reports the document as hidden and unfocused
(`visibilityState: "hidden"`, `document.hasFocus() === false`). Everything below
follows from that single fact, and it is worth knowing up front rather than
rediscovering one symptom at a time, which is what happened here:

- **rAF does not run**, so nothing animates and nothing repaints.
- **CSS transitions never advance**, so `getComputedStyle` returns the frozen
  mid-flight value forever.
- **Scrolling is a no-op**, so anything keyed to scroll position cannot fire.
- **Screenshots fail** — there are no composited frames to capture.
- **Any code path that correctly stands down when the tab is hidden cannot be
  exercised at all.** The companion's cursor swap is the clearest case: it
  deliberately returns the real pointer whenever `document.hidden`, so
  `cursorWanted()` is always false here and the whole swap is untestable in this
  pane. That is the feature working, not failing.

Trustworthy: `tsc`, `next build`, DOM and text, computed styles and contrast,
canvas-2D readback, console errors, dev handles (`__inkfield`, `__bird`,
`__reel`).

Not available: screenshots (the Browser pane does not composite), **page
scrolling via script** (scroll is a no-op, so anything driven by scroll position
— `useSpine`'s active section, the world crossfade — cannot be exercised here),
WebGL pixel readback after compositing, and canvas layout in a zero-size pane.
Cycling WebGL components exhausts the context pool.

**Write the contrast probe correctly, or it will invent failures.** Three
separate audit bugs have now produced phantom results on this project, and each
one cost more than the bugs it was looking for. A probe must:

1. **Disable transitions first** (see below).
2. **Parse `color(srgb r g b / a)` as well as `rgb()`.** `color-mix()` computes
   to the `color()` form with channels in **0..1**, not 0..255. Reading those as
   bytes makes every translucent surface look near-black: it reported the nav
   rail's mark at 1.14:1 when it is 13.81:1, and produced nine phantom failures
   in every palette at once.
3. **Composite translucent backgrounds** down to the body rather than taking the
   first non-transparent layer at face value.

A failure that appears identically in every palette or every state is almost
always the probe, not the page. Check that before reporting it.

**Disable CSS transitions before any contrast or computed-style audit.** Because
the pane never composites, a transition never advances: `getComputedStyle`
returns the frozen mid-flight value indefinitely, so an element reads as
half-way between its old and new colour forever. This produced two invented
contrast failures on `/v2/story` — a tab reading dark-on-dark at 2.8:1 and
another light-on-light at 1.1:1, neither of which existed. Inject
`*{transition:none!important;animation:none!important}` first, then sweep. Any
audit run without that guard is suspect, including earlier ones.

**The rule this produces: verify correctness here, verify appearance with Jack.**
Offline harnesses that import the real modules and render to PNG are the way to
see pixel art without the pane — that is how the hood, the flames and the dream
subjects were judged.

## 9. Housekeeping that has bitten

- Never `rm -rf .next` or run `next build` under a live dev server. It has
  broken the site twice: the dev server chases chunk hashes the build replaced.
  Kill Next processes surgically first.
- Sweep stray routes under `app/` before deploy. Agents have left several, and
  one of them broke project-wide `tsc`.
