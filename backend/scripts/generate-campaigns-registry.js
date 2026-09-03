#!/usr/bin/env node
/**
 * scripts/generate-campaigns-registry.js
 *
 * Publishes backend/campaigns.csv as frontend/public/campaigns.json —
 * the static file the frontend reads to display and let holders claim
 * reward campaigns, mirroring exactly how generate-registry.js already
 * publishes master.csv as registry.json. No backend involved at
 * request time; this is a build-time/on-demand snapshot, re-run after
 * any campaigns.csv change or campaign deployment.
 *
 * Exit codes:
 *   0 = success
 *   1 = validation failure
 *
 * Usage:
 *   node scripts/generate-campaigns-registry.js
 *   node scripts/generate-campaigns-registry.js --fetch-claimed   (live itemsRedeemed snapshot per campaign)
 *   node scripts/generate-campaigns-registry.js --out ../frontend/public/campaigns.json
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { parseCsvRecords, serializeRow } = require("./lib/csv");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// ---- Paths --------------------------------------------------------------
const BACKEND_DIR = path.join(__dirname, "..");
const CAMPAIGNS_CSV_PATH = path.join(BACKEND_DIR, "campaigns.csv");
const MASTER_CSV_PATH = path.join(BACKEND_DIR, "master.csv");
const DEFAULT_OUTPUT_PATH = path.join(BACKEND_DIR, "campaigns.json");
const FRONTEND_PUBLIC_PATH = path.join(BACKEND_DIR, "..", "frontend", "public", "campaigns.json");
const LOGS_DIR = path.join(BACKEND_DIR, "logs");

// ---- Logging --------------------------------------------------------------

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function log(event) {
  ensureLogsDir();
  const entry = { time: new Date().toISOString(), step: "generate-campaigns-registry", ...event };
  console.log(JSON.stringify(entry));
  fs.appendFileSync(path.join(LOGS_DIR, "generate-campaigns-registry.log"), JSON.stringify(entry) + "\n");
}

function fail(reason, message, exitCode) {
  log({ status: "failure", reason, message });
  process.exit(exitCode);
}

function isValidSolanaAddress(address) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
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

// ---- Live claimed-count snapshot (optional, --fetch-claimed) -------------

async function fetchClaimedSnapshot(campaigns) {
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

  for (const campaign of campaigns) {
    if (!campaign.campaignCandyMachineAddress || !campaign.network) continue;
    const umi = getUmiFor(campaign.network);
    if (!umi) continue;
    try {
      const account = await mplCandyMachine.safeFetchCandyMachine(umi, umiCore.publicKey(campaign.campaignCandyMachineAddress));
      if (account) {
        campaign.claimed = Number(account.itemsRedeemed);
      }
    } catch (err) {
      log({ status: "warning", campaignId: campaign.campaignId, message: `Could not fetch claimed count: ${err.message}` });
    }
  }
}

// ---- Main ---------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const fetchClaimed = args.includes("--fetch-claimed");
  const outFlagIndex = args.indexOf("--out");
  const outputPath = outFlagIndex !== -1 && args[outFlagIndex + 1] ? path.resolve(args[outFlagIndex + 1]) : DEFAULT_OUTPUT_PATH;

  log({ status: "start", fetchClaimed, outputPath });

  const { rows } = readCsv(CAMPAIGNS_CSV_PATH);
  const { rows: masterRows } = readCsv(MASTER_CSV_PATH);

  const campaigns = rows
    .filter((r) => isValidSolanaAddress(r.campaignCandyMachineAddress)) // only publish campaigns with a genuinely valid deployed address — not just a truthy/misaligned field
    .map((r) => {
      // Look up the target drop's own image from master.csv, keyed by
      // dropItemId — carries the reward's real image through to the
      // campaign card, matching how drop cards already show one.
      const targetRow = masterRows.find((m) => m.dropItemId === r.targetDropItemId);
      return {
        campaignId: r.campaignId,
        title: r.title || "",
        headline: r.headline || "",
        description: r.description || "",
        eligibilityText: r.eligibilityText || "",
        rewardText: r.rewardText || "",
        priceText: r.priceText || "",
        allocationText: r.allocationText || "",
        claimText: r.claimText || "Claim",
        soldOutText: r.soldOutText || "Sold out",
        eligibilityCollection: r.eligibilityCollection || "",
        targetCollection: r.targetCollection || "",
        targetImage: targetRow?.itemImage || "",
        campaignCandyMachineAddress: r.campaignCandyMachineAddress,
        price: r.price ? Number(r.price) : 0,
        allocation: r.allocation ? Number(r.allocation) : 0,
        network: r.network || "",
        treasury: r.treasury || "",
        claimLimitId: r.claimLimitId || "",
        claimLimit: r.claimLimit ? Number(r.claimLimit) : null,
        claimed: null,
      };
    });

  log({ status: "plan", totalCampaigns: rows.length, deployedCampaigns: campaigns.length });

  if (fetchClaimed) {
    await fetchClaimedSnapshot(campaigns);
  }

  const output = { generatedAt: new Date().toISOString(), campaigns };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf8");
  log({ status: "info", message: `Wrote campaigns registry to ${outputPath}` });

  const frontendPublicDir = path.dirname(FRONTEND_PUBLIC_PATH);
  if (fs.existsSync(frontendPublicDir)) {
    fs.writeFileSync(FRONTEND_PUBLIC_PATH, JSON.stringify(output, null, 2), "utf8");
    log({ status: "info", message: `Also copied to ${FRONTEND_PUBLIC_PATH}` });
  } else {
    log({ status: "warning", message: `frontend/public/ not found at ${frontendPublicDir} — copy campaigns.json there manually, or pass --out pointing at it directly.` });
  }

  log({ status: "success", message: `Published ${campaigns.length} deployed campaign(s).` });
  process.exit(0);
}

main().catch((err) => {
  log({ status: "failure", reason: "unhandled_error", message: err.message });
  process.exit(1);
});
