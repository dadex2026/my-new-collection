#!/usr/bin/env node
/**
 * scripts/preflight.js
 *
 * The single authoritative production-validation gate. Run this before
 * deploy-collection.js / deploy-candy-machine.js against mainnet. This
 * is the "Production Validation Mode" from the original template
 * hardening backlog — one place that catches the class of mistake that
 * actually happened during this project's own testing (test data
 * shipping alongside real collection data, a --force-able "already
 * deployed" guard, placeholder URLs reaching a deploy script).
 *
 * Checks performed (scoped to the active collection — config.json's
 * collectionSlug, or --slug):
 *   1. collectionSlug isn't a reserved/test prefix (e.g. "test-")
 *   2. No dropItemId uses a reserved/test prefix (e.g. "TEST-")
 *   3. No itemImage is still a placeholder URL
 *   4. No uri is still a placeholder/empty
 *   5. config.json's treasury is a plausible Solana address
 *   6. config.json's rpc is a well-formed URL
 *   7. backend/.env.admin exists locally
 *   8. .gitignore actually excludes .env.admin (so it can't leak)
 *   9. DEPLOYER_PRIVATE_KEY is present in the environment
 *  10. Every row for this collection isn't already deployed on the
 *      target network, unless --force is passed
 *
 * Exit codes:
 *   0 = all checks passed, safe to deploy
 *   1 = one or more checks failed — do not deploy
 *
 * Usage:
 *   node scripts/preflight.js
 *   node scripts/preflight.js --slug founders
 *   node scripts/preflight.js --force        (allow re-deploying an already-deployed collection)
 *   node scripts/preflight.js --allow-warnings   (deliberately downgrade reserved-prefix/placeholder
 *                                                  checks from failures to warnings — e.g. for an
 *                                                  intentional throwaway mainnet test. Never the
 *                                                  default; must be typed explicitly every time.
 *                                                  Structural checks like an invalid treasury address
 *                                                  or missing deployer key are NEVER downgradable.)
 *   node scripts/preflight.js --reserved-slug-prefix demo- --reserved-id-prefix DEMO-
 */

"use strict";

const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env.admin") });

// ---- Paths --------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const PROJECT_ROOT = path.join(BACKEND_DIR, "..");
const CONFIG_PATH = path.join(BACKEND_DIR, "config.json");
const MASTER_CSV_PATH = path.join(BACKEND_DIR, "master.csv");
const CAMPAIGNS_CSV_PATH = path.join(BACKEND_DIR, "campaigns.csv");
const ENV_ADMIN_PATH = path.join(BACKEND_DIR, ".env.admin");
const GITIGNORE_PATH = path.join(PROJECT_ROOT, ".gitignore");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

// Default reserved patterns — anything used for local/mainnet testing
// should carry one of these, so preflight can reliably catch it before
// a real deploy. Override via CLI flags if your project uses different
// conventions.
const DEFAULT_RESERVED_SLUG_PREFIXES = ["test-", "demo-", "sample-"];
const DEFAULT_RESERVED_ID_PREFIXES = ["TEST-", "DEMO-", "SAMPLE-"];

// ---- Logging --------------------------------------------------------------

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "preflight", ...event };
  console.log(JSON.stringify(entry));
  fs.appendFileSync(path.join(LOGS_DIR, "preflight.log"), JSON.stringify(entry) + "\n");
}

// ---- CSV helpers (same format as the rest of the pipeline) ---------------

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return { header: [], rows: [] };
  const raw = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = lines[0].split(",").map((h) => h.trim());
  return {
    header,
    rows: lines.slice(1).map((line) => {
      const cols = line.split(",");
      const row = {};
      header.forEach((key, i) => { row[key] = cols[i] !== undefined ? cols[i].trim() : ""; });
      return row;
    }),
  };
}

function isPlaceholder(url) {
  if (!url || url.trim() === "") return true;
  if (url.includes("placehold.co")) return true;
  if (url.includes("example.com")) return true;
  if (url.includes("AbCdEf") || url.includes("ImageHash")) return true;
  return false;
}

function hasReservedPrefix(value, prefixes) {
  return prefixes.some((prefix) => value.toLowerCase().startsWith(prefix.toLowerCase()));
}

