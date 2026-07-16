#!/usr/bin/env node
/**
 * scripts/generate-metadata.js
 *
 * Step 1c (generate half) of the production pipeline: builds the
 * standard NFT metadata JSON for every drop in the active collection
 * and writes it to backend/metadata/<dropItemId>.json — deterministic
 * filenames, no timestamps or random IDs, so runs are reproducible and
 * diffable.
 *
 * This step does NOT upload anything. That's upload-metadata.js, which
 * reads the files this script produces.
 *
 * Guardrail: by default, a row whose itemImage is still a placeholder
 * (placehold.co / example.com) is SKIPPED rather than baked into a
 * metadata file — embedding a placeholder image URL into metadata that
 * later gets uploaded to Arweave permanently would be a structural,
 * unfixable mistake. Run upload-images.js first. Use --allow-placeholder
 * only for local dry-run/testing purposes.
 *
 * Idempotent: a metadata file is only regenerated if its content would
 * actually change (compared by hash), unless --force is passed. This
 * keeps deterministic-file-naming meaningful — untouched drops don't
 * get a new mtime/hash for no reason.
 *
 * Exit codes:
 *   0 = success (including "nothing changed")
 *   1 = validation failure (bad config, bad CSV, placeholder images
 *       under --strict, missing required CSV fields)
 *
 * Usage:
 *   node scripts/generate-metadata.js
 *   node scripts/generate-metadata.js --force
 *   node scripts/generate-metadata.js --strict            (fail if any image is still a placeholder)
 *   node scripts/generate-metadata.js --allow-placeholder  (generate anyway, for local testing only)
 *   node scripts/generate-metadata.js --slug founders
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// ---- Paths --------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(BACKEND_DIR, "config.json");
const MASTER_CSV_PATH = path.join(BACKEND_DIR, "master.csv");
const METADATA_DIR = path.join(BACKEND_DIR, "metadata");
const MANIFEST_PATH = path.join(METADATA_DIR, "manifest.json");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

// ---- Logging --------------------------------------------------------------

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "generate-metadata", ...event };
  const line = JSON.stringify(entry);
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, "generate-metadata.log"), line + "\n");
}

function fail(reason, message, exitCode) {
  log({ status: "failure", reason, message });
  process.exit(exitCode);
}

// ---- CSV helpers ----------------------------------------------------------

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
  if (!config.collectionSlug) {
    fail("incomplete_config", `config.json is missing required field: collectionSlug`, 1);
  }
  return config;
}

function isPlaceholder(url) {
  if (!url || url.trim() === "") return true;
  if (url.includes("placehold.co")) return true;
  if (url.includes("example.com")) return true;
  if (url.includes("AbCdEf") || url.includes("ImageHash")) return true;
  return false;
}

// ---- Attribute parsing ----------------------------------------------------
// "Series:Genesis|Tier:Core|Element:Fire" -> [{trait_type, value}, ...]

function parseAttributes(raw) {
  if (!raw || raw.trim() === "") return [];
  return raw
    .split("|")
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const idx = pair.indexOf(":");
      if (idx === -1) return { trait_type: pair, value: "" };
      return {
        trait_type: pair.slice(0, idx).trim(),
        value: pair.slice(idx + 1).trim(),
      };
    });
}

function guessMimeFromUrl(url) {
  const ext = path.extname(new URL(url, "https://placeholder.invalid").pathname).toLowerCase();
  const map = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };
  return map[ext] || "image/png";
}

// ---- Metadata builder -------------------------------------------------

function buildMetadata(row, config) {
  const attributes = parseAttributes(row.attributes);
  const sellerFeeBasisPoints = row.sellerFeeBasisPoints ? Number(row.sellerFeeBasisPoints) : 0;

  const metadata = {
    name: row.itemName || row.dropItemId,
    symbol: config.symbol || "",
    description: row.itemDescription || "",
    seller_fee_basis_points: Number.isFinite(sellerFeeBasisPoints) ? sellerFeeBasisPoints : 0,
    image: row.itemImage,
    external_url: row.itemExternalUrl || config.externalUrl || "",
    attributes,
    properties: {
      files: [
        {
          uri: row.itemImage,
          type: guessMimeFromUrl(row.itemImage),
        },
      ],
      category: "image",
    },
  };

  if (row.collectionName || row.collectionSlug) {
    metadata.collection = {
      name: row.collectionName || row.collectionSlug,
      family: row.collectionSlug,
    };
    // collectionAddress is written by deploy-collection.js. Include it once
    // it exists so marketplaces that read the off-chain JSON collection
    // field (rather than relying solely on the on-chain MPL Core grouping)
    // can still resolve it. Safe to omit — undefined until deployed.
    if (row.collectionAddress) {
      metadata.collection.address = row.collectionAddress;
    }
  }

  return metadata;
}

function hashContent(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

// ---- Main ---------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const strict = args.includes("--strict");
  const allowPlaceholder = args.includes("--allow-placeholder");
  const slugFlagIndex = args.indexOf("--slug");

  const config = loadConfig();
  const collectionSlug =
    slugFlagIndex !== -1 && args[slugFlagIndex + 1] ? args[slugFlagIndex + 1] : config.collectionSlug;

  log({ status: "start", collectionSlug, force, strict, allowPlaceholder });

  if (!fs.existsSync(METADATA_DIR)) {
    fs.mkdirSync(METADATA_DIR, { recursive: true });
  }

  const { rows } = readCsv(MASTER_CSV_PATH);
  if (rows.length === 0) {
    fail("empty_master_csv", "backend/master.csv has no data rows", 1);
  }

  const matchingRows = rows.filter((r) => r.collectionSlug === collectionSlug);
  if (matchingRows.length === 0) {
    fail("unknown_collection_slug", `No rows in master.csv match collectionSlug "${collectionSlug}"`, 1);
  }

  const manifest = fs.existsSync(MANIFEST_PATH) ? JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) : {};

  const results = { generated: [], unchanged: [], skippedPlaceholder: [] };

  for (const row of matchingRows) {
    const dropItemId = row.dropItemId;
    if (!dropItemId) continue;

    if (isPlaceholder(row.itemImage) && !allowPlaceholder) {
      results.skippedPlaceholder.push(dropItemId);
      log({
        status: "warning",
        dropItemId,
        message: `Skipped — itemImage is still a placeholder (${row.itemImage}). Run upload-images.js first.`,
      });
      continue;
    }

    const metadata = buildMetadata(row, config);
    const hash = hashContent(metadata);
    const filePath = path.join(METADATA_DIR, `${dropItemId}.json`);

    if (!force && manifest[dropItemId] === hash && fs.existsSync(filePath)) {
      results.unchanged.push(dropItemId);
      continue;
    }

    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), "utf8");
    manifest[dropItemId] = hash;
    results.generated.push(dropItemId);
    log({ status: "info", dropItemId, message: `Generated metadata/${dropItemId}.json` });
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");

  const summary = {
    collectionSlug,
    totalDrops: matchingRows.length,
    generated: results.generated.length,
    unchanged: results.unchanged.length,
    skippedPlaceholder: results.skippedPlaceholder.length,
  };

  log({ status: "summary", ...summary });

  console.log("\nMetadata generation summary for collection:", collectionSlug);
  console.log(`  Generated (new or changed): ${summary.generated}`);
  console.log(`  Unchanged (already up to date): ${summary.unchanged}`);
  if (summary.skippedPlaceholder > 0) {
    console.log(`  Skipped (image still placeholder): ${summary.skippedPlaceholder}`);
    results.skippedPlaceholder.forEach((id) => console.log(`    - ${id}`));
  }

  if (summary.skippedPlaceholder > 0 && strict) {
    fail(
      "images_not_ready",
      `${summary.skippedPlaceholder} drop(s) still have placeholder images. Run upload-images.js before generating metadata for them.`,
      1
    );
  }

  log({ status: "success", message: "Metadata generation complete." });
  process.exit(0);
}

main().catch((err) => {
  log({ status: "failure", reason: "unhandled_error", message: err.message });
  process.exit(1);
});