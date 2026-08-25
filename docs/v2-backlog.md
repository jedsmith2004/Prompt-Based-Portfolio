# v2 backlog

Client notes, captured verbatim in substance, with implementation notes added.
Nothing in here has been done yet unless marked. Ordered roughly by whether it is a
bug, a redesign, or new work.

Last updated: 2026-08-24.

**DONE since these notes were taken:** the eight backdrop worlds are built and render in
both palettes, and there is an A/B bench at `/v2/backdrops` (keys 1-8, D flips the
palette, T toggles the type overlay). Sections are not yet mapped onto them.

---

## A. Bird bugs (fix before polish)

### A1. Clicking him to open the chat makes him fly in from the left
Client: "When you click him to open the text chat he flies in from the left (bug)."

Almost certainly the chat panel mounting resets his position, or the chat perch
animation starts from a default origin rather than from where he actually is. The chat
window is supposed to appear *around* him, so nothing should move on open.

### A2. On scroll he lags, staying fixed to the screen for a moment before jumping
Client: "When you scroll the bird stays where it is on the screen for a second before
jumping, instead of where it is on the page. Are we able to fix the bird to places on
the page instead of the screen so when we scroll it moves with the page instead of
having that slight lag."

**Answer to the question: yes, and this is the right fix.** His position is already
stored in document space, but he is *drawn* into a `position: fixed` full-viewport
canvas at `y - window.scrollY`. On many browsers scrolling is composited off the main
thread, so the page moves a frame or more before our canvas repaints, which reads
exactly as the lag described.

The fix is to stop compensating for scroll in JavaScript and let the browser move him
natively: give the companion an absolutely positioned element inside the *document*
flow (top/left in page coordinates) and let scrolling carry it. Either
  - a small canvas positioned absolutely at his document coordinates, resized to just
    his sprite plus effects, moved by `style.transform` only when he actually moves; or
  - a document-height absolute canvas, which is simpler but memory-hungry on long pages.
The first is better. It also removes the per-frame full-viewport clear.

### A3. Fast scroll up/down animations are hard to trigger
Client: "Sometimes I find it really hard to trigger the fast scroll up/down animations."

The threshold is `|velocity| > 46` px/frame on a 0.24-smoothed signal, which needs a
sustained hard flick. Lower it, and trigger on accumulated displacement over a short
window rather than instantaneous velocity, so a normal firm scroll qualifies.

### A4. Landing surfaces do not line up, and some are not landable
Client: "Some things he lands on don't really look that great, the lines don't always
match up properly, figure out certain bounding boxes for the bird across the website.
For example the polaroid pictures he isn't able to land on."

Perches are currently harvested from a CSS selector list, so anything not in that list
is invisible to him and anything with padding gives a top edge that is not where the
visible line is. Needs a deliberate perch contract: an explicit `data-perch` attribute
with an optional inset, applied across the site including the polaroid frames, the
climbing wall top, the reel, and the nav rail. Store the *visible* edge, not the box edge.

---

## B. Bird animation and behaviour

### B1. Flying looks like floating
Client: "The flying animation needs work, he looks like he's floating."
Needs real wingbeat timing: a fast downstroke, a slower recovery, body bobbing in
antiphase with the wings, and forward pitch. Floating happens when the wing cycle is
symmetric and the body does not rise and fall with it.

### B2. Mouse-landing should depend on how much the mouse moves
Client: "When he lands on your mouse, small movements can keep him on (until he decides
to leave) but large movements will shake him off with an appropriate animation."

### B3. Cursor above him
Client: "When the cursor is above him he should look upwards and jump and peck at the
cursor sometimes." Partially specified before; make sure the *look up* is there too.

### B4. Draggable, with an anger level
Client: "You should be able to drag him with an appropriate animation (he doesn't like
being dragged), he can break free, he has an anger level and the more you drag him the
more he tries to break free and do things like steal your mouse, it is also reflected
in the messages. The anger level comes down pretty quick though."

So: a drag state, a struggle animation that intensifies with anger, escape attempts
whose success probability scales with anger, retaliation (stealing the cursor), and
anger-tinted speech lines. Anger decays fast.

### B5. Dream images are unclear — DONE (2026-08-25)
Client: "What the bird dreams about is unclear in some of the pictures, some may need to
be redrawn."

