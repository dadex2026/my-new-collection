#!/usr/bin/env node
/**
 * scripts/deploy-candy-machine.js
 *
 * Deploys one Candy Machine Core + Candy Guard per drop (open edition)
 * in the active collection, enabling buyer-funded, no-backend minting.
 *
 * WHY ONE CANDY MACHINE PER DROP, NOT PER COLLECTION:
 * Each row in master.csv is its own open edition — its own image, its
 * own price, its own maxSupply, its own on/off status. A Candy Machine
 * has exactly one price (guard) and one shared URI (hidden settings),
 * so it maps to a single drop, not a whole collection. All drops for a
 * collection still point at the same on-chain Collection (created by
 * deploy-collection.js) via the `collection` field.
 *
 * HIDDEN SETTINGS, NOT CONFIG LINES:
 * Every mint of an open edition shows the identical name + metadata
 * URI — there's no per-mint unique data. Candy Machine's "hidden
 * settings" mode is built exactly for this (a single shared name/URI
 * for the whole run), so no addConfigLines step is needed.
 *
 * Prerequisites (checked below, not assumed):
 *   - deploy-collection.js has run: row.collectionAddress is set
 *   - upload-metadata.js has run: row.uri is a real (non-placeholder) URI
 *
 * Idempotent: a row is skipped if it already has a candyMachineAddress
 * recorded for the CURRENT network. Network + dropItemId together are
 * the identity key — a devnet deploy doesn't block a later mainnet
 * deploy of the same drop.
 *
 * Exit codes:
 *   0 = success (including "already deployed, nothing to do")
 *   1 = validation failure (bad config, bad CSV, prerequisites not met)
 *   3 = blockchain failure (RPC error, transaction failure, etc.)
 *
 * Usage:
 *   node scripts/deploy-candy-machine.js
 *   node scripts/deploy-candy-machine.js --drop OE-001   (deploy a single drop only)
 *   node scripts/deploy-candy-machine.js --slug founders (override config.json's collectionSlug)
 *   node scripts/deploy-candy-machine.js --mint-limit 5  (per-wallet mint cap guard — raises the
 *                                                          cost of single-wallet bulk sniping)
 *   node scripts/deploy-candy-machine.js --start-date "2026-08-01T18:00:00.000Z"
 *                                                         (blocks minting until this time — closes
 *                                                          the "mint before anyone sees the
 *                                                          announcement" sniping window)
 *   node scripts/deploy-candy-machine.js --bot-tax 0.01  (SOL penalty charged to transactions that
 *                                                          fail guard validation — discourages bot
 *                                                          spam; also enforces the mint instruction
 *                                                          must be last in its transaction, blocking
 *                                                          a common bundling attack pattern)
 *   node scripts/deploy-candy-machine.js --holder-collection <address>
 *                                                        (adds a `holder` guard group that mints by
 *                                                         BURNING an asset from <address> - the
 *                                                         voucher mechanic. Public mints keep paying
 *                                                         through a `public` group. Omit and the
 *                                                         machine deploys ungrouped, as before.)
 *   node scripts/deploy-candy-machine.js --holder-collection <address> --holder-price 0.005
 *                                                        (holders burn a voucher AND pay 0.005;
 *                                                         default 0 means burn only)
 *   node scripts/deploy-candy-machine.js --mutable       (allow metadata changes after deploy —
 *                                                          OFF by default; once real buyers have
 *                                                          minted, deployer-editable metadata is a
 *                                                          trust liability, not a convenience)
 *
 * Dependencies (npm install):
 *   @metaplex-foundation/umi
 *   @metaplex-foundation/umi-bundle-defaults
 *   @metaplex-foundation/mpl-core
 *   @metaplex-foundation/mpl-core-candy-machine
 *   dotenv
 * (No bs58 dependency — base58 decoding is done inline below.)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { parseCsvRecords, serializeRow } = require("./lib/csv");
// The holder/public group shape is defined once, in update-candy-guard.js,
// and imported here. Two copies of it - one for new machines, one for the
// migration of deployed ones - is exactly the arrangement that lets a
// deployed drop and a freshly deployed drop enforce different terms while
// both look correct in isolation.
const { buildPlan } = require("./update-candy-guard.js");
const crypto = require("crypto");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env.admin") });

// ---- Paths --------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(BACKEND_DIR, "config.json");
const MASTER_CSV_PATH = path.join(BACKEND_DIR, "master.csv");
const DEPLOYMENT_HISTORY_PATH = path.join(BACKEND_DIR, "deployment-history.csv");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

// A concrete on-chain cap has to exist even for a nominally "unlimited"
// open edition. This is a deliberate, visible choice, not a hidden default —
// override per-drop via master.csv's maxSupply, or change this constant.
const UNLIMITED_ITEMS_AVAILABLE = 4_294_967_295; // u32 max

// ---- Logging --------------------------------------------------------------

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "deploy-candy-machine", ...event };
  const line = JSON.stringify(entry);
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, "deploy-candy-machine.log"), line + "\n");
}

function fail(reason, message, exitCode) {
  log({ status: "failure", reason, message });
  process.exit(exitCode);
}

// ---- Base58 decoder (no external dependency) -----------------------------

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

// Solana transaction signatures are conventionally displayed/linked as
// base58 (what every explorer expects), not base64 — encode explicitly
// rather than defaulting to Buffer's base64 toString().
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

// ---- Config / validation -------------------------------------------

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fail("missing_config", `backend/config.json not found. Expected at ${CONFIG_PATH}`, 1);
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    fail("invalid_config_json", `config.json is not valid JSON: ${err.message}`, 1);
  }
  const required = ["collectionSlug", "network", "rpc", "treasury"];
  const missing = required.filter((key) => !config[key]);
  if (missing.length > 0) {
    fail("incomplete_config", `config.json is missing required field(s): ${missing.join(", ")}`, 1);
  }
  if (!["devnet", "mainnet"].includes(config.network)) {
    fail("invalid_network", `config.json "network" must be "devnet" or "mainnet", got "${config.network}"`, 1);
  }
  return config;
}

function validateTreasury(config) {
  const pattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  if (!pattern.test(config.treasury)) {
    fail("invalid_treasury", `config.json "treasury" does not look like a valid Solana address: ${config.treasury}`, 1);
  }
}

function isPlaceholder(url) {
  if (!url || url.trim() === "") return true;
  if (url.includes("placehold.co")) return true;
  if (url.includes("example.com")) return true;
  if (url.includes("AbCdEf") || url.includes("ImageHash")) return true;
  return false;
}

function parseMaxSupply(value) {
  if (!value || value.trim().toLowerCase() === "unlimited") return UNLIMITED_ITEMS_AVAILABLE;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : UNLIMITED_ITEMS_AVAILABLE;
}

// ---- Umi + Candy Machine setup (verified against installed package types) -

async function getUmi(rpc) {
  const umiBundleDefaults = await import("@metaplex-foundation/umi-bundle-defaults");
  const mplCore = await import("@metaplex-foundation/mpl-core");
  const mplCandyMachine = await import("@metaplex-foundation/mpl-core-candy-machine");
  const umiCore = await import("@metaplex-foundation/umi");

  const umi = umiBundleDefaults
    .createUmi(rpc)
    .use(mplCore.mplCore())
    .use(mplCandyMachine.mplCandyMachine());

  const secret = process.env.DEPLOYER_PRIVATE_KEY;
  if (!secret) {
    fail("missing_deployer_key", "DEPLOYER_PRIVATE_KEY not set in backend/.env.admin", 1);
  }

  let secretKeyBytes;
  try {
    secretKeyBytes = decodeBase58(secret.trim());
  } catch (err) {
    fail("invalid_deployer_key", `DEPLOYER_PRIVATE_KEY is not valid base58: ${err.message}`, 1);
  }

  let keypair;
  try {
    keypair = umi.eddsa.createKeypairFromSecretKey(secretKeyBytes);
  } catch (err) {
    fail("invalid_deployer_key", `Could not derive keypair from DEPLOYER_PRIVATE_KEY: ${err.message}`, 1);
  }

  umi.use(umiCore.keypairIdentity(keypair));

  return { umi, umiCore, mplCandyMachine };
}

// ---- Deploy one drop's Candy Machine + Candy Guard ------------------------

async function deployDropCandyMachine({ umi, umiCore, mplCandyMachine }, row, config, options) {
  const { mintLimitPerWallet, startDateIso, botTaxSol, mutable, holderCollection, holderPrice } = options;

  const candyMachineSigner = umiCore.generateSigner(umi);
  const itemsAvailable = parseMaxSupply(row.maxSupply);
  const priceSol = Number(row.price) || 0;

  const guards = {
    solPayment: {
      lamports: umiCore.sol(priceSol),
      destination: umiCore.publicKey(config.treasury),
    },
  };

  if (mintLimitPerWallet) {
    // mintLimit needs a small numeric id per guard instance; 1 is fine
    // since this candy machine only ever has one mintLimit guard.
    guards.mintLimit = { id: 1, limit: mintLimitPerWallet };
  }

  if (startDateIso) {
    // Blocks minting entirely until this timestamp — closes the
    // "mint before anyone even sees the announcement" sniping window.
    // Verified shape: { date: DateTimeInput } where DateTimeInput
    // accepts an ISO string directly, converted via umi's dateTime().
    guards.startDate = { date: umiCore.dateTime(startDateIso) };
  }

  if (botTaxSol && botTaxSol > 0) {
    // Charges a small non-refundable fee to transactions that fail
    // guard validation — raises the cost of bot spam attempts.
    // lastInstruction: true additionally requires the mint be the last
    // instruction in its transaction, which blocks a common bundling
    // attack pattern (stacking extra logic around the mint call).
    guards.botTax = { lamports: umiCore.sol(botTaxSol), lastInstruction: true };
  }

  const builder = await mplCandyMachine.create(umi, {
    candyMachine: candyMachineSigner,
    collection: umiCore.publicKey(row.collectionAddress),
    collectionUpdateAuthority: umi.identity,
    itemsAvailable,
    // Defaults to immutable (isMutable: false) — safer default. Once
    // real buyers have minted, the ability for the deployer authority
    // to change collection metadata is a trust liability, not a
    // convenience. Pass --mutable explicitly if you genuinely need to
    // update metadata post-launch (e.g. still actively iterating).
    isMutable: !!mutable,
    hiddenSettings: {
      name: (row.itemName || row.dropItemId).slice(0, 32),
      uri: row.uri,
      hash: new Uint8Array(32), // hash of the (single, shared) metadata file — not required to be verified on-chain for hidden settings to function
    },
    // Without --holder-collection this is the original shape: every guard
    // at the top level, no groups. With it, the default set is emptied and
    // every guard is restated per group - see "the default trap" in
    // update-candy-guard.js for why nothing is left to inherit.
    ...(holderCollection
      ? buildPlan(guards, { burnCollection: holderCollection, holderPrice, treasury: config.treasury, umiCore })
      : { guards, groups: [] }),
  });

  const { signature } = await builder.sendAndConfirm(umi);

  return {
    candyMachineAddress: candyMachineSigner.publicKey.toString(),
    signature: encodeBase58(Buffer.from(signature)),
  };
}

// ---- Main ---------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const slugFlagIndex = args.indexOf("--slug");
  const dropFlagIndex = args.indexOf("--drop");
  const holderCollectionFlagIndex = args.indexOf("--holder-collection");
  const holderPriceFlagIndex = args.indexOf("--holder-price");
  const mintLimitFlagIndex = args.indexOf("--mint-limit");
  const startDateFlagIndex = args.indexOf("--start-date");
  const botTaxFlagIndex = args.indexOf("--bot-tax");
  const mutable = args.includes("--mutable");

  const config = loadConfig();
  const collectionSlug =
    slugFlagIndex !== -1 && args[slugFlagIndex + 1] ? args[slugFlagIndex + 1] : config.collectionSlug;
  const onlyDropId = dropFlagIndex !== -1 ? args[dropFlagIndex + 1] : null;
  const mintLimitPerWallet =
    mintLimitFlagIndex !== -1 && args[mintLimitFlagIndex + 1] ? Number(args[mintLimitFlagIndex + 1]) : null;
  const startDateIso =
    startDateFlagIndex !== -1 && args[startDateFlagIndex + 1] ? args[startDateFlagIndex + 1] : null;
  const holderCollection =
    holderCollectionFlagIndex !== -1 && args[holderCollectionFlagIndex + 1]
      ? args[holderCollectionFlagIndex + 1]
      : null;
  const holderPrice =
    holderPriceFlagIndex !== -1 && args[holderPriceFlagIndex + 1] ? Number(args[holderPriceFlagIndex + 1]) : 0;
  if (holderCollection && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(holderCollection)) {
    fail("invalid_holder_collection", `--holder-collection "${holderCollection}" does not look like a Solana address`, 1);
  }
  if (holderPriceFlagIndex !== -1 && !Number.isFinite(holderPrice)) {
    fail("invalid_holder_price", `--holder-price "${args[holderPriceFlagIndex + 1]}" is not a number`, 1);
  }
  if (holderPrice > 0 && !holderCollection) {
    fail("holder_price_without_collection", "--holder-price does nothing without --holder-collection", 1);
  }
  const botTaxSol =
    botTaxFlagIndex !== -1 && args[botTaxFlagIndex + 1] ? Number(args[botTaxFlagIndex + 1]) : null;

  if (startDateIso && Number.isNaN(Date.parse(startDateIso))) {
    fail("invalid_start_date", `--start-date "${startDateIso}" is not a valid date. Use ISO format, e.g. "2026-08-01T18:00:00.000Z"`, 1);
  }

  validateTreasury(config);

  log({
    status: "start",
    collectionSlug,
    network: config.network,
    onlyDropId,
    mintLimitPerWallet,
    startDateIso,
    holderCollection,
    holderPrice,
    botTaxSol,
    mutable,
  });

  if (config.network === "mainnet") {
    log({ status: "info", message: "Deploying to MAINNET — this costs real SOL. 5 second window to cancel (Ctrl+C)." });
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  const { header, rows } = readCsv(MASTER_CSV_PATH);
  if (rows.length === 0) {
    fail("empty_master_csv", "backend/master.csv has no data rows", 1);
  }

  for (const col of ["candyMachineAddress", "candyGuardAddress", "treasury", "network", "holderRequiredCollection", "holderPrice"]) {
    if (!header.includes(col)) {
      header.push(col);
      rows.forEach((r) => { r[col] = r[col] || ""; });
      log({ status: "info", message: `Added ${col} column to master.csv header` });
    }
  }

  // ---- Refuse to make a burn currency publicly mintable -------------------
  //
  // A voucher collection must never get a candy machine. In this pipeline a
  // candy machine IS the public mint path - mint.ts refuses a drop without one
  // and the card only offers a Mint button when one exists - so the empty
  // candyMachineAddress cell is the entire gate. Deploy one here and anyone
  // can mint vouchers (at `price`, which for a voucher row is 0), then burn
  // each for an edition of their choosing. The open edition becomes free, and
  // nothing errors: it gets more permissive, which is the direction nobody
  // notices.
  //
  // Two signals, because they cover different moments:
  //
  //   EXPLICIT - mintStatus "voucher" on the row. True from the moment the row
  //   is typed, before anything exists on chain. This is the one that matters,
  //   because the realistic accident is running the deploy scripts down the
  //   list on day one, when no edition points at the voucher yet.
  //
  //   DERIVED - the collection is named as some drop's holderRequiredCollection.
  //   Only true after the first edition is migrated, so it cannot protect day
  //   one - but it catches a voucher collection nobody remembered to mark.
  //
  // Neither can undo a candy machine already deployed; this pipeline has no way
  // to undeploy one.
  const allSlugRows = rows.filter((r) => r.collectionSlug === collectionSlug);
  const declaredVoucher = allSlugRows.filter(
    (r) => (r.mintStatus || "").trim().toLowerCase() === "voucher"
  );
  const slugCollectionAddresses = new Set(
    allSlugRows.map((r) => (r.collectionAddress || "").trim()).filter(Boolean)
  );
  const burnedBy = rows.filter((r) => {
    const target = (r.holderRequiredCollection || "").trim();
    return target && slugCollectionAddresses.has(target);
  });

  if (declaredVoucher.length > 0 || burnedBy.length > 0) {
    const why = declaredVoucher.length > 0
      ? `${declaredVoucher.length} row(s) declare mintStatus "voucher": ${declaredVoucher.map((r) => r.dropItemId).join(", ")}`
      : `it is named as holderRequiredCollection by ${burnedBy.map((r) => r.dropItemId).join(", ")}`;
    fail(
      "voucher_collection_not_mintable",
      `"${collectionSlug}" is a burn currency - ${why}. Deploying a candy machine for it ` +
        "would make vouchers publicly mintable, and each voucher redeems for an edition. " +
        "Vouchers are minted only by their claim campaign (deploy-campaign.js), never here. Refusing.",
      1
    );
  }

  let matchingRows = rows.filter((r) => r.collectionSlug === collectionSlug);
  if (onlyDropId) {
    matchingRows = matchingRows.filter((r) => r.dropItemId === onlyDropId);
  }
  if (matchingRows.length === 0) {
    fail(
      "no_matching_rows",
      `No rows in master.csv match collectionSlug "${collectionSlug}"${onlyDropId ? ` and dropItemId "${onlyDropId}"` : ""}`,
      1
    );
  }

  // ---- Prerequisite + idempotency triage ---------------------------------
  const toDeploy = [];
  const alreadyDeployed = [];
  const notReady = [];

  for (const row of matchingRows) {
    if (!row.dropItemId) continue;

    if (row.candyMachineAddress && row.network === config.network) {
      alreadyDeployed.push(row.dropItemId);
      continue;
    }

    const missing = [];
    if (!row.collectionAddress) missing.push("collectionAddress (run deploy-collection.js)");
    if (isPlaceholder(row.uri)) missing.push("uri (run upload-metadata.js)");

    if (missing.length > 0) {
      notReady.push({ dropItemId: row.dropItemId, missing });
      continue;
    }

    toDeploy.push(row);
  }

  log({
    status: "plan",
    totalDrops: matchingRows.length,
    alreadyDeployed: alreadyDeployed.length,
    toDeploy: toDeploy.length,
    notReady: notReady.length,
  });

  if (notReady.length > 0) {
    for (const item of notReady) {
      log({
        status: "warning",
        dropItemId: item.dropItemId,
        message: `Not ready — missing: ${item.missing.join(", ")}`,
      });
    }
  }

  if (toDeploy.length === 0) {
    log({
      status: "success",
      message:
        alreadyDeployed.length > 0
          ? "All matching drops already have a candy machine on this network."
          : "No drops are ready to deploy yet (see prerequisite warnings above).",
    });
    process.exit(0);
  }

  let umiContext;
  try {
    umiContext = await getUmi(config.rpc);
  } catch (err) {
    fail("umi_init_failed", `Could not initialize Umi/Candy Machine context: ${err.message}`, 3);
  }

  let deployedCount = 0;
  let failedCount = 0;

  for (const row of toDeploy) {
    try {
      const { candyMachineAddress, signature } = await deployDropCandyMachine(
        umiContext,
        row,
        config,
        { mintLimitPerWallet, startDateIso, botTaxSol, mutable, holderCollection, holderPrice }
      );

      row.candyMachineAddress = candyMachineAddress;
      row.treasury = config.treasury;
      row.network = config.network;
      // generate-registry.js reads these two columns to tell the frontend
      // a holder route exists. A machine deployed with groups whose row
      // does not say so is a holder route nobody can reach.
      row.holderRequiredCollection = holderCollection || "";
      row.holderPrice = holderCollection ? String(holderPrice) : "";

      // Save after every single deploy so a crash mid-run loses nothing
      // already confirmed on-chain.
      writeCsv(MASTER_CSV_PATH, header, rows);

      appendDeploymentHistory({
        collection: `${collectionSlug}:${row.dropItemId}`,
        date: new Date().toISOString(),
        network: config.network,
        signature,
        status: "success",
      });

      deployedCount++;
      log({
        status: "info",
        dropItemId: row.dropItemId,
        candyMachineAddress,
        signature,
        message: `Deployed candy machine for ${row.dropItemId}`,
      });
    } catch (err) {
      failedCount++;
      appendDeploymentHistory({
        collection: `${collectionSlug}:${row.dropItemId}`,
        date: new Date().toISOString(),
        network: config.network,
        signature: "N/A",
        status: "failed",
      });
      log({
        status: "warning",
        dropItemId: row.dropItemId,
        reason: "blockchain_error",
        message: `Deploy failed for ${row.dropItemId}: ${err.message}`,
      });
    }
  }

  log({
    status: failedCount === 0 ? "success" : "partial_failure",
    collectionSlug,
    network: config.network,
    deployed: deployedCount,
    failed: failedCount,
    message:
      failedCount === 0
        ? `All ${deployedCount} candy machine(s) deployed and master.csv updated.`
        : `${deployedCount} succeeded, ${failedCount} failed. Re-run this script to retry only the failed ones (already-deployed rows are skipped).`,
  });

  process.exit(failedCount === 0 ? 0 : 3);
}

main().catch((err) => {
  log({ status: "failure", reason: "unhandled_error", message: err.message });
  process.exit(3);
});