#!/usr/bin/env node
/**
 * scripts/reconcile.js
 *
 * Checks the two CSVs every guard trusts against the chain, and fails on any
 * disagreement:
 *   DROPS       each deployed drop's maxSupply in master.csv against the cap its
 *               candy machine has (data.itemsAvailable), itemsRedeemed alongside
 *   CAMPAIGNS   each campaignCandyMachineAddress in campaigns.csv must hold a
 *               live candy machine (open-items 57: five of eight did not)
 *   UNRECORDED  every candy machine under the drops' authority that NO row of
 *               either CSV names - a campaign deployed while its column stayed
 *               blank reads as undeployed, and the guards then let a raise through
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
 *   0 = every drop, every campaign address, and the unrecorded check all agree
 *   1 = at least one disagreement in any section, or bad config / bad CSV
 *   3 = RPC failure, or the unrecorded check could not run - not a full pass
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
const CAMPAIGNS_CSV_PATH = path.join(BACKEND_DIR, "campaigns.csv");
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

// ---- campaigns.csv against the chain (added 2026-10-21, open-items 57) ----
//
// A campaignCandyMachineAddress reads as "deployed" to every script, and on
// 2026-10-21 five of the fork's eight such rows had nothing on chain. The
// campaign the cap-raise refusal named as live in chain verification 3a was one
// of them. Each row's address must hold a live candy machine.
//
// chain: "invalid" when the address is not a public key at all; null when no
// account exists; { kind: "other" } when an account exists but is not a candy
// machine; else { kind: "candy_machine", itemsAvailable, itemsRedeemed }.
function compareCampaignRow(row, chain, network) {
  const base = {
    campaignId: row.campaignId,
    address: (row.campaignCandyMachineAddress || "").trim(),
    gates: (row.eligibilityCollection || "").trim(),
    claimed: null,
  };
  if ((row.network || "").trim() && (row.network || "").trim() !== network) {
    return { ...base, status: "other_network", detail: `row is ${row.network}, config.json is ${network}` };
  }
  if (chain === "invalid") return { ...base, status: "invalid_address", detail: "not a valid public key - nothing can live there" };
  if (chain === null) return { ...base, status: "no_account", detail: "no account at this address - never deployed, or closed" };
  if (chain.kind !== "candy_machine") return { ...base, status: "not_a_candy_machine", detail: "an account exists here, but it is not a candy machine" };
  return { ...base, status: "live", claimed: `${Number(chain.itemsRedeemed)}/${Number(chain.itemsAvailable)}`, detail: "" };
}

const CAMPAIGN_AGREES = new Set(["live", "other_network"]);

// The dangerous direction: a candy machine under the drops' authority that NO
// csv row records. A campaign deployed while its address column stayed blank
// reads as undeployed, and every guard that trusts the column lets it through.
function findUnrecorded(onChain, recorded) {
  const known = new Set(recorded.map((a) => String(a).trim()).filter(Boolean));
  return [...new Set(onChain.map(String))].filter((a) => !known.has(a)).sort();
}

function formatCampaignTable(results) {
  const rows = results.map((r) => [
    CAMPAIGN_AGREES.has(r.status) ? "  " : "<<",
    r.campaignId, r.address ? r.address.slice(0, 8) + "…" : "-", r.gates ? r.gates.slice(0, 8) + "…" : "-",
    r.claimed || "-", r.status + (r.detail ? " - " + r.detail : ""),
  ]);
  const head = ["", "campaign", "address", "gates", "claimed", "status"];
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
  const authorities = new Set();
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
      if (cm) authorities.add(String(cm.authority));
    } catch (err) {
      fail("rpc_error", `Could not read ${row.dropItemId}'s candy machine ${row.candyMachineAddress}: ${err.message}. Nothing can be concluded.`, 3);
    }
    results.push(compareRow(row, chain, config.network));
  }

  // ---- campaigns.csv: every address must hold a live candy machine -------
  const campaignResults = [];
  const campaignRows = fs.existsSync(CAMPAIGNS_CSV_PATH)
    ? parseCsvRecords(fs.readFileSync(CAMPAIGNS_CSV_PATH, "utf8")).records.filter((r) => (r.campaignCandyMachineAddress || "").trim())
    : [];
  for (const row of campaignRows) {
    const net = (row.network || "").trim();
    if (net && net !== config.network) { campaignResults.push(compareCampaignRow(row, null, config.network)); continue; }
    let key;
    try { key = umiCore.publicKey(row.campaignCandyMachineAddress.trim()); }
    catch { campaignResults.push(compareCampaignRow(row, "invalid", config.network)); continue; }
    let chain;
    try {
      const cm = await mplCandyMachine.safeFetchCandyMachine(umi, key);
      chain = cm ? { kind: "candy_machine", itemsAvailable: cm.data.itemsAvailable, itemsRedeemed: cm.itemsRedeemed } : null;
    } catch {
      // An account that will not deserialise as a candy machine: confirm it exists.
      try { chain = (await umi.rpc.getAccount(key)).exists ? { kind: "other" } : null; }
      catch (err) { fail("rpc_error", `Could not read campaign ${row.campaignId}'s address: ${err.message}. Nothing can be concluded.`, 3); }
    }
    campaignResults.push(compareCampaignRow(row, chain, config.network));
  }

  // ---- The other direction: machines on chain that no row records --------
  let unrecorded = null;
  try {
    const onChain = [];
    for (const authority of authorities) {
      const keys = await mplCandyMachine.getCandyMachineGpaBuilder(umi).whereField("authority", umiCore.publicKey(authority)).getPublicKeys();
      onChain.push(...keys.map(String));
    }
    const recorded = [
      ...records.map((r) => r.candyMachineAddress),
      ...(fs.existsSync(CAMPAIGNS_CSV_PATH) ? parseCsvRecords(fs.readFileSync(CAMPAIGNS_CSV_PATH, "utf8")).records.map((r) => r.campaignCandyMachineAddress) : []),
    ];
    unrecorded = findUnrecorded(onChain, recorded);
  } catch (err) {
    console.log(log({ status: "warning", reason: "unrecorded_not_checked", message: `Could not list candy machines by authority (${err.message}). The unrecorded-machine check did NOT run.` }));
  }

  console.log("\nDROPS - master.csv maxSupply against the chain\n" + formatTable(results) + "\n");
  if (campaignRows.length) console.log("CAMPAIGNS - campaigns.csv addresses against the chain\n" + formatCampaignTable(campaignResults) + "\n");
  if (unrecorded !== null) {
    console.log(`UNRECORDED - candy machines under ${[...authorities].map((a) => a.slice(0, 8) + "…").join(", ")} that no CSV row names: ` +
      (unrecorded.length ? "\n" + unrecorded.map((a) => "<<  " + a).join("\n") : "none") + "\n");
  }

  const bad = results.filter((r) => !AGREES.has(r.status));
  const badCampaigns = campaignResults.filter((r) => !CAMPAIGN_AGREES.has(r.status));
  const skipped = results.filter((r) => r.status === "other_network").length;
  const problems = bad.length + badCampaigns.length + (unrecorded ? unrecorded.length : 0);
  console.log(log({
    status: problems ? "failure" : unrecorded === null ? "incomplete" : "success",
    reason: problems ? "csv_disagrees_with_chain" : unrecorded === null ? "unrecorded_not_checked" : undefined,
    compared: results.length - skipped,
    skippedOtherNetwork: skipped,
    disagreements: bad.map((r) => `${r.dropItemId}: ${r.status}`),
    campaignProblems: badCampaigns.map((r) => `${r.campaignId}: ${r.status}`),
    unrecordedMachines: unrecorded,
    message: problems
      ? `${problems} disagreement(s) between the CSVs and the chain. Decide which side is right; this script repairs neither.`
      : unrecorded === null
        ? "Drops and campaigns match, but the unrecorded-machine check could not run - not a full pass."
        : `All ${results.length - skipped} drop(s) and ${campaignResults.length} campaign address(es) on ${config.network} match the chain, and no machine is unrecorded.`,
  }));
  process.exit(problems ? 1 : unrecorded === null ? 3 : 0);
}

if (require.main === module) {
  main().catch((err) => {
    console.log(log({ status: "failure", reason: "unhandled_error", message: err.message }));
    process.exit(3);
  });
}

module.exports = {
  expectedItemsAvailable, isAmbiguousMaxSupply, compareRow, exitCodeFor, formatTable, UNLIMITED_ITEMS_AVAILABLE,
  compareCampaignRow, findUnrecorded, formatCampaignTable,
};
