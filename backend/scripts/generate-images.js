#!/usr/bin/env node
/**
 * scripts/generate-images.js
 *
 * Step 1a of the production pipeline: composes a text-based card image for
 * every drop in the active collection, from that drop's own master.csv row,
 * and writes it to backend/images/<dropItemId>.svg - where upload-images.js
 * already looks. No artwork is required to mint.
 *
 * Modelled on on-demand-nft's nftcards/render.py: a card is text and simple
 * shapes, composed by a pure function of its inputs, with every printed value
 * escaped. Unlike that project nothing is rolled - the card prints the drop's
 * fixed metadata, so the same row always produces the same bytes.
 *
 * WHAT IS ON THE CARD
 *   collectionName, itemName, every `attributes` pair (up to ten, two columns
 *   of five), dropItemId, and config.json's symbol if it has one. A drop with
 *   no attributes prints its itemDescription in the grid instead.
 *
 * WHAT IS DELIBERATELY NOT
 *   price and maxSupply. The image is uploaded once and every edition of the
 *   drop shares it (hiddenSettings), but both values change after launch:
 *   update-candy-guard.js --set-holder-price reprices, and
 *   update-candy-machine-supply.js raises the cap. A printed price or
 *   "edition of 8" would be permanently wrong the first time either runs.
 *
 * YOUR OWN ART STILL WINS
 *   A drop that already has backend/images/<dropItemId>.png/.jpg/.jpeg/.gif/
 *   .webp is skipped: upload-images.js prefers those over .svg anyway, and
 *   prepare-images.js remains the way to bring them in. An .svg that this
 *   script did not write (no data-generator marker) is also left alone,
 *   unless --force.
 *
 * Local only - no network, no SOL, nothing permanent. Writing a file here
 * changes nothing on chain; upload-images.js is the step that spends, and it
 * skips any row whose itemImage is already a real URL.
 *
 * Palette: config.json may carry
 *   "card": { "background": "#14161a", "foreground": "#f2f2f0", "accent": "#3fa7d6" }
 * Any key left out takes the default; the default accent is derived from the
 * collectionSlug, so each collection is distinguishable with no setup.
 *
 * Exit codes:
 *   0 = success (including "nothing changed")
 *   1 = validation failure (bad config, bad CSV, invalid palette)
 *
 * Usage:
 *   node scripts/generate-images.js
 *   node scripts/generate-images.js --dry-run     (report what would be written, write nothing)
 *   node scripts/generate-images.js --force       (also replace an .svg this script did not write)
 *   node scripts/generate-images.js --slug founders
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parseCsvRecords } = require("./lib/csv");

// ---- Paths --------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(BACKEND_DIR, "config.json");
const MASTER_CSV_PATH = path.join(BACKEND_DIR, "master.csv");
const IMAGES_DIR = path.join(BACKEND_DIR, "images");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

// Raster formats upload-images.js accepts. Any of these for a drop means
// someone supplied real art, and the generated card stands aside.
const RASTER_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

// The marker that tells a generated card from a hand-made SVG.
const GENERATOR = "generate-images.js";

// ---- Layout -------------------------------------------------------------
// Square, because marketplace grids are. Measured in viewBox units; the
// card is vector, so it renders crisply at any size.
const W = 600;
const H = 600;
const PAD = 40;
const ACCENT_W = 12;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MAX_TRAITS = 10;
const COL_X = [PAD + 16, 316];
const COL_W = 244;
const ROW_Y = [214, 278, 342, 406, 470];

// Text is fitted by character count, not by measured width: no font is
// embedded, so the renderer's system font decides the real width. 0.6 em
// per character is a deliberately generous average for proportional sans
// fonts, so a fitted line has slack rather than collisions.
const CHAR_EM = 0.6;
// Running prose at regular weight is narrower than bold values and names.
const PROSE_EM = 0.5;

const DEFAULT_PALETTE = { background: "#14161a", foreground: "#f2f2f0" };
const HEX = /^#[0-9a-fA-F]{6}$/;

// ---- Pure helpers (exported for generate-images.selftest.js) -----------

// Characters XML 1.0 forbids outright. A control character in a CSV cell
// would otherwise make the whole SVG unparseable, and an unparseable image
// is a blank tile on every marketplace.
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

// Shorten to `max` characters, counted in code points so an emoji or any
// astral character is never split into half a surrogate pair.
function fitText(value, max) {
  const chars = Array.from(String(value == null ? "" : value).replace(XML_INVALID, "").trim());
  if (chars.length <= max) return { text: chars.join(""), truncated: false };
  return { text: chars.slice(0, Math.max(1, max - 1)).join("").trimEnd() + "…", truncated: true };
}

function charsFor(widthUnits, fontSize) {
  return Math.max(1, Math.floor(widthUnits / (fontSize * CHAR_EM)));
}

// Word-wrap into at most `maxLines` lines of at most `perLine` characters.
function wrapText(value, perLine, maxLines) {
  const words = String(value == null ? "" : value).replace(XML_INVALID, "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  let truncated = false;
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (Array.from(candidate).length <= perLine) { line = candidate; continue; }
    if (line) lines.push(line);
    line = fitText(word, perLine).text;
    if (lines.length === maxLines) { truncated = true; break; }
  }
  if (!truncated && line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; truncated = true; }
  if (truncated && lines.length) lines[lines.length - 1] = fitText(lines[lines.length - 1] + " …", perLine).text;
  return { lines, truncated };
}

// "Series:Genesis|Tier:Core" -> [{ name, value }]. The same rule as
// generate-metadata.js's parseAttributes, so the card prints exactly the
// traits the metadata carries, in the same order.
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

// Compose one card. Pure: everything it prints arrives as an argument, and
// the same arguments always give the same bytes. Returns the SVG and a list
// of what had to be shortened, so the caller can say so.
function composeCard({ collectionName, itemName, dropItemId, attributes, description, symbol, palette }) {
  const notes = [];
  const p = [];
  const add = (s) => p.push(s);
  const { background: bg, foreground: fg, accent: ac } = palette;
  const innerW = W - 2 * PAD - 16;

  add(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" data-generator="${GENERATOR}">`);
  add(`<defs><clipPath id="c"><rect width="${W}" height="${H}" rx="24"/></clipPath></defs>`);
  add(`<g clip-path="url(#c)">`);
  add(`<rect width="${W}" height="${H}" fill="${bg}"/>`);
  add(`<rect width="${ACCENT_W}" height="${H}" fill="${ac}"/>`);
  add(`</g>`);
  add(`<g font-family="${FONT}" fill="${fg}">`);

  const coll = fitText(collectionName, charsFor(innerW, 20));
  if (coll.truncated) notes.push("collectionName");
  add(`<text x="${PAD + 16}" y="82" font-size="20" opacity=".7">${escapeXml(coll.text)}</text>`);

  // The item name is the card's headline: largest size that fits, down to 26.
  const nameChars = Array.from(String(itemName || "")).length || 1;
  const nameSize = Math.max(26, Math.min(44, Math.floor(innerW / (nameChars * CHAR_EM))));
  const name = fitText(itemName, charsFor(innerW, nameSize));
  if (name.truncated) notes.push("itemName");
  add(`<text x="${PAD + 16}" y="132" font-size="${nameSize}" font-weight="600">${escapeXml(name.text)}</text>`);
  add(`<rect x="${PAD + 16}" y="160" width="${innerW}" height="2" fill="${ac}"/>`);

  const traits = attributes || [];
  if (traits.length > 0) {
    traits.slice(0, MAX_TRAITS).forEach((t, i) => {
      const col = Math.floor(i / ROW_Y.length);
      const y = ROW_Y[i % ROW_Y.length];
      const label = fitText(t.name, charsFor(COL_W, 16));
      const value = fitText(t.value, charsFor(COL_W, 26));
      if (label.truncated || value.truncated) notes.push(`trait ${i + 1}`);
      add(`<text x="${COL_X[col]}" y="${y}" font-size="16" opacity=".7">${escapeXml(label.text)}</text>`);
      add(`<text x="${COL_X[col]}" y="${y + 30}" font-size="26" font-weight="600">${escapeXml(value.text)}</text>`);
    });
    if (traits.length > MAX_TRAITS) notes.push(`${traits.length - MAX_TRAITS} trait(s) beyond ten not printed`);
  } else if (description) {
    const wrapped = wrapText(description, Math.floor(innerW / (22 * PROSE_EM)), 9);
    if (wrapped.truncated) notes.push("itemDescription");
    wrapped.lines.forEach((line, i) => {
      add(`<text x="${PAD + 16}" y="${214 + i * 34}" font-size="22" opacity=".9">${escapeXml(line)}</text>`);
    });
  }

  add(`<rect x="${PAD + 16}" y="${H - 72}" width="${innerW}" height="2" fill="${ac}"/>`);
  const more = traits.length > MAX_TRAITS ? `  +${traits.length - MAX_TRAITS} more` : "";
  const id = fitText(String(dropItemId || "") + more, charsFor(innerW / 2, 18));
  add(`<text x="${PAD + 16}" y="${H - 34}" font-size="18" opacity=".7">${escapeXml(id.text)}</text>`);
  if (symbol) {
    const sym = fitText(symbol, charsFor(innerW / 2, 18));
    add(`<text x="${W - PAD}" y="${H - 34}" font-size="18" opacity=".7" text-anchor="end">${escapeXml(sym.text)}</text>`);
  }
  add(`</g></svg>`);

  return { svg: p.join("\n") + "\n", notes };
}

function isGenerated(svgText) {
  return svgText.includes(`data-generator="${GENERATOR}"`);
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

  const { rows } = readCsv(MASTER_CSV_PATH);
  if (rows.length === 0) fail("empty_master_csv", "backend/master.csv has no data rows", 1);

  const matchingRows = rows.filter((r) => r.collectionSlug === collectionSlug);
  if (matchingRows.length === 0) {
    fail("unknown_collection_slug", `No rows in master.csv match collectionSlug "${collectionSlug}"`, 1);
  }

  if (!dryRun && !fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const results = { written: [], unchanged: [], ownArt: [], handMadeSvg: [], alreadyUploaded: [] };

  for (const row of matchingRows) {
    const dropItemId = row.dropItemId;
    if (!dropItemId) continue;

    const raster = findRaster(dropItemId);
    if (raster) {
      results.ownArt.push(dropItemId);
      log({ status: "info", dropItemId, message: `Skipped - your own image ${path.basename(raster)} is used instead.` });
      continue;
    }

    const svgPath = path.join(IMAGES_DIR, dropItemId + ".svg");
    const existing = fs.existsSync(svgPath) ? fs.readFileSync(svgPath, "utf8") : null;
    if (existing !== null && !isGenerated(existing) && !force) {
      results.handMadeSvg.push(dropItemId);
      log({ status: "info", dropItemId, message: `Skipped - images/${dropItemId}.svg was not written by ${GENERATOR}. --force replaces it.` });
      continue;
    }

    const { svg, notes } = composeCard({
      collectionName: row.collectionName || row.collectionSlug,
      itemName: row.itemName || dropItemId,
      dropItemId,
      attributes: parseAttributes(row.attributes),
      description: row.itemDescription,
      symbol: config.symbol,
      palette,
    });
    if (notes.length) {
      log({ status: "warning", dropItemId, message: `Shortened to fit the card: ${notes.join(", ")}. The metadata keeps the full text.` });
    }

    // upload-images.js skips a row whose itemImage is already a real URL, so
    // a card written here for an uploaded drop changes nothing until --force
    // there. Say so, rather than let a regenerated card look like it shipped.
    const uploaded = row.itemImage && /^https?:\/\//.test(row.itemImage) &&
      !/placehold\.co|example\.com/.test(row.itemImage) &&
      // An upload dry run's fake id is not an upload (open-items 52).
      !/gateway\.irys\.xyz\/[0-9a-f]{43}$/.test(row.itemImage.trim());
    if (uploaded) results.alreadyUploaded.push(dropItemId);

    if (existing === svg) {
      results.unchanged.push(dropItemId);
      continue;
    }
    if (!dryRun) fs.writeFileSync(svgPath, svg, "utf8");
    results.written.push(dropItemId);
    log({
      status: "info",
      dropItemId,
      message: `${dryRun ? "Would write" : "Wrote"} images/${dropItemId}.svg (${Buffer.byteLength(svg)} bytes)` +
        (uploaded ? " - itemImage is already uploaded, so upload-images.js will not replace it without --force" : ""),
    });
  }

  log({
    status: "summary",
    collectionSlug,
    dryRun,
    totalDrops: matchingRows.length,
    written: results.written.length,
    unchanged: results.unchanged.length,
    ownArt: results.ownArt.length,
    handMadeSvg: results.handMadeSvg.length,
    alreadyUploaded: results.alreadyUploaded.length,
  });
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { escapeXml, fitText, wrapText, parseAttributes, accentFromSlug, resolvePalette, composeCard, isGenerated };
