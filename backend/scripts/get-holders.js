#!/usr/bin/env node
/**
 * scripts/get-holders.js
 *
 * Produces a holder snapshot for a collection, or for ONE drop inside it, as a
 * recipients CSV that airdrop.js can consume unchanged.
 *
 * WHY --drop EXISTS
 *   assetGate can only see collection membership: every drop sharing a
 *   collectionSlug shares one collectionAddress, so no on-chain guard can tell
 *   OE-003 holders from OE-001 holders. But deploy-candy-machine.js stamps each
 *   drop's own name + uri on everything it mints (hiddenSettings), so the uri
 *   DOES identify the drop — off chain. --drop filters on it, which is how a
 *   drop-specific airdrop is possible while the collection stays undivided.
 *
 * WHAT THIS IS NOT
 *   Not a historical query. DAS returns present ownership, so this is who holds
 *   NOW, not who minted. "Held since launch" or "held at block X" cannot be
 *   answered this way — that needs repeated snapshots over time, started before
 *   you need them.
 *
 * Reads:  config.json (rpc), master.csv (collectionAddress, and the drop's uri)
 * Writes: a CSV with a `wallet` header — the shape readRecipients() expects.
 *
 * Exit codes:
 *   0 = success
 *   1 = validation failure (bad flags, unknown slug/drop, undeployed collection)
 *   3 = RPC failure, or an RPC that does not serve DAS methods
 *
 * Usage:
 *   node scripts/get-holders.js
 *   node scripts/get-holders.js --drop OE-003
 *   node scripts/get-holders.js --drop OE-003 --out ../snapshots/oe-003.csv
 *   node scripts/get-holders.js --drop OE-003 --counts     (adds a quantity column)
 *   node scripts/get-holders.js --drop OE-003 --dry-run    (report only, write nothing)
 *   node scripts/get-holders.js --slug founders --drop OE-003
 *
 * Dependencies: none beyond Node 18+ (global fetch) and dotenv.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { parseCsvRecords, serializeRow } = require("./lib/csv");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env.admin") });

// ---- Paths --------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(BACKEND_DIR, "config.json");
const MASTER_CSV_PATH = path.join(BACKEND_DIR, "master.csv");
const DEFAULT_OUT_PATH = path.join(BACKEND_DIR, "recipients.csv");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

const PAGE_LIMIT = 1000;
const PLACEHOLDER_HOSTS = ["placehold.co", "example.com"];

// ---- Logging ------------------------------------------------------------

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "get-holders", ...event };
  console.log(JSON.stringify(entry));
  fs.appendFileSync(path.join(LOGS_DIR, "get-holders.log"), JSON.stringify(entry) + "\n");
}

function fail(reason, message, exitCode) {
  log({ status: "failure", reason, message });
  process.exit(exitCode);
}

// ---- Inputs -------------------------------------------------------------

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fail("missing_config", `backend/config.json not found at ${CONFIG_PATH}`, 1);
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    fail("invalid_config_json", `config.json is not valid JSON: ${err.message}`, 1);
  }
  if (!config.rpc || !config.network) {
    fail("incomplete_config", "config.json is missing required field(s): rpc, network", 1);
  }
  return config;
}

// Deliberately lib/csv.js and not the inline split(",") the other scripts on
// this path carry. A collectionDescription with a comma in it silently shifts
// every column after it, and new code should not inherit that. See open-items 28.
function readMaster() {
  if (!fs.existsSync(MASTER_CSV_PATH)) {
    fail("missing_master_csv", `backend/master.csv not found at ${MASTER_CSV_PATH}`, 1);
  }
  const { records } = parseCsvRecords(fs.readFileSync(MASTER_CSV_PATH, "utf8"));
  if (records.length === 0) fail("empty_master_csv", "backend/master.csv has no data rows", 1);
  return records;
}

function isPlaceholder(url) {
  if (!url) return true;
  return PLACEHOLDER_HOSTS.some((h) => url.includes(h));
}

function flagValue(args, name) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
}

// ---- DAS ----------------------------------------------------------------

async function fetchPage(rpc, collectionAddress, page) {
  let response;
  try {
    response = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "get-holders",
        method: "getAssetsByGroup",
        params: { groupKey: "collection", groupValue: collectionAddress, page, limit: PAGE_LIMIT },
      }),
    });
  } catch (err) {
    fail("rpc_unreachable", `Could not reach ${rpc}: ${err.message}`, 3);
  }

  if (!response.ok) {
    fail("rpc_error", `RPC returned HTTP ${response.status} on page ${page}`, 3);
  }

  let body;
  try {
    body = await response.json();
  } catch (err) {
    fail("rpc_bad_json", `RPC returned a non-JSON body on page ${page}: ${err.message}`, 3);
  }

  if (body.error) {
    fail("rpc_error", `RPC error on page ${page}: ${JSON.stringify(body.error)}`, 3);
  }

  // A DAS-less RPC answers without an error and without a result. Reporting
  // "0 holders" there would be a lie that reads like a fact, so it is a failure.
  if (!body.result) {
    fail(
      "das_unsupported",
      `getAssetsByGroup returned no result from ${rpc}. This RPC probably does not serve DAS methods — ` +
        "point rpc at a DAS-capable provider, or check that the proxy forwards them.",
      3
    );
  }

  return body.result.items || [];
}

// ---- Main ---------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const withCounts = args.includes("--counts");
  const force = args.includes("--force");
  const dropItemId = flagValue(args, "--drop");
  const outFlag = flagValue(args, "--out");
  const outPath = outFlag ? path.resolve(outFlag) : DEFAULT_OUT_PATH;

  const config = loadConfig();
  const collectionSlug = flagValue(args, "--slug") || config.collectionSlug;
  if (!collectionSlug) {
    fail("missing_slug", "No --slug given and config.json has no collectionSlug", 1);
  }

  const rows = readMaster();
  const matching = rows.filter((r) => r.collectionSlug === collectionSlug);
  if (matching.length === 0) {
    fail("unknown_collection_slug", `No rows in master.csv match collectionSlug "${collectionSlug}"`, 1);
  }

  const deployed = matching.find((r) => r.collectionAddress && r.network === config.network);
  if (!deployed) {
    fail(
      "collection_not_deployed",
      `"${collectionSlug}" has no collectionAddress recorded for network "${config.network}" — nothing to query.`,
      1
    );
  }
  const collectionAddress = deployed.collectionAddress;

  // --drop narrows to one edition. Without it, every holder in the collection.
  let dropUri = null;
  if (dropItemId) {
    const dropRow = matching.find((r) => r.dropItemId === dropItemId);
    if (!dropRow) {
      fail("drop_not_found", `No row matches dropItemId "${dropItemId}" in collection "${collectionSlug}"`, 1);
    }
    if (isPlaceholder(dropRow.uri)) {
      fail(
        "metadata_not_ready",
        `Drop "${dropItemId}" has no real metadata uri, so its assets cannot be told apart from its siblings.`,
        1
      );
    }
    dropUri = dropRow.uri;
  }

  log({
    status: "start",
    collectionSlug,
    collectionAddress,
    network: config.network,
    dropItemId: dropItemId || null,
    dropUri,
    scope: dropItemId ? "one drop" : "whole collection",
  });

  const counts = new Map();
  let scanned = 0;
  let matched = 0;
  let burned = 0;

  for (let page = 1; ; page++) {
    const items = await fetchPage(config.rpc, collectionAddress, page);
    scanned += items.length;

    for (const item of items) {
      if (dropUri && item.content?.json_uri !== dropUri) continue;

      // A burned asset keeps its ownership record in DAS and is flagged
      // `burnt: true`. Counting it is counting a voucher that has already been
      // spent - and the whole point of redeeming by assetBurn rather than
      // assetGate is that a spent voucher stops qualifying. Observed on mainnet
      // 2026-09-03: a TEST-001 asset burned to mint TEST-004 was still returned
      // here as held, so the next snapshot would have airdropped that wallet a
      // replacement at 0.00347968 SOL, restoring exactly the unlimited
      // redemption the burn was chosen to prevent.
      if (item.burnt) {
        burned += 1;
        continue;
      }

      const owner = item.ownership?.owner;
      if (!owner) continue;
      matched += 1;
      counts.set(owner, (counts.get(owner) || 0) + 1);
    }

    if (items.length < PAGE_LIMIT) break;
  }

  // Scanning assets but matching none, with a filter active, almost always means
  // the uri does not match what the chain actually carries — say so rather than
  // handing back an empty file that looks like a finished answer.
  if (scanned > 0 && matched === 0 && burned === 0 && dropUri) {
    fail(
      "no_assets_matched_drop",
      `Scanned ${scanned} asset(s) in the collection and none carried "${dropUri}". ` +
        "Check the uri against master.csv, and check that content.json_uri is the field this RPC returns.",
      1
    );
  }

  // Every match burned is a real, correct answer - everyone eligible has
  // already redeemed - and it must not be reported as a uri mismatch.
  if (scanned > 0 && matched === 0 && burned > 0) {
    log({
      status: "success",
      result: "all_matching_assets_burned",
      burnedSkipped: burned,
      message:
        `All ${burned} matching asset(s) are burned. Every holder has redeemed; there is nobody left to snapshot. ` +
        "This is a complete answer, not a failed lookup.",
    });
    process.exit(0);
  }

  const wallets = [...counts.keys()];

  // Reported, not just filtered. A snapshot that silently shrinks looks like a
  // snapshot of a smaller collection; one that says how many burned assets it
  // skipped is a record of redemptions having happened.
  if (burned > 0) {
    log({
      status: "info",
      burnedSkipped: burned,
      message: `${burned} asset(s) matched but are burned — excluded. A burned voucher has been redeemed and no longer qualifies.`,
    });
  }

  log({
    status: "plan",
    assetsScanned: scanned,
    assetsMatched: matched,
    burnedSkipped: burned,
    uniqueWallets: wallets.length,
    mode: withCounts ? "one row per wallet with quantity" : "one row per wallet",
    out: dryRun ? null : outPath,
  });

  // Scanning zero assets is ambiguous, and reporting it as a plain success is
  // how a run that verified nothing gets mistaken for a run that verified
  // something. The collection may genuinely have no mints, or the RPC may be
  // answering DAS calls with an empty result rather than an error. Both look
  // identical from here, so say so instead of picking one.
  if (scanned === 0) {
    log({
      status: "success",
      result: "no_assets_in_collection",
      collectionAddress,
      message:
        `The RPC returned zero assets for collection ${collectionAddress}. Either nothing has been ` +
        "minted from it, or this RPC answers DAS calls with an empty result. NOTHING WAS VERIFIED by " +
        "this run. Re-run against a collection you know has mints before trusting the output of any other.",
    });
    process.exit(0);
  }

  if (wallets.length === 0) {
    log({
      status: "success",
      result: "no_holders",
      assetsScanned: scanned,
      message: `Scanned ${scanned} asset(s); none are currently held by anyone. Nothing written.`,
    });
    process.exit(0);
  }

  const header = withCounts ? ["wallet", "quantity"] : ["wallet"];
  const lines = [serializeRow(header)];
  for (const [wallet, count] of counts) {
    lines.push(serializeRow(withCounts ? [wallet, String(count)] : [wallet]));
  }
  const output = lines.join("\n") + "\n";

  if (dryRun) {
    console.log("\n[dry-run] Would write " + wallets.length + " wallet(s) to " + outPath + ":\n");
    console.log(output);
    log({ status: "success", message: "[dry-run] Nothing written." });
    process.exit(0);
  }

  // recipients.csv is a per-run input that gets overwritten, and the previous
  // contents are not recoverable from airdrop-history.csv. Refuse rather than
  // silently replace a list someone curated by hand.
  if (fs.existsSync(outPath) && !force) {
    fail(
      "output_exists",
      `${outPath} already exists. Pass --force to overwrite, or --out <path> to write elsewhere.`,
      1
    );
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, output, "utf8");

  log({
    status: "success",
    wallets: wallets.length,
    assetsMatched: matched,
    out: outPath,
    message:
      "Snapshot written. This is who holds NOW — keep it as a dated file if you need to show who was eligible, " +
      "because airdrop-history.csv only records who received.",
  });
}

main().catch((err) => {
  fail("unexpected_error", err && err.stack ? err.stack : String(err), 3);
});
