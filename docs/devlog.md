# v2 portfolio — development log

Newest first. What was built, what broke, and what turned out not to be true.
Corrections are kept rather than edited away: most of the expensive mistakes on
this project were repeats, and a log that quietly fixes itself cannot show that.

See also: [spec.md](spec.md) · [plan.md](plan.md) · [ab-log.md](ab-log.md) · [research.md](research.md)

---

## 2026-08-26 (latest) — the plate-by-plate pass

Jack read the whole site and came back with a global note and eight numbered
ones. The global note is the important one:

> *"This is good but extremely busy, most of the time I can't tell what's going
> on. I think there was a bit of a miscommunication: when I said each page
> should have a different style I didn't mean it's the same with a different
> backdrop, I meant a fully different style. The backdrops should be prominent
> and the centrepiece, with everything working around them."*

He is describing a real structural fact, not a taste. Every plate was: the ink
field, plus a world, plus the type, plus an interactive figure — four layers,
always, and two of them full-viewport canvases fighting each other. And two of
the eight plates were running **literally the same world**.

### The single largest finding: one colour parser, three plates, black instead of orange

Two of his notes were the same bug, and it was not a colour choice.

> *"The orange highlight is no longer orange, it's black."*
> *"Where have the colours gone from it?"*

`RouteMap`, `NeuralPlayground` and `ClimbingWall` each carried a private helper
of this shape:

```js
const h = hex.trim().replace('#', '');
const n = parseInt(h.slice(0, 6), 16);
if (!Number.isFinite(n)) return `rgba(23,20,15,${alpha})`;   // <- ink
```

Correct for `#B5402F`. Catastrophic for anything else, because the fallback is
near-black. And the tokens **stopped being `#B5402F`** the day the palette was
registered with `@property`: a registered custom property has a *computed*
value, so `getComputedStyle(root).getPropertyValue('--verm')` hands back
`rgb(181, 64, 47)`. `parseInt('rgb(18', 16)` is NaN, the guard fires, and every
accent on those three plates silently became ink.

Verified in the live page rather than reasoned about — the token really does
come back as `rgb(181, 64, 47)`, and the old parser really does turn it into
`rgba(23,20,15,1)`.

Nothing threw. Nothing logged. Three plates lost their accent and stayed that
way until Jack said so. **That is the Fluid failure mode again**, and it is the
third time this project has been bitten by colour parsing — after the probe's
`color(srgb …)` byte read, and then the *same trap re-introduced* an hour later
in a different probe function. There is now exactly one parser, `lib/v2/colour.ts`,
and any `replace('#', '')` in a component is a regression of this.

### Busy, and laggy, and both were the same layer

**Particles on two plates only**, per *"I think the hero and the contact page
only."* On the middle seven the field was a 512² particle simulation running
underneath the world that was supposed to be the subject, so the page was paying
twice to be harder to read. `InkField` parks its loop rather than unmounting,
and parks it *after* the fade rather than during it, so the last thing you see
is a field dispersing and not a still frame dissolving.

**Two forced layouts per frame, removed.** `useSpine` read
`document.documentElement.scrollHeight` and `SectionBackdrops` read
`getBoundingClientRect()` on every single frame. Both are layout-dependent:
reading them makes the browser flush pending style and layout before it can
answer. Normally that is nearly free, because nothing has invalidated layout
since the last flush. On **this** page it is not, because the palette transition
dirties style across the whole tree for 940ms after every plate change — so the
cost landed precisely while the reader was scrolling between sections, which is
exactly when it would be noticed. Both are observed now instead of polled.

I checked the four backdrops that looked like they rendered at raw device pixel
ratio before touching anything. They were all already capped at 2. Worth
recording: that was a plausible diagnosis that would have produced a confident,
useless commit.

### The light run, and two devices

Jack gave a mode per plate for six of the nine and asked for the *change* to be
an event rather than a fade: the bird flying up to pull a light switch, and over
the climbing plate a sun dipping under the horizon on the right while a moon
comes up on the left.

`palettes.ts` now authors every plate **twice**, light and dark, and each
declares which form it settles in. That is not a theme toggle, and it is the
thing the devices need in order to exist: for the length of the wind-up the page
is deliberately rendering plate 01 in the light form it does not settle in.

Which device fires where is not arbitrary. The first two changes are on plates
about building things at a desk, so they get a switch on a wall. The third is on
the plate about being outside on rock, so it gets the sun going down. **Indoors
you flip a switch; outdoors you wait.**

The switch drops a rose out of the top edge, the bird flies up and lands on the
grip, and his weight takes the cord down. He is released at the bottom of the
stroke so he *falls* as it recoils, which is what pulling a cord looks like and
costs nothing — letting go of a perch is the most ordinary thing the engine
knows. If he cannot come, it pulls itself after 2.4s: a light switch that only
works when a bird is available is a light switch that leaves the page the wrong
colour.

The `Companion` learned **errands** for this. The page names a thing to stand on
and gets told when he is on it; that is the whole contract. Three drives had to
be gated while one runs, because the cord hangs from the **top edge** and the
top edge is the worst place he can stand by every measure the comfort band uses.
Without the gates he touched the cord and left inside a tenth of a second.

### The three rules were the broken dark mode

> *"The dark mode here is broken."*

