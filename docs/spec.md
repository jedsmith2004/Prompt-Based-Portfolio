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
trains judo, plays guitar to Grade 8, is 677 days into Arabic and counting.

The corollary that governs the build: **the page demonstrates rather than
claims.** The backdrops are real simulations, the classifier is a real trained
network, the route is the real coordinates. Nothing is a picture of the thing.

> **Raised by Jack 2026-08-25:** *"There is no clear story throughout, think
> about the layout and what we are trying to say."* Resolved as **P0-STORY**:
> the eight plates below are ordered as an argument, not as a subject index,
> and each eyebrow is the instruction the plate is evidence for.

## 3. Structure

| # | id | Plate | Interactive piece | World | Settles | Via |
|---|----|-------|-------------------|-------|---------|-----|
| — | `top` | Hero | InkField (gritstone ridgeline) | **none** | light | — |
| 01 | `from-scratch` | Write the pipeline, then import one | NeuralPlayground (real 784-64-10 MLP) | Geometry | **dark** | switch |
| 02 | `models` | Nothing leaves the machine | SkillConstellation (3D) | Techno | dark | — |
| 03 | `recensorium` | An agent never picks what it reviews | HighlightReel (halftone) | Watercolour | **light** | switch |
| 04 | `delivery` | Shipped, handed over, still running | CareerLine | **Braid** | light | — |
| 05 | `road` | Croatia to the Sahara, thumb out | RouteMap + Polaroids | Scrapbook | light | — |
| 06 | `practice` | Falling is part of the method | ClimbingWall | Topography | **dark** | dial |
| 07 | `cv` | Two pages, and a version that fits on one | CurriculumVitae + AwardsClippings | Ink wash | dark | — |
| 08 | `contact` | Bring me the hard part | none | Celestial | dark | — |

**Nine palettes, eight worlds, no world used twice.** `top` deliberately has no
world at all: the hero is the one place the ink field is the subject, and per
Jack, *"the mathematics one should be removed from the hero page but put on the
first page, these need to be separate."* Geometry sits on 01 and the hero stands
alone.

**Particles are on `top` and `contact` only.** *"I like the particles but I don't
think we should have them on every page, I think the hero and the contact page
only."* On the middle seven the field was a full-viewport particle simulation
running underneath the world that was supposed to be the subject, so the page
was paying twice to be harder to read.

**World intensities are 0.82-0.95**, up from roughly half that, and that is a
direct consequence of the line above: with the field gone there is room for the
world to be the subject rather than a texture behind one.

Plus `/v2/projects` — a fifteen-object **ProjectCase** over the filtered
chronological index — and four benches: `/v2/backdrops` (keys 1-8), `/v2/awards`
(keys 1-4), `/v2/skills` (keys 1-2) and `/v2/story` (keys 1-3), indexed at
`/v2/bench`.

**The case and the reel are not the same treatment twice.** The case answers
*what is all of it* and belongs on the index; the reel answers *what is this
one* and belongs on the spine. Same pipeline, same grain, opposite questions.

Plate titles are **kinetic**: word by word, 55ms apart, from behind the line.

The CV plate is **07 / DO NOT PAD IT** and the close is 08. Eight plates and a
hero.

### The light run

The site starts light, goes dark at 01, comes back at 03, and goes dark again at
06 for the rest of the page. Two of the three changes are **events with a device
attached**, and which device is not arbitrary: 01 and 03 are plates about
building things at a desk, so they get a switch on a wall; 06 is the plate about
being outside on rock, so it gets the sun going down. **Indoors you flip a
switch, outdoors you wait.** The other changes ride the ordinary 940ms palette
move.

`useMode` owns the run. A device is handed the wind-up, reports back, and the
palette commits when the device says so — not on a timer. It abandons the event
if the reader turns around mid-flight, commits immediately under reduced motion
or on a hidden tab, and carries a 5.2s watchdog, because a page stuck in the
form it does not settle in is worse than a hard cut.

## 4. The companion

A pixel sparrow, ~20x28 at PIXEL_SCALE 4, who lives on the page rather than on
the screen: he perches on real marked-up furniture (`data-perch`), hops between
it, and rides the page as it scrolls. Clicking him opens a chat about Jack.

