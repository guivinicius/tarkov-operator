#!/usr/bin/env node
// Generate build/icon.png — the single 1024x1024 source icon that
// electron-builder derives the macOS .icns and Windows .ico from.
// Usage: node scripts/generate-icon.js
//
// Zero dependencies: the mark is rendered analytically, anti-aliased by 8x
// supersampling with a box downsample, then encoded as a spec-valid PNG using
// only node:zlib (DEFLATE) and a local CRC32 table.
//
// Deliberately flat: three solid tokens, no gradients, no glow, no radar sweep.
// Gradients band visibly at 1024px, an outer glow eats the ring-to-background
// separation at 16px, and a sweep wedge disappears below 32px. Flat fills make
// banding impossible and keep tray edges crisp, so every subsample resolves to
// exactly one of three colors and the only blending is edge coverage.

const path = require("path");
const fs = require("fs");
const zlib = require("zlib");

const ICON_PATH = path.join(__dirname, "..", "build", "icon.png");

// ---------------------------------------------------------------------------
// Design tokens (src/renderer/styles.css)
// ---------------------------------------------------------------------------

const COLOR = {
  field: "#1a1a2e", // body background
  screen: "#16213e", // .header / .card background — the radar screen
  accent: "#4caf50", // .indicator.active / .tab.active — the app's green
};

// ---------------------------------------------------------------------------
// Geometry. Every stroke is expressed as a fraction of the 1024 canvas so 16px
// legibility is auditable: at 16px a feature must stay above ~1.4px, i.e.
// >= 0.088 of the canvas. Thin 1px hairlines vanish in the tray.
// ---------------------------------------------------------------------------

const SIZE = 1024;
const SUPERSAMPLE = 8;
const CENTER = SIZE / 2;

// 16px is the hard case, so the mark is pixel-hinted to it rather than left to
// the downsampler. 1024/16 = 64 and the center sits at 8 grid units, so every
// radius below is a whole number of units and each boundary lands exactly on a
// 16px pixel edge — and on 32, 64, 128, 256 and 512px edges too. Half-unit
// values would smear those edges across two tray pixels.
const GRID = SIZE / 16;
const SQUIRCLE_HALF = 7 * GRID; // 448px -> 1px transparent margin at 16px
const RING = { inner: 3 * GRID, outer: 5 * GRID }; // 128px stroke -> 2px at 16px
const TAB = { half: GRID, outer: 6 * GRID }; // 128px wide -> 2px, 1px past ring
// The center pip is square, not round. A circle of radius 1 tray pixel can only
// ever cover pi/4 of its 2x2 cell, so a round pip renders as a ~78% muddy blend
// at 16px however well aligned; an axis-aligned square covers those cells
// completely and stays pure green through the downsample.
const PIP = GRID; // 128px across -> a full, crisp 2x2 block at 16px

// ---------------------------------------------------------------------------
// Color. Subsamples are averaged in linear light so green-on-navy edges do not
// pick up dark fringes, then converted back to sRGB once per output pixel.
// ---------------------------------------------------------------------------