One token doing it forty-seven times. `--rule`, `--rule-firm` and `--rule-hard`
were fixed `rgba()` values on `:root`, built once from the light palette's ink,
and never part of the palette system at all. `--rule-hard` is the 2px line under
every plate eyebrow on the site. At 86% of near-black on near-black paper that
is not a faint line, it is **no line**: five of the nine plates now settle dark
and all five would have lost the rule the whole editorial grid is built on.

### Eight plates, eight worlds

`cv` and `practice` were both running Topography. Two of the eight plates were
literally the same page with the same backdrop, which is the thing he was
describing. `cv` takes the ink wash, which had no home.

**Braid replaces the metaballs** on the career plate. *"The meta balls look
awful."* He is right, and the honest post-mortem is that Fluid was the wrong
*idea* rather than a botched execution: a good demo of an implicit surface that
said nothing about the plate it stood behind. That plate is four roles and a
degree that overlap instead of queueing, so it gets strands that cross, pass over
and under, and never merge.

The weave is a **painter's sort one column wide**. Drawing strand A then strand B
gives crossing lines, not a braid; a braid needs each strand in front at some
crossings and behind at others. Solving that with paths means finding every
intersection and sorting the fragments. Rasterising in columns makes it fall out
for free *and exactly*, with no intersection ever computed.

**The handover is sequential now.** It was a 620ms simultaneous crossfade, which
means that for a third of a second the reader was looking at two dense
generative worlds averaged together — a mixture nobody designed. Out fast, a
beat of clear paper, then in. It also halves the window where two full-viewport
loops are both running.

### Plate by plate

**01, the neural net.** The wires were at 0.05–0.15 alpha at rest. Resting is the
state almost everyone sees, and a reader who never draws a digit was never
learning there was a network there. Plus the parser bug above.

**02, the constellation → a sphere.** Not decoration: on a plane, a technology
shared by two projects on *opposite* sides has nowhere to sit — the vector sum
cancels and it lands in the middle with every other cancelled star, in a pile. On
a sphere there is no opposite side to be caught between. Projects sit on a
Fibonacci lattice, because N directions taken round a circle are a plane, and a
plane on a sphere is a belt. Turning it is then the only way to read it. The
project list is a perpetual rail of title cards; the idle cycle lights a card and
its constellation together and only picks from cards actually on screen, because
lighting one that has scrolled off flares the globe with nothing to connect it to.

**03, the reel.** The neighbours were there and invisible for three separate
reasons at once: `left: -13%` inside an `overflow: hidden` stage so a quarter of
each was cut off by the box, 30% opacity, and a 2.5px blur. ASCII out, **halftone**
in — the glyph ramp rendered into a 7×13 *character* cell, so the model had to be
pre-squashed by the cell aspect and every silhouette landed on a grid whose two
axes disagreed. Square cells now, dot **area** carries tone, so the radius goes as
`sqrt(coverage)`: half the radius is a quarter of the ink, and a linear radius
sags every midtone.

The Bayer centre is 0.4921875, **computed rather than remembered**. Writing
0.46875 from memory is exactly what happened in the ink wash a day earlier.

**04, the career line.** UCD closed in 2025 and was drawn running to present —
a studio that closed, drawn as a studio still taking clients, is a false claim
about what he is doing now. Recensorium is on the plate. The lede counts the
roles from the array rather than saying "three", which adding a fourth would
have made false.

**05, the map.** Country lines, from the same Natural Earth data the old
component shipped d3-geo and topojson to the browser for — but extracted and
simplified at *build* time, so 34 rings of plain `[lon, lat]` reach the page and
no map library does. Two bugs found by looking rather than reasoning: RDP
collapsed every ring to two points (it measures against the chord from first to
last, and on a closed ring those are the same point, so the chord has zero
length and the distance formula degenerates to a constant), and then every
longitude squashed toward zero because `fit.x` applies the degree conversion
itself and I handed it radians.

Photographs are his pick — days 3, 7, 18, 21, 24, 25 — and the reason is
mechanical as well as aesthetic: the snap **isolates a subject**, so a frame with
nobody in it has nothing to isolate and the effect looks broken. Days 1, 9 and 17
were a terminal, an empty ridgeline and an empty street.

**06, the climbing wall.** The cell was 8×16, so on a 420px plate the figure was
four rows out of twenty-six: sixty pixels of climber built from ten-pixel glyphs
on a wall textured at eleven percent. 11×21 on a 520px plate at 600 weight, and
the tone table moves the wall down and everything on it up. *Hard to see* is a
statement about the gap between a subject and its background, not about the
subject.

677 days of Arabic, and counting.

**07, the CV.** Links at the top, read from `CV_EDITIONS` so the two places the
CV is offered cannot disagree about how many there are. The plate gets the
awards clippings — see below.

**08, contact.** The Reach chart is gone.

### The one place I went past what he said

*"I don't like the react section, remove it."* I read that as the **Reach**
chart on the closing plate. Deleting it outright takes the only awards on the
site with it, including a lens a million strangers used — and plate 07 is the
one he called boring. So the awards moved there as clippings rather than being
cut. It is on `/v2/bench` rather than buried in a commit, because a decision made
on someone's behalf should be easy to find and cheap to reverse.

### The measurement that lied, again