Three separate causes, all fixed:
- **The feather read as a crucifix.** Drawn as a vertical quill at 5x8, a light shaft with
  a symmetric vane is a cross and nothing else. Redrawn on the diagonal, 7x7, with an M
  rachis running through a `b` vane and a bare shaft at the base.
- **The seed was a smudge.** No outline, and both its browns sit close to the paper, so at
  four device pixels per cell there was no edge anywhere. Redrawn 6x6 as an outlined
  teardrop with one light stripe — the trick the berry was already using to read at size.
- **The bubble's centre was wrong in the code.** `Companion` centred each item on
  `(dreamBubble.ox + 6, dreamBubble.oy + 4)`, which is the centre of the bubble's bounding
  BOX. The bubble is an ellipse: its usable interior runs x 7-19 by y -11 to -3, so the box
  centre is one pixel up and one left of the middle of the hole, and the feather's top row
  was landing ON the outline — the dream leaked out of the bubble. Now `+7, +5`.
- **And the placement was landing on half pixels.** The old maths divided the item height
  by two *after* scaling, so any odd-height item sat half a cell off the grid. `dreamSeed`
  was five pixels tall and did exactly that, which is most of why it looked mushy. Rounded
  to a whole sprite pixel before scaling.

Verified: all four subjects sit strictly inside the bubble's H interior (checked against
the matrix, not by eye), and in the running page the canvas differs between all four
subjects only inside the bubble's own bounding box.

---

## C. Chat perch redesign — DONE (2026-08-25)

Client, itemised, with what was actually wrong in each case:

- **Computer**: "he should be at a desk with a laptop he is typing on."
  DONE. New `desk` prop, drawn behind him, its lit top row landing on `BASELINE_Y` —
  which is where his crouched feet and the laptop's own base row already were, so bird,
  laptop and desk share one surface without any of the three knowing about the others.
  The legs are deliberately two pixels and one row: he perches on lines of type, and
  furniture with real height would hang down through the paragraph below him.
  Also fixed in passing: `perchTyping` listed BOTH `computer` and `keyboard`, and the
  keyboard is documented as the *alternate* for a perch too narrow for a screen. Drawing
  both put the keyboard on top of the laptop's own base. It now lists `desk` + `computer`.

- **Enchanted book**: "pages flipping, and effects like flames and wisps coming from it,
  the bird needs to look like it is casting spells in a robe."
  DONE, and the robe was the real story. `body.robe` and `hat.hood` already existed and
  were authored for this animation — `perchIncantation` simply never wore them. It now
  does, with both legs `hidden` (the hem lands on `BASELINE_Y` and IS the silhouette from
  the collar down), the tail `hidden` (buried under the same hem), and the eye at dx +2.
  New `CHAT_PERCH_CYCLES` drives three independent loops over the book: flame (90/80/100/80
  ms, so the two flames never agree), wisp (4 x 200ms, one row of travel per step, closes
  on itself), and the page turn — which holds an EMPTY step for 4.2s and then turns for
  half a second, because a page that turns every second is a bird flicking through.

- **Branch**: "you can't see the branch, you can only see the leaf." Already fixed in the
  earlier art round; `perchBranch` draws `branch` + `branchLeaf` and both read.

- **Meditation**: "facing us with wings spread out either side and one orb either side."
  Already fixed; `body.front` exists and `perchMeditate` draws `orb`, `orb`, `orbSmall`.

**Two art defects found and fixed while doing this, both invisible until rendered:**
- The hood covered the whole face. Its own comment claimed the rim was cut back far enough
  to leave the eye in the opening; measured, the fabric ran to x 14 across every row the
  eye occupies, so all of the eye landed on wool and the bird had no face. The hat draws
  BEFORE the eye, so a hood that is too wide does not hide the eye — it paints the eye on
  top of the cloth, which reads as a blindfold. Rim recut and measured: 0 eye pixels on
  fabric now, down from 5 of 12 after the first attempt and all of them before it.
- The book sat ON his beak. `PROPS.book` was at ox 13, putting its left page across
  x 15-17, which is exactly where `beak.open` lands at the dx +2 this animation uses — he
  was reciting with the book clamped over his mouth. The book and its three cycles moved
  +4, so the prop is now where its own comment ("unhelpfully far from his face") always
  said it was.

