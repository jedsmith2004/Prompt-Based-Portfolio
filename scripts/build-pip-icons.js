/* ============================================================================
   Draw Pip once, at build time, into every icon the site hands out.

   Jack, 2026-08-27: "Can you make pip the tab logo/site image".

   The tab used to show public/Logo.png — a mark from the Prismic site in 2024,
   which is two sites ago. The bird is the thing on this site that people
   actually remember, he is already drawn in a form that survives being made
   tiny, and he costs nothing to reuse: components/v2/sparrowSprite.ts is pure
   data, so his rest pose can be composited here exactly the way the companion
   composites it in the browser.

   WHY GENERATE RATHER THAN EXPORT ONCE BY HAND. The sprite is the source of
   truth for what Pip looks like. If somebody redraws his wing or moves the
   vermilion on his beak, a hand-exported PNG silently becomes a picture of a
   bird the site no longer has. This reads the same file the site reads, so the
   icons can never drift from him. Same argument, and the same shape, as
   scripts/build-route-countries.js.

   WHAT IT WRITES
     app/icon.svg                  the tab icon. SVG because the art is a
                                   20x28 grid of flat colours: as rects it is
                                   exact at every size and about 2kB, where a
                                   PNG has to pick a size and blur at the rest.
     public/favicon.ico            the fallback for anything that will not take
                                   an SVG icon, 16 and 32 px.
     public/icon-192.png           the manifest's icons, which is what an
     public/icon-512.png           Android home screen uses.
     app/apple-icon.png            180x180, iOS home screen.
     app/opengraph-image.png       1200x630, the card on every share.
     app/opengraph-image.alt.txt   its alt text, which Next serves as
                                   og:image:alt.

   NO NEW DEPENDENCIES. PNG is a signature, three chunks and a zlib stream, and
   ICO is a six byte header and a directory entry in front of a PNG. Both are
   written out below. `typescript` is already a dependency and is used to read
   the sprite, so nothing here is installed for the sake of five pictures.

   Run: node scripts/build-pip-icons.js
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');

/* --------------------------------------------------------------------------
   the sprite, read from the file the site reads

   `transpileModule` rather than a regex over the source: the sprite is 9000
   lines of nested literals with `as const` and mapped types over them, and the
   compiler is already here and already knows how to take the types off.
   -------------------------------------------------------------------------- */
function loadSprite() {
  const src = fs.readFileSync(
    path.join(ROOT, 'components', 'v2', 'sparrowSprite.ts'),
    'utf8'
  );
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 }
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', js)(module.exports, module, require);
  return module.exports;
}

/* The 5x7 alphabet the bird's own chat window is set in, lifted from
   components/v2/Companion.tsx the same way — it is the only type on this site
   that can be drawn without a font file, which is what the card needs. */
function loadGlyphs() {
  const src = fs.readFileSync(
    path.join(ROOT, 'components', 'v2', 'Companion.tsx'),
    'utf8'
  );
  const start = src.indexOf('const GLYPHS');
  const open = src.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  return new Function(`return ${src.slice(open, end + 1)}`)();
}

/* --------------------------------------------------------------------------
   compositing

   Steps 1 and 2 of HOW TO COMPOSITE A FRAME at the top of sparrowSprite.ts,
   with no frame overrides, which is the rest pose: every part takes `def.rest`
   and sits at its anchor. Later parts paint over earlier ones; '.' means leave
   what is underneath. There is no alpha in the model and none is invented.
   -------------------------------------------------------------------------- */
function compositeRestPose(sprite) {
  const { PARTS, DRAW_ORDER, SPRITE_WIDTH: W, SPRITE_HEIGHT: H } = sprite;
  const grid = Array.from({ length: H }, () => Array(W).fill('.'));
  for (const part of DRAW_ORDER) {
    const def = PARTS[part];
    const spr = def.variants[def.rest];
    const ox = def.anchor.x + (spr.ox || 0);
    const oy = def.anchor.y + (spr.oy || 0);
    spr.matrix.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        if (ch === '.') return;
        const x = ox + c;
        const y = oy + r;
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        grid[y][x] = ch;
      });
    });
  }
  return grid;
}