The first run of the dark-mode contrast audit reported **135 failures at 2.83:1**
across every dark form. Every one traced to `--ink-3` reading as the base
sheet's colour while the inline style on `<html>` plainly said otherwise — which
is not something CSS can do.

It was a **CSS transition in flight**. The pane has no viewport, so nothing
composites, so a running transition never advances and `getComputedStyle` keeps
handing back the colour it started from, forever. Removing the class that armed
it does not cancel one already going.

There were no failures. There was one stuck transition. `P.freeze()` exists now
and is the first line of any audit that reads a colour.

That is three instruments in three days: the `color(srgb)` byte read, the
`display:none` ancestor, and now this. The pattern is not that the code was
broken. **The pattern is that the instrument was wrong and the instrument was
believed.**

### Verified

`next build` passes: 13 routes, all static, `/v2` at 80.3 kB / 228 kB first
load. `tsc --noEmit` clean. ESLint clean except two pre-existing
`no-img-element` warnings in Polaroids. Zero contrast failures across `/v2` at
**nine plates × two forms × 387 elements**, and across `/v2/projects` (310),
`/v2/bench` (54), `/v2/awards` (41), `/v2/skills` (68), `/v2/story` (51) and
`/v2/backdrops` (27) in both forms. No horizontal overflow anywhere.

Braid, the constellation sphere, the reel's halftone and the route's coastline
were each read back as text off their own canvas, because on this project a
world that draws nothing and a world that draws correctly look identical from
here.

**Not verifiable in this environment, and it is the half that matters:** whether
the light switch reads as the bird pulling it, whether the dial is snappy enough,
whether the worlds now feel like the centrepiece rather than louder wallpaper,
and whether the page still feels laggy. Scroll is a no-op here and the pane never
composites.

---

## 2026-08-26 — the overnight pass

Jack: *"Branch and commit. Then finish off everything on your list, iterate, and
verify... There is a LOT that needs improving, try and figure most of it out
yourself."* Then three corrections mid-session and a goodnight.

### First, the thing that should have happened a week ago

Branched and committed. `master` was **seven commits behind `origin/master`**,
and the working tree had origin's `cv.html`, `projects-data.ts` and CV PDFs
copied across by hand — so the first move was to fast-forward and re-apply the
two edits that were genuinely mine, rather than commit a snapshot that looked
like I had authored Jack's changes. `origin/master`'s `.gitignore` also carries
`.claude/`, which is why that directory is untracked and stays that way.

Then five commits on `v2-rebuild`, and everything after this on its own.

### P1-SCROLL: the bird stops lagging. Reported three times.

Not staleness — **compositing order**. The browser scrolls on the compositor
thread without waiting for the main thread, so a rAF callback reading
`window.scrollY` gets the last *committed* offset. Drawing at `bird.y - scrollY`
puts him at a position derived from an older scroll offset every single frame.
No amount of reading scroll "more freshly" fixes a main thread that is
structurally behind.

The sprite is now painted on a strip of canvas **in normal document flow**,
moved with `translate3d` in DOCUMENT coordinates. The compositor scrolls it for
free and the draw call never reads `scrollY` at all. While he is perched the
transform is a constant, which is what "stays where it is on the page" means.

The band is clamped so it can never hang off the end of the document — an
absolutely positioned box that did would grow the scroll height, which would let
him go lower, which would grow it again. **Measured 0px added at every position
from the top of the page to the last pixel.** The chat window and the drawn
cursor stay on the fixed canvas, both being genuinely screen-anchored.

Not verifiable here: whether it FEELS fixed. Scrolling is a no-op in the pane.

### Jack's correction, mid-session, on what a "fast scroll" meant

> *"when I meant fast scroll before I meant when you scroll fast enough that he
> goes off the screen and can't jump down in time. In those edge regions (top
> and bottom 20% maybe), he wants to jump down into the middle 60%, bit by bit,
> but if you scroll too far and he goes off the screen, he uses one of his
> 'abilities' (rope, ufo, etc.) to catch up to you and come back."*

Both old triggers were speed-based, so a firm flick launched a parachute while
he was sitting comfortably mid-screen — the abilities read as a reaction to the
WHEEL rather than to his own position. There is one trigger now and it is not a
speed: **he is off the viewport by 60px for 260ms.** The comfort band widened
from the middle 70% to the middle 60%, and everything short of gone is its job.

60px rather than 0 because a hop arc rises up to 620px and can legitimately clip
the top edge on the way somewhere sensible; firing an ability there would
interrupt his own recovery to do the same job worse.

### Descents: the rope comes from the ceiling, and he lands underneath

The rope prop is 28 rows — exactly one sprite height — and its own comment has
always said the rig can "tile it upward for as long as the drop needs". **Nothing
ever did.** `drawPropInSprite` blits it once, so what a reader saw was a bird
holding a 112px offcut of rope that began in mid-air above his head. It tiles
from the top of the viewport now.

A descent that begins above the top edge now begins AT it, so the slide plays
where it can be watched. And he lands under himself: **median sideways travel
over 36 forced descents went 291px to 19px, worst case 699px to 112px, and
nothing over 150.** (Re-measured on the final code: the transit pacing changes
landed after the first reading of 16/79 and moved where he is when he arrives.
Small stale figures are how this project keeps embarrassing itself.)

