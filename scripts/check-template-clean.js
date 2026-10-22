#!/usr/bin/env node
/**
 * scripts/check-template-clean.js
 *
 * Fails if the TEMPLATE holds collection-specific state - anything a new
 * collection would inherit by copying this folder. The inverse of preflight.js:
 * preflight validates a collection about to deploy; this validates the thing
 * being copied.
 *
 *   node scripts/check-template-clean.js            (run in the template, before Stage 1's copy)
 *
 * WHY
 *   On 2026-10-22 the template held a live mainnet deployer key (Ge5ci5E7...:
 *   0.44 SOL, update authority over two collections and a still-mintable candy
 *   machine), a deploy-state.json naming one of those collections, and a
 *   deployment.json naming the fork's treasury - all from the template having
 *   been operated as if it were a collection. Stage 1 deletes most of that
 *   right after the copy, behind a warning box; nothing enforced it. A guard
 *   beats a warning box (open-items 61).
 *
 * READ-ONLY: it reports, it never deletes. Several of these files are real
 * records (a key, a deploy state) that must be MOVED somewhere safe, not lost.
 *
 * Deliberately NOT wired into the pre-push hook: the template's own working copy
 * is legitimately dirty mid-investigation, and a hook that fails on it would be
 * bypassed. And not `npm run`: the repo has no root package.json, and the
 * guide's Stage 0 note relies on that being true.
 *
 * Exit codes:
 *   0 = nothing collection-specific found
 *   1 = at least one item (each named, with why and what to do)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PLACEHOLDER_TREASURY = "YOUR_TREASURY_ADDRESS";
const PLACEHOLDER_SLUG = "your-collection-slug";
const MASTER_COLUMNS = ["collectionAddress", "candyMachineAddress", "candyGuardAddress", "holderRequiredCollection", "holderPrice", "itemImage", "uri"];
const CAMPAIGN_COLUMNS = ["campaignCandyMachineAddress", "eligibilityCollection", "targetCollection", "treasury", "claimLimitId", "assetLimitId"];

// Pure. `snap` is a snapshot of the template: which paths exist, the parsed
// config and deployment files, the CSV rows, and the files in generated dirs.
function findState(snap) {
  const out = [];
  const add = (what, why, fix) => out.push({ what, why, fix });

  for (const f of ["backend/.env.admin", "backend/.env", "frontend/.env"]) {
    if (snap.exists[f]) add(f, "secrets belong to whoever operated this folder, not to a new collection", "move it out of the template (Stage 1 deletes it from a copy)");
  }
  for (const f of ["backend/deploy-state.json", "backend/registry.json"]) {
    if (snap.exists[f]) add(f, "deploy state from running a collection command in the template", "move it out if it records a real deploy; Stage 1 deletes it from a copy");
  }
  for (const d of ["backend/logs", ".netlify"]) {
    if (snap.exists[d]) add(d + "/", "local run history / a Netlify site link", "Stage 1 deletes it from a copy; remove it from the template");
  }

  const c = snap.config || {};
  if (c.treasury !== PLACEHOLDER_TREASURY) add("backend/config.json treasury", `is "${c.treasury}", not ${PLACEHOLDER_TREASURY}`, "restore the placeholder");
  if (c.network !== "devnet") add("backend/config.json network", `is "${c.network}", not devnet`, "restore devnet");
  if (c.collectionSlug !== PLACEHOLDER_SLUG) add("backend/config.json collectionSlug", `is "${c.collectionSlug}", not ${PLACEHOLDER_SLUG}`, "restore the placeholder");

  const d = snap.deployment;
  if (d) {
    if (d.assetAddress) add("deployment.json assetAddress", `names an on-chain asset (${d.assetAddress}) belonging to nobody in a new project`, "delete the field; nothing reads it");
    if (d.treasury && d.treasury !== PLACEHOLDER_TREASURY) add("deployment.json treasury", `states a real treasury (${d.treasury}); nothing reads it, but a person looking for the treasury finds it and copies it`, "delete the field");
    if (d.createdAt) add("deployment.json createdAt", "a stamped value from a past deploy", "delete the field");
  }

  for (const r of snap.masterRows || []) {
    for (const col of MASTER_COLUMNS) {
      if ((r[col] || "").trim()) add(`master.csv ${r.dropItemId} ${col}`, `is set ("${String(r[col]).slice(0, 24)}")`, "blank it - Stage 7 fills it for a real collection");
    }
  }
  for (const r of snap.campaignRows || []) {
    for (const col of CAMPAIGN_COLUMNS) {
      if ((r[col] || "").trim()) add(`campaigns.csv ${r.campaignId} ${col}`, `is set ("${String(r[col]).slice(0, 24)}")`, "blank it");
    }
  }
  for (const [dir, files] of Object.entries(snap.generated || {})) {
    if (files.length) add(`${dir}/ (${files.length} file(s))`, "generated or real collection art/metadata", "remove it from the template");
  }
  return out;
}

function snapshot() {
  const { parseCsvRecords } = require(path.join(ROOT, "backend", "scripts", "lib", "csv.js"));
  const exists = {};
  for (const f of ["backend/.env.admin", "backend/.env", "frontend/.env", "backend/deploy-state.json", "backend/registry.json", "backend/logs", ".netlify"]) {
    exists[f] = fs.existsSync(path.join(ROOT, f));
  }
  const readJson = (f) => (fs.existsSync(path.join(ROOT, f)) ? JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")) : null);
  const rows = (f) => (fs.existsSync(path.join(ROOT, f)) ? parseCsvRecords(fs.readFileSync(path.join(ROOT, f), "utf8")).records : []);
  const list = (d) => (fs.existsSync(path.join(ROOT, d)) ? fs.readdirSync(path.join(ROOT, d)).filter((n) => !n.startsWith(".")) : []);
  return {
    exists,
    config: readJson("backend/config.json"),
    deployment: readJson("deployment.json"),
    masterRows: rows("backend/master.csv"),
    campaignRows: rows("backend/campaigns.csv"),
    generated: { "backend/metadata": list("backend/metadata"), "backend/images": list("backend/images") },
  };
}

function main() {
  const found = findState(snapshot());
  if (found.length === 0) {
    console.log("\n✓ check-template-clean: nothing collection-specific in the template. Safe to copy.\n");
    process.exit(0);
  }
  console.log(`\n✗ check-template-clean: ${found.length} item(s) a new collection would inherit:\n`);
  for (const f of found) console.log(`  ${f.what}\n      ${f.why}\n      -> ${f.fix}`);
  console.log("\nNothing was changed. Some of these are real records - move them, do not lose them.\n");
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = { findState };
