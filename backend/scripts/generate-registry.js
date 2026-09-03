#!/usr/bin/env node
/**
 * scripts/generate-registry.js
 *
 * Replaces server.js's GET /registry. Produces a static registry.json
 * from master.csv that the frontend fetches directly — no backend
 * involved at request time. Run this after any master.csv change
 * (new drops, new deploys) and re-deploy/re-upload the frontend, or
 * point your static host at wherever this file lands.
 *
 * Unlike the pipeline scripts (deploy-collection.js, upload-images.js,
 * etc.), this one is NOT scoped to config.json's collectionSlug — the
 * frontend needs every collection in master.csv at once (the sidebar
 * lists "All Collections"), the same way the old server.js served
 * everything regardless of which collection a pipeline run targeted.
 *
 * Minted counts: a Candy Machine's redemption count lives on-chain
 * (itemsRedeemed), not in a local file. This script can optionally
 * fetch a SNAPSHOT of that count per drop with --fetch-minted, but a
 * static JSON file is only ever as fresh as its last generation — for
 * truly live counts, the frontend should query the candy machine account
 * directly at page load rather than trust this snapshot for anything
 * time-sensitive (e.g. "is this sold out right now").
 *
 * Exit codes:
 *   0 = success
 *   1 = validation failure (bad CSV)
 *
 * Usage:
 *   node scripts/generate-registry.js
 *   node scripts/generate-registry.js --fetch-minted        (slower: one RPC call per deployed drop)
 *   node scripts/generate-registry.js --out ../frontend/public/registry.json
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { parseCsvRecords, serializeRow } = require("./lib/csv");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// ---- Paths --------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const MASTER_CSV_PATH = path.join(BACKEND_DIR, "master.csv");
const DEFAULT_OUTPUT_PATH = path.join(BACKEND_DIR, "registry.json");
const FRONTEND_PUBLIC_PATH = path.join(BACKEND_DIR, "..", "frontend", "public", "registry.json");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

// ---- Logging --------------------------------------------------------------

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "generate-registry", ...event };
  const line = JSON.stringify(entry);
  console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, "generate-registry.log"), line + "\n");
}

function fail(reason, message, exitCode) {
  log({ status: "failure", reason, message });
  process.exit(exitCode);
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

// ---- Field parsing (same conventions as the old server.js) ---------------

function parseAttributes(attrString) {
  if (!attrString || attrString.trim() === "") return [];
  return attrString.split("|").map((pair) => {
    const idx = pair.indexOf(":");
    if (idx === -1) return { trait_type: pair.trim(), value: "" };
    return {
      trait_type: pair.slice(0, idx).trim(),
      value: pair.slice(idx + 1).trim(),
    };
  });
}

function parseMaxSupply(value) {
  // Display value only — null means "Unlimited" in the UI. The actual
  // on-chain itemsAvailable sentinel used by deploy-candy-machine.js
  // for unlimited drops is an implementation detail that doesn't need
  // to round-trip back into the registry.
  if (!value || value.trim().toLowerCase() === "unlimited") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function isPlaceholder(url) {
  if (!url || url.trim() === "") return true;
  if (url.includes("placehold.co")) return true;
  if (url.includes("example.com")) return true;
  if (url.includes("AbCdEf") || url.includes("ImageHash")) return true;
  return false;
}

// ---- Live minted-count snapshot (optional, --fetch-minted) ---------------

async function fetchMintedSnapshot(drops) {
  const mplCandyMachine = await import("@metaplex-foundation/mpl-core-candy-machine");
  const umiBundleDefaults = await import("@metaplex-foundation/umi-bundle-defaults");
  const umiCore = await import("@metaplex-foundation/umi");

  const rpcByNetwork = {
    devnet: process.env.SOLANA_RPC_URL_DEVNET || "https://api.devnet.solana.com",
    mainnet: process.env.SOLANA_RPC_URL,
  };

  const umiByNetwork = {};
  function getUmiFor(network) {
    if (!umiByNetwork[network]) {
      const rpc = rpcByNetwork[network];
      if (!rpc) return null;
      umiByNetwork[network] = umiBundleDefaults.createUmi(rpc).use(mplCandyMachine.mplCandyMachine());
    }
    return umiByNetwork[network];
  }

  let fetched = 0;
  let failed = 0;

  for (const drop of Object.values(drops)) {
    if (!drop.candyMachineAddress || !drop.network) continue;

    const umi = getUmiFor(drop.network);
    if (!umi) {
      log({ status: "warning", dropItemId: drop.dropItemId, message: `No RPC configured for network "${drop.network}" — skipping minted snapshot.` });
      continue;
    }

    try {
      const account = await mplCandyMachine.safeFetchCandyMachine(umi, umiCore.publicKey(drop.candyMachineAddress));
      if (account) {
        drop.minted = Number(account.itemsRedeemed);
        fetched++;
      } else {
        log({ status: "warning", dropItemId: drop.dropItemId, message: "Candy machine account not found on-chain yet." });
      }
    } catch (err) {
      failed++;
      log({ status: "warning", dropItemId: drop.dropItemId, message: `Could not fetch minted count: ${err.message}` });
    }
  }

  log({ status: "info", message: `Minted snapshot: ${fetched} fetched, ${failed} failed.` });
}

// ---- Main ---------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const fetchMinted = args.includes("--fetch-minted");
  const outFlagIndex = args.indexOf("--out");
  const outputPath = outFlagIndex !== -1 && args[outFlagIndex + 1] ? path.resolve(args[outFlagIndex + 1]) : DEFAULT_OUTPUT_PATH;

  log({ status: "start", fetchMinted, outputPath });

  const { rows } = readCsv(MASTER_CSV_PATH);
  if (rows.length === 0) {
    log({
      status: "info",
      message: "master.csv has no data rows (header only) — writing an empty registry. This is expected for a freshly reset template, not an error.",
    });
  }

  const collections = {};
  const drops = {};

  for (const row of rows) {
    const slug = row.collectionSlug;
    if (slug && !collections[slug]) {
      collections[slug] = {
        slug,
        name: row.collectionName,
        description: row.collectionDescription,
        image: row.collectionImage,
        externalUrl: row.collectionExternalUrl,
        collectionAddress: row.collectionAddress || "",
      };
    }
    // Backfill collectionAddress in case the collection's first-seen row
    // didn't have it yet but a later row for the same slug does.
    if (slug && row.collectionAddress && !collections[slug].collectionAddress) {
      collections[slug].collectionAddress = row.collectionAddress;
    }

    const dropId = row.dropItemId;
    if (!dropId) continue;

    drops[dropId] = {
      collectionKey: slug,
      dropItemId: dropId,
      itemName: row.itemName,
      itemDescription: row.itemDescription,
      itemImage: row.itemImage,
      itemExternalUrl: row.itemExternalUrl,
      sellerFeeBasisPoints: Number(row.sellerFeeBasisPoints) || 0,
      attributes: parseAttributes(row.attributes),
      maxSupply: parseMaxSupply(row.maxSupply),
      price: Number(row.price) || 0,
      status: row.mintStatus,
      uri: isPlaceholder(row.uri) ? "" : row.uri,
      collectionAddress: row.collectionAddress || "",
      candyMachineAddress: row.candyMachineAddress || "",
      treasury: row.treasury || "",
      network: row.network || "",
      // Set only for drops whose candy machine has a `holder` guard group.
      // The frontend uses its PRESENCE to decide whether to look for a
      // voucher at all: empty means "this drop has no holder route", and
      // mint.ts then omits the group parameter entirely rather than
      // guessing a label the machine does not have.
      holderRequiredCollection: row.holderRequiredCollection || "",
      holderPrice: row.holderPrice ? Number(row.holderPrice) : null,
      minted: null, // populated below if --fetch-minted, otherwise unknown — frontend should treat null as "check on-chain"
    };
  }

  const readyCount = Object.values(drops).filter((d) => d.candyMachineAddress).length;
  log({
    status: "plan",
    totalCollections: Object.keys(collections).length,
    totalDrops: Object.keys(drops).length,
    dropsWithCandyMachine: readyCount,
  });

  if (fetchMinted) {
    await fetchMintedSnapshot(drops);
  }

  const registry = {
    generatedAt: new Date().toISOString(),
    collections,
    drops,
  };

  fs.writeFileSync(outputPath, JSON.stringify(registry, null, 2), "utf8");
  log({ status: "info", message: `Wrote registry to ${outputPath}` });

  // Best-effort convenience copy into frontend/public/ if that directory
  // exists in this template layout — adjust FRONTEND_PUBLIC_PATH above if
  // your Vite public dir is located somewhere else.
  const frontendPublicDir = path.dirname(FRONTEND_PUBLIC_PATH);
  if (fs.existsSync(frontendPublicDir)) {
    fs.writeFileSync(FRONTEND_PUBLIC_PATH, JSON.stringify(registry, null, 2), "utf8");
    log({ status: "info", message: `Also copied registry to ${FRONTEND_PUBLIC_PATH}` });
  } else {
    log({
      status: "warning",
      message: `frontend/public/ not found at ${frontendPublicDir} — copy ${path.basename(outputPath)} into your frontend's static assets manually, or pass --out pointing at it directly.`,
    });
  }

  log({
    status: "success",
    message: `Registry generated: ${Object.keys(collections).length} collection(s), ${Object.keys(drops).length} drop(s), ${readyCount} deployed on-chain.`,
  });

  process.exit(0);
}

main().catch((err) => {
  log({ status: "failure", reason: "unhandled_error", message: err.message });
  process.exit(1);
});