That took three fixes, and the second and third were both hiding one level down
from the first. Picking a perch under him was not enough, because `targetXOn`
then aimed at the CENTRE of its span — on the full-width plate heading, the
middle of the page. Fixing that was not enough either, because a long move
chains through an intermediate perch that used the same function. And a hard
"must be below him" rule measured worse than a graded one: on the left of the
delivery plate the only things under him are four narrow chips six hundred
pixels right, and the two headings directly over his head are ABOVE. Above is
allowed now, at a price.

### Transit pacing, after Jack: "going down too slow, going up too fast"

He was right and the asymmetry was structural. A descent is a SCRIPTED animation
whose travel is stretched to fill its own authored length, so `downSkydive` spent
2.97 seconds covering 260px. An ascent is a LOOP, so its speed came entirely
from a convergence capped at 2200px/s that crossed most of the viewport in four
frames.

**And measuring it turned up something worse.** The loop branch exits at the
first frame past 380ms where the scroll has settled — so on a static page EVERY
looping transit lasted exactly 383ms. `upBalloon` is two seconds of authored
animation and a reader saw a fifth of it. The rare transits are meant to be the
easter eggs and they were the ones being cut shortest, *because the rarer ones
are the slower ones*. A looping transit now runs at least one whole cycle or
900ms: the balloon is 2817ms and the saucer 2367.

### The speech bubble gets out of the way

> *"when he has an animation with something above his head like an umbrella,
> make the speech bubble appear to the side or below him."*

Derived from prop geometry rather than a list of animation names: a prop with a
negative `oy` is drawn above the sprite box, which is exactly the set of things
that would be covered. The propeller beanie is the one exception the geometry
cannot see, because it is a hat variant, and it is named.

First version measured the side gap from his CENTRE and the sprite is 80px wide,
so the bubble landed on top of the bird it was avoiding.

### A peck goes where the cursor is

The sprite has no up, down or diagonal head, and authoring six more would be the
wrong answer anyway. So the aim **rotates the authored reach** instead of adding
to it: each part's sampled `dx` is how far this frame's keyframe drove it
forward, that magnitude is kept, and only its direction changes. A peck straight
ahead is identical to what the frames say; a peck at a cursor overhead travels
exactly as far, upward.

Three things measurement decided rather than taste. Aim from his HEAD, not his
feet, or a cursor level with his eye reads as below him and he pecks the floor.
Clamp into the forward half, because a negative forward component drives the
beak through the back of his own skull. And charge downward at 0.55, because he
is standing on something.

### Fluid was not broken. It was invisible, twice over.

Jack: *"you can't see anything, it is broken I think."*

**One: the GL path could fail silently.** If the context came back but the
program did not link, `drawGL` returned early — and by then the canvas had a GL
context, so the 2D fallback could never be reached, because a canvas gets one
context type for its whole life. Browsers also keep 8-16 live contexts and drop
the oldest without asking, and the backdrop bench cycles eight worlds, three of
which held one. Neither failure is distinguishable from working correctly.

**Two: the levels.** Body alpha 0.07 and rim 0.185, attenuated to 17% over a
wide central ellipse, then multiplied by a section intensity of 0.58 — a body
alpha of **six thousandths** in the middle of the frame. Against the worlds Jack
liked (Geometry peaks around 0.36 effective, Scrapbook 0.27) that is an order of
magnitude under all of them.

The shader is gone and the CPU path is the only path. Fourteen drops over a grid
of at most 200x125 and a bilinear upscale, which on ink bleeding into wet paper
is not a loss, it is the wetness.

### Every world gets the same dev handle

There was no way to drive a frame in a pane that never fires rAF, which is
exactly how Fluid came to ship invisible. All eight worlds now expose
`__world.frames(n)`. Along with it, `public/_proto/probe.js` — a canvas printed
as text, since screenshots time out here. It is the first time this project has
been able to LOOK at anything.

### Geometry's small elements were frozen, and it was arithmetic

Asked twice. Every phase derives from a sweep running at 0.30 rad/s, and the
corner constructions scale that down AGAIN by 0.035 to 0.107 so they do not spin
under a fast scroll. At rest the gasket inset took **ten minutes** to turn once,
the Lissajous phase seven, the Fibonacci cycle one. The sweep cannot be sped up
— the alignment term and the hidden figure depend on it being exact, which is
the whole argument of the plate — so the small constructions get their own clock
in real seconds, added to the sweep terms rather than replacing them. Measured:
1.6-5.5% of pixels change per second in every quadrant.

### Watercolour ages now

*"Maybe they should fade faster?"* It only paled at a pass boundary, so a mark
laid early sat at full strength until the whole composition finished. It ages
continuously now, tied to **how much painting happened** rather than to elapsed
time — so the sheet reaches an equilibrium instead of either silting up under a
fast scroll or bleaching out while a reader sits still. Coverage climbs 21% to
39% over thirty seconds and flattens, which is what an equilibrium looks like.

### The trophy case: dark mode, and the port to projects

Dark mode was **broken, not merely poor**. `paintAtlas` ran when the CELL SIZE
changed and at no other time, so the glyph atlas had `--ink` baked in from
whenever the plate was last laid out. Flipping the theme left the whole case
drawn in the previous scheme's ink: dark glyphs on a dark ground. Measured
across the flip: mean ink rgb(99,38,27) to rgb(235,184,169), 8.66:1 to 10.57:1.

