#!/usr/bin/env node
/**
 * scripts/verify-uploads.selftest.js
 *
 * Exercises verify-uploads.js's judgement with no network.
 *
 * FIXTURES ARE PRODUCTION DATA: the upload node's records for the fork's real
 * TEST-001..004 uploads, and the sizes of the local files, as read on
 * 2026-10-21. TEST-002's and TEST-004's metadata were regenerated after upload
 * (583 and 586 bytes uploaded, 646 and 649 local) - a real case of the
 * mismatch this script exists to catch before a deploy.
 *
 * WHAT IT DOES NOT PROVE: that main() reads the right local file for each row,
 * or that the upload node keeps this response shape. Run the script.
 */
"use strict";

const assert = require("assert");
const path = require("path");
const { judge, idOf } = require(path.join(__dirname, "verify-uploads.js"));

function ok(label, detail) {
  console.log(`  ok  ${label}${detail ? " — " + detail : ""}`);
}

const rec = (type, size) => ({ tags: [{ name: "Content-Type", value: type }], data_size: String(size) });
const IMG = "https://gateway.irys.xyz/CDKZz6S3Hu2283oMYB8z7zx39eRXS647TP9sffoVPKeM"; // TEST-001 itemImage
const URI1 = "https://gateway.irys.xyz/Cb6o5VzJjVJc1pk4QWmUZD2itWpwtzBFcrfN3aFu5Qi8"; // TEST-001 uri
const URI2 = "https://gateway.irys.xyz/Ft8D9rfRN83g642ANR3UwKT4NMr38KDiQ2QiGFH6k9D4"; // TEST-002 uri

(async () => {
  console.log("\n  verify-uploads.js — upload records against local files, offline\n");

  assert.strictEqual(idOf(IMG), "CDKZz6S3Hu2283oMYB8z7zx39eRXS647TP9sffoVPKeM");
  assert.strictEqual(idOf("https://placehold.co/x"), null);
  assert.strictEqual(idOf("https://arweave.net/CDKZz6S3Hu2283oMYB8z7zx39eRXS647TP9sffoVPKeM"), null);
  ok("an Irys gateway URL yields its id; anything else does not");

  let r = judge({ kind: "itemImage", url: IMG, record: rec("image/png", 68), status: "CONFIRMED", localSize: 68, deployed: true });
  assert.strictEqual(r.status, "verified");
  r = judge({ kind: "uri", url: URI1, record: rec("application/json", 588), status: "CONFIRMED", localSize: 588, deployed: true });
  assert.strictEqual(r.status, "verified");
  ok("the fork's matching uploads verify", "TEST-001 image 68 = 68, metadata 588 = 588");

  const before = judge({ kind: "uri", url: URI2, record: rec("application/json", 583), status: "CONFIRMED", localSize: 646, deployed: false });
  assert.strictEqual(before.status, "size_mismatch");
  assert.strictEqual(before.ok, false);
  const after = judge({ kind: "uri", url: URI2, record: rec("application/json", 583), status: "CONFIRMED", localSize: 646, deployed: true });
  assert.strictEqual(after.status, "drifted_after_deploy");
  assert.ok(after.ok && after.warning);
  ok("a regenerated local file fails before deploy, warns after", "TEST-002: 583 uploaded, 646 local");

  assert.strictEqual(judge({ kind: "uri", url: URI2, record: null, status: null, localSize: 646, deployed: false }).status, "missing");
  assert.strictEqual(judge({ kind: "uri", url: URI2, record: rec("application/json", 583), status: "PENDING", localSize: 583, deployed: false }).status, "not_confirmed");
  ok("no such transaction, and a transaction not yet confirmed, both fail");

  assert.strictEqual(judge({ kind: "uri", url: URI2, record: rec("image/png", 583), status: "CONFIRMED", localSize: 583, deployed: false }).status, "wrong_type");
  assert.strictEqual(judge({ kind: "itemImage", url: IMG, record: rec("application/json", 68), status: "CONFIRMED", localSize: 68, deployed: false }).status, "wrong_type");
  assert.strictEqual(judge({ kind: "itemImage", url: IMG, record: rec("image/svg+xml", 68), status: "CONFIRMED", localSize: 68, deployed: false }).status, "verified");
  ok("the uri must be JSON and the image must be an image", "an image uploaded as the uri is caught");

  const np = judge({ kind: "itemImage", url: "https://placehold.co/400", record: null, status: null, localSize: null, deployed: false });
  assert.ok(np.status === "not_uploaded" && np.ok);
  assert.strictEqual(judge({ kind: "uri", url: "", record: null, status: null, localSize: null, deployed: true }).ok, false);
  assert.strictEqual(judge({ kind: "uri", url: "https://example.org/x.json", record: null, status: null, localSize: null, deployed: false }).status, "unverifiable");
  ok("not uploaded yet passes; deployed without one, or a non-Irys URL, does not");

  assert.strictEqual(judge({ kind: "itemImage", url: IMG, record: rec("image/png", 68), status: "CONFIRMED", localSize: null, deployed: true }).status, "verified_no_local");
  ok("no local file to compare is said, not hidden", "verified_no_local");

  console.log("\n  All local assertions held. No network call was made.\n");
})().catch((err) => {
  console.error("\n  FAILED: " + err.message + "\n");
  process.exit(1);
});