/** Tightest box containing anything not in `skip`. */
function bounds(grid, skip = new Set()) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  grid.forEach((row, y) =>
    row.forEach((ch, x) => {
      if (ch === '.' || skip.has(ch)) return;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    })
  );
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/* --------------------------------------------------------------------------
   a raster, and a PNG to put it in
   -------------------------------------------------------------------------- */
const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16)
];

function raster(w, h, fill) {
  const px = Buffer.alloc(w * h * 4);
  if (fill) {
    const [r, g, b] = hex(fill);
    for (let i = 0; i < w * h; i++) {
      px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = 255;
    }
  }
  return { w, h, px };
}

function fillRect(img, x, y, w, h, colour) {
  const [r, g, b] = hex(colour);
  for (let yy = Math.max(0, y); yy < Math.min(img.h, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(img.w, x + w); xx++) {
      const i = (yy * img.w + xx) * 4;
      img.px[i] = r; img.px[i + 1] = g; img.px[i + 2] = b; img.px[i + 3] = 255;
    }
  }
}

/** Blit a palette grid at `scale`, skipping '.' and anything in `skip`. */
function blitGrid(img, grid, palette, x, y, scale, skip = new Set()) {
  grid.forEach((row, r) =>
    row.forEach((ch, c) => {
      if (ch === '.' || skip.has(ch)) return;
      const colour = palette[ch];
      if (!colour) return;
      fillRect(img, x + c * scale, y + r * scale, scale, scale, colour);
    })
  );
}

/** Draw a string in the 5x7 alphabet. Returns its width in px. */
function blitText(img, glyphs, text, x, y, scale, colour) {
  const ADVANCE = 6;
  let cursor = x;
  for (const raw of text) {
    const ch = glyphs[raw] ? raw : glyphs[raw.toUpperCase()] ? raw.toUpperCase() : ' ';
    const rows = glyphs[ch];
    if (rows) {
      rows.forEach((bits, r) => {
        for (let c = 0; c < 5; c++) {
          if (bits & (0x10 >> c)) {
            fillRect(img, cursor + c * scale, y + r * scale, scale, scale, colour);
          }
        }
      });
    }
    cursor += ADVANCE * scale;
  }
  return cursor - x - scale; /* trailing gap is not part of the word */
}

function textWidth(text, scale) {
  return text.length * 6 * scale - scale;
}