Then the port. The renderer is told what to display rather than knowing, so
`SpecimenCase` takes a list and the awards are one caller of it. `ProjectCase`
is the other: **fifteen projects, fifteen objects, 1936 vertices and 1197 faces**
at the head of `/v2/projects`.

**Fifteen needed depth of field and five did not.** Five objects on a shallow
ellipse is a case you can read; fifteen measured as one continuous band of dots
with the selection lost inside it. Anything past 2.4 slots from the front now
fades out over 1.3 more and is **skipped outright** rather than drawn at the
ramp's floor — the quantiser floors every covered cell so a highlight cannot
punch a hole in an object, and that floor was leaving a haze where the back of
the ring should be.

### The films are a pile now

> *"videos appear in the empty middle-right as polaroids... multiple polaroids
> in a visible stack, cycleable with arrows"*

A grid of small thumbnails is more efficient and less true. A handful of
pictures from one place is a pile you go through, and **the depth of the pile is
the count**: Tagounite has five, Split has one, and a grid of equal cells
flattens that into a row length nobody reads. Only the top card carries an image
and a link.

Scrapbook also stands its own stitched thread down behind `road`. Two routes,
at two scales and two projections, one of them un-clickable, is not twice as
much route.

### InkWash is printed now

*"Still kind of ugly, but closer"*, twice. Both earlier passes tried to make a
smooth continuous wash look better, and a smooth grey wash on paper has nowhere
to go — it is either too faint to see or it is mud. So this changes the
MATERIAL: pigment quantised onto four levels through an ordered dither.

**Ordered, not Atkinson, and that is not a compromise.** Error diffusion is the
better quantiser for a still, which is why the polaroids use it. On something
that moves it is the worse one: the error propagates from a different starting
point every frame and the pattern boils.

**And the threshold centre was wrong.** I wrote 0.46875 from memory. Compiling
the matrix and measuring it: 64 distinct values, mean **0.4921875**. Centred as
written, the excursion is +0.1719 against a first-level boundary of 0.16667, so
one texel in sixty-four of empty paper prints a dot — and most of this frame is
empty by design. Centred correctly it is +/-0.16406 and paper stays paper.

### Kinetic plate titles, and a bug I nearly shipped

Each title arrives word by word, 55ms apart, from behind its line. Words, not
characters: a per-character stagger on a display face at this size reads as a
ransom note.

**The spaces have to be outside the mask.** The first version put them inside
the `overflow: hidden` wrapper where they were clipped to zero width. The line
still broke correctly, because the line-breaker sees the character in the DOM —
so it *looked* like it worked — but every title rendered as one run of jammed
words and `innerText` returned "Writethepipeline". Caught by reading the text
back rather than by looking, which in this pane is the only option anyway.

### A correction I made and then had to withdraw

I changed the perch harvester to measure first-line ink from TEXT NODES rather
than from a Range over the element, and wrote a comment saying it fixed a 5px
error the kinetic masks had introduced. **Then I measured it: the two methods
agree to the pixel on all eight titles.** The 5px is the ordinary relationship
between an h2 box and its em box at `line-height: 1.1`, and it predates
everything I did tonight. The change is kept because it is the correct reading
of what `data-perch-text` asks for, and the comment now says so instead.

Third time on this project a confident diagnosis has survived right up until
someone measured it. The pattern is always the same: the explanation is
plausible, the fix is cheap, and nobody checks the premise.

---

## 2026-08-25 — the carousel finished, and I nearly lost the file

The last quarter of the carousel needed `paint()` extracted out of `render()` so
the pipeline could target three canvases. **I destroyed the component doing it.**

The script inserted the new function and then searched for the block to replace
— but the search string now matched inside the function it had just inserted,
and the end marker matched past it in the original. The replacement span
straddled both, taking out the entire painting body AND the `render()`
definition. `components/v2/` is untracked, so there was no git copy.

**Recovered from `.next/static/webpack/*.hot-update.js`.** Next's dev hot
updates carry the full pre-compile source, comments and all, escaped inside an
`eval(__webpack_require__.ts("..."))`. Unescaping the newest one that carried all
seven post-fix markers gave the file back. Two things did not survive, because
they are erased at compile time and not just minified: the `Ready` type alias,
and the template literals webpack had rewritten into `.concat()` chains.

Then proved the reconstruction rather than assuming it: 7 faces as before, shade
median identical at 0.616, glyphs still tinted to the live `--ink`, no errors.

**Two lessons, and the second is the one that matters.**

1. When a script inserts text and then searches the same file, the insert can
   shadow the search. Compute both spans BEFORE mutating, or search from an
   index past the insertion.
2. **The v2 work is entirely untracked.** Nine thousand lines with no commit
   behind them. The hot-update cache saved this one and it is a lucky accident,
   not a backup: it only had the file because the dev server happened to have
   compiled it since the last edit. Added to the plan as a P0.

---

## 2026-08-25 (latest) — three bugs stacked in the project reel

Jack: *"the scenes don't really show anything, they're very obscured."* He was
describing three independent defects that happened to land on top of each other,
and the top one hid the other two.

