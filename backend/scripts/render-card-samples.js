#!/usr/bin/env node
/**
 * scripts/render-card-samples.js
 *
 * Renders the five reference cards and a contact sheet of them, with exactly
 * the composer and rasteriser generate-images.js ships, into a folder you
 * name. Local only: no network, no master.csv, nothing uploaded.
 *
 *   node scripts/render-card-samples.js ../docs/runs/assets/generated-cards-<date>
 *
 * WHAT IT IS FOR
 *   Looking. It is step 1 of re-blessing generate-images.selftest.js's golden
 *   hash (see the procedure beside GOLDEN_PNG_SHA256 there), and the way to see
 *   what a rasteriser, font or layout change did before it ships. The five
 *   cards cover a normal drop, the fork's real TEST-004 row, more than ten
 *   traits, a description-only drop, and long text in a light palette.
 *
 * Exit codes:
 *   0 = rendered
 *   1 = no output folder given, or a reference card refused (a glyph the font
 *       lacks - which would mean the font changed)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const m = require("./generate-images.js");

function references() {
  const P = (slug) => m.resolvePalette(undefined, slug);
  return {
    "1-normal": { collectionName: "Founders", itemName: "Founders Pass", dropItemId: "OE-001",
      attributes: m.parseAttributes("Series:Genesis|Tier:Core|Element:Fire|Season:2026|Edition:Open"), symbol: "FND", palette: P("founders") },
    "2-fork-test-004": { collectionName: "Mechanics Test C", itemName: "Test Item D", dropItemId: "TEST-004",
      attributes: m.parseAttributes("Trait:Test"), palette: P("test-mech") },
    "3-twelve-traits": { collectionName: "Summer League", itemName: "Matchday Card", dropItemId: "SUM-007",
      attributes: Array.from({ length: 12 }, (_, i) => ({ name: "Category " + (i + 1), value: ["Gold", "Silver", "Bronze", "Platinum Edition Holder"][i % 4] })),
      symbol: "SUM", palette: P("summer") },
    "4-description-only": { collectionName: "Open Notes", itemName: "Genesis Note", dropItemId: "NOTE-001", attributes: [],
      description: "A text-only open edition. Every copy carries this note, minted on Solana as a Metaplex Core asset; the words are the artwork.",
      palette: P("notes") },
    "5-long-light": { collectionName: "An Extraordinarily Long Collection Name For Testing", itemName: "W".repeat(30), dropItemId: "LONG-001",
      attributes: m.parseAttributes("Rarity:Uncommon But Not Especially Rare|Mood:Fiery — “quoted”"), symbol: "LNG",
      palette: m.resolvePalette({ background: "#f4efe6", foreground: "#1d1b18", accent: "#b5462e" }, "long") },
  };
}

function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("Usage: node scripts/render-card-samples.js <output folder>");
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const fonts = m.loadFonts();
  const env = m.renderEnvironment();
  const lines = [];
  const pngs = [];
  for (const [name, card] of Object.entries(references())) {
    const r = m.composeCard({ ...card, fonts });
    if (r.missingGlyphs.length) {
      console.error(`${name}: refused - ${JSON.stringify(r.missingGlyphs)}. The bundled font no longer covers a reference card.`);
      process.exit(1);
    }
    const png = m.renderPng(r.svg);
    fs.writeFileSync(path.join(outDir, name + ".svg"), r.svg);
    fs.writeFileSync(path.join(outDir, name + ".png"), png);
    pngs.push(png);
    lines.push(`- ${name}: ${png.length} bytes, sha256 ${m.sha256(png).slice(0, 16)}, shortened: ${r.notes.join("; ") || "-"}`);
  }

  // The sheet embeds the shipped PNGs themselves, so what you look at is
  // made from the real bytes.
  const cell = 600, gap = 20, cols = 3;
  const rows = Math.ceil(pngs.length / cols);
  const W = cols * cell + (cols + 1) * gap, H = rows * cell + (rows + 1) * gap;
  const images = pngs.map((png, i) => {
    const x = gap + (i % cols) * (cell + gap), y = gap + Math.floor(i / cols) * (cell + gap);
    return `<image x="${x}" y="${y}" width="${cell}" height="${cell}" href="data:image/png;base64,${png.toString("base64")}"/>`;
  }).join("");
  const { Resvg } = require("@resvg/resvg-js");
  const sheet = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#8a8a8a"/>${images}</svg>`,
    { font: { loadSystemFonts: false } }).render().asPng();
  fs.writeFileSync(path.join(outDir, "contact-sheet.png"), sheet);

  fs.writeFileSync(path.join(outDir, "README.md"),
    `# Reference cards\n\nRendered by \`scripts/render-card-samples.js\` with ${env.rasterizer} and the fonts in backend/fonts/ ` +
    `(${Object.entries(env.fonts).map(([f, h]) => `${f} ${h.slice(0, 12)}`).join(", ")}), system fonts off. The \`.png\` is what would ship; the \`.svg\` is its source.\n\n` +
    lines.join("\n") + "\n");
  console.log(lines.join("\n") + `\ncontact sheet: ${path.join(outDir, "contact-sheet.png")}`);
}

if (require.main === module) {
  main();
}

module.exports = { references };