// ---- Individual checks ---------------------------------------------------
// Each returns { pass: boolean, detail: string }

function checkConfigExists() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { pass: false, detail: `backend/config.json not found at ${CONFIG_PATH}` };
  }
  return { pass: true, detail: "config.json found" };
}

function checkTreasuryValid(config) {
  const pattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  if (!config.treasury || !pattern.test(config.treasury)) {
    return { pass: false, detail: `config.json "treasury" is missing or not a plausible Solana address: "${config.treasury}"` };
  }
  return { pass: true, detail: `treasury looks valid: ${config.treasury}` };
}

function checkRpcValid(config) {
  try {
    const url = new URL(config.rpc);
    if (!["http:", "https:"].includes(url.protocol)) {
      return { pass: false, detail: `config.json "rpc" has an unexpected protocol: ${url.protocol}` };
    }
    return { pass: true, detail: `rpc URL is well-formed: ${config.rpc}` };
  } catch (err) {
    return { pass: false, detail: `config.json "rpc" is not a valid URL: "${config.rpc}"` };
  }
}

function checkEnvAdminExists() {
  if (!fs.existsSync(ENV_ADMIN_PATH)) {
    return { pass: false, detail: `backend/.env.admin not found at ${ENV_ADMIN_PATH}` };
  }
  return { pass: true, detail: ".env.admin exists locally" };
}

function checkEnvAdminGitignored() {
  if (!fs.existsSync(GITIGNORE_PATH)) {
    return { pass: false, detail: `.gitignore not found at ${GITIGNORE_PATH} — .env.admin could leak into version control` };
  }
  const content = fs.readFileSync(GITIGNORE_PATH, "utf8");
  const lines = content.split("\n").map((l) => l.trim());
  const covered = lines.some(
    (l) => l === ".env.admin" || l === "*.admin" || l === ".env*" || l === "backend/.env.admin"
  );
  if (!covered) {
    return { pass: false, detail: '.gitignore does not appear to exclude .env.admin — add a line containing ".env.admin"' };
  }
  return { pass: true, detail: ".env.admin is covered by .gitignore" };
}

function checkDeployerKeyPresent() {
  if (!process.env.DEPLOYER_PRIVATE_KEY) {
    return { pass: false, detail: "DEPLOYER_PRIVATE_KEY not set (checked backend/.env.admin)" };
  }
  return { pass: true, detail: "DEPLOYER_PRIVATE_KEY is present" };
}

// Derives a Solana keypair's public (base58) address directly from its
// base58-encoded 64-byte secret key — bytes[32:64] of a standard
// Solana secret key ARE the public key, verified directly against the
// real @metaplex-foundation/umi library before implementing this (a
// generated keypair's known public key matched byte-for-byte). No
// network call, no crypto library needed beyond base58 encode/decode.
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function decodeBase58(str) {
  const bytes = [0];
  for (const char of str) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value < 0) throw new Error("Invalid base58 character: " + char);
    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of str) {
    if (char === "1") bytes.push(0);
    else break;
  }
  return new Uint8Array(bytes.reverse());
}

