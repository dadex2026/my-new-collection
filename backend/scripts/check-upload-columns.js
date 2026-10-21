#!/usr/bin/env node
/**
 * scripts/check-upload-columns.js
 *
 * Step 7.4a, offline half: after the uploads (7.2 image, 7.4 metadata) and
 * before any deploy, every drop of the collection must have a real itemImage
 * and a real uri. REQUIRED: exit 1 stops the deploy.
 *
 * WHY HERE AND NOT IN PREFLIGHT
 *   These were preflight's no_placeholder_images and no_placeholder_uris until
 *   2026-10-21. Preflight runs at Stage 6, before Stage 7 fills the columns, so
 *   a correct new collection could never pass it cleanly - only by
 *   --allow-warnings, which teaches the wrong habit. Upload facts belong at the
 *   upload gate (open-items 60). This is the same check, at the point where it
 *   can pass; moving it weakens nothing because this gate is as hard as the old
 *   one, and deploy-candy-machine.js still refuses a placeholder uri itself.
 *
 * OFFLINE on purpose. verify-uploads.js, at the same step, asks the Irys node
 * whether each upload is real; an unreachable node must not block this check,
 * which needs no network.
 *
 * A placeholder is whatever lib/placeholder.js says - empty, placehold.co,
 * example.com, the sample markers, or an upload dry run's fake id.
 *
 * Exit codes:
 *   0 = every drop has a real itemImage and uri
 *   1 = at least one does not (each named), or bad config / CSV
 *
 * Usage:
 *   node scripts/check-upload-columns.js
 *   node scripts/check-upload-columns.js --slug founders
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { parseCsvRecords } = require("./lib/csv");
const { isPlaceholder } = require("./lib/placeholder");

const BACKEND_DIR = path.join(__dirname, "..");

// Pure: the drops whose upload columns are not filled with real values.
function unfilled(rows) {
  const out = [];
  for (const r of rows) {
    const missing = [];
    if (isPlaceholder(r.itemImage)) missing.push("itemImage (run 7.2 upload-images.js)");
    if (isPlaceholder(r.uri)) missing.push("uri (run 7.4 upload-metadata.js)");
    if (missing.length) out.push({ dropItemId: r.dropItemId, missing });
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const si = args.indexOf("--slug");
  let config;
  try { config = JSON.parse(fs.readFileSync(path.join(BACKEND_DIR, "config.json"), "utf8")); }
  catch (err) { console.log(`✗ check-upload-columns: cannot read backend/config.json: ${err.message}`); process.exit(1); }
  const slug = si !== -1 && args[si + 1] ? args[si + 1] : config.collectionSlug;
  const { records } = parseCsvRecords(fs.readFileSync(path.join(BACKEND_DIR, "master.csv"), "utf8"));
  const rows = records.filter((r) => r.collectionSlug === slug);
  if (rows.length === 0) {
    console.log(`✗ check-upload-columns: no master.csv rows for collectionSlug "${slug}" - nothing checked, not a pass.`);
    process.exit(1);
  }
  const bad = unfilled(rows);
  if (bad.length) {
    console.log(`✗ check-upload-columns: ${bad.length} of ${rows.length} drop(s) in "${slug}" are not ready to deploy:`);
    for (const b of bad) console.log(`  ${b.dropItemId}: ${b.missing.join(", ")}`);
    console.log("\nDo not deploy (7.5, 7.6) until this passes.");
    process.exit(1);
  }
  console.log(`✓ check-upload-columns: all ${rows.length} drop(s) in "${slug}" have a real itemImage and uri. Now run verify-uploads.js.`);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { unfilled };