**A first attempt at the flames was wrong and was redone.** A paper-hi core inside a dark
vermilion ring is the obvious way to draw fire; at three pixels across the ring reads as
an outline and the flame turns into a letterform sitting on the page. They are solid
vermilion over a deeper base now. Same lesson on the page leaf: it was paper-hi, and the
book's pages are already paper-hi, so a white leaf on a white page was nothing at all.
It is paper-3 now.

**No new palette entries.** The flames reuse the three values the beak is made of and the
wisps reuse the two the orbs are made of, so the smoke off this book and the orbs of
`perchMeditate` read as the same magic rather than two unrelated effects.

**New dev handle:** `canvas.__bird.forcePerch(name)` / `releasePerch()` / `cycled()`.
The perch is picked at random when the chat opens, so a five-way coin flip was the only
way to see any given one. Note that `forcePerch` must set `chat.current.open` — setting
the mode and the animation alone does not hold, because the next `update()` sees a chat
that is not open and drops him to an idle within one frame. Same trap applies to sleep:
`bird.sleepUntil` has to be pushed forward or he wakes immediately.

**Verified in the running page**, not just in a harness: all five perches render with
distinct prop signatures (nest / green leaf / blue orbs / robe+flames+book / laptop+desk),
the cycle steps advance against the bird's own clock, and the page turn fires at 4.2s and
adds exactly the 5 paper-3 and 10 ink pixels the leaf is made of.

---

## D. New work

### D1. Hitchhiking map, done creatively
Client: "I will say I did like the hitchhiking map from the first portfolio site, there
should definitely be a more creative way to implement this here."

The old one is `components/HitchhikeMap.tsx` (d3-geo + topojson + world-atlas, Instagram
reels per stop). Real data is in `public/context.json` under `hitchhikeRoute`: 20 stops,
Split to Tagounite, with reel URLs and thumbnails per stop.
Keep: the actual route, the per-stop reels, the sense of distance covered.
Change: it should belong to this site's world. Ideas to explore, not decided:
  - the route drawn as a single loaded brushstroke that fills in as you scroll, with
    stops as pigment pools that bloom when opened;
  - a scrapbook spread where each stop is a taped-in polaroid and the route is a pen line
    threading between them, which pairs with the Scrapbook backdrop already being built;
  - a glyph-grid map, so the coastline is typed, matching the Techno backdrop;
  - dead reckoning: a navigator's plate with bearings and distances between stops,
    pairing with the Celestial backdrop.

### D2. Skills, derived from project tags
Client: "I also quite liked the skills bubbles drawn straight from the tags on the
projects, so people can see what I've worked with the most. It doesn't have to be the
same, but something that does something similar, showing the technologies I've worked
with the most straight from my projects."

Source of truth is the `tech` arrays in `lib/projects-data.ts`; count frequency there,
never hand-maintain a list. Old implementation for reference: `components/SkillsCloud.tsx`.
Weight by count, and consider weighting recent projects higher. Must stay readable at
11.5px minimum and pass AA.

### D3. Project highlight reel
Client: "Don't forget the projects highlight and projects page!"
- Projects page: **DONE**, at `/v2/projects` (15 projects, tech filters, chronological,
  Recensorium redacted).
- Highlight reel: **DONE.** Built by hand after the delegated agent died three times.
  `components/v2/HighlightReel.tsx` draws each project's collage through a small 3D
  pipeline written in the file (vertices, rotation, perspective divide, depth-sorted
  faces, flat shading) and quantises the shaded result to a glyph grid. Verified: all
  five projects render, 10-21% coverage, full 16-tone ramp, ~20 procedural objects
  matched to the collage prose by keyword with a fallback so nothing renders blank.
  Original spec was a
  carousel of per-project collages rendered through a hand-rolled 3D pipeline into a
  glyph grid, driven by `FEATURED_PROJECTS` in `lib/v2/content.ts`.

---

## E. Standing constraints (do not regress)

- Nothing on the page smaller than **11.5px**; uppercase mono tracking capped at 0.14em.
- All text meets **WCAG AA** against its own surface, in both light and dark palettes.
  `--ink-3` and `--verm-text` are the safe small-text tokens; `--ink-4` is decorative only.
