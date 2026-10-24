#!/usr/bin/env node
/**
 * scripts/generate-images.selftest.js
 *
 * Exercises the card composer and rasteriser in generate-images.js with no
 * network and no writes. Run it before and after touching that script, the
 * bundled fonts, or the @resvg/resvg-js version.
 *
 *   node scripts/generate-images.selftest.js
 *
 * WHAT IT PROVES
 *   - The same row composes the same SVG and rasterises to the same PNG bytes,
 *     and those bytes equal a recorded golden hash - so a rasteriser or font
 *     change cannot silently alter what future cards look like.
 *   - Text is measured with the bundled font's real widths: wide capitals are
 *     shortened where a guessed average width would have let them overflow.
 *   - A character the font has no glyph for (emoji, CJK) is reported, so the
 *     drop is refused instead of printing a "NO GLYPH" box permanently.
 *   - Every printed value is escaped, and characters XML forbids are removed.
 *   - Every attribute is printed, up to ten, the rest counted; a drop with no
 *     attributes prints its description; price and maxSupply never appear.
 *   - The palette is deterministic per collection, overridable, and a
 *     malformed colour is refused.
 *
 * WHAT IT DOES NOT PROVE
 *   How a marketplace or wallet displays the PNG. That is observed only by
 *   minting a throwaway on a TEST drop and looking (open-items 53). Nor that
 *   main() writes the files and manifest correctly - run it in a sandbox.
 *
 * Exit codes:
 *   0 = every assertion held
 *   1 = an assertion failed
 */
"use strict";

const assert = require("assert");
const path = require("path");
const m = require(path.join(__dirname, "generate-images.js"));

function ok(label, detail) {
  console.log(`  ok  ${label}${detail ? " — " + detail : ""}`);
}

