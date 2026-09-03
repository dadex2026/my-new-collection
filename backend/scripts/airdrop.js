#!/usr/bin/env node
/**
 * scripts/airdrop.js
 *
 * Mints Core assets directly to a list of recipient wallets, for free —
 * the deployer wallet pays and authorizes, each recipient just receives.
 * This does NOT go through the candy machine or its solPayment guard at
 * all; it uses mpl-core's create() to mint a standalone asset straight
 * into the collection. Two direct consequences worth understanding:
 *
 *   1. It does NOT count against the candy machine's itemsAvailable /
 *      itemsRedeemed — an airdropped asset and a publicly-minted asset
 *      both belong to the same on-chain Collection, but only public
 *      mints run through the candy machine's supply tracking.
 *   2. The DEPLOYER pays every transaction fee + asset rent — there is
 *      no payment step, by design. Budget accordingly (a few thousand
 *      lamports per recipient, not the drop's listed price).
 *
 * Every airdropped asset shares the same name/uri as the drop's other
 * items, matching the open-edition "everyone gets the same metadata"
 * convention already used by hiddenSettings in deploy-candy-machine.js.
 *
 * recipients.csv format:
 *   wallet,quantity
 *   <address>,1
 *   <address>,3
 * quantity is optional — omit the column entirely for "1 each".
 *
 * Idempotent + resumable: every attempt (success or failure) is logged
 * to backend/airdrop-history.csv. Re-running only processes recipients
 * that don't already have a successful entry for this exact drop —
 * partial quantities (e.g. 3 requested, 1 already sent) resume correctly.
 *
 * Exit codes:
 *   0 = success (including "nothing left to airdrop")
 *   1 = validation failure (bad CSV, invalid addresses, missing drop data)
 *   3 = blockchain failure (one or more mints failed — check the log for
 *       which recipients still need a retry)
 *
 * Usage:
 *   node scripts/airdrop.js --drop OE-001 --recipients recipients.csv
 *   node scripts/airdrop.js --drop OE-001 --recipients recipients.csv --dry-run
 *   node scripts/airdrop.js --drop OE-001 --recipients recipients.csv --slug founders
 *
 * Dependencies (npm install):
 *   @metaplex-foundation/umi
 *   @metaplex-foundation/umi-bundle-defaults
 *   @metaplex-foundation/mpl-core
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
const AIRDROP_HISTORY_PATH = path.join(BACKEND_DIR, "airdrop-history.csv");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

// ---- Logging --------------------------------------------------------------

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "airdrop", ...event };
  console.log(JSON.stringify(entry));
  fs.appendFileSync(path.join(LOGS_DIR, "airdrop.log"), JSON.stringify(entry) + "\n");
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

function isValidSolanaAddress(address) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

// ---- CSV helpers ------------------------------------------------------

// RFC4180 via lib/csv.js. This was an inline split(",") in eleven scripts until
// 2026-09-02 — no quote handling, and quoting did not help, because `"a, b"`
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

function readRecipients(filePath) {
  if (!fs.existsSync(filePath)) {
    fail("missing_recipients_file", `Recipients file not found: ${filePath}`, 1);
  }
  const { header, rows } = readCsv(filePath);
  if (!header.includes("wallet")) {
    fail("invalid_recipients_file", `Recipients CSV must have a "wallet" column. Found: ${header.join(", ")}`, 1);
  }
  return rows.map((r) => ({
    wallet: r.wallet,
    quantity: r.quantity && Number(r.quantity) > 0 ? Math.floor(Number(r.quantity)) : 1,
  }));
}

function appendAirdropHistory(record) {
  const header = ["date", "dropItemId", "wallet", "assetAddress", "signature", "status"];
  if (!fs.existsSync(AIRDROP_HISTORY_PATH)) {
    fs.writeFileSync(AIRDROP_HISTORY_PATH, header.join(",") + "\n", "utf8");
  }
  const line = [record.date, record.dropItemId, record.wallet, record.assetAddress, record.signature, record.status].join(",");
  fs.appendFileSync(AIRDROP_HISTORY_PATH, line + "\n", "utf8");
}

function countSuccessfulAirdrops(dropItemId, wallet) {
  if (!fs.existsSync(AIRDROP_HISTORY_PATH)) return 0;
  const { rows } = readCsv(AIRDROP_HISTORY_PATH);
  return rows.filter((r) => r.dropItemId === dropItemId && r.wallet === wallet && r.status === "success").length;
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
    fail("incomplete_config", `config.json is missing required field(s): rpc, network`, 1);
  }
  return config;
}

// ---- Main ---------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const dropFlagIndex = args.indexOf("--drop");
  const recipientsFlagIndex = args.indexOf("--recipients");
  const slugFlagIndex = args.indexOf("--slug");

  const dropItemId = dropFlagIndex !== -1 ? args[dropFlagIndex + 1] : null;
  const recipientsPath =
    recipientsFlagIndex !== -1 && args[recipientsFlagIndex + 1] ? path.resolve(args[recipientsFlagIndex + 1]) : null;

  if (!dropItemId) fail("missing_drop", "Required: --drop <dropItemId>", 1);
  if (!recipientsPath) fail("missing_recipients", "Required: --recipients <path/to/recipients.csv>", 1);

  const config = loadConfig();
  const collectionSlug = slugFlagIndex !== -1 && args[slugFlagIndex + 1] ? args[slugFlagIndex + 1] : config.collectionSlug;

  log({ status: "start", dropItemId, collectionSlug, recipientsPath, dryRun });

  // ---- Find the drop's collection + shared metadata -----------------------
  const { rows } = readCsv(MASTER_CSV_PATH);
  const dropRow = rows.find((r) => r.dropItemId === dropItemId && r.collectionSlug === collectionSlug);

  if (!dropRow) {
    fail("drop_not_found", `No row in master.csv matches dropItemId "${dropItemId}" in collection "${collectionSlug}"`, 1);
  }
  if (!dropRow.collectionAddress) {
    fail("collection_not_deployed", `Drop "${dropItemId}"'s collection has no collectionAddress — run deploy-collection.js first.`, 1);
  }
  if (!dropRow.uri || dropRow.uri.includes("placehold.co") || dropRow.uri.includes("example.com")) {
    fail("metadata_not_ready", `Drop "${dropItemId}" has no real metadata uri — run upload-metadata.js first.`, 1);
  }

  // ---- Load and validate recipients ---------------------------------------
  const recipients = readRecipients(recipientsPath);
  if (recipients.length === 0) {
    fail("empty_recipients", "recipients.csv has no data rows", 1);
  }

  const invalidWallets = recipients.filter((r) => !isValidSolanaAddress(r.wallet));
  if (invalidWallets.length > 0) {
    fail(
      "invalid_recipient_addresses",
      `${invalidWallets.length} recipient(s) have an invalid Solana address: ${invalidWallets.map((r) => r.wallet).join(", ")}`,
      1
    );
  }

  // ---- Build the work list, skipping already-successful sends ------------
  const toSend = [];
  let alreadySent = 0;
  for (const r of recipients) {
    const alreadyCount = countSuccessfulAirdrops(dropItemId, r.wallet);
    const remaining = r.quantity - alreadyCount;
    alreadySent += Math.min(alreadyCount, r.quantity);
    for (let i = 0; i < remaining; i++) {
      toSend.push(r.wallet);
    }
  }

  log({
    status: "plan",
    totalRecipients: recipients.length,
    totalRequestedUnits: recipients.reduce((sum, r) => sum + r.quantity, 0),
    alreadySent,
    toSend: toSend.length,
  });

  if (toSend.length === 0) {
    log({ status: "success", message: "Nothing to send — every recipient already has their full requested quantity." });
    process.exit(0);
  }

  if (dryRun) {
    console.log(`\n[dry-run] Would airdrop ${toSend.length} asset(s) for drop "${dropItemId}":`);
    const counts = {};
    for (const w of toSend) counts[w] = (counts[w] || 0) + 1;
    for (const [wallet, count] of Object.entries(counts)) {
      console.log(`  ${wallet}  x${count}`);
    }
    log({ status: "success", message: "[dry-run] No transactions sent." });
    process.exit(0);
  }

  // ---- Real airdrop ---------------------------------------------------
  const secret = process.env.DEPLOYER_PRIVATE_KEY;
  if (!secret) {
    fail("missing_deployer_key", "DEPLOYER_PRIVATE_KEY not set in backend/.env.admin", 1);
  }

  let umi, mplCore, umiCore;
  try {
    const umiBundleDefaults = await import("@metaplex-foundation/umi-bundle-defaults");
    mplCore = await import("@metaplex-foundation/mpl-core");
    umiCore = await import("@metaplex-foundation/umi");

    umi = umiBundleDefaults.createUmi(config.rpc).use(mplCore.mplCore());
    const secretKeyBytes = decodeBase58(secret.trim());
    const keypair = umi.eddsa.createKeypairFromSecretKey(secretKeyBytes);
    umi.use(umiCore.keypairIdentity(keypair));
  } catch (err) {
    fail("umi_init_failed", `Could not initialize Umi/mpl-core context: ${err.message}`, 3);
  }

  let collection;
  try {
    collection = await mplCore.fetchCollection(umi, umiCore.publicKey(dropRow.collectionAddress));
  } catch (err) {
    fail("collection_fetch_failed", `Could not fetch collection ${dropRow.collectionAddress}: ${err.message}`, 3);
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const wallet of toSend) {
    try {
      const assetSigner = umiCore.generateSigner(umi);

      const { signature: txSig } = await mplCore
        .create(umi, {
          asset: assetSigner,
          collection,
          name: dropRow.itemName || dropItemId,
          uri: dropRow.uri,
          owner: umiCore.publicKey(wallet),
        })
        .sendAndConfirm(umi);

      const signature = encodeBase58(Buffer.from(txSig));
      const assetAddress = assetSigner.publicKey.toString();

      appendAirdropHistory({
        date: new Date().toISOString(),
        dropItemId,
        wallet,
        assetAddress,
        signature,
        status: "success",
      });

      sentCount++;
      log({
        status: "info",
        dropItemId,
        wallet,
        assetAddress,
        signature,
        message: `Airdropped to ${wallet}`,
      });
    } catch (err) {
      failedCount++;
      appendAirdropHistory({
        date: new Date().toISOString(),
        dropItemId,
        wallet,
        assetAddress: "N/A",
        signature: "N/A",
        status: "failed",
      });
      log({
        status: "warning",
        dropItemId,
        wallet,
        reason: "blockchain_error",
        message: `Airdrop to ${wallet} failed: ${err.message}`,
      });
    }
  }

  log({
    status: failedCount === 0 ? "success" : "partial_failure",
    dropItemId,
    sent: sentCount,
    failed: failedCount,
    message:
      failedCount === 0
        ? `All ${sentCount} airdrop(s) sent successfully.`
        : `${sentCount} succeeded, ${failedCount} failed. Re-run the same command to retry only what's still outstanding.`,
  });

  process.exit(failedCount === 0 ? 0 : 3);
}

main().catch((err) => {
  log({ status: "failure", reason: "unhandled_error", message: err.message });
  process.exit(3);
});