- **No Japanese framing.** Watercolour as a material only; no kanji, seals, or Mincho.
- Jack **graduated** with a **first** from Sheffield, lives in **Hemel Hempstead**, often
  works out of **London**. Never call him a current student or Sheffield-based.
- **Recensorium** stays undisclosed. Tease only.

---

## F. Backdrop verdicts (client review of /v2/backdrops)

Reviewed 2026-08-24. **Rework COMPLETE for all seven** (Topography untouched by request).

| # | Backdrop | Verdict | Action |
|---|----------|---------|--------|
| 1 | Ink wash | "doesn't work at all" | **REBUILD.** Port the Navier-Stokes solver from the Direction D prototype, which the client liked. Advection, divergence, ~20 Jacobi pressure iterations, gradient subtract, pigment advected through the velocity field, then shaded with edge darkening, washi fibre, granulation and relative-load pigment mixing. Sumi restraint wanted; Japanese iconography still not. |
| 2 | Geometry | "very very cool" | **EXTEND.** Animate the Apollonian gasket, which the client explicitly dislikes being static. Add more abstract artefacts in the same exact register (Fibonacci construction, Lissajous locking to simple ratios, harmonograph, compass-and-straightedge constructions, aperiodic tiling). Preserve the plate rotation, roulette tails and alignment moments. |
| 3 | Fluid | "not working at all, they're not fluid and barely merge" | **REBUILD.** Evaluate one summed metaball field per pixel in a fragment shader and shade the isosurface, so a visible neck forms before two blobs fuse. Give the blobs mass, inertia, mutual attraction and damping instead of independent sine paths. |
| 4 | Watercolour | "almost nothing on it at the beginning, takes ages... kinda cool but could be better" | **FIX.** Must have a composition on the first frame. Paint substantially faster. Aim at the p5.brush reference the client linked: loose botanical subjects, bold pigment-collecting edges, layered washes where overlaps darken, clear colour differentiation, visible hand. |
| 5 | Techno | "very cool, the neural network could do with slowing down a significant amount and looking more like a neural network" | **FIX.** Slow the forward pass to several seconds with a visible wavefront. Draw distinct layers, real nodes, explicit edges with weight as thickness and sign as colour, and a signal travelling along each edge. Everything else about the plate is liked. |
| 6 | Scrapbook | "extremely cool, I like that it follows the trajectory" | **REFINE.** Subtly indicate the six countries crossed. Must not become a labelled map. |
| 7 | Topography | "Love this a lot" | **KEEP. No changes.** |
| 8 | Celestial | "like this a lot, although the compass seems slightly out of place" | **REFINE.** Drop or replace the compass rose with a genuine navigator's instrument. Change nothing else. |

Reference the client supplied for the watercolour direction:
https://surya.website/rling-qwen-to-paint-with-code — a model trained to paint with the
p5.brush library. Relevant qualities: botanical subjects, bold edges, layered washes,
colour differentiation, visible hand.

The Direction D prototype to port the ink solver from lives in the session scratchpad as
`three-ways-in.html`, section "D — SUMI". If that scratchpad is gone, the same solver
shape is documented in this file and in components/v2/InkField.tsx.

---

## G. Resolved (2026-08-24, later)

**Bird (A1-A3, most of B) — DONE.** The rig rewrite root-caused rather than patched:
- *Teleporting* was four separate discontinuities: `land()` clamped x on the touchdown
  frame (up to 34px sideways, on the exact frame you are watching); locomotion sideways
  drift was applied in every mode, so a sidestep kept shoving him through hops, falls and
  whole transits; `enterFall()` and `enterFly()` both inherited stale velocity, so a fall
  could open by rocketing upward. Measured after: max 19px moved in any single frame
  across 30 simulated seconds.
- *Glitchy falling* was terminal velocity 1900px/s against a 100ms frame clamp, i.e. 190px
  in one step, skipping past headings without ever bracketing them. Now substepped to 16px
  max. Separately the animation swap condition was always false, so `downGlide` had
  **never once played**. Both fixed and verified.
