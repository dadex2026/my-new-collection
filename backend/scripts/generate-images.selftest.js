#!/usr/bin/env node
/**
 * scripts/generate-images.selftest.js
 *
 * Exercises the pure card composer in generate-images.js with no network and
 * no files. Run it before and after touching that script.
 *
 *   node scripts/generate-images.selftest.js
 *
 * WHAT IT PROVES
 *   - The same row always composes the same bytes.
 *   - Every printed value is escaped, and characters XML forbids are removed,
 *     so no CSV cell can break the SVG or inject markup into it.
 *   - Every attribute is printed, up to ten, and the rest are counted, not
 *     silently dropped; a drop with no attributes prints its description.
 *   - price and maxSupply never reach the card.
 *   - Shortening counts code points, so an emoji is never split.
 *   - The palette is deterministic per collection, overridable, and a
 *     malformed colour is refused rather than written.
 *
 * WHAT IT DOES NOT PROVE
 *   How the card looks in any particular renderer. No font is embedded, so
 *   the system font decides real text widths; fitting is by a generous
 *   character budget. Look at the generated cards, and check them on the
 *   marketplaces you care about, before the first real upload - some
 *   rasterise SVG to PNG and serve that everywhere.
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

const PALETTE = { background: "#14161a", foreground: "#f2f2f0", accent: "#3fa7d6" };
const base = {
  collectionName: "Founders",
  itemName: "Founders Pass",
  dropItemId: "OE-001",
  attributes: [{ name: "Series", value: "Genesis" }, { name: "Tier", value: "Core" }],
  description: "",
  symbol: "FND",
  palette: PALETTE,
};
const svgOf = (over) => m.composeCard({ ...base, ...over }).svg;
// The text content of every <text> element, unescaped, in document order.
const texts = (svg) =>
  [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((x) =>
    x[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&"));

(async () => {
  console.log("\n  generate-images.js — text card composer, offline\n");

  // ---- Determinism and shape ----------------------------------------------
  assert.strictEqual(svgOf({}), svgOf({}));
  ok("the same row composes the same bytes", "no clock, no randomness");

  const svg = svgOf({});
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"'));
  assert.ok(m.isGenerated(svg));
  assert.strictEqual((svg.match(/<text\b/g) || []).length, (svg.match(/<\/text>/g) || []).length);
  assert.strictEqual((svg.match(/<svg\b/g) || []).length, 1);
  assert.ok(svg.trimEnd().endsWith("</svg>"));
  assert.ok(!m.isGenerated('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
  ok("one square root element, balanced text, and the generator marker", "a hand-made SVG reads as not generated");

  // ---- What is printed ----------------------------------------------------
  assert.deepStrictEqual(texts(svg), ["Founders", "Founders Pass", "Series", "Genesis", "Tier", "Core", "OE-001", "FND"]);
  ok("prints collection, item, every trait in order, id and symbol", "and nothing else");

  const rich = svgOf({ attributes: [{ name: "Price", value: "Bronze" }], price: "0.5", maxSupply: "777" });
  assert.ok(!rich.includes("777") && !rich.includes("0.5"));
  ok("price and maxSupply never reach the card", "both change after launch; the image does not");

  const twelve = Array.from({ length: 12 }, (_, i) => ({ name: `T${i + 1}`, value: `V${i + 1}` }));
  const t12 = texts(svgOf({ attributes: twelve }));
  assert.ok(t12.includes("V10") && !t12.includes("V11") && !t12.includes("V12"));
  assert.ok(t12.some((t) => t === "OE-001  +2 more"));
  assert.ok(m.composeCard({ ...base, attributes: twelve }).notes.some((n) => n.includes("2 trait(s) beyond ten")));
  ok("ten traits printed, the rest counted on the card and reported", "never silently dropped");

  const desc = texts(svgOf({ attributes: [], description: "A card with no traits prints its description here instead." }));
  assert.ok(desc.join(" ").includes("prints its description here instead."));
  assert.deepStrictEqual(texts(svgOf({ attributes: [], description: "" })), ["Founders", "Founders Pass", "OE-001", "FND"]);
  ok("no attributes: the description fills the grid", "and an empty one prints nothing");

  // ---- Escaping -----------------------------------------------------------
  const hostile = svgOf({
    itemName: '</text><script>alert(1)</script>',
    attributes: [{ name: 'A&B "q"', value: "<it's>" }],
  });
  assert.ok(!hostile.includes("<script"));
  assert.ok(hostile.includes("&lt;/text&gt;&lt;script&gt;"));
  assert.ok(hostile.includes("A&amp;B &quot;q&quot;") && hostile.includes("&lt;it&#39;s&gt;"));
  assert.strictEqual((hostile.match(/<text\b/g) || []).length, (hostile.match(/<\/text>/g) || []).length);
  ok("every value is escaped", "a CSV cell cannot close a tag or inject a script");

  const ctrl = svgOf({ itemName: "Bad\u0001Name\u000B" });
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(ctrl));
  assert.ok(texts(ctrl).includes("BadName"));
  ok("characters XML forbids are removed", "one would make the whole image unparseable");

  // ---- Fitting --------------------------------------------------------------
  const f = m.fitText("abcdefghij", 5);
  assert.deepStrictEqual(f, { text: "abcd…", truncated: true });
  assert.deepStrictEqual(m.fitText("abc", 5), { text: "abc", truncated: false });
  const emoji = m.fitText("\u{1F525}\u{1F525}\u{1F525}\u{1F525}", 3);
  assert.strictEqual(Array.from(emoji.text).length, 3);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(emoji.text));
  ok("shortening adds an ellipsis and counts code points", "an emoji is never split in half");

  const longName = m.composeCard({ ...base, itemName: "X".repeat(80) });
  assert.ok(longName.notes.includes("itemName"));
  assert.ok(texts(longName.svg)[1].endsWith("…"));
  const w = m.wrapText("one two three four five six seven", 9, 2);
  assert.ok(w.truncated && w.lines.length === 2 && w.lines[1].endsWith("…"));
  ok("a long name is shortened and reported; long prose wraps and is capped", "the metadata keeps the full text");

  // ---- Palette --------------------------------------------------------------
  const a1 = m.accentFromSlug("founders");
  assert.strictEqual(a1, m.accentFromSlug("founders"));
  assert.notStrictEqual(a1, m.accentFromSlug("summer"));
  assert.ok(/^#[0-9a-f]{6}$/.test(a1));
  assert.deepStrictEqual(m.resolvePalette(undefined, "founders"), { background: "#14161a", foreground: "#f2f2f0", accent: a1 });
  ok("the default accent is stable per collection and differs between them", a1);

  assert.strictEqual(m.resolvePalette({ accent: "#ABCDEF" }, "founders").accent, "#abcdef");
  assert.strictEqual(m.resolvePalette({ accent: "#ABCDEF" }, "founders").background, "#14161a");
  for (const bad of ["red", "#abc", "#abcdeg", 123, "#abcdef; x"]) {
    assert.throws(() => m.resolvePalette({ background: bad }, "s"), /#rrggbb/, String(bad));
  }
  assert.throws(() => m.resolvePalette("dark", "s"), /must be an object/);
  ok("config.json card overrides per key, and a malformed colour is refused", "never written into a permanent image");

  // ---- parseAttributes matches generate-metadata.js ------------------------
  assert.deepStrictEqual(m.parseAttributes("Series:Genesis| Tier : Core |Loose||"), [
    { name: "Series", value: "Genesis" }, { name: "Tier", value: "Core" }, { name: "Loose", value: "" },
  ]);
  assert.deepStrictEqual(m.parseAttributes("Ratio:3:2"), [{ name: "Ratio", value: "3:2" }]);
  ok("attributes parse as generate-metadata.js parses them", "the card and the metadata list the same traits");

  console.log("\n  All local assertions held. No renderer was tested.\n");
})().catch((err) => {
  console.error("\n  FAILED: " + err.message + "\n");
  process.exit(1);
});
