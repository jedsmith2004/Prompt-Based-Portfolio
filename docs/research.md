# Research — award-winning sites, effects, and what is transferable

Jack's brief opens with research: award-winning portfolios, effects libraries,
artistic projects. This is that, kept as **techniques we can use** rather than a
list of links to admire. Every entry ends with what it changes here.

Sources are listed at the bottom. Findings are paraphrased; nothing is copied.

---

## 1. What actually wins, according to people who judge it

Reading across a judged 2026 round-up (By-Kin, Iventions, Mat Voyce, Uncommon
Studio, Minh Pham) the pattern is consistent and slightly deflating:

- **Restraint is the differentiator, not ambition.** The WebGL winners use 3D for
  *atmosphere* — Iventions lights each project like a spotlit installation — not
  for spectacle. Minh Pham's site layers WebGL *beneath* the motion system to
  frame the work rather than compete with it.
- **Award-winning sites are built from a small vocabulary of effects, combined
  with taste.** Not many effects. A few, chosen well, applied consistently.
- **Transition discipline is the tell.** The round-up's sharpest line is that
  cheap sites cut and award-winners move: continuity between states is what
  separates the tiers.
- **Motion must never block readability.** Mat Voyce won on kinetic type
  specifically because the sequencing keeps text readable throughout.
- **The engineering you cannot see in a screenshot is what decides it.** 60fps on
  mid-range mobile, capped DPR, render-only-when-visible, compressed assets.
- **Ship a fallback.** Ambition without one loses the third of the audience whose
  hardware cannot run the heavy path.

**What this changes here.**

1. It validates the performance budget in the spec — that was the right instinct
   and it is worth more than another effect.
2. It reframes **P0-PALETTE**. Six sections with six colour schemes is only a win
   if the *transitions* between them are choreographed. Six abrupt palette
   changes would be six cuts, which is the cheap-site tell. The crossfade has to
   carry the type colours, not just the canvas.
3. It is an argument for **cutting** things. We have eight backdrop worlds, a
   companion, an ASCII wall, a neural playground, polaroids, a 3D reel, a route
   map and a skills cloud. The winners have a *small* vocabulary. Worth asking
   which of ours are the vocabulary and which are noise.
4. **No fallback exists** for the WebGL backdrops. That is a real gap and is now
   in the plan.

---

## 2. ASCII on the GPU (Codrops, "Efecto")

The technique that is genuinely new to us:

- **Glyphs generated procedurally in GLSL**, not sampled from a bitmap atlas.
  Each character is a function over a 5x7 grid returning filled or empty for any
  position — a colon tests two grid cells, an asterisk ORs a centre, a vertical,
  a horizontal and two diagonals. No texture, no atlas upload, and the character
  set becomes code rather than an asset.
- Luminance for the density ramp uses perceptual weights, `0.299R + 0.587G +
  0.114B`, mapping dark to dense glyphs and light to sparse ones.
- **Error-diffusion dithering has to run on the CPU.** Floyd-Steinberg and
  friends are inherently sequential — each pixel depends on pixels already
  processed — so it cannot be a fragment shader. Worth knowing before trying.
- **Atkinson dithering redistributes only 75% of the error**, which throws away
  some detail in exchange for higher contrast and a crunchy quality that suits
  **limited palettes**.

**What this changes here.**

- Our three ASCII pieces (`ClimbingWall`, `HighlightReel`, `Techno`) use a
  prebuilt glyph atlas blitted per cell on canvas-2D. That is already fast and
  works on the paper palette. The GLSL route is an **upgrade path if we need
  higher cell density or per-cell effects**, not a rewrite to do for its own
  sake. Filed as an option, not a task.
- I checked our luminance handling against the `0.299/0.587/0.114` finding and
  it is a **false alarm**: `HighlightReel` shades its intermediate buffer to
  `rgb(g,g,g)` before sampling, so reading a single channel is already exact.
  Recorded so nobody re-opens it.
- **Atkinson dithering is the real prize.** Our palette is paper and ink — a
  limited palette is exactly the case it is designed for. Two immediate uses:
  the **Polaroids** camera-snap, where the grey-and-blur treatment is currently
  a plain desaturation, and **InkWash**, which Jack has twice called ugly. A
  crunchy Atkinson dither on paper/ink is on-brand, cheap, and is a genuinely new
  idea rather than another pass at the same one.

---

## 3. Metaballs, for the Fluid rebuild

Fluid is broken — Jack has said so twice and I am no longer arguing with him
about it. The rebuild has two viable routes:

- **2D**: draw a radial gradient per ball into an offscreen buffer, alpha-blend
  them, then threshold the accumulated field. Cheap, canvas-2D, no GL context.