function encodeBase58(buffer) {
  const digits = [0];
  for (let i = 0; i < buffer.length; i++) {
    let carry = buffer[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let result = "";
  for (let k = 0; buffer[k] === 0 && k < buffer.length - 1; k++) result += "1";
  for (let i = digits.length - 1; i >= 0; i--) result += BASE58_ALPHABET[digits[i]];
  return result;
}

// Content check, not structural: there ARE legitimate reasons to use
// the same wallet for both on a cheap throwaway test (the original
// test-drop mainnet test in this project deliberately did exactly
// this — "the tiny test payment just comes back to you"). This is a
// judgment call worth flagging loudly, not an unconditional block.
function checkDeployerNotTreasury(config) {
  const secret = process.env.DEPLOYER_PRIVATE_KEY;
  if (!secret || !config.treasury) {
    // Can't check without both values — other checks already cover
    // their individual presence/validity, so just pass here silently.
    return { pass: true, detail: "Skipped — DEPLOYER_PRIVATE_KEY or config.treasury not available to compare" };
  }
  let derivedDeployerAddress;
  try {
    const secretKeyBytes = decodeBase58(secret.trim());
    if (secretKeyBytes.length !== 64) {
      return { pass: true, detail: "Skipped — DEPLOYER_PRIVATE_KEY is not a standard 64-byte secret key, cannot derive its address" };
    }
    derivedDeployerAddress = encodeBase58(secretKeyBytes.slice(32, 64));
  } catch (err) {
    return { pass: true, detail: `Skipped — could not decode DEPLOYER_PRIVATE_KEY to compare: ${err.message}` };
  }

  if (derivedDeployerAddress === config.treasury) {
    return {
      pass: false,
      detail: `config.json "treasury" (${config.treasury}) is the SAME wallet as DEPLOYER_PRIVATE_KEY. This mixes deployment funds with sale proceeds — recommended to use a separate treasury wallet for anything beyond a cheap throwaway test.`,
    };
  }
  return { pass: true, detail: "Deployer wallet and treasury wallet are different addresses" };
}

function checkNoReservedSlug(collectionSlug, reservedSlugPrefixes) {
  if (hasReservedPrefix(collectionSlug, reservedSlugPrefixes)) {
    return {
      pass: false,
      detail: `collectionSlug "${collectionSlug}" uses a reserved/test prefix (${reservedSlugPrefixes.join(", ")}) — this looks like test data, not a real collection`,
    };
  }
  return { pass: true, detail: `collectionSlug "${collectionSlug}" is not a reserved prefix` };
}

function checkNoReservedDropIds(rows, reservedIdPrefixes) {
  const offenders = rows
    .map((r) => r.dropItemId)
    .filter((id) => id && hasReservedPrefix(id, reservedIdPrefixes));
  if (offenders.length > 0) {
    return {
      pass: false,
      detail: `${offenders.length} drop(s) use a reserved/test ID prefix (${reservedIdPrefixes.join(", ")}): ${offenders.join(", ")}`,
    };
  }
  return { pass: true, detail: "No drops use a reserved test ID prefix" };
}

// campaigns.csv is optional — not every collection runs campaigns. If the
// file doesn't exist, this check is skipped entirely (not a failure) by
// the caller, rather than treating "no campaigns.csv" as an error.
// Checks campaignId against BOTH the slug-style and ID-style reserved
// prefix lists (combined), since campaign IDs don't have one fixed
// casing convention the way collectionSlug/dropItemId do.
function checkNoReservedCampaignIds(campaignRows, reservedPrefixes) {
  const offenders = campaignRows
    .map((r) => r.campaignId)
    .filter((id) => id && hasReservedPrefix(id, reservedPrefixes));
  if (offenders.length > 0) {
    return {
      pass: false,
      detail: `${offenders.length} campaign(s) use a reserved/test ID prefix (${reservedPrefixes.join(", ")}): ${offenders.join(", ")}`,
    };
  }
  return { pass: true, detail: "No campaigns use a reserved test ID prefix" };
}

function checkNoPlaceholderImages(rows) {
  const offenders = rows.filter((r) => isPlaceholder(r.itemImage)).map((r) => r.dropItemId);
  if (offenders.length > 0) {
    return {
      pass: false,
      detail: `${offenders.length} drop(s) still have a placeholder itemImage: ${offenders.join(", ")} — run upload-images.js`,
    };
  }
  return { pass: true, detail: "All drops have a real itemImage" };
}

function checkNoPlaceholderUris(rows) {
  const offenders = rows.filter((r) => isPlaceholder(r.uri)).map((r) => r.dropItemId);
  if (offenders.length > 0) {
    return {
      pass: false,
      detail: `${offenders.length} drop(s) still have a placeholder/missing uri: ${offenders.join(", ")} — run upload-metadata.js`,
    };
  }
  return { pass: true, detail: "All drops have a real metadata uri" };
}

function checkNotAlreadyDeployed(rows, network, force) {
  const alreadyDeployed = rows.filter((r) => r.collectionAddress && r.network === network);
  if (alreadyDeployed.length > 0 && !force) {
    return {
      pass: false,
      detail: `${alreadyDeployed.length} drop(s) already have a collectionAddress recorded for network "${network}". Pass --force to proceed anyway (e.g. intentionally re-deploying).`,
    };
  }
  if (alreadyDeployed.length > 0 && force) {
    return { pass: true, detail: `${alreadyDeployed.length} drop(s) already deployed on "${network}" — proceeding due to --force` };
  }
  return { pass: true, detail: `No drops already deployed on network "${network}"` };
}

// ---- Check categorization --------------------------------------------
// STRUCTURAL checks are never warnings — a bad treasury address or a
// missing deployer key isn't a judgment call, it's just broken
// configuration that cannot safely proceed under any flag.
//
// CONTENT checks (reserved prefixes, placeholder data) ARE judgment
// calls — there's a legitimate case for a deliberate test deploy using
// a reserved prefix on purpose. These block by default, same as
// everything else, but --allow-warnings lets you consciously downgrade
// them to warnings instead of silently defaulting to permissive. The
// override must be typed explicitly — never the default behavior.
const CONTENT_CHECK_NAMES = new Set([
  "no_reserved_slug",
  "no_reserved_drop_ids",
  "no_placeholder_images",
  "no_placeholder_uris",
  "no_reserved_campaign_ids",
  "deployer_not_treasury",
]);

const CATEGORIES = [
  { name: "Project Structure", checks: ["config_exists", "config_valid_json", "collection_slug_present", "collection_has_rows"] },
  { name: "Environment", checks: ["env_admin_exists", "env_admin_gitignored", "deployer_key_present", "treasury_valid", "rpc_valid", "deployer_not_treasury"] },
  { name: "Content Validation", checks: ["no_reserved_slug", "no_reserved_drop_ids", "no_placeholder_images", "no_placeholder_uris"] },
  { name: "Campaign Validation", checks: ["no_reserved_campaign_ids"] },
  { name: "Deployment State", checks: ["not_already_deployed"] },
];

// ---- Main ---------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const allowWarnings = args.includes("--allow-warnings");
  const slugFlagIndex = args.indexOf("--slug");
  const reservedSlugFlagIndex = args.indexOf("--reserved-slug-prefix");
  const reservedIdFlagIndex = args.indexOf("--reserved-id-prefix");

  const reservedSlugPrefixes =
    reservedSlugFlagIndex !== -1 && args[reservedSlugFlagIndex + 1]
      ? [args[reservedSlugFlagIndex + 1]]
      : DEFAULT_RESERVED_SLUG_PREFIXES;
  const reservedIdPrefixes =
    reservedIdFlagIndex !== -1 && args[reservedIdFlagIndex + 1]
      ? [args[reservedIdFlagIndex + 1]]
      : DEFAULT_RESERVED_ID_PREFIXES;

  log({ status: "start", force, allowWarnings, reservedSlugPrefixes, reservedIdPrefixes });

  const results = [];

  // Checks that don't require config.json to already be valid
  results.push({ name: "config_exists", ...checkConfigExists() });
  results.push({ name: "env_admin_exists", ...checkEnvAdminExists() });
  results.push({ name: "env_admin_gitignored", ...checkEnvAdminGitignored() });
  results.push({ name: "deployer_key_present", ...checkDeployerKeyPresent() });

  // campaigns.csv is optional — only checked if it actually exists. Not
  // every collection runs campaigns, so its absence is not an error.
  if (fs.existsSync(CAMPAIGNS_CSV_PATH)) {
    const { rows: campaignRows } = readCsv(CAMPAIGNS_CSV_PATH);
    const combinedReservedPrefixes = [...new Set([...reservedSlugPrefixes, ...reservedIdPrefixes])];
    results.push({ name: "no_reserved_campaign_ids", ...checkNoReservedCampaignIds(campaignRows, combinedReservedPrefixes) });
  }

  let config = null;
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    } catch (err) {
      results.push({ name: "config_valid_json", pass: false, detail: `config.json is not valid JSON: ${err.message}` });
    }
  }

  if (config) {
    const collectionSlug =
      slugFlagIndex !== -1 && args[slugFlagIndex + 1] ? args[slugFlagIndex + 1] : config.collectionSlug;

    results.push({ name: "treasury_valid", ...checkTreasuryValid(config) });
    results.push({ name: "deployer_not_treasury", ...checkDeployerNotTreasury(config) });
    results.push({ name: "rpc_valid", ...checkRpcValid(config) });

    if (collectionSlug) {
      results.push({ name: "no_reserved_slug", ...checkNoReservedSlug(collectionSlug, reservedSlugPrefixes) });

      const { rows: allRows } = readCsv(MASTER_CSV_PATH);
      const matchingRows = allRows.filter((r) => r.collectionSlug === collectionSlug);

      if (matchingRows.length === 0) {
        results.push({
          name: "collection_has_rows",
          pass: false,
          detail: `No rows in master.csv match collectionSlug "${collectionSlug}"`,
        });
      } else {
        results.push({ name: "no_reserved_drop_ids", ...checkNoReservedDropIds(matchingRows, reservedIdPrefixes) });
        results.push({ name: "no_placeholder_images", ...checkNoPlaceholderImages(matchingRows) });
        results.push({ name: "no_placeholder_uris", ...checkNoPlaceholderUris(matchingRows) });
        results.push({ name: "not_already_deployed", ...checkNotAlreadyDeployed(matchingRows, config.network, force) });
      }
    } else {
      results.push({ name: "collection_slug_present", pass: false, detail: "config.json is missing collectionSlug" });
    }
  }

  // ---- Classify: hard failures vs. downgraded warnings -------------------
  // A failed CONTENT check becomes a warning ONLY if --allow-warnings was
  // explicitly passed. A failed STRUCTURAL check is ALWAYS a hard failure,
  // regardless of any flag — there is no override for broken config.
  const hardFailures = results.filter((r) => !r.pass && !(allowWarnings && CONTENT_CHECK_NAMES.has(r.name)));
  const warnings = results.filter((r) => !r.pass && allowWarnings && CONTENT_CHECK_NAMES.has(r.name));

  for (const r of results) {
    log({ status: r.pass ? "check_passed" : "check_failed", check: r.name, detail: r.detail });
  }

  // ---- Categorized report -------------------------------------------------
  const byName = new Map(results.map((r) => [r.name, r]));

  console.log("\n=========================================");
  console.log("PRE-FLIGHT REPORT");
  console.log("=========================================\n");

  for (const category of CATEGORIES) {
    const inCategory = category.checks.map((n) => byName.get(n)).filter(Boolean);
    if (inCategory.length === 0) continue;

    const categoryHardFail = inCategory.some(
      (r) => !r.pass && !(allowWarnings && CONTENT_CHECK_NAMES.has(r.name))
    );
    const categoryWarn = inCategory.some((r) => !r.pass && allowWarnings && CONTENT_CHECK_NAMES.has(r.name));
    const status = categoryHardFail ? "✗ FAIL" : categoryWarn ? "⚠ WARN" : "✓ PASS";

    console.log(`${category.name.padEnd(24)}${status}`);
    for (const r of inCategory) {
      if (!r.pass) {
        const isWarning = allowWarnings && CONTENT_CHECK_NAMES.has(r.name);
        console.log(`  ${isWarning ? "⚠" : "✗"} ${r.detail}`);
      }
    }
  }

  if (warnings.length > 0) {
    console.log("\nWarnings (downgraded via --allow-warnings — review before proceeding):");
    for (const w of warnings) {
      console.log(`  ⚠ ${w.detail}`);
    }
  }

  console.log("\nDeployment Readiness:");
  if (hardFailures.length > 0) {
    console.log(`  NOT READY — ${hardFailures.length} failure(s) must be resolved.\n`);
    log({
      status: "failure",
      message: `${hardFailures.length} check(s) failed — do not deploy until resolved.`,
      failedChecks: hardFailures.map((r) => r.name),
      warnings: warnings.map((r) => r.name),
    });
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log(`  READY WITH WARNINGS — proceeding is your explicit decision (--allow-warnings was set).\n`);
    log({
      status: "success",
      message: `Preflight passed with ${warnings.length} warning(s) downgraded via --allow-warnings.`,
      warnings: warnings.map((r) => r.name),
    });
    process.exit(0);
  }

  console.log("  READY — all checks passed.\n");
  log({ status: "success", message: "All preflight checks passed. Safe to deploy." });
  process.exit(0);
}

main();