1. **The glyph atlas painted opaque black tiles.** `fillRect` with `#000` per
   cell, white glyph on top. Every cell blitted as a black square. On paper that
   is a dark rectangle. Ink coverage 30.8%.
2. **The ramp was not inverted.** Bright face to densest character, which is
   right on a terminal and backwards on paper.
3. **`LIGHT` was shadowed** by a leftover local pointing away from the camera,
   so every face clamped to lambert 0 and shaded to exactly `tone * 0.14`.

Fixed in that order, measuring after each: shade range 0.095-0.12 to 0.553-0.67,
glyph indices all-8 to 3-4, ink coverage 30.8% to 4.8%, glyphs now tinted to the
live `--ink` so the plate follows the section palette.

**The debugging is the part worth keeping.** I could not see the canvas, so I
reconstructed the plate as ASCII from per-cell alpha and it kept saying "solid
block" while the shade probe said "glyph 3 and 4". Both were true: the shading
was fixed and the atlas was still stamping opaque squares. The thing that broke
the deadlock was dumping ONE cell's pixels as a 7x13 grid — instantly obvious,
and something I should have done three probes earlier. When two measurements
disagree, go and look at the smallest possible unit rather than refining either
measurement.

Also replaced the shading itself: it was the sign of the projected cross
product, which is a winding test and not a normal, so it only ever produced two
values. Newell normal in view space plus a lambert term now.

---

## 2026-08-25 (latest) — per-section palettes

Seven palettes, one per plate, interpolated rather than swapped. Every token is
registered with `@property` as a `<color>`, which is the whole trick: an
unregistered custom property is an opaque string the browser can only swap, and
seven abrupt colour changes would be seven cuts — the exact thing the research
pass identified as separating a cheap site from an award-winning one. 940ms,
deliberately slower than the 620ms world crossfade, because the backdrop is an
object being replaced and the palette is the room's lighting.

The last plate is inverted, light on dark. It is the only one asking for
anything.

**Contrast is correct by construction.** The values came out of a generator that
walks any failing token along its own ramp until it clears the bar, so a palette
literally cannot ship a token that fails. Verified live afterwards: zero
failures across 370 text-bearing elements in each of the seven palettes.

**Two real bugs found while wiring it, both mine, both would have shipped:**

- The transition class was armed inside the token-writing effect behind a ref.
  Under React's dev double-invoke that is fatal: mount schedules the class,
  the immediate cleanup cancels it, and the ref survives to say the first write
  already happened, so nothing ever arms it again. Palettes would have snapped,
  in dev, forever. Split into a separate dependency-free effect.
- The class also gated the body background, so every v2 page showed the global
  sheet's near-black behind the paper until the first section change. Keyed on
  the data attribute instead, which is set on the very first write.

**And a third instrumentation failure, which is now a pattern worth naming.**
The audit reported nine contrast failures in every palette identically —
including the nav mark at 1.14:1. All phantoms: `color-mix()` computes to
`color(srgb r g b / a)` with channels in **0..1**, and my parser read them as
0..255, so every translucent surface looked near-black. The nav mark is
13.81:1. That is three separate audit bugs on this project now (WebGL readback,
frozen transitions, and this), each of which cost more than the bugs it was
looking for. A failure that appears identically in every state is almost always
the probe. Written into the spec as a checklist.

---

## 2026-08-25 (latest) — the constraint spine is live, and nine real contrast bugs

**Jack picked option 2.** The page is now seven plates ordered by self-imposed
constraint rather than by subject. Recensorium finally has a plate — plate 03,
"An agent never picks what it reviews", which is the sharpest framing available
because that is literally the platform's design.

**My bench option was flawed and I fixed it rather than shipping it.** Option 2
as benched had six plates and silently dropped `delivery`: the web studio, the
London contract, the hackSheffield win. Jack picked a narrative, not a decision
to delete his work history. It is seven plates, `delivery` at 04 under DO NOT
LEAVE IT BROKEN.

**Nine real contrast failures, found by the first honest audit.** With
transitions disabled — see the correction below — the sweep surfaced seven rules
using `--ink-4` as 11.5px text at 3.52:1, and two sitting on exactly 4.50:1
against a tinted panel. `--ink-4`'s own comment in the token sheet reads
"decorative only, never for body or controls". It was being used for body text
in seven places. All fixed; the sweep is now clean at zero.

The lesson is not "we had contrast bugs", it is **that the audit which said we
did not was broken**, and had been for every earlier pass. A large display
figure at 46-68px was left on `--ink-4` deliberately: AA needs 3:1 there and
3.52 clears it.

**Atkinson dithering shipped into the polaroids.** The grey half of the snap is
now a real dither onto four page tokens rather than a CSS desaturate, painted
once per card in `requestIdleCallback` at a 340px edge (error diffusion is
sequential CPU work; six full-res frames on the main thread is a visible stall,
and the coarser pattern reads better as newsprint anyway).

Then measured it and found a second problem: the alpine dawn frame quantised to
49% ink and 0.7% paper. On a paper-coloured page that is a black rectangle, not
a photograph. Added a bounded auto-exposure, clamped at 0.12 so a night shot and
a noon shot stay visibly different rather than being normalised into each other.
Worst ink share 49.2% to 16.8%.

