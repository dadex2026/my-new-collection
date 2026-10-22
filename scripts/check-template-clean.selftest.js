#!/usr/bin/env node
/**
 * scripts/check-template-clean.selftest.js
 *
 * Exercises check-template-clean.js's judgement offline.
 * FIXTURE IS PRODUCTION DATA: the template's actual state on 2026-10-22 - its
 * real config.json and deployment.json values and which state files existed.
 * It must fail on that, item by item, and pass once each item is cleared.
 */
"use strict";

const assert = require("assert");
const path = require("path");
const { findState } = require(path.join(__dirname, "check-template-clean.js"));

function ok(label, detail) {
  console.log(`  ok  ${label}${detail ? " — " + detail : ""}`);
}

// TEMPLATE-OPEN-EDITION as found on 2026-10-22.
const FOUND = {
  exists: { "backend/.env.admin": true, "backend/.env": true, "frontend/.env": true, "backend/deploy-state.json": true, "backend/registry.json": true, "backend/logs": true, ".netlify": true },
  config: { collectionSlug: "your-collection-slug", network: "devnet", treasury: "YOUR_TREASURY_ADDRESS" },
  deployment: { assetAddress: "GSy11Cj6N8TtA5EeWYs7pUtAx3weXtxdBH6GLQJCyrK6", treasury: "7XJJvj5N4aBMNyX9g5NZqSEzi9vY6vYxWydezMZvC4n9", rpc: "https://rpc-proxy.smallen1967.workers.dev", createdAt: "2026-06-26T20:52:48.712Z" },
  masterRows: [{ dropItemId: "SAMPLE-001", collectionAddress: "", candyMachineAddress: "", candyGuardAddress: "", holderRequiredCollection: "", holderPrice: "", itemImage: "", uri: "" }],
  campaignRows: [],
  generated: { "backend/metadata": [], "backend/images": [] },
};
const CLEAN = {
  ...FOUND,
  exists: Object.fromEntries(Object.keys(FOUND.exists).map((k) => [k, false])),
  deployment: { rpc: FOUND.deployment.rpc },
};

(async () => {
  console.log("\n  check-template-clean.js — offline\n");

  const found = findState(FOUND).map((f) => f.what);
  assert.deepStrictEqual(found, [
    "backend/.env.admin", "backend/.env", "frontend/.env",
    "backend/deploy-state.json", "backend/registry.json", "backend/logs/", ".netlify/",
    "deployment.json assetAddress", "deployment.json treasury", "deployment.json createdAt",
  ]);
  ok("the template as found fails on all ten items", "the key, the deploy state, deployment.json's three fields");

  assert.deepStrictEqual(findState(CLEAN), []);
  ok("cleared of those, it passes", "the placeholder config and the blank sample row are clean");

  const wrong = findState({ ...CLEAN, config: { collectionSlug: "founders", network: "mainnet", treasury: "7XJJvj5N4aBMNyX9g5NZqSEzi9vY6vYxWydezMZvC4n9" } }).map((f) => f.what);
  assert.deepStrictEqual(wrong, ["backend/config.json treasury", "backend/config.json network", "backend/config.json collectionSlug"]);
  ok("a configured config.json is caught on each field");

  const rows = findState({ ...CLEAN, masterRows: [{ ...FOUND.masterRows[0], candyMachineAddress: "BLGGzRUgu5KQKJCkTM7CevhJibvpf9geCmDrxerusp7P", itemImage: "https://gateway.irys.xyz/CDKZz6S3Hu2283oMYB8z7zx39eRXS647TP9sffoVPKeM" }],
    campaignRows: [{ campaignId: "c", campaignCandyMachineAddress: "3MrHBsSa3mD6xhuP2rgQy3b7bsbmawch9vNUVDpo6esf" }], generated: { "backend/metadata": ["SAMPLE-001.json"], "backend/images": [] } }).map((f) => f.what);
  assert.deepStrictEqual(rows, ["master.csv SAMPLE-001 candyMachineAddress", "master.csv SAMPLE-001 itemImage", "campaigns.csv c campaignCandyMachineAddress", "backend/metadata/ (1 file(s))"]);
  ok("filled CSV addresses and generated metadata are caught", "values from the fork's real rows");

  console.log("\n  All local assertions held. Nothing was read from disk.\n");
})().catch((err) => {
  console.error("\n  FAILED: " + err.message + "\n");
  process.exit(1);
});
