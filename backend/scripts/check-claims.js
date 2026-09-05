#!/usr/bin/env node
/**
 * scripts/check-claims.js
 *
 * Which campaigns has this edition already claimed, and which has this wallet?
 *
 * WHY THIS EXISTS
 *   Campaign claims are limited by two on-chain counters: mintLimit, keyed to
 *   the paying WALLET, and assetMintLimit, keyed to the qualifying NFT. The
 *   second one is the interesting one, because it rides with the asset - sell
 *   an eligible edition and its spent claims go with it, while its unspent
 *   ones transfer to the buyer.
 *
 *   That makes "has this edition already claimed?" a question with real money
 *   attached: an edition with three unspent claims is worth more than one
 *   with none, and until this script existed nobody could tell them apart.
 *   Not the seller, not the buyer, not support. The counter is a PDA and the
 *   answer was always on chain; nothing read it.
 *
 *   The claimer's own experience was no better: a spent holder saw an enabled
 *   Claim button, clicked it, and got a wallet simulation failure with no
 *   explanation.
 *
 * READ-ONLY. No deploy key, no transaction, no cost.
 *
 * Exit codes:
 *   0 = report printed
 *   1 = validation failure (bad args, no campaigns, bad config)
 *   2 = chain failure (RPC unreachable)
 *
 * Usage:
 *   node scripts/check-claims.js <assetAddress>
 *   node scripts/check-claims.js --wallet <walletAddress>
 *   node scripts/check-claims.js <assetAddress> --wallet <walletAddress>
 *   node scripts/check-claims.js <assetAddress> --json
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { parseCsvRecords } = require("./lib/csv");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const BACKEND_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(BACKEND_DIR, "config.json");
const CAMPAIGNS_CSV_PATH = path.join(BACKEND_DIR, "campaigns.csv");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "check-claims", ...event };
  const line = JSON.stringify(entry);
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, "check-claims.log"), line + "\n");
}

function fail(reason, message, exitCode) {
  log({ status: "failure", reason, message });
  process.exit(exitCode);
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) fail("missing_config", `backend/config.json not found at ${CONFIG_PATH}`, 1);
  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    fail("invalid_config_json", `config.json is not valid JSON: ${err.message}`, 1);
  }
  if (!config.rpc) fail("incomplete_config", "config.json is missing rpc", 1);
  return config;
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");

  const walletFlagIndex = args.indexOf("--wallet");
  const wallet = walletFlagIndex !== -1 ? args[walletFlagIndex + 1] : null;
  // Guard the -1 case: with no --wallet flag, walletFlagIndex + 1 is 0, which
  // would exclude the first positional argument - the asset itself.
  const walletValueIndex = walletFlagIndex === -1 ? -1 : walletFlagIndex + 1;
  const asset = args.find((a, i) => !a.startsWith("--") && i !== walletValueIndex) || null;

  if (!asset && !wallet) {
    fail("missing_target", "Required: an <assetAddress>, or --wallet <address>, or both. See the header for usage.", 1);
  }
  for (const [label, value] of [["asset", asset], ["--wallet", wallet]]) {
    if (value && !ADDRESS_PATTERN.test(value)) {
      fail("invalid_address", `${label} "${value}" does not look like a Solana address`, 1);
    }
  }

  const config = loadConfig();

  if (!fs.existsSync(CAMPAIGNS_CSV_PATH)) {
    fail("missing_campaigns_csv", `backend/campaigns.csv not found at ${CAMPAIGNS_CSV_PATH}`, 1);
  }
  const { records } = parseCsvRecords(fs.readFileSync(CAMPAIGNS_CSV_PATH, "utf8"));
  const deployed = records.filter((r) => ADDRESS_PATTERN.test(r.campaignCandyMachineAddress || ""));

  if (deployed.length === 0) {
    log({
      status: "success",
      result: "no_deployed_campaigns",
      message:
        "No campaign in campaigns.csv has a deployed candy machine, so there are no counters to read. " +
        "NOTHING WAS CHECKED by this run.",
    });
    process.exit(0);
  }

  log({ status: "start", network: config.network, asset, wallet, campaigns: deployed.length });

  const mplCandyMachine = await import("@metaplex-foundation/mpl-core-candy-machine");
  const umiBundleDefaults = await import("@metaplex-foundation/umi-bundle-defaults");
  const umiCore = await import("@metaplex-foundation/umi");
  const mplCore = await import("@metaplex-foundation/mpl-core");

  const umi = umiBundleDefaults
    .createUmi(config.rpc)
    .use(mplCore.mplCore())
    .use(mplCandyMachine.mplCandyMachine());

  const rows = [];

  for (const c of deployed) {
    const candyMachine = umiCore.publicKey(c.campaignCandyMachineAddress);
    const [candyGuard] = mplCandyMachine.findCandyGuardPda(umi, { base: candyMachine });

    const limit = Number(c.claimLimit) || 1;
    // Empty claimScope means every campaign deployed before 2026-09-03, all of
    // which used assetMintLimit with id 1 - which is also why assetLimitId
    // falls back to claimLimitId rather than being treated as absent.
    const scope = (c.claimScope || "asset").trim();
    const walletLimitId = c.claimLimitId ? Number(c.claimLimitId) : null;
    const assetLimitId = c.assetLimitId ? Number(c.assetLimitId) : walletLimitId;

    const row = { campaignId: c.campaignId, title: c.title || "", scope, limit, asset: null, wallet: null };

    try {
      if (asset && (scope === "both" || scope === "asset") && assetLimitId !== null) {
        const counter = await mplCandyMachine.safeFetchAssetMintCounterFromSeeds(umi, {
          id: assetLimitId,
          asset: umiCore.publicKey(asset),
          candyGuard,
          candyMachine,
        });
        // No account means the counter was never created, which means this
        // asset has never claimed here. Absence is the answer, not an error.
        row.asset = { id: assetLimitId, count: counter ? Number(counter.count) : 0 };
      }

      if (wallet && (scope === "both" || scope === "wallet") && walletLimitId !== null) {
        const counter = await mplCandyMachine.safeFetchMintCounterFromSeeds(umi, {
          id: walletLimitId,
          user: umiCore.publicKey(wallet),
          candyGuard,
          candyMachine,
        });
        row.wallet = { id: walletLimitId, count: counter ? Number(counter.count) : 0 };
      }
    } catch (err) {
      fail("rpc_failed", `Could not read counters for campaign "${c.campaignId}": ${err.message}`, 2);
    }

    rows.push(row);
  }

  if (asJson) {
    log({ status: "success", asset, wallet, results: rows });
    process.exit(0);
  }

  const verdict = (side, limit) => {
    if (!side) return "n/a";
    return side.count >= limit ? `SPENT (${side.count}/${limit})` : `available (${side.count}/${limit})`;
  };

  console.log("\n" + "=".repeat(78));
  if (asset) console.log(`ASSET   ${asset}`);
  if (wallet) console.log(`WALLET  ${wallet}`);
  console.log(`network ${config.network}`);
  console.log("=".repeat(78));
  console.log(
    "campaign".padEnd(28) + "scope".padEnd(9) + (asset ? "by asset".padEnd(22) : "") + (wallet ? "by wallet" : "")
  );
  console.log("-".repeat(78));
  for (const r of rows) {
    console.log(
      r.campaignId.slice(0, 27).padEnd(28) +
        r.scope.padEnd(9) +
        (asset ? verdict(r.asset, r.limit).padEnd(22) : "") +
        (wallet ? verdict(r.wallet, r.limit) : "")
    );
  }

  const assetSpent = rows.filter((r) => r.asset && r.asset.count >= r.limit);
  const assetOpen = rows.filter((r) => r.asset && r.asset.count < r.limit);

  if (asset) {
    console.log(
      `\n  This edition has claimed ${assetSpent.length} of ${assetSpent.length + assetOpen.length} campaign(s) ` +
        `it is counted against.`
    );
    if (assetOpen.length > 0) {
      console.log(`  Unspent, and they transfer with it: ${assetOpen.map((r) => r.campaignId).join(", ")}`);
    }
  }

  // "n/a" is not "no" - say which question was not asked, so a blank column is
  // never mistaken for a negative answer.
  const skipped = rows.filter((r) => (asset && !r.asset) || (wallet && !r.wallet));
  if (skipped.length > 0) {
    console.log(
      `\n  ${skipped.length} campaign(s) show n/a: their guard set does not include that counter, ` +
        `so there is nothing to read. Not the same as "has not claimed".`
    );
  }
  console.log("");

  log({ status: "success", asset, wallet, campaignsChecked: rows.length, assetSpent: assetSpent.length });
}

main().catch((err) => {
  fail("unexpected_error", err && err.stack ? err.stack : String(err), 2);
});
