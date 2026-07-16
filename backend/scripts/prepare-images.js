#!/usr/bin/env node
/**
 * scripts/prepare-images.js
 *
 * Step 1 of the production pipeline: getting real NFT images into
 * backend/images/, replacing the placehold.co placeholders.
 *
 * This script does NOT upload to Arweave (that's upload-images.js).
 * It only handles the local step: confirming every drop for the
 * active collection (per config.json) has a real image file sitting
 * in backend/images/, optionally importing them from a staging folder.
 *
 * Modes:
 *   1. Report only (default) — scans backend/images/ against
 *      master.csv and tells you what's ready vs still missing.
 *   2. Import (--source <dir>) — copies matching files from a staging
 *      folder into backend/images/, named by dropItemId, validating
 *      each file is a real image (not zero-byte, not corrupt) before
 *      copying. Existing files in backend/images/ are not overwritten
 *      unless --force is passed (idempotent by default).
 *
 * Exit codes:
 *   0 = success (all images ready, or report completed with no --strict)
 *   1 = validation failure (bad config, bad CSV, missing/invalid images
 *       under --strict, corrupt source image, missing source dir)
 *
 * Usage:
 *   node scripts/prepare-images.js
 *   node scripts/prepare-images.js --source ./incoming-images
 *   node scripts/prepare-images.js --source ./incoming-images --force
 *   node scripts/prepare-images.js --strict
 *   node scripts/prepare-images.js --slug founders   (override config.json's collectionSlug)
 */

"use strict";

const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// ---- Paths --------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const CONFIG_PATH = path.join(BACKEND_DIR, "config.json");
const MASTER_CSV_PATH = path.join(BACKEND_DIR, "master.csv");
const IMAGES_DIR = path.join(BACKEND_DIR, "images");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

// ---- Logging --------------------------------------------------------------

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "prepare-images", ...event };
  const line = JSON.stringify(entry);
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, "prepare-images.log"), line + "\n");
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

// ---- Image validation (magic-byte sniffing, no external deps) -----------

function detectImageType(buffer) {
  if (buffer.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "png";
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }

  // GIF: 47 49 46 38 (GIF8)
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "gif";
  }

  // WEBP: "RIFF"...."WEBP"
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "webp";
  }

  return null;
}

function validateImageFile(filePath) {
  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    return { valid: false, reason: "zero_byte_file" };
  }
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(16);
  fs.readSync(fd, buffer, 0, 16, 0);
  fs.closeSync(fd);
  const type = detectImageType(buffer);
  if (!type) {
    return { valid: false, reason: "unrecognized_image_format" };
  }
  return { valid: true, type, sizeBytes: stats.size };
}

// ---- Finding a source file for a dropItemId in a staging folder ----------

function findSourceFile(sourceDir, dropItemId) {
  const entries = fs.readdirSync(sourceDir);
  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase();
    const base = path.basename(entry, ext);
    if (base === dropItemId && ALLOWED_EXTENSIONS.includes(ext)) {
      return path.join(sourceDir, entry);
    }
  }
  return null;
}

function findExistingImage(dropItemId) {
  if (!fs.existsSync(IMAGES_DIR)) return null;
  const entries = fs.readdirSync(IMAGES_DIR);
  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase();
    const base = path.basename(entry, ext);
    if (base === dropItemId && ALLOWED_EXTENSIONS.includes(ext)) {
      return path.join(IMAGES_DIR, entry);
    }
  }
  return null;
}

