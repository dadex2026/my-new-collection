#!/usr/bin/env node
/**
 * scripts/placeholder.selftest.js
 *
 * Exercises lib/placeholder.js, the one definition of "not a real upload yet",
 * and checks that no script has grown its own copy again. Offline.
 *
 *   node scripts/placeholder.selftest.js
 *
 * FIXTURES: the real-upload URLs are my-new-collection/backend/master.csv's,
 * verbatim - every itemImage and uri it carries on mainnet - so the union of
 * the old rules is shown not to reject a single real upload (open-items 50:
 * fixtures come from production).
 *
 * WHAT IT DOES NOT PROVE
 *   That a URL which passes actually resolves. A dead real-looking URL is not a
 *   placeholder by this definition, as it never was.
 *
 * Exit codes:
 *   0 = every assertion held
 *   1 = an assertion failed
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { isPlaceholder } = require(path.join(__dirname, "lib", "placeholder.js"));

function ok(label, detail) {
  console.log(`  ok  ${label}${detail ? " — " + detail : ""}`);
}

// my-new-collection/backend/master.csv: every real itemImage and uri.
const FORK_REAL = [
  "https://gateway.irys.xyz/CDKZz6S3Hu2283oMYB8z7zx39eRXS647TP9sffoVPKeM",
  "https://gateway.irys.xyz/Cb6o5VzJjVJc1pk4QWmUZD2itWpwtzBFcrfN3aFu5Qi8",
  "https://gateway.irys.xyz/Hv4Aa6aD6nKyGEXrxafcwJSKyS4XdLAHr9nq8z9rzApC",
  "https://gateway.irys.xyz/Ft8D9rfRN83g642ANR3UwKT4NMr38KDiQ2QiGFH6k9D4",
  "https://gateway.irys.xyz/BjUjK9J54W7NBZVyG1F8SQdaJ2bDmC8pHMa29byist4P",
  "https://gateway.irys.xyz/BZBY3SCCiT69K4DGRzLRuojZhHDVeyC2Jzgc6Mx71PBX",
  "https://gateway.irys.xyz/8KmSDszcgqa68pAg6azfrKRiH2Ne1yNECoT1e6jQhcHz",
  "https://gateway.irys.xyz/F1JjYUuiEtX858koZsxtisKodYCLXi2FNe9CPQP3DmM3",
];
// The same file's collectionImage values, all still placeholders (item 35).
const FORK_PLACEHOLDER = ["https://placehold.co/400x400?text=A", "https://placehold.co/400x400?text=D"];

(async () => {
  console.log("\n  lib/placeholder.js — one definition, offline\n");

  for (const u of FORK_REAL) assert.strictEqual(isPlaceholder(u), false, u);
  for (const u of FORK_PLACEHOLDER) assert.strictEqual(isPlaceholder(u), true, u);
  ok("every real upload in the fork's master.csv passes", `${FORK_REAL.length} itemImage/uri values; its placehold.co collectionImages do not`);

  for (const v of [undefined, null, "", "   ", "\t\n"]) assert.strictEqual(isPlaceholder(v), true, JSON.stringify(v));
  ok("missing, empty and whitespace-only are placeholders", "get-holders.js used to pass whitespace");

  assert.strictEqual(isPlaceholder("https://placehold.co/400x400?text=Sample"), true);
  assert.strictEqual(isPlaceholder("https://example.com/sample-001"), true);
  assert.strictEqual(isPlaceholder("https://arweave.net/AbCdEf123"), true);
  assert.strictEqual(isPlaceholder("https://gateway.irys.xyz/ImageHash"), true);
  ok("sample hosts and both sample markers", "AbCdEf/ImageHash were missing from four copies");

  const fake = "https://gateway.irys.xyz/" + "a1b2c3d4e5".repeat(4) + "f6a";
  assert.strictEqual(fake.split("/").pop().length, 43);
  assert.strictEqual(isPlaceholder(fake), true);
  assert.strictEqual(isPlaceholder(fake + "  "), true);
  assert.strictEqual(isPlaceholder("https://gateway.irys.xyz/" + "a".repeat(42)), false);
  ok("an upload dry run's fake id is a placeholder", "43 lowercase hex; 42 is not the pattern");

  // "ImageHash" contains I, which base58 has no use for, so it cannot appear in
  // a real id; "AbCdEf" can, at about one id in a billion - accepted.
  const B58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
  assert.ok(!B58.test("ImageHash") && B58.test("AbCdEf"));
  for (const u of FORK_REAL) assert.ok(B58.test(u.split("/").pop()));
  ok("the marker trade-off is as recorded", "ImageHash impossible in base58; AbCdEf possible, accepted");

  // No script may define its own copy again.
  const scriptsDir = __dirname;
  const own = fs.readdirSync(scriptsDir)
    .filter((f) => f.endsWith(".js") && !f.endsWith(".selftest.js"))
    .filter((f) => /function\s+isPlaceholder\w*\s*\(/.test(fs.readFileSync(path.join(scriptsDir, f), "latin1")));
  assert.deepStrictEqual(own, [], `scripts defining their own placeholder check: ${own.join(", ")}`);
  const users = fs.readdirSync(scriptsDir)
    .filter((f) => f.endsWith(".js") && !f.endsWith(".selftest.js"))
    .filter((f) => fs.readFileSync(path.join(scriptsDir, f), "latin1").includes('require("./lib/placeholder")'));
  assert.strictEqual(users.length, 9, `expected the nine former copies to require lib/placeholder, found ${users.length}: ${users.join(", ")}`);
  ok("no script defines its own placeholder check; the nine require the shared one", users.length + " scripts");

  console.log("\n  All local assertions held.\n");
})().catch((err) => {
  console.error("\n  FAILED: " + err.message + "\n");
  process.exit(1);
});
