#!/usr/bin/env node
/**
 * scripts/deploy-campaign.js
 *
 * Deploys a dedicated, independent Candy Machine for a reward campaign —
 * e.g. "OE-001 holders can claim OE-002 free, 132 available."
 *
 * WHY THIS IS A SEPARATE CANDY MACHINE, NOT A GUARD GROUP ON THE TARGET
 * DROP'S EXISTING ONE: a campaign's allocation must NOT consume from the
 * target drop's own public-sale itemsAvailable — the two supply pools
 * need to be genuinely independent. Verified structurally sound: each
 * candy machine is its own freshly-generated account (candyMachine is a
 * Signer, not derived from the collection), so nothing prevents multiple
 * independent candy machines from referencing the same Collection, each
 * with its own separate itemsAvailable/itemsRedeemed counter. Assets
 * minted through either path belong to the same Collection and are
 * otherwise indistinguishable once created.
 *
 * ELIGIBILITY IS CROSS-DROP BY DESIGN: the eligibility collection (who
 * must hold what) and the target collection (what gets minted as the
 * reward) are independent parameters — a campaign is not required to
 * reward the same collection that establishes eligibility. This was
 * already true of deploy-candy-machine.js's --holder-collection flag;
 * this script just makes that pattern the explicit, primary mode for
 * a dedicated campaign rather than a discount tier on an existing drop.
 *
 * Config-driven via campaigns.csv — nothing about a campaign (its
 * display text, eligibility rule, target, price, or allocation) is
 * hardcoded into any script or the frontend. See campaigns.csv format
 * below.
 *
 * campaigns.csv format:
 *   campaignId,title,headline,description,eligibilityText,rewardText,
 *   priceText,allocationText,claimText,soldOutText,
 *   eligibilityDropItemId,targetDropItemId,price,allocation
 *
 *   eligibilityDropItemId — the dropItemId whose COLLECTION establishes
 *     who's eligible (must already be deployed via deploy-collection.js)
 *   targetDropItemId — the dropItemId being minted as the reward (must
 *     already be deployed via deploy-collection.js AND have real,
 *     uploaded metadata via upload-metadata.js)
 *   price — SOL, use 0 for a genuinely free claim
 *   allocation — this campaign's own independent supply cap
 *
 * Exit codes:
 *   0 = success (including "already deployed, nothing to do")
 *   1 = validation failure (bad config, missing prerequisite drops)
 *   3 = blockchain failure
 *
 * Usage:
 *   node scripts/deploy-campaign.js               (DEFAULT: one claim per wallet AND one per
 *                                                   qualifying NFT - both counters, conjunctive)
 *   node scripts/deploy-campaign.js --per-asset   (only the per-NFT counter - a wallet holding
 *                                                   five eligible editions claims five times)
 *   node scripts/deploy-campaign.js --per-wallet  (only the per-wallet counter - passing an
 *                                                   edition to a fresh wallet claims again)
 *   node scripts/deploy-campaign.js --campaign MYCOL-OE001-OE002-132
 *
 * Dependencies (npm install):
 *   @metaplex-foundation/umi
 *   @metaplex-foundation/umi-bundle-defaults
 *   @metaplex-foundation/mpl-core
 *   @metaplex-foundation/mpl-core-candy-machine
 *   dotenv
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
const CAMPAIGNS_CSV_PATH = path.join(BACKEND_DIR, "campaigns.csv");
const DEPLOYMENT_HISTORY_PATH = path.join(BACKEND_DIR, "deployment-history.csv");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

// ---- Logging --------------------------------------------------------------

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "deploy-campaign", ...event };
  console.log(JSON.stringify(entry));
  fs.appendFileSync(path.join(LOGS_DIR, "deploy-campaign.log"), JSON.stringify(entry) + "\n");
}

function fail(reason, message, exitCode) {
  log({ status: "failure", reason, message });
  process.exit(exitCode);
}

// ---- Base58 helpers (no external dependency) -----------------------------

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

function isPlaceholder(url) {
  if (!url || url.trim() === "") return true;
  if (url.includes("placehold.co")) return true;
  if (url.includes("example.com")) return true;
  return false;
}

// ---- CSV helpers ------------------------------------------------------

// RFC4180 via lib/csv.js. This was an inline split(",") in eleven scripts until
// 2026-09-02 - no quote handling, and quoting did not help, because `"a, b"`
// split into `"a` and ` b"` with the quotes retained. One comma in any prose
// column shifted every field after it: a comma added to a campaigns.csv
// description made eligibilityDropItemId read "All Bronze Pennants have been
// claimed." and price read "REWARD-001". Signature and return shape are
// unchanged, so no call site moved. See open-items 28.
function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return { header: [], rows: [] };
  const { header, records } = parseCsvRecords(fs.readFileSync(filePath, "utf8"));
  return { header, rows: records };
}

// serializeField quotes only when a value would otherwise change meaning, so
// existing comma-free files round-trip byte-identical. Without it, the first
// write-back would flatten any quoting the reader had just honoured.
function writeCsv(filePath, header, rows) {
  const lines = [serializeRow(header)];
  for (const row of rows) {
    lines.push(serializeRow(header.map((key) => (row[key] !== undefined ? row[key] : ""))));
  }
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

function appendDeploymentHistory(record) {
  const header = ["collection", "date", "network", "signature", "status"];
  if (!fs.existsSync(DEPLOYMENT_HISTORY_PATH)) {
    fs.writeFileSync(DEPLOYMENT_HISTORY_PATH, header.join(",") + "\n", "utf8");
  }
  const line = [record.collection, record.date, record.network, record.signature, record.status].join(",");
  fs.appendFileSync(DEPLOYMENT_HISTORY_PATH, line + "\n", "utf8");
}

// ---- Config validation ----------------------------------------------------

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

// ---- Main ---------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const campaignFlagIndex = args.indexOf("--campaign");
  const forceFlag = args.includes("--force");
  // --per-wallet swaps the per-ASSET claim counter for a per-WALLET one.
  // assetMintLimit's counter is seeded by the qualifying NFT, so a wallet
  // holding five eligible editions gets five claims; mintLimit's counter is
  // seeded by the payer, so it gets one however many it holds.
  //
  // Worth being honest about the ceiling: this enforces one per WALLET, and
  // wallets are free. Someone can move each edition to a fresh wallet and
  // claim once from each. Nothing on chain knows about people. If one per
  // person is the actual requirement, the lever is an off-chain allowlist
  // built from a snapshot you curate, not a guard.
  // ONE CLAIM PER WALLET IS THE DEFAULT as of 2026-09-03. Pass --per-asset
  // for the old behaviour, where the counter is keyed to the qualifying NFT
  // and a wallet holding five eligible editions gets five claims.
  //
  // The default changed because "one reward per holder, first come" is what a
  // campaign is normally for, and the per-asset counter quietly rewards
  // whoever accumulated the most editions - which is a different campaign
  // than the one most people think they are running.
  //
  // Campaigns already on chain are unaffected: their guards were written at
  // deploy time and this only governs new ones. Their rows have no claimScope,
  // which reads as "asset", which is what they are.
  // BOTH COUNTERS BY DEFAULT as of 2026-09-03. They key on different things
  // and each leaves the other's hole open:
  //
  //   mintLimit      counter seeded by PAYER + machine. Stops one wallet
  //                  claiming five times because it holds five eligible
  //                  editions. Does NOT stop the same edition being passed to
  //                  a fresh wallet and claiming again - the new payer has a
  //                  new counter.
  //
  //   assetMintLimit counter seeded by the qualifying NFT + machine. The
  //                  counter rides with the asset, so passing it on does not
  //                  reset anything. Does NOT stop a wallet holding five
  //                  editions claiming once against each.
  //
  // Guards are conjunctive, so attaching both gives one claim per wallet AND
  // one per asset, which is what people assume "one reward per holder" means.
  // Different ids, so the two counter PDAs never collide.
  //
  // The flags relax it in either direction, and campaigns already on chain are
  // untouched: their rows carry no claimScope, which reads as "asset", which
  // is what they are.
  const walletOnly = args.includes("--per-wallet");
  const assetOnly = args.includes("--per-asset");
  if (walletOnly && assetOnly) {
    fail("conflicting_claim_scope", "--per-wallet and --per-asset are mutually exclusive. Omit both for one claim per wallet AND per asset.", 1);
  }
  const claimScope = walletOnly ? "wallet" : assetOnly ? "asset" : "both";
  const useWalletLimit = claimScope === "both" || claimScope === "wallet";
  const useAssetLimit = claimScope === "both" || claimScope === "asset";
  // Ids are fixed and written back so the frontend never has to assume them.
  // In "asset" mode assetMintLimit keeps id 1, matching every campaign
  // deployed before today.
  const WALLET_LIMIT_ID = 1;
  const ASSET_LIMIT_ID = claimScope === "both" ? 2 : 1;
  const claimLimitFlagIndex = args.indexOf("--claim-limit");
  const claimLimit = claimLimitFlagIndex !== -1 && args[claimLimitFlagIndex + 1] ? Number(args[claimLimitFlagIndex + 1]) : 1;

  const campaignId = campaignFlagIndex !== -1 ? args[campaignFlagIndex + 1] : null;
  if (!campaignId) fail("missing_campaign", "Required: --campaign <campaignId>", 1);
  if (!Number.isFinite(claimLimit) || claimLimit <= 0) {
    fail("invalid_claim_limit", `--claim-limit must be a positive number, got "${args[claimLimitFlagIndex + 1]}"`, 1);
  }

  const config = loadConfig();
  log({ status: "start", campaignId, network: config.network, claimLimit, claimScope });

  // ---- Load campaign config -----------------------------------------------
  const { header: campaignHeader, rows: campaignRows } = readCsv(CAMPAIGNS_CSV_PATH);
  if (campaignRows.length === 0) {
    fail("missing_campaigns_file", `backend/campaigns.csv not found or empty`, 1);
  }
  const campaign = campaignRows.find((r) => r.campaignId === campaignId);
  if (!campaign) {
    fail("campaign_not_found", `No row in campaigns.csv matches campaignId "${campaignId}"`, 1);
  }

  const requiredFields = ["eligibilityDropItemId", "targetDropItemId", "price", "allocation"];
  const missingFields = requiredFields.filter((f) => !campaign[f]);
  if (missingFields.length > 0) {
    fail("incomplete_campaign", `campaigns.csv row "${campaignId}" is missing: ${missingFields.join(", ")}`, 1);
  }

  const priceSol = Number(campaign.price);
  const allocation = Number(campaign.allocation);
  if (!Number.isFinite(priceSol) || priceSol < 0) {
    fail("invalid_price", `campaigns.csv row "${campaignId}" has an invalid price: "${campaign.price}"`, 1);
  }
  if (!Number.isFinite(allocation) || allocation <= 0) {
    fail("invalid_allocation", `campaigns.csv row "${campaignId}" has an invalid allocation: "${campaign.allocation}"`, 1);
  }

  // ---- Idempotency: already deployed? ------------------------------------
  if (campaign.campaignCandyMachineAddress && campaign.network === config.network && !forceFlag) {
    log({
      status: "success",
      message: `Campaign "${campaignId}" already has a candy machine on ${config.network}: ${campaign.campaignCandyMachineAddress}. Pass --force to redeploy.`,
    });
    process.exit(0);
  }

  // ---- Resolve eligibility and target drops from master.csv --------------
  const { rows: masterRows } = readCsv(MASTER_CSV_PATH);

  const eligibilityDrop = masterRows.find((r) => r.dropItemId === campaign.eligibilityDropItemId);
  if (!eligibilityDrop) {
    fail("eligibility_drop_not_found", `No row in master.csv matches eligibilityDropItemId "${campaign.eligibilityDropItemId}"`, 1);
  }
  if (!eligibilityDrop.collectionAddress) {
    fail(
      "eligibility_collection_not_deployed",
      `Eligibility drop "${campaign.eligibilityDropItemId}" has no collectionAddress — run deploy-collection.js for it first.`,
      1
    );
  }

  const targetDrop = masterRows.find((r) => r.dropItemId === campaign.targetDropItemId);
  if (!targetDrop) {
    fail("target_drop_not_found", `No row in master.csv matches targetDropItemId "${campaign.targetDropItemId}"`, 1);
  }
  if (!targetDrop.collectionAddress) {
    fail(
      "target_collection_not_deployed",
      `Target drop "${campaign.targetDropItemId}" has no collectionAddress — run deploy-collection.js for it first.`,
      1
    );
  }
  if (isPlaceholder(targetDrop.uri)) {
    fail(
      "target_metadata_not_ready",
      `Target drop "${campaign.targetDropItemId}" has no real metadata uri — run upload-metadata.js for it first.`,
      1
    );
  }

  log({
    status: "info",
    message: `Campaign "${campaignId}": eligibility = holders of "${campaign.eligibilityDropItemId}" (${eligibilityDrop.collectionAddress}), reward = "${campaign.targetDropItemId}" (${targetDrop.collectionAddress}), price = ${priceSol} SOL, allocation = ${allocation}`,
  });

  if (config.network === "mainnet") {
    log({ status: "info", message: "Deploying to MAINNET — this costs real SOL. 5 second window to cancel (Ctrl+C)." });
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  // ---- Deploy the dedicated campaign candy machine ------------------------
  let signature;
  let campaignCandyMachineAddress;
  try {
    const umiBundleDefaults = await import("@metaplex-foundation/umi-bundle-defaults");
    const mplCore = await import("@metaplex-foundation/mpl-core");
    const mplCandyMachine = await import("@metaplex-foundation/mpl-core-candy-machine");
    const umiCore = await import("@metaplex-foundation/umi");

    const umi = umiBundleDefaults.createUmi(config.rpc).use(mplCore.mplCore()).use(mplCandyMachine.mplCandyMachine());

    const secret = process.env.DEPLOYER_PRIVATE_KEY;
    if (!secret) fail("missing_deployer_key", "DEPLOYER_PRIVATE_KEY not set in backend/.env.admin", 1);
    const keypair = umi.eddsa.createKeypairFromSecretKey(decodeBase58(secret.trim()));
    umi.use(umiCore.keypairIdentity(keypair));

    const candyMachineSigner = umiCore.generateSigner(umi);

    const guards = {
      assetGate: { requiredCollection: umiCore.publicKey(eligibilityDrop.collectionAddress) },
      // Per-eligible-asset claim limit — closes a real gap found during
      // testing: without this, nothing on-chain stops one eligible
      // wallet from claiming the ENTIRE allocation by itself (assetGate
      // alone only checks "does this wallet currently hold a qualifying
      // asset," not "has this wallet already claimed"). Defaults to 1
      // (one claim per eligible wallet/asset) unless --claim-limit
      // overrides it — on by default, since the absence of this guard
      // is what caused the actual bug, not an opt-in hardening measure.
      // Counter seeded ["mint_limit", id, PAYER, guard, machine] - one
      // allowance per wallet, however many eligible assets it holds.
      ...(useWalletLimit ? { mintLimit: { id: WALLET_LIMIT_ID, limit: claimLimit } } : {}),
      // Counter seeded per eligible ASSET, so it rides with the NFT and a
      // transfer does not reset it.
      ...(useAssetLimit
        ? { assetMintLimit: { id: ASSET_LIMIT_ID, limit: claimLimit, requiredCollection: umiCore.publicKey(eligibilityDrop.collectionAddress) } }
        : {}),
    };
    if (priceSol > 0) {
      guards.solPayment = { lamports: umiCore.sol(priceSol), destination: umiCore.publicKey(config.treasury) };
    }
    // price === 0 intentionally omits solPayment entirely — a genuinely
    // free claim, gated only by assetGate + assetMintLimit, no payment
    // guard active at all.

    const builder = await mplCandyMachine.create(umi, {
      candyMachine: candyMachineSigner,
      collection: umiCore.publicKey(targetDrop.collectionAddress),
      collectionUpdateAuthority: umi.identity,
      itemsAvailable: allocation, // independent of the target drop's own public-sale supply
      isMutable: false,
      hiddenSettings: {
        name: (targetDrop.itemName || campaign.targetDropItemId).slice(0, 32),
        uri: targetDrop.uri,
        hash: new Uint8Array(32),
      },
      guards,
      groups: [],
    });

    const { signature: txSig } = await builder.sendAndConfirm(umi);
    signature = encodeBase58(Buffer.from(txSig));
    campaignCandyMachineAddress = candyMachineSigner.publicKey.toString();
  } catch (err) {
    appendDeploymentHistory({
      collection: `campaign:${campaignId}`,
      date: new Date().toISOString(),
      network: config.network,
      signature: "N/A",
      status: "failed",
    });
    fail("blockchain_error", `Campaign deployment failed: ${err.message}`, 3);
  }

  // ---- Persist results ----------------------------------------------------
  const newFields = ["campaignCandyMachineAddress", "eligibilityCollection", "targetCollection", "network", "treasury", "claimLimitId", "assetLimitId", "claimScope", "claimLimit"];
  for (const f of newFields) {
    if (!campaignHeader.includes(f)) campaignHeader.push(f);
  }
  campaign.campaignCandyMachineAddress = campaignCandyMachineAddress;
  campaign.eligibilityCollection = eligibilityDrop.collectionAddress;
  campaign.targetCollection = targetDrop.collectionAddress;
  campaign.network = config.network;
  campaign.claimLimitId = useWalletLimit || claimScope === "asset" ? "1" : "";
  campaign.assetLimitId = useAssetLimit ? String(ASSET_LIMIT_ID) : "";
  campaign.claimLimit = String(claimLimit);
  // The frontend has to send mint args matching the guard that is actually
  // deployed - mintLimit takes { id }, assetMintLimit takes { id, asset }, and
  // sending the wrong one desyncs the instruction from what the program
  // expects to deserialize. This column is how campaign.ts knows which.
  campaign.claimScope = claimScope;
  if (priceSol > 0) {
    campaign.treasury = config.treasury;
  }
  writeCsv(CAMPAIGNS_CSV_PATH, campaignHeader, campaignRows);

  appendDeploymentHistory({
    collection: `campaign:${campaignId}`,
    date: new Date().toISOString(),
    network: config.network,
    signature,
    status: "success",
  });

  log({
    status: "success",
    campaignId,
    campaignCandyMachineAddress,
    signature,
    message: `Campaign "${campaignId}" deployed. ${allocation} allocation(s), independent of "${campaign.targetDropItemId}"'s normal public-sale supply.`,
  });

  process.exit(0);
}

main().catch((err) => {
  log({ status: "failure", reason: "unhandled_error", message: err.message });
  process.exit(3);
});
