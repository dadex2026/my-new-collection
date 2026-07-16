#!/usr/bin/env node
/**
 * scripts/upload-images.js
 *
 * Step 1b of the production pipeline: uploads the real local images in
 * backend/images/ (prepared by prepare-images.js) to Arweave via Irys,
 * and writes the resulting permanent URLs into master.csv's itemImage
 * column, replacing the placehold.co placeholders.
 *
 * Idempotent: a row is skipped if its itemImage is already a real,
 * non-placeholder URL. Re-running this script after a partial run or a
 * crash only uploads what's still outstanding — nothing already
 * uploaded is re-uploaded or re-paid for.
 *
 * Network comes from backend/config.json ("devnet" or "mainnet"), not
 * a hardcoded .devnet()/.mainnet() call — so switching networks is a
 * one-line edit to config.json, not a code change.
 *
 * Exit codes:
 *   0 = success (including "nothing to do, already uploaded")
 *   1 = validation failure (bad config, bad CSV, missing local image
 *       under --strict, missing env)
 *   2 = upload failure (Irys/Arweave error, insufficient balance, etc.)
 *
 * Usage:
 *   node scripts/upload-images.js
 *   node scripts/upload-images.js --fund         (auto-fund any shortfall before uploading)
 *   node scripts/upload-images.js --strict       (fail if any drop has no local image)
 *   node scripts/upload-images.js --dry-run      (simulate the whole run, no network calls)
 *   node scripts/upload-images.js --slug founders (override config.json's collectionSlug)
 *
 * Dependencies (npm install):
 *   @irys/upload
 *   @irys/upload-solana
 *   dotenv
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env.admin") });

// ---- Paths --------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(BACKEND_DIR, "config.json");
const MASTER_CSV_PATH = path.join(BACKEND_DIR, "master.csv");
const IMAGES_DIR = path.join(BACKEND_DIR, "images");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

const MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
const SUPPORTED_EXTENSIONS = Object.keys(MIME_TYPES);

// ---- Logging --------------------------------------------------------------

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "upload-images", ...event };
  const line = JSON.stringify(entry);
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, "upload-images.log"), line + "\n");
}

function fail(reason, message, exitCode) {
  log({ status: "failure", reason, message });
  process.exit(exitCode);
}

// ---- CSV helpers (same format as the rest of the pipeline) ---------------

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

// ---- Config validation ----------------------------------------------------

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
  const required = ["collectionSlug", "network"];
  const missing = required.filter((key) => !config[key]);
  if (missing.length > 0) {
    fail("incomplete_config", `config.json is missing required field(s): ${missing.join(", ")}`, 1);
  }
  if (!["devnet", "mainnet"].includes(config.network)) {
    fail("invalid_network", `config.json "network" must be "devnet" or "mainnet", got "${config.network}"`, 1);
  }
  return config;
}

// isPlaceholder, not isUploaded: treat anything that isn't a known
// placeholder pattern as "already real" rather than matching against a
// specific list of gateway hostnames. This is more robust to gateway/URL
// changes over the life of the template.
function isPlaceholder(url) {
  if (!url || url.trim() === "") return true;
  if (url.includes("placehold.co")) return true;
  if (url.includes("example.com")) return true;
  if (url.includes("AbCdEf") || url.includes("ImageHash")) return true;
  return false;
}

function findLocalImage(dropItemId) {
  for (const ext of SUPPORTED_EXTENSIONS) {
    const filePath = path.join(IMAGES_DIR, `${dropItemId}${ext}`);
    if (fs.existsSync(filePath)) return { filePath, mimeType: MIME_TYPES[ext] };
  }
  return null;
}

// ---- Irys setup (verified against @irys/upload + @irys/upload-solana) ---
// Builder pattern: Uploader(Solana).withWallet(key).withRpc(rpc).devnet()/.mainnet()

async function getIrysUploader(network) {
  const { Uploader } = await import("@irys/upload");
  const { Solana } = await import("@irys/upload-solana");

  const secret = process.env.DEPLOYER_PRIVATE_KEY;
  if (!secret) {
    fail("missing_deployer_key", "DEPLOYER_PRIVATE_KEY not set in backend/.env.admin", 1);
  }

  const rpc =
    network === "devnet"
      ? process.env.SOLANA_RPC_URL_DEVNET || "https://api.devnet.solana.com"
      : process.env.SOLANA_RPC_URL;

  let builder = Uploader(Solana).withWallet(secret.trim()).withRpc(rpc);
  builder = network === "devnet" ? builder.devnet() : builder.mainnet();

  return builder;
}

async function ensureFunded(irys, totalBytes, autoFund) {
  const price = await irys.getPrice(totalBytes);
  const balance = await irys.getLoadedBalance();

  if (balance.isGreaterThanOrEqualTo(price)) {
    return { funded: true, price: price.toString(), balance: balance.toString() };
  }
  if (!autoFund) {
    return { funded: false, price: price.toString(), balance: balance.toString() };
  }
  const shortfall = price.minus(balance);
  await irys.fund(shortfall);
  return { funded: true, price: price.toString(), balance: balance.toString(), topUp: shortfall.toString() };
}

// ---- Dry-run helper --------------------------------------------------

function fakeUploadId(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 43);
}

// ---- Main ---------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const autoFund = args.includes("--fund");
  const strict = args.includes("--strict");
  const dryRun = args.includes("--dry-run");
  const slugFlagIndex = args.indexOf("--slug");

  const config = loadConfig();
  const collectionSlug =
    slugFlagIndex !== -1 && args[slugFlagIndex + 1] ? args[slugFlagIndex + 1] : config.collectionSlug;

  log({ status: "start", collectionSlug, network: config.network, autoFund, strict, dryRun });

  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    log({ status: "info", message: "Created backend/images/ — add image files and re-run." });
    process.exit(0);
  }

  const { header, rows } = readCsv(MASTER_CSV_PATH);
  if (rows.length === 0) {
    fail("empty_master_csv", "backend/master.csv has no data rows", 1);
  }
  if (!header.includes("itemImage")) {
    fail("missing_column", "master.csv is missing the itemImage column", 1);
  }

  const matchingRows = rows.filter((r) => r.collectionSlug === collectionSlug);
  if (matchingRows.length === 0) {
    fail("unknown_collection_slug", `No rows in master.csv match collectionSlug "${collectionSlug}"`, 1);
  }

  // ---- Figure out what actually needs uploading -------------------------
  const toUpload = [];
  const alreadyUploaded = [];
  const missingLocal = [];

  for (const row of matchingRows) {
    const dropItemId = row.dropItemId;
    if (!dropItemId) continue;

    if (!isPlaceholder(row.itemImage)) {
      alreadyUploaded.push(dropItemId);
      continue;
    }

    const local = findLocalImage(dropItemId);
    if (!local) {
      missingLocal.push(dropItemId);
      continue;
    }

    toUpload.push({ row, dropItemId, ...local });
  }

  log({
    status: "plan",
    totalDrops: matchingRows.length,
    alreadyUploaded: alreadyUploaded.length,
    toUpload: toUpload.length,
    missingLocal: missingLocal.length,
  });

  if (missingLocal.length > 0) {
    const message = `${missingLocal.length} drop(s) have no local image in backend/images/: ${missingLocal.join(", ")}. Run prepare-images.js first.`;
    if (strict) {
      fail("images_incomplete", message, 1);
    }
    log({ status: "warning", message });
  }

  if (toUpload.length === 0) {
    log({ status: "success", message: "Nothing to upload — all drops already have a real image URL or no local image is available." });
    process.exit(0);
  }

  // ---- Dry run: simulate without touching the network --------------------
  if (dryRun) {
    for (const item of toUpload) {
      const fakeId = fakeUploadId(item.filePath);
      const fakeUrl = `https://gateway.irys.xyz/${fakeId}`;
      item.row.itemImage = fakeUrl;
      log({
        status: "info",
        dropItemId: item.dropItemId,
        message: `[dry-run] Would upload ${path.basename(item.filePath)} -> ${fakeUrl}`,
      });
    }
    writeCsv(MASTER_CSV_PATH, header, rows);
    log({
      status: "success",
      message: `[dry-run] Simulated ${toUpload.length} upload(s). master.csv updated with fake URLs — do not deploy real metadata from this.`,
    });
    process.exit(0);
  }

  // ---- Real upload --------------------------------------------------------
  let irys;
  try {
    irys = await getIrysUploader(config.network);
  } catch (err) {
    fail("irys_init_failed", `Could not initialize Irys uploader: ${err.message}`, 2);
  }

  const totalBytes = toUpload.reduce((sum, item) => sum + fs.statSync(item.filePath).size, 0);

  let fundingStatus;
  try {
    fundingStatus = await ensureFunded(irys, totalBytes, autoFund);
  } catch (err) {
    fail("funding_check_failed", `Could not check/fund Irys balance: ${err.message}`, 2);
  }

  if (!fundingStatus.funded) {
    fail(
      "insufficient_balance",
      `Irys balance (${fundingStatus.balance}) is less than the required price (${fundingStatus.price}) for ${totalBytes} bytes. Re-run with --fund to top up automatically, or fund manually.`,
      2
    );
  }

  log({ status: "info", message: "Funding confirmed.", ...fundingStatus });

  let uploadedCount = 0;
  let failedCount = 0;

  for (const item of toUpload) {
    try {
      const receipt = await irys.uploadFile(item.filePath, {
        tags: [{ name: "Content-Type", value: item.mimeType }],
      });
      const url = `https://gateway.irys.xyz/${receipt.id}`;
      item.row.itemImage = url;

      // Save after every single upload so a crash mid-run loses nothing
      // already paid for and confirmed.
      writeCsv(MASTER_CSV_PATH, header, rows);

      uploadedCount++;
      log({
        status: "info",
        dropItemId: item.dropItemId,
        message: `Uploaded ${path.basename(item.filePath)} -> ${url}`,
        transactionId: receipt.id,
      });
    } catch (err) {
      failedCount++;
      log({
        status: "warning",
        dropItemId: item.dropItemId,
        reason: "upload_failed",
        message: `Upload failed for ${item.dropItemId}: ${err.message}`,
      });
    }
  }

  log({
    status: failedCount === 0 ? "success" : "partial_failure",
    collectionSlug,
    network: config.network,
    uploaded: uploadedCount,
    failed: failedCount,
    message:
      failedCount === 0
        ? `All ${uploadedCount} image(s) uploaded and master.csv updated.`
        : `${uploadedCount} succeeded, ${failedCount} failed. Re-run this script to retry only the failed ones (already-uploaded rows are skipped).`,
  });

  process.exit(failedCount === 0 ? 0 : 2);
}

main().catch((err) => {
  log({ status: "failure", reason: "unhandled_error", message: err.message });
  process.exit(2);
});