- **3D / SDF**: sphere distance is `length(p) - r`; combine with a **smooth
  minimum** (`smin`), whose `k` parameter is the merge radius. Start around
  `k = 0.5` and raise it for blobbier merges. This is what produces a visible
  *neck* between two blobs before they fuse, which was exactly the quality Jack
  said was missing the first time.

Performance, both routes:

- **Render at half or a third resolution and upscale.** Metaballs are smooth by
  nature, so the visual cost is close to nil and the fill-rate saving is large.
- Above ~50 balls, use a spatial grid: a ball of radius `r` only influences
  pixels within roughly `3r`.

**What this changes here.** The rebuild should be the 2D accumulate-and-threshold
route at half resolution. It keeps Fluid off the WebGL context budget entirely —
which matters because we cap live contexts — and `smin`'s neck behaviour can be
reproduced by thresholding a summed field, which is what the existing implicit
`f(p) = Σ r²/|p-c|²` already does. The likely bug is threshold and intensity, not
the maths. **Check the threshold against `intensity` before rewriting anything.**

---

## 4. Scroll, for the bird

The lag Jack has now reported three times has a named cause and a named fix.

- The one-frame-behind problem is what happens when **native scroll and a rAF
  loop are two different clocks**. The browser composites the scroll, then your
  rAF reads `scrollY` and paints one frame late, every frame.
- The Lenis fix is to make everything read from **one** tick: `autoRaf: false`,
  drive `lenis.raf()` from a single ticker, and disable lag smoothing so
  returning to a tab does not jump.
- Virtual scroll turns scroll position into a JS value that every consumer reads
  from the same tick, which removes the race structurally rather than papering
  over it. It is also the "weighted smooth scroll" that By-Kin was specifically
  credited for.

**What this changes here.** It confirms the diagnosis and sharpens the options:

- **Preferred, and free: take JS out of the scroll path entirely.** Put the bird
  in document flow (absolutely positioned in the page rather than in a fixed
  overlay) so the compositor scrolls him with the page. Zero lag by
  construction, no dependency, nothing to keep in sync. His perch coordinates
  are already document-space, so the maths is already right.
- **Lenis is a separate decision about how the whole page should feel**, not a
  bird fix. If we adopt it, it must own the tick that the companion, the ink
  field and the worlds all read from. Worth an A/B on its own.

---

## 5. Things worth stealing that we are not doing

- **Scroll-driven camera descent** with aggressive budgeting (capped DPR,
  render-when-visible) — we do the budgeting, we do not do the camera.
- **GSAP-paced reveals as choreography**, where transitions act as camera moves
  rather than fades. Our section reveals are a single CSS class flip. That is the
  cheap-cut pattern the round-up calls out.
- **Kinetic typography** — letters stretching, snapping, recombining on a
  timeline. We have a masked-and-lifted hero and nothing else. Given the site is
  set as an engineering journal, a restrained kinetic treatment on the plate
  titles is on-brand and currently absent.

---

## Sources

- [10 Award-Winning Websites of 2026, Judged — Hon Tran](https://www.hontran.dev/blog/best-award-winning-websites-2026)
- [Efecto: Building Real-Time ASCII and Dithering Effects with WebGL Shaders — Codrops](https://tympanus.net/codrops/2026/01/04/efecto-building-real-time-ascii-and-dithering-effects-with-webgl-shaders/)
- [Creating an ASCII Shader Using OGL — Codrops](https://tympanus.net/codrops/2024/11/13/creating-an-ascii-shader-using-ogl/)
- [Drawing 2D Metaballs with WebGL2 — Codrops](https://tympanus.net/codrops/2021/01/19/drawing-2d-metaballs-with-webgl2/)
- [How to Create Interactive, Droplet-like Metaballs with Three.js and GLSL — Codrops](https://tympanus.net/codrops/2025/06/09/how-to-create-interactive-droplet-like-metaballs-with-three-js-and-glsl/)
- [Metaballs: How to Create Mesmerizing Blob Art With Code — Lumitree](https://lumitree.art/blog/metaballs)
- [Lenis — darkroom.engineering](https://github.com/darkroomengineering/lenis)
- [Building Smooth Scroll in 2025 with Lenis — Edoardo Lunardi](https://www.edoardolunardi.dev/blog/building-smooth-scroll-in-2025-with-lenis)
- [WebGL Website Examples 2026 — Hon Tran](https://www.hontran.dev/blog/webgl-website-examples)
- [Letting the Creative Process Shape a WebGL Portfolio — Codrops](https://tympanus.net/codrops/2025/11/27/letting-the-creative-process-shape-a-webgl-portfolio/)