/* ---- PNG ---------------------------------------------------------------- */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(img) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0);
  ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8;   /* bit depth */
  ihdr[9] = 6;   /* colour type: RGBA */
  /* 10..12 are compression, filter and interlace, all zero and all required */
  const stride = img.w * 4;
  const rawLen = (stride + 1) * img.h;
  const rawData = Buffer.alloc(rawLen);
  for (let y = 0; y < img.h; y++) {
    rawData[y * (stride + 1)] = 0; /* filter: none. The art is flat colour, so
                                      a predictor would cost cycles and save
                                      nothing zlib is not already finding. */
    img.px.copy(rawData, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rawData, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---- ICO ---------------------------------------------------------------- */
/* PNG-compressed entries rather than BMP. Every browser in use has read those
   since 2007, and a BMP entry would need its own upside-down scanlines and an
   AND mask for transparency that the PNG already carries. */
function encodeIco(images) {
  const pngs = images.map(encodePng);
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);              /* reserved */
  dir.writeUInt16LE(1, 2);              /* type: icon */
  dir.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map((img, i) => {
    const e = Buffer.alloc(16);
    e[0] = img.w >= 256 ? 0 : img.w;    /* 0 means 256 */
    e[1] = img.h >= 256 ? 0 : img.h;
    e[2] = 0;                            /* palette size */
    e[3] = 0;                            /* reserved */
    e.writeUInt16LE(1, 4);               /* colour planes */
    e.writeUInt16LE(32, 6);              /* bits per pixel */
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return e;
  });
  return Buffer.concat([dir, ...entries, ...pngs]);
}

/* ---- SVG ---------------------------------------------------------------- */
/* One rect per horizontal run of one colour, which is what makes this small:
   Pip's flat bands collapse from 560 rects to about 180. `shape-rendering`
   keeps the grid hard when a browser scales it to 16px. */
function gridToSvg(grid, palette, opts) {
  const { pad = 0, ground = null, skip = new Set() } = opts || {};
  const b = bounds(grid, skip);
  /*
     SQUARE, BECAUSE A FAVICON HAS NO SAY IN ITS OWN ASPECT.

     Pip's box is 15 wide by 19 tall. Handed to a browser as a 19x23 viewBox
     it gets letterboxed into the square the tab actually has, and the ground
     colour stops at the art instead of filling the tile — so the paper reads
     as a stripe behind him rather than as the page he stands on. The canvas
     is squared here and he is centred in it, which is the same thing the ICO
     and the apple icon do.
  */
  const side = Math.max(b.w, b.h) + pad * 2;
  const ox = Math.round((side - b.w) / 2);
  const oy = Math.round((side - b.h) / 2);
  const parts = [];
  if (ground) parts.push(`<rect width="${side}" height="${side}" fill="${ground}"/>`);
  for (let y = 0; y < b.h; y++) {
    let x = 0;
    while (x < b.w) {
      const ch = grid[b.y0 + y][b.x0 + x];
      if (ch === '.' || skip.has(ch) || !palette[ch]) { x++; continue; }
      let run = 1;
      while (x + run < b.w && grid[b.y0 + y][b.x0 + x + run] === ch) run++;
      parts.push(
        `<rect x="${x + ox}" y="${y + oy}" width="${run}" height="1" fill="${palette[ch]}"/>`
      );
      x += run;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="Pip, the pixel sparrow">` +
    parts.join('') +
    `</svg>\n`
  );
}

/* ==========================================================================
   the pictures
   ========================================================================== */
const PAPER = '#E4DFD3';
const INK = '#17140F';
const INK3 = '#655C4F';
const VERM = '#B5402F';

function main() {
  const sprite = loadSprite();
  const glyphs = loadGlyphs();
  const grid = compositeRestPose(sprite);
  const palette = sprite.PALETTE;

  /* The cast shadow comes off every icon. It is a ground shadow for a bird
     standing on a page, and in a tab there is no page for him to stand on —
     at 16px it reads as a grey smudge under him rather than as depth. 'L' is
     the only character it uses. */
  const NO_SHADOW = new Set(['L']);
  const bird = bounds(grid, NO_SHADOW);

  /*
     THE TAB ICON HAS NO GROUND. THE ICONS THAT GET COMPOSITED DO.

     Jack, 2026-08-27: "Make the background transparent behind pip / In the tab
     logo".

     Only the tab icon, and the distinction is not fussiness. A browser draws a
     favicon straight onto its own tab strip, which is a surface the site does
     not own and which changes colour with the browser theme — a paper tile
     there is a light rectangle sitting in a dark toolbar, which is exactly the
     thing that reads as a badly cut-out logo. Transparent, he sits on whatever
     the browser is actually made of.

     The other three keep their paper on purpose:

       apple-icon      iOS does not honour alpha in a touch icon. It composites
                       it onto BLACK, so a transparent Pip would arrive on a
                       home screen as a bird in a black square.
       icon-192/512    the manifest declares one of these `maskable`, and a
                       maskable icon is required to be full bleed: the launcher
                       crops it to whatever shape it likes and transparent
                       corners would be cropped into visible notches.
       opengraph       a 1200x630 card is composited onto whatever colour the
                       feed happens to use, and og:image has no alpha contract
                       at all. It needs a ground and the ground is the paper.

     He survives the swap because he is not drawn in one value: the outline is
     ink and does vanish against a dark tab, but the crown and mantle are
     plumage brown and the throat and breast are paper-3, so the silhouette is
     carried by the light half of him rather than by the outline. Measured
     below, and printed, so that a future change to the palette that quietly
     turns him into one dark mass shows up here rather than in a tab.
  */
  const svg = gridToSvg(grid, palette, { pad: 2, ground: null, skip: NO_SHADOW });
  fs.writeFileSync(path.join(ROOT, 'app', 'icon.svg'), svg);

  /* ---- favicon.ico ---- */
  /* One sprite pixel per 1 and 2 device pixels. Anything that is not a whole
     multiple would resample flat colour into fringes, so the sizes are chosen
     to fit the art rather than the art squeezed to fit round sizes.

     `null` rather than PAPER: this is the same tab icon, for browsers that
     will not take the SVG, so it has to make the same promise about its
     background. PNG carries the alpha, and `raster` leaves untouched pixels at
     zero alpha rather than filling them. */
  /*
     32 AND 48, NOT 16 AND 32, AND THE REASON IS THAT HE IS TALLER THAN A
     FAVICON.

     Pip's box is 15 wide by 19 tall. A 16x16 entry cannot hold 19 rows at any
     whole scale, and the old arithmetic did not notice: it clamped the scale
     up to 1, centred a 19 row bird in a 16 row canvas, and wrote him at y=-2,
     so the ICO shipped with the top of his head cut off. The paper ground hid
     how wrong it looked; transparency did not.

     Pixel art cannot be rescued by resampling — a 16/19 downscale is exactly
     the fractional filtering that turns flat bands into fringes — so the fix
     is to stop asking for a canvas he does not fit in. 32 takes him at scale
     1 and 48 at scale 2, both whole, both centred, neither clipped. Browsers
     that want 16 downscale the 32 themselves, which is what they do for most
     favicons in existence, and every browser that matters is taking the SVG
     above in preference to any of this.

     The assertion is the point of the rewrite: a future change to the sprite
     that makes him taller now fails the build instead of quietly beheading
     him again.
  */
  const ico = encodeIco([32, 48].map((size) => {
    const scale = Math.max(1, Math.floor(size / Math.max(bird.w, bird.h)));
    if (bird.h * scale > size || bird.w * scale > size) {
      throw new Error(
        `favicon ${size}px: Pip is ${bird.w}x${bird.h} at scale ${scale} and does ` +
          `not fit. Raise the size or lower the scale.`
      );
    }
    const img = raster(size, size, null);
    const x = Math.round((size - bird.w * scale) / 2) - bird.x0 * scale;
    const y = Math.round((size - bird.h * scale) / 2) - bird.y0 * scale;
    blitGrid(img, grid, palette, x, y, scale, NO_SHADOW);
    return img;
  }));
  fs.writeFileSync(path.join(ROOT, 'public', 'favicon.ico'), ico);

  /* ---- public/icon-192.png, public/icon-512.png ---- */
  /* The manifest's icons, which is what Android puts on a home screen. It will
     not use the SVG and it will not use a 32px ICO without blurring it, so the
     two sizes the spec asks for are drawn properly here. Both are whole
     multiples of the sprite, for the reason above. */
  for (const size of [192, 512]) {
    const scale = Math.floor(size / (bird.h + 5));
    const img = raster(size, size, PAPER);
    const x = Math.round((size - bird.w * scale) / 2) - bird.x0 * scale;
    const y = Math.round((size - bird.h * scale) / 2) - bird.y0 * scale;
    blitGrid(img, grid, palette, x, y, scale, NO_SHADOW);
    fs.writeFileSync(path.join(ROOT, 'public', `icon-${size}.png`), encodePng(img));
  }

  /* ---- app/apple-icon.png ---- */
  /* iOS puts this on a home screen at 180px and rounds the corners itself, so
     it wants a full-bleed square with the subject well inside the rounding. */
  {
    const size = 180;
    const scale = 6;
    const img = raster(size, size, PAPER);
    const x = Math.round((size - bird.w * scale) / 2) - bird.x0 * scale;
    const y = Math.round((size - bird.h * scale) / 2) - bird.y0 * scale;
    blitGrid(img, grid, palette, x, y, scale, NO_SHADOW);
    fs.writeFileSync(path.join(ROOT, 'app', 'apple-icon.png'), encodePng(img));
  }

  /* ---- app/opengraph-image.png ---- */
  /*
   * THE CARD IS THE BIRD ON A RULE, and the type is his own.
   *
   * The site is set in Bricolage Grotesque, and none of it can be drawn here:
   * rendering a real face needs a rasteriser and a font file, and neither is
   * worth adding for one picture. The 5x7 alphabet in Companion.tsx can be
   * drawn from bits, it is genuinely part of this site rather than a stand-in,
   * and it is the voice of the thing standing next to it — the card is Pip's
   * calling card, so it is set in Pip's lettering.
   *
   * He stands ON the rule rather than beside it because the hard rule is the
   * site's one structural signature: every plate hangs off one.
   *
   * CENTRED, AND MEASURED RATHER THAN PLACED. The first cut put the bird and
   * the type in a column down the left and left the right sixty per cent of
   * the card as empty paper, which in a feed reads as a picture that failed to
   * load. Everything is centred on the same axis now and every x is solved
   * from the width of the thing it is centring, so changing the tagline cannot
   * quietly push it off the edge. The rule is exactly as wide as the tagline,
   * which is what ties the three bands together.
   */
  {
    const W = 1200;
    const H = 630;
    const img = raster(W, H, PAPER);

    /* The bird carries the card and the type captions it. Set at the same
       weight they compete, and a 5x7 alphabet blown up to match a 266px bird
       stops reading as lettering and starts reading as a logo for a game this
       is not. He is the subject; the words are the plate caption under him. */
    const birdScale = 16;
    const nameScale = 8;
    const tagScale = 4;
    const name = 'JACK SMITH';
    const tag = 'BUILDS FROM THE METAL UP';

    const tagW = textWidth(tag, tagScale);
    const nameW = textWidth(name, nameScale);
    const birdW = bird.w * birdScale;
    const centre = (w) => Math.round((W - w) / 2);

    /* The rule takes the widest measure on the card, so nothing overhangs it */
    const ruleW = Math.max(tagW, nameW);
    const ruleX = centre(ruleW);
    /* Solved so the air above the bird and below the last mark match, rather
       than picked: the card is symmetric or it looks like it slipped. */
    const ruleY = 374;

    /* feet on the rule */
    blitGrid(
      img, grid, palette,
      centre(birdW) - bird.x0 * birdScale,
      ruleY - bird.h * birdScale - bird.y0 * birdScale,
      birdScale, NO_SHADOW
    );
    fillRect(img, ruleX, ruleY, ruleW, 5, INK);

    const nameY = ruleY + 44;
    blitText(img, glyphs, name, centre(nameW), nameY, nameScale, INK);

    const tagY = nameY + 7 * nameScale + 26;
    blitText(img, glyphs, tag, centre(tagW), tagY, tagScale, INK3);

    /* One vermilion mark, which is all the site ever allows itself: the same
       gesture as `.v2-em-verm`, a rule under the phrase it is marking. */
    fillRect(img, centre(tagW), tagY + 7 * tagScale + 14, tagW, 4, VERM);

    /* The two margins, reported so a change to any scale above shows up as an
       asymmetry here rather than as a card nobody looked at. */
    const topAir = ruleY - bird.h * birdScale;
    const bottomAir = H - (tagY + 7 * tagScale + 14 + 4);
    console.log(`  og card air: top ${topAir}px, bottom ${bottomAir}px`);

    fs.writeFileSync(path.join(ROOT, 'app', 'opengraph-image.png'), encodePng(img));
    fs.writeFileSync(
      path.join(ROOT, 'app', 'opengraph-image.alt.txt'),
      'Pip, the pixel sparrow from jacksmith.me, standing on a hard rule above ' +
        'the words Jack Smith, builds from the metal up.\n'
    );
  }

  /*
     CAN HE STILL BE SEEN WITH THE GROUND TAKEN AWAY?

     The tab icon is transparent now, so the browser's own toolbar is the
     ground and the ink outline is worth nothing on a dark one. What has to
     carry him there is everything that is NOT ink: the plumage, the breast and
     the beak. This counts them, and it is printed rather than asserted because
     the right threshold is a judgement — but if a palette change ever drops
     the light share toward zero, it shows up here.
  */
  {
    const counts = {};
    for (const row of grid) {
      for (const ch of row) {
        if (ch === '.' || NO_SHADOW.has(ch)) continue;
        counts[ch] = (counts[ch] || 0) + 1;
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    /* K is the outline and M the deep shade; both disappear into a dark tab. */
    const dark = (counts.K || 0) + (counts.M || 0);
    const pct = Math.round(((total - dark) / total) * 100);
    console.log(
      `  tab icon on a dark ground: ${pct}% of his ${total} inked pixels are ` +
        `not outline (${total - dark} carrying, ${dark} vanishing)`
    );
  }

  const size = (p) => fs.statSync(path.join(ROOT, p)).size;
  console.log('bird box (no shadow):', bird);
  for (const f of [
    'app/icon.svg',
    'public/favicon.ico',
    'public/icon-192.png',
    'public/icon-512.png',
    'app/apple-icon.png',
    'app/opengraph-image.png'
  ]) {
    console.log(`  ${f.padEnd(28)} ${String(size(f)).padStart(7)} bytes`);
  }
}

main();
