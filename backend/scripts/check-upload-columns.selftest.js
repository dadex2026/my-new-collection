#!/usr/bin/env node
/**
 * scripts/check-upload-columns.selftest.js
 *
 * Exercises check-upload-columns.js offline. Fixtures are production rows:
 * my-new-collection's four TEST rows (real uploads), and the template's own
 * SAMPLE-001 row (placeholders) - the row a fresh fork starts from.
 *
 * WHAT IT DOES NOT PROVE: that main() reads the right slug's rows. Run it.
 */
"use strict";

const assert = require("assert");
const path = require("path");
const { unfilled } = require(path.join(__dirname, "check-upload-columns.js"));

function ok(label, detail) {
  console.log(`  ok  ${label}${detail ? " — " + detail : ""}`);
}

const FORK = [
  { dropItemId: "TEST-001", itemImage: "https://gateway.irys.xyz/CDKZz6S3Hu2283oMYB8z7zx39eRXS647TP9sffoVPKeM", uri: "https://gateway.irys.xyz/Cb6o5VzJjVJc1pk4QWmUZD2itWpwtzBFcrfN3aFu5Qi8" },
  { dropItemId: "TEST-004", itemImage: "https://gateway.irys.xyz/8KmSDszcgqa68pAg6azfrKRiH2Ne1yNECoT1e6jQhcHz", uri: "https://gateway.irys.xyz/F1JjYUuiEtX858koZsxtisKodYCLXi2FNe9CPQP3DmM3" },
];
// The template's own SAMPLE-001 row as shipped since 2026-10-21: both columns blank.
const SAMPLE = { dropItemId: "SAMPLE-001", itemImage: "", uri: "" };
// The same row as it shipped before that, with a placehold.co image.
const OLD_SAMPLE = { ...SAMPLE, itemImage: "https://placehold.co/400x400?text=Sample+Item" };

(async () => {
  console.log("\n  check-upload-columns.js — offline\n");

  assert.deepStrictEqual(unfilled(FORK), []);
  ok("the fork's uploaded drops pass", "real Irys URLs in both columns");

  const s = unfilled([SAMPLE]);
  assert.strictEqual(s.length, 1);
  assert.deepStrictEqual(s[0].missing.map((m) => m.split(" ")[0]), ["itemImage", "uri"]);
  assert.strictEqual(unfilled([OLD_SAMPLE])[0].missing.length, 2);
  ok("the template's sample row fails on both columns", "as shipped now (blank) and before (placehold.co)");

  const blank = unfilled([{ dropItemId: "NEW-001", itemImage: "", uri: "" }]);
  assert.strictEqual(blank[0].missing.length, 2);
  const fake = unfilled([{ ...FORK[0], uri: "https://gateway.irys.xyz/" + "a1b2c3d4e5".repeat(4) + "f6a" }]);
  assert.deepStrictEqual(fake[0].missing.map((m) => m.split(" ")[0]), ["uri"]);
  ok("blank columns and a dry run's fake uri fail", "the shared placeholder rule decides");

  const mixed = unfilled([...FORK, SAMPLE]);
  assert.deepStrictEqual(mixed.map((m) => m.dropItemId), ["SAMPLE-001"]);
  ok("only the unfilled drop is named", "SAMPLE-001 among the fork's rows");

  console.log("\n  All local assertions held.\n");
})().catch((err) => {
  console.error("\n  FAILED: " + err.message + "\n");
  process.exit(1);
});