He is a **puppet**, not a sprite sheet: parts (`shadow gear tail legBack body
legFront wing head hat eye beak`) each with a variant vocabulary, composited in
`DRAW_ORDER`. Keyframes interpolate positions and **snap** variant swaps.

- 55 perch surfaces, 5 chat perches, 11 transits, dozens of idles.
- **His name is Pip**, decided by Jack on 2026-08-26 (AB-12). The sound a
  sparrow makes, the seed a thing grows from, and the way every dependency on
  this machine arrives. He is not introduced anywhere on the page yet.

**Errands.** The page can ask him to go and stand on something: it names a
selector and is told when he is on it, and that is the entire contract. The
light switch is the only caller so far. Three of his own drives are gated while
an errand runs, because the cord hangs from the top edge and the top edge is the
worst place he can stand by every measure the comfort band uses — ungated, he
touched the cord and left inside a tenth of a second. Every errand has a
deadline and every caller has to survive him not coming.

**A thing he is sent to stand on must be a legal perch, and `PERCH_MIN_W` is
56px.** The light switch shipped with a 54px grip and the bird was never once
asked to go to it, on any load, for the life of the feature — `measureEdge`
refused it, the errand failed on the first frame, and the cord pulled itself on
time. **A fallback designed to be indistinguishable from success needs a way to
say it was used**, so `serviceErrand` now warns with the reason, and
`__bird.whyNot(el)` answers the question directly.

**Letting go is a fall, and a fall has to clear what it is leaving.** A landing
is a crossing test, so a bird released while standing exactly on a perch re-lands
on it in the first substep; `FALL_CLEARANCE` starts the drop 2px below. Ending an
errand releases the *perch*, not just the errand, and also abandons a flight
still heading for it.

**A HOP THAT CANNOT REACH ITS TARGET IS FLOWN, NOT LAUNCHED.** `launchTo`
clamps the arc's rise (`HOP_REACH`: 420px hurrying, 620 otherwise), so a leg
asked for a taller climb than that has its apex *below* its own target. It does
not arrive slowly, it does not arrive at all. That single fact was the light
switch going off without him and most of the times he left down the bottom of
the screen after a wall kick, because a wall kick splits a climb 28/72 and a 72
that is still too tall is a leap into nothing. The reach is asked before the
launch, and an unreachable leg becomes a flight to the end of the plan.

**A DEVICE IS FOR WHAT A JUMP CANNOT DO.** An errand whose climb is taller than
a whole chain (`CHAIN_REACH`, the binding 72 leg) is flown with the jetpack or
the balloon — animations he already owns off the transit table, already carrying
their own furniture. Which one is decided by the clock, not by a coin: the
balloon only comes out when it can still make the deadline. He is a bird; he
jumps wherever jumping works.

**A FALL ASKS THE LANDING QUESTION ONE FRAME EARLY.** The off-screen net sits
200px past the bottom edge, which is 200px after the reader has watched him go.
It stays, but if nothing in his corridor is both below him and still on the
screen, the drop has no ending and he glides toward something that has.

**SET PIECES ARE TIMELINES, NOT SCRIPTS.** The lawn (`pvz`) is a script of *his*
animations that the rig walks, which works only while he is the only actor. A
**bit** — creeper, Back to the Future, and the three seasonal ones — is a
timeline: `t` in ms from the start, every phase an absolute time on it, running
*outside* the mode switch. `holds` says whether it owns the bird, so an
interrupt hands him back on that frame and the actors see themselves out.
Seasons are **weighted** by the calendar, not gated by it; `SEASON_PREVIEW`
keeps all three in the hat all year and is one line to turn off.

**A STILLNESS GATE IS NOT ONE MEASURE, AND USING THE WRONG ONE SHIPS NOTHING.**
`bird.settledMs` counts *reader* stillness: it is zeroed by a scroll **or by any
pointer movement in a 2.6s window**, so a reader with a hand on the mouse never
accumulates any of it. That is correct for the lawn, a minute-long performance
you should not walk in on. For anything a reader is meant to *see*, it is a gate
they cannot satisfy, and an easter egg nobody can trigger has not shipped. The
set pieces use `bird.calmMs`: *page* quiet only, accumulated outside the mode
switch, and **burned** by a scroll at 3x rather than reset, because one nudge of
a trackpad should not cost the whole wait.