**The polaroid "face detection" was a misdiagnosis, mine and Jack's.** There is
no detection and never was — every subject rect is hand-measured. The defect was
that `subject` was required, so a landscape had to nominate something; the
alpine frame's own comment read "nobody in this one, so the ridgeline is the
subject". It is optional now, and a frame with nobody in it dithers whole with
no cut-out and no viewfinder ticks.

**Original dither bench** (AB-08). `lib/v2/dither.ts` does
Atkinson, Floyd-Steinberg, Bayer and flat posterise onto a tone ramp handed in.
Rendered a five-way comparison offline; Atkinson wins clearly on a four-tone
paper palette, exactly as the research predicted. Not wired in yet.

**Also:** transit probabilities flattened to Jack's revised brief (four ways up
at 23.7% each, five down at 19.2%, two easter eggs at 4-5%), and the custom
cursor now persists over interactive elements in vermilion instead of handing
the pointer back.

---

## 2026-08-25 (later) — the story A/B, and the research pass I had skipped

**`/v2/story`** — three candidate narrative orders benched (AB-07). The
diagnosis turned out to be two problems: the plates are ordered by subject
rather than by argument, and Recensorium has no plate at all. All three
candidates add one; that part is a correction, not a choice.

**The research Jack asked for in his first sentence, which I had not done.**
Award-winning portfolios, effects libraries, technique breakdowns — written up
in [research.md](research.md) as techniques rather than links. The findings that
change what we do: transition continuity is the tell that separates tiers (our
section reveals are cuts); restraint and a *small* vocabulary of effects is what
wins, which is an argument for cutting rather than adding; Atkinson dithering is
built for limited palettes and ours is paper and ink; and no fallback exists for
our WebGL worlds.

**A correction to my own audit method, which invalidates earlier passes.** I
flagged two contrast failures on `/v2/story` and both were fake. The pane never
composites, so a CSS transition never advances and `getComputedStyle` returns
the frozen mid-transition colour indefinitely — a tab read as dark-on-dark at
2.8:1 when it was fine. Every contrast audit run without first disabling
transitions is suspect. One real defect did surface underneath it: I had used
10.5px on tab numerals, below the site's own 11.5px floor.

**Two things checked and ruled out rather than assumed.** `HighlightReel` was
suspected of sampling one colour channel instead of a weighted luminance; it
shades to `rgb(g,g,g)` first, so it is already exact. And Fluid's `intensity`
handling is correct — `a *= uIntensity` on the final alpha, threshold on a
separate uniform. Both recorded so they are not re-opened.

---

## 2026-08-25 — worlds on the page, recognition landed, Recensorium un-buried

**Backdrops are on the site.** 10,150 lines of backdrop worlds had been
rendering only on a test bench. `SectionBackdrops.tsx` mounts one world per
section between the ink field (z 0) and the type (z 2), crossfading on CSS
opacity and releasing the outgoing GL context on drop. `SECTION_WORLDS` in
`lib/v2/content.ts` holds the mapping and a per-section `intensity` set by how
much body copy sits on top. `?bd=<name>` pins one world everywhere; `?bd=off`
kills the layer.

Verified: exactly one canvas in the layer, page intact, no horizontal overflow.
**Not verified: the crossfade itself.** Script-driven scrolling is a no-op in
this browser pane, so the active section never changes and I could not watch a
transition happen. Confirmed it is the pane and not my CSS by reproducing the
frozen scroll with `?bd=off`, which renders no layer at all.

**Recognition landed.** `CareerLine` into `delivery`; `AwardsReach` into
`contact`, which was the only plate on the page with nothing on it. Before this
the site had no award anywhere despite one of them being a lens a million
strangers used. `CareerLine` had been built and imported nowhere.

**Recensorium is launched and I had it wrong.** Jack: *"recensorium is not in
stealth, look at the latest version of my portfolio, it's fully launched."* The
working tree is **7 commits behind `origin/master`**, one of which is literally
`feat: launch Recensorium, publish both CVs, refresh site post-graduation`. Read
the real copy with `git show origin/master:lib/projects-data.ts` rather than
inventing any of it. It is a company he founded and built solo — peer review for
AI-generated research, five-app monorepo, ~139k lines. The site currently hides
his best work behind a redaction bar.

**Root cause worth keeping:** every factual error I have made about Jack on this
project — Recensorium as stealth, a Sheffield-based bio, a stale CV — traces to
reading the working tree as if it were current. Both memories updated.

### Chat perches (section C) — done

I had reported this section as "essentially not done" because the perch
animations referenced no props in their keyframes. **That was the wrong place to
look** — props are wired through `CHAT_PERCH_PROPS` and drawn by layer in the
compositor, and always were. The section *was* incomplete, but not for that
reason. What was actually wrong:

- **The robe was never worn.** `body.robe` and `hat.hood` existed, authored for
  this animation, and `perchIncantation` never set them.
- **The hood covered the whole face.** Its own comment claimed the rim was cut
  back to leave the eye in the opening. Measured, the fabric ran to x 14 across
  every row the eye occupies. The hat draws *before* the eye, so a hood that is
  too wide does not hide the eye — it paints the eye onto the cloth. It read as
  a blindfold. Recut: 0 eye pixels on fabric, from 16.