function srgbChannelToLinear(byte) {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgbByte(value) {
  const v = Math.min(1, Math.max(0, value));
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(c * 255);
}

function linear(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [
    srgbChannelToLinear((n >> 16) & 0xff),
    srgbChannelToLinear((n >> 8) & 0xff),
    srgbChannelToLinear(n & 0xff),
  ];
}

const LIN = {
  field: linear(COLOR.field),
  screen: linear(COLOR.screen),
  accent: linear(COLOR.accent),
};

// ---------------------------------------------------------------------------
// Shading
// ---------------------------------------------------------------------------

// Superellipse |x/a|^5 + |y/a|^5 <= 1, kept in its raised form so the hot path
// is integer-power multiplication with no pow() and no root.
function pow5(v) {
  const v2 = v * v;
  return v2 * v2 * v;
}

// Radii are compared squared, which keeps the inner loop free of sqrt.
const RING_IN_SQ = RING.inner * RING.inner;
const RING_OUT_SQ = RING.outer * RING.outer;
const TAB_OUT_SQ = TAB.outer * TAB.outer;

// Tabs start at RING.inner rather than carrying their own inner radius: any
// overlap inward would poke a visible step into the interior circle, and a gap
// would leave a seam. Sharing the bound makes both defects unrepresentable.
function isMark(adx, ady, r2) {
  if (adx <= PIP && ady <= PIP) return true;
  if (r2 < RING_IN_SQ) return false;
  if (r2 <= RING_OUT_SQ) return true;
  return r2 <= TAB_OUT_SQ && (adx <= TAB.half || ady <= TAB.half);
}

function shade(row, x) {
  const adx = Math.abs(x - CENTER);
  if (pow5(adx / SQUIRCLE_HALF) + row.ay5 > 1) return null; // outside silhouette
  const r2 = adx * adx + row.dy2;
  if (isMark(adx, row.ady, r2)) return LIN.accent;
  return r2 < RING_IN_SQ ? LIN.screen : LIN.field;
}

// Terms that vary only with y are precomputed per subsample row.
function buildRows() {
  const step = 1 / SUPERSAMPLE;
  const rows = [];
  for (let i = 0; i < SIZE * SUPERSAMPLE; i++) {
    const ady = Math.abs(i * step + step / 2 - CENTER);
    rows.push({ ady, dy2: ady * ady, ay5: pow5(ady / SQUIRCLE_HALF) });
  }
  return rows;
}

// Box-downsample SUPERSAMPLE x SUPERSAMPLE subsamples into one output pixel.
function renderRgba() {
  const rows = buildRows();
  const step = 1 / SUPERSAMPLE;
  const total = SUPERSAMPLE * SUPERSAMPLE;
  const pixels = Buffer.alloc(SIZE * SIZE * 4);

  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let covered = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        const row = rows[py * SUPERSAMPLE + sy];
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const rgb = shade(row, px + sx * step + step / 2);
          if (rgb === null) continue;
          sr += rgb[0]; // opaque where covered, so alpha weighting is 1
          sg += rgb[1];
          sb += rgb[2];
          covered++;
        }
      }
      if (covered === 0) continue; // leave fully transparent
      const i = (py * SIZE + px) * 4;
      pixels[i] = linearToSrgbByte(sr / covered);
      pixels[i + 1] = linearToSrgbByte(sg / covered);
      pixels[i + 2] = linearToSrgbByte(sb / covered);
      pixels[i + 3] = Math.round((covered / total) * 255);
    }
  }
  return pixels;
}

// ---------------------------------------------------------------------------
// PNG encoder. node:zlib has no crc32, so build the table locally.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

// Filter type 2 (Up) on every scanline: row 0 uses an all-zero prior row,
// which decodes back to the raw bytes.
function filterScanlines(pixels) {
  const stride = SIZE * 4;
  const out = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const row = y * stride;
    const dst = y * (stride + 1);
    out[dst] = 2;
    for (let i = 0; i < stride; i++) {
      const prior = y === 0 ? 0 : pixels[row - stride + i];
      out[dst + 1 + i] = (pixels[row + i] - prior) & 0xff;
    }
  }
  return out;
}

function encodePng(pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: truecolor + alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const idat = zlib.deflateSync(filterScanlines(pixels), { level: 9 });

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------

function atTraySize(px) {
  return ((px * 16) / SIZE).toFixed(2);
}

function main() {
  console.log(`Rendering ${SIZE}x${SIZE} icon at ${SUPERSAMPLE}x supersample...`);
  const png = encodePng(renderRgba());

  const buildDir = path.dirname(ICON_PATH);
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  // Write atomically so a crash never leaves a truncated PNG behind.
  const tmpPath = ICON_PATH + ".tmp";
  fs.writeFileSync(tmpPath, png);
  fs.renameSync(tmpPath, ICON_PATH);

  const stroke = RING.outer - RING.inner;
  const reach = TAB.outer - RING.outer;
  console.log(`\nIcon written to ${ICON_PATH}`);
  console.log(`  dimensions:   ${SIZE}x${SIZE} RGBA`);
  console.log(`  size:         ${(png.length / 1024).toFixed(1)} KB`);
  console.log(`  ring stroke:  ${stroke}px (${atTraySize(stroke)}px at 16px)`);
  console.log(`  tab width:    ${TAB.half * 2}px (${atTraySize(TAB.half * 2)}px at 16px)`);
  console.log(`  tab reach:    ${reach}px past the ring (${atTraySize(reach)}px at 16px)`);
  console.log(`  pip (square): ${PIP * 2}px (${atTraySize(PIP * 2)}px at 16px)`);
  console.log(`  edge margin:  ${SQUIRCLE_HALF - TAB.outer}px`);
}

main();