- *Balloon missing* was the transit gate at |vel| > 38px/frame of SMOOTHED velocity,
  needing a sustained flick over 3000px/s. It essentially never fired, so no transit
  played at all, so no rare one could. Now a firm scroll held 80ms. Rares also got a pity
  counter so they take turns. Verified: balloon plays.
- *Comfort band / "stays at the top of the screen"* was arithmetic, not tuning. Position
  is document-space, so a page moving 34px/frame dragged his screen position with it, and
  the catch-up then converged from wherever that left him, netting under 3px/frame against
  a 36px cap. **Raising the cap could never have fixed it.** The frame's scroll delta is
  now added back before converging. Off-screen 0.12% of frames, longest excursion 217ms,
  down from 1.5-1.8s.
- Also fixed: a literal NUL byte at line 1010 that made git and grep treat Companion.tsx
  as a binary blob; the speech-bubble tail pointing at empty paper whenever he stood near
  a viewport edge; the chat input sitting at 0,0 for a frame because React mounts it after
  the window opens; and PvZ being unreachable because "settled" required the pointer to
  leave the window entirely.

**D1 hitchhiking map — DONE.** `components/v2/RouteMap.tsx`. Real coordinates from
context.json, projected in-file with no d3 or topojson. Route drawn as a loaded
brushstroke, stops scaled by how long he stayed, per-stop reels, keyboard navigable.
Computes 3,682 km of great-circle legs. NOTE: the handle is @5001km.sidequest because that
counts road actually travelled; the figure is labelled "Straight line" so the two do not
read as contradicting each other.

**D2 skills — DONE.** `components/v2/SkillsFromWork.tsx`. Counts the `tech` arrays in
projects-data.ts at runtime, weighted by frequency and recency, laid out as a stratigraphy
by era band. Python leads at 7 projects.

**D3 highlight reel — DONE.** See section D above.

**Still open:** B1 (flying looks like floating), B2 (mouse-landing shake-off), B4 (drag +
anger level), B5 (dream images unclear), all of C (chat perch redesigns), A4 (perch
bounding boxes and the polaroids not being landable), and section F (backdrop rework,
in flight).

---

## H. Housekeeping

Agents building backdrops create throwaway preview routes under `app/v2/` to screenshot
their work, and do not always remove them. They would ship in a production build.

Removed so far: `rmtest1`, `rmtest2`, `routemap-preview`, `backdrops/shot`, `tech-check`,
`backdrops/ink-shot`. New ones keep appearing while a workflow is live: `app/ink-probe`
was created at 21:46, after a cleanup pass at 21:35.

`backdrops/shot` was not merely untidy: it contained six TS18047 errors and was breaking
`tsc --noEmit` for the whole project.

**DO NOT RUN `next build` WHILE A BACKDROP WORKFLOW IS LIVE.** Agents create and delete
routes under `app/` as they work, and a build started mid-write emits a partial
`app-paths-manifest.json`. The symptom is every route failing to prerender with
`PageNotFoundError: Cannot find module for page: /_document`, which looks like a
catastrophic config problem and is not: the compile succeeded, the manifest was just
written while the route table was moving. Wait for the workflow, sweep the routes, then
build. Deleting `.next` first is wise once the tree is stable.

Before any deploy, run `find app -name "page.tsx"` and confirm only these remain:
  app/page.tsx, app/projects/page.tsx,
  app/v2/page.tsx, app/v2/projects/page.tsx, app/v2/backdrops/page.tsx
Also delete stale generated stubs under `.next/types/app/` for any route removed, or
`tsc --noEmit` reports phantom errors for modules that no longer exist.

---

## I. What this environment can and cannot verify

Recorded after repeatedly drawing wrong conclusions from bad instrumentation. Read this
before trusting any automated claim about how something LOOKS.

**Cannot be measured from the agent's browser pane:**
- Anything drawn with WebGL. Without `preserveDrawingBuffer` the buffer is undefined once
  compositing happens, so `readPixels` in a later task returns empty. Reading inside the
  frame is also unreliable here because rAF never fires natively.
- Canvas layout. The pane hands the page a ZERO-SIZE viewport, so
  `getBoundingClientRect()` returns 0 and any component that sizes itself from its
  container correctly bails, leaving the canvas at its 300x150 default.
