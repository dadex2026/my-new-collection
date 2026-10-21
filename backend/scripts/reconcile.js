#!/usr/bin/env node
/**
 * scripts/reconcile.js
 *
 * Compares every deployed drop's maxSupply in master.csv against the cap its
 * candy machine actually has on chain (data.itemsAvailable), and fails if any
 * disagree. itemsRedeemed is printed alongside, for context.
 *
 * WHY THIS EXISTS
 *   On 2026-10-21 the fork's master.csv was found carrying +11 on every
 *   maxSupply (TEST-004: 19 in the CSV, 8 on chain). It had been that way for
 *   six weeks and nothing noticed (open-items 51). That matters because guards
 *   trust the column without asking the chain: preflight's
 *   campaign_eligibility_capped and deploy-campaign.js's headroom floor are
 *   offline by design, and update-candy-machine-supply.js writes the column
 *   back - but nothing ever checked that it still MATCHED. This is that check.
 *
 * READ-ONLY, ALWAYS
 *   No --write, and no flag that adds one. It loads no signing key, sends no
 *   transaction and never touches master.csv. A disagreement is reported, not
 *   repaired, because the reconciler cannot know which side is right: a hand
 *   edit or a stale write-back makes the CSV wrong, a cap change made outside
 *   the scripts makes the chain the surprise. Deciding is the operator's job:
 *     CSV wrong    -> correct maxSupply in master.csv by hand
 *     chain wrong  -> update-candy-machine-supply.js --drop <id> --items-available <n>
 *                     (plan first; it is the script whose job is to write)
 *   It is its own script rather than a mode of that one for exactly this
 *   reason: a reconciler's job is to never write.
 *
 * WHAT IT COMPARES
 *   Every master.csv row, in every collection, that has a candyMachineAddress.
 *   maxSupply is read the way deploy-candy-machine.js reads it: "unlimited",
 *   blank, or anything not a positive number means the u32 maximum,
 *   4,294,967,295, so an open edition matches its own on-chain cap. A row whose
 *   network differs from config.json's is listed and not compared - config.rpc
 *   serves one network.
 *
 * NOT IN PREFLIGHT, deliberately: preflight is offline by design. Run this
 * beside it before any deploy that relies on master.csv's caps.
 *
 * Exit codes:
 *   0 = every compared drop agrees
 *   1 = at least one disagrees, has no account on chain, or could not be
 *       compared (bad config, bad CSV)
 *   3 = RPC failure - nothing can be concluded
 *
 * Usage:
 *   node scripts/reconcile.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { parseCsvRecords } = require("./lib/csv");

const BACKEND_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(BACKEND_DIR, "config.json");
const MASTER_CSV_PATH = path.join(BACKEND_DIR, "master.csv");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

// deploy-candy-machine.js's cap for a nominally unlimited drop.
const UNLIMITED_ITEMS_AVAILABLE = 4294967295;

// ---- Pure logic (exported for reconcile.selftest.js) ----------------------

// The cap deploy-candy-machine.js would have written for this maxSupply.
function expectedItemsAvailable(maxSupply) {
  const raw = (maxSupply == null ? "" : String(maxSupply)).trim();
  if (raw === "" || raw.toLowerCase() === "unlimited") return UNLIMITED_ITEMS_AVAILABLE;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : UNLIMITED_ITEMS_AVAILABLE;
}

// A maxSupply deploy-candy-machine.js would read as unlimited by accident -
// "abc", "0", "-3" - rather than because it says so. Flagged, not compared,
// because matching u32 max would make a typo look like agreement.
function isAmbiguousMaxSupply(maxSupply) {
  const raw = (maxSupply == null ? "" : String(maxSupply)).trim();
  if (raw === "" || raw.toLowerCase() === "unlimited") return false;
  const n = Number(raw);
  return !(Number.isFinite(n) && n > 0);
}

// chain: null when the account does not exist, else { itemsAvailable, itemsRedeemed }
// as numbers or bigints. Returns the row for the table.
function compareRow(row, chain, network) {
  const base = {
    dropItemId: row.dropItemId,
    collectionSlug: row.collectionSlug,
    csv: (row.maxSupply || "").trim() || "(blank)",
    chainAvailable: null,
    itemsRedeemed: null,
  };
  if ((row.network || "").trim() && (row.network || "").trim() !== network) {
    return { ...base, status: "other_network", detail: `row is ${row.network}, config.json is ${network}` };
  }
  if (isAmbiguousMaxSupply(row.maxSupply)) {
    return { ...base, status: "csv_ambiguous", detail: `maxSupply "${row.maxSupply}" is not a number, blank or "unlimited"` };
  }
  if (chain === null) {
    return { ...base, status: "missing_on_chain", detail: `no candy machine at ${row.candyMachineAddress}` };
  }
  const chainAvailable = Number(chain.itemsAvailable);
  const itemsRedeemed = Number(chain.itemsRedeemed);
  const expected = expectedItemsAvailable(row.maxSupply);
  const status = chainAvailable === expected ? "match" : "mismatch";
  const detail =
    status === "match" ? "" : `CSV implies ${expected}, chain has ${chainAvailable} (drift ${expected - chainAvailable > 0 ? "+" : ""}${expected - chainAvailable})`;
  return { ...base, chainAvailable, itemsRedeemed, status, detail };
}

// Anything but a match or a deliberate skip is a disagreement.
const AGREES = new Set(["match", "other_network"]);

function exitCodeFor(results) {
  return results.every((r) => AGREES.has(r.status)) ? 0 : 1;
}

function formatTable(results) {
  const fmt = (n) => (n === null ? "-" : n === UNLIMITED_ITEMS_AVAILABLE ? "u32 max" : String(n));
  const rows = results.map((r) => [
    r.status === "match" || r.status === "other_network" ? "  " : "<<",
    r.dropItemId,
    r.collectionSlug,
    r.csv,
    fmt(r.chainAvailable),
    fmt(r.itemsRedeemed),
    r.status + (r.detail ? " - " + r.detail : ""),
  ]);
  const head = ["", "drop", "collection", "csv maxSupply", "chain cap", "redeemed", "status"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => (i === cells.length - 1 ? c : String(c).padEnd(widths[i]))).join("  ");
  return [line(head), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join("\n");
}

// ---- I/O ------------------------------------------------------------------

function log(event) {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
  const line = JSON.stringify({ time: new Date().toISOString(), step: "reconcile", ...event });
  fs.appendFileSync(path.join(LOGS_DIR, "reconcile.log"), line + "\n");
  return line;
}

function fail(reason, message, exitCode) {
  console.log(log({ status: "failure", reason, message }));
  process.exit(exitCode);
}

async function main() {
  if (process.argv.slice(2).some((a) => a.startsWith("--"))) {
    fail("no_flags", "reconcile.js takes no flags. It only reads; there is nothing to switch on.", 1);
  }
  if (!fs.existsSync(CONFIG_PATH)) fail("missing_config", "backend/config.json not found", 1);
  let config;
  try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")); }
  catch (err) { fail("invalid_config_json", `config.json is not valid JSON: ${err.message}`, 1); }
  if (!config.rpc || !config.network) fail("incomplete_config", "config.json needs rpc and network", 1);
  if (!fs.existsSync(MASTER_CSV_PATH)) fail("missing_master_csv", "backend/master.csv not found", 1);

  const { records } = parseCsvRecords(fs.readFileSync(MASTER_CSV_PATH, "utf8"));
  const deployed = records.filter((r) => (r.candyMachineAddress || "").trim());
  console.log(log({ status: "start", network: config.network, deployedDrops: deployed.length, csvRows: records.length }));
  if (deployed.length === 0) {
    console.log(log({ status: "success", message: "No master.csv row has a candyMachineAddress - nothing deployed, nothing to compare." }));
    process.exit(0);
  }

  const umiBundleDefaults = await import("@metaplex-foundation/umi-bundle-defaults");
  const mplCandyMachine = await import("@metaplex-foundation/mpl-core-candy-machine");
  const umiCore = await import("@metaplex-foundation/umi");
  // No identity is ever attached: this umi cannot sign anything.
  const umi = umiBundleDefaults.createUmi(config.rpc).use(mplCandyMachine.mplCandyMachine());

  const results = [];
  for (const row of deployed) {
    const net = (row.network || "").trim();
    if (net && net !== config.network) {
      results.push(compareRow(row, null, config.network));
      continue;
    }
    let chain;
    try {
      const cm = await mplCandyMachine.safeFetchCandyMachine(umi, umiCore.publicKey(row.candyMachineAddress.trim()));
      chain = cm ? { itemsAvailable: cm.data.itemsAvailable, itemsRedeemed: cm.itemsRedeemed } : null;
    } catch (err) {
      fail("rpc_error", `Could not read ${row.dropItemId}'s candy machine ${row.candyMachineAddress}: ${err.message}. Nothing can be concluded.`, 3);
    }
    results.push(compareRow(row, chain, config.network));
  }

  console.log("\n" + formatTable(results) + "\n");
  const bad = results.filter((r) => !AGREES.has(r.status));
  const skipped = results.filter((r) => r.status === "other_network").length;
  console.log(log({
    status: bad.length ? "failure" : "success",
    reason: bad.length ? "csv_disagrees_with_chain" : undefined,
    compared: results.length - skipped,
    skippedOtherNetwork: skipped,
    disagreements: bad.map((r) => `${r.dropItemId}: ${r.status}`),
    message: bad.length
      ? `${bad.length} drop(s) disagree. Decide which side is right; this script repairs neither.`
      : `All ${results.length - skipped} deployed drop(s) on ${config.network} match the chain.`,
  }));
  process.exit(exitCodeFor(results));
}

if (require.main === module) {
  main().catch((err) => {
    console.log(log({ status: "failure", reason: "unhandled_error", message: err.message }));
    process.exit(3);
  });
}

module.exports = { expectedItemsAvailable, isAmbiguousMaxSupply, compareRow, exitCodeFor, formatTable, UNLIMITED_ITEMS_AVAILABLE };