// ---- Main ---------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const sourceFlagIndex = args.indexOf("--source");
  const sourceDir =
    sourceFlagIndex !== -1 && args[sourceFlagIndex + 1] ? path.resolve(args[sourceFlagIndex + 1]) : null;
  const force = args.includes("--force");
  const strict = args.includes("--strict");
  const slugFlagIndex = args.indexOf("--slug");

  const config = loadConfig();
  const collectionSlug =
    slugFlagIndex !== -1 && args[slugFlagIndex + 1] ? args[slugFlagIndex + 1] : config.collectionSlug;

  log({ status: "start", collectionSlug, sourceDir: sourceDir || "(none — report only)", force, strict });

  if (sourceDir && !fs.existsSync(sourceDir)) {
    fail("missing_source_dir", `--source directory not found: ${sourceDir}`, 1);
  }

  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    log({ status: "info", message: `Created backend/images/ (did not previously exist)` });
  }

  const { rows } = readCsv(MASTER_CSV_PATH);
  if (rows.length === 0) {
    fail("empty_master_csv", "backend/master.csv has no data rows", 1);
  }

  const matchingRows = rows.filter((r) => r.collectionSlug === collectionSlug);
  if (matchingRows.length === 0) {
    fail("unknown_collection_slug", `No rows in master.csv match collectionSlug "${collectionSlug}"`, 1);
  }

  const results = {
    ready: [],       // already had a valid local image, nothing to do
    imported: [],    // copied from --source this run
    skippedExisting: [], // --source had a file but one already exists and --force not set
    invalidSource: [],   // --source had a file but it failed image validation
    missing: [],     // no local image and nothing found in --source
  };

  for (const row of matchingRows) {
    const dropItemId = row.dropItemId;
    if (!dropItemId) continue;

    const existing = findExistingImage(dropItemId);

    if (sourceDir) {
      const sourceFile = findSourceFile(sourceDir, dropItemId);

      if (sourceFile) {
        if (existing && !force) {
          results.skippedExisting.push({ dropItemId, existing: path.basename(existing) });
          continue;
        }

        const validation = validateImageFile(sourceFile);
        if (!validation.valid) {
          results.invalidSource.push({ dropItemId, file: path.basename(sourceFile), reason: validation.reason });
          log({
            status: "warning",
            dropItemId,
            reason: validation.reason,
            message: `Source file for ${dropItemId} failed validation: ${validation.reason}`,
          });
          continue;
        }

        const destExt = "." + validation.type;
        const destPath = path.join(IMAGES_DIR, dropItemId + destExt);

        // Remove a differently-extensioned existing file to avoid duplicates
        // (e.g. replacing OE-001.jpg with OE-001.png)
        if (existing && existing !== destPath) {
          fs.unlinkSync(existing);
        }

        fs.copyFileSync(sourceFile, destPath);
        results.imported.push({ dropItemId, file: path.basename(destPath), sizeBytes: validation.sizeBytes });
        log({
          status: "info",
          dropItemId,
          message: `Imported ${path.basename(sourceFile)} -> images/${path.basename(destPath)}`,
        });
        continue;
      }
    }

    if (existing) {
      const validation = validateImageFile(existing);
      if (validation.valid) {
        results.ready.push({ dropItemId, file: path.basename(existing) });
      } else {
        results.invalidSource.push({ dropItemId, file: path.basename(existing), reason: validation.reason });
        log({
          status: "warning",
          dropItemId,
          reason: validation.reason,
          message: `Existing image for ${dropItemId} failed validation: ${validation.reason}`,
        });
      }
    } else {
      results.missing.push({ dropItemId });
    }
  }

  const summary = {
    collectionSlug,
    totalDrops: matchingRows.length,
    ready: results.ready.length,
    imported: results.imported.length,
    skippedExisting: results.skippedExisting.length,
    invalidSource: results.invalidSource.length,
    missing: results.missing.length,
  };

  log({ status: "summary", ...summary });

  console.log("\nImage preparation summary for collection:", collectionSlug);
  console.log(`  Ready (valid image already in backend/images/): ${summary.ready}`);
  console.log(`  Imported from --source this run:                ${summary.imported}`);
  if (summary.skippedExisting > 0) {
    console.log(`  Skipped (already exists, use --force to replace): ${summary.skippedExisting}`);
  }
  if (summary.invalidSource > 0) {
    console.log(`  Invalid files (zero-byte or unrecognized format):  ${summary.invalidSource}`);
    results.invalidSource.forEach((r) =>
      console.log(`    - ${r.dropItemId}: ${r.file} (${r.reason})`)
    );
  }
  if (summary.missing > 0) {
    console.log(`  Missing (no local image, none found in --source): ${summary.missing}`);
    results.missing.forEach((r) => console.log(`    - ${r.dropItemId}`));
  }

  const blocking = summary.missing + summary.invalidSource;

  if (blocking > 0) {
    if (strict) {
      fail(
        "images_incomplete",
        `${blocking} drop(s) in "${collectionSlug}" do not have a valid real image. Run with --source pointing at your image folder, or add files directly to backend/images/.`,
        1
      );
    } else {
      log({
        status: "warning",
        message: `${blocking} drop(s) still missing/invalid images. Re-run with --strict to make this a hard failure once ready to enforce it.`,
      });
    }
  } else {
    log({ status: "success", message: `All ${summary.totalDrops} drop(s) in "${collectionSlug}" have valid local images.` });
  }

  process.exit(0);
}

main().catch((err) => {
  log({ status: "failure", reason: "unhandled_error", message: err.message });
  process.exit(1);
});