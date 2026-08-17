#!/usr/bin/env node
/**
 * scripts/deploy-collection.js
 *
 * Deploys a Metaplex Core collection on-chain for the collectionSlug
 * defined in backend/config.json, using the treasury/network/rpc also
 * defined there. Writes the resulting collectionAddress back into
 * master.csv for every drop row belonging to that collection.
 *
 * Idempotent: if every row for this collectionSlug already has a
 * collectionAddress recorded for the CURRENT network, the script skips
 * on-chain work entirely. Network + slug together are the identity key,
 * so a devnet deploy and a later mainnet deploy of the same slug do not
 * collide with each other.
 *
 * Exit codes:
 *   0 = success (including "already deployed, nothing to do")
 *   1 = validation failure (bad config, bad CSV, missing env)
 *   2 = upload failure (unused here, reserved for upload scripts)
 *   3 = blockchain failure (RPC error, transaction failure, etc.)
 *
 * Usage:
 *   node scripts/deploy-collection.js
 *   node scripts/deploy-collection.js --slug founders   (override config.json's collectionSlug)
 *
 * Dependencies (npm install):
 *   @metaplex-foundation/umi
 *   @metaplex-foundation/umi-bundle-defaults
 *   @metaplex-foundation/mpl-core
 *   dotenv
 * (No bs58 dependency — base58 decoding is done inline below.)
 */

"use strict";

const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env.admin") });

// ---- Paths --------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(BACKEND_DIR, "config.json");
const MASTER_CSV_PATH = path.join(BACKEND_DIR, "master.csv");
const DEPLOYMENT_HISTORY_PATH = path.join(BACKEND_DIR, "deployment-history.csv");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

// ---- Logging --------------------------------------------------------------

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "deploy-collection", ...event };
  const line = JSON.stringify(entry);
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, "deploy-collection.log"), line + "\n");
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
// Lightweight parser matching the template's existing CSV format
// (plain comma-separated, no embedded commas within fields).

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return { header: [], rows: [] };
  const raw = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row = {};
    header.forEach((key, i) => {
      row[key] = cols[i] !== undefined ? cols[i].trim() : "";
    });
    return row;
  });
  return { header, rows };
}

function writeCsv(filePath, header, rows) {
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(header.map((key) => (row[key] !== undefined ? row[key] : "")).join(","));
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

// ---- Config / env validation -------------------------------------------

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

  const required = ["collectionSlug", "network", "rpc", "treasury", "price"];
  const missing = required.filter((key) => !config[key] && config[key] !== 0);
  if (missing.length > 0) {
    fail("incomplete_config", `config.json is missing required field(s): ${missing.join(", ")}`, 1);
  }

  if (!["devnet", "mainnet"].includes(config.network)) {
    fail("invalid_network", `config.json "network" must be "devnet" or "mainnet", got "${config.network}"`, 1);
  }

  return config;
}

function validateTreasury(config) {
  // Base58, 32-44 chars is the loose shape of a Solana public key.
  const pattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  if (!pattern.test(config.treasury)) {
    fail("invalid_treasury", `config.json "treasury" does not look like a valid Solana address: ${config.treasury}`, 1);
  }
}

function isPlaceholder(url) {
  if (!url || url.trim() === "") return true;
  if (url.includes("placehold.co")) return true;
  if (url.includes("example.com")) return true;
  return false;
}

// ---- Umi setup (dynamic import — these packages are ESM-only) -----------

async function getUmi(rpc) {
  const { createUmi } = await import("@metaplex-foundation/umi-bundle-defaults");
  const { mplCore } = await import("@metaplex-foundation/mpl-core");
  const { keypairIdentity } = await import("@metaplex-foundation/umi");

  const umi = createUmi(rpc).use(mplCore());

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

  umi.use(keypairIdentity(keypair));
  return umi;
}

