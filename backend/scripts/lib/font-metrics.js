/**
 * scripts/lib/font-metrics.js
 *
 * The two things generate-images.js needs from a TrueType font, read straight
 * from the file with no dependency: which characters it has a glyph for, and
 * how wide each one is.
 *
 * WHY
 *   A card is rasterised with ONLY the fonts in backend/fonts/, so it renders
 *   the same everywhere. That makes two questions answerable exactly instead of
 *   by a guessed average width:
 *     - Will this text fit?        - sum of advance widths (hmtx)
 *     - Will this text render?     - is every character in the font (cmap)?
 *   The second is the one that matters. A character the font lacks renders as
 *   the font's "NO GLYPH" box, and the image is uploaded permanently.
 *
 * Kerning is ignored, so a measured width can be off by a few percent; the
 * composer leaves a margin for that.
 *
 * Reads cmap formats 4 (BMP) and 12 (full Unicode), which is what every
 * modern TrueType font carries.
 */
"use strict";

const fs = require("fs");

function tables(buf) {
  const count = buf.readUInt16BE(4);
  const out = {};
  for (let i = 0; i < count; i++) {
    const rec = 12 + i * 16;
    out[buf.toString("latin1", rec, rec + 4)] = { offset: buf.readUInt32BE(rec + 8), length: buf.readUInt32BE(rec + 12) };
  }
  return out;
}

// codepoint -> glyph id, from the best Unicode subtable present.
function readCmap(buf, cmap) {
  const n = buf.readUInt16BE(cmap.offset + 2);
  let best = null;
  for (let i = 0; i < n; i++) {
    const rec = cmap.offset + 4 + i * 8;
    const platform = buf.readUInt16BE(rec);
    const encoding = buf.readUInt16BE(rec + 2);
    const sub = cmap.offset + buf.readUInt32BE(rec + 4);
    const format = buf.readUInt16BE(sub);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    if (format === 12) { best = { sub, format }; break; }
    if (format === 4 && !best) best = { sub, format };
  }
  if (!best) throw new Error("font has no Unicode cmap subtable (format 4 or 12)");

  const map = new Map();
  const { sub, format } = best;
  if (format === 12) {
    const groups = buf.readUInt32BE(sub + 12);
    for (let g = 0; g < groups; g++) {
      const at = sub + 16 + g * 12;
      const start = buf.readUInt32BE(at);
      const end = buf.readUInt32BE(at + 4);
      const glyph = buf.readUInt32BE(at + 8);
      for (let c = start; c <= end; c++) map.set(c, glyph + (c - start));
    }
  } else {
    const segX2 = buf.readUInt16BE(sub + 6);
    const ends = sub + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = buf.readUInt16BE(ends + s * 2);
      const start = buf.readUInt16BE(starts + s * 2);
      const delta = buf.readInt16BE(deltas + s * 2);
      const rangeAt = ranges + s * 2;
      const range = buf.readUInt16BE(rangeAt);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let glyph;
        if (range === 0) glyph = (c + delta) & 0xffff;
        else {
          const g = buf.readUInt16BE(rangeAt + range + (c - start) * 2);
          glyph = g === 0 ? 0 : (g + delta) & 0xffff;
        }
        if (glyph !== 0) map.set(c, glyph);
      }
    }
  }
  return map;
}

function loadFont(filePath) {
  const buf = fs.readFileSync(filePath);
  const t = tables(buf);
  for (const need of ["cmap", "head", "hhea", "hmtx"]) {
    if (!t[need]) throw new Error(`${filePath}: no ${need} table - not a TrueType font this can read`);
  }
  const unitsPerEm = buf.readUInt16BE(t.head.offset + 18);
  const longMetrics = buf.readUInt16BE(t.hhea.offset + 34);
  const advance = (glyph) => buf.readUInt16BE(t.hmtx.offset + Math.min(glyph, longMetrics - 1) * 4);
  const cmap = readCmap(buf, t.cmap);

  return {
    unitsPerEm,
    has: (codepoint) => cmap.has(codepoint),
    // Width of `text` at `fontSize`, in the same units as the SVG viewBox.
    width(text, fontSize) {
      let units = 0;
      for (const ch of String(text)) {
        const g = cmap.get(ch.codePointAt(0));
        units += advance(g === undefined ? 0 : g);
      }
      return (units / unitsPerEm) * fontSize;
    },
    // Characters in `text` this font has no glyph for, in order, de-duplicated.
    missing(text) {
      const out = [];
      for (const ch of String(text)) {
        const cp = ch.codePointAt(0);
        if (cp === 0x20 || cp === 0x0a) continue;
        if (!cmap.has(cp) && !out.includes(ch)) out.push(ch);
      }
      return out;
    },
  };
}

module.exports = { loadFont };
