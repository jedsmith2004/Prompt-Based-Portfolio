# v2 portfolio — development log

Newest first. What was built, what broke, and what turned out not to be true.
Corrections are kept rather than edited away: most of the expensive mistakes on
this project were repeats, and a log that quietly fixes itself cannot show that.

See also: [spec.md](spec.md) · [plan.md](plan.md) · [ab-log.md](ab-log.md) · [research.md](research.md)

---

## 2026-08-25 (latest) — the carousel finished, and I nearly lost the file

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