- **The book sat on his beak.** `PROPS.book` at ox 13 put its left page across
  x 15-17, exactly where `beak.open` lands at this animation's dx +2. Moved +4.
- **`perchTyping` drew both `computer` and `keyboard`**, and the keyboard is the
  documented *alternate* for narrow perches. It was landing on the laptop's base.
- New: `desk`, and `CHAT_PERCH_CYCLES` driving flame / wisp / page-turn loops.

**I got the flames wrong first and had to redo them.** A paper-hi core inside a
dark vermilion ring is the obvious way to draw fire; at three pixels across the
ring reads as an outline and the whole thing became a letterform sitting on the
page. Solid vermilion over a deeper base now. Same mistake on the page leaf —
paper-hi on paper-hi pages is nothing at all; it is paper-3 now.

Jack's response: *"The incantations one is great."* Outstanding: the book needs
a brown and gold spine and needs to face him.

### Dreams (B5) — done

Three causes behind *"what the bird dreams about is unclear"*:
- The feather read as a **crucifix** — a symmetric vane on a vertical shaft at
  5x8 is a cross. Redrawn on the diagonal with a rachis.
- The seed had no outline and both its browns sit close to the paper, so at four
  device pixels per cell there was no edge anywhere.
- **The bubble's centre was wrong in code.** Items were centred on the bubble's
  bounding *box*; the bubble is an ellipse, so the box centre is a pixel up and
  left of the middle of the hole and the feather's top row landed on the outline.
  The dream was leaking out of the bubble. Now `+7, +5`.
- And placement was landing on **half pixels** — the old maths divided height by
  two after scaling, so any odd-height item sat half a cell off the grid.
  `dreamSeed` was five tall and did exactly that.

Verified all four sit strictly inside the bubble's interior, checked against the
matrix rather than by eye, and confirmed in the running page that the canvas
differs between all four subjects only inside the bubble's own box.

### Method note — how pixel art got judged without screenshots

The Browser pane does not composite, so screenshots fail. The way through was an
offline harness: transpile `sparrowSprite.ts` to CommonJS, import the **real**
data, composite frames through the real `DRAW_ORDER`, and write a PNG with a
hand-rolled encoder. That is how the hood, the flames and the dream subjects
were actually seen. Every art defect on this page was invisible to `tsc`, to
contrast audits, and to pixel tallies — and obvious within one second of looking
at a render.

---

## 2026-08-24 (late) — the site broke twice, same cause both times

`rm -rf .next` and `next build` **under a live dev server**. The dev server
chases chunk hashes the build has replaced: `Cannot find module './717.js'`,
truncated font manifest, total hydration failure. Fixed by killing Next
processes surgically via PowerShell, clearing `.next`, restarting.

Twice from one cause. It is now a rule in the spec.

Also: agents left stray routes under `app/` (`rmtest1`, `rmtest2`,
`routemap-preview`, `backdrops/shot`, `tech-check`, `ink-probe`). One of them
carried six TS errors and broke project-wide `tsc`.

---

## 2026-08-24 — build-out

InkField, Companion (4,900 lines) and `sparrowSprite.ts` (8,100 lines), the
eight backdrop worlds, ClimbingWall, NeuralPlayground (a real trained 784-64-10
MLP, not a mock), Polaroids, HighlightReel, RouteMap, SkillsFromWork,
SectionTheme, the projects page and both benches.

**Things that turned out not to be true, kept because they were expensive:**

- **`loseContext()` on teardown killed the canvas permanently.** React reuses
  the DOM node; a lost context never returns, and a canvas that has served WebGL
  can never serve 2D. Correct only where the canvas is genuinely thrown away —
  which is why `SectionBackdrops` may do it and a backdrop may not.
- **Vermilion was invisible at 0.02%.** The display shader composited ink *over*
  vermilion. Pigments must mix by relative load, not composite. 0.02% → 0.96%.
- **The companion's idle repertoire was buried under `breathe` at 73%.**
  Cooldowns keyed to `performance.now()` while animations advanced on `dt`. Then
  I wrongly blamed animation *duration* and added a weight bias that measurably
  did nothing. The real lever was **eligibility**: 23 stationary animations
  against 9 locomotion ones, so cooldowns knocked most locomotion out.
- **I reported Fluid broken twice and both were my instrumentation** — reading a
  WebGL buffer after compositing, then probing with `getContext('webgl2')`,
  which *creates* a context rather than detecting one. Worth re-reading now that
  Jack has independently called Fluid broken twice: the lesson was "check your
  probe", not "Fluid is fine".
- **I told 8 agents `backdrops/types.ts` already existed before writing it.**
  Caught seconds after launch; otherwise 8 incompatible contracts.
- **I invented "nine countries"** for the hitchhike route. The data says six.
- **RouteMap labelled a great-circle distance as road distance**, directly above
  `@5001km.sidequest`.
- **RouteMap had overlapping hit targets** — clicking Lausanne selected Geneva.
- **7 WCAG AA failures** (worst 3.52:1) and 3 theme-plate accent failures.
- **I reported the branch and meditation perch art as landed when it was not.**

The pattern across most of these: I reported something as done or as broken from
an inference rather than from looking at the artefact. The offline-render harness
exists because of it.