- Probing a context is destructive: calling `getContext('webgl2')` on a canvas that has
  not yet taken one CREATES it, so a probe cannot tell you which context a component
  chose. It can only tell you which one it just made.
- Cycling several WebGL components in one page session exhausts the browser's context
  pool. Components must not release their own contexts (React remounts the same canvas
  and a lost context never returns), so the release belongs in whatever swaps them. The
  A/B bench does this; the live page will need it too if sections ever stack GL backdrops.

**Can be trusted:** `tsc --noEmit`, `next build`, DOM structure and text, computed styles
and contrast ratios, canvas-2D pixel readback (that buffer persists), console errors, and
any pure logic driven through a dev handle (`canvas.__inkfield`, `__bird`, `__reel`).

**Practical rule:** verify correctness here, verify appearance with Jack. Do not report a
backdrop as broken on the strength of a pixel reading alone; that has now produced two
false alarms (Fluid twice) and one real find (Techno's `onScreen = false`).

---

## J. Bird polish round (2026-08-24, late)

**DONE — flight (B1).** Root cause was two things at once: `flyFlap` was symmetric
(130ms downstroke, 140ms recovery) AND its authored body offset was IN PHASE with the
wing, i.e. body up when the wing was up, which is backwards. Fixed in the rig rather than
the sprite, so a re-timing by the sprite owner survives it: the split point is derived
from the keyframe data, not hardcoded. Measured after: downstroke 98.3ms vs recovery
191.7ms (1:1.95), bob +2.59 at the top of the stroke and -2.59 at the bottom, 16px of real
body travel, forward pitch scaling with speed.

**DONE — cursor landing (B2).** Three outcomes chosen by pointer speed, not dwell time:
ride under 340 px/s, buck past 1500 px/s or 44px in one frame, or leave of his own accord
after 5.4-14.4s.

**DONE — drag and anger (B4).** Press is ambiguous until it travels, so the chat toggle
moved to pointerup and a drag starts at 5px of slop; this separates the two without a
timer that guesses. Anger charges by DISTANCE HAULED rather than time held, so picking him
up and setting him down is forgiven. Escape rolls run on a fixed 420ms tick so the odds
mean what they say rather than scaling with frame rate. Verified: shake 1.15 -> 3.32px and
escape odds 0.12 -> 0.72 across the three bands; anger 1 -> 0 in about 1.5s.

**DONE — cursor swap (approved by the client).** The cursor-hiding CSS is INJECTED with the
component and removed with it, deliberately NOT placed in v2.css: a stylesheet rule that
hides the pointer would outlive the code meant to draw one, and a failed mount would leave
a site with no cursor and nothing running to fix it. The class is written from evidence
that a cursor was actually painted that frame. Restores on link/button hover, reduced
motion, document.hidden, blur, click, a stalled loop, and unmount.

**DONE — look up (B3).** The jump and peck existed; the look up did not. Now a continuous
gaze state plus `lookUp` opening the sequence (lookUp -> jumpHigh -> peckAtCursor).

**DONE — perch contract (A4).** `data-perch` with an optional `data-perch-inset`, and
`data-perch-text` where the bird should stand on the ink of the first line rather than the
top of a mostly-empty column. Applied across nine components including the polaroid frames
the client named. Perches went 41 -> 55.

**TWO REAL BUGS found during that work:** `onCursor` could stick on forever if anything
other than the cursor logic took him off the synthetic perch, so he could never be sent to
the cursor again for the rest of the session. And the `setInterval` cursor-swap watchdog
did not fire AT ALL across 13.6s in a deprioritised tab, leaving the page with no visible
pointer; the "page has no cursor" case must not depend on a timer, so a check now also runs
on pointermove.

**STILL OPEN — chat perch art (section C).** The art agent died mid-response. Much of it
landed and typechecks: `branch` + `branchLeaf` (the "you can only see the leaf" fix),
`front`/`frontOpen` (the front-facing meditation body), `robe`, `book`, `nest`, and the
dream subjects `dreamWorm`/`dreamSeed`/`dreamBerry`/`dreamFeather`. NOT confirmed landed:
the DESK for the laptop typing perch (`desk` appears 0 times), and the flames/wisps and
page-flipping on the enchanted book. Re-run those two specifically rather than the whole
art brief.