**A RARE THING MUST NOT REPEAT ITSELF.** The last set piece played is dropped
from the hat while there is anything else in it. Two of the same in a row makes
a set of five read as a set of one, which is worse than either being rarer.

**EVERY PROP NEEDS A K OUTLINE ROUND A MID-TONE INTERIOR.** The plates flip
light and dark under him, so anything authored bright-on-nothing — a white
blast, a white bolt, a white flake, an ink-black note — is invisible on exactly
half the site. This is why the puppet has always been drawn this way. Bright
things keep bright interiors; they still need a silhouette.

**NOTHING IS DRAWN THROUGH A ROTATION MATRIX.** A pixel bitmap through a real
rotation stops being pixel art on the first frame that is not square. Things
that turn (the totem) are squashed toward their own centre line and let through
zero, which shows the far side.

**He is drawn on TWO canvases, and the split is the whole point.**

1. A **band in document flow**, roughly 560px tall, translated in DOCUMENT
   coordinates to follow him. The compositor scrolls it, so the draw call never
   reads `scrollY` and he cannot lag behind the page. Everything attached to him
   lives here: the puppet, its props, and the speech bubble.
2. The original **fixed viewport canvas**, which now carries only the chat
   window, the drawn cursor, and the rope during a `downRope` transit. All three
   are genuinely screen-anchored.

The band is clamped so its bottom edge can never pass the document's, because an
absolutely positioned box that hung off the end would grow the scroll height,
which would let him go lower, which would grow it again.

**An ability fires when he is OFF THE SCREEN, and for no other reason** — 60px
past the edge for 260ms. Inside the edge fifths he hops back toward the middle
60% one perch at a time. Nothing reads scroll speed to decide this.

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

**Per-plate palettes are live, and every plate is authored TWICE.**
`lib/v2/palettes.ts` holds nine `Plate`s, each carrying a full `light` and a
full `dark` `SectionPalette`, the `mode` it settles in, and the `via` device
that gets it there. This is not a theme toggle: for the length of a wind-up the
page is deliberately rendering a plate in the form it does *not* settle in,
which is the only way the switch and the dial can be events rather than fades.

Every token is registered with `@property` as a `<color>` so the browser
interpolates it: a palette change is a 940ms move, not a cut.

**The rules are palette tokens, not constants.** `--rule`, `--rule-firm` and
`--rule-hard` were fixed `rgba()` on `:root`, built once from the light ink and
never part of the system — 47 uses, including the 2px line under every plate
eyebrow. Five of the nine plates settle dark, and all five drew that line in
near-black on near-black. Anything that is a line rather than text belongs in
the palette for the same reason the text does.

Every value is contrast-checked **by construction** — generated by a script
that nudges any failing token along its own ramp until it clears the bar, so a
palette cannot ship a token that fails. Verified live: **zero failures across
nine plates in both forms**, 387 text-bearing elements each.

**There is exactly one colour parser: `lib/v2/colour.ts`.** It accepts every
form the platform can hand back — `#rgb`, `#rrggbb`, `rgb()`, `rgba()` and
`color(srgb r g b / a)` — and it returns `null` on failure rather than a colour,
so a caller has to decide what to do about it. This exists because three
components each carried a private hex reader that fell back to near-black, and
the tokens stopped being hex the day the palette was registered with
`@property`: a registered custom property has a **computed** value, so
`getComputedStyle(root).getPropertyValue('--verm')` returns `rgb(181, 64, 47)`.
Every accent on three plates silently became ink and stayed that way until Jack
said so. **A `replace('#', '')` in a component is a regression of this.**

## 6. Performance budget

- **At most two backdrop worlds mounted** — the live one plus the one fading
  out. Browsers cap live WebGL contexts at roughly 8-16, and six loops at once
  would also starve the ink field, the companion and the reel.
- **The handover is sequential, not simultaneous.** Out fast, a beat of clear
  paper, then in — 340ms each way. A simultaneous crossfade spends its whole
  duration showing an average of two dense generative worlds, which is a third
  image nobody designed; going sequential also halves the window in which two
  full-viewport loops are both running.
- **Nothing reads a layout-dependent property per frame.** `scrollHeight` and
  `getBoundingClientRect()` both force the browser to flush pending style and
  layout before they can answer. That is nearly free on a static page and it is
  not free here, because the palette transition dirties style across the whole
  tree for 940ms after every plate change — so the cost landed precisely while
  the reader was scrolling between sections, which is exactly when it would be
  felt. Both are observed with a `ResizeObserver` now instead of polled.