// ---- Main ---------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const slugFlagIndex = args.indexOf("--slug");
  const config = loadConfig();
  const collectionSlug =
    slugFlagIndex !== -1 && args[slugFlagIndex + 1] ? args[slugFlagIndex + 1] : config.collectionSlug;

  validateTreasury(config);

  log({ status: "start", collectionSlug, network: config.network, rpc: config.rpc });

  if (config.network === "mainnet") {
    log({ status: "info", message: "Deploying to MAINNET — this costs real SOL. 5 second window to cancel (Ctrl+C)." });
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  const { header, rows } = readCsv(MASTER_CSV_PATH);
  if (rows.length === 0) {
    fail("empty_master_csv", "backend/master.csv has no data rows", 1);
  }
  if (!header.includes("collectionAddress")) {
    header.push("collectionAddress");
    rows.forEach((r) => { r.collectionAddress = ""; });
    log({ status: "info", message: "Added collectionAddress column to master.csv header" });
  }
  if (!header.includes("network")) {
    header.push("network");
    rows.forEach((r) => { r.network = ""; });
    log({ status: "info", message: "Added network column to master.csv header" });
  }

  const matchingRows = rows.filter((r) => r.collectionSlug === collectionSlug);
  if (matchingRows.length === 0) {
    fail("unknown_collection_slug", `No rows in master.csv match collectionSlug "${collectionSlug}"`, 1);
  }

  // ---- Idempotency check: slug + network together are the identity key ----
  const alreadyDeployed = matchingRows.every(
    (r) => r.collectionAddress && r.collectionAddress.length > 0 && r.network === config.network
  );

  if (alreadyDeployed) {
    log({
      status: "skipped",
      reason: "already_deployed",
      collectionSlug,
      network: config.network,
      collectionAddress: matchingRows[0].collectionAddress,
      message: "Collection already has an address recorded for this network. No on-chain action taken.",
    });
    process.exit(0);
  }

  const firstRow = matchingRows[0];
  if (isPlaceholder(firstRow.collectionImage)) {
    log({
      status: "info",
      message: `Collection image for "${collectionSlug}" is still a placeholder (${firstRow.collectionImage}). Deploying anyway — image can be updated later.`,
    });
  }

  // ---- Royalty enforcement (Metaplex Core Royalties plugin) --------------
  // Royalties are a COLLECTION-level plugin, not a per-drop setting, even
  // though sellerFeeBasisPoints lives per-row in master.csv. If rows in
  // this collection disagree on the value, that's a real ambiguity (same
  // class of problem as treasurySplits) — warn loudly and use the first
  // row's value rather than silently picking one with no visibility.
  const basisPointValues = [...new Set(matchingRows.map((r) => Number(r.sellerFeeBasisPoints) || 0))];
  if (basisPointValues.length > 1) {
    log({
      status: "warning",
      message: `Rows in "${collectionSlug}" specify different sellerFeeBasisPoints values (${basisPointValues.join(", ")}). Royalties are collection-wide in Metaplex Core — using ${basisPointValues[0]} from the first row. Make these consistent across all rows in this collection if that's not intended.`,
    });
  }
  const royaltyBasisPoints = basisPointValues[0] || 0;

  // ---- Deploy ---------------------------------------------------------
  let signature;
  let collectionAddress;
  try {
    const umi = await getUmi(config.rpc);
    const { generateSigner, publicKey: umiPublicKey } = await import("@metaplex-foundation/umi");
    const { createCollection } = await import("@metaplex-foundation/mpl-core");

    const collectionSigner = generateSigner(umi);

    // Only attach the Royalties plugin if a real basis-points value is
    // configured — a 0% collection just skips it rather than deploying
    // a meaningless enforced-zero-royalty plugin.
    const plugins = [];
    if (royaltyBasisPoints > 0) {
      plugins.push({
        type: "Royalties",
        basisPoints: royaltyBasisPoints,
        // Single-recipient default: 100% of the royalty goes to the
        // configured treasury. Verified shape requires percentages to
        // sum to 100 across all listed creators.
        creators: [{ address: umiPublicKey(config.treasury), percentage: 100 }],
        // 'None' = no marketplace allow/deny-list restriction — royalty
        // is declared and enforced by the Core program itself regardless
        // of which marketplace the trade happens on. This is the
        // permissive, broadly-compatible default; a stricter ruleSet can
        // be substituted later if you specifically need to block trades
        // on marketplaces that don't honor royalties.
        ruleSet: { type: "None" },
      });
      log({
        status: "info",
        message: `Attaching Royalties plugin: ${royaltyBasisPoints} basis points (${(royaltyBasisPoints / 100).toFixed(2)}%) to ${config.treasury}`,
      });
    } else {
      log({ status: "info", message: "sellerFeeBasisPoints is 0 — no Royalties plugin attached." });
    }

    const { signature: txSig } = await createCollection(umi, {
      collection: collectionSigner,
      name: firstRow.collectionName || collectionSlug,
      uri: firstRow.collectionImage || "",
      updateAuthority: umi.identity.publicKey,
      plugins,
    }).sendAndConfirm(umi);

    signature = encodeBase58(Buffer.from(txSig));
    collectionAddress = collectionSigner.publicKey.toString();
  } catch (err) {
    log({
      status: "failure",
      reason: "blockchain_error",
      collectionSlug,
      network: config.network,
      message: err.message,
    });
    appendDeploymentHistory({
      collection: collectionSlug,
      date: new Date().toISOString(),
      network: config.network,
      signature: "N/A",
      status: "failed",
    });
    process.exit(3);
  }

  // ---- Persist results (saved immediately so a later crash doesn't lose this) ----
  for (const row of rows) {
    if (row.collectionSlug === collectionSlug) {
      row.collectionAddress = collectionAddress;
      row.network = config.network;
    }
  }
  writeCsv(MASTER_CSV_PATH, header, rows);

  appendDeploymentHistory({
    collection: collectionSlug,
    date: new Date().toISOString(),
    network: config.network,
    signature,
    status: "success",
  });

  log({
    status: "success",
    collectionSlug,
    network: config.network,
    collectionAddress,
    signature,
    solscan: `https://solscan.io/tx/${signature}?cluster=${config.network === "mainnet" ? "mainnet-beta" : "devnet"}`,
    message: "Collection deployed and master.csv updated.",
  });

  process.exit(0);
}

main().catch((err) => {
  log({ status: "failure", reason: "unhandled_error", message: err.message });
  process.exit(3);
});