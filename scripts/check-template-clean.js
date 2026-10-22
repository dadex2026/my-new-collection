#!/usr/bin/env node
/**
 * scripts/check-template-clean.js
 *
 * Finds collection-specific state in a folder that is, or was just copied
 * from, the template. The inverse of preflight.js: preflight validates a
 * collection about to deploy; this validates the thing being copied.
 *
 * TWO RUNS, because a guard that always fails on its own repo stops being read:
 *
 *   node scripts/check-template-clean.js --inventory
 *     IN THE TEMPLATE, before Stage 1's copy. Informational: the template's own
 *     working copy legitimately holds local secrets and run history, so exit 1
 *     is expected here. It tells you what the copy will carry.
 *
 *   node scripts/check-template-clean.js --verify
 *     IN THE COPY, after Stage 1's Remove-Item block. EXIT 0 REQUIRED - this is
 *     the run with teeth. It is what catches a skipped or half-run Remove-Item,
 *     which nothing else checks (open-items 61).
 *
 * WHAT IT CHECKS
 *   - `git status --porcelain` must be empty: anything untracked or modified
 *     that the enumerated checks below do not know about. On 2026-10-22 the
 *     first version, an enumerated list only, was silent about an untracked
 *     "Claude outputs/" and a stray LAUNCH-DECISIONS.md found the same day by
 *     eye. In --verify one entry is allowed - " M deployment.json" - because
 *     Stage 1 itself edits that file; its content is checked separately.
 *     LIMIT: git does not track empty directories, so porcelain would not have
 *     caught the empty backend/metadata/ found the same week - hence:
 *   - an explicit sweep for the known generated directories, empty or not:
 *     backend/metadata/, backend/images/
 *   - the gitignored files git status cannot see: the three .env files,
 *     deploy-state.json, registry.json, backend/logs/, .netlify/
 *   - backend/config.json still placeholdered; no address, itemImage or uri
 *     filled in master.csv or campaigns.csv
 *   - deployment.json. In --inventory its assetAddress, treasury and createdAt
 *     are a DELIBERATE fixture for prompt A1 when its _why key says so, and
 *     are reported as expected, not as findings. In --verify the copy must have
 *     removed assetAddress, createdAt and _why, and must not still carry the
 *     template's stale treasury.
 *
 * READ-ONLY: it reports, it never deletes. Some findings are real records (a
 * key, a deploy state) that must be MOVED, not lost.
 *
 * Exit codes:
 *   0 = nothing found (expected deliberate items excepted)
 *   1 = findings (each named, with why and what to do)
 *   2 = no mode given, or not a git checkout
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PLACEHOLDER_TREASURY = "YOUR_TREASURY_ADDRESS";
const PLACEHOLDER_SLUG = "your-collection-slug";
// The template's deliberately stale deployment.json values (prompt A1's fixture).
const STALE_TREASURY = "7XJJvj5N4aBMNyX9g5NZqSEzi9vY6vYxWydezMZvC4n9";
const MASTER_COLUMNS = ["collectionAddress", "candyMachineAddress", "candyGuardAddress", "holderRequiredCollection", "holderPrice", "itemImage", "uri"];
const CAMPAIGN_COLUMNS = ["campaignCandyMachineAddress", "eligibilityCollection", "targetCollection", "treasury", "claimLimitId", "assetLimitId"];
const IGNORED_STATE = ["backend/.env.admin", "backend/.env", "frontend/.env", "backend/deploy-state.json", "backend/registry.json", "backend/logs", ".netlify"];
const GENERATED_DIRS = ["backend/metadata", "backend/images"];

// Pure. Returns { findings, expected } for a snapshot of the folder.
function findState(snap, mode) {
  const findings = [];
  const expected = [];
  const add = (what, why, fix) => findings.push({ what, why, fix });

  for (const line of snap.porcelain || []) {
    if (mode === "verify" && line === " M deployment.json") continue;
    add(`git status: ${line}`, "untracked or modified, and no check below accounts for it", "decide what it is; remove it from the copy source if it is not the template's");
  }
  for (const d of GENERATED_DIRS) {
    if (snap.dirs && snap.dirs[d] !== undefined) {
      add(`${d}/ (${snap.dirs[d]} entr${snap.dirs[d] === 1 ? "y" : "ies"})`, "a generated directory - git cannot see it when empty", "remove it; the scripts recreate it");
    }
  }
  for (const f of IGNORED_STATE) {
    if (snap.exists[f]) {
      const secret = f.includes(".env");
      add(f, secret ? "secrets belonging to whoever operated this folder" : "local deploy state or run history",
        secret ? "move it out of the copy source (Stage 1 deletes it from a copy)" : "move it out if it records a real deploy; Stage 1 deletes it from a copy");
    }
  }

  const c = snap.config || {};
  if (c.treasury !== PLACEHOLDER_TREASURY) add("backend/config.json treasury", `is "${c.treasury}", not ${PLACEHOLDER_TREASURY}`, "restore the placeholder");
  if (c.network !== "devnet") add("backend/config.json network", `is "${c.network}", not devnet`, "restore devnet");
  if (c.collectionSlug !== PLACEHOLDER_SLUG) add("backend/config.json collectionSlug", `is "${c.collectionSlug}", not ${PLACEHOLDER_SLUG}`, "restore the placeholder");

  const d = snap.deployment;
  if (d) {
    const fixture = mode === "inventory" && typeof d._why === "string" && /fixture for prompt A1/i.test(d._why);
    const stale = { assetAddress: d.assetAddress, treasury: d.treasury, createdAt: d.createdAt };
    for (const [k, v] of Object.entries(stale)) {
      if (!v) continue;
      if (k === "treasury" && (v === PLACEHOLDER_TREASURY || (mode === "verify" && v !== STALE_TREASURY))) continue;
      if (fixture) { expected.push({ what: `deployment.json ${k}`, why: "deliberate - prompt A1's fixture, per the file's _why" }); continue; }
      add(`deployment.json ${k}`, mode === "verify" ? "the template's stale value is still in the copy" : `stale (${String(v).slice(0, 24)}), and no _why marks it deliberate`,
        mode === "verify" ? "delete it (Stage 1)" : "delete it, or mark the fixture with _why");
    }
    if (mode === "verify" && d._why) add("deployment.json _why", "the template's fixture note, copied into a collection where it is false", "delete it (Stage 1)");
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
  return { findings, expected };
}

function snapshot() {
  const { parseCsvRecords } = require(path.join(ROOT, "backend", "scripts", "lib", "csv.js"));
  let porcelain;
  try {
    porcelain = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    console.log("check-template-clean: not a git checkout - nothing checked, not a pass.");
    process.exit(2);
  }
  const exists = Object.fromEntries(IGNORED_STATE.map((f) => [f, fs.existsSync(path.join(ROOT, f))]));
  const dirs = {};
  for (const dname of GENERATED_DIRS) {
    const p = path.join(ROOT, dname);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) dirs[dname] = fs.readdirSync(p).length;
  }
  const readJson = (f) => (fs.existsSync(path.join(ROOT, f)) ? JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")) : null);
  const rows = (f) => (fs.existsSync(path.join(ROOT, f)) ? parseCsvRecords(fs.readFileSync(path.join(ROOT, f), "utf8")).records : []);
  return {
    porcelain, exists, dirs,
    config: readJson("backend/config.json"),
    deployment: readJson("deployment.json"),
    masterRows: rows("backend/master.csv"),
    campaignRows: rows("backend/campaigns.csv"),
  };
}

function main() {
  const mode = process.argv.includes("--inventory") ? "inventory" : process.argv.includes("--verify") ? "verify" : null;
  if (!mode) {
    console.log("Usage: --inventory (in the template, before copying; informational) or --verify (in the copy, after Stage 1; exit 0 required)");
    process.exit(2);
  }
  const { findings, expected } = findState(snapshot(), mode);
  const label = mode === "inventory" ? "INVENTORY (template, informational)" : "VERIFY (copy, exit 0 required)";
  for (const e of expected) console.log(`  expected  ${e.what} - ${e.why}`);
  if (findings.length === 0) {
    console.log(`\n✓ check-template-clean ${label}: nothing collection-specific.${mode === "verify" ? " Stage 1 is complete." : ""}\n`);
    process.exit(0);
  }
  console.log(`\n✗ check-template-clean ${label}: ${findings.length} item(s):\n`);
  for (const f of findings) console.log(`  ${f.what}\n      ${f.why}\n      -> ${f.fix}`);
  console.log(mode === "inventory"
    ? "\nExpected in the template's own working copy. This is what the copy will carry; Stage 1 removes most of it.\n"
    : "\nStage 1 is NOT complete. Fix each item, then run --verify again.\n");
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = { findState };