const fonts = m.loadFonts();
const PALETTE = { background: "#14161a", foreground: "#f2f2f0", accent: "#3fa7d6" };
const base = {
  collectionName: "Founders",
  itemName: "Founders Pass",
  dropItemId: "OE-001",
  attributes: [{ name: "Series", value: "Genesis" }, { name: "Tier", value: "Core" }],
  description: "",
  symbol: "FND",
  palette: PALETTE,
  fonts,
};
const cardOf = (over) => m.composeCard({ ...base, ...over });
const svgOf = (over) => cardOf(over).svg;
const texts = (svg) =>
  [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((x) =>
    x[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"));

// The PNG of `base`, rendered with @resvg/resvg-js 2.6.2 and Inter 4.1
// (backend/fonts). If this changes, a rasteriser, font or layout change moved
// every future card.
//
// RE-BLESSING IT - the only way this hash may change:
//   1. Render the reference cards and the sheet:
//        node scripts/render-card-samples.js ../docs/runs/assets/generated-cards-<date>
//   2. LOOK at contact-sheet.png beside the last committed sheet in
//      docs/runs/assets/. Confirm the difference is the one you intended - and
//      only that one.
//   3. Update this hash IN THE SAME COMMIT as the change that moved it (the
//      version bump, the font file, the layout edit), with the new sheet, and
//      say in the message what changed and that the sheet was looked at.
// Never update the hash alone. A hash regenerated to make a red test green has
// stopped checking anything, and a check that fires and gets shrugged at is
// worse than none.
const GOLDEN_PNG_SHA256 = "6432af655468292940802b3f13b64b97e5d02853b71ae7ae787b5233d6ebc26c";

(async () => {
  console.log("\n  generate-images.js — text card composer and rasteriser, offline\n");

  // ---- Determinism ------------------------------------------------------------
  assert.strictEqual(svgOf({}), svgOf({}));
  const png1 = m.renderPng(svgOf({}));
  const png2 = m.renderPng(svgOf({}));
  assert.ok(png1.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
  assert.ok(png1.equals(png2));
  assert.strictEqual(png1.readUInt32BE(16), 1200);
  assert.strictEqual(png1.readUInt32BE(20), 1200);
  ok("the same row gives the same SVG and the same 1200px PNG bytes", `${png1.length} bytes`);

  const env = m.renderEnvironment();
  if (process.env.GOLDEN_PRINT) {
    console.log("  golden:", m.sha256(png1), env.rasterizer);
  } else {
    assert.strictEqual(m.sha256(png1), GOLDEN_PNG_SHA256, `PNG bytes moved under ${env.rasterizer}`);
    ok("the PNG matches the recorded golden hash", env.rasterizer + ", Inter 4.1");
  }

  // The rasteriser must not see system fonts. Two characters Inter lacks both
  // become glyph 0, Inter's "NO GLYPH" box, so they render identically - unless
  // a system emoji or CJK font is visible, which draws each one differently.
  // (The composer refuses such text; this checks the rasteriser on its own.)
  const lone = (ch) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80"><text x="10" y="60" font-family="Inter" font-size="48">${ch}</text></svg>`;
  assert.ok(m.renderPng(lone("\u{1F525}")).equals(m.renderPng(lone("中"))), "a system font was used for a glyph Inter lacks");
  assert.ok(!m.renderPng(lone("A")).equals(m.renderPng(lone("B"))));
  ok("the rasteriser sees only the bundled font", "an emoji and a CJK character both render as Inter's NO GLYPH box");

  // ---- Shape and content ---------------------------------------------------
  const svg = svgOf({});
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"'));
  assert.ok(m.isGenerated(svg) && !m.isGenerated('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
  assert.ok(svg.includes('font-family="Inter"'));
  assert.strictEqual((svg.match(/<text\b/g) || []).length, (svg.match(/<\/text>/g) || []).length);
  assert.deepStrictEqual(texts(svg), ["Founders", "Founders Pass", "Series", "Genesis", "Tier", "Core", "OE-001", "FND"]);
  ok("prints collection, item, every trait in order, id and symbol", "and nothing else; set in Inter");

  const rich = svgOf({ attributes: [{ name: "Price", value: "Bronze" }], price: "0.5", maxSupply: "777" });
  assert.ok(!rich.includes("777") && !rich.includes("0.5"));
  ok("price and maxSupply never reach the card", "both change after launch; the image does not");

  const twelve = Array.from({ length: 12 }, (_, i) => ({ name: `T${i + 1}`, value: `V${i + 1}` }));
  const t12 = texts(svgOf({ attributes: twelve }));
  assert.ok(t12.includes("V10") && !t12.includes("V11") && t12.includes("OE-001  +2 more"));
  ok("ten traits printed, the rest counted on the card", "never silently dropped");

  const desc = texts(svgOf({ attributes: [], description: "A card with no traits prints its description here instead." }));
  assert.ok(desc.join(" ").includes("prints its description here instead."));
  assert.deepStrictEqual(texts(svgOf({ attributes: [], description: "" })), ["Founders", "Founders Pass", "OE-001", "FND"]);
  ok("no attributes: the description fills the grid", "and an empty one prints nothing");

  // ---- Measured fitting ----------------------------------------------------
  // A capital M in Inter SemiBold at 26px is 24.0 units wide. The old guessed
  // average, 0.6em = 15.6, let 15 of them into a 244-wide column; measured,
  // 15 are 360 wide - half again too wide. Only 8 and an ellipsis fit.
  const wide = m.fitWidth("M".repeat(20), 244, 26, fonts.semibold);
  assert.ok(wide.truncated && fonts.semibold.width(wide.text, 26) <= 244);
  const narrow = m.fitWidth("i".repeat(20), 244, 26, fonts.semibold);
  assert.ok(!narrow.truncated);
  ok("width is measured, not guessed", `20 Ms shorten to ${Array.from(wide.text).length - 1}+…; 20 is fit whole`);

  const longName = cardOf({ itemName: "An Extraordinarily Long Item Name For The Card Header" });
  const nameLine = [...longName.svg.matchAll(/<text[^>]*font-size="(\d+)" font-weight="600">([^<]*)</g)][0];
  assert.strictEqual(nameLine[1], "26");
  assert.ok(nameLine[2].endsWith("…") && longName.notes.includes("itemName"));
  assert.ok(fonts.semibold.width(nameLine[2], 26) <= 504);
  const shortName = [...svgOf({ itemName: "Pass" }).matchAll(/font-size="(\d+)" font-weight="600">Pass</g)][0];
  assert.strictEqual(shortName[1], "44");
  ok("the headline takes the largest size that fits, else shortens at 26", "44 for \"Pass\"");

  const w = m.wrapWidth("one two three four five six seven eight nine ten", 120, 22, fonts.regular, 2);
  assert.ok(w.truncated && w.lines.length === 2 && w.lines[1].endsWith("…"));
  assert.ok(w.lines.every((l) => fonts.regular.width(l, 22) <= 120));
  ok("prose wraps by measured width and is capped", "the metadata keeps the full text");

  // ---- Glyph coverage ------------------------------------------------------
  assert.deepStrictEqual(cardOf({}).missingGlyphs, []);
  const emoji = cardOf({ itemName: "Fire \u{1F525}", attributes: [{ name: "Mood", value: "中" }] });
  assert.deepStrictEqual(emoji.missingGlyphs.map((x) => [x.where, x.chars]), [["itemName", ["\u{1F525}"]], ["trait 1 value", ["中"]]]);
  assert.deepStrictEqual(cardOf({ itemName: "Café — “quoted” …" }).missingGlyphs, []);
  ok("a character the font lacks is reported, so the drop is refused", "emoji and CJK; accents and punctuation pass");

  // ---- Escaping --------------------------------------------------------------
  const hostile = svgOf({ itemName: '</text><script>alert(1)</script>', attributes: [{ name: 'A&B "q"', value: "<it's>" }] });
  assert.ok(!hostile.includes("<script"));
  assert.ok(hostile.includes("&lt;/text&gt;&lt;script&gt;") || hostile.includes("&lt;/text&gt;&lt;script"));
  assert.ok(hostile.includes("A&amp;B &quot;q&quot;") && hostile.includes("&lt;it&#39;s&gt;"));
  assert.strictEqual((hostile.match(/<text\b/g) || []).length, (hostile.match(/<\/text>/g) || []).length);
  ok("every value is escaped", "a CSV cell cannot close a tag or inject a script");

  const ctrl = svgOf({ itemName: "Bad\u0001Name\u000B" });
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(ctrl) && texts(ctrl).includes("BadName"));
  ok("characters XML forbids are removed", "one would make the whole image unparseable");

  // ---- Palette ----------------------------------------------------------------
  const a1 = m.accentFromSlug("founders");
  assert.strictEqual(a1, m.accentFromSlug("founders"));
  assert.notStrictEqual(a1, m.accentFromSlug("summer"));
  assert.ok(/^#[0-9a-f]{6}$/.test(a1));
  assert.strictEqual(m.resolvePalette({ accent: "#ABCDEF" }, "founders").accent, "#abcdef");
  assert.strictEqual(m.resolvePalette({ accent: "#ABCDEF" }, "founders").background, "#14161a");
  for (const bad of ["red", "#abc", "#abcdeg", 123, "#abcdef; x"]) {
    assert.throws(() => m.resolvePalette({ background: bad }, "s"), /#rrggbb/, String(bad));
  }
  assert.throws(() => m.resolvePalette("dark", "s"), /must be an object/);
  ok("palette: stable per collection, overridable per key, malformed refused", a1);

  assert.deepStrictEqual(m.parseAttributes("Series:Genesis| Tier : Core |Loose||"), [
    { name: "Series", value: "Genesis" }, { name: "Tier", value: "Core" }, { name: "Loose", value: "" },
  ]);
  assert.deepStrictEqual(m.parseAttributes("Ratio:3:2"), [{ name: "Ratio", value: "3:2" }]);
  ok("attributes parse as generate-metadata.js parses them", "the card and the metadata list the same traits");

  console.log("\n  All local assertions held. No marketplace was tested.\n");
})().catch((err) => {
  console.error("\n  FAILED: " + err.message + "\n");
  process.exit(1);
});