- **`InkField` parks its loop rather than unmounting** when a plate does not
  want particles, and parks it *after* the fade rather than during it, so the
  last thing on screen is a field dispersing and not a still frame dissolving.
- **One backdrop still owns a GL context**, down from three: InkWash. `InkField`
  owns the other. Fluid was moved to CPU after its GL path was found to fail
  silently, and has since been retired entirely — Braid stands on `delivery` in
  its place and is canvas-2D. See section 8, and P2-FALLBACK in the plan.
- The reel and both cases **stop their loops at rest**, and the case gates to
  30fps. Objects past the case's depth of field are skipped, not drawn faint.
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

**The working tree WAS 7 commits behind `origin/master`** — including
`feat: launch Recensorium` — and every factual error made about Jack on this
project traces to reading it as current. Fast-forwarded on 2026-08-26 before the
first commit, so the branch `v2-rebuild` now descends from `origin/master`.

The rule still stands, because the gap will open again: check
`git log --oneline HEAD..origin/master` before quoting any fact about Jack, and
read with `git show origin/master:<path>`. A rule applied only to the files you
happen to think of is not a rule — that is how the wrong CV shipped.

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
canvas-2D readback, console errors, dev handles.

Not available: screenshots (the Browser pane does not composite), **page
scrolling via script** (scroll is a no-op, so anything driven by scroll position
— `useSpine`'s active section, the world crossfade — cannot be exercised here),
WebGL pixel readback after compositing, and canvas layout in a zero-size pane.
Cycling WebGL components exhausts the context pool.

### The two tools that make this workable

**`public/_proto/probe.js`** — gitignored, loaded with a script tag. It prints a
canvas AS TEXT, aspect-corrected, with an optional contrast stretch. Since
screenshots time out, this is the only way to LOOK at anything drawn here, and
it is how the ballot box, the project case and the aimed peck were judged. It
also carries the contrast helper (which parses `color()` correctly), an ink /
bbox / histogram measurement, and `P.reveal()`.

It refuses to read a WebGL canvas rather than guessing at one. A canvas holding
a GL context returns `null` from `getContext('2d')`, and reading a GL canvas
back after compositing returns garbage anyway.

**A dev handle on every canvas.** `__bird`, `__reel`, `__case`, `__inkfield`,
and `__world.frames(n)` on all eight backdrops. On `__bird`, the perch system
specifically: `perchOf(el)`, `whyNot(el)`, `errand()`, `seat(p)`, `measure()`.
Everything that harvests furniture runs behind a rAF, so without these the whole
perch system was unreachable from here and a `data-perch` element that could not
be stood on was indistinguishable from one that could — which is exactly how the
light switch shipped with a grip two pixels under the floor. Without one there is no way to
drive a single frame in a pane that never fires rAF — which is exactly how the
Fluid world came to be shipped completely invisible, for days, with nobody able
to tell that apart from it working.

**A world that draws nothing and a world that draws correctly are identical from
here**, so every new world is read back as text off its own canvas before it is
called done. Braid, the constellation sphere, the reel's halftone and the route
map's coastline each were.

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

**Call `P.freeze()` before any contrast or computed-style audit.** Because the
pane never composites, a transition **never advances**: `getComputedStyle`
returns the frozen mid-flight value indefinitely, so an element reads as
half-way between its old and new colour forever, and removing the class that
armed the transition does not cancel one already in flight. This produced two
invented failures on `/v2/story`, and then **135 more** across every dark form,
all of them `--ink-3` reading as the previous plate's value while the inline
style on `<html>` plainly said otherwise — which is not something CSS can do.
There were no failures. There was one stuck transition.

`P.freeze()` injects `*{transition:none!important;animation:none!important}` and
is now the first line of any audit that reads a colour. Any audit run without it
is suspect, including earlier ones.

**Three instruments in three days: the `color(srgb)` byte read, the
`display:none` ancestor, and the stuck transition. The pattern is not that the
code was broken. The pattern is that the instrument was wrong and the instrument
was believed.** A failure that appears identically in every palette or every
state is the probe. Check that before reporting it.

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
