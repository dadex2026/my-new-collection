#!/usr/bin/env node
/**
 * scripts/generate-images.js
 *
 * Step 1a of the production pipeline: composes a text-based card image for
 * every drop in the active collection, from that drop's own master.csv row,
 * and writes it to backend/images/ - where upload-images.js already looks.
 * No artwork is required to mint.
 *
 * NOT YET CLEARED FOR A REAL MINT (2026-10-21). The PNG below is
 * deterministic, but no generated card has been minted and looked at on a
 * marketplace yet. Mint one throwaway on a TEST drop and check it on the
 * marketplaces that matter BEFORE any production drop uses a generated card
 * (open-items 53). The image is uploaded permanently and its URL is written
 * into metadata a candy machine can never change, so checking after a real
 * mint is too late by construction.
 *
 * WHAT SHIPS: A PNG, RENDERED WITH ONLY THE BUNDLED FONT
 *   The card is composed as SVG (text and simple shapes, after on-demand-nft's
 *   nftcards/render.py) and rasterised to <dropItemId>.png with
 *   @resvg/resvg-js, using ONLY backend/fonts/Inter-*.ttf - system fonts are
 *   switched off. So the same row gives the same PNG bytes on any machine, and
 *   no wallet or marketplace has to render SVG or have a font. The .svg is
 *   kept beside it as the readable source; upload-images.js prefers the .png.
 *
 *   Text is measured with the font's own advance widths
 *   (lib/font-metrics.js), not guessed. A character Inter has no glyph for -
 *   an emoji, CJK - would render as Inter's "NO GLYPH" box on a permanent
 *   image, so that drop is REFUSED, nothing is written for it, and the run
 *   exits 1. Change the master.csv text, or supply your own art.
 *
 * WHAT IS ON THE CARD
 *   collectionName, itemName, every `attributes` pair (up to ten, two columns
 *   of five, then "+N more"), dropItemId, and config.json's symbol if it has
 *   one. A drop with no attributes prints its itemDescription instead.
 *
 * NEVER ADD price OR maxSupply TO THE CARD
 *   Every edition of a drop shares one image (hiddenSettings) and it is
 *   uploaded once. Both values change after launch -
 *   update-candy-guard.js --set-holder-price reprices,
 *   update-candy-machine-supply.js raises the cap - so a printed price or
 *   "edition of 8" would be permanently wrong the first time either runs.
 *   Leaving them off is the design, not an omission.
 *
 * YOUR OWN ART STILL WINS
 *   images/generated-images.json records the hash of every file this script
 *   wrote. A .png/.jpg/.jpeg/.gif/.webp for a drop that is NOT in that record
 *   is your art: the drop is skipped and your file is what gets uploaded.
 *   prepare-images.js remains the way to bring art in. A hand-made .svg is
 *   left alone too, unless --force.
 *
 * Local only - no network, no SOL, nothing permanent. upload-images.js is the
 * step that spends, and it skips any row whose itemImage is already a real URL.
 *
 * Palette: config.json may carry
 *   "card": { "background": "#14161a", "foreground": "#f2f2f0", "accent": "#3fa7d6" }
 * Any key left out takes the default; the default accent is derived from the
 * collectionSlug, so each collection is distinguishable with no setup.
 *
 * Exit codes:
 *   0 = success (including "nothing changed")
 *   1 = validation failure (bad config, bad CSV, invalid palette), or a drop
 *       refused because the bundled font cannot render its text
 *
 * Usage:
 *   node scripts/generate-images.js
 *   node scripts/generate-images.js --dry-run     (report what would be written, write nothing)
 *   node scripts/generate-images.js --force       (also replace a hand-made .svg)
 *   node scripts/generate-images.js --slug founders
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parseCsvRecords } = require("./lib/csv");
const { loadFont } = require("./lib/font-metrics");

// ---- Paths --------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(BACKEND_DIR, "config.json");
const MASTER_CSV_PATH = path.join(BACKEND_DIR, "master.csv");
const IMAGES_DIR = path.join(BACKEND_DIR, "images");
const MANIFEST_PATH = path.join(IMAGES_DIR, "generated-images.json");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");
const FONTS_DIR = path.join(BACKEND_DIR, "fonts");
const FONT_FILES = {
  regular: path.join(FONTS_DIR, "Inter-Regular.ttf"),
  semibold: path.join(FONTS_DIR, "Inter-SemiBold.ttf"),
};

const RASTER_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const GENERATOR = "generate-images.js";

// ---- Layout -------------------------------------------------------------
// Square, because marketplace grids are. Measured in viewBox units; the PNG is
// rendered at RASTER_WIDTH pixels, twice the viewBox, for sharp text.
const W = 600;
const H = 600;
const RASTER_WIDTH = 1200;
const PAD = 40;
const ACCENT_W = 12;
const FONT_FAMILY = "Inter";
const MAX_TRAITS = 10;
const COL_X = [PAD + 16, 316];
const COL_W = 244;
const ROW_Y = [214, 278, 342, 406, 470];
// Measured widths ignore kerning, so keep a margin rather than fill to the edge.
const FIT = 0.97;

const DEFAULT_PALETTE = { background: "#14161a", foreground: "#f2f2f0" };
const HEX = /^#[0-9a-fA-F]{6}$/;

// ---- Pure helpers (exported for generate-images.selftest.js) -----------

// Characters XML 1.0 forbids outright. One in a CSV cell would make the whole
// SVG unparseable.
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function escapeXml(value) {
  return String(value == null ? "" : value)
    .replace(XML_INVALID, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clean(value) {
  return String(value == null ? "" : value).replace(XML_INVALID, "").trim();
}

// Shorten `value` until it measures within `maxWidth` at `fontSize`, counting
// code points so an astral character is never split.
function fitWidth(value, maxWidth, fontSize, font) {
  const chars = Array.from(clean(value));
  const limit = maxWidth * FIT;
  if (font.width(chars.join(""), fontSize) <= limit) return { text: chars.join(""), truncated: false };
  let n = chars.length;
  while (n > 1 && font.width(chars.slice(0, n).join("").trimEnd() + "…", fontSize) > limit) n--;
  return { text: chars.slice(0, n).join("").trimEnd() + "…", truncated: true };
}

// Word-wrap into at most `maxLines` lines, each within `maxWidth`.
function wrapWidth(value, maxWidth, fontSize, font, maxLines) {
  const words = clean(value).split(/\s+/).filter(Boolean);
  const limit = maxWidth * FIT;
  const lines = [];
  let line = "";
  let truncated = false;
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (font.width(candidate, fontSize) <= limit) { line = candidate; continue; }
    if (line) lines.push(line);
    if (lines.length === maxLines) { truncated = true; line = ""; break; }
    line = fitWidth(word, maxWidth, fontSize, font).text;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; truncated = true; }
  if (truncated && lines.length) {
    lines[lines.length - 1] = fitWidth(lines[lines.length - 1] + " …", maxWidth, fontSize, font).text;
  }
  return { lines, truncated };
}

// "Series:Genesis|Tier:Core" -> [{ name, value }], as generate-metadata.js's
// parseAttributes reads it, so the card prints exactly the metadata's traits.
function parseAttributes(raw) {
  if (!raw || raw.trim() === "") return [];
  return raw
    .split("|")
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const idx = pair.indexOf(":");
      if (idx === -1) return { name: pair, value: "" };
      return { name: pair.slice(0, idx).trim(), value: pair.slice(idx + 1).trim() };
    });
}

// A stable accent per collection: hue from the slug's SHA-256, fixed
// saturation and lightness so it always reads against the dark default.
function accentFromSlug(slug) {
  const digest = crypto.createHash("sha256").update(String(slug || "")).digest();
  const hue = ((digest[0] << 8) | digest[1]) % 360;
  return hslToHex(hue, 0.62, 0.56);
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return "#" + hex(r) + hex(g) + hex(b);
}

// Throws on a malformed colour rather than writing it into a permanent image.
function resolvePalette(card, slug) {
  const palette = {
    background: DEFAULT_PALETTE.background,
    foreground: DEFAULT_PALETTE.foreground,
    accent: accentFromSlug(slug),
  };
  if (card == null) return palette;
  if (typeof card !== "object") throw new Error('config.json "card" must be an object');
  for (const key of ["background", "foreground", "accent"]) {
    if (card[key] === undefined) continue;
    if (typeof card[key] !== "string" || !HEX.test(card[key])) {
      throw new Error(`config.json card.${key} must be a #rrggbb colour, got ${JSON.stringify(card[key])}`);
    }
    palette[key] = card[key].toLowerCase();
  }
  return palette;
}

// Compose one card. Pure: everything it prints, and the font metrics it
// measures with, arrive as arguments. Returns the SVG, what was shortened,
// and every character the font cannot render - a non-empty `missingGlyphs`
// means the card must not be written.
function composeCard({ collectionName, itemName, dropItemId, attributes, description, symbol, palette, fonts }) {
  const notes = [];
  const missing = [];
  const p = [];
  const add = (s) => p.push(s);
  const { background: bg, foreground: fg, accent: ac } = palette;
  const innerW = W - 2 * PAD - 16;
  const check = (where, text, font) => {
    const m = font.missing(text);
    if (m.length) missing.push({ where, chars: m });
  };

  add(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" data-generator="${GENERATOR}">`);
  add(`<defs><clipPath id="c"><rect width="${W}" height="${H}" rx="24"/></clipPath></defs>`);
  add(`<g clip-path="url(#c)">`);
  add(`<rect width="${W}" height="${H}" fill="${bg}"/>`);
  add(`<rect width="${ACCENT_W}" height="${H}" fill="${ac}"/>`);
  add(`</g>`);
  add(`<g font-family="${FONT_FAMILY}" fill="${fg}">`);

  const coll = fitWidth(collectionName, innerW, 20, fonts.regular);
  if (coll.truncated) notes.push("collectionName");
  check("collectionName", coll.text, fonts.regular);
  add(`<text x="${PAD + 16}" y="82" font-size="20" opacity=".7">${escapeXml(coll.text)}</text>`);

  // The item name is the headline: the largest size from 44 down to 26 at
  // which it fits whole, else shortened at 26.
  let nameSize = 26;
  for (let s = 44; s >= 26; s--) {
    if (fonts.semibold.width(clean(itemName), s) <= innerW * FIT) { nameSize = s; break; }
  }
  const name = fitWidth(itemName, innerW, nameSize, fonts.semibold);
  if (name.truncated) notes.push("itemName");
  check("itemName", name.text, fonts.semibold);
  add(`<text x="${PAD + 16}" y="132" font-size="${nameSize}" font-weight="600">${escapeXml(name.text)}</text>`);
  add(`<rect x="${PAD + 16}" y="160" width="${innerW}" height="2" fill="${ac}"/>`);

  const traits = attributes || [];
  if (traits.length > 0) {
    traits.slice(0, MAX_TRAITS).forEach((t, i) => {
      const col = Math.floor(i / ROW_Y.length);
      const y = ROW_Y[i % ROW_Y.length];
      const label = fitWidth(t.name, COL_W, 16, fonts.regular);
      const value = fitWidth(t.value, COL_W, 26, fonts.semibold);
      if (label.truncated || value.truncated) notes.push(`trait ${i + 1}`);
      check(`trait ${i + 1} name`, label.text, fonts.regular);
      check(`trait ${i + 1} value`, value.text, fonts.semibold);
      add(`<text x="${COL_X[col]}" y="${y}" font-size="16" opacity=".7">${escapeXml(label.text)}</text>`);
      add(`<text x="${COL_X[col]}" y="${y + 30}" font-size="26" font-weight="600">${escapeXml(value.text)}</text>`);
    });
    if (traits.length > MAX_TRAITS) notes.push(`${traits.length - MAX_TRAITS} trait(s) beyond ten not printed`);
  } else if (description) {
    const wrapped = wrapWidth(description, innerW, 22, fonts.regular, 9);
    if (wrapped.truncated) notes.push("itemDescription");
    wrapped.lines.forEach((line, i) => {
      check("itemDescription", line, fonts.regular);
      add(`<text x="${PAD + 16}" y="${214 + i * 34}" font-size="22" opacity=".9">${escapeXml(line)}</text>`);
    });
  }

  add(`<rect x="${PAD + 16}" y="${H - 72}" width="${innerW}" height="2" fill="${ac}"/>`);
  const more = traits.length > MAX_TRAITS ? `  +${traits.length - MAX_TRAITS} more` : "";
  const id = fitWidth(String(dropItemId || "") + more, innerW / 2, 18, fonts.regular);
  check("dropItemId", id.text, fonts.regular);
  add(`<text x="${PAD + 16}" y="${H - 34}" font-size="18" opacity=".7">${escapeXml(id.text)}</text>`);
  if (symbol) {
    const sym = fitWidth(symbol, innerW / 2, 18, fonts.regular);
    check("symbol", sym.text, fonts.regular);
    add(`<text x="${W - PAD}" y="${H - 34}" font-size="18" opacity=".7" text-anchor="end">${escapeXml(sym.text)}</text>`);
  }
  add(`</g></svg>`);

  return { svg: p.join("\n") + "\n", notes, missingGlyphs: missing };
}

function isGenerated(svgText) {
  return svgText.includes(`data-generator="${GENERATOR}"`);
}

function loadFonts() {
  return { regular: loadFont(FONT_FILES.regular), semibold: loadFont(FONT_FILES.semibold) };
}

// Rasterise with ONLY the bundled fonts. loadSystemFonts: false is the whole
// point - with it on, the PNG would depend on the machine that made it.
function renderPng(svg) {
  const { Resvg } = require("@resvg/resvg-js");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: RASTER_WIDTH },
    font: {
      fontFiles: [FONT_FILES.regular, FONT_FILES.semibold],
      loadSystemFonts: false,
      defaultFontFamily: FONT_FAMILY,
    },
  });
  return resvg.render().asPng();
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// What produced the PNGs: if either changes, every card's bytes may change.
function renderEnvironment() {
  const resvgVersion = require("@resvg/resvg-js/package.json").version;
  return {
    rasterizer: `@resvg/resvg-js@${resvgVersion}`,
    fonts: Object.fromEntries(Object.values(FONT_FILES).map((f) => [path.basename(f), sha256(fs.readFileSync(f))])),
  };
}

// ---- Logging --------------------------------------------------------------

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "generate-images", ...event };
  const line = JSON.stringify(entry);
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, "generate-images.log"), line + "\n");
}

function fail(reason, message, exitCode) {
  log({ status: "failure", reason, message });
  process.exit(exitCode);
}

// ---- Config and CSV -------------------------------------------------------

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fail("missing_config", `backend/config.json not found. Expected at ${CONFIG_PATH}`, 1);
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    fail("invalid_config_json", `config.json is not valid JSON: ${err.message}`, 1);
  }
  if (!config.collectionSlug) {
    fail("incomplete_config", `config.json is missing required field: collectionSlug`, 1);
  }
  return config;
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return { header: [], rows: [] };
  const { header, records } = parseCsvRecords(fs.readFileSync(filePath, "utf8"));
  return { header, rows: records };
}

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return { drops: {} };
  try {
    const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    return { ...m, drops: m.drops || {} };
  } catch (err) {
    fail("invalid_manifest", `images/generated-images.json is not valid JSON: ${err.message}`, 1);
  }
}

function findRaster(dropItemId) {
  for (const ext of RASTER_EXTENSIONS) {
    const filePath = path.join(IMAGES_DIR, dropItemId + ext);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

// ---- Main ---------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const slugFlagIndex = args.indexOf("--slug");

  const config = loadConfig();
  const collectionSlug =
    slugFlagIndex !== -1 && args[slugFlagIndex + 1] ? args[slugFlagIndex + 1] : config.collectionSlug;

  log({ status: "start", collectionSlug, dryRun, force });

  let palette;
  try {
    palette = resolvePalette(config.card, collectionSlug);
  } catch (err) {
    fail("invalid_palette", err.message, 1);
  }

  for (const f of Object.values(FONT_FILES)) {
    if (!fs.existsSync(f)) fail("missing_font", `${path.relative(BACKEND_DIR, f)} not found - cards are rendered only with the bundled font`, 1);
  }
  const fonts = loadFonts();
  const env = renderEnvironment();

  const { rows } = readCsv(MASTER_CSV_PATH);
  if (rows.length === 0) fail("empty_master_csv", "backend/master.csv has no data rows", 1);

  const matchingRows = rows.filter((r) => r.collectionSlug === collectionSlug);
  if (matchingRows.length === 0) {
    fail("unknown_collection_slug", `No rows in master.csv match collectionSlug "${collectionSlug}"`, 1);
  }

  if (!dryRun && !fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const manifest = readManifest();

  const results = { written: [], unchanged: [], ownArt: [], handMadeSvg: [], refused: [], alreadyUploaded: [] };

  for (const row of matchingRows) {
    const dropItemId = row.dropItemId;
    if (!dropItemId) continue;
    const recorded = manifest.drops[dropItemId] || null;

    // A raster this script did not write is your art.
    const raster = findRaster(dropItemId);
    if (raster) {
      const ours = recorded && path.basename(raster) === `${dropItemId}.png` && sha256(fs.readFileSync(raster)) === recorded.png;
      if (!ours) {
        results.ownArt.push(dropItemId);
        log({ status: "info", dropItemId, message: `Skipped - your own image ${path.basename(raster)} is used instead.` });
        continue;
      }
    }

    const svgPath = path.join(IMAGES_DIR, dropItemId + ".svg");
    const pngPath = path.join(IMAGES_DIR, dropItemId + ".png");
    const existingSvg = fs.existsSync(svgPath) ? fs.readFileSync(svgPath, "utf8") : null;
    if (existingSvg !== null && !isGenerated(existingSvg) && !force) {
      results.handMadeSvg.push(dropItemId);
      log({ status: "info", dropItemId, message: `Skipped - images/${dropItemId}.svg was not written by ${GENERATOR}. --force replaces it.` });
      continue;
    }

    const { svg, notes, missingGlyphs } = composeCard({
      collectionName: row.collectionName || row.collectionSlug,
      itemName: row.itemName || dropItemId,
      dropItemId,
      attributes: parseAttributes(row.attributes),
      description: row.itemDescription,
      symbol: config.symbol,
      palette,
      fonts,
    });

    if (missingGlyphs.length) {
      results.refused.push(dropItemId);
      log({
        status: "failure",
        reason: "glyph_not_in_font",
        dropItemId,
        message: `Refused - the bundled font has no glyph for ${missingGlyphs.map((m) => `${m.chars.join(" ")} (${m.where})`).join("; ")}. ` +
          `They would print as a "NO GLYPH" box on a permanent image. Change the text in master.csv, or supply your own art. Nothing was written.`,
      });
      continue;
    }
    if (notes.length) {
      log({ status: "warning", dropItemId, message: `Shortened to fit the card: ${notes.join(", ")}. The metadata keeps the full text.` });
    }

    const uploaded = row.itemImage && /^https?:\/\//.test(row.itemImage) &&
      !/placehold\.co|example\.com/.test(row.itemImage) &&
      // An upload dry run's fake id is not an upload (open-items 52).
      !/gateway\.irys\.xyz\/[0-9a-f]{43}$/.test(row.itemImage.trim());
    if (uploaded) results.alreadyUploaded.push(dropItemId);

    const svgSha = sha256(svg);
    const pngOnDisk = fs.existsSync(pngPath) ? sha256(fs.readFileSync(pngPath)) : null;
    const sameEnv = manifest.rasterizer === env.rasterizer && JSON.stringify(manifest.fonts) === JSON.stringify(env.fonts);
    if (recorded && recorded.svg === svgSha && pngOnDisk === recorded.png && existingSvg === svg && sameEnv) {
      results.unchanged.push(dropItemId);
      continue;
    }

    const png = renderPng(svg);
    if (!dryRun) {
      fs.writeFileSync(svgPath, svg, "utf8");
      fs.writeFileSync(pngPath, png);
      manifest.drops[dropItemId] = { svg: svgSha, png: sha256(png) };
    }
    results.written.push(dropItemId);
    log({
      status: "info",
      dropItemId,
      message: `${dryRun ? "Would write" : "Wrote"} images/${dropItemId}.png (${png.length} bytes, ${RASTER_WIDTH}px) and its .svg source` +
        (uploaded ? " - itemImage is already uploaded, so upload-images.js will not replace it without --force" : ""),
    });
  }

  if (!dryRun && results.written.length) {
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ generator: GENERATOR, ...env, drops: manifest.drops }, null, 2) + "\n", "utf8");
  }

  log({
    status: results.refused.length ? "failure" : "summary",
    reason: results.refused.length ? "drops_refused" : undefined,
    collectionSlug,
    dryRun,
    totalDrops: matchingRows.length,
    written: results.written.length,
    unchanged: results.unchanged.length,
    ownArt: results.ownArt.length,
    handMadeSvg: results.handMadeSvg.length,
    refused: results.refused,
    alreadyUploaded: results.alreadyUploaded.length,
    renderedWith: env.rasterizer,
  });
  process.exit(results.refused.length ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = {
  escapeXml, fitWidth, wrapWidth, parseAttributes, accentFromSlug, resolvePalette, composeCard, isGenerated,
  loadFonts, renderPng, renderEnvironment, sha256,
};
